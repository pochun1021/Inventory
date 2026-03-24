from datetime import date, datetime
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from db import (
    create_item,
    create_items_bulk,
    create_issue_request,
    create_borrow_request,
    create_donation_request,
    create_pos_order,
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
    get_pos_order,
    init_db,
    list_issue_items,
    list_issue_requests,
    list_borrow_items,
    list_borrow_requests,
    list_donation_items,
    list_donation_requests,
    list_items,
    list_pos_order_items,
    list_pos_orders,
    list_stock_balances,
    list_stock_movements,
    log_inventory_action,
    purge_soft_deleted_items,
    set_stock_quantity,
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
    kind: str = Field(default="", alias="類別")
    specification: str = Field(default="", alias="規格(大小/容量)")
    property_number: str = Field(default="", alias="財產編號")
    name: str = Field(default="", alias="品名")
    model: str = Field(default="", alias="型號")
    unit: str = Field(default="", alias="單位")
    purchase_date: date | None = Field(default=None, alias="購置日期")
    location: str = Field(default="", alias="放置地點")
    memo: str = Field(default="", alias="備註")
    keeper: str = Field(default="", alias="保管人（單位）")

    model_config = {
        "populate_by_name": True,
    }


class InventoryItem(InventoryItemCreate):
    id: int
    donated_at: datetime | None = None
    donation_request_id: int | None = None


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


class PosCheckoutItem(BaseModel):
    item_id: int
    quantity: int = 1
    unit_price: float = 0
    discount: float = 0
    note: str = ""


class PosCheckoutRequest(BaseModel):
    order_type: str = "sale"
    customer_name: str = ""
    operator_name: str = ""
    department: str = ""
    purpose: str = ""
    note: str = ""
    due_date: date | None = None
    borrow_request_id: int | None = None
    items: list[PosCheckoutItem] = Field(default_factory=list)


class PosOrderItem(BaseModel):
    id: int
    item_id: int
    item_name: str = ""
    item_model: str = ""
    quantity: int = 1
    unit_price: float = 0
    discount: float = 0
    line_total: float = 0
    note: str = ""


class PosOrder(BaseModel):
    id: int
    order_no: str
    order_type: str
    customer_name: str = ""
    operator_name: str = ""
    purpose: str = ""
    request_ref_type: str = ""
    request_ref_id: int | None = None
    subtotal: float = 0
    discount_total: float = 0
    total: float = 0
    note: str = ""
    created_at: datetime | None = None
    items: list[PosOrderItem] = Field(default_factory=list)


class PosStockBalance(BaseModel):
    item_id: int
    item_name: str = ""
    item_model: str = ""
    quantity: int = 0


class PosStockSetRequest(BaseModel):
    quantity: int


class PosStockMovement(BaseModel):
    id: int
    order_id: int
    order_no: str = ""
    item_id: int
    item_name: str = ""
    item_model: str = ""
    delta: int
    balance_after: int
    reason: str = ""
    related_type: str = ""
    related_id: int | None = None
    created_at: datetime | None = None


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
        "kind": item.kind,
        "specification": item.specification,
        "property_number": item.property_number,
        "name": item.name,
        "model": item.model,
        "unit": item.unit,
        "purchase_date": item.purchase_date.strftime("%Y/%m/%d") if item.purchase_date else "",
        "location": item.location,
        "keeper": item.keeper,
        "memo": item.memo,
    }


def _format_date(value: date | None) -> str:
    return value.strftime("%Y/%m/%d") if value else ""


def _coerce_str(value) -> str:
    return value if isinstance(value, str) else "" if value is None else str(value)


def pos_checkout_to_db_payload(request: PosCheckoutRequest) -> dict:
    return {
        "order_type": request.order_type.strip(),
        "customer_name": request.customer_name,
        "operator_name": request.operator_name,
        "department": request.department,
        "purpose": request.purpose,
        "note": request.note,
        "due_date": _format_date(request.due_date),
        "borrow_request_id": request.borrow_request_id or "",
    }


