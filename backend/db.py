from __future__ import annotations

import json
from contextlib import contextmanager
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from filelock import FileLock
from openpyxl import Workbook, load_workbook

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "inventory.xlsx"
LOCK_PATH = BASE_DIR / "inventory.xlsx.lock"

SHEETS: dict[str, list[str]] = {
    "inventory_items": [
        "id",
        "kind",
        "property_number",
        "name",
        "model",
        "specification",
        "unit",
        "purchase_date",
        "location",
        "memo",
        "keeper",
        "deleted_at",
        "donated_at",
        "donation_request_id",
    ],
    "order_sn": [
        "name",
        "current_value",
    ],
    "operation_logs": [
        "id",
        "action",
        "entity",
        "entity_id",
        "status",
        "detail",
        "created_at",
    ],
    "issue_requests": [
        "id",
        "requester",
        "department",
        "purpose",
        "request_date",
        "memo",
        "created_at",
    ],
    "issue_items": [
        "id",
        "request_id",
        "item_id",
        "quantity",
        "note",
    ],
    "borrow_requests": [
        "id",
        "borrower",
        "department",
        "purpose",
        "borrow_date",
        "due_date",
        "return_date",
        "status",
        "memo",
        "created_at",
    ],
    "borrow_items": [
        "id",
        "request_id",
        "item_id",
        "quantity",
        "note",
    ],
    "donation_requests": [
        "id",
        "donor",
        "department",
        "recipient",
        "purpose",
        "donation_date",
        "memo",
        "created_at",
    ],
    "donation_items": [
        "id",
        "request_id",
        "item_id",
        "quantity",
        "note",
    ],
    "pos_orders": [
        "id",
        "order_no",
        "order_type",
        "customer_name",
        "operator_name",
        "purpose",
        "request_ref_type",
        "request_ref_id",
        "subtotal",
        "discount_total",
        "total",
        "note",
        "created_at",
    ],
    "pos_order_items": [
        "id",
        "order_id",
        "item_id",
        "item_name",
        "item_model",
        "quantity",
        "unit_price",
        "discount",
        "line_total",
        "note",
    ],
    "stock_balances": [
        "item_id",
        "quantity",
        "updated_at",
    ],
    "stock_movements": [
        "id",
        "order_id",
        "order_no",
        "item_id",
        "delta",
        "balance_after",
        "reason",
        "related_type",
        "related_id",
        "created_at",
    ],
}

STRING_FIELDS: dict[str, list[str]] = {
    "issue_requests": ["requester", "department", "purpose", "request_date", "memo", "created_at"],
    "issue_items": ["note"],
    "borrow_requests": [
        "borrower",
        "department",
        "purpose",
        "borrow_date",
        "due_date",
        "return_date",
        "status",
        "memo",
        "created_at",
    ],
    "borrow_items": ["note"],
    "donation_requests": [
        "donor",
        "department",
        "recipient",
        "purpose",
        "donation_date",
        "memo",
        "created_at",
    ],
    "donation_items": ["note"],
    "pos_orders": [
        "order_no",
        "order_type",
        "customer_name",
        "operator_name",
        "purpose",
        "request_ref_type",
        "note",
        "created_at",
    ],
    "pos_order_items": ["item_name", "item_model", "note"],
    "stock_movements": ["order_no", "reason", "related_type", "created_at"],
}


def _now_str() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _date_sn() -> str:
    return datetime.now().strftime("%Y%m%d")


def _to_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _to_str(value: Any, default: str = "") -> str:
    if value is None:
        return default
    return value if isinstance(value, str) else str(value)


def _is_blank(value: Any) -> bool:
    return value is None or str(value).strip() == ""


def _has_cjk(value: Any) -> bool:
    if value is None:
        return False
    return any("\u4e00" <= char <= "\u9fff" for char in str(value))


@contextmanager
def _locked_workbook():
    lock = FileLock(str(LOCK_PATH))
    with lock:
        wb = _load_workbook()
        yield wb


def _create_workbook() -> Workbook:
    wb = Workbook()
    default_sheet = wb.active
    wb.remove(default_sheet)

    for sheet_name, headers in SHEETS.items():
        ws = wb.create_sheet(title=sheet_name)
        ws.append(headers)

    _seed_order_sn(wb["order_sn"])
    return wb


def _seed_order_sn(ws) -> bool:
    existing = {str(row[0]).strip() for row in ws.iter_rows(min_row=2, values_only=True) if row and row[0]}
    added = False
    for name in ("asset", "item", "other"):
        if name not in existing:
            ws.append([name, 0])
            added = True
    return added


def _ensure_sheet(wb: Workbook, sheet_name: str, headers: list[str]) -> bool:
    changed = False
    if sheet_name not in wb.sheetnames:
        ws = wb.create_sheet(title=sheet_name)
        ws.append(headers)
        return True

    ws = wb[sheet_name]
    existing_headers = [cell.value for cell in ws[1]] if ws.max_row >= 1 else []
    if existing_headers != headers:
        rows = _read_rows(ws, existing_headers)
        ws.delete_rows(1, ws.max_row or 1)
        ws.append(headers)
        for row in rows:
            ws.append([row.get(header, "") for header in headers])
        changed = True

    if sheet_name == "order_sn":
        if _seed_order_sn(ws):
            changed = True

    return changed


def _normalize_string_fields(wb: Workbook, sheet_name: str, headers: list[str]) -> bool:
    string_fields = STRING_FIELDS.get(sheet_name)
    if not string_fields:
        return False

    ws = wb[sheet_name]
    rows = _read_rows(ws, headers)
    changed = False
    for row in rows:
        for field in string_fields:
            if row.get(field) is None:
                row[field] = ""
                changed = True

    if changed:
        _write_rows(ws, headers, rows)
    return changed


def _ensure_workbook(wb: Workbook) -> bool:
    changed = False
    for sheet_name, headers in SHEETS.items():
        if _ensure_sheet(wb, sheet_name, headers):
            changed = True
        if _normalize_string_fields(wb, sheet_name, headers):
            changed = True
    return changed


def _load_workbook() -> Workbook:
    if not DB_PATH.exists():
        wb = _create_workbook()
        wb.save(DB_PATH)
        return wb

    wb = load_workbook(DB_PATH)
    if _ensure_workbook(wb):
        wb.save(DB_PATH)
    return wb


