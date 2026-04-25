from __future__ import annotations

import base64
import json
import re
from dataclasses import dataclass
from io import BytesIO
from typing import Any
from urllib import error as urllib_error
from urllib import request as urllib_request

from PIL import Image
from db import get_gemini_api_token_setting, get_gemini_model_setting

try:
    from pillow_heif import register_heif_opener as _register_heif_opener
except Exception:
    _register_heif_opener = None


MAX_IMAGE_BYTES = 5 * 1024 * 1024
SUPPORTED_IMAGE_CONTENT_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
    "image/heic-sequence",
    "image/heif-sequence",
}
HEIF_IMAGE_CONTENT_TYPES = {"image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"}
HEIF_FILENAME_EXTENSIONS = (".heic", ".heif")
HEIF_BRANDS = {b"heic", b"heix", b"hevc", b"hevx", b"heif", b"mif1", b"msf1"}
SUPPORTED_IMAGE_FORMATS_MESSAGE = "只支援 JPEG、PNG、WEBP、HEIC、HEIF 圖片格式。"
HEIF_DECODER_UNAVAILABLE_MESSAGE = "目前環境未啟用 HEIC/HEIF 解碼，請改上傳 JPEG、PNG 或 WEBP。"
DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"
SUPPORTED_GEMINI_MODELS = (
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.5-pro",
)
GEMINI_API_URL_TEMPLATE = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
FIELD_NAMES = ("name", "model", "specification")
MAX_BATCH_IMAGE_FILES = 5

_last_quota_snapshot: dict[str, Any] = {"status": "unknown"}
_heif_decoder_checked = False
_heif_decoder_available = False


