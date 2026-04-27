import importlib
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import data_backend


class _FakeDeleteQuery:
    def __init__(self, table: str, deleted_rows: list[tuple[str, str]]):
        self._table = table
        self._deleted_rows = deleted_rows
        self._name_code = ""
        self._name_code2 = ""

    def eq(self, column: str, value: str):
        if column == "name_code":
            self._name_code = value
        if column == "name_code2":
            self._name_code2 = value
        return self

    def execute(self):
        if self._table == "asset_category_name":
            self._deleted_rows.append((self._name_code, self._name_code2))
        return type("Resp", (), {"data": []})()


class _FakeTableQuery:
    def __init__(self, table: str, upserts: dict[str, list[dict[str, str]]], deleted_rows: list[tuple[str, str]]):
        self._table = table
        self._upserts = upserts
        self._deleted_rows = deleted_rows

    def upsert(self, payload: list[dict[str, str]]):
        self._upserts.setdefault(self._table, []).extend(payload)
        return self

    def delete(self):
        return _FakeDeleteQuery(self._table, self._deleted_rows)

    def execute(self):
        return type("Resp", (), {"data": []})()


class _FakeSupabaseClient:
    def __init__(self):
        self.upserts: dict[str, list[dict[str, str]]] = {}
        self.deleted_rows: list[tuple[str, str]] = []

    def table(self, table: str):
        return _FakeTableQuery(table, self.upserts, self.deleted_rows)


