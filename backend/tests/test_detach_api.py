import tempfile
import unittest
from pathlib import Path

from fastapi import HTTPException

import db
import main as app_main


class DetachApiTests(unittest.TestCase):
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

    def _create_parent_item(self, key: str = "11-3140101-0030-0006351-000000") -> int:
        created = app_main.create_inventory_item_api(
            app_main.InventoryItemCreate(
                asset_type="11",
                asset_status="0",
                condition_status="0",
                key=key,
                name="母件設備",
                name_code="01",
                name_code2="01",
                model="PARENT-M",
                specification="PARENT-S",
                location="A1",
                keeper="admin",
            )
        )
        return created.id

    def test_detach_creates_child_item_and_updates_parent_relation(self) -> None:
        parent_id = self._create_parent_item()

        detached = app_main.detach_inventory_item_api(
            parent_id,
            app_main.InventoryItemDetachCreate(
                name_code="01",
                name_code2="99",
                seq="00",
            ),
        )

        self.assertEqual(detached.key, "11-3140101-0030-0006351-019900")
        self.assertEqual(detached.parent_item_id, parent_id)
        self.assertFalse(detached.is_parent_item)
        self.assertFalse(detached.has_detached_children)

        parent = app_main.get_inventory_item_api(parent_id)
        self.assertTrue(parent.is_parent_item)
        self.assertTrue(parent.has_detached_children)

    def test_detach_rejects_key_collision(self) -> None:
        parent_id = self._create_parent_item()

        app_main.detach_inventory_item_api(
            parent_id,
            app_main.InventoryItemDetachCreate(name_code="01", name_code2="01", seq="01"),
        )

        with self.assertRaises(HTTPException) as exc:
            app_main.detach_inventory_item_api(
                parent_id,
                app_main.InventoryItemDetachCreate(name_code="01", name_code2="01", seq="01"),
            )

        self.assertEqual(exc.exception.status_code, 409)

    def test_detach_requires_parent_item_key(self) -> None:
        non_parent_id = self._create_parent_item(key="11-3140101-0030-0006351-010100")

        with self.assertRaises(HTTPException) as exc:
            app_main.detach_inventory_item_api(
                non_parent_id,
                app_main.InventoryItemDetachCreate(name_code="01", name_code2="01", seq="00"),
            )

        self.assertEqual(exc.exception.status_code, 400)

    def test_parent_delete_is_blocked_when_active_children_exist(self) -> None:
        parent_id = self._create_parent_item()
        child = app_main.detach_inventory_item_api(
            parent_id,
            app_main.InventoryItemDetachCreate(name_code="01", name_code2="01", seq="02"),
        )

        with self.assertRaises(HTTPException) as exc:
            app_main.delete_inventory_item_api(parent_id)

        self.assertEqual(exc.exception.status_code, 409)

        deleted_child = app_main.delete_inventory_item_api(child.id)
        self.assertEqual(deleted_child, {"success": True})

        deleted_parent = app_main.delete_inventory_item_api(parent_id)
        self.assertEqual(deleted_parent, {"success": True})


if __name__ == "__main__":
    unittest.main()
