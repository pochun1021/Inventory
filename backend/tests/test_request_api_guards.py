import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

from fastapi import BackgroundTasks, HTTPException

import db
import main as app_main


class RequestApiGuardTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self._original_db_path = db.DB_PATH
        self._original_lock_path = db.LOCK_PATH
        self._original_log_archive_dir = db.LOG_ARCHIVE_DIR

        db.DB_PATH = Path(self._tmpdir.name) / 'inventory.xlsx'
        db.LOCK_PATH = Path(self._tmpdir.name) / 'inventory.xlsx.lock'
        db.LOG_ARCHIVE_DIR = Path(self._tmpdir.name) / 'log_archive'
        db.init_db()

    def tearDown(self) -> None:
        db.DB_PATH = self._original_db_path
        db.LOCK_PATH = self._original_lock_path
        db.LOG_ARCHIVE_DIR = self._original_log_archive_dir
        self._tmpdir.cleanup()

    def _create_item(self, *, asset_status: str = '0', name: str = '測試品項', model: str = 'M1') -> int:
        return db.create_item(
            {
                'asset_type': 'A1',
                'asset_status': asset_status,
                'name': name,
                'model': model,
                'count': 1,
            }
        )

    @staticmethod
    def _issue_request(items: list[dict]) -> app_main.IssueRequestCreate:
        return app_main.IssueRequestCreate(
            requester='tester',
            department='qa',
            purpose='test',
            request_date='2026-04-10',
            memo='',
            items=items,
        )

    @staticmethod
    def _borrow_request(lines: list[dict]) -> app_main.BorrowRequestCreate:
        return app_main.BorrowRequestCreate(
            borrower='tester',
            department='qa',
            purpose='test',
            borrow_date='2026-04-10',
            due_date='2026-04-20',
            memo='',
            request_lines=lines,
        )

    def test_issue_api_rejects_duplicate_item_id(self) -> None:
        item_id = self._create_item()
        request = self._issue_request(
            [
                {'item_id': item_id, 'quantity': 1, 'note': ''},
                {'item_id': item_id, 'quantity': 1, 'note': ''},
            ]
        )
        with self.assertRaises(HTTPException) as exc:
            app_main.create_issue_request_api(request, BackgroundTasks())
        self.assertEqual(exc.exception.status_code, 400)
        self.assertEqual(exc.exception.detail, 'item_id cannot be duplicated')

    def test_issue_api_rejects_unavailable_item(self) -> None:
        item_id = self._create_item(asset_status='1')
        request = self._issue_request([{'item_id': item_id, 'quantity': 1, 'note': ''}])
        with self.assertRaises(HTTPException) as exc:
            app_main.create_issue_request_api(request, BackgroundTasks())
        self.assertEqual(exc.exception.status_code, 400)
        self.assertEqual(exc.exception.detail, f'item_id {item_id} is unavailable')

    def test_borrow_api_rejects_insufficient_reservable_quantity(self) -> None:
        self._create_item(name='投影機', model='X1')
        request = self._borrow_request(
            [
                {'item_name': '投影機', 'item_model': 'X1', 'requested_qty': 2, 'note': ''},
            ]
        )
        with self.assertRaises(HTTPException) as exc:
            app_main.create_borrow_request_api(request, BackgroundTasks())
        self.assertEqual(exc.exception.status_code, 400)
        detail = exc.exception.detail
        self.assertIsInstance(detail, dict)
        self.assertEqual(detail.get('message'), 'insufficient_reservable_quantity')
        self.assertEqual(detail.get('shortages')[0]['shortage_qty'], 1)

    def test_borrow_api_creates_reserved_and_pickup_then_return(self) -> None:
        first_item_id = self._create_item(name='筆電', model='A1')
        second_item_id = self._create_item(name='筆電', model='A1')

        request = self._borrow_request(
            [
                {'item_name': '筆電', 'item_model': 'A1', 'requested_qty': 2, 'note': ''},
            ]
        )
        created = app_main.create_borrow_request_api(request, BackgroundTasks())
        self.assertEqual(created.status, 'reserved')
        self.assertFalse(created.is_due_soon)
        self.assertEqual(created.request_lines[0].allocated_qty, 0)

        pickup_payload = app_main.BorrowPickupRequest(
            selections=[
                app_main.BorrowPickupSelection(
                    line_id=created.request_lines[0].id,
                    item_ids=[first_item_id, second_item_id],
                )
            ]
        )
        picked = app_main.pickup_borrow_request_api(created.id, pickup_payload, BackgroundTasks())
        self.assertIn(picked.status, {'borrowed', 'overdue'})
        self.assertEqual(picked.request_lines[0].allocated_qty, 2)

        returned = app_main.return_borrow_request_api(created.id, BackgroundTasks())
        self.assertEqual(returned.status, 'returned')

    def test_borrow_pickup_requires_explicit_selections(self) -> None:
        self._create_item(name='平板', model='P1')
        created = app_main.create_borrow_request_api(
            self._borrow_request([{'item_name': '平板', 'item_model': 'P1', 'requested_qty': 1, 'note': ''}]),
            BackgroundTasks(),
        )
        with self.assertRaises(HTTPException) as exc:
            app_main.pickup_borrow_request_api(created.id, app_main.BorrowPickupRequest(selections=[]), BackgroundTasks())
        self.assertEqual(exc.exception.status_code, 400)
        self.assertEqual(exc.exception.detail, 'pickup selections are required')

    def test_borrow_pickup_rejects_item_not_matching_line(self) -> None:
        requested_item_id = self._create_item(name='投影機', model='X1')
        wrong_item_id = self._create_item(name='相機', model='C1')
        created = app_main.create_borrow_request_api(
            self._borrow_request([{'item_name': '投影機', 'item_model': 'X1', 'requested_qty': 1, 'note': ''}]),
            BackgroundTasks(),
        )
        self.assertGreater(requested_item_id, 0)
        payload = app_main.BorrowPickupRequest(
            selections=[
                app_main.BorrowPickupSelection(
                    line_id=created.request_lines[0].id,
                    item_ids=[wrong_item_id],
                )
            ]
        )
        with self.assertRaises(HTTPException) as exc:
            app_main.pickup_borrow_request_api(created.id, payload, BackgroundTasks())
        self.assertEqual(exc.exception.status_code, 400)
        self.assertEqual(exc.exception.detail, f'item_id {wrong_item_id} does not match line_id {created.request_lines[0].id}')

    def test_borrow_expired_reservation_auto_release(self) -> None:
        self._create_item(name='相機', model='M2')
        request = app_main.BorrowRequestCreate(
            borrower='tester',
            department='qa',
            purpose='test',
            borrow_date=(date.today() - timedelta(days=1)).isoformat(),
            due_date=(date.today() + timedelta(days=3)).isoformat(),
            memo='',
            request_lines=[{'item_name': '相機', 'item_model': 'M2', 'requested_qty': 1, 'note': ''}],
        )
        created = app_main.create_borrow_request_api(request, BackgroundTasks())
        fetched = app_main.get_borrow_request_api(created.id)
        self.assertEqual(fetched.status, 'expired')

    def test_logs_api_rejects_invalid_scope(self) -> None:
        with self.assertRaises(HTTPException) as exc:
            app_main.list_operation_logs_api(scope='archive-only', page=1, page_size=10)
        self.assertEqual(exc.exception.status_code, 400)
        self.assertEqual(exc.exception.detail, 'scope must be one of: hot, all')


if __name__ == '__main__':
    unittest.main()
