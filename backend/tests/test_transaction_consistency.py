import tempfile
import unittest
from datetime import date
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

    def _create_item(self, *, asset_status: str = "0", count: int = 1) -> int:
        return db.create_item(
            {
                "asset_type": "A1",
                "asset_status": asset_status,
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

    def test_quantity_must_be_one(self) -> None:
        item_id = self._create_item()
        with self.assertRaisesRegex(ValueError, "quantity must be 1"):
            db.create_issue_request(
                self._issue_payload(),
                [{"item_id": item_id, "quantity": 2, "note": ""}],
            )

    def test_item_id_cannot_be_duplicated(self) -> None:
        item_id = self._create_item()
        with self.assertRaisesRegex(ValueError, "item_id cannot be duplicated"):
            db.create_issue_request(
                self._issue_payload(),
                [
                    {"item_id": item_id, "quantity": 1, "note": ""},
                    {"item_id": item_id, "quantity": 1, "note": ""},
                ],
            )

    def test_create_request_rejects_unavailable_item(self) -> None:
        unavailable_item_id = self._create_item(asset_status="2")
        with self.assertRaisesRegex(ValueError, f"item_id {unavailable_item_id} is unavailable"):
            db.create_issue_request(
                self._issue_payload(),
                [{"item_id": unavailable_item_id, "quantity": 1, "note": ""}],
            )

    def test_issue_request_updates_status_only(self) -> None:
        item_id = self._create_item(count=5)

        request_id = db.create_issue_request(
            self._issue_payload(),
            [{"item_id": item_id, "quantity": 1, "note": ""}],
        )
        item_after_create = db.get_item_by_id(item_id)
        self.assertIsNotNone(item_after_create)
        self.assertEqual(item_after_create["count"], 1)
        self.assertEqual(item_after_create["asset_status"], "1")

        db.delete_issue_request(request_id)
        item_after_delete = db.get_item_by_id(item_id)
        self.assertIsNotNone(item_after_delete)
        self.assertEqual(item_after_delete["count"], 1)
        self.assertEqual(item_after_delete["asset_status"], "0")

    def test_borrow_return_flow_updates_status_only(self) -> None:
        item_id = self._create_item()

        request_id = db.create_borrow_request(
            self._borrow_payload(status="borrowed"),
            [{"item_id": item_id, "quantity": 1, "note": ""}],
        )
        item_after_borrow = db.get_item_by_id(item_id)
        self.assertIsNotNone(item_after_borrow)
        self.assertEqual(item_after_borrow["count"], 1)
        self.assertEqual(item_after_borrow["asset_status"], "2")

        db.update_borrow_request(
            request_id,
            self._borrow_payload(status="returned"),
            [{"item_id": item_id, "quantity": 1, "note": ""}],
        )
        item_after_return = db.get_item_by_id(item_id)
        self.assertIsNotNone(item_after_return)
        self.assertEqual(item_after_return["count"], 1)
        self.assertEqual(item_after_return["asset_status"], "0")

    def test_borrow_status_is_derived_from_dates(self) -> None:
        self.assertEqual(
            db._derive_borrow_status(due_date_value="2026-04-20", return_date_value="", today=date(2026, 4, 20)),
            "borrowed",
        )
        self.assertEqual(
            db._derive_borrow_status(due_date_value="2026-04-20", return_date_value="", today=date(2026, 4, 21)),
            "overdue",
        )
        self.assertEqual(
            db._derive_borrow_status(due_date_value="2026-04-20", return_date_value="2026-04-19", today=date(2026, 4, 21)),
            "returned",
        )

    def test_due_soon_rule_matches_three_day_window(self) -> None:
        self.assertTrue(
            db._is_due_soon(due_date_value="2026-04-20", return_date_value="", today=date(2026, 4, 17), days=3)
        )
        self.assertFalse(
            db._is_due_soon(due_date_value="2026-04-21", return_date_value="", today=date(2026, 4, 17), days=3)
        )
        self.assertFalse(
            db._is_due_soon(due_date_value="2026-04-16", return_date_value="", today=date(2026, 4, 17), days=3)
        )
        self.assertFalse(
            db._is_due_soon(due_date_value="2026-04-18", return_date_value="2026-04-17", today=date(2026, 4, 17), days=3)
        )

    def test_create_borrow_request_ignores_manual_status_input(self) -> None:
        item_id = self._create_item()
        request_id = db.create_borrow_request(
            {
                "borrower": "tester",
                "department": "qa",
                "purpose": "test",
                "borrow_date": "2026-04-10",
                "due_date": "2999-12-31",
                "return_date": "",
                "status": "returned",
                "memo": "",
            },
            [{"item_id": item_id, "quantity": 1, "note": ""}],
        )
        request = db.get_borrow_request(request_id)
        self.assertIsNotNone(request)
        self.assertEqual(request["status"], "borrowed")

        item = db.get_item_by_id(item_id)
        self.assertIsNotNone(item)
        self.assertEqual(item["asset_status"], "2")

    def test_update_borrow_request_ignores_manual_status_input(self) -> None:
        item_id = self._create_item()
        request_id = db.create_borrow_request(
            self._borrow_payload(status="borrowed"),
            [{"item_id": item_id, "quantity": 1, "note": ""}],
        )

        db.update_borrow_request(
            request_id,
            {
                "borrower": "tester",
                "department": "qa",
                "purpose": "test",
                "borrow_date": "2026-04-10",
                "due_date": "2999-12-31",
                "return_date": "",
                "status": "returned",
                "memo": "",
            },
            [{"item_id": item_id, "quantity": 1, "note": ""}],
        )

        request = db.get_borrow_request(request_id)
        self.assertIsNotNone(request)
        self.assertEqual(request["status"], "borrowed")

    def test_list_borrow_requests_syncs_stale_status(self) -> None:
        item_id = self._create_item()
        request_id = db.create_borrow_request(
            {
                "borrower": "tester",
                "department": "qa",
                "purpose": "test",
                "borrow_date": "2020-01-01",
                "due_date": "2020-01-02",
                "return_date": "",
                "status": "borrowed",
                "memo": "",
            },
            [{"item_id": item_id, "quantity": 1, "note": ""}],
        )

        with db._locked_workbook() as wb:
            ws = wb["borrow_requests"]
            rows = db._read_rows(ws)
            for row in rows:
                if int(row.get("id") or 0) == request_id:
                    row["status"] = "returned"
            db._write_rows(ws, db.SHEETS["borrow_requests"], rows)
            wb.save(db.DB_PATH)

        requests = db.list_borrow_requests()
        target = next(row for row in requests if int(row.get("id") or 0) == request_id)
        self.assertEqual(target["status"], "overdue")

    def test_issue_update_rejects_unavailable_item_and_keeps_original_status(self) -> None:
        issue_item_id = self._create_item()
        occupied_item_id = self._create_item()

        issue_request_id = db.create_issue_request(
            self._issue_payload(),
            [{"item_id": issue_item_id, "quantity": 1, "note": ""}],
        )
        db.create_borrow_request(
            self._borrow_payload(status="borrowed"),
            [{"item_id": occupied_item_id, "quantity": 1, "note": ""}],
        )

        with self.assertRaisesRegex(ValueError, f"item_id {occupied_item_id} is unavailable"):
            db.update_issue_request(
                issue_request_id,
                self._issue_payload(),
                [{"item_id": occupied_item_id, "quantity": 1, "note": ""}],
            )

        issue_item_after = db.get_item_by_id(issue_item_id)
        occupied_item_after = db.get_item_by_id(occupied_item_id)
        self.assertIsNotNone(issue_item_after)
        self.assertIsNotNone(occupied_item_after)
        self.assertEqual(issue_item_after["asset_status"], "1")
        self.assertEqual(occupied_item_after["asset_status"], "2")

    def test_donation_sets_status_and_reverts_on_delete(self) -> None:
        item_id = self._create_item()

        request_id = db.create_donation_request(
            self._donation_payload(),
            [{"item_id": item_id, "quantity": 1, "note": ""}],
        )
        item_after_create = db.get_item_by_id(item_id)
        self.assertIsNotNone(item_after_create)
        self.assertEqual(item_after_create["count"], 1)
        self.assertEqual(item_after_create["asset_status"], "3")

        db.delete_donation_request(request_id)
        item_after_delete = db.get_item_by_id(item_id)
        self.assertIsNotNone(item_after_delete)
        self.assertEqual(item_after_delete["count"], 1)
        self.assertEqual(item_after_delete["asset_status"], "0")


if __name__ == "__main__":
    unittest.main()
