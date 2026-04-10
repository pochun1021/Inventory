from datetime import date, datetime
import math
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from db import (
    create_asset_status_code,
    create_item,
    create_items_bulk,
    create_issue_request,
    create_borrow_request,
    create_donation_request,
    delete_asset_status_code,
    delete_item,
    delete_issue_request,
    delete_borrow_request,
    delete_donation_request,
    get_item_by_id,
    get_items_count,
    get_issue_request,
    get_borrow_request,
    get_donation_request,
    get_pending_fix_count,
    init_db,
    list_asset_status_codes,
    list_issue_items,
    list_issue_requests,
    list_borrow_items,
    list_borrow_requests,
    list_donation_items,
    list_donation_requests,
    list_items,
    log_inventory_action,
    purge_soft_deleted_items,
    update_asset_status_code,
    update_item,
    update_issue_request,
    update_borrow_request,
    update_donation_request,
    validate_item_ids_available,
)
from xlsx_import import import_inventory_items_from_xlsx_content
from google_sheets import ensure_google_oauth, is_google_sheets_configured, sync_requests_to_google_sheets


BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent
FRONTEND_DIR = PROJECT_ROOT / "frontend"
FRONTEND_DIST_DIR = FRONTEND_DIR / "dist"

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
    key: str = ""
    n_property_sn: str = ""
    property_sn: str = ""
    n_item_sn: str = ""
    item_sn: str = ""
    name: str = ""
    name_code: str = ""
    name_code2: str = ""
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


class InventoryItem(InventoryItemCreate):
    id: int
    created_at: datetime | None = None
    created_by: str = ""
    updated_at: datetime | None = None
    updated_by: str = ""
    deleted_at: datetime | None = None
    deleted_by: str = ""
    donated_at: datetime | None = None
    donation_request_id: int | None = None


class AssetStatusCode(BaseModel):
    code: str
    description: str


class AssetStatusCodeCreate(BaseModel):
    code: str = ""
    description: str = ""


class AssetStatusCodeUpdate(BaseModel):
    code: str = ""
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


class BorrowItemCreate(BaseModel):
    item_id: int
    quantity: int = 1
    note: str = ""


class BorrowItem(BorrowItemCreate):
    id: int
    item_name: str | None = None
    item_model: str | None = None


class BorrowRequestCreate(BaseModel):
    borrower: str = ""
    department: str = ""
    purpose: str = ""
    borrow_date: date | None = None
    due_date: date | None = None
    return_date: date | None = None
    status: str = "borrowed"
    memo: str = ""
    items: list[BorrowItemCreate] = Field(default_factory=list)


class BorrowRequest(BorrowRequestCreate):
    id: int
    items: list[BorrowItem]


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


class DonationRequestListResponse(BaseModel):
    items: list[DonationRequest]
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
    }


def _format_date(value: date | None) -> str:
    return value.strftime("%Y/%m/%d") if value else ""


def _coerce_str(value) -> str:
    return value if isinstance(value, str) else "" if value is None else str(value)


def _contains_cjk(value: str) -> bool:
    return any("\u4e00" <= char <= "\u9fff" for char in value)


