import json
import logging
from datetime import date, datetime
import math
from pathlib import Path
from typing import Any, Callable

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from db import (
    archive_old_logs,
    create_asset_category,
    create_condition_status_code,
    create_asset_status_code,
    create_item,
    create_items_bulk,
    detach_item,
    create_issue_request,
    create_borrow_request,
    create_donation_request,
    delete_asset_category,
    delete_condition_status_code,
    delete_asset_status_code,
    delete_item,
    delete_issue_request,
    delete_borrow_request,
    delete_donation_request,
    get_item_by_id,
    get_issue_request,
    get_borrow_request,
    get_donation_request,
    get_gemini_api_token_setting,
    get_gemini_model_setting,
    get_dashboard_snapshot,
    init_db,
    list_asset_categories,
    list_condition_status_codes,
    list_asset_status_codes,
    list_issue_items,
    list_issue_items_map,
    list_issue_requests,
    list_borrow_items,
    list_borrow_items_map,
    list_borrow_pickup_line_candidates,
    list_borrow_pickup_lines,
    list_borrow_pickup_candidates,
    list_borrow_reservation_options,
    list_borrow_requests,
    list_donation_items,
    list_donation_items_map,
    list_donation_requests,
    list_items,
    list_movement_ledger,
    list_operation_logs,
    log_inventory_action,
    pickup_borrow_request,
    purge_soft_deleted_items,
    restore_item,
    set_gemini_api_token,
    set_gemini_model,
    resolve_borrow_pickup_scan,
    return_borrow_request,
    update_asset_status_code,
    update_condition_status_code,
    update_asset_category,
    update_item,
    update_issue_request,
    update_borrow_request,
    update_donation_request,
    validate_item_ids_available,
    delete_gemini_api_token,
)
from xlsx_import import import_inventory_items_from_xlsx_content
from google_sheets import ensure_google_oauth, is_google_sheets_configured, sync_requests_to_google_sheets
from ai_recognition import (
    AIRecognitionError,
    get_quota_status,
    get_supported_models,
    is_supported_model,
    recognize_spec_from_image,
    validate_gemini_token,
)


BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent
FRONTEND_DIR = PROJECT_ROOT / "frontend"
FRONTEND_DIST_DIR = FRONTEND_DIR / "dist"
logger = logging.getLogger(__name__)

app = FastAPI()

# 允許前端跨域存取
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class InventoryItemCreate(BaseModel):
    asset_type: str = ""
    asset_status: str = ""
    condition_status: str = ""
    key: str = Field(default="", description="系統統一識別碼；讀取時依序採用 key、n_property_sn、property_sn、n_item_sn、item_sn。")
    n_property_sn: str = Field(default="", description="財產序號（相容舊資料欄位，property 類）。")
    property_sn: str = Field(default="", description="財產條碼（相容舊資料欄位，property 類）。")
    n_item_sn: str = Field(default="", description="物品序號（相容舊資料欄位，item 類）。")
    item_sn: str = Field(default="", description="物品條碼（相容舊資料欄位，item 類）。")
    name: str = ""
    name_code: str = Field(default="", description="主分類代碼（顯示名稱由 asset_category_name 對照）。")
    name_code2: str = Field(default="", description="次分類代碼（需搭配 name_code；顯示名稱由對照表決定）。")
    model: str = ""
    specification: str = ""
    unit: str = ""
    count: int = Field(default=1, ge=1)
    purchase_date: date | None = None
    due_date: date | None = None
    return_date: date | None = None
    location: str = ""
    memo: str = ""
    memo2: str = ""
    keeper: str = ""
    borrower: str = ""
    start_date: date | None = None


class InventoryItem(InventoryItemCreate):
    id: int
    create_at: datetime | None = None
    create_by: str = ""
    created_at: datetime | None = None
    created_by: str = ""
    update_at: datetime | None = None
    update_by: str = ""
    updated_at: datetime | None = None
    updated_by: str = ""
    deleted_at: datetime | None = None
    deleted_by: str = ""
    donated_at: datetime | None = None
    donation_request_id: int | None = None
    is_parent_item: bool = False
    has_detached_children: bool = False
    parent_item_id: int | None = None


class InventoryItemDetachCreate(BaseModel):
    name_code: str = ""
    name_code2: str = ""
    seq: str = "00"
    name: str | None = None
    model: str | None = None
    specification: str | None = None
    unit: str | None = None
    purchase_date: date | None = None
    location: str | None = None
    memo: str | None = None
    memo2: str | None = None
    keeper: str | None = None
    asset_status: str | None = None
    condition_status: str | None = None


class AssetStatusCode(BaseModel):
    code: str
    description: str


class AssetStatusCodeCreate(BaseModel):
    code: str = ""
    description: str = ""


class AssetStatusCodeUpdate(BaseModel):
    code: str = ""
    description: str = ""


class ConditionStatusCode(BaseModel):
    code: str
    description: str


class ConditionStatusCodeCreate(BaseModel):
    code: str = ""
    description: str = ""


class ConditionStatusCodeUpdate(BaseModel):
    code: str = ""
    description: str = ""


class AssetCategoryLookup(BaseModel):
    name_code: str
    asset_category_name: str
    name_code2: str
    description: str


class AssetCategoryLookupCreate(BaseModel):
    name_code: str = ""
    asset_category_name: str = ""
    name_code2: str = ""
    description: str = ""


class AssetCategoryLookupUpdate(BaseModel):
    name_code: str = ""
    name_code2: str = ""
    asset_category_name: str = ""
    description: str = ""


class IssueItemCreate(BaseModel):
    item_id: int
    quantity: int = 1
    note: str = ""


class IssueItem(IssueItemCreate):
    id: int
    item_name: str | None = None
    item_model: str | None = None


class IssueRequestCreate(BaseModel):
    requester: str = ""
    department: str = ""
    purpose: str = ""
    request_date: date | None = None
    memo: str = ""
    items: list[IssueItemCreate] = Field(default_factory=list)


class IssueRequest(IssueRequestCreate):
    id: int
    items: list[IssueItem]


class BorrowRequestLineCreate(BaseModel):
    item_name: str = ""
    item_model: str = ""
    requested_qty: int = 1
    note: str = ""


class BorrowRequestLine(BorrowRequestLineCreate):
    id: int
    item_id: int | None = None
    quantity: int = 0
    allocated_qty: int = 0
    allocated_item_ids: list[int] = Field(default_factory=list)


class BorrowPickupSelection(BaseModel):
    line_id: int
    item_ids: list[int] = Field(default_factory=list)


class BorrowPickupRequest(BaseModel):
    selections: list[BorrowPickupSelection] = Field(default_factory=list)


class BorrowPickupCandidateItem(BaseModel):
    id: int
    n_property_sn: str = Field(default="", description="財產序號（相容舊資料欄位，property 類）。")
    property_sn: str = Field(default="", description="財產條碼（相容舊資料欄位，property 類）。")
    n_item_sn: str = Field(default="", description="物品序號（相容舊資料欄位，item 類）。")
    item_sn: str = Field(default="", description="物品條碼（相容舊資料欄位，item 類）。")


class BorrowPickupCandidateLine(BaseModel):
    line_id: int
    item_name: str = ""
    item_model: str = ""
    requested_qty: int = 0
    allocated_qty: int = 0
    remaining_qty: int = 0
    candidates: list[BorrowPickupCandidateItem] = Field(default_factory=list)


class BorrowPickupLineSummary(BaseModel):
    line_id: int
    item_name: str = ""
    item_model: str = ""
    requested_qty: int = 0
    allocated_qty: int = 0
    remaining_qty: int = 0
    candidate_count: int = 0


class BorrowPickupLineCandidatePage(BaseModel):
    line_id: int
    item_name: str = ""
    item_model: str = ""
    requested_qty: int = 0
    allocated_qty: int = 0
    remaining_qty: int = 0
    items: list[BorrowPickupCandidateItem] = Field(default_factory=list)
    page: int
    page_size: int
    total: int
    total_pages: int


class BorrowPickupScanResolveRequest(BaseModel):
    code: str = ""


class BorrowPickupScanResolveItem(BorrowPickupCandidateItem):
    item_name: str = ""
    item_model: str = ""


class BorrowPickupScanResolveResponse(BaseModel):
    item: BorrowPickupScanResolveItem
    eligible_line_ids: list[int] = Field(default_factory=list)


class BorrowRequestCreate(BaseModel):
    borrower: str = ""
    department: str = ""
    purpose: str = ""
    borrow_date: date | None = None
    due_date: date | None = None
    memo: str = ""
    request_lines: list[BorrowRequestLineCreate] = Field(default_factory=list)


class BorrowRequest(BorrowRequestCreate):
    id: int
    return_date: date | None = None
    status: str = "reserved"
    is_due_soon: bool = False
    request_lines: list[BorrowRequestLine]


class DonationItemCreate(BaseModel):
    item_id: int
    quantity: int = 1
    note: str = ""


class DonationItem(DonationItemCreate):
    id: int
    item_name: str | None = None
    item_model: str | None = None


class DonationRequestCreate(BaseModel):
    donor: str = ""
    department: str = ""
    recipient: str = ""
    purpose: str = ""
    donation_date: date | None = None
    memo: str = ""
    items: list[DonationItemCreate] = Field(default_factory=list)