def _read_rows(ws, headers: list[str] | None = None) -> list[dict[str, Any]]:
    if headers is None:
        headers = [cell.value for cell in ws[1]] if ws.max_row >= 1 else []
    rows: list[dict[str, Any]] = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        if not row:
            continue
        values = {headers[idx]: row[idx] if idx < len(row) else None for idx in range(len(headers))}
        if all(_is_blank(value) for value in values.values()):
            continue
        rows.append(values)
    return rows


def _write_rows(ws, headers: list[str], rows: list[dict[str, Any]]) -> None:
    ws.delete_rows(1, ws.max_row or 1)
    ws.append(headers)
    for row in rows:
        ws.append([row.get(header, "") for header in headers])


def _next_id(rows: list[dict[str, Any]]) -> int:
    max_id = 0
    for row in rows:
        max_id = max(max_id, _to_int(row.get("id")))
    return max_id + 1


def init_db() -> None:
    with _locked_workbook() as wb:
        if _ensure_workbook(wb):
            wb.save(DB_PATH)


def get_items_count() -> int:
    with _locked_workbook() as wb:
        rows = _read_rows(wb["inventory_items"])
    return sum(1 for row in rows if _is_blank(row.get("deleted_at")))


def get_pending_fix_count() -> int:
    with _locked_workbook() as wb:
        rows = _read_rows(wb["inventory_items"])
    return sum(
        1
        for row in rows
        if _is_blank(row.get("deleted_at"))
        and (
            _is_blank(str(row.get("property_number", "")).strip())
            or _has_cjk(row.get("property_number"))
        )
    )


def list_items(*, include_donated: bool = False) -> list[dict[str, Any]]:
    with _locked_workbook() as wb:
        rows = _read_rows(wb["inventory_items"])
    results = [
        {
            "id": row.get("id"),
            "kind": row.get("kind", ""),
            "specification": row.get("specification", ""),
            "property_number": row.get("property_number", ""),
            "name": row.get("name", ""),
            "model": row.get("model", ""),
            "unit": row.get("unit", ""),
            "purchase_date": row.get("purchase_date", ""),
            "location": row.get("location", ""),
            "keeper": row.get("keeper", ""),
            "memo": row.get("memo", ""),
            "donated_at": row.get("donated_at", ""),
            "donation_request_id": row.get("donation_request_id", ""),
            "deleted_at": row.get("deleted_at", ""),
        }
        for row in rows
        if _is_blank(row.get("deleted_at"))
        and (include_donated or _is_blank(row.get("donated_at")))
    ]
    return sorted(results, key=lambda row: _to_int(row.get("id")), reverse=True)


def get_item_by_id(item_id: int) -> dict[str, Any] | None:
    with _locked_workbook() as wb:
        rows = _read_rows(wb["inventory_items"])
    for row in rows:
        if _to_int(row.get("id")) == item_id and _is_blank(row.get("deleted_at")):
            return {
                "id": row.get("id"),
                "kind": row.get("kind", ""),
                "specification": row.get("specification", ""),
                "property_number": row.get("property_number", ""),
                "name": row.get("name", ""),
                "model": row.get("model", ""),
                "unit": row.get("unit", ""),
                "purchase_date": row.get("purchase_date", ""),
                "location": row.get("location", ""),
                "keeper": row.get("keeper", ""),
                "memo": row.get("memo", ""),
                "donated_at": row.get("donated_at", ""),
                "donation_request_id": row.get("donation_request_id", ""),
            }
    return None


def create_item(item_data: dict[str, Any]) -> int:
    property_number = str(item_data.get("property_number", "")).strip()
    if not property_number:
        order_sn_name = item_data.get("kind") if item_data.get("kind") in {"asset", "item", "other"} else "other"
        order_sn_row = get_order_sn(order_sn_name)
        if order_sn_row is not None:
            property_number = order_sn_row["tmp_no"]

    with _locked_workbook() as wb:
        ws = wb["inventory_items"]
        rows = _read_rows(ws)
        new_id = _next_id(rows)
        rows.append(
            {
                "id": new_id,
                "kind": item_data["kind"],
                "specification": item_data["specification"],
                "property_number": item_data["property_number"],
                "name": item_data["name"],
                "model": item_data["model"],
                "unit": item_data["unit"],
                "purchase_date": item_data["purchase_date"],
                "location": item_data["location"],
                "keeper": item_data["keeper"],
                "memo": item_data["memo"],
                "deleted_at": "",
                "donated_at": "",
                "donation_request_id": "",
            }
        )
        _write_rows(ws, SHEETS["inventory_items"], rows)
        wb.save(DB_PATH)
        return new_id


def create_items_bulk(items: list[dict[str, Any]]) -> int:
    if not items:
        return 0

    with _locked_workbook() as wb:
        inventory_ws = wb["inventory_items"]
        order_ws = wb["order_sn"]
        inventory_rows = _read_rows(inventory_ws)
        order_rows = _read_rows(order_ws)

        order_map = {
            str(row.get("name", "")).strip(): row
            for row in order_rows
            if not _is_blank(row.get("name"))
        }
        for name in ("asset", "item", "other"):
            order_map.setdefault(name, {"name": name, "current_value": 0})

        next_id = _next_id(inventory_rows)
        created = 0

        for item_data in items:
            property_number = str(item_data.get("property_number", "")).strip()
            if not property_number:
                order_sn_name = (
                    item_data.get("kind")
                    if item_data.get("kind") in {"asset", "item", "other"}
                    else "other"
                )
                order_row = order_map.get(order_sn_name)
                current_value = _to_int(order_row.get("current_value")) + 1
                order_row["current_value"] = current_value
                property_number = f"tmp-{_date_sn()}-{current_value:04d}"

            inventory_rows.append(
                {
                    "id": next_id,
                    "kind": item_data["kind"],
                    "specification": item_data["specification"],
                    "property_number": property_number,
                    "name": item_data["name"],
                    "model": item_data["model"],
                    "unit": item_data["unit"],
                    "purchase_date": item_data["purchase_date"],
                    "location": item_data["location"],
                    "keeper": item_data["keeper"],
                    "memo": item_data["memo"],
                    "deleted_at": "",
                    "donated_at": "",
                    "donation_request_id": "",
                }
            )
            next_id += 1
            created += 1

        _write_rows(inventory_ws, SHEETS["inventory_items"], inventory_rows)
        _write_rows(order_ws, SHEETS["order_sn"], list(order_map.values()))
        wb.save(DB_PATH)
        return created


