import json
import os
import unittest
from unittest.mock import patch

from fastapi import HTTPException

import main as app_main
from supabase_client import SupabaseConfigError


class AdminManagementApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self._original_token = os.getenv("ADMIN_API_TOKEN")
        os.environ["ADMIN_API_TOKEN"] = "test-token"

    def tearDown(self) -> None:
        if self._original_token is None:
            os.environ.pop("ADMIN_API_TOKEN", None)
        else:
            os.environ["ADMIN_API_TOKEN"] = self._original_token

    def test_migration_api_requires_admin_token(self) -> None:
        response = app_main.run_migration_api(app_main.AdminMigrationRunRequest(dry_run=True), x_admin_token="")
        self.assertEqual(response.status_code, 401)
        payload = json.loads(response.body)
        self.assertEqual(payload["status"], "failed")
        self.assertEqual(payload["error_code"], "invalid_admin_token")
        self.assertTrue(payload["errors"])

    @patch("main.run_xlsx_to_supabase_migration")
    def test_migration_api_returns_report_payload(self, mock_run) -> None:
        mock_run.return_value = {
            "job_id": "20260425170000",
            "status": "success",
            "dry_run": True,
            "started_at": "2026-04-25 17:00:00",
            "finished_at": "2026-04-25 17:00:10",
            "errors": [],
        }

        response = app_main.run_migration_api(
            app_main.AdminMigrationRunRequest(dry_run=True),
            x_admin_token="test-token",
        )

        self.assertEqual(response.job_id, "20260425170000")
        self.assertEqual(response.status, "success")
        self.assertTrue(response.dry_run)
        self.assertEqual(response.error_code, "")

    @patch("main.run_xlsx_to_supabase_migration")
    def test_migration_api_handles_supabase_config_error(self, mock_run) -> None:
        mock_run.side_effect = SupabaseConfigError("SUPABASE_URL is required")

        response = app_main.run_migration_api(
            app_main.AdminMigrationRunRequest(dry_run=False),
            x_admin_token="test-token",
        )
        self.assertEqual(response.status_code, 503)
        payload = json.loads(response.body)
        self.assertEqual(payload["status"], "failed")
        self.assertEqual(payload["error_code"], "supabase_config_error")
        self.assertEqual(payload["errors"], ["SUPABASE_URL is required"])

    @patch("main.get_migration_report")
    def test_get_migration_report_api_404_when_missing(self, mock_get_report) -> None:
        mock_get_report.return_value = None

        with self.assertRaises(HTTPException) as exc:
            app_main.get_migration_report_api("missing-job", x_admin_token="test-token")

        self.assertEqual(exc.exception.status_code, 404)

    @patch("main.sync_supabase_tables_to_google_sheets")
    def test_sync_backup_api_returns_job_result(self, mock_sync) -> None:
        mock_sync.return_value = {
            "job_id": 9,
            "status": "success",
            "total_rows": 120,
            "sheets_written": 13,
            "error": "",
        }

        response = app_main.sync_supabase_backup_api(x_admin_token="test-token")

        self.assertEqual(response.job_id, 9)
        self.assertEqual(response.status, "success")
        self.assertEqual(response.total_rows, 120)

    @patch("main.list_sync_jobs")
    def test_list_sync_jobs_api_returns_items(self, mock_list_jobs) -> None:
        mock_list_jobs.return_value = [{"id": 2, "status": "success"}]

        response = app_main.list_sync_jobs_api(limit=50, x_admin_token="test-token")

        self.assertEqual(response["items"][0]["id"], 2)


if __name__ == "__main__":
    unittest.main()
