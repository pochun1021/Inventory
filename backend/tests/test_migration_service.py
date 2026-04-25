import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import migration_service


class _FakeTableQuery:
    def __init__(self, table: str, store: dict[str, list[dict]]):
        self._table = table
        self._store = store
        self._payload: list[dict] = []

    def upsert(self, payload: list[dict]):
        self._payload = payload
        return self

    def execute(self):
        copied = [dict(row) for row in self._payload]
        self._store.setdefault(self._table, []).extend(copied)
        return SimpleNamespace(data=copied)


class _FakeRpcQuery:
    def __init__(self, call_log: list[tuple[str, dict]]):
        self._call_log = call_log

    def execute(self):
        return SimpleNamespace(data=[])


class _FakeSupabaseClient:
    def __init__(self):
        self.upserts: dict[str, list[dict]] = {}
        self.rpc_calls: list[tuple[str, dict]] = []

    def table(self, table_name: str):
        return _FakeTableQuery(table_name, self.upserts)

    def rpc(self, name: str, payload: dict):
        self.rpc_calls.append((name, payload))
        return _FakeRpcQuery(self.rpc_calls)


class MigrationServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self._original_report_dir = migration_service.REPORT_DIR
        migration_service.REPORT_DIR = Path(self._tmpdir.name) / "reports"

    def tearDown(self) -> None:
        migration_service.REPORT_DIR = self._original_report_dir
        self._tmpdir.cleanup()

    @staticmethod
    def _sheet_fixture(table: str) -> list[dict]:
        dataset: dict[str, list[dict]] = {
            "asset_status_codes": [{"code": "0", "description": "庫存", "created_at": "", "updated_at": ""}],
            "inventory_items": [{"id": "1", "name": "item-a"}, {"id": "2", "name": "item-b"}],
            "issue_requests": [{"id": "10", "requester": "tester"}],
            "issue_items": [
                {"id": "100", "request_id": "10", "item_id": "1", "quantity": "1", "note": "ok"},
                {"id": "101", "request_id": "10", "item_id": "999", "quantity": "1", "note": "orphan"},
            ],
            "borrow_requests": [],
            "borrow_request_lines": [],
            "borrow_allocations": [],
            "donation_requests": [{"id": "20", "donor": "tester"}],
            "donation_items": [
                {"id": "200", "request_id": "20", "item_id": "2", "quantity": "1", "note": "ok"},
                {"id": "201", "request_id": "20", "item_id": "888", "quantity": "1", "note": "orphan"},
            ],
            "movement_ledger": [],
            "operation_logs": [],
            "order_sn": [{"name": "item", "current_value": "2"}],
        }
        return dataset.get(table, [])

    def test_dry_run_reports_orphan_skips(self) -> None:
        fake_client = _FakeSupabaseClient()

        with (
            patch("migration_service.get_supabase_client", return_value=fake_client),
            patch("migration_service._read_sheet_rows", side_effect=self._sheet_fixture),
        ):
            report = migration_service.run_xlsx_to_supabase_migration(dry_run=True)

        self.assertEqual(report["status"], "success")
        issue_table = next(row for row in report["tables"] if row["table"] == "issue_items")
        donation_table = next(row for row in report["tables"] if row["table"] == "donation_items")
        self.assertEqual(issue_table["skip_reason"], "orphan_item_id")
        self.assertEqual(issue_table["skipped_rows"], 1)
        self.assertIn(999, issue_table["skipped_samples"])
        self.assertEqual(donation_table["skip_reason"], "orphan_item_id")
        self.assertEqual(donation_table["skipped_rows"], 1)
        self.assertIn(888, donation_table["skipped_samples"])

    def test_real_migration_skips_orphans_and_keeps_valid_rows(self) -> None:
        fake_client = _FakeSupabaseClient()

        with (
            patch("migration_service.get_supabase_client", return_value=fake_client),
            patch("migration_service._read_sheet_rows", side_effect=self._sheet_fixture),
        ):
            report = migration_service.run_xlsx_to_supabase_migration(dry_run=False)

        self.assertEqual(report["status"], "success")
        issue_rows = fake_client.upserts.get("issue_items", [])
        donation_rows = fake_client.upserts.get("donation_items", [])
        self.assertEqual([row["item_id"] for row in issue_rows], [1])
        self.assertEqual([row["item_id"] for row in donation_rows], [2])
        self.assertIn(("admin_set_sequences", {}), fake_client.rpc_calls)

        issue_table = next(row for row in report["tables"] if row["table"] == "issue_items")
        self.assertEqual(issue_table["status"], "ok_with_skips")
        self.assertEqual(issue_table["skip_reason"], "orphan_item_id")


if __name__ == "__main__":
    unittest.main()
