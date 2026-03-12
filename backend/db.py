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


def list_items() -> list[dict[str, Any]]:
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
            "deleted_at": row.get("deleted_at", ""),
        }
        for row in rows
        if _is_blank(row.get("deleted_at"))
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
