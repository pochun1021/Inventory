from datetime import date
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from db import init_db, get_items_count, list_items, get_item_by_id, create_item, update_item, get_order_sn

app = FastAPI()

# 允許前端跨域存取
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class InventoryItemCreate(BaseModel):
    note: str = Field(default="", alias="備註")
    specification: str = Field(default="", alias="規格(大小/容量)")
    property_number: str = Field(default="", alias="財產編號")
    name: str = Field(default="", alias="品名")
    model: str = Field(default="", alias="型號")
    unit: str = Field(default="", alias="單位")
    purchase_date: date | None = Field(default=None, alias="購置日期")
    location: str = Field(default="", alias="放置地點")
    custodian_unit: str = Field(default="", alias="保管人（單位）")

    model_config = {
        "populate_by_name": True,
    }


class InventoryItem(InventoryItemCreate):
    id: int


def to_db_payload(item: InventoryItemCreate) -> dict:
    return item.model_dump()

def row_to_item(row) -> InventoryItem:
    return InventoryItem(
        id=row['id'],
        kind=row['kind'],
        specification=row['specification'],
        property_number=row['property_number'],
        name=row['name'],
        model=row['model'],
        unit=row['unit'],
        purchase_date=row['purchase_date'],
        location=row['location'],
        memo=row['memo'],
        keeper=row['keeper'],
    )


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/api/data")
def get_dashboard_data():
    return {"status": "success", "data": "這是管理系統的後端數據", "items": get_items_count()}

@app.get("/api/items", response_model=list[InventoryItem])
def get_inventory_items():
    rows = list_items()
    return [row_to_item(row) for row in rows]


@app.post("/api/items", response_model=InventoryItem)
def create_inventory_item_api(item: InventoryItemCreate):
    item_data = to_db_payload(item)
    item_id = create_item(item_data)
    return InventoryItem(id=item_id, **item.model_dump())


@app.put("/api/items/{item_id}", response_model=InventoryItem)
def update_inventory_item_api(item_id: int, item: InventoryItemCreate):
    item_data = to_db_payload(item)
    updated = update_item(item_id, item_data)
    if not updated:
        raise HTTPException(status_code=404, detail="Item not found")

    row = get_item_by_id(item_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Item not found")

    return row_to_item(row)
