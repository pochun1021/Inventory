import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

from fastapi import HTTPException

import db
import main as app_main


class ListSortingApiTests(unittest.TestCase):
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

    def _create_item(self, *, name: str, asset_type: str = "A1", asset_status: str = "0") -> int:
        return db.create_item(
            {
                "asset_type": asset_type,
                "asset_status": asset_status,
                "name": name,
                "model": "M1",
                "count": 1,
            }
        )

    def test_inventory_list_supports_sort_by_name(self) -> None:
        self._create_item(name="Zulu")
        self._create_item(name="Alpha")

        response = app_main.get_inventory_items(sort_by="name", sort_dir="asc", page=1, page_size=10)
        self.assertGreaterEqual(len(response.items), 2)
        self.assertEqual(response.items[0].name, "Alpha")
        self.assertEqual(response.items[1].name, "Zulu")

    def test_issue_list_supports_sort_by_items(self) -> None:
        apple_item_id = self._create_item(name="Apple")
        banana_item_id = self._create_item(name="Banana")

        app_main.create_issue_request_api(
            app_main.IssueRequestCreate(
                requester="tester-1",
                department="qa",
                purpose="sort-test",
                request_date="2026-04-10",
                memo="",
                items=[{"item_id": banana_item_id, "quantity": 1, "note": ""}],
            ),
            app_main.BackgroundTasks(),
        )
        app_main.create_issue_request_api(
            app_main.IssueRequestCreate(
                requester="tester-2",
                department="qa",
                purpose="sort-test",
                request_date="2026-04-10",
                memo="",
                items=[{"item_id": apple_item_id, "quantity": 1, "note": ""}],
            ),
            app_main.BackgroundTasks(),
        )

        response = app_main.list_issue_requests_api(sort_by="items", sort_dir="asc", page=1, page_size=10)
        self.assertGreaterEqual(len(response.items), 2)
        first_item_name = response.items[0].items[0].item_name
        second_item_name = response.items[1].items[0].item_name
        self.assertEqual(first_item_name, "Apple")
        self.assertEqual(second_item_name, "Banana")

    def test_donation_list_supports_sort_by_recipient(self) -> None:
        item_id_1 = self._create_item(name="Donate-1")
        item_id_2 = self._create_item(name="Donate-2")

        app_main.create_donation_request_api(
            app_main.DonationRequestCreate(
                donor="donor-a",
                department="qa",
                recipient="ZZZ recipient",
                purpose="test",
                donation_date="2026-04-10",
                memo="",
                items=[{"item_id": item_id_1, "quantity": 1, "note": ""}],
            )
        )
        app_main.create_donation_request_api(
            app_main.DonationRequestCreate(
                donor="donor-b",
                department="qa",
                recipient="AAA recipient",
                purpose="test",
                donation_date="2026-04-10",
                memo="",
                items=[{"item_id": item_id_2, "quantity": 1, "note": ""}],
            )
        )

        response = app_main.list_donation_requests_api(sort_by="recipient", sort_dir="asc", page=1, page_size=10)
        self.assertGreaterEqual(len(response.items), 2)
        self.assertEqual(response.items[0].recipient, "AAA recipient")
        self.assertEqual(response.items[1].recipient, "ZZZ recipient")

    def test_operation_logs_supports_sort_by_detail(self) -> None:
        db.log_inventory_action(action="update", entity="inventory_item", entity_id=101, detail={"note": "ZZZ"})
        db.log_inventory_action(action="update", entity="inventory_item", entity_id=102, detail={"note": "AAA"})

        response = app_main.list_operation_logs_api(sort_by="detail", sort_dir="asc", page=1, page_size=10)
        self.assertGreaterEqual(len(response.items), 2)
        first_note = str(response.items[0].detail.get("note"))
        second_note = str(response.items[1].detail.get("note"))
        self.assertEqual(first_note, "AAA")
        self.assertEqual(second_note, "ZZZ")

    def test_invalid_sort_by_returns_400(self) -> None:
        self._create_item(name="Test")
        with self.assertRaises(HTTPException) as exc:
            app_main.get_inventory_items(sort_by="not_a_field", sort_dir="asc", page=1, page_size=10)
        self.assertEqual(exc.exception.status_code, 400)

    def test_dashboard_data_includes_aggregated_fields(self) -> None:
        item_id = self._create_item(name="Lens")
        app_main.create_issue_request_api(
            app_main.IssueRequestCreate(
                requester="tester",
                department="qa",
                purpose="dash",
                request_date="2026-04-10",
                memo="",
                items=[{"item_id": item_id, "quantity": 1, "note": ""}],
            ),
            app_main.BackgroundTasks(),
        )

        payload = app_main.get_dashboard_data()
        self.assertEqual(payload["status"], "success")
        self.assertIn("totalRecords", payload)
        self.assertIn("reservedBorrowCount", payload)
        self.assertIn("itemCategoryDistribution", payload)
        self.assertIn("recentActivities", payload)
        self.assertGreaterEqual(payload["totalRecords"], 1)

    def test_dashboard_counts_reserved_borrow_requests(self) -> None:
        self._create_item(name="Lens")
        borrow_date = (date.today() + timedelta(days=1)).isoformat()
        due_date = (date.today() + timedelta(days=5)).isoformat()
        app_main.create_borrow_request_api(
            app_main.BorrowRequestCreate(
                borrower="tester",
                department="qa",
                purpose="dash-reserved",
                borrow_date=borrow_date,
                due_date=due_date,
                memo="",
                request_lines=[{"item_name": "Lens", "item_model": "M1", "requested_qty": 1, "note": ""}],
            ),
            app_main.BackgroundTasks(),
        )

        payload = app_main.get_dashboard_data()
        self.assertGreaterEqual(payload.get("reservedBorrowCount", 0), 1)


if __name__ == "__main__":
    unittest.main()