class DonationRequest(DonationRequestCreate):
    id: int
    items: list[DonationItem]


class InventoryItemListResponse(BaseModel):
    items: list[InventoryItem]
    page: int
    page_size: int
    total: int
    total_pages: int


class IssueRequestListResponse(BaseModel):
    items: list[IssueRequest]
    page: int
    page_size: int
    total: int
    total_pages: int


class BorrowRequestListResponse(BaseModel):
    items: list[BorrowRequest]
    page: int
    page_size: int
    total: int
    total_pages: int


class BorrowReservationOption(BaseModel):
    item_name: str = ""
    item_model: str = ""
    available_qty: int = 0
    reserved_qty: int = 0
    reservable_qty: int = 0
    selectable: bool = False


class DonationRequestListResponse(BaseModel):
    items: list[DonationRequest]
    page: int
    page_size: int
    total: int
    total_pages: int


class MovementLedgerEntry(BaseModel):
    id: int
    item_id: int
    item_name: str = ""
    item_model: str = ""
    from_status: str = ""
    to_status: str = ""
    action: str = ""
    entity: str = ""
    entity_id: int | None = None
    operator: str = ""
    created_at: str = ""


class MovementLedgerListResponse(BaseModel):
    items: list[MovementLedgerEntry]
    page: int
    page_size: int
    total: int
    total_pages: int


class OperationLogEntry(BaseModel):
    id: int
    action: str = ""
    entity: str = ""
    entity_id: int | None = None
    status: str = ""
    detail: dict[str, Any] = Field(default_factory=dict)
    created_at: str = ""


class OperationLogListResponse(BaseModel):
    items: list[OperationLogEntry]
    page: int
    page_size: int
    total: int
    total_pages: int


class ImportErrorDetail(BaseModel):
    row: int
    message: str


class ImportResponse(BaseModel):
    total: int
    created: int
    failed: int
    errors: list[ImportErrorDetail]


class AiQuota(BaseModel):
    status: str = "unknown"
    limit: int | None = None
    remaining: int | None = None
    reset_at: str | None = None
    source: str | None = None


class AiRecognitionQuotaResponse(BaseModel):
    enabled: bool
    provider: str = ""
    model: str = ""
    quota: AiQuota = Field(default_factory=AiQuota)
    message: str | None = None


class GeminiTokenSettingsResponse(BaseModel):
    bound: bool
    masked_token: str | None = None
    provider: str = "gemini"
    model: str = ""
    available_models: list[str] = Field(default_factory=list)
    updated_at: str | None = None


class GeminiTokenUpsertRequest(BaseModel):
    token: str = ""
    model: str | None = None


class AiRecognizedFields(BaseModel):
    name: str = ""
    model: str = ""
    specification: str = ""


class AiSpecRecognitionResponse(BaseModel):
    recognized_fields: AiRecognizedFields = Field(default_factory=AiRecognizedFields)
    raw_text_excerpt: str = ""
    quota: AiQuota = Field(default_factory=AiQuota)
    warnings: list[str] = Field(default_factory=list)


