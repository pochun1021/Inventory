import json
import tempfile
import unittest
from io import BytesIO
from pathlib import Path
from urllib.error import HTTPError
from unittest.mock import patch

from fastapi import HTTPException

import db
import main as app_main


class AiSettingsApiTests(unittest.TestCase):
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

    def test_get_gemini_token_settings_unbound(self) -> None:
        response = app_main.get_gemini_token_settings_api()

        self.assertFalse(response.bound)
        self.assertIsNone(response.masked_token)
        self.assertEqual(response.provider, 'gemini')
        self.assertEqual(response.model, 'gemini-2.5-flash')
        self.assertGreater(len(response.available_models), 0)

    def test_put_gemini_token_settings_success(self) -> None:
        token = 'AIza1234567890'
        with patch.object(app_main, 'validate_gemini_token', return_value={'status': 'available'}):
            response = app_main.upsert_gemini_token_settings_api(
                app_main.GeminiTokenUpsertRequest(token=token, model='gemini-2.5-flash-lite')
            )

        stored = db.get_gemini_api_token_setting()
        stored_model = db.get_gemini_model_setting()
        self.assertIsNotNone(stored)
        self.assertEqual(stored['value'], token)
        self.assertIsNotNone(stored_model)
        self.assertEqual(stored_model['value'], 'gemini-2.5-flash-lite')
        self.assertTrue(response.bound)
        self.assertIsNotNone(response.masked_token)
        self.assertNotEqual(response.masked_token, token)
        self.assertEqual(response.model, 'gemini-2.5-flash-lite')

    def test_put_gemini_token_settings_validation_failed_should_not_save(self) -> None:
        with patch.object(
            app_main,
            'validate_gemini_token',
            side_effect=app_main.AIRecognitionError(code='upstream_error', message='Gemini token 驗證失敗。', status_code=502),
        ):
            with self.assertRaises(HTTPException) as exc:
                app_main.upsert_gemini_token_settings_api(app_main.GeminiTokenUpsertRequest(token='bad-token'))

        self.assertEqual(exc.exception.status_code, 400)
        self.assertEqual(
            exc.exception.detail,
            {'code': 'upstream_error', 'message': 'Gemini token 驗證失敗。'},
        )
        self.assertIsNone(db.get_gemini_api_token_setting())

    def test_put_gemini_token_settings_quota_exceeded_should_not_save(self) -> None:
        with patch.object(
            app_main,
            'validate_gemini_token',
            side_effect=app_main.AIRecognitionError(code='quota_exceeded', message='Gemini 配額不足，請先確認方案與 billing 後再綁定。', status_code=429),
        ):
            with self.assertRaises(HTTPException) as exc:
                app_main.upsert_gemini_token_settings_api(app_main.GeminiTokenUpsertRequest(token='any-token'))

        self.assertEqual(exc.exception.status_code, 400)
        self.assertEqual(exc.exception.detail.get('code'), 'quota_exceeded')
        self.assertIsNone(db.get_gemini_api_token_setting())
        self.assertIsNone(db.get_gemini_model_setting())

    def test_put_gemini_token_settings_invalid_model_should_not_save(self) -> None:
        with self.assertRaises(HTTPException) as exc:
            app_main.upsert_gemini_token_settings_api(app_main.GeminiTokenUpsertRequest(token='any-token', model='bad-model'))

        self.assertEqual(exc.exception.status_code, 400)
        self.assertEqual(exc.exception.detail.get('code'), 'invalid_model')
        self.assertIsNone(db.get_gemini_api_token_setting())
        self.assertIsNone(db.get_gemini_model_setting())

    def test_delete_gemini_token_settings(self) -> None:
        db.set_gemini_api_token('AIza1234567890')

        delete_response = app_main.delete_gemini_token_settings_api()
        get_response = app_main.get_gemini_token_settings_api()

        self.assertTrue(delete_response['deleted'])
        self.assertFalse(get_response.bound)
        self.assertIsNone(get_response.masked_token)

    def test_bind_log_detail_does_not_include_token_plaintext(self) -> None:
        token = 'AIzaSensitiveToken1234'
        with patch.object(app_main, 'validate_gemini_token', return_value={'status': 'available'}):
            app_main.upsert_gemini_token_settings_api(app_main.GeminiTokenUpsertRequest(token=token, model='gemini-2.5-flash'))

        rows = db.list_operation_logs(action='bind', entity='system_setting')
        self.assertEqual(len(rows), 1)
        detail_dump = json.dumps(rows[0].get('detail') or {}, ensure_ascii=False)
        self.assertNotIn(token, detail_dump)

    def test_validate_gemini_token_maps_429_to_quota_exceeded(self) -> None:
        response_body = BytesIO(b'{"error":{"message":"quota exceeded"}}')
        http_error = HTTPError(
            url='https://example.com',
            code=429,
            msg='Too Many Requests',
            hdrs=None,
            fp=response_body,
        )
        try:
            with patch('ai_recognition.urllib_request.urlopen', side_effect=http_error):
                with self.assertRaises(app_main.AIRecognitionError) as exc:
                    app_main.validate_gemini_token('AIza1234567890')

            self.assertEqual(exc.exception.code, 'quota_exceeded')
        finally:
            http_error.close()


if __name__ == '__main__':
    unittest.main()