def update_item(item_id: int, item_data: dict[str, Any]) -> bool:
    with _locked_workbook() as wb:
        ws = wb["inventory_items"]
        rows = _read_rows(ws)
        updated = False
        for row in rows:
            if _to_int(row.get("id")) == item_id and _is_blank(row.get("deleted_at")):
                row.update(
                    {
                        "kind": item_data["kind"],
                        "specification": item_data["specification"],
                        "property_number": item_data["property_number"],
                        "name": item_data["name"],
                        "model": item_data["model"],
                        "unit": item_data["unit"],
                        "purchase_date": item_data["purchase_date"],
                        "location": item_data["location"],
                        "keeper": item_data["keeper"],
                        "memo": item_data["memo"],
                    }
                )
                updated = True
                break
        if updated:
            _write_rows(ws, SHEETS["inventory_items"], rows)
            wb.save(DB_PATH)
        return updated


def delete_item(item_id: int) -> bool:
    with _locked_workbook() as wb:
        ws = wb["inventory_items"]
        rows = _read_rows(ws)
        deleted = False
        for row in rows:
            if _to_int(row.get("id")) == item_id and _is_blank(row.get("deleted_at")):
                row["deleted_at"] = _now_str()
                deleted = True
                break
        if deleted:
            _write_rows(ws, SHEETS["inventory_items"], rows)
            wb.save(DB_PATH)
        return deleted


def purge_soft_deleted_items() -> int:
    cutoff = datetime.now() - timedelta(days=180)
    with _locked_workbook() as wb:
        ws = wb["inventory_items"]
        rows = _read_rows(ws)
        kept: list[dict[str, Any]] = []
        deleted_count = 0
        for row in rows:
            deleted_at = row.get("deleted_at")
            if _is_blank(deleted_at):
                kept.append(row)
                continue
            try:
                deleted_time = datetime.strptime(str(deleted_at), "%Y-%m-%d %H:%M:%S")
            except ValueError:
                kept.append(row)
                continue
            if deleted_time <= cutoff:
                deleted_count += 1
            else:
                kept.append(row)
        if deleted_count:
            _write_rows(ws, SHEETS["inventory_items"], kept)
            wb.save(DB_PATH)
        return deleted_count


def log_inventory_action(
    action: str,
    *,
    entity: str = "inventory_item",
    entity_id: int | None = None,
    status: str = "success",
    detail: dict[str, Any] | None = None,
) -> None:
    serialized_detail = json.dumps(detail or {}, ensure_ascii=False)
    with _locked_workbook() as wb:
        ws = wb["operation_logs"]
        rows = _read_rows(ws)
        new_id = _next_id(rows)
        rows.append(
            {
                "id": new_id,
                "action": action,
                "entity": entity,
                "entity_id": entity_id if entity_id is not None else "",
                "status": status,
                "detail": serialized_detail,
                "created_at": _now_str(),
            }
        )
        _write_rows(ws, SHEETS["operation_logs"], rows)
        wb.save(DB_PATH)


def get_order_sn(name: str) -> dict[str, Any] | None:
    with _locked_workbook() as wb:
        ws = wb["order_sn"]
        rows = _read_rows(ws)
        for row in rows:
            if str(row.get("name", "")).strip() == name:
                current_value = _to_int(row.get("current_value")) + 1
                row["current_value"] = current_value
                tmp_no = f"tmp-{_date_sn()}-{current_value:04d}"
                _write_rows(ws, SHEETS["order_sn"], rows)
                wb.save(DB_PATH)
                return {"tmp_no": tmp_no}
        return None


def validate_item_ids_available(
    item_ids: list[int],
    *,
    allow_donation_request_id: int | None = None,
    enforce_unique: bool = False,
) -> tuple[bool, str | None]:
    with _locked_workbook() as wb:
        inventory_rows = _read_rows(wb["inventory_items"])

    if enforce_unique and len(item_ids) != len(set(item_ids)):
        return False, "item_id cannot be duplicated"

    inventory_map = {_to_int(row.get("id")): row for row in inventory_rows if _is_blank(row.get("deleted_at"))}
    for item_id in item_ids:
        row = inventory_map.get(item_id)
        if row is None:
            return False, f"item_id {item_id} not found"
        donated_at = row.get("donated_at")
        donation_request_id = _to_int(row.get("donation_request_id"))
        if _is_blank(donated_at):
            continue
        if allow_donation_request_id is not None and donation_request_id == allow_donation_request_id:
            continue
        return False, f"item_id {item_id} is already donated"

    return True, None


def create_issue_request(request_data: dict[str, Any], items: list[dict[str, Any]]) -> int:
    with _locked_workbook() as wb:
        request_ws = wb["issue_requests"]
        item_ws = wb["issue_items"]
        request_rows = _read_rows(request_ws)
        item_rows = _read_rows(item_ws)
        request_id = _next_id(request_rows)
        request_rows.append(
            {
                "id": request_id,
                "requester": request_data["requester"],
                "department": request_data["department"],
                "purpose": request_data["purpose"],
                "request_date": request_data["request_date"],
                "memo": request_data["memo"],
                "created_at": _now_str(),
            }
        )
        next_item_id = _next_id(item_rows)
        for index, item in enumerate(items):
            item_rows.append(
                {
                    "id": next_item_id + index,
                    "request_id": request_id,
                    "item_id": item["item_id"],
                    "quantity": item["quantity"],
                    "note": item.get("note", ""),
                }
            )
        _write_rows(request_ws, SHEETS["issue_requests"], request_rows)
        _write_rows(item_ws, SHEETS["issue_items"], item_rows)
        wb.save(DB_PATH)
        return request_id


def list_issue_requests() -> list[dict[str, Any]]:
    with _locked_workbook() as wb:
        rows = _read_rows(wb["issue_requests"])
    return sorted(rows, key=lambda row: _to_int(row.get("id")), reverse=True)


def get_issue_request(request_id: int) -> dict[str, Any] | None:
    with _locked_workbook() as wb:
        rows = _read_rows(wb["issue_requests"])
    for row in rows:
        if _to_int(row.get("id")) == request_id:
            return row
    return None


