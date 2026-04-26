from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from openpyxl import load_workbook

import db
from migration_service import TARGET_TABLES, run_xlsx_to_supabase_migration
from supabase_client import get_supabase_client

REPORT_DIR = Path(__file__).resolve().parent / "migration_reports"
PAGE_SIZE = 1000


@dataclass
class TableDiff:
    table: str
    xlsx_rows: int
    supabase_rows: int
    xlsx_digest: str
    supabase_digest: str
    status: str


def _xlsx_rows(table: str) -> list[dict[str, Any]]:
    if not db.DB_PATH.exists():
        return []
    wb = load_workbook(db.DB_PATH)
    if table not in wb.sheetnames:
        return []
    return db._read_rows(wb[table])  # noqa: SLF001


def _supabase_rows(table: str) -> list[dict[str, Any]]:
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


def _digest_rows(rows: list[dict[str, Any]]) -> str:
    normalized = [json.dumps(row, ensure_ascii=False, sort_keys=True, default=str) for row in rows]
    normalized.sort()
    payload = "\n".join(normalized).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def reconcile(*, repair: bool) -> dict[str, Any]:
    table_results: list[TableDiff] = []

    for table in TARGET_TABLES:
        xlsx_rows = _xlsx_rows(table)
        supabase_rows = _supabase_rows(table)
        xlsx_digest = _digest_rows(xlsx_rows)
        supabase_digest = _digest_rows(supabase_rows)
        status = "match" if xlsx_digest == supabase_digest else "mismatch"
        table_results.append(
            TableDiff(
                table=table,
                xlsx_rows=len(xlsx_rows),
                supabase_rows=len(supabase_rows),
                xlsx_digest=xlsx_digest,
                supabase_digest=supabase_digest,
                status=status,
            )
        )

    mismatches = [item for item in table_results if item.status == "mismatch"]
    repaired = False
    repair_report: dict[str, Any] | None = None

    if repair and mismatches:
        repair_report = run_xlsx_to_supabase_migration(dry_run=False)
        repaired = repair_report.get("status") == "success"

    status = "success" if not mismatches else ("repaired" if repaired else "mismatch")
    report = {
        "status": status,
        "table_results": [asdict(item) for item in table_results],
        "mismatch_tables": [item.table for item in mismatches],
        "repaired": repaired,
        "repair_report": repair_report,
    }

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    report_path = REPORT_DIR / "reconcile-latest.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description="Compare XLSX and Supabase datasets and optionally repair by re-syncing.")
    parser.add_argument("--repair", action="store_true", help="Run XLSX -> Supabase full migration when mismatch is found")
    args = parser.parse_args()

    report = reconcile(repair=args.repair)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if report["status"] == "mismatch":
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