class DataBackendSyncTests(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory()
        self._outbox_path = Path(self._temp_dir.name) / "sync_outbox.json"
        self._conflicts_path = Path(self._temp_dir.name) / "sync_conflicts.json"
        self._env_backup = {key: os.getenv(key) for key in self._env_keys()}

        os.environ["USE_SUPABASE"] = "true"
        os.environ["SUPABASE_URL"] = "http://127.0.0.1:54321"
        os.environ["DATA_BACKEND_MODE"] = "cloud_primary_with_offline_queue"
        os.environ["SYNC_OUTBOX_PATH"] = str(self._outbox_path)
        os.environ["SYNC_CONFLICTS_PATH"] = str(self._conflicts_path)

        importlib.reload(data_backend)

    def tearDown(self) -> None:
        for key, value in self._env_backup.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        self._temp_dir.cleanup()
        importlib.reload(data_backend)

    @staticmethod
    def _env_keys() -> list[str]:
        return [
            "USE_SUPABASE",
            "SUPABASE_URL",
            "DATA_BACKEND_MODE",
            "SYNC_OUTBOX_PATH",
            "SYNC_CONFLICTS_PATH",
        ]

    def test_cloud_primary_enqueue_on_sync_failure(self) -> None:
        with patch("data_backend._sync_xlsx_to_supabase_or_raise", side_effect=RuntimeError("network down")):
            value = data_backend._execute_mutation(lambda n: n + 1, 1)  # noqa: SLF001

        self.assertEqual(value, 2)
        status = data_backend.get_sync_status()
        self.assertEqual(status["queue_depth"], 1)
        self.assertEqual(data_backend.get_last_sync_state(), "queued")
        self.assertTrue(self._outbox_path.exists())
        self.assertTrue(self._conflicts_path.exists())

    def test_replay_sync_outbox_marks_pending_entries_synced(self) -> None:
        data_backend._enqueue_outbox(  # noqa: SLF001
            operation="update_item",
            args=(1,),
            kwargs={"name": "laptop"},
            error="timeout",
        )

        with patch("data_backend._sync_xlsx_to_supabase_or_raise", return_value=None):
            result = data_backend.replay_sync_outbox(limit=50)

        self.assertEqual(result["status"], "success")
        self.assertEqual(result["synced"], 1)
        status = data_backend.get_sync_status()
        self.assertEqual(status["queue_depth"], 0)
        self.assertEqual(data_backend.get_last_sync_state(), "synced")

    def test_sync_asset_categories_upserts_xlsx_and_deletes_unreferenced_stale_pairs(self) -> None:
        fake_client = _FakeSupabaseClient()

        def fetch_side_effect(table: str):
            if table == "asset_category_name":
                return [
                    {"name_code": "01", "name_code2": "01"},
                    {"name_code": "99", "name_code2": "99"},
                ]
            if table == "inventory_items":
                return []
            return []

        with (
            patch("data_backend.get_supabase_client", return_value=fake_client),
            patch(
                "data_backend.db.list_asset_categories",
                return_value=[
                    {
                        "name_code": "01",
                        "name_code2": "01",
                        "asset_category_name": "筆電",
                        "description": "一般",
                    }
                ],
            ),
            patch("data_backend._fetch_all", side_effect=fetch_side_effect),
        ):
            data_backend._sync_asset_categories_to_supabase_or_raise()  # noqa: SLF001

        upserts = fake_client.upserts.get("asset_category_name", [])
        self.assertEqual(len(upserts), 1)
        self.assertEqual(upserts[0]["name_code"], "01")
        self.assertEqual(upserts[0]["name_code2"], "01")
        self.assertEqual(fake_client.deleted_rows, [("99", "99")])

    def test_sync_asset_categories_blocks_deletion_when_stale_pair_is_still_referenced(self) -> None:
        fake_client = _FakeSupabaseClient()

        def fetch_side_effect(table: str):
            if table == "asset_category_name":
                return [
                    {"name_code": "01", "name_code2": "01"},
                    {"name_code": "99", "name_code2": "99"},
                ]
            if table == "inventory_items":
                return [{"id": 1, "name_code": "99", "name_code2": "99"}]
            return []

        with (
            patch("data_backend.get_supabase_client", return_value=fake_client),
            patch(
                "data_backend.db.list_asset_categories",
                return_value=[
                    {
                        "name_code": "01",
                        "name_code2": "01",
                        "asset_category_name": "筆電",
                        "description": "一般",
                    }
                ],
            ),
            patch("data_backend._fetch_all", side_effect=fetch_side_effect),
        ):
            with self.assertRaisesRegex(RuntimeError, "still referenced by inventory_items"):
                data_backend._sync_asset_categories_to_supabase_or_raise()  # noqa: SLF001

        self.assertEqual(fake_client.deleted_rows, [])

    def test_list_asset_categories_runs_sync_before_read(self) -> None:
        with (
            patch("data_backend._supabase_read_enabled", return_value=True),
            patch("data_backend._sync_asset_categories_to_supabase_or_raise") as sync_mock,
            patch(
                "data_backend._fetch_all",
                return_value=[
                    {
                        "name_code": "01",
                        "name_code2": "01",
                        "asset_category_name": "筆電",
                        "description": "一般",
                    }
                ],
            ),
        ):
            rows = data_backend.list_asset_categories()

        sync_mock.assert_called_once()
        self.assertEqual(rows[0]["name_code"], "01")

    def test_sync_asset_categories_deduplicates_xlsx_pairs_before_upsert(self) -> None:
        fake_client = _FakeSupabaseClient()

        with (
            patch("data_backend.get_supabase_client", return_value=fake_client),
            patch(
                "data_backend.db.list_asset_categories",
                return_value=[
                    {"name_code": "01", "name_code2": "01", "asset_category_name": "筆電", "description": "A"},
                    {"name_code": "01", "name_code2": "01", "asset_category_name": "筆電", "description": "B"},
                ],
            ),
            patch("data_backend._fetch_all", return_value=[]),
        ):
            data_backend._sync_asset_categories_to_supabase_or_raise()  # noqa: SLF001

        upserts = fake_client.upserts.get("asset_category_name", [])
        self.assertEqual(len(upserts), 1)
        self.assertEqual(upserts[0]["description"], "B")


if __name__ == "__main__":
    unittest.main()
