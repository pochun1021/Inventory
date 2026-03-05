from datetime import date, datetime
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from db import (
    create_item,
    delete_item,
    get_item_by_id,
    get_items_count,
    init_db,
    list_items,
    log_inventory_action,
    purge_soft_deleted_items,
    update_item,
)
from xlsx_import import import_inventory_items_from_xlsx_content


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


def row_to_item(row) -> InventoryItem:
    purchase_date_value = row["purchase_date"]
    parsed_date = _parse_purchase_date(purchase_date_value) if purchase_date_value else None
    return InventoryItem(
        id=row["id"],
        kind=row["kind"],
        specification=row["specification"],
        property_number=row["property_number"],
        name=row["name"],
        model=row["model"],
        unit=row["unit"],
        purchase_date=parsed_date,
        location=row["location"],
        memo=row["memo"],
        keeper=row["keeper"],
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


@app.get("/{full_path:path}")
def serve_frontend(full_path: str):
    frontend_asset = _resolve_frontend_asset(full_path)
    if frontend_asset is not None:
        return FileResponse(frontend_asset)

    frontend_index = _resolve_frontend_index()
    if frontend_index is not None:
        return FileResponse(frontend_index)

    raise HTTPException(status_code=404, detail="Frontend index.html not found")


@app.get("/api/data")
def get_dashboard_data():
    return {"status": "success", "data": "這是管理系統的後端數據", "items": get_items_count()}


@app.get("/api/items", response_model=list[InventoryItem])
def get_inventory_items():
    rows = list_items()
    log_inventory_action(action="read", entity="inventory_item", detail={"count": len(rows), "mode": "list"})
    return [row_to_item(row) for row in rows]


@app.post("/api/items", response_model=InventoryItem)
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


@app.put("/api/items/{item_id}", response_model=InventoryItem)
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
