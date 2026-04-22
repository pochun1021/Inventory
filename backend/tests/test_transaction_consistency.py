import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

import db


class TransactionConsistencyTests(unittest.TestCase):
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

    def _create_item(self, *, asset_status: str = '0', count: int = 1, name: str = '測試品項', model: str = 'M1') -> int:
        return db.create_item(
            {
                'asset_type': 'A1',
                'asset_status': asset_status,
                'name': name,
                'model': model,
                'count': count,
            }
        )

    def _issue_payload(self) -> dict:
        return {
            'requester': 'tester',
            'department': 'qa',
            'purpose': 'test',
            'request_date': '2026-04-10',
            'memo': '',
        }

    def _borrow_payload(self, *, borrow_date: str | None = None, due_date: str | None = None) -> dict:
        resolved_borrow_date = borrow_date or (date.today() + timedelta(days=1)).strftime('%Y-%m-%d')
        resolved_due_date = due_date or (date.today() + timedelta(days=10)).strftime('%Y-%m-%d')
        return {
            'borrower': 'tester',
            'department': 'qa',
            'purpose': 'test',
            'borrow_date': resolved_borrow_date,
            'due_date': resolved_due_date,
            'memo': '',
        }

    def _donation_payload(self) -> dict:
        return {
            'donor': 'tester',
            'department': 'qa',
            'recipient': 'receiver',
            'purpose': 'test',
            'donation_date': '2026-04-10',
            'memo': '',
        }

    def test_quantity_must_be_one(self) -> None:
        item_id = self._create_item()
        with self.assertRaisesRegex(ValueError, 'quantity must be 1'):
            db.create_issue_request(
                self._issue_payload(),
                [{'item_id': item_id, 'quantity': 2, 'note': ''}],
            )

    def test_item_id_cannot_be_duplicated(self) -> None:
        item_id = self._create_item()
        with self.assertRaisesRegex(ValueError, 'item_id cannot be duplicated'):
            db.create_issue_request(
                self._issue_payload(),
                [
                    {'item_id': item_id, 'quantity': 1, 'note': ''},
                    {'item_id': item_id, 'quantity': 1, 'note': ''},
                ],
            )

    def test_create_request_rejects_unavailable_item(self) -> None:
        unavailable_item_id = self._create_item(asset_status='2')
        with self.assertRaisesRegex(ValueError, f'item_id {unavailable_item_id} is unavailable'):
            db.create_issue_request(
                self._issue_payload(),
                [{'item_id': unavailable_item_id, 'quantity': 1, 'note': ''}],
            )

    def test_issue_request_updates_status_only(self) -> None:
        item_id = self._create_item(count=5)

        request_id = db.create_issue_request(
            self._issue_payload(),
            [{'item_id': item_id, 'quantity': 1, 'note': ''}],
        )
        item_after_create = db.get_item_by_id(item_id)
        self.assertIsNotNone(item_after_create)
        self.assertEqual(item_after_create['count'], 1)
        self.assertEqual(item_after_create['asset_status'], '1')

        db.delete_issue_request(request_id)
        item_after_delete = db.get_item_by_id(item_id)
        self.assertIsNotNone(item_after_delete)
        self.assertEqual(item_after_delete['count'], 1)
        self.assertEqual(item_after_delete['asset_status'], '0')

    def test_issue_request_sets_keeper_to_requester_for_asset(self) -> None:
        item_id = db.create_item(
            {
                'asset_type': '11',
                'asset_status': '0',
                'name': '財產設備',
                'model': 'A-1',
                'count': 1,
                'keeper': '原保管人',
            }
        )

        db.create_issue_request(
            {
                **self._issue_payload(),
                'requester': '新領用人',
            },
            [{'item_id': item_id, 'quantity': 1, 'note': ''}],
        )

        item_after_create = db.get_item_by_id(item_id)
        self.assertIsNotNone(item_after_create)
        self.assertEqual(item_after_create['asset_status'], '1')
        self.assertEqual(item_after_create['keeper'], '新領用人')

    def test_issue_request_sets_keeper_to_requester_for_non_asset(self) -> None:
        item_id = db.create_item(
            {
                'asset_type': 'A1',
                'asset_status': '0',
                'name': '耗材',
                'model': 'I-1',
                'count': 1,
                'keeper': '原保管人',
            }
        )

        db.create_issue_request(
            {
                **self._issue_payload(),
                'requester': '新領用人',
            },
            [{'item_id': item_id, 'quantity': 1, 'note': ''}],
        )

        item_after_create = db.get_item_by_id(item_id)
        self.assertIsNotNone(item_after_create)
        self.assertEqual(item_after_create['asset_status'], '1')
        self.assertEqual(item_after_create['keeper'], '新領用人')

    def test_borrow_reservation_pickup_return_flow_updates_borrower_only(self) -> None:
        first_id = db.create_item(
            {
                'asset_type': 'A1',
                'asset_status': '0',
                'name': '平板',
                'model': 'T1',
                'count': 1,
                'keeper': '原保管人A',
            }
        )
        second_id = db.create_item(
            {
                'asset_type': 'A1',
                'asset_status': '0',
                'name': '平板',
                'model': 'T1',
                'count': 1,
                'keeper': '原保管人B',
            }
        )

        request_id = db.create_borrow_request(
            {**self._borrow_payload(), 'borrower': '借用人A'},
            [{'item_name': '平板', 'item_model': 'T1', 'requested_qty': 2, 'note': ''}],
        )
        request = db.get_borrow_request(request_id)
        self.assertIsNotNone(request)
        self.assertEqual(request['status'], 'reserved')

        item_after_reservation_1 = db.get_item_by_id(first_id)
        item_after_reservation_2 = db.get_item_by_id(second_id)
        self.assertEqual(item_after_reservation_1['asset_status'], '0')
        self.assertEqual(item_after_reservation_2['asset_status'], '0')

        line_id = db.list_borrow_items(request_id)[0]['id']
        db.pickup_borrow_request(
            request_id,
            [{'line_id': line_id, 'item_ids': [first_id, second_id]}],
        )
        item_after_pickup_1 = db.get_item_by_id(first_id)
        item_after_pickup_2 = db.get_item_by_id(second_id)
        self.assertEqual(item_after_pickup_1['asset_status'], '2')
        self.assertEqual(item_after_pickup_2['asset_status'], '2')
        self.assertEqual(item_after_pickup_1['keeper'], '原保管人A')
        self.assertEqual(item_after_pickup_2['keeper'], '原保管人B')
        self.assertEqual(item_after_pickup_1['borrower'], '借用人A')
        self.assertEqual(item_after_pickup_2['borrower'], '借用人A')

        db.return_borrow_request(request_id)
        item_after_return_1 = db.get_item_by_id(first_id)
        item_after_return_2 = db.get_item_by_id(second_id)
        self.assertEqual(item_after_return_1['asset_status'], '0')
        self.assertEqual(item_after_return_2['asset_status'], '0')
        self.assertEqual(item_after_return_1['keeper'], '原保管人A')
        self.assertEqual(item_after_return_2['keeper'], '原保管人B')
        self.assertEqual(item_after_return_1['borrower'], '')
        self.assertEqual(item_after_return_2['borrower'], '')

    def test_partial_pickup_updates_borrower_only_for_picked_items(self) -> None:
        first_id = db.create_item(
            {
                'asset_type': 'A1',
                'asset_status': '0',
                'name': '相機',
                'model': 'C1',
                'count': 1,
                'keeper': '原保管人A',
                'borrower': '原借用人A',
            }
        )
        second_id = db.create_item(
            {
                'asset_type': 'A1',
                'asset_status': '0',
                'name': '相機',
                'model': 'C1',
                'count': 1,
                'keeper': '原保管人B',
                'borrower': '原借用人B',
            }
        )

        request_id = db.create_borrow_request(
            {**self._borrow_payload(), 'borrower': '借用人B'},
            [{'item_name': '相機', 'item_model': 'C1', 'requested_qty': 2, 'note': ''}],
        )
        line_id = db.list_borrow_items(request_id)[0]['id']
        db.pickup_borrow_request(
            request_id,
            [{'line_id': line_id, 'item_ids': [first_id]}],
        )

        request_after_pickup = db.get_borrow_request(request_id)
        self.assertIsNotNone(request_after_pickup)
        self.assertEqual(request_after_pickup['status'], 'partial_borrowed')

        picked_item = db.get_item_by_id(first_id)
        unpicked_item = db.get_item_by_id(second_id)
        self.assertIsNotNone(picked_item)
        self.assertIsNotNone(unpicked_item)
        self.assertEqual(picked_item['asset_status'], '2')
        self.assertEqual(picked_item['keeper'], '原保管人A')
        self.assertEqual(picked_item['borrower'], '借用人B')
        self.assertEqual(unpicked_item['asset_status'], '0')
        self.assertEqual(unpicked_item['keeper'], '原保管人B')
        self.assertEqual(unpicked_item['borrower'], '原借用人B')

    def test_legacy_borrow_items_can_be_returned_without_allocations(self) -> None:
        item_id = self._create_item(asset_status='2', name='老資料設備', model='L1')

        with db._locked_workbook() as wb:
            request_ws = wb['borrow_requests']
            item_ws = wb['borrow_items']
            request_rows = db._read_rows(request_ws)
            item_rows = db._read_rows(item_ws)
            request_id = db._next_id(request_rows)
            request_rows.append(
                {
                    'id': request_id,
                    'borrower': 'legacy-user',
                    'department': 'qa',
                    'purpose': 'legacy test',
                    'borrow_date': '2026-04-10',
                    'due_date': '2026-04-20',
                    'return_date': '',
                    'status': 'borrowed',
                    'memo': '',
                    'created_at': '2026-04-10 10:00:00',
                }
            )
            next_item_row_id = db._next_id(item_rows)
            item_rows.append(
                {
                    'id': next_item_row_id,
                    'request_id': request_id,
                    'item_id': item_id,
                    'quantity': 1,
                    'note': 'legacy row',
                }
            )
            db._write_rows(request_ws, db.SHEETS['borrow_requests'], request_rows)
            db._write_rows(item_ws, db.SHEETS['borrow_items'], item_rows)
            wb.save(db.DB_PATH)

        returned = db.return_borrow_request(request_id)
        self.assertTrue(returned)
        item_after_return = db.get_item_by_id(item_id)
        self.assertIsNotNone(item_after_return)
        self.assertEqual(item_after_return['asset_status'], '0')
        request_after_return = db.get_borrow_request(request_id)
        self.assertIsNotNone(request_after_return)
        self.assertEqual(request_after_return['status'], 'returned')

    def test_borrow_status_is_derived_from_dates(self) -> None:
        self.assertEqual(
            db._derive_borrow_status(
                due_date_value='2026-04-20',
                return_date_value='',
                status_value='reserved',
                borrow_date_value='2026-04-21',
                has_allocations=False,
                today=date(2026, 4, 20),
            ),
            'reserved',
        )
        self.assertEqual(
            db._derive_borrow_status(
                due_date_value='2026-04-20',
                return_date_value='',
                status_value='reserved',
                borrow_date_value='2026-04-20',
                has_allocations=True,
                today=date(2026, 4, 21),
            ),
            'overdue',
        )
        self.assertEqual(
            db._derive_borrow_status(
                due_date_value='2026-04-20',
                return_date_value='2026-04-19',
                status_value='borrowed',
                borrow_date_value='2026-04-18',
                has_allocations=True,
                today=date(2026, 4, 21),
            ),
            'returned',
        )

    def test_due_soon_rule_matches_three_day_window(self) -> None:
        self.assertTrue(
            db._is_due_soon(due_date_value='2026-04-20', return_date_value='', today=date(2026, 4, 17), days=3)
        )
        self.assertFalse(
            db._is_due_soon(due_date_value='2026-04-21', return_date_value='', today=date(2026, 4, 17), days=3)
        )
        self.assertFalse(
            db._is_due_soon(due_date_value='2026-04-16', return_date_value='', today=date(2026, 4, 17), days=3)
        )
        self.assertFalse(
            db._is_due_soon(due_date_value='2026-04-18', return_date_value='2026-04-17', today=date(2026, 4, 17), days=3)
        )

    def test_expired_reservation_releases_hold(self) -> None:
        self._create_item(name='麥克風', model='M9')
        past_date = (date.today() - timedelta(days=1)).strftime('%Y-%m-%d')
        request_id = db.create_borrow_request(
            self._borrow_payload(borrow_date=past_date, due_date=(date.today() + timedelta(days=3)).strftime('%Y-%m-%d')),
            [{'item_name': '麥克風', 'item_model': 'M9', 'requested_qty': 1, 'note': ''}],
        )

        request = db.get_borrow_request(request_id)
        self.assertIsNotNone(request)
        self.assertEqual(request['status'], 'expired')

        second_id = db.create_item(
            {
                'asset_type': 'A1',
                'asset_status': '0',
                'name': '麥克風',
                'model': 'M9',
                'count': 1,
            }
        )
        self.assertGreater(second_id, 0)

        another_request_id = db.create_borrow_request(
            self._borrow_payload(),
            [{'item_name': '麥克風', 'item_model': 'M9', 'requested_qty': 2, 'note': ''}],
        )
        self.assertGreater(another_request_id, 0)

    def test_issue_update_rejects_unavailable_item_and_keeps_original_status(self) -> None:
        issue_item_id = self._create_item()
        occupied_item_id = self._create_item()

        issue_request_id = db.create_issue_request(
            self._issue_payload(),
            [{'item_id': issue_item_id, 'quantity': 1, 'note': ''}],
        )
        borrow_request_id = db.create_borrow_request(
            self._borrow_payload(),
            [{'item_name': '測試品項', 'item_model': 'M1', 'requested_qty': 1, 'note': ''}],
        )
        borrow_line_id = db.list_borrow_items(borrow_request_id)[0]['id']
        db.pickup_borrow_request(
            borrow_request_id,
            [{'line_id': borrow_line_id, 'item_ids': [occupied_item_id]}],
        )

        with self.assertRaisesRegex(ValueError, f'item_id {occupied_item_id} is unavailable'):
            db.update_issue_request(
                issue_request_id,
                self._issue_payload(),
                [{'item_id': occupied_item_id, 'quantity': 1, 'note': ''}],
            )

        issue_item_after = db.get_item_by_id(issue_item_id)
        occupied_item_after = db.get_item_by_id(occupied_item_id)
        self.assertIsNotNone(issue_item_after)
        self.assertIsNotNone(occupied_item_after)
        self.assertEqual(issue_item_after['asset_status'], '1')
        self.assertEqual(occupied_item_after['asset_status'], '2')

    def test_donation_sets_status_and_reverts_on_delete(self) -> None:
        item_id = self._create_item()

        request_id = db.create_donation_request(
            self._donation_payload(),
            [{'item_id': item_id, 'quantity': 1, 'note': ''}],
        )
        item_after_create = db.get_item_by_id(item_id)
        self.assertIsNotNone(item_after_create)
        self.assertEqual(item_after_create['count'], 1)
        self.assertEqual(item_after_create['asset_status'], '3')

        db.delete_donation_request(request_id)
        item_after_delete = db.get_item_by_id(item_id)
        self.assertIsNotNone(item_after_delete)
        self.assertEqual(item_after_delete['count'], 1)
        self.assertEqual(item_after_delete['asset_status'], '0')


if __name__ == '__main__':
    unittest.main()