def list_issue_items(request_id: int) -> list[dict[str, Any]]:
    with _locked_workbook() as wb:
        item_rows = _read_rows(wb["issue_items"])
        inventory_rows = _read_rows(wb["inventory_items"])
    inventory_map = {
        _to_int(row.get("id")): {
            "item_name": row.get("name", ""),
            "item_model": row.get("model", ""),
        }
        for row in inventory_rows
        if _is_blank(row.get("deleted_at"))
    }
    results = []
    for row in item_rows:
        if _to_int(row.get("request_id")) != request_id:
            continue
        details = inventory_map.get(_to_int(row.get("item_id")), {"item_name": None, "item_model": None})
        results.append(
            {
                "id": row.get("id"),
                "request_id": row.get("request_id"),
                "item_id": row.get("item_id"),
                "quantity": row.get("quantity"),
                "note": row.get("note", ""),
                "item_name": details.get("item_name"),
                "item_model": details.get("item_model"),
            }
        )
    return sorted(results, key=lambda row: _to_int(row.get("id")))


def update_issue_request(request_id: int, request_data: dict[str, Any], items: list[dict[str, Any]]) -> bool:
    with _locked_workbook() as wb:
        request_ws = wb["issue_requests"]
        item_ws = wb["issue_items"]
        request_rows = _read_rows(request_ws)
        item_rows = _read_rows(item_ws)
        updated = False
        for row in request_rows:
            if _to_int(row.get("id")) == request_id:
                row.update(
                    {
                        "requester": request_data["requester"],
                        "department": request_data["department"],
                        "purpose": request_data["purpose"],
                        "request_date": request_data["request_date"],
                        "memo": request_data["memo"],
                    }
                )
                updated = True
                break
        if not updated:
            return False

        item_rows = [row for row in item_rows if _to_int(row.get("request_id")) != request_id]
        next_item_id = _next_id(item_rows)
        for index, item in enumerate(items):
            item_rows.append(
                {
                    "id": next_item_id + index,
                    "request_id": request_id,
                    "item_id": item["item_id"],
                    "quantity": item["quantity"],
                    "note": item.get("note", ""),
                }
            )
        _write_rows(request_ws, SHEETS["issue_requests"], request_rows)
        _write_rows(item_ws, SHEETS["issue_items"], item_rows)
        wb.save(DB_PATH)
        return True


def delete_issue_request(request_id: int) -> bool:
    with _locked_workbook() as wb:
        request_ws = wb["issue_requests"]
        item_ws = wb["issue_items"]
        request_rows = _read_rows(request_ws)
        item_rows = _read_rows(item_ws)
        remaining_requests = [row for row in request_rows if _to_int(row.get("id")) != request_id]
        deleted = len(remaining_requests) != len(request_rows)
        if not deleted:
            return False
        remaining_items = [row for row in item_rows if _to_int(row.get("request_id")) != request_id]
        _write_rows(request_ws, SHEETS["issue_requests"], remaining_requests)
        _write_rows(item_ws, SHEETS["issue_items"], remaining_items)
        wb.save(DB_PATH)
        return True


def create_donation_request(request_data: dict[str, Any], items: list[dict[str, Any]]) -> int:
    with _locked_workbook() as wb:
        request_ws = wb["donation_requests"]
        item_ws = wb["donation_items"]
        inventory_ws = wb["inventory_items"]
        request_rows = _read_rows(request_ws)
        item_rows = _read_rows(item_ws)
        inventory_rows = _read_rows(inventory_ws)

        selected_item_ids = [_to_int(item.get("item_id")) for item in items]
        if len(selected_item_ids) != len(set(selected_item_ids)):
            raise ValueError("item_id cannot be duplicated")

        inventory_map = {_to_int(row.get("id")): row for row in inventory_rows if _is_blank(row.get("deleted_at"))}
        for item_id in selected_item_ids:
            row = inventory_map.get(item_id)
            if row is None:
                raise ValueError(f"item_id {item_id} not found")
            if not _is_blank(row.get("donated_at")):
                raise ValueError(f"item_id {item_id} is already donated")

        request_id = _next_id(request_rows)
        request_rows.append(
            {
                "id": request_id,
                "donor": request_data["donor"],
                "department": request_data["department"],
                "recipient": request_data["recipient"],
                "purpose": request_data["purpose"],
                "donation_date": request_data["donation_date"],
                "memo": request_data["memo"],
                "created_at": _now_str(),
            }
        )

        next_item_id = _next_id(item_rows)
        for index, item in enumerate(items):
            item_rows.append(
                {
                    "id": next_item_id + index,
                    "request_id": request_id,
                    "item_id": item["item_id"],
                    "quantity": item["quantity"],
                    "note": item.get("note", ""),
                }
            )

        marked_item_ids = set(selected_item_ids)
        now = _now_str()
        for row in inventory_rows:
            if _to_int(row.get("id")) in marked_item_ids and _is_blank(row.get("deleted_at")):
                row["donated_at"] = now
                row["donation_request_id"] = request_id

        _write_rows(request_ws, SHEETS["donation_requests"], request_rows)
        _write_rows(item_ws, SHEETS["donation_items"], item_rows)
        _write_rows(inventory_ws, SHEETS["inventory_items"], inventory_rows)
        wb.save(DB_PATH)
        return request_id


def list_donation_requests() -> list[dict[str, Any]]:
    with _locked_workbook() as wb:
        rows = _read_rows(wb["donation_requests"])
    return sorted(rows, key=lambda row: _to_int(row.get("id")), reverse=True)


def get_donation_request(request_id: int) -> dict[str, Any] | None:
    with _locked_workbook() as wb:
        rows = _read_rows(wb["donation_requests"])
    for row in rows:
        if _to_int(row.get("id")) == request_id:
            return row
    return None


def list_donation_items(request_id: int) -> list[dict[str, Any]]:
    with _locked_workbook() as wb:
        item_rows = _read_rows(wb["donation_items"])
        inventory_rows = _read_rows(wb["inventory_items"])
    inventory_map = {
        _to_int(row.get("id")): {
            "item_name": row.get("name", ""),
            "item_model": row.get("model", ""),
        }
        for row in inventory_rows
        if _is_blank(row.get("deleted_at"))
    }
    results = []
    for row in item_rows:
        if _to_int(row.get("request_id")) != request_id:
            continue
        details = inventory_map.get(_to_int(row.get("item_id")), {"item_name": None, "item_model": None})
        results.append(
            {
                "id": row.get("id"),
                "request_id": row.get("request_id"),
                "item_id": row.get("item_id"),
                "quantity": row.get("quantity"),
                "note": row.get("note", ""),
                "item_name": details.get("item_name"),
                "item_model": details.get("item_model"),
            }
        )
    return sorted(results, key=lambda row: _to_int(row.get("id")))


