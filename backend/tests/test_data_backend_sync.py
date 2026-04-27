import importlib
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import data_backend


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


if __name__ == "__main__":
    unittest.main()
