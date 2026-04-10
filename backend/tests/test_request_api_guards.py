import tempfile
import unittest
from pathlib import Path

from fastapi import BackgroundTasks, HTTPException

import db
import main as app_main


class RequestApiGuardTests(unittest.TestCase):
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

    def _create_item(self, *, asset_status: str = "0") -> int:
        return db.create_item(
            {
                "asset_type": "A1",
                "asset_status": asset_status,
                "name": "測試品項",
                "model": "M1",
                "count": 1,
            }
        )

    @staticmethod
    def _issue_request(items: list[dict]) -> app_main.IssueRequestCreate:
        return app_main.IssueRequestCreate(
            requester="tester",
            department="qa",
            purpose="test",
            request_date="2026-04-10",
            memo="",
            items=items,
        )

    @staticmethod
    def _borrow_request(items: list[dict]) -> app_main.BorrowRequestCreate:
        return app_main.BorrowRequestCreate(
            borrower="tester",
            department="qa",
            purpose="test",
            borrow_date="2026-04-10",
            due_date="2026-04-20",
            return_date=None,
            status="borrowed",
            memo="",
            items=items,
        )

    def test_issue_api_rejects_duplicate_item_id(self) -> None:
        item_id = self._create_item()
        request = self._issue_request(
            [
                {"item_id": item_id, "quantity": 1, "note": ""},
                {"item_id": item_id, "quantity": 1, "note": ""},
            ]
        )
        with self.assertRaises(HTTPException) as exc:
            app_main.create_issue_request_api(request, BackgroundTasks())
        self.assertEqual(exc.exception.status_code, 400)
        self.assertEqual(exc.exception.detail, "item_id cannot be duplicated")

    def test_issue_api_rejects_unavailable_item(self) -> None:
        item_id = self._create_item(asset_status="1")
        request = self._issue_request([{"item_id": item_id, "quantity": 1, "note": ""}])
        with self.assertRaises(HTTPException) as exc:
            app_main.create_issue_request_api(request, BackgroundTasks())
        self.assertEqual(exc.exception.status_code, 400)
        self.assertEqual(exc.exception.detail, f"item_id {item_id} is unavailable")

    def test_borrow_api_rejects_unavailable_item(self) -> None:
        item_id = self._create_item(asset_status="2")
        request = self._borrow_request([{"item_id": item_id, "quantity": 1, "note": ""}])
        with self.assertRaises(HTTPException) as exc:
            app_main.create_borrow_request_api(request, BackgroundTasks())
        self.assertEqual(exc.exception.status_code, 400)
        self.assertEqual(exc.exception.detail, f"item_id {item_id} is unavailable")


if __name__ == "__main__":
    unittest.main()
