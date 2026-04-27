import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import reconcile_dual_write


class ReconcileDualWriteTests(unittest.TestCase):
    @staticmethod
    def _table_result(*, table: str, status: str) -> reconcile_dual_write.TableDiff:
        return reconcile_dual_write.TableDiff(
            table=table,
            xlsx_rows=1,
            supabase_rows=1,
            xlsx_digest="x",
            supabase_digest="x" if status == "match" else "y",
            status=status,
        )

    def test_repair_uses_post_repair_reconcile_result(self) -> None:
        pre_results = [self._table_result(table="inventory_items", status="mismatch")]
        post_results = [self._table_result(table="inventory_items", status="match")]

        with (
            patch("reconcile_dual_write._collect_table_results", side_effect=[pre_results, post_results]) as collect_mock,
            patch(
                "reconcile_dual_write.run_xlsx_to_supabase_migration",
                return_value={"status": "success", "job_id": "job-1"},
            ) as migration_mock,
        ):
            report = reconcile_dual_write.reconcile(repair=True)

        self.assertEqual(collect_mock.call_count, 2)
        migration_mock.assert_called_once_with(dry_run=False, replace_existing=True, target_tables=None)
        self.assertEqual(report["status"], "repaired")
        self.assertTrue(report["repaired"])
        self.assertEqual(report["mismatch_tables"], [])

    def test_check_only_mismatch_returns_exit_error(self) -> None:
        mismatch_results = [self._table_result(table="inventory_items", status="mismatch")]

        with patch("reconcile_dual_write._collect_table_results", return_value=mismatch_results):
            report = reconcile_dual_write.reconcile(repair=False)

        self.assertEqual(report["status"], "mismatch")
        self.assertEqual(report["mismatch_tables"], ["inventory_items"])

    def test_repair_table_scopes_migration_targets(self) -> None:
        pre_results = [self._table_result(table="asset_category_name", status="mismatch")]
        post_results = [self._table_result(table="asset_category_name", status="match")]

        with (
            patch("reconcile_dual_write._collect_table_results", side_effect=[pre_results, post_results]),
            patch(
                "reconcile_dual_write.run_xlsx_to_supabase_migration",
                return_value={"status": "success", "job_id": "job-2"},
            ) as migration_mock,
        ):
            report = reconcile_dual_write.reconcile(repair=False, repair_tables=["asset_category_name"])

        migration_mock.assert_called_once_with(
            dry_run=False,
            replace_existing=True,
            target_tables=["asset_category_name"],
        )
        self.assertEqual(report["status"], "repaired")

    def test_xlsx_rows_asset_category_does_not_backfill_from_inventory(self) -> None:
        fake_wb = type(
            "FakeWorkbook",
            (),
            {
                "sheetnames": ["asset_category_name", "inventory_items"],
                "__getitem__": lambda self, key: key,
            },
        )()

        with TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "inventory.xlsx"
            db_path.write_text("x", encoding="utf-8")
            with (
                patch("reconcile_dual_write.db.DB_PATH", db_path),
                patch("reconcile_dual_write.load_workbook", return_value=fake_wb),
                patch(
                    "reconcile_dual_write.db._read_rows",  # noqa: SLF001
                    return_value=[{"name_code": "01", "name_code2": "01", "asset_category_name": "筆電"}],
                ),
            ):
                rows = reconcile_dual_write._xlsx_rows("asset_category_name")

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["name_code"], "01")
        self.assertEqual(rows[0]["name_code2"], "01")


if __name__ == "__main__":
    unittest.main()
