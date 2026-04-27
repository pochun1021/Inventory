from __future__ import annotations

import os
import shutil
import tempfile
from collections import defaultdict
from contextvars import ContextVar
from contextlib import contextmanager
from datetime import datetime
import json
from pathlib import Path
import threading
from typing import Any, Callable, TypeVar, cast

import db
from migration_service import run_xlsx_to_supabase_migration
from supabase_client import get_supabase_client, is_supabase_enabled

T = TypeVar("T")

_DATA_BACKEND_MODE = os.getenv("DATA_BACKEND_MODE", "dual_write_supabase_read").strip().lower()
_DUAL_WRITE_STRICT = os.getenv("DUAL_WRITE_STRICT", "true").strip().lower() in {"1", "true", "yes"}
_CLOUD_PRIMARY_MODES = {"cloud_primary_with_offline_queue"}
_OUTBOX_LOCK = threading.Lock()
_LAST_SYNC_STATE: ContextVar[str] = ContextVar("last_sync_state", default="local_only")

_BACKEND_DIR = Path(__file__).resolve().parent
_SYNC_OUTBOX_PATH = Path(os.getenv("SYNC_OUTBOX_PATH") or (_BACKEND_DIR / "sync_outbox.json"))
_SYNC_CONFLICTS_PATH = Path(os.getenv("SYNC_CONFLICTS_PATH") or (_BACKEND_DIR / "sync_conflicts.json"))
_SYNC_CONFLICTS_LIMIT = 500


def _supabase_read_enabled() -> bool:
    return is_supabase_enabled() and _DATA_BACKEND_MODE in {
        "dual_write_supabase_read",
        "supabase",
        *_CLOUD_PRIMARY_MODES,
    }


def _dual_write_enabled() -> bool:
    return is_supabase_enabled() and _DATA_BACKEND_MODE in {"dual_write_supabase_read", "dual_write"}


def _cloud_primary_enabled() -> bool:
    return is_supabase_enabled() and _DATA_BACKEND_MODE in _CLOUD_PRIMARY_MODES


@contextmanager
def _xlsx_snapshot() -> Any:
    db_path = Path(db.DB_PATH)
    if not db_path.exists():
        yield None
        return

    fd, tmp_path = tempfile.mkstemp(prefix="inventory-xlsx-snapshot-", suffix=".xlsx")
    os.close(fd)
    backup_path = Path(tmp_path)
    shutil.copy2(db_path, backup_path)
    try:
        yield backup_path
    finally:
        if backup_path.exists():
            backup_path.unlink()


def _restore_snapshot(snapshot_path: Path | None) -> None:
    if snapshot_path is None:
        return
    db_path = Path(db.DB_PATH)
    if snapshot_path.exists():
        shutil.copy2(snapshot_path, db_path)


def _sync_xlsx_to_supabase_or_raise() -> None:
    report = run_xlsx_to_supabase_migration(dry_run=False)
    if report.get("status") != "success":
        errors = report.get("errors") or []
        message = "; ".join(str(err) for err in errors if err)
        raise RuntimeError(message or "xlsx to supabase sync failed")


