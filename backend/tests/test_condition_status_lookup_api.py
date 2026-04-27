import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

import db
import main as app_main


class ConditionStatusLookupApiTests(unittest.TestCase):
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

    def test_condition_status_lookup_crud(self) -> None:
        created = app_main.create_condition_status_code_api(
            app_main.ConditionStatusCodeCreate(
                code="8",
                description="待維修",
            )
        )
        self.assertEqual(created.code, "8")
        self.assertEqual(created.description, "待維修")

        rows = app_main.list_condition_status_codes_api()
        self.assertTrue(any(row.code == "8" for row in rows))

        updated = app_main.update_condition_status_code_api(
            "8",
            app_main.ConditionStatusCodeUpdate(
                code="9",
                description="已報廢",
            ),
        )
        self.assertEqual(updated.code, "9")
        self.assertEqual(updated.description, "已報廢")

        deleted = app_main.delete_condition_status_code_api("9")
        self.assertEqual(deleted, {"success": True})

    def test_condition_status_rejects_duplicate_code(self) -> None:
        with self.assertRaises(HTTPException) as exc:
            app_main.create_condition_status_code_api(
                app_main.ConditionStatusCodeCreate(
                    code="0",
                    description="重複",
                )
            )
        self.assertEqual(exc.exception.status_code, 409)

    def test_update_condition_status_code_syncs_inventory_items(self) -> None:
        created = app_main.create_inventory_item_api(
            app_main.InventoryItemCreate(
                asset_type="A1",
                asset_status="0",
                condition_status="1",
                name="測試品項",
                model="M1",
                name_code="01",
                name_code2="01",
                count=1,
            )
        )

        app_main.update_condition_status_code_api(
            "1",
            app_main.ConditionStatusCodeUpdate(code="9", description="測試改碼"),
        )
        fetched = app_main.get_inventory_item_api(created.id)
        self.assertEqual(fetched.condition_status, "9")

    def test_delete_condition_status_rejects_when_in_use(self) -> None:
        app_main.create_inventory_item_api(
            app_main.InventoryItemCreate(
                asset_type="A1",
                asset_status="0",
                condition_status="1",
                name="測試品項",
                model="M1",
                name_code="01",
                name_code2="01",
                count=1,
            )
        )
        with self.assertRaises(HTTPException) as exc:
            app_main.delete_condition_status_code_api("1")
        self.assertEqual(exc.exception.status_code, 409)

    def test_get_inventory_item_does_not_write_read_log(self) -> None:
        created = app_main.create_inventory_item_api(
            app_main.InventoryItemCreate(
                asset_type="A1",
                asset_status="0",
                condition_status="1",
                name="測試品項",
                model="M1",
                name_code="01",
                name_code2="01",
                count=1,
            )
        )

        with patch.object(app_main, "log_inventory_action", side_effect=RuntimeError("sync failed")) as mock_log:
            fetched = app_main.get_inventory_item_api(created.id)

        self.assertEqual(fetched.id, created.id)
        mock_log.assert_not_called()


if __name__ == "__main__":
    unittest.main()
