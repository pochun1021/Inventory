from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from google_sheets import _batch_clear_and_update, _ensure_sheets_exist, _ensure_spreadsheet_id, get_google_sheets_config
from supabase_client import get_supabase_client

SYNC_TABLES: list[str] = [
    "inventory_items",
    "asset_status_codes",
    "issue_requests",
    "issue_items",
    "borrow_requests",
    "borrow_request_lines",
    "borrow_allocations",
    "donation_requests",
    "donation_items",
    "movement_ledger",
    "operation_logs",
    "order_sn",
    "sync_job_log",
]

PAGE_SIZE = 1000


@dataclass
class SyncResult:
    job_id: int | None
    status: str
    total_rows: int
    sheets_written: int
    error: str = ""



def _now_str() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")



def _fetch_all_rows(table: str) -> list[dict[str, Any]]:
    client = get_supabase_client()
    offset = 0
    rows: list[dict[str, Any]] = []

    while True:
        response = client.table(table).select("*").range(offset, offset + PAGE_SIZE - 1).execute()
        batch = response.data or []
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            break
        offset += PAGE_SIZE

    return rows



def _to_sheet_entry(table: str, rows: list[dict[str, Any]]) -> tuple[str, list[str], list[list[str]]]:
    headers: list[str] = []
    for row in rows:
        for key in row.keys():
            if key not in headers:
                headers.append(key)

    if not headers:
        headers = ["empty"]

    values: list[list[str]] = []
    for row in rows:
        values.append(["" if row.get(header) is None else str(row.get(header)) for header in headers])

    return table, headers, values



def _create_sync_job(status: str = "running", error: str = "") -> int:
    client = get_supabase_client()
    inserted = (
        client.table("sync_job_log")
        .insert(
            {
                "job_type": "sheets_full_backup",
                "status": status,
                "started_at": _now_str(),
                "finished_at": None,
                "error_message": error or None,
                "total_rows": 0,
                "sheets_written": 0,
            }
        )
        .execute()
    )
    data = inserted.data or []
    if not data:
        raise RuntimeError("failed to create sync job log")
    return int(data[0]["id"])



def _finish_sync_job(job_id: int, *, status: str, total_rows: int, sheets_written: int, error: str = "") -> None:
    client = get_supabase_client()
    (
        client.table("sync_job_log")
        .update(
            {
                "status": status,
                "finished_at": _now_str(),
                "error_message": error or None,
                "total_rows": total_rows,
                "sheets_written": sheets_written,
            }
        )
        .eq("id", job_id)
        .execute()
    )



def sync_supabase_tables_to_google_sheets() -> dict[str, Any]:
    config = get_google_sheets_config()
    if not config:
        raise RuntimeError("Google Sheets is not configured.")

    job_id = _create_sync_job()
    total_rows = 0
    written = 0

    try:
        entries: list[tuple[str, list[str], list[list[str]]]] = []
        for table in SYNC_TABLES:
            rows = _fetch_all_rows(table)
            total_rows += len(rows)
            entries.append(_to_sheet_entry(table, rows))

        spreadsheet_id = _ensure_spreadsheet_id(config)
        _ensure_sheets_exist(spreadsheet_id, [entry[0] for entry in entries])
        _batch_clear_and_update(spreadsheet_id, entries)

        written = len(entries)
        _finish_sync_job(job_id, status="success", total_rows=total_rows, sheets_written=written)
        return SyncResult(job_id=job_id, status="success", total_rows=total_rows, sheets_written=written).__dict__
    except Exception as exc:  # pragma: no cover - external dependencies
        _finish_sync_job(job_id, status="failed", total_rows=total_rows, sheets_written=written, error=str(exc))
        return SyncResult(job_id=job_id, status="failed", total_rows=total_rows, sheets_written=written, error=str(exc)).__dict__



def list_sync_jobs(*, limit: int = 50) -> list[dict[str, Any]]:
    client = get_supabase_client()
    response = (
        client.table("sync_job_log")
        .select("*")
        .order("id", desc=True)
        .limit(limit)
        .execute()
    )
    return response.data or []
