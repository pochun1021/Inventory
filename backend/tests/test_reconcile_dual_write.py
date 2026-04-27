import unittest
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


if __name__ == "__main__":
    unittest.main()
