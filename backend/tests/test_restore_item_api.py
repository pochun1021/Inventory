import tempfile
import unittest
from pathlib import Path

from fastapi import HTTPException

import db
import main as app_main


class RestoreItemApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self._original_db_path = db.DB_PATH
        self._original_lock_path = db.LOCK_PATH
        self._original_log_archive_dir = db.LOG_ARCHIVE_DIR

        db.DB_PATH = Path(self._tmpdir.name) / "inventory.xlsx"
        db.LOCK_PATH = Path(self._tmpdir.name) / "inventory.xlsx.lock"
        db.LOG_ARCHIVE_DIR = Path(self._tmpdir.name) / "log_archive"
        db.init_db()

    def tearDown(self) -> None:
        db.DB_PATH = self._original_db_path
        db.LOCK_PATH = self._original_lock_path
        db.LOG_ARCHIVE_DIR = self._original_log_archive_dir
        self._tmpdir.cleanup()

    def _create_item(self, name: str = "Restore Test Item") -> int:
        created = app_main.create_inventory_item_api(
            app_main.InventoryItemCreate(
                asset_type="A1",
                asset_status="0",
                condition_status="0",
                name=name,
                model="M1",
                count=1,
            )
        )
        return created.id

    def test_restore_item_success_and_deleted_scope_filters(self) -> None:
        item_id = self._create_item()

        app_main.delete_inventory_item_api(item_id)

        active_rows_before_restore = app_main.get_inventory_items(deleted_scope="active", page=1, page_size=100).items
        deleted_rows_before_restore = app_main.get_inventory_items(deleted_scope="deleted", page=1, page_size=100).items
        self.assertFalse(any(row.id == item_id for row in active_rows_before_restore))
        self.assertTrue(any(row.id == item_id for row in deleted_rows_before_restore))

        restore_response = app_main.restore_inventory_item_api(item_id)
        self.assertEqual(restore_response, {"success": True})

        active_rows_after_restore = app_main.get_inventory_items(deleted_scope="active", page=1, page_size=100).items
        deleted_rows_after_restore = app_main.get_inventory_items(deleted_scope="deleted", page=1, page_size=100).items
        self.assertTrue(any(row.id == item_id for row in active_rows_after_restore))
        self.assertFalse(any(row.id == item_id for row in deleted_rows_after_restore))

    def test_restore_missing_or_not_deleted_item_returns_404(self) -> None:
        item_id = self._create_item(name="Not Deleted Item")

        with self.assertRaises(HTTPException) as not_deleted_exc:
            app_main.restore_inventory_item_api(item_id)
        self.assertEqual(not_deleted_exc.exception.status_code, 404)

        with self.assertRaises(HTTPException) as missing_exc:
            app_main.restore_inventory_item_api(999999)
        self.assertEqual(missing_exc.exception.status_code, 404)

    def test_restore_logs_include_deleted_metadata(self) -> None:
        item_id = self._create_item(name="Log Restore Item")
        app_main.delete_inventory_item_api(item_id)

        restore_response = app_main.restore_inventory_item_api(item_id)
        self.assertEqual(restore_response, {"success": True})

        logs = db.list_operation_logs(action="restore", entity="inventory_item", entity_id=item_id)
        self.assertGreaterEqual(len(logs), 1)
        latest = logs[0]
        detail = latest.get("detail", {})

        self.assertEqual(str(latest.get("status")), "success")
        self.assertIn("deleted_at", detail)
        self.assertIn("deleted_by", detail)
        self.assertEqual(str(detail.get("restored_by")), "system")

    def test_invalid_deleted_scope_returns_400(self) -> None:
        self._create_item(name="Scope Test Item")
        with self.assertRaises(HTTPException) as exc:
            app_main.get_inventory_items(deleted_scope="invalid", page=1, page_size=10)
        self.assertEqual(exc.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