def update_donation_request(request_id: int, request_data: dict[str, Any], items: list[dict[str, Any]]) -> bool:
    with _locked_workbook() as wb:
        request_ws = wb["donation_requests"]
        item_ws = wb["donation_items"]
        inventory_ws = wb["inventory_items"]
        request_rows = _read_rows(request_ws)
        item_rows = _read_rows(item_ws)
        inventory_rows = _read_rows(inventory_ws)

        request_row = None
        for row in request_rows:
            if _to_int(row.get("id")) == request_id:
                request_row = row
                break
        if request_row is None:
            return False

        selected_item_ids = [_to_int(item.get("item_id")) for item in items]
        if len(selected_item_ids) != len(set(selected_item_ids)):
            raise ValueError("item_id cannot be duplicated")

        inventory_map = {_to_int(row.get("id")): row for row in inventory_rows if _is_blank(row.get("deleted_at"))}
        for item_id in selected_item_ids:
            row = inventory_map.get(item_id)
            if row is None:
                raise ValueError(f"item_id {item_id} not found")
            donated_at = row.get("donated_at")
            donation_request_id = _to_int(row.get("donation_request_id"))
            if _is_blank(donated_at):
                continue
            if donation_request_id != request_id:
                raise ValueError(f"item_id {item_id} is already donated")

        old_item_ids = {
            _to_int(row.get("item_id"))
            for row in item_rows
            if _to_int(row.get("request_id")) == request_id
        }
        for row in inventory_rows:
            item_id = _to_int(row.get("id"))
            if item_id not in old_item_ids or not _is_blank(row.get("deleted_at")):
                continue
            if _to_int(row.get("donation_request_id")) == request_id:
                row["donated_at"] = ""
                row["donation_request_id"] = ""

        request_row.update(
            {
                "donor": request_data["donor"],
                "department": request_data["department"],
                "recipient": request_data["recipient"],
                "purpose": request_data["purpose"],
                "donation_date": request_data["donation_date"],
                "memo": request_data["memo"],
            }
        )

        item_rows = [row for row in item_rows if _to_int(row.get("request_id")) != request_id]
        next_item_id = _next_id(item_rows)
        for index, item in enumerate(items):
            item_rows.append(
                {
                    "id": next_item_id + index,
                    "request_id": request_id,
                    "item_id": item["item_id"],
                    "quantity": item["quantity"],
                    "note": item.get("note", ""),
                }
            )

        now = _now_str()
        marked_item_ids = set(selected_item_ids)
        for row in inventory_rows:
            if _to_int(row.get("id")) in marked_item_ids and _is_blank(row.get("deleted_at")):
                row["donated_at"] = now
                row["donation_request_id"] = request_id

        _write_rows(request_ws, SHEETS["donation_requests"], request_rows)
        _write_rows(item_ws, SHEETS["donation_items"], item_rows)
        _write_rows(inventory_ws, SHEETS["inventory_items"], inventory_rows)
        wb.save(DB_PATH)
        return True


def delete_donation_request(request_id: int) -> bool:
    with _locked_workbook() as wb:
        request_ws = wb["donation_requests"]
        item_ws = wb["donation_items"]
        inventory_ws = wb["inventory_items"]
        request_rows = _read_rows(request_ws)
        item_rows = _read_rows(item_ws)
        inventory_rows = _read_rows(inventory_ws)

        remaining_requests = [row for row in request_rows if _to_int(row.get("id")) != request_id]
        deleted = len(remaining_requests) != len(request_rows)
        if not deleted:
            return False

        removed_item_ids = {
            _to_int(row.get("item_id"))
            for row in item_rows
            if _to_int(row.get("request_id")) == request_id
        }
        remaining_items = [row for row in item_rows if _to_int(row.get("request_id")) != request_id]

        for row in inventory_rows:
            if _to_int(row.get("id")) not in removed_item_ids:
                continue
            if _to_int(row.get("donation_request_id")) == request_id:
                row["donated_at"] = ""
                row["donation_request_id"] = ""

        _write_rows(request_ws, SHEETS["donation_requests"], remaining_requests)
        _write_rows(item_ws, SHEETS["donation_items"], remaining_items)
        _write_rows(inventory_ws, SHEETS["inventory_items"], inventory_rows)
        wb.save(DB_PATH)
        return True


def create_borrow_request(request_data: dict[str, Any], items: list[dict[str, Any]]) -> int:
    with _locked_workbook() as wb:
        request_ws = wb["borrow_requests"]
        item_ws = wb["borrow_items"]
        request_rows = _read_rows(request_ws)
        item_rows = _read_rows(item_ws)
        request_id = _next_id(request_rows)
        request_rows.append(
            {
                "id": request_id,
                "borrower": request_data["borrower"],
                "department": request_data["department"],
                "purpose": request_data["purpose"],
                "borrow_date": request_data["borrow_date"],
                "due_date": request_data["due_date"],
                "return_date": request_data["return_date"],
                "status": request_data["status"],
                "memo": request_data["memo"],
                "created_at": _now_str(),
            }
        )
        next_item_id = _next_id(item_rows)
        for index, item in enumerate(items):
            item_rows.append(
                {
                    "id": next_item_id + index,
                    "request_id": request_id,
                    "item_id": item["item_id"],
                    "quantity": item["quantity"],
                    "note": item.get("note", ""),
                }
            )
        _write_rows(request_ws, SHEETS["borrow_requests"], request_rows)
        _write_rows(item_ws, SHEETS["borrow_items"], item_rows)
        wb.save(DB_PATH)
        return request_id


def list_borrow_requests() -> list[dict[str, Any]]:
    with _locked_workbook() as wb:
        rows = _read_rows(wb["borrow_requests"])
    return sorted(rows, key=lambda row: _to_int(row.get("id")), reverse=True)


def get_borrow_request(request_id: int) -> dict[str, Any] | None:
    with _locked_workbook() as wb:
        rows = _read_rows(wb["borrow_requests"])
    for row in rows:
        if _to_int(row.get("id")) == request_id:
            return row
    return None


