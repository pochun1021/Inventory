import asyncio
import tempfile
import unittest
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException, UploadFile
from starlette.datastructures import Headers

import db
import main as app_main


class AiSpecRecognitionApiTests(unittest.TestCase):
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

    def _upload_file(self, *, filename: str, content_type: str, payload: bytes = b'fake-image-bytes') -> UploadFile:
        return UploadFile(filename=filename, file=BytesIO(payload), headers=Headers({'content-type': content_type}))

    def test_get_quota_returns_payload(self) -> None:
        with patch.object(
            app_main,
            'get_quota_status',
            return_value={
                'enabled': True,
                'provider': 'gemini',
                'model': 'gemini-2.0-flash',
                'quota': {
                    'status': 'available',
                    'limit': 1500,
                    'remaining': 1400,
                    'reset_at': '1713878400',
                    'source': 'response_headers',
                },
            },
        ):
            response = app_main.get_ai_spec_recognition_quota_api()

        self.assertTrue(response.enabled)
        self.assertEqual(response.provider, 'gemini')
        self.assertEqual(response.quota.remaining, 1400)

    def test_get_quota_reports_disabled_message_without_key(self) -> None:
        with patch.object(
            app_main,
            'get_quota_status',
            return_value={
                'enabled': False,
                'provider': 'gemini',
                'model': 'gemini-2.0-flash',
                'quota': {'status': 'unknown'},
                'message': 'Gemini token 尚未設定，AI 規格辨識功能未啟用。',
            },
        ):
            response = app_main.get_ai_spec_recognition_quota_api()

        self.assertFalse(response.enabled)
        self.assertEqual(response.message, 'Gemini token 尚未設定，AI 規格辨識功能未啟用。')

    def test_on_startup_logs_ai_runtime_state(self) -> None:
        with (
            patch.object(app_main, 'init_db'),
            patch.object(app_main, 'purge_soft_deleted_items', return_value=0),
            patch.object(app_main, 'is_google_sheets_configured', return_value=False),
            patch.object(
                app_main,
                'get_quota_status',
                return_value={
                    'enabled': False,
                    'provider': 'gemini',
                    'model': 'gemini-2.5-flash',
                    'quota': {'status': 'unknown'},
                },
            ),
            patch.object(app_main.logger, 'info') as mock_info,
        ):
            app_main.on_startup()

        mock_info.assert_called_once_with(
            'AI spec recognition runtime: provider=%s model=%s token_configured=%s',
            'gemini',
            'gemini-2.5-flash',
            False,
        )

    def test_recognize_spec_success_response(self) -> None:
        mock_result = SimpleNamespace(
            recognized_fields={
                'name': '筆記型電腦',
                'model': 'XPS 13',
                'specification': 'i7/16GB/512GB',
            },
            raw_text_excerpt='Laptop spec text',
            quota={'status': 'available', 'remaining': 1399},
            warnings=['model not confidently extracted'],
        )
        with patch.object(app_main, 'recognize_spec_from_image', return_value=mock_result):
            response = asyncio.run(
                app_main.recognize_item_spec_api(
                    file=self._upload_file(filename='item.png', content_type='image/png'),
                )
            )

        self.assertEqual(response.recognized_fields.name, '筆記型電腦')
        self.assertEqual(response.recognized_fields.model, 'XPS 13')
        self.assertEqual(response.recognized_fields.specification, 'i7/16GB/512GB')
        self.assertEqual(response.quota.remaining, 1399)
        self.assertEqual(response.warnings, ['model not confidently extracted'])

    def test_recognize_spec_returns_error_mapping_for_invalid_image(self) -> None:
        with patch.object(
            app_main,
            'recognize_spec_from_image',
            side_effect=app_main.AIRecognitionError(code='invalid_image', message='只支援 JPEG、PNG、WEBP、HEIC、HEIF 圖片格式。', status_code=400),
        ):
            with self.assertRaises(HTTPException) as exc:
                asyncio.run(
                    app_main.recognize_item_spec_api(
                        file=self._upload_file(filename='item.txt', content_type='text/plain'),
                    )
                )

        self.assertEqual(exc.exception.status_code, 400)
        self.assertEqual(exc.exception.detail['code'], 'invalid_image')
        self.assertEqual(exc.exception.detail['message'], '只支援 JPEG、PNG、WEBP、HEIC、HEIF 圖片格式。')

    def test_recognize_spec_returns_error_mapping_for_feature_disabled(self) -> None:
        with patch.object(
            app_main,
            'recognize_spec_from_image',
            side_effect=app_main.AIRecognitionError(code='feature_disabled', message='AI 規格辨識功能尚未啟用。', status_code=503),
        ):
            with self.assertRaises(HTTPException) as exc:
                asyncio.run(
                    app_main.recognize_item_spec_api(
                        file=self._upload_file(filename='item.png', content_type='image/png'),
                    )
                )

        self.assertEqual(exc.exception.status_code, 503)
        self.assertEqual(exc.exception.detail['code'], 'feature_disabled')

    def test_recognize_spec_returns_error_mapping_for_upstream_error(self) -> None:
        with patch.object(
            app_main,
            'recognize_spec_from_image',
            side_effect=app_main.AIRecognitionError(code='upstream_error', message='Gemini 服務連線失敗。', status_code=502),
        ):
            with self.assertRaises(HTTPException) as exc:
                asyncio.run(
                    app_main.recognize_item_spec_api(
                        file=self._upload_file(filename='item.png', content_type='image/png'),
                    )
                )

        self.assertEqual(exc.exception.status_code, 502)
        self.assertEqual(exc.exception.detail['code'], 'upstream_error')
        self.assertEqual(exc.exception.detail['message'], 'Gemini 服務連線失敗。')

    def test_recognize_spec_returns_error_mapping_for_ocr_failed(self) -> None:
        with patch.object(
            app_main,
            'recognize_spec_from_image',
            side_effect=app_main.AIRecognitionError(
                code='ocr_failed',
                message='無法從圖片辨識出可用文字。',
                status_code=422,
            ),
        ):
            with self.assertRaises(HTTPException) as exc:
                asyncio.run(
                    app_main.recognize_item_spec_api(
                        file=self._upload_file(filename='item.heic', content_type='image/heic'),
                    )
                )

        self.assertEqual(exc.exception.status_code, 422)
        self.assertEqual(exc.exception.detail['code'], 'ocr_failed')
        self.assertEqual(exc.exception.detail['message'], '無法從圖片辨識出可用文字。')


if __name__ == '__main__':
    unittest.main()
