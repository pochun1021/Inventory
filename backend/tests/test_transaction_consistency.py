import tempfile
import unittest
from pathlib import Path

import db


class TransactionConsistencyTests(unittest.TestCase):
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

    def _create_item(self, *, count: int) -> int:
        return db.create_item(
            {
                "asset_type": "A1",
                "asset_status": "0",
                "name": "測試品項",
                "model": "M1",
                "count": count,
            }
        )

    def _issue_payload(self) -> dict:
        return {
            "requester": "tester",
            "department": "qa",
            "purpose": "test",
            "request_date": "2026-04-10",
            "memo": "",
        }

    def _borrow_payload(self, *, status: str) -> dict:
        return {
            "borrower": "tester",
            "department": "qa",
            "purpose": "test",
            "borrow_date": "2026-04-10",
            "due_date": "2026-04-20",
            "return_date": "",
            "status": status,
            "memo": "",
        }

    def _donation_payload(self) -> dict:
        return {
            "donor": "tester",
            "department": "qa",
            "recipient": "receiver",
            "purpose": "test",
            "donation_date": "2026-04-10",
            "memo": "",
        }

    def test_issue_request_updates_inventory_and_reverts_on_delete(self) -> None:
        item_id = self._create_item(count=5)

        request_id = db.create_issue_request(
            self._issue_payload(),
            [{"item_id": item_id, "quantity": 3, "note": ""}],
        )
        item_after_create = db.get_item_by_id(item_id)
        self.assertIsNotNone(item_after_create)
        self.assertEqual(item_after_create["count"], 2)
        self.assertEqual(item_after_create["asset_status"], "0")

        db.update_issue_request(
            request_id,
            self._issue_payload(),
            [{"item_id": item_id, "quantity": 5, "note": ""}],
        )
        item_after_update = db.get_item_by_id(item_id)
        self.assertIsNotNone(item_after_update)
        self.assertEqual(item_after_update["count"], 0)
        self.assertEqual(item_after_update["asset_status"], "1")

        db.delete_issue_request(request_id)
        item_after_delete = db.get_item_by_id(item_id)
        self.assertIsNotNone(item_after_delete)
        self.assertEqual(item_after_delete["count"], 5)
        self.assertEqual(item_after_delete["asset_status"], "0")

    def test_issue_request_rejects_overdraw(self) -> None:
        item_id = self._create_item(count=2)

        with self.assertRaisesRegex(ValueError, "quantity is insufficient"):
            db.create_issue_request(
                self._issue_payload(),
                [{"item_id": item_id, "quantity": 3, "note": ""}],
            )

    def test_borrow_return_flow_updates_inventory(self) -> None:
        item_id = self._create_item(count=2)

        request_id = db.create_borrow_request(
            self._borrow_payload(status="borrowed"),
            [{"item_id": item_id, "quantity": 2, "note": ""}],
        )
        item_after_borrow = db.get_item_by_id(item_id)
        self.assertIsNotNone(item_after_borrow)
        self.assertEqual(item_after_borrow["count"], 0)
        self.assertEqual(item_after_borrow["asset_status"], "2")

        db.update_borrow_request(
            request_id,
            self._borrow_payload(status="returned"),
            [{"item_id": item_id, "quantity": 2, "note": ""}],
        )
        item_after_return = db.get_item_by_id(item_id)
        self.assertIsNotNone(item_after_return)
        self.assertEqual(item_after_return["count"], 2)
        self.assertEqual(item_after_return["asset_status"], "0")

    def test_donation_requires_full_available_count_and_reverts_on_delete(self) -> None:
        item_id = self._create_item(count=3)

        with self.assertRaisesRegex(ValueError, "donation quantity must equal available count"):
            db.create_donation_request(
                self._donation_payload(),
                [{"item_id": item_id, "quantity": 2, "note": ""}],
            )

        request_id = db.create_donation_request(
            self._donation_payload(),
            [{"item_id": item_id, "quantity": 3, "note": ""}],
        )
        item_after_create = db.get_item_by_id(item_id)
        self.assertIsNotNone(item_after_create)
        self.assertEqual(item_after_create["count"], 0)
        self.assertEqual(item_after_create["asset_status"], "3")

        db.delete_donation_request(request_id)
        item_after_delete = db.get_item_by_id(item_id)
        self.assertIsNotNone(item_after_delete)
        self.assertEqual(item_after_delete["count"], 3)
        self.assertEqual(item_after_delete["asset_status"], "0")


if __name__ == "__main__":
    unittest.main()