def list_borrow_items(request_id: int) -> list[dict[str, Any]]:
    with _locked_workbook() as wb:
        item_rows = _read_rows(wb["borrow_items"])
        inventory_rows = _read_rows(wb["inventory_items"])
    inventory_map = {
        _to_int(row.get("id")): {
            "item_name": row.get("name", ""),
            "item_model": row.get("model", ""),
        }
        for row in inventory_rows
        if _is_blank(row.get("deleted_at"))
    }
    results = []
    for row in item_rows:
        if _to_int(row.get("request_id")) != request_id:
            continue
        details = inventory_map.get(_to_int(row.get("item_id")), {"item_name": None, "item_model": None})
        results.append(
            {
                "id": row.get("id"),
                "request_id": row.get("request_id"),
                "item_id": row.get("item_id"),
                "quantity": row.get("quantity"),
                "note": row.get("note", ""),
                "item_name": details.get("item_name"),
                "item_model": details.get("item_model"),
            }
        )
    return sorted(results, key=lambda row: _to_int(row.get("id")))


def update_borrow_request(request_id: int, request_data: dict[str, Any], items: list[dict[str, Any]]) -> bool:
    with _locked_workbook() as wb:
        request_ws = wb["borrow_requests"]
        item_ws = wb["borrow_items"]
        request_rows = _read_rows(request_ws)
        item_rows = _read_rows(item_ws)
        updated = False
        for row in request_rows:
            if _to_int(row.get("id")) == request_id:
                row.update(
                    {
                        "borrower": request_data["borrower"],
                        "department": request_data["department"],
                        "purpose": request_data["purpose"],
                        "borrow_date": request_data["borrow_date"],
                        "due_date": request_data["due_date"],
                        "return_date": request_data["return_date"],
                        "status": request_data["status"],
                        "memo": request_data["memo"],
                    }
                )
                updated = True
                break
        if not updated:
            return False

        item_rows = [row for row in item_rows if _to_int(row.get("request_id")) != request_id]
        next_item_id = _next_id(item_rows)
        for index, item in enumerate(items):
            item_rows.append(
                {
                    "id": next_item_id + index,
                    "request_id": request_id,
                    "item_id": item["item_id"],
                    "quantity": item["quantity"],
                    "note": item.get("note", ""),
                }
            )
        _write_rows(request_ws, SHEETS["borrow_requests"], request_rows)
        _write_rows(item_ws, SHEETS["borrow_items"], item_rows)
        wb.save(DB_PATH)
        return True


def delete_borrow_request(request_id: int) -> bool:
    with _locked_workbook() as wb:
        request_ws = wb["borrow_requests"]
        item_ws = wb["borrow_items"]
        request_rows = _read_rows(request_ws)
        item_rows = _read_rows(item_ws)
        remaining_requests = [row for row in request_rows if _to_int(row.get("id")) != request_id]
        deleted = len(remaining_requests) != len(request_rows)
        if not deleted:
            return False
        remaining_items = [row for row in item_rows if _to_int(row.get("request_id")) != request_id]
        _write_rows(request_ws, SHEETS["borrow_requests"], remaining_requests)
        _write_rows(item_ws, SHEETS["borrow_items"], remaining_items)
        wb.save(DB_PATH)
        return True


POS_ORDER_TYPES_DECREASE_STOCK = {"sale", "issue", "borrow"}
POS_ORDER_TYPES_INCREASE_STOCK = {"issue_restock", "borrow_return"}
POS_ORDER_TYPES = POS_ORDER_TYPES_DECREASE_STOCK | POS_ORDER_TYPES_INCREASE_STOCK


def _make_pos_order_no(order_rows: list[dict[str, Any]]) -> str:
    date_sn = _date_sn()
    prefix = f"POS-{date_sn}-"
    max_seq = 0
    for row in order_rows:
        order_no = str(row.get("order_no", ""))
        if not order_no.startswith(prefix):
            continue
        seq = _to_int(order_no.replace(prefix, ""), default=0)
        if seq > max_seq:
            max_seq = seq
    return f"{prefix}{max_seq + 1:04d}"


def _active_inventory_map(inventory_rows: list[dict[str, Any]]) -> dict[int, dict[str, Any]]:
    return {
        _to_int(row.get("id")): row
        for row in inventory_rows
        if _is_blank(row.get("deleted_at"))
    }


def _stock_balance_map(stock_rows: list[dict[str, Any]]) -> dict[int, dict[str, Any]]:
    return {
        _to_int(row.get("item_id")): row
        for row in stock_rows
        if not _is_blank(row.get("item_id"))
    }


def _apply_stock_changes_locked(
    *,
    inventory_rows: list[dict[str, Any]],
    stock_rows: list[dict[str, Any]],
    stock_changes: dict[int, int],
) -> dict[int, int]:
    inventory_map = _active_inventory_map(inventory_rows)
    stock_map = _stock_balance_map(stock_rows)

    for item_id, delta in stock_changes.items():
        if item_id not in inventory_map:
            raise ValueError(f"item_id {item_id} not found")
        current_qty = _to_int(stock_map.get(item_id, {}).get("quantity"), default=0)
        next_qty = current_qty + delta
        if next_qty < 0:
            raise ValueError(f"item_id {item_id} stock is insufficient")

    now = _now_str()
    balances_after: dict[int, int] = {}
    for item_id, delta in stock_changes.items():
        current_qty = _to_int(stock_map.get(item_id, {}).get("quantity"), default=0)
        next_qty = current_qty + delta
        row = stock_map.get(item_id)
        if row is None:
            row = {"item_id": item_id, "quantity": next_qty, "updated_at": now}
            stock_rows.append(row)
            stock_map[item_id] = row
        else:
            row["quantity"] = next_qty
            row["updated_at"] = now
        balances_after[item_id] = next_qty

    return balances_after


def _create_issue_request_locked(
    *,
    request_rows: list[dict[str, Any]],
    item_rows: list[dict[str, Any]],
    request_data: dict[str, Any],
    items: list[dict[str, Any]],
) -> int:
    request_id = _next_id(request_rows)
    request_rows.append(
        {
            "id": request_id,
            "requester": request_data["requester"],
            "department": request_data["department"],
            "purpose": request_data["purpose"],
            "request_date": request_data["request_date"],
            "memo": request_data["memo"],
            "created_at": _now_str(),
        }
    )
    next_item_id = _next_id(item_rows)
    for index, item in enumerate(items):
        item_rows.append(
            {
                "id": next_item_id + index,
                "request_id": request_id,
                "item_id": item["item_id"],
                "quantity": item["quantity"],
                "note": item.get("note", ""),
            }
        )
    return request_id