def _parse_purchase_date(value: str) -> date:
    for fmt in ("%Y/%m/%d", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Invalid purchase_date format: {value}")


def _parse_datetime(value: str) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return None


def _parse_datetime_filter_value(value: str, *, field_name: str, is_end: bool = False) -> datetime | None:
    raw_value = value.strip()
    if not raw_value:
        return None
    date_formats = [
        ("%Y-%m-%d %H:%M:%S", False),
        ("%Y-%m-%d", True),
    ]
    for fmt, is_date_only in date_formats:
        try:
            parsed = datetime.strptime(raw_value, fmt)
        except ValueError:
            continue
        if is_date_only and is_end:
            return parsed.replace(hour=23, minute=59, second=59)
        return parsed
    raise HTTPException(status_code=400, detail=f"invalid {field_name} format")


def _parse_datetime_range_filters(start_at: str, end_at: str) -> tuple[datetime | None, datetime | None]:
    start_time = _parse_datetime_filter_value(start_at, field_name="start_at")
    end_time = _parse_datetime_filter_value(end_at, field_name="end_at", is_end=True)
    if start_time and end_time and start_time > end_time:
        raise HTTPException(status_code=400, detail="start_at must be earlier than or equal to end_at")
    return start_time, end_time


def _resolve_frontend_index() -> Path | None:
    dist_index = FRONTEND_DIST_DIR / "index.html"
    if dist_index.is_file():
        return dist_index

    source_index = FRONTEND_DIR / "index.html"
    if source_index.is_file():
        return source_index

    return None


def _resolve_frontend_asset(path: str) -> Path | None:
    if not path or path == "api" or path.startswith("api/"):
        return None

    candidates = [FRONTEND_DIST_DIR / path, FRONTEND_DIR / path]
    for candidate in candidates:
        if candidate.is_file():
            return candidate

    return None


def to_db_payload(item: InventoryItemCreate) -> dict:
    return {
        "asset_type": item.asset_type,
        "asset_status": item.asset_status,
        "condition_status": item.condition_status,
        "key": item.key,
        "n_property_sn": item.n_property_sn,
        "property_sn": item.property_sn,
        "n_item_sn": item.n_item_sn,
        "item_sn": item.item_sn,
        "name": item.name,
        "name_code": item.name_code,
        "name_code2": item.name_code2,
        "model": item.model,
        "specification": item.specification,
        "unit": item.unit,
        "count": item.count,
        "purchase_date": _format_date(item.purchase_date),
        "due_date": _format_date(item.due_date),
        "return_date": _format_date(item.return_date),
        "location": item.location,
        "memo": item.memo,
        "memo2": item.memo2,
        "keeper": item.keeper,
        "borrower": item.borrower,
        "start_date": _format_date(item.start_date),
    }


def _format_date(value: date | None) -> str:
    return value.strftime("%Y/%m/%d") if value else ""


def _coerce_str(value) -> str:
    return value if isinstance(value, str) else "" if value is None else str(value)


def _contains_cjk(value: str) -> bool:
    return any("\u4e00" <= char <= "\u9fff" for char in value)


def _mask_token(raw_token: str) -> str:
    normalized = (raw_token or "").strip()
    if len(normalized) <= 8:
        return "*" * len(normalized)
    return f"{normalized[:4]}{'*' * (len(normalized) - 8)}{normalized[-4:]}"


def _build_gemini_token_settings_response() -> GeminiTokenSettingsResponse:
    token_setting = get_gemini_api_token_setting()
    model_setting = get_gemini_model_setting()
    token = _coerce_str(token_setting.get("value")) if token_setting else ""
    normalized = token.strip()
    quota_status = get_quota_status()
    token_updated_at = _coerce_str(token_setting.get("updated_at")) if token_setting else ""
    model_updated_at = _coerce_str(model_setting.get("updated_at")) if model_setting else ""
    updated_at = max(token_updated_at, model_updated_at) or None
    return GeminiTokenSettingsResponse(
        bound=bool(normalized),
        masked_token=_mask_token(normalized) if normalized else None,
        model=_coerce_str(quota_status.get("model")),
        available_models=get_supported_models(),
        updated_at=updated_at,
    )


def _normalize_pagination(page: int, page_size: int) -> tuple[int, int]:
    if page < 1:
        raise HTTPException(status_code=400, detail="page must be greater than 0")
    if page_size < 1:
        raise HTTPException(status_code=400, detail="page_size must be greater than 0")
    return page, page_size


def _normalize_log_scope(scope: str) -> str:
    normalized = scope.strip().lower()
    if not normalized:
        return "hot"
    if normalized not in {"hot", "all"}:
        raise HTTPException(status_code=400, detail="scope must be one of: hot, all")
    return normalized


def _normalize_sort_direction(sort_dir: str) -> str:
    normalized = sort_dir.strip().lower()
    if not normalized:
        return "desc"
    if normalized not in {"asc", "desc"}:
        raise HTTPException(status_code=400, detail="sort_dir must be one of: asc, desc")
    return normalized


def _sort_records[T](
    rows: list[T],
    *,
    sort_by: str,
    sort_dir: str,
    default_sort_by: str,
    sort_key_map: dict[str, Callable[[T], Any]],
) -> list[T]:
    resolved_sort_by = sort_by.strip() or default_sort_by
    if resolved_sort_by not in sort_key_map:
        raise HTTPException(status_code=400, detail=f"invalid sort_by: {resolved_sort_by}")
    return sorted(rows, key=sort_key_map[resolved_sort_by], reverse=sort_dir == "desc")


def _inventory_number_sort_key(item: InventoryItem) -> str:
    return (item.key or item.n_property_sn or item.property_sn or item.n_item_sn or item.item_sn or "").strip().lower()


def _request_items_sort_key(items: list[Any]) -> tuple[str, int, int]:
    if not items:
        return ("", 0, 0)
    first_item = items[0]
    first_item_name = _coerce_str(getattr(first_item, "item_name", "")).strip()
    first_item_id = int(getattr(first_item, "item_id", 0) or 0)
    first_item_label = first_item_name or (f"#{first_item_id}" if first_item_id else "")
    item_count = len(items)
    total_quantity = 0
    for item in items:
        quantity = getattr(item, "requested_qty", None)
        if quantity is None:
            quantity = getattr(item, "quantity", 0)
        try:
            total_quantity += int(quantity or 0)
        except (TypeError, ValueError):
            continue
    return (first_item_label.lower(), item_count, total_quantity)


def _operation_detail_sort_key(detail: dict[str, Any]) -> str:
    try:
        return json.dumps(detail, ensure_ascii=False, sort_keys=True)
    except (TypeError, ValueError):
        return "{}"


def _paginate_rows[T](rows: list[T], page: int, page_size: int) -> tuple[list[T], int, int]:
    total = len(rows)
    total_pages = max(1, math.ceil(total / page_size)) if total > 0 else 1
    start_index = (page - 1) * page_size
    if start_index >= total:
        return [], total, total_pages
    end_index = start_index + page_size
    return rows[start_index:end_index], total, total_pages


def row_to_item(row) -> InventoryItem:
    purchase_date_value = _coerce_str(row.get("purchase_date"))
    due_date_value = _coerce_str(row.get("due_date"))
    return_date_value = _coerce_str(row.get("return_date"))
    parsed_date = _parse_purchase_date(purchase_date_value) if purchase_date_value else None
    parsed_due_date = _parse_purchase_date(due_date_value) if due_date_value else None
    parsed_return_date = _parse_purchase_date(return_date_value) if return_date_value else None
    donated_at_value = _coerce_str(row.get("donated_at"))
    donation_request_id_raw = row.get("donation_request_id")
    try:
        donation_request_id = int(donation_request_id_raw) if donation_request_id_raw not in (None, "") else None
    except (TypeError, ValueError):
        donation_request_id = None
    parent_item_id_raw = row.get("parent_item_id")
    try:
        parent_item_id = int(parent_item_id_raw) if parent_item_id_raw not in (None, "") else None
    except (TypeError, ValueError):
        parent_item_id = None
    try:
        count = int(row.get("count") or 0)
    except (TypeError, ValueError):
        count = 1
    if count <= 0:
        count = 1
    row_key = _coerce_str(row.get("key")).strip()
    if not row_key:
        row_key = _coerce_str(row.get("n_property_sn")).strip()
    if not row_key:
        row_key = _coerce_str(row.get("property_sn")).strip()
    if not row_key:
        row_key = _coerce_str(row.get("n_item_sn")).strip()
    if not row_key:
        row_key = _coerce_str(row.get("item_sn")).strip()
    return InventoryItem(
        id=row["id"],
        asset_type=_coerce_str(row.get("asset_type")),
        asset_status=_coerce_str(row.get("asset_status")),
        condition_status=_coerce_str(row.get("condition_status")),
        key=row_key,
        n_property_sn=_coerce_str(row.get("n_property_sn")),
        property_sn=_coerce_str(row.get("property_sn")),
        n_item_sn=_coerce_str(row.get("n_item_sn")),
        item_sn=_coerce_str(row.get("item_sn")),
        name=_coerce_str(row.get("name")),
        name_code=_coerce_str(row.get("name_code")),
        name_code2=_coerce_str(row.get("name_code2")),
        model=_coerce_str(row.get("model")),
        specification=_coerce_str(row.get("specification")),
        unit=_coerce_str(row.get("unit")),
        count=count,
        purchase_date=parsed_date,
        due_date=parsed_due_date,
        return_date=parsed_return_date,
        location=_coerce_str(row.get("location")),
        memo=_coerce_str(row.get("memo")),
        memo2=_coerce_str(row.get("memo2")),
        keeper=_coerce_str(row.get("keeper")),
        borrower=_coerce_str(row.get("borrower")),
        start_date=_parse_purchase_date(_coerce_str(row.get("start_date"))) if _coerce_str(row.get("start_date")) else None,
        create_at=_parse_datetime(_coerce_str(row.get("create_at"))),
        create_by=_coerce_str(row.get("create_by")),
        created_at=_parse_datetime(_coerce_str(row.get("created_at"))),
        created_by=_coerce_str(row.get("created_by")),
        update_at=_parse_datetime(_coerce_str(row.get("update_at"))),
        update_by=_coerce_str(row.get("update_by")),
        updated_at=_parse_datetime(_coerce_str(row.get("updated_at"))),
        updated_by=_coerce_str(row.get("updated_by")),
        deleted_at=_parse_datetime(_coerce_str(row.get("deleted_at"))),
        deleted_by=_coerce_str(row.get("deleted_by")),
        donated_at=_parse_datetime(donated_at_value),
        donation_request_id=donation_request_id,
        is_parent_item=bool(row.get("is_parent_item")),
        has_detached_children=bool(row.get("has_detached_children")),
        parent_item_id=parent_item_id,
    )


def row_to_issue_item(row) -> IssueItem:
    return IssueItem(
        id=row["id"],
        item_id=row["item_id"],
        quantity=row["quantity"],
        note=_coerce_str(row["note"]),
        item_name=row["item_name"],
        item_model=row["item_model"],
    )


def row_to_borrow_item(row) -> BorrowRequestLine:
    allocated_ids: list[int] = []
    for raw_item_id in row.get("allocated_item_ids", []):
        try:
            item_id = int(raw_item_id)
        except (TypeError, ValueError):
            continue
        if item_id > 0:
            allocated_ids.append(item_id)
    return BorrowRequestLine(
        id=row["id"],
        item_id=row.get("item_id") if row.get("item_id") not in ("", None) else None,
        quantity=row["quantity"],
        note=_coerce_str(row["note"]),
        item_name=_coerce_str(row.get("item_name")),
        item_model=_coerce_str(row.get("item_model")),
        requested_qty=int(row.get("requested_qty") or row.get("quantity") or 0),
        allocated_qty=int(row.get("allocated_qty") or 0),
        allocated_item_ids=allocated_ids,
    )


def row_to_donation_item(row) -> DonationItem:
    return DonationItem(
        id=row["id"],
        item_id=row["item_id"],
        quantity=row["quantity"],
        note=_coerce_str(row["note"]),
        item_name=row["item_name"],
        item_model=row["item_model"],
    )


def issue_request_to_db_payload(request: IssueRequestCreate) -> dict:
    return {
        "requester": request.requester,
        "department": request.department,
        "purpose": request.purpose,
        "request_date": _format_date(request.request_date),
        "memo": request.memo,
    }


def borrow_request_to_db_payload(request: BorrowRequestCreate) -> dict:
    return {
        "borrower": request.borrower,
        "department": request.department,
        "purpose": request.purpose,
        "borrow_date": _format_date(request.borrow_date),
        "due_date": _format_date(request.due_date),
        "memo": request.memo,
    }


def donation_request_to_db_payload(request: DonationRequestCreate) -> dict:
    return {
        "donor": request.donor,
        "department": request.department,
        "recipient": request.recipient.strip(),
        "purpose": request.purpose,
        "donation_date": _format_date(request.donation_date),
        "memo": request.memo,
    }


def issue_request_row_to_model(row, items: list[IssueItem]) -> IssueRequest:
    request_date = _parse_purchase_date(row["request_date"]) if row["request_date"] else None
    return IssueRequest(
        id=row["id"],
        requester=_coerce_str(row["requester"]),
        department=_coerce_str(row["department"]),
        purpose=_coerce_str(row["purpose"]),
        request_date=request_date,
        memo=_coerce_str(row["memo"]),
        items=items,
    )


def borrow_request_row_to_model(row, request_lines: list[BorrowRequestLine]) -> BorrowRequest:
    borrow_date = _parse_purchase_date(row["borrow_date"]) if row["borrow_date"] else None
    due_date = _parse_purchase_date(row["due_date"]) if row["due_date"] else None
    return_date = _parse_purchase_date(row["return_date"]) if row["return_date"] else None
    return BorrowRequest(
        id=row["id"],
        borrower=_coerce_str(row["borrower"]),
        department=_coerce_str(row["department"]),
        purpose=_coerce_str(row["purpose"]),
        borrow_date=borrow_date,
        due_date=due_date,
        return_date=return_date,
        status=_coerce_str(row["status"]),
        is_due_soon=bool(row.get("is_due_soon")),
        memo=_coerce_str(row["memo"]),
        request_lines=request_lines,
    )


def donation_request_row_to_model(row, items: list[DonationItem]) -> DonationRequest:
    donation_date = _parse_purchase_date(row["donation_date"]) if row["donation_date"] else None
    return DonationRequest(
        id=row["id"],
        donor=_coerce_str(row["donor"]),
        department=_coerce_str(row["department"]),
        recipient=_coerce_str(row["recipient"]),
        purpose=_coerce_str(row["purpose"]),
        donation_date=donation_date,
        memo=_coerce_str(row["memo"]),
        items=items,
    )


def _ensure_available_item_ids(
    item_ids: list[int],
    *,
    allow_donation_request_id: int | None = None,
    enforce_unique: bool = False,
) -> None:
    is_available, error_message = validate_item_ids_available(
        item_ids,
        allow_donation_request_id=allow_donation_request_id,
        enforce_unique=enforce_unique,
    )
    if not is_available:
        raise HTTPException(status_code=400, detail=error_message or "invalid item_id")


def _to_http_error_detail(error: ValueError) -> str | dict[str, Any]:
    raw = str(error)
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return raw
    if isinstance(parsed, dict):
        return parsed
    return raw


def _sync_requests_safe() -> None:
    try:
        sync_requests_to_google_sheets()
        log_inventory_action(action="sync", entity="google_sheets", detail={"target": "requests"})
    except Exception as exc:  # pragma: no cover - external dependency
        log_inventory_action(
            action="sync",
            entity="google_sheets",
            status="failed",
            detail={"target": "requests", "error": str(exc)},
        )


def _log_ai_recognition_runtime_state() -> None:
    quota_status = get_quota_status()
    provider = _coerce_str(quota_status.get("provider")).strip() or "gemini"
    model = _coerce_str(quota_status.get("model")).strip()
    enabled = bool(quota_status.get("enabled"))
    logger.info(
        "AI spec recognition runtime: provider=%s model=%s token_configured=%s",
        provider,
        model,
        enabled,
    )


@app.on_event("startup")
def on_startup() -> None:
    init_db()
    _log_ai_recognition_runtime_state()
    purged_count = purge_soft_deleted_items()
    if purged_count > 0:
        log_inventory_action(
            action="purge",
            entity="inventory_item",
            detail={"deleted_count": purged_count, "policy": "soft-deleted over 6 months"},
        )
    if is_google_sheets_configured():
        try:
            ensure_google_oauth()
        except Exception as exc:  # pragma: no cover - external dependency
            log_inventory_action(
                action="auth",
                entity="google_sheets",
                status="failed",
                detail={"error": str(exc)},
            )


@app.get("/api/data")
def get_dashboard_data():
    return get_dashboard_snapshot()


@app.get("/api/lookups/asset-status", response_model=list[AssetStatusCode], response_model_by_alias=False)
def list_asset_status_codes_api():
    rows = list_asset_status_codes()
    return [AssetStatusCode(code=_coerce_str(row.get("code")), description=_coerce_str(row.get("description"))) for row in rows]


@app.post("/api/lookups/asset-status", response_model=AssetStatusCode, response_model_by_alias=False)
def create_asset_status_code_api(payload: AssetStatusCodeCreate):
    try:
        row = create_asset_status_code(payload.code, payload.description)
    except ValueError as exc:
        message = str(exc)
        status_code = 409 if "already exists" in message else 400
        raise HTTPException(status_code=status_code, detail=message) from exc

    log_inventory_action(action="create", entity="asset_status_code", detail=row)
    return AssetStatusCode(code=_coerce_str(row.get("code")), description=_coerce_str(row.get("description")))


@app.put("/api/lookups/asset-status/{code}", response_model=AssetStatusCode, response_model_by_alias=False)
def update_asset_status_code_api(code: str, payload: AssetStatusCodeUpdate):
    try:
        row = update_asset_status_code(code, payload.code or code, payload.description)
    except ValueError as exc:
        message = str(exc)
        if "not found" in message:
            raise HTTPException(status_code=404, detail=message) from exc
        if "already exists" in message:
            raise HTTPException(status_code=409, detail=message) from exc
        raise HTTPException(status_code=400, detail=message) from exc

    log_inventory_action(action="update", entity="asset_status_code", detail={"from_code": code, **row})
    return AssetStatusCode(code=_coerce_str(row.get("code")), description=_coerce_str(row.get("description")))


@app.delete("/api/lookups/asset-status/{code}")
def delete_asset_status_code_api(code: str):
    try:
        delete_asset_status_code(code)
    except ValueError as exc:
        message = str(exc)
        if "not found" in message:
            raise HTTPException(status_code=404, detail=message) from exc
        if "in use" in message:
            raise HTTPException(status_code=409, detail=message) from exc
        raise HTTPException(status_code=400, detail=message) from exc

    log_inventory_action(action="delete", entity="asset_status_code", detail={"code": code})
    return {"success": True}


@app.get("/api/lookups/condition-status", response_model=list[ConditionStatusCode], response_model_by_alias=False)
def list_condition_status_codes_api():
    rows = list_condition_status_codes()
    return [ConditionStatusCode(code=_coerce_str(row.get("code")), description=_coerce_str(row.get("description"))) for row in rows]


@app.post("/api/lookups/condition-status", response_model=ConditionStatusCode, response_model_by_alias=False)
def create_condition_status_code_api(payload: ConditionStatusCodeCreate):
    try:
        row = create_condition_status_code(payload.code, payload.description)
    except ValueError as exc:
        message = str(exc)
        status_code = 409 if "already exists" in message else 400
        raise HTTPException(status_code=status_code, detail=message) from exc

    log_inventory_action(action="create", entity="condition_status_code", detail=row)
    return ConditionStatusCode(code=_coerce_str(row.get("code")), description=_coerce_str(row.get("description")))


@app.put("/api/lookups/condition-status/{code}", response_model=ConditionStatusCode, response_model_by_alias=False)
def update_condition_status_code_api(code: str, payload: ConditionStatusCodeUpdate):
    try:
        row = update_condition_status_code(code, payload.code or code, payload.description)
    except ValueError as exc:
        message = str(exc)
        if "not found" in message:
            raise HTTPException(status_code=404, detail=message) from exc
        if "already exists" in message:
            raise HTTPException(status_code=409, detail=message) from exc
        raise HTTPException(status_code=400, detail=message) from exc

    log_inventory_action(action="update", entity="condition_status_code", detail={"from_code": code, **row})
    return ConditionStatusCode(code=_coerce_str(row.get("code")), description=_coerce_str(row.get("description")))


@app.delete("/api/lookups/condition-status/{code}")
def delete_condition_status_code_api(code: str):
    try:
        delete_condition_status_code(code)
    except ValueError as exc:
        message = str(exc)
        if "not found" in message:
            raise HTTPException(status_code=404, detail=message) from exc
        if "in use" in message:
            raise HTTPException(status_code=409, detail=message) from exc
        raise HTTPException(status_code=400, detail=message) from exc

    log_inventory_action(action="delete", entity="condition_status_code", detail={"code": code})
    return {"success": True}


@app.get("/api/lookups/asset-category", response_model=list[AssetCategoryLookup], response_model_by_alias=False)
def list_asset_categories_api():
    rows = list_asset_categories()
    return [AssetCategoryLookup(**row) for row in rows]


@app.post("/api/lookups/asset-category", response_model=AssetCategoryLookup, response_model_by_alias=False)
def create_asset_category_api(payload: AssetCategoryLookupCreate):
    try:
        row = create_asset_category(
            payload.name_code,
            payload.asset_category_name,
            payload.name_code2,
            payload.description,
        )
    except ValueError as exc:
        message = str(exc)
        status_code = 409 if "already exists" in message else 400
        raise HTTPException(status_code=status_code, detail=message) from exc

    log_inventory_action(action="create", entity="asset_category_name", detail=row)
    return AssetCategoryLookup(**row)


@app.put("/api/lookups/asset-category/{name_code}/{name_code2}", response_model=AssetCategoryLookup, response_model_by_alias=False)
def update_asset_category_api(name_code: str, name_code2: str, payload: AssetCategoryLookupUpdate):
    try:
        row = update_asset_category(
            name_code,
            name_code2,
            payload.name_code or name_code,
            payload.name_code2 or name_code2,
            payload.asset_category_name,
            payload.description,
        )
    except ValueError as exc:
        message = str(exc)
        if "not found" in message:
            raise HTTPException(status_code=404, detail=message) from exc
        if "already exists" in message:
            raise HTTPException(status_code=409, detail=message) from exc
        raise HTTPException(status_code=400, detail=message) from exc

    log_inventory_action(
        action="update",
        entity="asset_category_name",
        detail={"from_name_code": name_code, "from_name_code2": name_code2, **row},
    )
    return AssetCategoryLookup(**row)


@app.delete("/api/lookups/asset-category/{name_code}/{name_code2}")
def delete_asset_category_api(name_code: str, name_code2: str):
    try:
        delete_asset_category(name_code, name_code2)
    except ValueError as exc:
        message = str(exc)
        if "not found" in message:
            raise HTTPException(status_code=404, detail=message) from exc
        if "in use" in message:
            raise HTTPException(status_code=409, detail=message) from exc
        raise HTTPException(status_code=400, detail=message) from exc

    log_inventory_action(action="delete", entity="asset_category_name", detail={"name_code": name_code, "name_code2": name_code2})
    return {"success": True}


@app.get("/api/lookups/borrow-reservations", response_model=list[BorrowReservationOption], response_model_by_alias=False)
def list_borrow_reservation_options_api(request_id: int | None = None):
    rows = list_borrow_reservation_options(exclude_request_id=request_id)
    return [BorrowReservationOption(**row) for row in rows]


@app.get("/api/items", response_model=InventoryItemListResponse, response_model_by_alias=False)
def get_inventory_items(
    include_donated: bool = False,
    deleted_scope: str = "active",
    keyword: str = "",
    asset_type: str = "all",
    correction_status: str = "all",
    sort_by: str = "",
    sort_dir: str = "desc",
    page: int = Query(default=1),
    page_size: int = Query(default=10),
):
    page, page_size = _normalize_pagination(page, page_size)
    normalized_sort_dir = _normalize_sort_direction(sort_dir)
    try:
        rows = [row_to_item(row) for row in list_items(include_donated=include_donated, deleted_scope=deleted_scope)]
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    normalized_keyword = keyword.strip().lower()
    filtered_rows: list[InventoryItem] = []
    for row in rows:
        if asset_type != "all" and row.asset_type != asset_type:
            continue

        if correction_status == "needs_fix":
            serial = (row.n_property_sn or row.property_sn or row.n_item_sn or row.item_sn).strip()
            if serial and not _contains_cjk(serial):
                continue
        elif correction_status != "all":
            raise HTTPException(status_code=400, detail="invalid correction_status")

        if normalized_keyword:
            search_fields = [
                row.key,
                row.n_property_sn,
                row.property_sn,
                row.n_item_sn,
                row.item_sn,
                row.name,
                row.model,
                row.location,
                row.keeper,
            ]
            if not any((field or "").lower().find(normalized_keyword) >= 0 for field in search_fields):
                continue

        filtered_rows.append(row)

    sorted_rows = _sort_records(
        filtered_rows,
        sort_by=sort_by,
        sort_dir=normalized_sort_dir,
        default_sort_by="id",
        sort_key_map={
            "id": lambda row: row.id,
            "asset_type": lambda row: (_coerce_str(row.asset_type).lower(), row.id),
            "key": lambda row: (_inventory_number_sort_key(row), row.id),
            "serial": lambda row: (_inventory_number_sort_key(row), row.id),
            "name": lambda row: (_coerce_str(row.name).lower(), _coerce_str(row.model).lower(), row.id),
            "specification": lambda row: (_coerce_str(row.specification).lower(), row.id),
            "location": lambda row: (_coerce_str(row.location).lower(), row.id),
            "keeper": lambda row: (_coerce_str(row.keeper).lower(), row.id),
            "asset_status": lambda row: (_coerce_str(row.asset_status).lower(), row.id),
        },
    )

    paged_items, total, total_pages = _paginate_rows(sorted_rows, page, page_size)
    return InventoryItemListResponse(items=paged_items, page=page, page_size=page_size, total=total, total_pages=total_pages)


@app.get("/api/items/{item_id}", response_model=InventoryItem, response_model_by_alias=False)
def get_inventory_item_api(item_id: int):
    row = get_item_by_id(item_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Item not found")

    log_inventory_action(action="read", entity="inventory_item", entity_id=item_id, detail={"mode": "single"})
    return row_to_item(row)


@app.post("/api/items", response_model=InventoryItem, response_model_by_alias=False)
def create_inventory_item_api(item: InventoryItemCreate):
    item_data = to_db_payload(item)
    try:
        item_id = create_item(item_data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    row = get_item_by_id(item_id)
    if row is None:
        log_inventory_action(
            action="create",
            entity="inventory_item",
            entity_id=item_id,
            status="failed",
            detail={"reason": "Item created but cannot be loaded"},
        )
        raise HTTPException(status_code=500, detail="Item created but cannot be loaded")

    log_inventory_action(action="create", entity="inventory_item", entity_id=item_id, detail=item_data)
    return row_to_item(row)


@app.put("/api/items/{item_id}", response_model=InventoryItem, response_model_by_alias=False)
def update_inventory_item_api(item_id: int, item: InventoryItemCreate):
    item_data = to_db_payload(item)
    try:
        updated = update_item(item_id, item_data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not updated:
        log_inventory_action(
            action="update",
            entity="inventory_item",
            entity_id=item_id,
            status="failed",
            detail={"reason": "Item not found"},
        )
        raise HTTPException(status_code=404, detail="Item not found")

    row = get_item_by_id(item_id)
    if row is None:
        log_inventory_action(
            action="update",
            entity="inventory_item",
            entity_id=item_id,
            status="failed",
            detail={"reason": "Item not found after update"},
        )
        raise HTTPException(status_code=404, detail="Item not found")

    return row_to_item(row)

@app.delete("/api/items/{item_id}")
def delete_inventory_item_api(item_id: int):
    purged_count = purge_soft_deleted_items()
    if purged_count > 0:
        log_inventory_action(
            action="purge",
            entity="inventory_item",
            detail={"deleted_count": purged_count, "policy": "soft-deleted over 6 months"},
        )

    try:
        deleted = delete_item(item_id)
    except ValueError as exc:
        message = str(exc)
        log_inventory_action(
            action="soft_delete",
            entity="inventory_item",
            entity_id=item_id,
            status="failed",
            detail={"reason": message},
        )
        raise HTTPException(status_code=409, detail=message) from exc
    if not deleted:
        log_inventory_action(
            action="soft_delete",
            entity="inventory_item",
            entity_id=item_id,
            status="failed",
            detail={"reason": "Item not found"},
        )
        raise HTTPException(status_code=404, detail="Item not found")

    log_inventory_action(action="soft_delete", entity="inventory_item", entity_id=item_id)
    return {"success": True}


@app.post("/api/items/{item_id}/detach", response_model=InventoryItem, response_model_by_alias=False)
def detach_inventory_item_api(item_id: int, payload: InventoryItemDetachCreate):
    detach_payload = {
        "name_code": payload.name_code,
        "name_code2": payload.name_code2,
        "seq": payload.seq,
        "name": payload.name,
        "model": payload.model,
        "specification": payload.specification,
        "unit": payload.unit,
        "purchase_date": _format_date(payload.purchase_date),
        "location": payload.location,
        "memo": payload.memo,
        "memo2": payload.memo2,
        "keeper": payload.keeper,
        "asset_status": payload.asset_status,
        "condition_status": payload.condition_status,
    }
    try:
        child_item_id = detach_item(item_id, detach_payload)
    except ValueError as exc:
        message = str(exc)
        if message == "parent item not found":
            raise HTTPException(status_code=404, detail=message) from exc
        if "already exists" in message:
            raise HTTPException(status_code=409, detail=message) from exc
        raise HTTPException(status_code=400, detail=message) from exc

    row = get_item_by_id(child_item_id)
    if row is None:
        log_inventory_action(
            action="detach",
            entity="inventory_item",
            entity_id=child_item_id,
            status="failed",
            detail={"reason": "Child item created but cannot be loaded", "parent_item_id": item_id},
        )
        raise HTTPException(status_code=500, detail="Child item created but cannot be loaded")

    log_inventory_action(
        action="detach",
        entity="inventory_item",
        entity_id=child_item_id,
        detail={
            "parent_item_id": item_id,
            "child_item_id": child_item_id,
            "child_key": _coerce_str(row.get("key")),
        },
    )
    return row_to_item(row)


@app.post("/api/items/{item_id}/restore")
def restore_inventory_item_api(item_id: int):
    restored_meta = restore_item(item_id)
    if restored_meta is None:
        log_inventory_action(
            action="restore",
            entity="inventory_item",
            entity_id=item_id,
            status="failed",
            detail={"reason": "Item not found"},
        )
        raise HTTPException(status_code=404, detail="Item not found")

    log_inventory_action(
        action="restore",
        entity="inventory_item",
        entity_id=item_id,
        detail={
            "deleted_at": restored_meta.get("deleted_at", ""),
            "deleted_by": restored_meta.get("deleted_by", ""),
            "restored_by": "system",
        },
    )
    return {"success": True}


@app.get("/api/issues", response_model=IssueRequestListResponse, response_model_by_alias=False)
def list_issue_requests_api(
    keyword: str = "",
    sort_by: str = "",
    sort_dir: str = "desc",
    page: int = Query(default=1),
    page_size: int = Query(default=10),
):
    page, page_size = _normalize_pagination(page, page_size)
    normalized_sort_dir = _normalize_sort_direction(sort_dir)
    rows = list_issue_requests()
    request_ids = {int(row.get("id") or 0) for row in rows}
    request_item_map = list_issue_items_map(request_ids)
    normalized_keyword = keyword.strip().lower()
    results: list[IssueRequest] = []
    for row in rows:
        items = [row_to_issue_item(item) for item in request_item_map.get(int(row.get("id") or 0), [])]
        model = issue_request_row_to_model(row, items)
        if normalized_keyword:
            item_matches = any((item.item_name or "").lower().find(normalized_keyword) >= 0 for item in model.items)
            fields = [
                model.requester or "",
                model.department or "",
                model.purpose or "",
                model.memo or "",
                str(model.request_date or ""),
            ]
            if not item_matches and not any(field.lower().find(normalized_keyword) >= 0 for field in fields):
                continue
        results.append(model)

    sorted_rows = _sort_records(
        results,
        sort_by=sort_by,
        sort_dir=normalized_sort_dir,
        default_sort_by="id",
        sort_key_map={
            "id": lambda row: row.id,
            "request_date": lambda row: (_coerce_str(row.request_date), row.id),
            "requester": lambda row: (_coerce_str(row.requester).lower(), _coerce_str(row.department).lower(), row.id),
            "purpose": lambda row: (_coerce_str(row.purpose).lower(), row.id),
            "items": lambda row: (_request_items_sort_key(row.items), row.id),
            "memo": lambda row: (_coerce_str(row.memo).lower(), row.id),
        },
    )

    paged_items, total, total_pages = _paginate_rows(sorted_rows, page, page_size)
    return IssueRequestListResponse(items=paged_items, page=page, page_size=page_size, total=total, total_pages=total_pages)


@app.get("/api/issues/{request_id}", response_model=IssueRequest, response_model_by_alias=False)
def get_issue_request_api(request_id: int):
    row = get_issue_request(request_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Issue request not found")
    items = [row_to_issue_item(item) for item in list_issue_items(request_id)]
    log_inventory_action(action="read", entity="issue_request", entity_id=request_id, detail={"mode": "single"})
    return issue_request_row_to_model(row, items)


@app.post("/api/issues", response_model=IssueRequest, response_model_by_alias=False)
def create_issue_request_api(request: IssueRequestCreate, background_tasks: BackgroundTasks):
    if not request.items:
        raise HTTPException(status_code=400, detail="items is required")
    for item in request.items:
        if item.quantity != 1:
            raise HTTPException(status_code=400, detail="quantity must be 1 in single-item mode")
    try:
        request_id = create_issue_request(issue_request_to_db_payload(request), [item.model_dump() for item in request.items])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    row = get_issue_request(request_id)
    if row is None:
        log_inventory_action(
            action="create",
            entity="issue_request",
            entity_id=request_id,
            status="failed",
            detail={"reason": "Issue request created but cannot be loaded"},
        )
        raise HTTPException(status_code=500, detail="Issue request created but cannot be loaded")
    items = [row_to_issue_item(item) for item in list_issue_items(request_id)]
    log_inventory_action(action="create", entity="issue_request", entity_id=request_id)
    if is_google_sheets_configured():
        background_tasks.add_task(_sync_requests_safe)
    return issue_request_row_to_model(row, items)


@app.put("/api/issues/{request_id}", response_model=IssueRequest, response_model_by_alias=False)
def update_issue_request_api(request_id: int, request: IssueRequestCreate, background_tasks: BackgroundTasks):
    if not request.items:
        raise HTTPException(status_code=400, detail="items is required")
    for item in request.items:
        if item.quantity != 1:
            raise HTTPException(status_code=400, detail="quantity must be 1 in single-item mode")
    try:
        updated = update_issue_request(request_id, issue_request_to_db_payload(request), [item.model_dump() for item in request.items])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not updated:
        log_inventory_action(
            action="update",
            entity="issue_request",
            entity_id=request_id,
            status="failed",
            detail={"reason": "Issue request not found"},
        )
        raise HTTPException(status_code=404, detail="Issue request not found")
    row = get_issue_request(request_id)
    if row is None:
        log_inventory_action(
            action="update",
            entity="issue_request",
            entity_id=request_id,
            status="failed",
            detail={"reason": "Issue request not found after update"},
        )
        raise HTTPException(status_code=404, detail="Issue request not found")
    items = [row_to_issue_item(item) for item in list_issue_items(request_id)]
    log_inventory_action(action="update", entity="issue_request", entity_id=request_id)
    if is_google_sheets_configured():
        background_tasks.add_task(_sync_requests_safe)
    return issue_request_row_to_model(row, items)


@app.delete("/api/issues/{request_id}")
def delete_issue_request_api(request_id: int, background_tasks: BackgroundTasks):
    try:
        deleted = delete_issue_request(request_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not deleted:
        log_inventory_action(
            action="delete",
            entity="issue_request",
            entity_id=request_id,
            status="failed",
            detail={"reason": "Issue request not found"},
        )
        raise HTTPException(status_code=404, detail="Issue request not found")
    log_inventory_action(action="delete", entity="issue_request", entity_id=request_id)
    if is_google_sheets_configured():
        background_tasks.add_task(_sync_requests_safe)
    return {"success": True}


@app.get("/api/borrows", response_model=BorrowRequestListResponse, response_model_by_alias=False)
def list_borrow_requests_api(
    keyword: str = "",
    status: str = "all",
    sort_by: str = "",
    sort_dir: str = "desc",
    page: int = Query(default=1),
    page_size: int = Query(default=10),
):
    page, page_size = _normalize_pagination(page, page_size)
    normalized_sort_dir = _normalize_sort_direction(sort_dir)
    rows = list_borrow_requests()
    request_ids = {int(row.get("id") or 0) for row in rows}
    request_item_map = list_borrow_items_map(request_ids)
    normalized_keyword = keyword.strip().lower()
    results: list[BorrowRequest] = []
    for row in rows:
        request_lines = [row_to_borrow_item(item) for item in request_item_map.get(int(row.get("id") or 0), [])]
        model = borrow_request_row_to_model(row, request_lines)
        if status != "all" and model.status != status:
            continue
        if normalized_keyword:
            item_matches = any((line.item_name or "").lower().find(normalized_keyword) >= 0 for line in model.request_lines)
            fields = [
                model.borrower or "",
                model.department or "",
                model.purpose or "",
                model.memo or "",
                str(model.borrow_date or ""),
            ]
            if not item_matches and not any(field.lower().find(normalized_keyword) >= 0 for field in fields):
                continue
        results.append(model)

    sorted_rows = _sort_records(
        results,
        sort_by=sort_by,
        sort_dir=normalized_sort_dir,
        default_sort_by="id",
        sort_key_map={
            "id": lambda row: row.id,
            "borrow_date": lambda row: (_coerce_str(row.borrow_date), row.id),
            "borrower": lambda row: (_coerce_str(row.borrower).lower(), _coerce_str(row.department).lower(), row.id),
            "purpose": lambda row: (_coerce_str(row.purpose).lower(), row.id),
            "return_info": lambda row: (
                _coerce_str(row.due_date),
                _coerce_str(row.return_date),
                _coerce_str(row.status).lower(),
                int(bool(row.is_due_soon)),
                row.id,
            ),
            "items": lambda row: (_request_items_sort_key(row.request_lines), row.id),
            "memo": lambda row: (_coerce_str(row.memo).lower(), row.id),
        },
    )

    paged_items, total, total_pages = _paginate_rows(sorted_rows, page, page_size)
    return BorrowRequestListResponse(items=paged_items, page=page, page_size=page_size, total=total, total_pages=total_pages)


@app.get("/api/borrows/{request_id}", response_model=BorrowRequest, response_model_by_alias=False)
def get_borrow_request_api(request_id: int):
    row = get_borrow_request(request_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Borrow request not found")
    request_lines = [row_to_borrow_item(item) for item in list_borrow_items(request_id)]
    log_inventory_action(action="read", entity="borrow_request", entity_id=request_id, detail={"mode": "single"})
    return borrow_request_row_to_model(row, request_lines)


@app.get("/api/borrows/{request_id}/pickup-candidates", response_model=list[BorrowPickupCandidateLine], response_model_by_alias=False)
def list_borrow_pickup_candidates_api(request_id: int):
    try:
        rows = list_borrow_pickup_candidates(request_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if rows is None:
        raise HTTPException(status_code=404, detail="Borrow request not found")
    return [BorrowPickupCandidateLine(**row) for row in rows]


@app.get("/api/borrows/{request_id}/pickup-lines", response_model=list[BorrowPickupLineSummary], response_model_by_alias=False)
def list_borrow_pickup_lines_api(request_id: int):
    try:
        rows = list_borrow_pickup_lines(request_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if rows is None:
        raise HTTPException(status_code=404, detail="Borrow request not found")
    return [BorrowPickupLineSummary(**row) for row in rows]


@app.get("/api/borrows/{request_id}/pickup-lines/{line_id}/candidates", response_model=BorrowPickupLineCandidatePage, response_model_by_alias=False)
def list_borrow_pickup_line_candidates_api(
    request_id: int,
    line_id: int,
    keyword: str = "",
    page: int = Query(default=1),
    page_size: int = Query(default=50),
):
    page, page_size = _normalize_pagination(page, page_size)
    if page_size > 200:
        raise HTTPException(status_code=400, detail="page_size must be less than or equal to 200")
    try:
        payload = list_borrow_pickup_line_candidates(
            request_id,
            line_id,
            keyword=keyword,
            page=page,
            page_size=page_size,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if payload is None:
        raise HTTPException(status_code=404, detail="Borrow request not found")
    return BorrowPickupLineCandidatePage(**payload)


@app.post("/api/borrows/{request_id}/pickup-resolve-scan", response_model=BorrowPickupScanResolveResponse, response_model_by_alias=False)
def resolve_borrow_pickup_scan_api(request_id: int, payload: BorrowPickupScanResolveRequest):
    try:
        result = resolve_borrow_pickup_scan(request_id, payload.code)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if result is None:
        raise HTTPException(status_code=404, detail="Borrow request not found")
    return BorrowPickupScanResolveResponse(**result)


@app.post("/api/borrows", response_model=BorrowRequest, response_model_by_alias=False)
def create_borrow_request_api(request: BorrowRequestCreate, background_tasks: BackgroundTasks):
    if not request.request_lines:
        raise HTTPException(status_code=400, detail="request_lines is required")
    try:
        request_id = create_borrow_request(
            borrow_request_to_db_payload(request),
            [line.model_dump() for line in request.request_lines],
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=_to_http_error_detail(exc)) from exc
    row = get_borrow_request(request_id)
    if row is None:
        log_inventory_action(
            action="create",
            entity="borrow_request",
            entity_id=request_id,
            status="failed",
            detail={"reason": "Borrow request created but cannot be loaded"},
        )
        raise HTTPException(status_code=500, detail="Borrow request created but cannot be loaded")
    request_lines = [row_to_borrow_item(item) for item in list_borrow_items(request_id)]
    log_inventory_action(action="create", entity="borrow_request", entity_id=request_id)
    if is_google_sheets_configured():
        background_tasks.add_task(_sync_requests_safe)
    return borrow_request_row_to_model(row, request_lines)


@app.put("/api/borrows/{request_id}", response_model=BorrowRequest, response_model_by_alias=False)
def update_borrow_request_api(request_id: int, request: BorrowRequestCreate, background_tasks: BackgroundTasks):
    if not request.request_lines:
        raise HTTPException(status_code=400, detail="request_lines is required")
    try:
        updated = update_borrow_request(
            request_id,
            borrow_request_to_db_payload(request),
            [line.model_dump() for line in request.request_lines],
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=_to_http_error_detail(exc)) from exc
    if not updated:
        log_inventory_action(
            action="update",
            entity="borrow_request",
            entity_id=request_id,
            status="failed",
            detail={"reason": "Borrow request not found"},
        )
        raise HTTPException(status_code=404, detail="Borrow request not found")
    row = get_borrow_request(request_id)
    if row is None:
        log_inventory_action(
            action="update",
            entity="borrow_request",
            entity_id=request_id,
            status="failed",
            detail={"reason": "Borrow request not found after update"},
        )
        raise HTTPException(status_code=404, detail="Borrow request not found")
    request_lines = [row_to_borrow_item(item) for item in list_borrow_items(request_id)]
    log_inventory_action(action="update", entity="borrow_request", entity_id=request_id)
    if is_google_sheets_configured():
        background_tasks.add_task(_sync_requests_safe)
    return borrow_request_row_to_model(row, request_lines)


@app.post("/api/borrows/{request_id}/pickup", response_model=BorrowRequest, response_model_by_alias=False)
def pickup_borrow_request_api(request_id: int, payload: BorrowPickupRequest, background_tasks: BackgroundTasks):
    try:
        picked = pickup_borrow_request(request_id, [selection.model_dump() for selection in payload.selections])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=_to_http_error_detail(exc)) from exc
    if not picked:
        raise HTTPException(status_code=404, detail="Borrow request not found")
    row = get_borrow_request(request_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Borrow request not found")
    request_lines = [row_to_borrow_item(item) for item in list_borrow_items(request_id)]
    log_inventory_action(action="pickup", entity="borrow_request", entity_id=request_id)
    if is_google_sheets_configured():
        background_tasks.add_task(_sync_requests_safe)
    return borrow_request_row_to_model(row, request_lines)


@app.post("/api/borrows/{request_id}/return", response_model=BorrowRequest, response_model_by_alias=False)
def return_borrow_request_api(request_id: int, background_tasks: BackgroundTasks):
    try:
        returned = return_borrow_request(request_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=_to_http_error_detail(exc)) from exc
    if not returned:
        raise HTTPException(status_code=404, detail="Borrow request not found")
    row = get_borrow_request(request_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Borrow request not found")
    request_lines = [row_to_borrow_item(item) for item in list_borrow_items(request_id)]
    log_inventory_action(action="return", entity="borrow_request", entity_id=request_id)
    if is_google_sheets_configured():
        background_tasks.add_task(_sync_requests_safe)
    return borrow_request_row_to_model(row, request_lines)


@app.delete("/api/borrows/{request_id}")
def delete_borrow_request_api(request_id: int, background_tasks: BackgroundTasks):
    try:
        deleted = delete_borrow_request(request_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not deleted:
        log_inventory_action(
            action="delete",
            entity="borrow_request",
            entity_id=request_id,
            status="failed",
            detail={"reason": "Borrow request not found"},
        )
        raise HTTPException(status_code=404, detail="Borrow request not found")
    log_inventory_action(action="delete", entity="borrow_request", entity_id=request_id)
    if is_google_sheets_configured():
        background_tasks.add_task(_sync_requests_safe)
    return {"success": True}


@app.get("/api/donations", response_model=DonationRequestListResponse, response_model_by_alias=False)
def list_donation_requests_api(
    keyword: str = "",
    sort_by: str = "",
    sort_dir: str = "desc",
    page: int = Query(default=1),
    page_size: int = Query(default=10),
):
    page, page_size = _normalize_pagination(page, page_size)
    normalized_sort_dir = _normalize_sort_direction(sort_dir)
    rows = list_donation_requests()
    request_ids = {int(row.get("id") or 0) for row in rows}
    request_item_map = list_donation_items_map(request_ids)
    normalized_keyword = keyword.strip().lower()
    results: list[DonationRequest] = []
    for row in rows:
        items = [row_to_donation_item(item) for item in request_item_map.get(int(row.get("id") or 0), [])]
        model = donation_request_row_to_model(row, items)
        if normalized_keyword:
            item_matches = any((item.item_name or "").lower().find(normalized_keyword) >= 0 for item in model.items)
            fields = [
                model.donor or "",
                model.department or "",
                model.recipient or "",
                model.purpose or "",
                model.memo or "",
                str(model.donation_date or ""),
            ]
            if not item_matches and not any(field.lower().find(normalized_keyword) >= 0 for field in fields):
                continue
        results.append(model)

    sorted_rows = _sort_records(
        results,
        sort_by=sort_by,
        sort_dir=normalized_sort_dir,
        default_sort_by="id",
        sort_key_map={
            "id": lambda row: row.id,
            "donation_date": lambda row: (_coerce_str(row.donation_date), row.id),
            "donor": lambda row: (_coerce_str(row.donor).lower(), _coerce_str(row.department).lower(), row.id),
            "recipient": lambda row: (_coerce_str(row.recipient).lower(), row.id),
            "purpose": lambda row: (_coerce_str(row.purpose).lower(), row.id),
            "items": lambda row: (_request_items_sort_key(row.items), row.id),
            "memo": lambda row: (_coerce_str(row.memo).lower(), row.id),
        },
    )

    paged_items, total, total_pages = _paginate_rows(sorted_rows, page, page_size)
    return DonationRequestListResponse(items=paged_items, page=page, page_size=page_size, total=total, total_pages=total_pages)


@app.get("/api/donations/{request_id}", response_model=DonationRequest, response_model_by_alias=False)
def get_donation_request_api(request_id: int):
    row = get_donation_request(request_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Donation request not found")
    items = [row_to_donation_item(item) for item in list_donation_items(request_id)]
    log_inventory_action(action="read", entity="donation_request", entity_id=request_id, detail={"mode": "single"})
    return donation_request_row_to_model(row, items)


@app.post("/api/donations", response_model=DonationRequest, response_model_by_alias=False)
def create_donation_request_api(request: DonationRequestCreate):
    if not request.items:
        raise HTTPException(status_code=400, detail="items is required")
    if not request.recipient.strip():
        raise HTTPException(status_code=400, detail="recipient is required")
    for item in request.items:
        if item.quantity != 1:
            raise HTTPException(status_code=400, detail="quantity must be 1 in single-item mode")
    try:
        request_id = create_donation_request(
            donation_request_to_db_payload(request),
            [item.model_dump() for item in request.items],
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    row = get_donation_request(request_id)
    if row is None:
        log_inventory_action(
            action="create",
            entity="donation_request",
            entity_id=request_id,
            status="failed",
            detail={"reason": "Donation request created but cannot be loaded"},
        )
        raise HTTPException(status_code=500, detail="Donation request created but cannot be loaded")
    items = [row_to_donation_item(item) for item in list_donation_items(request_id)]
    log_inventory_action(action="create", entity="donation_request", entity_id=request_id)
    return donation_request_row_to_model(row, items)


@app.put("/api/donations/{request_id}", response_model=DonationRequest, response_model_by_alias=False)
def update_donation_request_api(request_id: int, request: DonationRequestCreate):
    if not request.items:
        raise HTTPException(status_code=400, detail="items is required")
    if not request.recipient.strip():
        raise HTTPException(status_code=400, detail="recipient is required")
    for item in request.items:
        if item.quantity != 1:
            raise HTTPException(status_code=400, detail="quantity must be 1 in single-item mode")
    try:
        updated = update_donation_request(
            request_id,
            donation_request_to_db_payload(request),
            [item.model_dump() for item in request.items],
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not updated:
        log_inventory_action(
            action="update",
            entity="donation_request",
            entity_id=request_id,
            status="failed",
            detail={"reason": "Donation request not found"},
        )
        raise HTTPException(status_code=404, detail="Donation request not found")
    row = get_donation_request(request_id)
    if row is None:
        log_inventory_action(
            action="update",
            entity="donation_request",
            entity_id=request_id,
            status="failed",
            detail={"reason": "Donation request not found after update"},
        )
        raise HTTPException(status_code=404, detail="Donation request not found")
    items = [row_to_donation_item(item) for item in list_donation_items(request_id)]
    log_inventory_action(action="update", entity="donation_request", entity_id=request_id)
    return donation_request_row_to_model(row, items)


@app.delete("/api/donations/{request_id}")
def delete_donation_request_api(request_id: int):
    try:
        deleted = delete_donation_request(request_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not deleted:
        log_inventory_action(
            action="delete",
            entity="donation_request",
            entity_id=request_id,
            status="failed",
            detail={"reason": "Donation request not found"},
        )
        raise HTTPException(status_code=404, detail="Donation request not found")
    log_inventory_action(action="delete", entity="donation_request", entity_id=request_id)
    return {"success": True}


@app.get("/api/logs/movements", response_model=MovementLedgerListResponse, response_model_by_alias=False)
def list_movement_ledger_api(
    start_at: str = "",
    end_at: str = "",
    action: str = "",
    entity: str = "",
    scope: str = "hot",
    item_id: int | None = None,
    entity_id: int | None = None,
    sort_by: str = "",
    sort_dir: str = "desc",
    page: int = Query(default=1),
    page_size: int = Query(default=10),
):
    page, page_size = _normalize_pagination(page, page_size)
    normalized_scope = _normalize_log_scope(scope)
    normalized_sort_dir = _normalize_sort_direction(sort_dir)
    archive_old_logs()
    start_time, end_time = _parse_datetime_range_filters(start_at, end_at)
    rows = list_movement_ledger(
        start_at=start_time,
        end_at=end_time,
        action=action,
        entity=entity,
        item_id=item_id,
        entity_id=entity_id,
        scope=normalized_scope,
    )
    sorted_rows = _sort_records(
        rows,
        sort_by=sort_by,
        sort_dir=normalized_sort_dir,
        default_sort_by="id",
        sort_key_map={
            "id": lambda row: int(row.get("id") or 0),
            "created_at": lambda row: (_coerce_str(row.get("created_at")), int(row.get("id") or 0)),
            "item": lambda row: (
                _coerce_str(row.get("item_name")).lower(),
                _coerce_str(row.get("item_model")).lower(),
                int(row.get("item_id") or 0),
            ),
            "status_change": lambda row: (
                _coerce_str(row.get("from_status")).lower(),
                _coerce_str(row.get("to_status")).lower(),
                int(row.get("id") or 0),
            ),
            "action": lambda row: (_coerce_str(row.get("action")).lower(), int(row.get("id") or 0)),
            "entity": lambda row: (_coerce_str(row.get("entity")).lower(), int(row.get("id") or 0)),
            "entity_id": lambda row: (int(row.get("entity_id") or 0), int(row.get("id") or 0)),
            "operator": lambda row: (_coerce_str(row.get("operator")).lower(), int(row.get("id") or 0)),
        },
    )

    paged_items, total, total_pages = _paginate_rows(sorted_rows, page, page_size)
    models = [MovementLedgerEntry(**row) for row in paged_items]
    return MovementLedgerListResponse(items=models, page=page, page_size=page_size, total=total, total_pages=total_pages)


@app.get("/api/logs/operations", response_model=OperationLogListResponse, response_model_by_alias=False)
def list_operation_logs_api(
    start_at: str = "",
    end_at: str = "",
    action: str = "",
    entity: str = "",
    scope: str = "hot",
    item_id: int | None = None,
    entity_id: int | None = None,
    sort_by: str = "",
    sort_dir: str = "desc",
    page: int = Query(default=1),
    page_size: int = Query(default=10),
):
    page, page_size = _normalize_pagination(page, page_size)
    normalized_scope = _normalize_log_scope(scope)
    normalized_sort_dir = _normalize_sort_direction(sort_dir)
    archive_old_logs()
    start_time, end_time = _parse_datetime_range_filters(start_at, end_at)
    rows = list_operation_logs(
        start_at=start_time,
        end_at=end_time,
        action=action,
        entity=entity,
        item_id=item_id,
        entity_id=entity_id,
        scope=normalized_scope,
    )
    sorted_rows = _sort_records(
        rows,
        sort_by=sort_by,
        sort_dir=normalized_sort_dir,
        default_sort_by="id",
        sort_key_map={
            "id": lambda row: int(row.get("id") or 0),
            "created_at": lambda row: (_coerce_str(row.get("created_at")), int(row.get("id") or 0)),
            "action": lambda row: (_coerce_str(row.get("action")).lower(), int(row.get("id") or 0)),
            "entity": lambda row: (_coerce_str(row.get("entity")).lower(), int(row.get("id") or 0)),
            "entity_id": lambda row: (int(row.get("entity_id") or 0), int(row.get("id") or 0)),
            "status": lambda row: (_coerce_str(row.get("status")).lower(), int(row.get("id") or 0)),
            "detail": lambda row: (_operation_detail_sort_key(row.get("detail") or {}), int(row.get("id") or 0)),
        },
    )

    paged_items, total, total_pages = _paginate_rows(sorted_rows, page, page_size)
    models = [OperationLogEntry(**row) for row in paged_items]
    return OperationLogListResponse(items=models, page=page, page_size=page_size, total=total, total_pages=total_pages)


@app.post("/api/items/import", response_model=ImportResponse)
async def import_inventory_items_from_xlsx(
    file: UploadFile = File(...),
    asset_type: str = Form(...),
):
    if not file.filename or not file.filename.lower().endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Only .xlsx files are supported")

    selected_asset_type = asset_type.strip()
    if not selected_asset_type:
        raise HTTPException(status_code=400, detail="asset_type is required")

    content = await file.read()
    result = import_inventory_items_from_xlsx_content(
        file_content=content,
        item_create_model=InventoryItemCreate,
        selected_asset_type=selected_asset_type,
        to_db_payload=to_db_payload,
        create_item=create_item,
        create_items_bulk=create_items_bulk,
    )
    log_inventory_action(
        action="import",
        entity="inventory_item",
        detail={
            "filename": file.filename,
            "asset_type": selected_asset_type,
            "total": result["total"],
            "created": result["created"],
            "failed": result["failed"],
        },
        status="success" if result["failed"] == 0 else "partial_success",
    )
    return ImportResponse(**result)


@app.get("/api/settings/ai/gemini-token", response_model=GeminiTokenSettingsResponse)
def get_gemini_token_settings_api():
    return _build_gemini_token_settings_response()


@app.put("/api/settings/ai/gemini-token", response_model=GeminiTokenSettingsResponse)
def upsert_gemini_token_settings_api(payload: GeminiTokenUpsertRequest):
    token = payload.token.strip()
    if not token:
        raise HTTPException(status_code=400, detail={"code": "invalid_token", "message": "Gemini token 不可為空。"})
    selected_model = (payload.model or "").strip()
    if not selected_model:
        selected_model = _coerce_str(get_quota_status().get("model")).strip()
    if not selected_model:
        selected_model = get_supported_models()[0]
    if not is_supported_model(selected_model):
        raise HTTPException(status_code=400, detail={"code": "invalid_model", "message": "Gemini model 不在可用清單。"})
    try:
        validate_gemini_token(token, model=selected_model)
        set_gemini_api_token(token)
        set_gemini_model(selected_model)
        log_inventory_action(
            action="bind",
            entity="system_setting",
            status="success",
            detail={"target": "gemini_api_token", "model": selected_model},
        )
        return _build_gemini_token_settings_response()
    except AIRecognitionError as exc:
        log_inventory_action(
            action="bind",
            entity="system_setting",
            status="failed",
            detail={"target": "gemini_api_token", "error_code": exc.code},
        )
        raise HTTPException(status_code=400, detail={"code": exc.code, "message": exc.message}) from exc


@app.delete("/api/settings/ai/gemini-token")
def delete_gemini_token_settings_api():
    deleted = delete_gemini_api_token()
    log_inventory_action(
        action="unbind",
        entity="system_setting",
        status="success",
        detail={"target": "gemini_api_token", "deleted": deleted},
    )
    return {"deleted": deleted}


@app.get("/api/ai/spec-recognition/quota", response_model=AiRecognitionQuotaResponse)
def get_ai_spec_recognition_quota_api():
    payload = get_quota_status()
    return AiRecognitionQuotaResponse(**payload)


@app.post("/api/ai/spec-recognition", response_model=AiSpecRecognitionResponse)
async def recognize_item_spec_api(file: UploadFile = File(...)):
    try:
        file_content = await file.read()
        result = recognize_spec_from_image(
            file_content=file_content,
            content_type=file.content_type or "",
            filename=file.filename or "",
        )
        log_inventory_action(
            action="recognize_spec",
            entity="inventory_item",
            status="success",
            detail={
                "filename": file.filename or "",
                "content_type": file.content_type or "",
                "recognized_fields": [key for key, value in result.recognized_fields.items() if value.strip()],
                "warning_count": len(result.warnings),
            },
        )
        return AiSpecRecognitionResponse(
            recognized_fields=AiRecognizedFields(**result.recognized_fields),
            raw_text_excerpt=result.raw_text_excerpt,
            quota=AiQuota(**result.quota),
            warnings=result.warnings,
        )
    except AIRecognitionError as exc:
        log_inventory_action(
            action="recognize_spec",
            entity="inventory_item",
            status="failed",
            detail={
                "filename": file.filename or "",
                "content_type": file.content_type or "",
                "error_code": exc.code,
            },
        )
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code, "message": exc.message}) from exc


@app.get("/{full_path:path}")
def serve_frontend(full_path: str):
    frontend_asset = _resolve_frontend_asset(full_path)
    if frontend_asset is not None:
        return FileResponse(frontend_asset)

    frontend_index = _resolve_frontend_index()
    if frontend_index is not None:
        return FileResponse(frontend_index)

    raise HTTPException(status_code=404, detail="Frontend index.html not found")