def _normalize_pagination(page: int, page_size: int) -> tuple[int, int]:
    if page < 1:
        raise HTTPException(status_code=400, detail="page must be greater than 0")
    if page_size < 1:
        raise HTTPException(status_code=400, detail="page_size must be greater than 0")
    return page, page_size


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
    try:
        count = int(row.get("count") or 0)
    except (TypeError, ValueError):
        count = 1
    if count <= 0:
        count = 1
    return InventoryItem(
        id=row["id"],
        asset_type=_coerce_str(row.get("asset_type")),
        asset_status=_coerce_str(row.get("asset_status")),
        key=_coerce_str(row.get("key")),
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
        created_at=_parse_datetime(_coerce_str(row.get("created_at"))),
        created_by=_coerce_str(row.get("created_by")),
        updated_at=_parse_datetime(_coerce_str(row.get("updated_at"))),
        updated_by=_coerce_str(row.get("updated_by")),
        deleted_at=_parse_datetime(_coerce_str(row.get("deleted_at"))),
        deleted_by=_coerce_str(row.get("deleted_by")),
        donated_at=_parse_datetime(donated_at_value),
        donation_request_id=donation_request_id,
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


def row_to_borrow_item(row) -> BorrowItem:
    return BorrowItem(
        id=row["id"],
        item_id=row["item_id"],
        quantity=row["quantity"],
        note=_coerce_str(row["note"]),
        item_name=row["item_name"],
        item_model=row["item_model"],
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
        "return_date": _format_date(request.return_date),
        "status": request.status,
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


def borrow_request_row_to_model(row, items: list[BorrowItem]) -> BorrowRequest:
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
        memo=_coerce_str(row["memo"]),
        items=items,
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


@app.on_event("startup")
def on_startup() -> None:
    init_db()
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
    return {"status": "success", "data": "這是管理系統的後端數據", "items": get_items_count(), "pendingFix": get_pending_fix_count()}


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


@app.get("/api/items", response_model=InventoryItemListResponse, response_model_by_alias=False)
def get_inventory_items(
    include_donated: bool = False,
    keyword: str = "",
    asset_type: str = "all",
    correction_status: str = "all",
    page: int = Query(default=1),
    page_size: int = Query(default=10),
):
    page, page_size = _normalize_pagination(page, page_size)
    rows = [row_to_item(row) for row in list_items(include_donated=include_donated)]

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

    paged_items, total, total_pages = _paginate_rows(filtered_rows, page, page_size)
    log_inventory_action(
        action="read",
        entity="inventory_item",
        detail={"count": len(paged_items), "total": total, "page": page, "page_size": page_size, "mode": "list"},
    )
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
    item_id = create_item(item_data)
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
    updated = update_item(item_id, item_data)
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

    deleted = delete_item(item_id)
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


@app.get("/api/issues", response_model=IssueRequestListResponse, response_model_by_alias=False)
def list_issue_requests_api(
    keyword: str = "",
    page: int = Query(default=1),
    page_size: int = Query(default=10),
):
    page, page_size = _normalize_pagination(page, page_size)
    rows = list_issue_requests()
    normalized_keyword = keyword.strip().lower()
    results: list[IssueRequest] = []
    for row in rows:
        items = [row_to_issue_item(item) for item in list_issue_items(row["id"])]
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

    paged_items, total, total_pages = _paginate_rows(results, page, page_size)
    log_inventory_action(
        action="read",
        entity="issue_request",
        detail={"count": len(paged_items), "total": total, "page": page, "page_size": page_size, "mode": "list"},
    )
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
    page: int = Query(default=1),
    page_size: int = Query(default=10),
):
    page, page_size = _normalize_pagination(page, page_size)
    rows = list_borrow_requests()
    normalized_keyword = keyword.strip().lower()
    results: list[BorrowRequest] = []
    for row in rows:
        items = [row_to_borrow_item(item) for item in list_borrow_items(row["id"])]
        model = borrow_request_row_to_model(row, items)
        if status != "all" and model.status != status:
            continue
        if normalized_keyword:
            item_matches = any((item.item_name or "").lower().find(normalized_keyword) >= 0 for item in model.items)
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

    paged_items, total, total_pages = _paginate_rows(results, page, page_size)
    log_inventory_action(
        action="read",
        entity="borrow_request",
        detail={"count": len(paged_items), "total": total, "page": page, "page_size": page_size, "mode": "list"},
    )
    return BorrowRequestListResponse(items=paged_items, page=page, page_size=page_size, total=total, total_pages=total_pages)


@app.get("/api/borrows/{request_id}", response_model=BorrowRequest, response_model_by_alias=False)
def get_borrow_request_api(request_id: int):
    row = get_borrow_request(request_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Borrow request not found")
    items = [row_to_borrow_item(item) for item in list_borrow_items(request_id)]
    log_inventory_action(action="read", entity="borrow_request", entity_id=request_id, detail={"mode": "single"})
    return borrow_request_row_to_model(row, items)


@app.post("/api/borrows", response_model=BorrowRequest, response_model_by_alias=False)
def create_borrow_request_api(request: BorrowRequestCreate, background_tasks: BackgroundTasks):
    if not request.items:
        raise HTTPException(status_code=400, detail="items is required")
    for item in request.items:
        if item.quantity != 1:
            raise HTTPException(status_code=400, detail="quantity must be 1 in single-item mode")
    try:
        request_id = create_borrow_request(borrow_request_to_db_payload(request), [item.model_dump() for item in request.items])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
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
    items = [row_to_borrow_item(item) for item in list_borrow_items(request_id)]
    log_inventory_action(action="create", entity="borrow_request", entity_id=request_id)
    if is_google_sheets_configured():
        background_tasks.add_task(_sync_requests_safe)
    return borrow_request_row_to_model(row, items)


@app.put("/api/borrows/{request_id}", response_model=BorrowRequest, response_model_by_alias=False)
def update_borrow_request_api(request_id: int, request: BorrowRequestCreate, background_tasks: BackgroundTasks):
    if not request.items:
        raise HTTPException(status_code=400, detail="items is required")
    for item in request.items:
        if item.quantity != 1:
            raise HTTPException(status_code=400, detail="quantity must be 1 in single-item mode")
    try:
        updated = update_borrow_request(request_id, borrow_request_to_db_payload(request), [item.model_dump() for item in request.items])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
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
    items = [row_to_borrow_item(item) for item in list_borrow_items(request_id)]
    log_inventory_action(action="update", entity="borrow_request", entity_id=request_id)
    if is_google_sheets_configured():
        background_tasks.add_task(_sync_requests_safe)
    return borrow_request_row_to_model(row, items)


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
    page: int = Query(default=1),
    page_size: int = Query(default=10),
):
    page, page_size = _normalize_pagination(page, page_size)
    rows = list_donation_requests()
    normalized_keyword = keyword.strip().lower()
    results: list[DonationRequest] = []
    for row in rows:
        items = [row_to_donation_item(item) for item in list_donation_items(row["id"])]
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

    paged_items, total, total_pages = _paginate_rows(results, page, page_size)
    log_inventory_action(
        action="read",
        entity="donation_request",
        detail={"count": len(paged_items), "total": total, "page": page, "page_size": page_size, "mode": "list"},
    )
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


@app.get("/{full_path:path}")
def serve_frontend(full_path: str):
    frontend_asset = _resolve_frontend_asset(full_path)
    if frontend_asset is not None:
        return FileResponse(frontend_asset)

    frontend_index = _resolve_frontend_index()
    if frontend_index is not None:
        return FileResponse(frontend_index)

    raise HTTPException(status_code=404, detail="Frontend index.html not found")
