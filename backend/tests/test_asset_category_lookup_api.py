import tempfile
import unittest
from pathlib import Path

from fastapi import HTTPException

import db
import main as app_main


class AssetCategoryLookupApiTests(unittest.TestCase):
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

    def test_asset_category_lookup_crud(self) -> None:
        created = app_main.create_asset_category_api(
            app_main.AssetCategoryLookupCreate(
                name_code="3",
                asset_category_name="螢幕",
                name_code2="1",
                description="27吋以上",
            )
        )
        self.assertEqual(created.name_code, "03")
        self.assertEqual(created.name_code2, "01")

        rows = app_main.list_asset_categories_api()
        self.assertTrue(any(row.name_code == "03" and row.name_code2 == "01" for row in rows))

        updated = app_main.update_asset_category_api(
            "03",
            "01",
            app_main.AssetCategoryLookupUpdate(
                name_code="03",
                name_code2="02",
                asset_category_name="螢幕",
                description="24吋以下",
            ),
        )
        self.assertEqual(updated.name_code2, "02")
        self.assertEqual(updated.description, "24吋以下")

        deleted = app_main.delete_asset_category_api("03", "02")
        self.assertEqual(deleted, {"success": True})

    def test_asset_category_rejects_duplicate_pair(self) -> None:
        with self.assertRaises(HTTPException) as exc:
            app_main.create_asset_category_api(
                app_main.AssetCategoryLookupCreate(
                    name_code="01",
                    asset_category_name="筆記型電腦",
                    name_code2="01",
                    description="重複",
                )
            )
        self.assertEqual(exc.exception.status_code, 409)

    def test_delete_asset_category_rejects_when_in_use(self) -> None:
        app_main.create_inventory_item_api(
            app_main.InventoryItemCreate(
                asset_type="A1",
                asset_status="0",
                condition_status="0",
                name="測試品項",
                model="M1",
                name_code="01",
                name_code2="01",
                borrower="",
                count=1,
            )
        )
        with self.assertRaises(HTTPException) as exc:
            app_main.delete_asset_category_api("01", "01")
        self.assertEqual(exc.exception.status_code, 409)

    def test_item_api_rejects_invalid_name_code_pair(self) -> None:
        with self.assertRaises(HTTPException) as exc:
            app_main.create_inventory_item_api(
                app_main.InventoryItemCreate(
                    asset_type="A1",
                    asset_status="0",
                    condition_status="0",
                    name="測試品項",
                    model="M1",
                    name_code="99",
                    name_code2="99",
                    borrower="",
                    count=1,
                )
            )
        self.assertEqual(exc.exception.status_code, 400)
        self.assertIn("invalid name_code/name_code2 pair", str(exc.exception.detail))

    def test_item_response_contains_new_fields(self) -> None:
        created = app_main.create_inventory_item_api(
            app_main.InventoryItemCreate(
                asset_type="A1",
                asset_status="0",
                condition_status="1",
                name="測試品項",
                model="M1",
                name_code="01",
                name_code2="01",
                borrower="借用人A",
                start_date="2026-04-22",
                count=1,
            )
        )
        self.assertEqual(created.condition_status, "1")
        self.assertEqual(created.borrower, "借用人A")
        self.assertIsNotNone(created.start_date)
        self.assertIsNotNone(created.create_at)
        self.assertIsNotNone(created.created_at)
        self.assertEqual(created.create_by, "system")
        self.assertEqual(created.created_by, "system")


if __name__ == "__main__":
    unittest.main()
