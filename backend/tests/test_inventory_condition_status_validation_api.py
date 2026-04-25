import tempfile
import unittest
from pathlib import Path

from fastapi import HTTPException

import db
import main as app_main


class InventoryConditionStatusValidationApiTests(unittest.TestCase):
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

    def _create_valid_item(self) -> app_main.InventoryItem:
        return app_main.create_inventory_item_api(
            app_main.InventoryItemCreate(
                asset_type="A1",
                asset_status="0",
                condition_status="0",
                name="測試品項",
                model="M1",
                name_code="01",
                name_code2="01",
                count=1,
            )
        )

    def test_create_item_rejects_unknown_condition_status(self) -> None:
        with self.assertRaises(HTTPException) as exc:
            app_main.create_inventory_item_api(
                app_main.InventoryItemCreate(
                    asset_type="A1",
                    asset_status="0",
                    condition_status="9",
                    name="測試品項",
                    model="M1",
                    name_code="01",
                    name_code2="01",
                    count=1,
                )
            )

        self.assertEqual(exc.exception.status_code, 400)
        self.assertEqual(exc.exception.detail, "condition_status code not found")

    def test_update_item_rejects_unknown_condition_status(self) -> None:
        created = self._create_valid_item()

        with self.assertRaises(HTTPException) as exc:
            app_main.update_inventory_item_api(
                created.id,
                app_main.InventoryItemCreate(
                    asset_type="A1",
                    asset_status="0",
                    condition_status="9",
                    key=created.key,
                    name=created.name,
                    model=created.model,
                    name_code=created.name_code,
                    name_code2=created.name_code2,
                    count=1,
                    specification=created.specification,
                    unit=created.unit,
                    location=created.location,
                    memo=created.memo,
                    memo2=created.memo2,
                    keeper=created.keeper,
                    borrower=created.borrower,
                ),
            )

        self.assertEqual(exc.exception.status_code, 400)
        self.assertEqual(exc.exception.detail, "condition_status code not found")

    def test_detach_rejects_unknown_condition_status(self) -> None:
        parent = app_main.create_inventory_item_api(
            app_main.InventoryItemCreate(
                asset_type="11",
                asset_status="0",
                condition_status="0",
                key="11-3140101-0030-0006351-000000",
                name="母件設備",
                name_code="01",
                name_code2="01",
                model="PARENT-M",
                specification="PARENT-S",
                location="A1",
                keeper="admin",
            )
        )

        with self.assertRaises(HTTPException) as exc:
            app_main.detach_inventory_item_api(
                parent.id,
                app_main.InventoryItemDetachCreate(
                    name_code="01",
                    name_code2="99",
                    seq="00",
                    condition_status="9",
                ),
            )

        self.assertEqual(exc.exception.status_code, 400)
        self.assertEqual(exc.exception.detail, "condition_status code not found")


if __name__ == "__main__":
    unittest.main()
