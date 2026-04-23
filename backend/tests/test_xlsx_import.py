import tempfile
import unittest
from io import BytesIO
from pathlib import Path

from openpyxl import Workbook

import db
import main as app_main
from xlsx_import import import_inventory_items_from_xlsx_content


class XlsxImportTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self._original_db_path = db.DB_PATH
        self._original_lock_path = db.LOCK_PATH

        db.DB_PATH = Path(self._tmpdir.name) / "inventory.xlsx"
        db.LOCK_PATH = Path(self._tmpdir.name) / "inventory.xlsx.lock"
        db.init_db()

    def tearDown(self) -> None:
        db.DB_PATH = self._original_db_path
        db.LOCK_PATH = self._original_lock_path
        self._tmpdir.cleanup()

    def test_inventory_number_column_maps_to_key_and_n_property_sn(self) -> None:
        workbook = Workbook()
        sheet = workbook.active
        sheet.append(["備註", "規格(大小/容量)", "財產編號", "品名", "型號", "單位", "購置日期", "放置地點", "保管人（單位）"])
        sheet.append(["memo", "spec", "INV-001", "筆電", "M1", "台", "2026-04-01", "A倉", "資訊組"])
        stream = BytesIO()
        workbook.save(stream)

        result = import_inventory_items_from_xlsx_content(
            stream.getvalue(),
            app_main.InventoryItemCreate,
            app_main.to_db_payload,
            db.create_item,
            db.create_items_bulk,
            selected_asset_type="11",
        )
        self.assertEqual(result["created"], 1)
        self.assertEqual(result["failed"], 0)

        rows = db.list_items()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].get("key"), "INV-001")
        self.assertEqual(rows[0].get("n_property_sn"), "INV-001")


if __name__ == "__main__":
    unittest.main()