class AIRecognitionError(Exception):
    def __init__(self, *, code: str, message: str, status_code: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


@dataclass
class AIRecognitionResult:
    recognized_fields: dict[str, str]
    field_confidence: dict[str, float]
    raw_text_excerpt: str
    quota: dict[str, Any]
    warnings: list[str]


@dataclass
class AIRecognitionBatchResult:
    merged_fields: dict[str, str]
    field_sources: dict[str, dict[str, Any] | None]
    results: list[dict[str, Any]]
    failed_files: list[dict[str, Any]]
    summary: dict[str, int]
    quota: dict[str, Any]
    warnings: list[str]


def get_provider_name() -> str:
    return "gemini"


def get_supported_models() -> list[str]:
    return list(SUPPORTED_GEMINI_MODELS)


def is_supported_model(model: str) -> bool:
    return model in SUPPORTED_GEMINI_MODELS


def get_model_name() -> str:
    setting = get_gemini_model_setting()
    configured_model = (str(setting.get("value", "")).strip() if setting else "")
    if configured_model and is_supported_model(configured_model):
        return configured_model
    return DEFAULT_GEMINI_MODEL


def get_api_key() -> str:
    setting = get_gemini_api_token_setting()
    if not setting:
        return ""
    return str(setting.get("value", "")).strip()


def is_feature_enabled() -> bool:
    return bool(get_api_key())


def get_quota_status() -> dict[str, Any]:
    enabled = is_feature_enabled()
    payload: dict[str, Any] = {
        "enabled": enabled,
        "provider": get_provider_name(),
        "model": get_model_name(),
        "quota": _last_quota_snapshot.copy(),
    }
    if not enabled:
        payload["message"] = "Gemini token 尚未設定，AI 規格辨識功能未啟用。"
    return payload


def validate_gemini_token(token: str, *, model: str | None = None) -> dict[str, Any]:
    normalized_token = (token or "").strip()
    if not normalized_token:
        raise AIRecognitionError(code="invalid_token", message="Gemini token 不可為空。", status_code=400)
    normalized_model = (model or "").strip()
    if normalized_model and not is_supported_model(normalized_model):
        raise AIRecognitionError(code="invalid_model", message="Gemini model 不在可用清單。", status_code=400)
    _, quota = _call_gemini(
        parts=[{"text": "token validation"}],
        api_key_override=normalized_token,
        model_override=normalized_model or None,
    )
    return quota


def recognize_spec_from_image(*, file_content: bytes, content_type: str, filename: str) -> AIRecognitionResult:
    if not is_feature_enabled():
        raise AIRecognitionError(code="feature_disabled", message="AI 規格辨識功能尚未啟用。", status_code=503)
    normalized_type = _validate_image_input(file_content=file_content, content_type=content_type, filename=filename)
    image_mime_type, image_base64 = _prepare_image_for_gemini(
        file_content=file_content,
        content_type=normalized_type,
        filename=filename,
    )
    fields, field_confidence, raw_text_excerpt, quota = extract_fields_with_gemini(
        image_mime_type=image_mime_type,
        image_base64=image_base64,
    )
    if not raw_text_excerpt.strip() and not any(fields.get(field, "").strip() for field in FIELD_NAMES):
        raise AIRecognitionError(code="ocr_failed", message="無法從圖片辨識出可用文字。", status_code=422)
    warnings = [f"{field} not confidently extracted" for field in FIELD_NAMES if not fields.get(field, "").strip()]
    raw_text_excerpt = re.sub(r"\s+", " ", raw_text_excerpt).strip()[:280]
    return AIRecognitionResult(
        recognized_fields={field: fields.get(field, "").strip() for field in FIELD_NAMES},
        field_confidence={field: field_confidence.get(field, 0.0) for field in FIELD_NAMES},
        raw_text_excerpt=raw_text_excerpt,
        quota=quota,
        warnings=warnings,
    )


def recognize_spec_from_images_batch(*, files: list[dict[str, Any]]) -> AIRecognitionBatchResult:
    if not files:
        raise AIRecognitionError(code="invalid_image", message="至少需要上傳 1 張圖片。", status_code=400)
    if len(files) > MAX_BATCH_IMAGE_FILES:
        raise AIRecognitionError(
            code="invalid_image",
            message=f"單次最多可上傳 {MAX_BATCH_IMAGE_FILES} 張圖片。",
            status_code=400,
        )

    successful_results: list[dict[str, Any]] = []
    failed_files: list[dict[str, Any]] = []
    aggregate_warnings: list[str] = []
    latest_quota: dict[str, Any] = {"status": "unknown"}

    for index, file_entry in enumerate(files):
        filename = str(file_entry.get("filename") or "").strip()
        content_type = str(file_entry.get("content_type") or "").strip()
        file_content = file_entry.get("file_content")
        if not isinstance(file_content, bytes):
            failed_files.append(
                {
                    "index": index,
                    "filename": filename,
                    "code": "invalid_image",
                    "message": "上傳圖片資料格式錯誤。",
                    "status_code": 400,
                }
            )
            continue
        try:
            result = recognize_spec_from_image(
                file_content=file_content,
                content_type=content_type,
                filename=filename,
            )
            retry_used = False
            normalized_model = _to_field_text(result.recognized_fields.get("model"))
            if _is_heif_image(content_type=content_type, filename=filename) and not normalized_model:
                retry_result = _retry_heic_model_extraction(
                    file_content=file_content,
                    content_type=content_type,
                    filename=filename,
                )
                if retry_result is not None:
                    result = retry_result
                    retry_used = True

            latest_quota = result.quota
            recognized_fields = {field: result.recognized_fields.get(field, "").strip() for field in FIELD_NAMES}
            field_confidence = {field: _normalize_confidence(result.field_confidence.get(field)) for field in FIELD_NAMES}
            completeness = sum(1 for field in FIELD_NAMES if recognized_fields[field])
            raw_text_excerpt = result.raw_text_excerpt.strip()
            successful_results.append(
                {
                    "index": index,
                    "filename": filename,
                    "recognized_fields": recognized_fields,
                    "field_confidence": field_confidence,
                    "raw_text_excerpt": raw_text_excerpt,
                    "warnings": [],
                    "completeness": completeness,
                    "retry_used": retry_used,
                }
            )
        except AIRecognitionError as exc:
            failed_files.append(
                {
                    "index": index,
                    "filename": filename,
                    "code": exc.code,
                    "message": exc.message,
                    "status_code": exc.status_code,
                }
            )
        except Exception:
            failed_files.append(
                {
                    "index": index,
                    "filename": filename,
                    "code": "unknown_error",
                    "message": "圖片辨識發生未預期錯誤。",
                    "status_code": 500,
                }
            )

    if not successful_results:
        fallback_quota = get_quota_status().get("quota")
        if isinstance(fallback_quota, dict):
            latest_quota = fallback_quota
        return AIRecognitionBatchResult(
            merged_fields={field: "" for field in FIELD_NAMES},
            field_sources={field: None for field in FIELD_NAMES},
            results=[],
            failed_files=failed_files,
            summary={"total": len(files), "succeeded": 0, "failed": len(files)},
            quota=latest_quota,
            warnings=aggregate_warnings,
        )

    merged_fields: dict[str, str] = {field: "" for field in FIELD_NAMES}
    field_sources: dict[str, dict[str, Any] | None] = {field: None for field in FIELD_NAMES}
    for field in FIELD_NAMES:
        best_candidate = _select_best_field_candidate(field, successful_results)
        if best_candidate is None:
            continue
        merged_fields[field] = str(best_candidate["value"])
        field_sources[field] = {
            "index": int(best_candidate["index"]),
            "filename": str(best_candidate["filename"]),
            "confidence": float(best_candidate["confidence"]),
        }

    returned_results = [
        {
            "index": int(row["index"]),
            "filename": str(row["filename"]),
            "recognized_fields": row["recognized_fields"],
            "field_confidence": row["field_confidence"],
            "raw_text_excerpt": str(row["raw_text_excerpt"]),
            "warnings": list(row["warnings"]),
            "retry_used": bool(row.get("retry_used")),
        }
        for row in successful_results
    ]
    return AIRecognitionBatchResult(
        merged_fields=merged_fields,
        field_sources=field_sources,
        results=returned_results,
        failed_files=failed_files,
        summary={"total": len(files), "succeeded": len(successful_results), "failed": len(failed_files)},
        quota=latest_quota,
        warnings=aggregate_warnings,
    )


def _validate_image_input(*, file_content: bytes, content_type: str, filename: str) -> str:
    normalized_type = _normalize_content_type(content_type)
    if normalized_type not in SUPPORTED_IMAGE_CONTENT_TYPES:
        if _is_heif_filename(filename) or _looks_like_heif(file_content):
            normalized_type = "image/heic"
        else:
            raise AIRecognitionError(code="invalid_image", message=SUPPORTED_IMAGE_FORMATS_MESSAGE, status_code=400)
    if not file_content:
        raise AIRecognitionError(code="invalid_image", message="上傳圖片不可為空。", status_code=400)
    if len(file_content) > MAX_IMAGE_BYTES:
        raise AIRecognitionError(code="invalid_image", message="圖片大小不可超過 5MB。", status_code=400)
    if not filename:
        raise AIRecognitionError(code="invalid_image", message="缺少上傳檔名。", status_code=400)
    if _is_heif_image(content_type=normalized_type, filename=filename) and not _ensure_heif_decoder_available():
        raise AIRecognitionError(code="invalid_image", message=HEIF_DECODER_UNAVAILABLE_MESSAGE, status_code=400)
    return normalized_type


def _prepare_image_for_gemini(
    *,
    file_content: bytes,
    content_type: str,
    filename: str,
    jpeg_quality: int = 90,
) -> tuple[str, str]:
    try:
        if _is_heif_image(content_type=content_type, filename=filename) and not _ensure_heif_decoder_available():
            raise AIRecognitionError(code="invalid_image", message=HEIF_DECODER_UNAVAILABLE_MESSAGE, status_code=400)
        image = Image.open(BytesIO(file_content))
        if image.mode != "RGB":
            image = image.convert("RGB")
        normalized = BytesIO()
        image.save(normalized, format="JPEG", quality=jpeg_quality)
        encoded = base64.b64encode(normalized.getvalue()).decode("ascii")
        return "image/jpeg", encoded
    except AIRecognitionError:
        raise
    except Exception as exc:
        raise AIRecognitionError(code="invalid_image", message="圖片格式無法解析或轉換失敗。", status_code=400) from exc


def _normalize_content_type(content_type: str) -> str:
    return (content_type or "").split(";", 1)[0].strip().lower()


def _is_heif_filename(filename: str) -> bool:
    normalized_name = (filename or "").strip().lower()
    return any(normalized_name.endswith(ext) for ext in HEIF_FILENAME_EXTENSIONS)


def _is_heif_image(*, content_type: str, filename: str) -> bool:
    return _normalize_content_type(content_type) in HEIF_IMAGE_CONTENT_TYPES or _is_heif_filename(filename)


def _looks_like_heif(file_content: bytes) -> bool:
    if len(file_content) < 16:
        return False
    if file_content[4:8] != b"ftyp":
        return False

    brand_candidates = [file_content[8:12]]
    compatible_brands = file_content[16:64]
    for index in range(0, len(compatible_brands), 4):
        chunk = compatible_brands[index : index + 4]
        if len(chunk) == 4:
            brand_candidates.append(chunk)
    return any(brand in HEIF_BRANDS for brand in brand_candidates)


def _ensure_heif_decoder_available() -> bool:
    global _heif_decoder_checked
    global _heif_decoder_available
    if _heif_decoder_checked:
        return _heif_decoder_available

    _heif_decoder_checked = True
    if _register_heif_opener is None:
        _heif_decoder_available = False
        return _heif_decoder_available

    try:
        _register_heif_opener()
        _heif_decoder_available = True
    except Exception:
        _heif_decoder_available = False
    return _heif_decoder_available


def extract_fields_with_gemini(
    *,
    image_mime_type: str,
    image_base64: str,
) -> tuple[dict[str, str], dict[str, float], str, dict[str, Any]]:
    prompt = (
        "You are extracting inventory item fields from an image.\n"
        "Return JSON only with keys: name, model, specification, raw_text_excerpt, confidence.\n"
        "confidence must be an object with keys name, model, specification and values between 0 and 1.\n"
        "Use empty string when uncertain.\n"
    )
    response_payload, quota = _call_gemini(
        parts=[
            {"text": prompt},
            {"inlineData": {"mimeType": image_mime_type, "data": image_base64}},
        ]
    )
    parts = (
        response_payload.get("candidates", [{}])[0]
        .get("content", {})
        .get("parts", [])
    )
    text_parts = [part.get("text", "") for part in parts if isinstance(part, dict)]
    raw_text = "\n".join([segment for segment in text_parts if segment]).strip()
    if not raw_text:
        raise AIRecognitionError(code="ai_parse_failed", message="AI 未回傳可解析結果。", status_code=502)

    parsed = _parse_json_object(raw_text)
    if not isinstance(parsed, dict):
        raise AIRecognitionError(code="ai_parse_failed", message="AI 回傳格式不符合預期。", status_code=502)

    normalized: dict[str, str] = {}
    for field in FIELD_NAMES:
        value = parsed.get(field, "")
        normalized[field] = value.strip() if isinstance(value, str) else ""
    confidence_payload = parsed.get("confidence", {})
    confidence = _normalize_confidence_map(confidence_payload if isinstance(confidence_payload, dict) else {})
    raw_text_excerpt = parsed.get("raw_text_excerpt", "")
    normalized_excerpt = raw_text_excerpt.strip() if isinstance(raw_text_excerpt, str) else ""
    return normalized, confidence, normalized_excerpt, quota


def _call_gemini(
    *,
    parts: list[dict[str, Any]],
    api_key_override: str | None = None,
    model_override: str | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    api_key = (api_key_override or "").strip() or get_api_key()
    model = (model_override or "").strip() or get_model_name()
    request_payload = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.1,
        },
    }
    request_body = json.dumps(request_payload).encode("utf-8")
    request = urllib_request.Request(
        GEMINI_API_URL_TEMPLATE.format(model=model, api_key=api_key),
        data=request_body,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib_request.urlopen(request, timeout=30) as response:
            body = response.read().decode("utf-8")
            payload = json.loads(body)
            quota = _extract_quota_from_headers(dict(response.headers.items()))
            return payload, quota
    except urllib_error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        if exc.code == 429:
            raise AIRecognitionError(
                code="quota_exceeded",
                message="Gemini 配額不足，請先確認方案與 billing 後再綁定。",
                status_code=429,
            ) from exc
        upstream_message = _extract_upstream_error_message(detail)
        message = f"Gemini 呼叫失敗（HTTP {exc.code}）。"
        if upstream_message:
            message = f"{message}{upstream_message}"
        raise AIRecognitionError(
            code="upstream_error",
            message=message,
            status_code=502,
        ) from exc
    except urllib_error.URLError as exc:
        raise AIRecognitionError(code="upstream_error", message="Gemini 服務連線失敗。", status_code=502) from exc
    except json.JSONDecodeError as exc:
        raise AIRecognitionError(code="ai_parse_failed", message="Gemini 回應格式無法解析。", status_code=502) from exc


def _parse_json_object(raw_text: str) -> dict[str, Any]:
    try:
        parsed = json.loads(raw_text)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{[\s\S]*\}", raw_text)
    if not match:
        raise AIRecognitionError(code="ai_parse_failed", message="AI 回傳內容缺少 JSON 物件。", status_code=502)
    try:
        parsed = json.loads(match.group(0))
    except json.JSONDecodeError as exc:
        raise AIRecognitionError(code="ai_parse_failed", message="AI 回傳 JSON 格式錯誤。", status_code=502) from exc
    if not isinstance(parsed, dict):
        raise AIRecognitionError(code="ai_parse_failed", message="AI 回傳 JSON 不是物件。", status_code=502)
    return parsed


def _extract_quota_from_headers(headers: dict[str, str]) -> dict[str, Any]:
    lowered_headers = {str(key).lower(): value for key, value in headers.items()}
    limit = _to_int(lowered_headers.get("x-ratelimit-limit"))
    remaining = _to_int(lowered_headers.get("x-ratelimit-remaining"))
    reset_at = lowered_headers.get("x-ratelimit-reset")
    if limit is None and remaining is None and not reset_at:
        quota = {"status": "unknown"}
    else:
        quota = {
            "status": "available",
            "limit": limit,
            "remaining": remaining,
            "reset_at": reset_at,
            "source": "response_headers",
        }
    global _last_quota_snapshot
    _last_quota_snapshot = quota.copy()
    return quota


def _to_int(raw_value: str | None) -> int | None:
    if raw_value is None:
        return None
    try:
        return int(str(raw_value).strip())
    except ValueError:
        return None


def _extract_upstream_error_message(raw_detail: str) -> str:
    try:
        parsed = json.loads(raw_detail)
    except json.JSONDecodeError:
        return ""
    if not isinstance(parsed, dict):
        return ""
    error_payload = parsed.get("error")
    if not isinstance(error_payload, dict):
        return ""
    message = error_payload.get("message")
    if not isinstance(message, str):
        return ""
    normalized = message.strip()
    if not normalized:
        return ""
    return normalized[:180]


def _normalize_confidence_map(raw_confidence: dict[str, Any]) -> dict[str, float]:
    return {field: _normalize_confidence(raw_confidence.get(field)) for field in FIELD_NAMES}


def _normalize_confidence(value: Any) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return 0.0
    if parsed < 0:
        return 0.0
    if parsed > 1:
        return 1.0
    return parsed


def _to_field_text(value: Any) -> str:
    return str(value).strip() if isinstance(value, str) else ""


def _retry_heic_model_extraction(*, file_content: bytes, content_type: str, filename: str) -> AIRecognitionResult | None:
    try:
        image_mime_type, image_base64 = _prepare_image_for_gemini(
            file_content=file_content,
            content_type=content_type,
            filename=filename,
            jpeg_quality=98,
        )
        fields, field_confidence, raw_text_excerpt, quota = extract_fields_with_gemini(
            image_mime_type=image_mime_type,
            image_base64=image_base64,
        )
        warnings = [f"{field} not confidently extracted" for field in FIELD_NAMES if not fields.get(field, "").strip()]
        raw_text_excerpt = re.sub(r"\s+", " ", raw_text_excerpt).strip()[:280]
        return AIRecognitionResult(
            recognized_fields={field: fields.get(field, "").strip() for field in FIELD_NAMES},
            field_confidence={field: field_confidence.get(field, 0.0) for field in FIELD_NAMES},
            raw_text_excerpt=raw_text_excerpt,
            quota=quota,
            warnings=warnings,
        )
    except AIRecognitionError:
        return None


def _select_best_field_candidate(field: str, successful_results: list[dict[str, Any]]) -> dict[str, Any] | None:
    candidates: list[dict[str, Any]] = []
    for row in successful_results:
        recognized_fields = row.get("recognized_fields", {})
        value = str(recognized_fields.get(field, "")).strip() if isinstance(recognized_fields, dict) else ""
        if not value:
            continue
        confidence_map = row.get("field_confidence", {})
        confidence = 0.0
        if isinstance(confidence_map, dict):
            confidence = _normalize_confidence(confidence_map.get(field))
        raw_text_excerpt = str(row.get("raw_text_excerpt") or "").strip()
        candidates.append(
            {
                "index": int(row.get("index", 0)),
                "filename": str(row.get("filename") or ""),
                "value": value,
                "confidence": confidence,
                "completeness": int(row.get("completeness", 0)),
                "raw_text_length": len(raw_text_excerpt),
            }
        )
    if not candidates:
        return None
    candidates.sort(
        key=lambda candidate: (
            -float(candidate["confidence"]),
            -int(candidate["completeness"]),
            -int(candidate["raw_text_length"]),
            int(candidate["index"]),
        )
    )
    return candidates[0]
