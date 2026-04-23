from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from io import BytesIO
from typing import Any
from urllib import error as urllib_error
from urllib import request as urllib_request

import pytesseract
from PIL import Image


MAX_IMAGE_BYTES = 5 * 1024 * 1024
SUPPORTED_IMAGE_CONTENT_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp"}
DEFAULT_GEMINI_MODEL = "gemini-2.0-flash"
GEMINI_API_URL_TEMPLATE = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
FIELD_NAMES = ("name", "model", "specification")

_last_quota_snapshot: dict[str, Any] = {"status": "unknown"}


class AIRecognitionError(Exception):
    def __init__(self, *, code: str, message: str, status_code: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


@dataclass
class AIRecognitionResult:
    recognized_fields: dict[str, str]
    raw_text_excerpt: str
    quota: dict[str, Any]
    warnings: list[str]


def get_provider_name() -> str:
    return "gemini"


def get_model_name() -> str:
    return os.getenv("GEMINI_MODEL", "").strip() or DEFAULT_GEMINI_MODEL


def get_api_key() -> str:
    return os.getenv("GEMINI_API_KEY", "").strip()


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
        payload["message"] = "Gemini API key not configured"
    return payload


def recognize_spec_from_image(*, file_content: bytes, content_type: str, filename: str) -> AIRecognitionResult:
    if not is_feature_enabled():
        raise AIRecognitionError(code="feature_disabled", message="AI 規格辨識功能尚未啟用。", status_code=503)
    _validate_image_input(file_content=file_content, content_type=content_type, filename=filename)
    ocr_text = perform_ocr(file_content)
    if not ocr_text.strip():
        raise AIRecognitionError(code="ocr_failed", message="無法從圖片辨識出可用文字。", status_code=422)
    fields, quota = extract_fields_with_gemini(ocr_text)
    warnings = [f"{field} not confidently extracted" for field in FIELD_NAMES if not fields.get(field, "").strip()]
    raw_text_excerpt = re.sub(r"\s+", " ", ocr_text).strip()[:280]
    return AIRecognitionResult(
        recognized_fields={field: fields.get(field, "").strip() for field in FIELD_NAMES},
        raw_text_excerpt=raw_text_excerpt,
        quota=quota,
        warnings=warnings,
    )


def _validate_image_input(*, file_content: bytes, content_type: str, filename: str) -> None:
    normalized_type = (content_type or "").strip().lower()
    if normalized_type not in SUPPORTED_IMAGE_CONTENT_TYPES:
        raise AIRecognitionError(code="invalid_image", message="只支援 JPEG、PNG、WEBP 圖片格式。", status_code=400)
    if not file_content:
        raise AIRecognitionError(code="invalid_image", message="上傳圖片不可為空。", status_code=400)
    if len(file_content) > MAX_IMAGE_BYTES:
        raise AIRecognitionError(code="invalid_image", message="圖片大小不可超過 5MB。", status_code=400)
    if not filename:
        raise AIRecognitionError(code="invalid_image", message="缺少上傳檔名。", status_code=400)


def perform_ocr(file_content: bytes) -> str:
    tesseract_cmd = os.getenv("TESSERACT_CMD", "").strip()
    if tesseract_cmd:
        pytesseract.pytesseract.tesseract_cmd = tesseract_cmd
    lang = os.getenv("TESSERACT_LANG", "").strip() or "eng"
    try:
        image = Image.open(BytesIO(file_content))
        return pytesseract.image_to_string(image, lang=lang)
    except AIRecognitionError:
        raise
    except Exception as exc:
        raise AIRecognitionError(code="ocr_failed", message="OCR 辨識失敗，請確認影像內容與系統設定。", status_code=422) from exc


def extract_fields_with_gemini(ocr_text: str) -> tuple[dict[str, str], dict[str, Any]]:
    response_payload, quota = _call_gemini(ocr_text)
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
    return normalized, quota


def _call_gemini(ocr_text: str) -> tuple[dict[str, Any], dict[str, Any]]:
    api_key = get_api_key()
    model = get_model_name()
    prompt = (
        "You are extracting inventory item fields from OCR text.\n"
        "Return JSON only with keys: name, model, specification.\n"
        "Use empty string when uncertain.\n"
        f"OCR_TEXT:\n{ocr_text}\n"
    )
    request_payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
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
        raise AIRecognitionError(
            code="upstream_error",
            message=f"Gemini 呼叫失敗（HTTP {exc.code}）。{detail[:180]}",
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