def _now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _load_json_file(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def _save_json_file(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _load_outbox_store() -> dict[str, Any]:
    payload = _load_json_file(_SYNC_OUTBOX_PATH, {"items": [], "meta": {}})
    if not isinstance(payload, dict):
        return {"items": [], "meta": {}}
    items = payload.get("items")
    meta = payload.get("meta")
    if not isinstance(items, list):
        items = []
    if not isinstance(meta, dict):
        meta = {}
    return {"items": items, "meta": meta}


def _save_outbox_store(store: dict[str, Any]) -> None:
    _save_json_file(_SYNC_OUTBOX_PATH, store)


def _stringify_payload(value: Any) -> Any:
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, dict):
        return {str(k): _stringify_payload(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_stringify_payload(v) for v in value]
    return repr(value)


def _enqueue_outbox(*, operation: str, args: tuple[Any, ...], kwargs: dict[str, Any], error: str) -> int:
    with _OUTBOX_LOCK:
        store = _load_outbox_store()
        items = cast(list[dict[str, Any]], store["items"])
        item_id = max((int(item.get("id") or 0) for item in items), default=0) + 1
        items.append(
            {
                "id": item_id,
                "status": "pending",
                "operation": operation,
                "payload": {
                    "args": _stringify_payload(list(args)),
                    "kwargs": _stringify_payload(kwargs),
                },
                "last_error": error,
                "enqueued_at": _now_iso(),
                "updated_at": _now_iso(),
                "retry_count": 0,
                "idempotency_key": f"{operation}:{item_id}",
            }
        )
        meta = cast(dict[str, Any], store["meta"])
        meta["last_error"] = error
        meta["last_attempt_at"] = _now_iso()
        meta["consecutive_failures"] = int(meta.get("consecutive_failures") or 0) + 1
        _save_outbox_store(store)
        return item_id


def _append_sync_conflict(detail: dict[str, Any]) -> None:
    with _OUTBOX_LOCK:
        items = _load_json_file(_SYNC_CONFLICTS_PATH, [])
        if not isinstance(items, list):
            items = []
        next_id = max((int(item.get("id") or 0) for item in items if isinstance(item, dict)), default=0) + 1
        entry = {"id": next_id, "recorded_at": _now_iso(), **detail}
        items.append(entry)
        if len(items) > _SYNC_CONFLICTS_LIMIT:
            items = items[-_SYNC_CONFLICTS_LIMIT :]
        _save_json_file(_SYNC_CONFLICTS_PATH, items)


def _mark_last_sync_state(state: str) -> None:
    _LAST_SYNC_STATE.set(state)


def get_last_sync_state() -> str:
    return _LAST_SYNC_STATE.get()


def _try_dispatch_outbox(*, max_items: int | None = None) -> dict[str, Any]:
    with _OUTBOX_LOCK:
        store = _load_outbox_store()
        items = cast(list[dict[str, Any]], store["items"])
        pending = [item for item in items if str(item.get("status") or "") == "pending"]

    if not pending:
        return {"attempted": 0, "synced": 0, "remaining": 0, "status": "idle"}

    attempted = len(pending) if max_items is None else min(len(pending), max_items)
    try:
        _sync_xlsx_to_supabase_or_raise()
    except Exception as exc:
        message = str(exc) or "xlsx to supabase sync failed"
        with _OUTBOX_LOCK:
            store = _load_outbox_store()
            items = cast(list[dict[str, Any]], store["items"])
            target_ids = {int(item.get("id") or 0) for item in pending[:attempted]}
            for item in items:
                if int(item.get("id") or 0) in target_ids and str(item.get("status") or "") == "pending":
                    item["retry_count"] = int(item.get("retry_count") or 0) + 1
                    item["last_error"] = message
                    item["updated_at"] = _now_iso()
            meta = cast(dict[str, Any], store["meta"])
            meta["last_error"] = message
            meta["last_attempt_at"] = _now_iso()
            meta["consecutive_failures"] = int(meta.get("consecutive_failures") or 0) + 1
            _save_outbox_store(store)
        _append_sync_conflict(
            {
                "type": "sync_failed",
                "decision": "queued_for_retry",
                "message": message,
                "attempted": attempted,
            }
        )
        return {
            "attempted": attempted,
            "synced": 0,
            "remaining": len(pending),
            "status": "failed",
            "error": message,
        }

    with _OUTBOX_LOCK:
        store = _load_outbox_store()
        items = cast(list[dict[str, Any]], store["items"])
        target_ids = {int(item.get("id") or 0) for item in pending[:attempted]}
        synced = 0
        for item in items:
            if int(item.get("id") or 0) in target_ids and str(item.get("status") or "") == "pending":
                item["status"] = "synced"
                item["updated_at"] = _now_iso()
                item["last_error"] = ""
                synced += 1
        meta = cast(dict[str, Any], store["meta"])
        meta["last_error"] = ""
        meta["last_attempt_at"] = _now_iso()
        meta["last_synced_at"] = _now_iso()
        meta["consecutive_failures"] = 0
        remaining = len([item for item in items if str(item.get("status") or "") == "pending"])
        _save_outbox_store(store)
    return {"attempted": attempted, "synced": synced, "remaining": remaining, "status": "success"}


def get_sync_status() -> dict[str, Any]:
    with _OUTBOX_LOCK:
        store = _load_outbox_store()
        items = cast(list[dict[str, Any]], store["items"])
        pending = [item for item in items if str(item.get("status") or "") == "pending"]
        meta = cast(dict[str, Any], store["meta"])

    oldest_pending = ""
    if pending:
        oldest_pending = min(str(item.get("enqueued_at") or "") for item in pending)

    return {
        "mode": _DATA_BACKEND_MODE,
        "supabase_enabled": is_supabase_enabled(),
        "cloud_primary_enabled": _cloud_primary_enabled(),
        "queue_depth": len(pending),
        "oldest_pending_at": oldest_pending,
        "last_synced_at": str(meta.get("last_synced_at") or ""),
        "last_attempt_at": str(meta.get("last_attempt_at") or ""),
        "last_error": str(meta.get("last_error") or ""),
        "consecutive_failures": int(meta.get("consecutive_failures") or 0),
    }


def replay_sync_outbox(*, limit: int | None = None) -> dict[str, Any]:
    if not is_supabase_enabled():
        return {
            "status": "disabled",
            "attempted": 0,
            "synced": 0,
            "remaining": get_sync_status().get("queue_depth", 0),
            "error": "supabase is not enabled",
        }
    result = _try_dispatch_outbox(max_items=limit)
    if result.get("status") == "success":
        _mark_last_sync_state("synced")
    elif result.get("status") == "failed":
        _mark_last_sync_state("queued")
    return result


def list_sync_conflicts(*, limit: int = 100) -> list[dict[str, Any]]:
    rows = _load_json_file(_SYNC_CONFLICTS_PATH, [])
    if not isinstance(rows, list):
        return []
    normalized = [row for row in rows if isinstance(row, dict)]
    normalized.sort(key=lambda row: int(row.get("id") or 0), reverse=True)
    return normalized[: max(1, limit)]


def _execute_mutation(func: Callable[..., T], *args: Any, **kwargs: Any) -> T:
    if _cloud_primary_enabled():
        result = func(*args, **kwargs)
        operation = getattr(func, "__name__", "mutation")
        dispatch = _try_dispatch_outbox(max_items=1)
        if dispatch.get("status") == "success":
            _mark_last_sync_state("synced")
            return result

        message = str(dispatch.get("error") or "cloud sync failed")
        _enqueue_outbox(operation=operation, args=args, kwargs=kwargs, error=message)
        _append_sync_conflict(
            {
                "type": "cloud_primary_dispatch",
                "decision": "lww_local_then_queue_retry",
                "operation": operation,
                "message": message,
            }
        )
        _mark_last_sync_state("queued")
        return result

    if not _dual_write_enabled():
        _mark_last_sync_state("local_only")
        return func(*args, **kwargs)

    with _xlsx_snapshot() as snapshot_path:
        try:
            result = func(*args, **kwargs)
            _sync_xlsx_to_supabase_or_raise()
            _mark_last_sync_state("synced")
            return result
        except Exception:
            if _DUAL_WRITE_STRICT:
                _restore_snapshot(cast(Path | None, snapshot_path))
                try:
                    _sync_xlsx_to_supabase_or_raise()
                except Exception:
                    pass
            _mark_last_sync_state("failed")
            raise


def _fetch_all(table: str) -> list[dict[str, Any]]:
    client = get_supabase_client()
    offset = 0
    page_size = 1000
    rows: list[dict[str, Any]] = []
    while True:
        response = client.table(table).select("*").range(offset, offset + page_size - 1).execute()
        batch = response.data or []
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return cast(list[dict[str, Any]], rows)


def _fetch_by_id(table: str, item_id: int) -> dict[str, Any] | None:
    client = get_supabase_client()
    response = client.table(table).select("*").eq("id", item_id).limit(1).execute()
    data = response.data or []
    if not data:
        return None
    return cast(dict[str, Any], data[0])


def _normalize_id(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


# Reads

def get_dashboard_snapshot() -> dict[str, Any]:
    if not _supabase_read_enabled():
        return db.get_dashboard_snapshot()

    inventory_rows = _fetch_all("inventory_items")
    issue_request_rows = _fetch_all("issue_requests")
    issue_item_rows = _fetch_all("issue_items")
    borrow_request_rows = _fetch_all("borrow_requests")
    borrow_line_rows = _fetch_all("borrow_request_lines")
    donation_request_rows = _fetch_all("donation_requests")
    donation_item_rows = _fetch_all("donation_items")

    active_inventory_rows = [row for row in inventory_rows if not str(row.get("deleted_at") or "").strip()]
    pending_fix = 0
    donated_count = 0
    for row in active_inventory_rows:
        serial = str(row.get("key") or row.get("n_property_sn") or row.get("property_sn") or "").strip()
        if not serial:
            pending_fix += 1
        donated_at = str(row.get("donated_at") or "").strip()
        donation_request_id = row.get("donation_request_id")
        if donated_at or donation_request_id not in (None, ""):
            donated_count += 1

    issue_count = len(issue_request_rows)
    borrow_count = len(borrow_request_rows)
    donation_count = len(donation_request_rows)

    issue_item_counts: dict[int, int] = defaultdict(int)
    for row in issue_item_rows:
        issue_item_counts[_normalize_id(row.get("request_id"))] += 1

    borrow_item_counts: dict[int, int] = defaultdict(int)
    for row in borrow_line_rows:
        borrow_item_counts[_normalize_id(row.get("request_id"))] += 1

    donation_item_counts: dict[int, int] = defaultdict(int)
    for row in donation_item_rows:
        donation_item_counts[_normalize_id(row.get("request_id"))] += 1

    activities: list[dict[str, Any]] = []
    for row in issue_request_rows:
        request_id = _normalize_id(row.get("id"))
        activities.append(
            {
                "key": f"issue-{request_id}",
                "type": "領用",
                "dateLabel": str(row.get("request_date") or "--"),
                "dateValue": db._parse_request_date_value(row.get("request_date")),  # noqa: SLF001
                "actor": str(row.get("requester") or "未填寫"),
                "summary": f"{issue_item_counts.get(request_id, 0)} 項品類",
                "requestId": str(request_id),
            }
        )

    reserved_borrow_count = 0
    overdue_borrow_count = 0
    due_soon_borrow_count = 0
    for row in borrow_request_rows:
        request_id = _normalize_id(row.get("id"))
        status = str(row.get("status") or "")
        if status == "reserved":
            reserved_borrow_count += 1
        if status == "overdue":
            overdue_borrow_count += 1
        if status in {"borrowed", "overdue"} and db._is_due_soon(  # noqa: SLF001
            due_date_value=row.get("due_date"),
            return_date_value=row.get("return_date"),
        ):
            due_soon_borrow_count += 1
        activities.append(
            {
                "key": f"borrow-{request_id}",
                "type": "借用",
                "dateLabel": str(row.get("borrow_date") or "--"),
                "dateValue": db._parse_request_date_value(row.get("borrow_date")),  # noqa: SLF001
                "actor": str(row.get("borrower") or "未填寫"),
                "summary": f"{borrow_item_counts.get(request_id, 0)} 項品類 · {status or '--'}",
                "requestId": str(request_id),
            }
        )

    for row in donation_request_rows:
        request_id = _normalize_id(row.get("id"))
        activities.append(
            {
                "key": f"donation-{request_id}",
                "type": "捐贈",
                "dateLabel": str(row.get("donation_date") or "--"),
                "dateValue": db._parse_request_date_value(row.get("donation_date")),  # noqa: SLF001
                "actor": str(row.get("donor") or "未填寫"),
                "summary": f"{donation_item_counts.get(request_id, 0)} 項品類",
                "requestId": str(request_id),
            }
        )

    activities.sort(key=lambda row: (int(row.get("dateValue") or 0), str(row.get("key") or "")), reverse=True)

    return {
        "status": "success",
        "data": "這是管理系統的後端數據",
        "items": len(active_inventory_rows),
        "pendingFix": pending_fix,
        "totalRecords": issue_count + borrow_count + donation_count,
        "reservedBorrowCount": reserved_borrow_count,
        "overdueBorrowCount": overdue_borrow_count,
        "dueSoonBorrowCount": due_soon_borrow_count,
        "donatedItemsCount": donated_count,
        "itemCategoryDistribution": [],
        "recentActivities": activities[:8],
    }


def list_items(*, include_donated: bool = False, deleted_scope: str = "active") -> list[dict[str, Any]]:
    if not _supabase_read_enabled():
        return db.list_items(include_donated=include_donated, deleted_scope=deleted_scope)

    rows = _fetch_all("inventory_items")

    filtered: list[dict[str, Any]] = []
    for row in rows:
        deleted_at = str(row.get("deleted_at") or "").strip()
        is_deleted = bool(deleted_at)
        if deleted_scope == "active" and is_deleted:
            continue
        if deleted_scope == "deleted" and not is_deleted:
            continue

        is_donated = bool(str(row.get("donated_at") or "").strip()) or row.get("donation_request_id") not in (None, "")
        if not include_donated and is_donated:
            continue
        filtered.append(row)

    filtered.sort(key=lambda r: _normalize_id(r.get("id")), reverse=True)
    return filtered


def get_item_by_id(item_id: int) -> dict[str, Any] | None:
    if not _supabase_read_enabled():
        return db.get_item_by_id(item_id)
    return _fetch_by_id("inventory_items", item_id)


def list_issue_requests() -> list[dict[str, Any]]:
    if not _supabase_read_enabled():
        return db.list_issue_requests()
    rows = _fetch_all("issue_requests")
    rows.sort(key=lambda r: _normalize_id(r.get("id")), reverse=True)
    return rows


def get_issue_request(request_id: int) -> dict[str, Any] | None:
    if not _supabase_read_enabled():
        return db.get_issue_request(request_id)
    return _fetch_by_id("issue_requests", request_id)


def list_issue_items(request_id: int) -> list[dict[str, Any]]:
    if not _supabase_read_enabled():
        return db.list_issue_items(request_id)

    issue_rows = [row for row in _fetch_all("issue_items") if _normalize_id(row.get("request_id")) == request_id]
    inventory_map = {_normalize_id(row.get("id")): row for row in _fetch_all("inventory_items")}
    for row in issue_rows:
        item_row = inventory_map.get(_normalize_id(row.get("item_id")), {})
        row.setdefault("item_name", item_row.get("name") or "")
        row.setdefault("item_model", item_row.get("model") or "")
    issue_rows.sort(key=lambda r: _normalize_id(r.get("id")))
    return issue_rows


def list_issue_items_map(request_ids: set[int] | None = None) -> dict[int, list[dict[str, Any]]]:
    if not _supabase_read_enabled():
        return db.list_issue_items_map(request_ids)

    target_ids = set(request_ids or [])
    grouped: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for row in _fetch_all("issue_items"):
        request_id = _normalize_id(row.get("request_id"))
        if request_id in target_ids:
            grouped[request_id].append(row)

    inventory_map = {_normalize_id(row.get("id")): row for row in _fetch_all("inventory_items")}
    for rows in grouped.values():
        for row in rows:
            item_row = inventory_map.get(_normalize_id(row.get("item_id")), {})
            row.setdefault("item_name", item_row.get("name") or "")
            row.setdefault("item_model", item_row.get("model") or "")
        rows.sort(key=lambda r: _normalize_id(r.get("id")))
    return dict(grouped)


def list_borrow_requests() -> list[dict[str, Any]]:
    if not _supabase_read_enabled():
        return db.list_borrow_requests()
    rows = _fetch_all("borrow_requests")
    rows.sort(key=lambda r: _normalize_id(r.get("id")), reverse=True)
    return rows


def get_borrow_request(request_id: int) -> dict[str, Any] | None:
    if not _supabase_read_enabled():
        return db.get_borrow_request(request_id)
    return _fetch_by_id("borrow_requests", request_id)


def _build_borrow_lines(request_id: int) -> list[dict[str, Any]]:
    lines = [row for row in _fetch_all("borrow_request_lines") if _normalize_id(row.get("request_id")) == request_id]
    allocations = [row for row in _fetch_all("borrow_allocations") if _normalize_id(row.get("request_id")) == request_id]

    allocation_map: dict[int, list[int]] = defaultdict(list)
    for row in allocations:
        allocation_map[_normalize_id(row.get("line_id"))].append(_normalize_id(row.get("item_id")))

    for row in lines:
        requested_qty = _normalize_id(row.get("requested_qty"))
        if requested_qty <= 0:
            requested_qty = 1
        allocated_item_ids = allocation_map.get(_normalize_id(row.get("id")), [])
        row.setdefault("quantity", requested_qty)
        row.setdefault("requested_qty", requested_qty)
        row.setdefault("allocated_qty", len([item_id for item_id in allocated_item_ids if item_id > 0]))
        row.setdefault("allocated_item_ids", allocated_item_ids)
        row.setdefault("item_id", None)
        row.setdefault("note", row.get("note") or "")
    lines.sort(key=lambda r: _normalize_id(r.get("id")))
    return lines


def list_borrow_items(request_id: int) -> list[dict[str, Any]]:
    if not _supabase_read_enabled():
        return db.list_borrow_items(request_id)
    return _build_borrow_lines(request_id)


def list_borrow_items_map(request_ids: set[int] | None = None) -> dict[int, list[dict[str, Any]]]:
    if not _supabase_read_enabled():
        return db.list_borrow_items_map(request_ids)

    grouped: dict[int, list[dict[str, Any]]] = {}
    for request_id in request_ids or set():
        grouped[request_id] = _build_borrow_lines(request_id)
    return grouped


def list_borrow_pickup_candidates(request_id: int) -> list[dict[str, Any]] | None:
    return db.list_borrow_pickup_candidates(request_id)


def list_borrow_pickup_lines(request_id: int) -> list[dict[str, Any]] | None:
    return db.list_borrow_pickup_lines(request_id)


def list_borrow_pickup_line_candidates(
    request_id: int,
    line_id: int,
    *,
    keyword: str = "",
    page: int = 1,
    page_size: int = 50,
) -> dict[str, Any] | None:
    return db.list_borrow_pickup_line_candidates(
        request_id,
        line_id,
        keyword=keyword,
        page=page,
        page_size=page_size,
    )


def list_borrow_reservation_options(*, exclude_request_id: int | None = None) -> list[dict[str, Any]]:
    return db.list_borrow_reservation_options(exclude_request_id=exclude_request_id)


def list_donation_requests() -> list[dict[str, Any]]:
    if not _supabase_read_enabled():
        return db.list_donation_requests()
    rows = _fetch_all("donation_requests")
    rows.sort(key=lambda r: _normalize_id(r.get("id")), reverse=True)
    return rows


def get_donation_request(request_id: int) -> dict[str, Any] | None:
    if not _supabase_read_enabled():
        return db.get_donation_request(request_id)
    return _fetch_by_id("donation_requests", request_id)


def list_donation_items(request_id: int) -> list[dict[str, Any]]:
    if not _supabase_read_enabled():
        return db.list_donation_items(request_id)

    donation_rows = [row for row in _fetch_all("donation_items") if _normalize_id(row.get("request_id")) == request_id]
    inventory_map = {_normalize_id(row.get("id")): row for row in _fetch_all("inventory_items")}
    for row in donation_rows:
        item_row = inventory_map.get(_normalize_id(row.get("item_id")), {})
        row.setdefault("item_name", item_row.get("name") or "")
        row.setdefault("item_model", item_row.get("model") or "")
    donation_rows.sort(key=lambda r: _normalize_id(r.get("id")))
    return donation_rows


def list_donation_items_map(request_ids: set[int] | None = None) -> dict[int, list[dict[str, Any]]]:
    if not _supabase_read_enabled():
        return db.list_donation_items_map(request_ids)

    target_ids = set(request_ids or [])
    grouped: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for row in _fetch_all("donation_items"):
        request_id = _normalize_id(row.get("request_id"))
        if request_id in target_ids:
            grouped[request_id].append(row)

    inventory_map = {_normalize_id(row.get("id")): row for row in _fetch_all("inventory_items")}
    for rows in grouped.values():
        for row in rows:
            item_row = inventory_map.get(_normalize_id(row.get("item_id")), {})
            row.setdefault("item_name", item_row.get("name") or "")
            row.setdefault("item_model", item_row.get("model") or "")
        rows.sort(key=lambda r: _normalize_id(r.get("id")))
    return dict(grouped)


def list_movement_ledger(
    *,
    start_at: Any = None,
    end_at: Any = None,
    action: str = "",
    entity: str = "",
    item_id: int | None = None,
    entity_id: int | None = None,
    scope: str = "hot",
) -> list[dict[str, Any]]:
    if not _supabase_read_enabled():
        return db.list_movement_ledger(
            start_at=start_at,
            end_at=end_at,
            action=action,
            entity=entity,
            item_id=item_id,
            entity_id=entity_id,
            scope=scope,
        )

    rows = _fetch_all("movement_ledger")
    inventory_map = {_normalize_id(row.get("id")): row for row in _fetch_all("inventory_items")}
    normalized_action = action.strip().lower()
    normalized_entity = entity.strip().lower()
    filtered: list[dict[str, Any]] = []
    for row in rows:
        row_action = str(row.get("action") or "").strip()
        row_entity = str(row.get("entity") or "").strip()
        row_item_id = _normalize_id(row.get("item_id"))
        row_entity_id = _normalize_id(row.get("entity_id"))
        if normalized_action and row_action.lower() != normalized_action:
            continue
        if normalized_entity and row_entity.lower() != normalized_entity:
            continue
        if item_id is not None and row_item_id != item_id:
            continue
        if entity_id is not None and row_entity_id != entity_id:
            continue
        if not db._matches_time_filter(created_at=row.get("created_at"), start_at=start_at, end_at=end_at):  # noqa: SLF001
            continue
        item_info = inventory_map.get(row_item_id, {})
        filtered.append(
            {
                "id": _normalize_id(row.get("id")),
                "item_id": row_item_id,
                "item_name": str(item_info.get("name") or ""),
                "item_model": str(item_info.get("model") or ""),
                "from_status": str(row.get("from_status") or ""),
                "to_status": str(row.get("to_status") or ""),
                "action": row_action,
                "entity": row_entity,
                "entity_id": row_entity_id if row_entity_id > 0 else None,
                "operator": str(row.get("operator") or ""),
                "created_at": str(row.get("created_at") or ""),
            }
        )

    filtered.sort(key=lambda r: _normalize_id(r.get("id")), reverse=True)
    return filtered


def list_operation_logs(
    *,
    start_at: Any = None,
    end_at: Any = None,
    action: str = "",
    entity: str = "",
    item_id: int | None = None,
    entity_id: int | None = None,
    scope: str = "hot",
) -> list[dict[str, Any]]:
    if not _supabase_read_enabled():
        return db.list_operation_logs(
            start_at=start_at,
            end_at=end_at,
            action=action,
            entity=entity,
            item_id=item_id,
            entity_id=entity_id,
            scope=scope,
        )

    rows = _fetch_all("operation_logs")
    action_filter = action.strip().lower()
    entity_filter = entity.strip().lower()

    filtered: list[dict[str, Any]] = []
    for row in rows:
        row_action = str(row.get("action") or "").strip()
        row_entity = str(row.get("entity") or "").strip()
        row_entity_id = _normalize_id(row.get("entity_id"))
        if action_filter and row_action.lower() != action_filter:
            continue
        if entity_filter and row_entity.lower() != entity_filter:
            continue
        if entity_id is not None and row_entity_id != entity_id:
            continue
        detail = row.get("detail") if isinstance(row.get("detail"), dict) else db._parse_json_detail(row.get("detail"))  # noqa: SLF001
        if item_id is not None and not db._matches_item_filter_from_detail(detail, item_id):  # noqa: SLF001
            continue
        if not db._matches_time_filter(created_at=row.get("created_at"), start_at=start_at, end_at=end_at):  # noqa: SLF001
            continue
        filtered.append(
            {
                "id": _normalize_id(row.get("id")),
                "action": row_action,
                "entity": row_entity,
                "entity_id": row_entity_id if row_entity_id > 0 else None,
                "status": str(row.get("status") or ""),
                "detail": detail,
                "created_at": str(row.get("created_at") or ""),
            }
        )

    filtered.sort(key=lambda r: _normalize_id(r.get("id")), reverse=True)
    return filtered


def list_asset_status_codes() -> list[dict[str, Any]]:
    if not _supabase_read_enabled():
        return db.list_asset_status_codes()
    rows = _fetch_all("asset_status_codes")
    rows.sort(key=lambda row: str(row.get("code") or ""))
    return rows


def list_condition_status_codes() -> list[dict[str, Any]]:
    if not _supabase_read_enabled():
        return db.list_condition_status_codes()
    rows = _fetch_all("condition_status_code")
    normalized: list[dict[str, Any]] = []
    for row in rows:
        normalized.append(
            {
                "code": str(row.get("condition_status") or "").strip(),
                "description": str(row.get("description") or "").strip(),
            }
        )
    normalized.sort(key=lambda row: row["code"])
    return normalized


def list_asset_categories() -> list[dict[str, Any]]:
    if not _supabase_read_enabled():
        return db.list_asset_categories()
    rows = _fetch_all("asset_category_name")
    normalized: list[dict[str, Any]] = []
    for row in rows:
        normalized.append(
            {
                "name_code": str(row.get("name_code") or "").strip(),
                "asset_category_name": str(row.get("asset_category_name") or "").strip(),
                "name_code2": str(row.get("name_code2") or "").strip(),
                "description": str(row.get("description") or "").strip(),
            }
        )
    normalized.sort(key=lambda row: db._asset_category_sort_key(row["name_code"], row["name_code2"]))  # noqa: SLF001
    return normalized


# Mutations with dual write

def create_asset_status_code(code: str, description: str) -> dict[str, Any]:
    return _execute_mutation(db.create_asset_status_code, code, description)


def update_asset_status_code(code: str, next_code: str, description: str) -> dict[str, Any]:
    return _execute_mutation(db.update_asset_status_code, code, next_code, description)


def delete_asset_status_code(code: str) -> bool:
    return _execute_mutation(db.delete_asset_status_code, code)


def create_condition_status_code(code: str, description: str) -> dict[str, Any]:
    return _execute_mutation(db.create_condition_status_code, code, description)


def update_condition_status_code(code: str, next_code: str, description: str) -> dict[str, Any]:
    return _execute_mutation(db.update_condition_status_code, code, next_code, description)


def delete_condition_status_code(code: str) -> bool:
    return _execute_mutation(db.delete_condition_status_code, code)


def create_asset_category(name_code: str, category_name: str, name_code2: str, description: str) -> dict[str, Any]:
    return _execute_mutation(db.create_asset_category, name_code, category_name, name_code2, description)


def update_asset_category(
    name_code: str,
    name_code2: str,
    next_name_code: str,
    next_name_code2: str,
    category_name: str,
    description: str,
) -> dict[str, Any]:
    return _execute_mutation(
        db.update_asset_category,
        name_code,
        name_code2,
        next_name_code,
        next_name_code2,
        category_name,
        description,
    )


def delete_asset_category(name_code: str, name_code2: str) -> None:
    _execute_mutation(db.delete_asset_category, name_code, name_code2)


def create_item(item_data: dict[str, Any]) -> int:
    return _execute_mutation(db.create_item, item_data)


def create_items_bulk(items: list[dict[str, Any]]) -> int:
    return _execute_mutation(db.create_items_bulk, items)


def update_item(item_id: int, item_data: dict[str, Any]) -> bool:
    return _execute_mutation(db.update_item, item_id, item_data)


def delete_item(item_id: int) -> bool:
    return _execute_mutation(db.delete_item, item_id)


def restore_item(item_id: int) -> dict[str, str] | None:
    return _execute_mutation(db.restore_item, item_id)


def detach_item(parent_item_id: int, detach_data: dict[str, Any]) -> int:
    return _execute_mutation(db.detach_item, parent_item_id, detach_data)


def create_issue_request(request_data: dict[str, Any], items: list[dict[str, Any]]) -> int:
    return _execute_mutation(db.create_issue_request, request_data, items)


def update_issue_request(request_id: int, request_data: dict[str, Any], items: list[dict[str, Any]]) -> bool:
    return _execute_mutation(db.update_issue_request, request_id, request_data, items)


def delete_issue_request(request_id: int) -> bool:
    return _execute_mutation(db.delete_issue_request, request_id)


def create_borrow_request(request_data: dict[str, Any], request_lines: list[dict[str, Any]]) -> int:
    return _execute_mutation(db.create_borrow_request, request_data, request_lines)


def update_borrow_request(request_id: int, request_data: dict[str, Any], request_lines: list[dict[str, Any]]) -> bool:
    return _execute_mutation(db.update_borrow_request, request_id, request_data, request_lines)


def delete_borrow_request(request_id: int) -> bool:
    return _execute_mutation(db.delete_borrow_request, request_id)


def pickup_borrow_request(request_id: int, selections_data: list[dict[str, Any]]) -> bool:
    return _execute_mutation(db.pickup_borrow_request, request_id, selections_data)


def return_borrow_request(request_id: int, *, return_date_value: Any = None) -> bool:
    return _execute_mutation(db.return_borrow_request, request_id, return_date_value=return_date_value)


def resolve_borrow_pickup_scan(request_id: int, code: str) -> dict[str, Any] | None:
    return _execute_mutation(db.resolve_borrow_pickup_scan, request_id, code)


def create_donation_request(request_data: dict[str, Any], items: list[dict[str, Any]]) -> int:
    return _execute_mutation(db.create_donation_request, request_data, items)


def update_donation_request(request_id: int, request_data: dict[str, Any], items: list[dict[str, Any]]) -> bool:
    return _execute_mutation(db.update_donation_request, request_id, request_data, items)


def delete_donation_request(request_id: int) -> bool:
    return _execute_mutation(db.delete_donation_request, request_id)


def log_inventory_action(
    action: str,
    *,
    entity: str = "inventory_item",
    entity_id: int | None = None,
    status: str = "success",
    detail: dict[str, Any] | None = None,
) -> None:
    _execute_mutation(
        db.log_inventory_action,
        action=action,
        entity=entity,
        entity_id=entity_id,
        status=status,
        detail=detail,
    )


# Pass-throughs

def init_db() -> None:
    db.init_db()


def archive_old_logs(*, retention_days: int = 90) -> dict[str, int]:
    return db.archive_old_logs(retention_days=retention_days)


def purge_soft_deleted_items() -> int:
    return db.purge_soft_deleted_items()


def validate_item_ids_available(
    item_ids: list[int],
    *,
    allow_donation_request_id: int | None = None,
    enforce_unique: bool = False,
) -> tuple[bool, str | None]:
    return db.validate_item_ids_available(
        item_ids,
        allow_donation_request_id=allow_donation_request_id,
        enforce_unique=enforce_unique,
    )


def get_gemini_api_token_setting() -> dict[str, Any] | None:
    return db.get_gemini_api_token_setting()


def set_gemini_api_token(token: str) -> dict[str, Any]:
    return db.set_gemini_api_token(token)


def delete_gemini_api_token() -> bool:
    return db.delete_gemini_api_token()


def get_gemini_model_setting() -> dict[str, Any] | None:
    return db.get_gemini_model_setting()


def set_gemini_model(model: str) -> dict[str, Any]:
    return db.set_gemini_model(model)