def _create_borrow_request_locked(
    *,
    request_rows: list[dict[str, Any]],
    item_rows: list[dict[str, Any]],
    request_data: dict[str, Any],
    items: list[dict[str, Any]],
) -> int:
    request_id = _next_id(request_rows)
    request_rows.append(
        {
            "id": request_id,
            "borrower": request_data["borrower"],
            "department": request_data["department"],
            "purpose": request_data["purpose"],
            "borrow_date": request_data["borrow_date"],
            "due_date": request_data["due_date"],
            "return_date": request_data["return_date"],
            "status": request_data["status"],
            "memo": request_data["memo"],
            "created_at": _now_str(),
        }
    )
    next_item_id = _next_id(item_rows)
    for index, item in enumerate(items):
        item_rows.append(
            {
                "id": next_item_id + index,
                "request_id": request_id,
                "item_id": item["item_id"],
                "quantity": item["quantity"],
                "note": item.get("note", ""),
            }
        )
    return request_id


def _mark_borrow_request_returned_locked(
    *,
    request_rows: list[dict[str, Any]],
    request_id: int,
) -> None:
    for row in request_rows:
        if _to_int(row.get("id")) != request_id:
            continue
        row["status"] = "returned"
        row["return_date"] = datetime.now().strftime("%Y/%m/%d")
        return
    raise ValueError(f"borrow_request_id {request_id} not found")


def create_pos_order(order_data: dict[str, Any], items: list[dict[str, Any]]) -> int:
    order_type = str(order_data.get("order_type", "")).strip()
    if order_type not in POS_ORDER_TYPES:
        raise ValueError("invalid order_type")
    if not items:
        raise ValueError("items is required")

    stock_changes: dict[int, int] = {}
    subtotal = 0.0
    discount_total = 0.0
    normalized_items: list[dict[str, Any]] = []
    for item in items:
        item_id = _to_int(item.get("item_id"))
        quantity = _to_int(item.get("quantity"))
        if item_id <= 0:
            raise ValueError("item_id is required")
        if quantity <= 0:
            raise ValueError("quantity must be greater than 0")
        unit_price = float(item.get("unit_price", 0))
        discount = float(item.get("discount", 0))
        if unit_price < 0:
            raise ValueError("unit_price cannot be negative")
        if discount < 0:
            raise ValueError("discount cannot be negative")
        line_amount = unit_price * quantity
        if discount > line_amount:
            raise ValueError("discount cannot exceed line amount")
        line_total = line_amount - discount
        subtotal += line_amount
        discount_total += discount
        delta = -quantity if order_type in POS_ORDER_TYPES_DECREASE_STOCK else quantity
        stock_changes[item_id] = stock_changes.get(item_id, 0) + delta
        normalized_items.append(
            {
                "item_id": item_id,
                "quantity": quantity,
                "unit_price": unit_price,
                "discount": discount,
                "line_total": line_total,
                "note": item.get("note", ""),
            }
        )

    with _locked_workbook() as wb:
        pos_orders_ws = wb["pos_orders"]
        pos_order_items_ws = wb["pos_order_items"]
        stock_balances_ws = wb["stock_balances"]
        stock_movements_ws = wb["stock_movements"]
        inventory_ws = wb["inventory_items"]
        issue_requests_ws = wb["issue_requests"]
        issue_items_ws = wb["issue_items"]
        borrow_requests_ws = wb["borrow_requests"]
        borrow_items_ws = wb["borrow_items"]

        pos_orders = _read_rows(pos_orders_ws)
        pos_order_items = _read_rows(pos_order_items_ws)
        stock_balances = _read_rows(stock_balances_ws)
        stock_movements = _read_rows(stock_movements_ws)
        inventory_rows = _read_rows(inventory_ws)
        issue_request_rows = _read_rows(issue_requests_ws)
        issue_item_rows = _read_rows(issue_items_ws)
        borrow_request_rows = _read_rows(borrow_requests_ws)
        borrow_item_rows = _read_rows(borrow_items_ws)
        inventory_map = _active_inventory_map(inventory_rows)

        for line in normalized_items:
            if line["item_id"] not in inventory_map:
                raise ValueError(f"item_id {line['item_id']} not found")
            details = inventory_map[line["item_id"]]
            line["item_name"] = details.get("name", "")
            line["item_model"] = details.get("model", "")

        balances_after = _apply_stock_changes_locked(
            inventory_rows=inventory_rows,
            stock_rows=stock_balances,
            stock_changes=stock_changes,
        )

        request_ref_type = ""
        request_ref_id: int | None = None
        today = datetime.now().strftime("%Y/%m/%d")
        if order_type == "issue":
            request_ref_type = "issue_request"
            request_ref_id = _create_issue_request_locked(
                request_rows=issue_request_rows,
                item_rows=issue_item_rows,
                request_data={
                    "requester": str(order_data.get("customer_name", "")).strip() or "POS",
                    "department": str(order_data.get("department", "")).strip(),
                    "purpose": str(order_data.get("purpose", "")).strip() or "POS 領用",
                    "request_date": today,
                    "memo": str(order_data.get("note", "")).strip(),
                },
                items=normalized_items,
            )
        elif order_type == "borrow":
            request_ref_type = "borrow_request"
            request_ref_id = _create_borrow_request_locked(
                request_rows=borrow_request_rows,
                item_rows=borrow_item_rows,
                request_data={
                    "borrower": str(order_data.get("customer_name", "")).strip() or "POS",
                    "department": str(order_data.get("department", "")).strip(),
                    "purpose": str(order_data.get("purpose", "")).strip() or "POS 借用",
                    "borrow_date": today,
                    "due_date": str(order_data.get("due_date", "")).strip(),
                    "return_date": "",
                    "status": "borrowed",
                    "memo": str(order_data.get("note", "")).strip(),
                },
                items=normalized_items,
            )
        elif order_type == "borrow_return":
            ref_id = _to_int(order_data.get("borrow_request_id"))
            if ref_id > 0:
                _mark_borrow_request_returned_locked(request_rows=borrow_request_rows, request_id=ref_id)
                request_ref_type = "borrow_request"
                request_ref_id = ref_id
            else:
                request_ref_type = "borrow_return"
        elif order_type == "issue_restock":
            request_ref_type = "issue_restock"

        order_id = _next_id(pos_orders)
        order_no = _make_pos_order_no(pos_orders)
        total = subtotal - discount_total
        pos_orders.append(
            {
                "id": order_id,
                "order_no": order_no,
                "order_type": order_type,
                "customer_name": str(order_data.get("customer_name", "")).strip(),
                "operator_name": str(order_data.get("operator_name", "")).strip(),
                "purpose": str(order_data.get("purpose", "")).strip(),
                "request_ref_type": request_ref_type,
                "request_ref_id": request_ref_id if request_ref_id is not None else "",
                "subtotal": round(subtotal, 2),
                "discount_total": round(discount_total, 2),
                "total": round(total, 2),
                "note": str(order_data.get("note", "")).strip(),
                "created_at": _now_str(),
            }
        )

        next_item_id = _next_id(pos_order_items)
        next_movement_id = _next_id(stock_movements)
        for index, line in enumerate(normalized_items):
            pos_order_items.append(
                {
                    "id": next_item_id + index,
                    "order_id": order_id,
                    "item_id": line["item_id"],
                    "item_name": line["item_name"],
                    "item_model": line["item_model"],
                    "quantity": line["quantity"],
                    "unit_price": line["unit_price"],
                    "discount": round(line["discount"], 2),
                    "line_total": round(line["line_total"], 2),
                    "note": line["note"],
                }
            )
            delta = -line["quantity"] if order_type in POS_ORDER_TYPES_DECREASE_STOCK else line["quantity"]
            stock_movements.append(
                {
                    "id": next_movement_id + index,
                    "order_id": order_id,
                    "order_no": order_no,
                    "item_id": line["item_id"],
                    "delta": delta,
                    "balance_after": balances_after[line["item_id"]],
                    "reason": order_type,
                    "related_type": request_ref_type,
                    "related_id": request_ref_id if request_ref_id is not None else "",
                    "created_at": _now_str(),
                }
            )

        _write_rows(pos_orders_ws, SHEETS["pos_orders"], pos_orders)
        _write_rows(pos_order_items_ws, SHEETS["pos_order_items"], pos_order_items)
        _write_rows(stock_balances_ws, SHEETS["stock_balances"], stock_balances)
        _write_rows(stock_movements_ws, SHEETS["stock_movements"], stock_movements)
        _write_rows(issue_requests_ws, SHEETS["issue_requests"], issue_request_rows)
        _write_rows(issue_items_ws, SHEETS["issue_items"], issue_item_rows)
        _write_rows(borrow_requests_ws, SHEETS["borrow_requests"], borrow_request_rows)
        _write_rows(borrow_items_ws, SHEETS["borrow_items"], borrow_item_rows)
        wb.save(DB_PATH)
        return order_id