def row_to_item(row) -> InventoryItem:
    purchase_date_value = row["purchase_date"]
    parsed_date = _parse_purchase_date(purchase_date_value) if purchase_date_value else None
    donated_at_value = _coerce_str(row.get("donated_at"))
    donation_request_id_raw = row.get("donation_request_id")
    try:
        donation_request_id = int(donation_request_id_raw) if donation_request_id_raw not in (None, "") else None
    except (TypeError, ValueError):
        donation_request_id = None
    return InventoryItem(
        id=row["id"],
        kind=_coerce_str(row["kind"]),
        specification=_coerce_str(row["specification"]),
        property_number=_coerce_str(row["property_number"]),
        name=_coerce_str(row["name"]),
        model=_coerce_str(row["model"]),
        unit=_coerce_str(row["unit"]),
        purchase_date=parsed_date,
        location=_coerce_str(row["location"]),
        memo=_coerce_str(row["memo"]),
        keeper=_coerce_str(row["keeper"]),
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


def row_to_pos_item(row) -> PosOrderItem:
    return PosOrderItem(
        id=int(row.get("id", 0)),
        item_id=int(row.get("item_id", 0)),
        item_name=_coerce_str(row.get("item_name")),
        item_model=_coerce_str(row.get("item_model")),
        quantity=int(row.get("quantity", 0)),
        unit_price=float(row.get("unit_price", 0) or 0),
        discount=float(row.get("discount", 0) or 0),
        line_total=float(row.get("line_total", 0) or 0),
        note=_coerce_str(row.get("note")),
    )


def row_to_pos_order(row, items: list[PosOrderItem]) -> PosOrder:
    created_at = _parse_datetime(_coerce_str(row.get("created_at")))
    request_ref_id_raw = row.get("request_ref_id")
    try:
        request_ref_id = int(request_ref_id_raw) if request_ref_id_raw not in ("", None) else None
    except (TypeError, ValueError):
        request_ref_id = None
    return PosOrder(
        id=int(row.get("id", 0)),
        order_no=_coerce_str(row.get("order_no")),
        order_type=_coerce_str(row.get("order_type")),
        customer_name=_coerce_str(row.get("customer_name")),
        operator_name=_coerce_str(row.get("operator_name")),
        purpose=_coerce_str(row.get("purpose")),
        request_ref_type=_coerce_str(row.get("request_ref_type")),
        request_ref_id=request_ref_id,
        subtotal=float(row.get("subtotal", 0) or 0),
        discount_total=float(row.get("discount_total", 0) or 0),
        total=float(row.get("total", 0) or 0),
        note=_coerce_str(row.get("note")),
        created_at=created_at,
        items=items,
    )


def row_to_pos_stock_movement(row) -> PosStockMovement:
    created_at = _parse_datetime(_coerce_str(row.get("created_at")))
    related_id_raw = row.get("related_id")
    try:
        related_id = int(related_id_raw) if related_id_raw not in ("", None) else None
    except (TypeError, ValueError):
        related_id = None
    return PosStockMovement(
        id=int(row.get("id", 0)),
        order_id=int(row.get("order_id", 0)),
        order_no=_coerce_str(row.get("order_no")),
        item_id=int(row.get("item_id", 0)),
        item_name=_coerce_str(row.get("item_name")),
        item_model=_coerce_str(row.get("item_model")),
        delta=int(row.get("delta", 0)),
        balance_after=int(row.get("balance_after", 0)),
        reason=_coerce_str(row.get("reason")),
        related_type=_coerce_str(row.get("related_type")),
        related_id=related_id,
        created_at=created_at,
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


@app.get("/api/items", response_model=list[InventoryItem], response_model_by_alias=False)
def get_inventory_items(include_donated: bool = False):
    rows = list_items(include_donated=include_donated)
    log_inventory_action(action="read", entity="inventory_item", detail={"count": len(rows), "mode": "list"})
    return [row_to_item(row) for row in rows]


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


@app.get("/api/issues", response_model=list[IssueRequest], response_model_by_alias=False)
def list_issue_requests_api():
    rows = list_issue_requests()
    results = []
    for row in rows:
        items = [row_to_issue_item(item) for item in list_issue_items(row["id"])]
        results.append(issue_request_row_to_model(row, items))
    log_inventory_action(action="read", entity="issue_request", detail={"count": len(results), "mode": "list"})
    return results


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
        if item.quantity <= 0:
            raise HTTPException(status_code=400, detail="quantity must be greater than 0")
    _ensure_available_item_ids([item.item_id for item in request.items])
    request_id = create_issue_request(issue_request_to_db_payload(request), [item.model_dump() for item in request.items])
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
        if item.quantity <= 0:
            raise HTTPException(status_code=400, detail="quantity must be greater than 0")
    _ensure_available_item_ids([item.item_id for item in request.items])
    updated = update_issue_request(request_id, issue_request_to_db_payload(request), [item.model_dump() for item in request.items])
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
    deleted = delete_issue_request(request_id)
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


@app.get("/api/borrows", response_model=list[BorrowRequest], response_model_by_alias=False)
def list_borrow_requests_api():
    rows = list_borrow_requests()
    results = []
    for row in rows:
        items = [row_to_borrow_item(item) for item in list_borrow_items(row["id"])]
        results.append(borrow_request_row_to_model(row, items))
    log_inventory_action(action="read", entity="borrow_request", detail={"count": len(results), "mode": "list"})
    return results


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
        if item.quantity <= 0:
            raise HTTPException(status_code=400, detail="quantity must be greater than 0")
    _ensure_available_item_ids([item.item_id for item in request.items])
    request_id = create_borrow_request(borrow_request_to_db_payload(request), [item.model_dump() for item in request.items])
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
        if item.quantity <= 0:
            raise HTTPException(status_code=400, detail="quantity must be greater than 0")
    _ensure_available_item_ids([item.item_id for item in request.items])
    updated = update_borrow_request(request_id, borrow_request_to_db_payload(request), [item.model_dump() for item in request.items])
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
    deleted = delete_borrow_request(request_id)
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


@app.get("/api/donations", response_model=list[DonationRequest], response_model_by_alias=False)
def list_donation_requests_api():
    rows = list_donation_requests()
    results = []
    for row in rows:
        items = [row_to_donation_item(item) for item in list_donation_items(row["id"])]
        results.append(donation_request_row_to_model(row, items))
    log_inventory_action(action="read", entity="donation_request", detail={"count": len(results), "mode": "list"})
    return results


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
        if item.quantity <= 0:
            raise HTTPException(status_code=400, detail="quantity must be greater than 0")
    _ensure_available_item_ids([item.item_id for item in request.items], enforce_unique=True)
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
        if item.quantity <= 0:
            raise HTTPException(status_code=400, detail="quantity must be greater than 0")
    _ensure_available_item_ids(
        [item.item_id for item in request.items],
        allow_donation_request_id=request_id,
        enforce_unique=True,
    )
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
    deleted = delete_donation_request(request_id)
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


@app.post("/api/pos/checkout", response_model=PosOrder, response_model_by_alias=False)
def checkout_pos_order_api(request: PosCheckoutRequest):
    allowed_types = {"sale", "issue", "borrow", "issue_restock", "borrow_return"}
    order_type = request.order_type.strip()
    if order_type not in allowed_types:
        raise HTTPException(status_code=400, detail="invalid order_type")
    if not request.items:
        raise HTTPException(status_code=400, detail="items is required")

    for item in request.items:
        if item.quantity <= 0:
            raise HTTPException(status_code=400, detail="quantity must be greater than 0")
        if item.unit_price < 0:
            raise HTTPException(status_code=400, detail="unit_price cannot be negative")
        if item.discount < 0:
            raise HTTPException(status_code=400, detail="discount cannot be negative")
        if item.discount > item.unit_price * item.quantity:
            raise HTTPException(status_code=400, detail="discount cannot exceed line amount")

    try:
        order_id = create_pos_order(
            pos_checkout_to_db_payload(request),
            [item.model_dump() for item in request.items],
        )
    except ValueError as exc:
        log_inventory_action(
            action="create",
            entity="pos_order",
            status="failed",
            detail={"reason": str(exc), "order_type": order_type},
        )
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    row = get_pos_order(order_id)
    if row is None:
        log_inventory_action(
            action="create",
            entity="pos_order",
            entity_id=order_id,
            status="failed",
            detail={"reason": "POS order created but cannot be loaded"},
        )
        raise HTTPException(status_code=500, detail="POS order created but cannot be loaded")
    items = [row_to_pos_item(item) for item in list_pos_order_items(order_id)]
    log_inventory_action(action="create", entity="pos_order", entity_id=order_id, detail={"order_type": order_type})
    return row_to_pos_order(row, items)


@app.get("/api/pos/orders", response_model=list[PosOrder], response_model_by_alias=False)
def list_pos_orders_api():
    rows = list_pos_orders()
    results = []
    for row in rows:
        items = [row_to_pos_item(item) for item in list_pos_order_items(int(row["id"]))]
        results.append(row_to_pos_order(row, items))
    log_inventory_action(action="read", entity="pos_order", detail={"count": len(results), "mode": "list"})
    return results


@app.get("/api/pos/orders/{order_id}", response_model=PosOrder, response_model_by_alias=False)
def get_pos_order_api(order_id: int):
    row = get_pos_order(order_id)
    if row is None:
        raise HTTPException(status_code=404, detail="POS order not found")
    items = [row_to_pos_item(item) for item in list_pos_order_items(order_id)]
    log_inventory_action(action="read", entity="pos_order", entity_id=order_id, detail={"mode": "single"})
    return row_to_pos_order(row, items)


@app.get("/api/pos/stock", response_model=list[PosStockBalance], response_model_by_alias=False)
def list_pos_stock_api():
    rows = list_stock_balances()
    return [PosStockBalance(**row) for row in rows]


@app.put("/api/pos/stock/{item_id}", response_model=PosStockBalance, response_model_by_alias=False)
def set_pos_stock_api(item_id: int, request: PosStockSetRequest):
    try:
        updated = set_stock_quantity(item_id=item_id, quantity=request.quantity)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not updated:
        raise HTTPException(status_code=404, detail="item not found")
    row = next((stock for stock in list_stock_balances() if stock["item_id"] == item_id), None)
    if row is None:
        raise HTTPException(status_code=500, detail="stock updated but cannot be loaded")
    log_inventory_action(action="update", entity="stock_balance", entity_id=item_id, detail={"quantity": request.quantity})
    return PosStockBalance(**row)


@app.get("/api/pos/stock-movements", response_model=list[PosStockMovement], response_model_by_alias=False)
def list_pos_stock_movements_api(limit: int = 200):
    rows = list_stock_movements(limit=limit)
    log_inventory_action(action="read", entity="stock_movement", detail={"count": len(rows), "mode": "list", "limit": limit})
    return [row_to_pos_stock_movement(row) for row in rows]


@app.post("/api/items/import", response_model=ImportResponse)
async def import_inventory_items_from_xlsx(
    file: UploadFile = File(...),
    kind: str = Form(...),
):
    if not file.filename or not file.filename.lower().endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Only .xlsx files are supported")

    selected_kind = kind.strip()
    if not selected_kind:
        raise HTTPException(status_code=400, detail="kind is required")

    content = await file.read()
    result = import_inventory_items_from_xlsx_content(
        file_content=content,
        item_create_model=InventoryItemCreate,
        selected_kind=selected_kind,
        to_db_payload=to_db_payload,
        create_item=create_item,
        create_items_bulk=create_items_bulk,
    )
    log_inventory_action(
        action="import",
        entity="inventory_item",
        detail={
            "filename": file.filename,
            "kind": selected_kind,
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
