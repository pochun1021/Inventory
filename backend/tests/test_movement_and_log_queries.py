import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path

import db


class MovementAndLogQueryTests(unittest.TestCase):
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

    def _create_item(self, *, name: str = "測試品項") -> int:
        return db.create_item(
            {
                "asset_type": "A1",
                "asset_status": "0",
                "name": name,
                "model": "M1",
                "count": 1,
            }
        )

    def test_issue_flow_writes_movement_ledger(self) -> None:
        item_id = self._create_item()
        request_id = db.create_issue_request(
            {
                "requester": "tester",
                "department": "qa",
                "purpose": "test",
                "request_date": "2026-04-10",
                "memo": "",
            },
            [{"item_id": item_id, "quantity": 1, "note": ""}],
        )

        rows = db.list_movement_ledger(entity="issue_request", entity_id=request_id, item_id=item_id)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["action"], "create")
        self.assertEqual(rows[0]["from_status"], "0")
        self.assertEqual(rows[0]["to_status"], "1")
        self.assertEqual(rows[0]["operator"], "system")

    def test_borrow_return_flow_writes_open_and_return_movements(self) -> None:
        item_id = self._create_item(name="借用品項")
        request_id = db.create_borrow_request(
            {
                "borrower": "tester",
                "department": "qa",
                "purpose": "test",
                "borrow_date": "2026-04-10",
                "due_date": "2026-04-20",
                "return_date": "",
                "status": "borrowed",
                "memo": "",
            },
            [{"item_id": item_id, "quantity": 1, "note": ""}],
        )
        db.update_borrow_request(
            request_id,
            {
                "borrower": "tester",
                "department": "qa",
                "purpose": "test",
                "borrow_date": "2026-04-10",
                "due_date": "2026-04-20",
                "return_date": "2026-04-12",
                "status": "returned",
                "memo": "",
            },
            [{"item_id": item_id, "quantity": 1, "note": ""}],
        )

        rows = db.list_movement_ledger(entity="borrow_request", entity_id=request_id, item_id=item_id)
        self.assertEqual(len(rows), 2)
        transitions = {(row["from_status"], row["to_status"], row["action"]) for row in rows}
        self.assertIn(("0", "2", "create"), transitions)
        self.assertIn(("2", "0", "update"), transitions)

    def test_operation_log_filters_by_entity_id_and_item_id(self) -> None:
        db.log_inventory_action(
            action="update",
            entity="issue_request",
            entity_id=777,
            detail={"item_id": 11, "note": "target"},
        )
        db.log_inventory_action(
            action="update",
            entity="issue_request",
            entity_id=778,
            detail={"item_id": 22, "note": "other"},
        )

        filtered_by_entity = db.list_operation_logs(entity="issue_request", entity_id=777)
        self.assertEqual(len(filtered_by_entity), 1)
        self.assertEqual(filtered_by_entity[0]["entity_id"], 777)

        filtered_by_item = db.list_operation_logs(entity="issue_request", item_id=11)
        self.assertEqual(len(filtered_by_item), 1)
        self.assertEqual(filtered_by_item[0]["detail"].get("item_id"), 11)

    def test_time_range_filter_applies_to_movement_and_operation_logs(self) -> None:
        item_id = self._create_item(name="時間測試")
        db.create_issue_request(
            {
                "requester": "tester",
                "department": "qa",
                "purpose": "time",
                "request_date": "2026-04-10",
                "memo": "",
            },
            [{"item_id": item_id, "quantity": 1, "note": ""}],
        )
        db.log_inventory_action(action="create", entity="inventory_item", detail={"item_id": item_id})

        future_start = datetime.now() + timedelta(days=1)
        future_end = future_start + timedelta(days=1)
        self.assertEqual(db.list_movement_ledger(start_at=future_start, end_at=future_end), [])
        self.assertEqual(db.list_operation_logs(start_at=future_start, end_at=future_end), [])


if __name__ == "__main__":
    unittest.main()