def list_pos_orders() -> list[dict[str, Any]]:
    with _locked_workbook() as wb:
        rows = _read_rows(wb["pos_orders"])
    return sorted(rows, key=lambda row: _to_int(row.get("id")), reverse=True)


def get_pos_order(order_id: int) -> dict[str, Any] | None:
    with _locked_workbook() as wb:
        rows = _read_rows(wb["pos_orders"])
    for row in rows:
        if _to_int(row.get("id")) == order_id:
            return row
    return None


def list_pos_order_items(order_id: int) -> list[dict[str, Any]]:
    with _locked_workbook() as wb:
        rows = _read_rows(wb["pos_order_items"])
    results = [row for row in rows if _to_int(row.get("order_id")) == order_id]
    return sorted(results, key=lambda row: _to_int(row.get("id")))


def list_stock_balances() -> list[dict[str, Any]]:
    with _locked_workbook() as wb:
        inventory_rows = _read_rows(wb["inventory_items"])
        stock_rows = _read_rows(wb["stock_balances"])

    stock_map = _stock_balance_map(stock_rows)
    results = []
    for item_id, item in _active_inventory_map(inventory_rows).items():
        quantity = _to_int(stock_map.get(item_id, {}).get("quantity"), default=0)
        results.append(
            {
                "item_id": item_id,
                "item_name": _to_str(item.get("name")),
                "item_model": _to_str(item.get("model")),
                "property_number": _to_str(item.get("property_number")),
                "quantity": quantity,
            }
        )
    return sorted(results, key=lambda row: _to_int(row.get("item_id")))


def set_stock_quantity(item_id: int, quantity: int) -> bool:
    if quantity < 0:
        raise ValueError("quantity cannot be negative")

    with _locked_workbook() as wb:
        inventory_rows = _read_rows(wb["inventory_items"])
        stock_ws = wb["stock_balances"]
        stock_rows = _read_rows(stock_ws)
        inventory_map = _active_inventory_map(inventory_rows)
        if item_id not in inventory_map:
            return False

        stock_map = _stock_balance_map(stock_rows)
        row = stock_map.get(item_id)
        now = _now_str()
        if row is None:
            stock_rows.append({"item_id": item_id, "quantity": quantity, "updated_at": now})
        else:
            row["quantity"] = quantity
            row["updated_at"] = now
        _write_rows(stock_ws, SHEETS["stock_balances"], stock_rows)
        wb.save(DB_PATH)
        return True


def list_stock_movements(limit: int = 200) -> list[dict[str, Any]]:
    with _locked_workbook() as wb:
        movement_rows = _read_rows(wb["stock_movements"])
        inventory_rows = _read_rows(wb["inventory_items"])

    inventory_map = _active_inventory_map(inventory_rows)
    results = []
    for row in movement_rows:
        item_id = _to_int(row.get("item_id"))
        item = inventory_map.get(item_id, {})
        results.append(
            {
                "id": row.get("id"),
                "order_id": row.get("order_id"),
                "order_no": row.get("order_no"),
                "item_id": item_id,
                "item_name": item.get("name", ""),
                "item_model": item.get("model", ""),
                "delta": _to_int(row.get("delta")),
                "balance_after": _to_int(row.get("balance_after")),
                "reason": row.get("reason", ""),
                "related_type": row.get("related_type", ""),
                "related_id": _to_int(row.get("related_id")),
                "created_at": row.get("created_at", ""),
            }
        )
    sorted_rows = sorted(results, key=lambda row: _to_int(row.get("id")), reverse=True)
    safe_limit = max(1, min(limit, 1000))
    return sorted_rows[:safe_limit]
