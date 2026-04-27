import base64
import unittest
from pathlib import Path
from unittest.mock import patch

import ai_recognition


class AIRecognitionTests(unittest.TestCase):
    @staticmethod
    def _fake_heif_payload(brand: bytes = b'heic') -> bytes:
        # ISO BMFF header + ftyp + compatible brand list.
        return b'\x00\x00\x00\x18ftyp' + brand + b'\x00\x00\x00\x00mif1heic'

    def test_validate_image_accepts_heic_when_decoder_available(self) -> None:
        with patch.object(ai_recognition, '_ensure_heif_decoder_available', return_value=True):
            normalized_type = ai_recognition._validate_image_input(
                file_content=b'image-bytes',
                content_type='image/heic',
                filename='camera.heic',
            )

        self.assertEqual(normalized_type, 'image/heic')

    def test_validate_image_accepts_heif_extension_with_octet_stream(self) -> None:
        with patch.object(ai_recognition, '_ensure_heif_decoder_available', return_value=True):
            normalized_type = ai_recognition._validate_image_input(
                file_content=b'image-bytes',
                content_type='application/octet-stream',
                filename='camera.heif',
            )

        self.assertEqual(normalized_type, 'image/heic')

    def test_validate_image_accepts_heic_sequence_content_type(self) -> None:
        with patch.object(ai_recognition, '_ensure_heif_decoder_available', return_value=True):
            normalized_type = ai_recognition._validate_image_input(
                file_content=b'image-bytes',
                content_type='image/heic-sequence',
                filename='camera.heic',
            )

        self.assertEqual(normalized_type, 'image/heic-sequence')

    def test_validate_image_accepts_heif_signature_with_octet_stream(self) -> None:
        with patch.object(ai_recognition, '_ensure_heif_decoder_available', return_value=True):
            normalized_type = ai_recognition._validate_image_input(
                file_content=self._fake_heif_payload(),
                content_type='application/octet-stream',
                filename='upload.bin',
            )

        self.assertEqual(normalized_type, 'image/heic')

    def test_validate_image_rejects_unknown_octet_stream_without_heif_hint(self) -> None:
        with self.assertRaises(ai_recognition.AIRecognitionError) as exc:
            ai_recognition._validate_image_input(
                file_content=b'not-a-heif',
                content_type='application/octet-stream',
                filename='upload.bin',
            )

        self.assertEqual(exc.exception.code, 'invalid_image')
        self.assertEqual(exc.exception.message, ai_recognition.SUPPORTED_IMAGE_FORMATS_MESSAGE)

    def test_validate_image_rejects_heic_when_decoder_unavailable(self) -> None:
        with patch.object(ai_recognition, '_ensure_heif_decoder_available', return_value=False):
            with self.assertRaises(ai_recognition.AIRecognitionError) as exc:
                ai_recognition._validate_image_input(
                    file_content=self._fake_heif_payload(),
                    content_type='image/heic',
                    filename='camera.heic',
                )

        self.assertEqual(exc.exception.code, 'invalid_image')
        self.assertEqual(exc.exception.message, ai_recognition.HEIF_DECODER_UNAVAILABLE_MESSAGE)

    def test_prepare_image_for_gemini_converts_heif_to_jpeg_payload(self) -> None:
        raw_image = unittest.mock.MagicMock()
        raw_image.format = 'HEIF'
        raw_image.mode = 'RGBA'
        converted_image = unittest.mock.MagicMock()
        raw_image.convert.return_value = converted_image
        converted_image.mode = 'RGB'

        def fake_save(stream, *, format, quality):
            self.assertEqual(format, 'JPEG')
            self.assertEqual(quality, 90)
            stream.write(b'jpeg-bytes')

        converted_image.save.side_effect = fake_save

        with (
            patch.object(ai_recognition, '_ensure_heif_decoder_available', return_value=True),
            patch.object(ai_recognition.Image, 'open', return_value=raw_image),
        ):
            mime_type, image_base64 = ai_recognition._prepare_image_for_gemini(
                file_content=b'fake-heif-bytes',
                content_type='image/heic',
                filename='sample.heic',
            )

        self.assertEqual(mime_type, 'image/jpeg')
        self.assertEqual(base64.b64decode(image_base64), b'jpeg-bytes')
        raw_image.convert.assert_called_once_with('RGB')
        converted_image.save.assert_called_once()

    def test_prepare_image_for_gemini_returns_invalid_image_when_decode_fails(self) -> None:
        with (
            patch.object(ai_recognition, '_ensure_heif_decoder_available', return_value=True),
            patch.object(ai_recognition.Image, 'open', side_effect=Exception('decode failed')),
        ):
            with self.assertRaises(ai_recognition.AIRecognitionError) as exc:
                ai_recognition._prepare_image_for_gemini(
                    file_content=b'fake-bytes',
                    content_type='image/heic',
                    filename='item.heic',
                )

        self.assertEqual(exc.exception.code, 'invalid_image')
        self.assertEqual(exc.exception.status_code, 400)
        self.assertEqual(exc.exception.message, '圖片格式無法解析或轉換失敗。')

    def test_extract_fields_with_gemini_parses_excerpt_field(self) -> None:
        payload = {
            'candidates': [
                {
                    'content': {
                        'parts': [
                            {
                                'text': (
                                    '{"name":"Router","model":"AX6000","specification":"Wi-Fi 6",'
                                    '"raw_text_excerpt":"Router AX6000 Wi-Fi 6",'
                                    '"confidence":{"name":0.95,"model":0.88,"specification":0.9}}'
                                )
                            }
                        ]
                    }
                }
            ]
        }
        with patch.object(ai_recognition, '_call_gemini', return_value=(payload, {'status': 'unknown'})):
            fields, confidence, raw_text_excerpt, quota = ai_recognition.extract_fields_with_gemini(
                image_mime_type='image/jpeg',
                image_base64='ZmFrZS1kYXRh',
            )

        self.assertEqual(fields['name'], 'Router')
        self.assertEqual(fields['model'], 'AX6000')
        self.assertEqual(fields['specification'], 'Wi-Fi 6')
        self.assertEqual(confidence['name'], 0.95)
        self.assertEqual(confidence['model'], 0.88)
        self.assertEqual(confidence['specification'], 0.9)
        self.assertEqual(raw_text_excerpt, 'Router AX6000 Wi-Fi 6')
        self.assertEqual(quota, {'status': 'unknown'})

    def test_select_best_field_candidate_prefers_confidence_then_completeness_then_order(self) -> None:
        candidates = [
            {
                'index': 1,
                'filename': 'b.jpg',
                'recognized_fields': {'name': 'Router', 'model': 'AX6000', 'specification': ''},
                'field_confidence': {'name': 0.9, 'model': 0.8, 'specification': 0.0},
                'raw_text_excerpt': 'short',
                'completeness': 2,
            },
            {
                'index': 0,
                'filename': 'a.jpg',
                'recognized_fields': {'name': 'Router Pro', 'model': 'AX6000', 'specification': 'Wi-Fi 6'},
                'field_confidence': {'name': 0.9, 'model': 0.9, 'specification': 0.9},
                'raw_text_excerpt': 'long excerpt',
                'completeness': 3,
            },
        ]
        best_name = ai_recognition._select_best_field_candidate('name', candidates)  # noqa: SLF001
        self.assertIsNotNone(best_name)
        self.assertEqual(best_name['filename'], 'a.jpg')
        self.assertEqual(best_name['value'], 'Router Pro')

    def test_batch_heic_retries_when_model_missing(self) -> None:
        first = ai_recognition.AIRecognitionResult(
            recognized_fields={'name': '相機', 'model': '', 'specification': '20MP'},
            field_confidence={'name': 0.9, 'model': 0.1, 'specification': 0.8},
            raw_text_excerpt='first pass',
            quota={'status': 'available'},
            warnings=['model not confidently extracted'],
        )
        second = ai_recognition.AIRecognitionResult(
            recognized_fields={'name': '相機', 'model': 'EOS R6', 'specification': '20MP'},
            field_confidence={'name': 0.9, 'model': 0.9, 'specification': 0.8},
            raw_text_excerpt='second pass',
            quota={'status': 'available'},
            warnings=[],
        )
        with (
            patch.object(ai_recognition, 'is_feature_enabled', return_value=True),
            patch.object(ai_recognition, 'recognize_spec_from_image', return_value=first),
            patch.object(ai_recognition, '_retry_heic_model_extraction', return_value=second) as retry_mock,
        ):
            result = ai_recognition.recognize_spec_from_images_batch(
                files=[{'filename': 'IMG_4648.HEIC', 'content_type': 'image/heic', 'file_content': b'heic-bytes'}]
            )

        self.assertEqual(result.merged_fields['model'], 'EOS R6')
        self.assertEqual(result.summary['succeeded'], 1)
        self.assertEqual(result.warnings, [])
        self.assertTrue(result.results[0]['retry_used'])
        retry_mock.assert_called_once()

    def test_get_quota_status_disabled_message_is_gemini_only(self) -> None:
        with (
            patch.object(ai_recognition, 'get_gemini_settings_snapshot', return_value={'token_setting': None, 'model_setting': None}),
            patch.object(ai_recognition, 'get_provider_name', return_value='gemini'),
        ):
            payload = ai_recognition.get_quota_status()

        self.assertFalse(payload['enabled'])
        self.assertEqual(payload['message'], 'Gemini token 尚未設定，AI 規格辨識功能未啟用。')
        self.assertNotIn('tesseract', payload['message'].lower())

    def test_get_quota_status_returns_degraded_payload_when_settings_read_fails(self) -> None:
        with (
            patch.object(ai_recognition, 'get_gemini_settings_snapshot', side_effect=RuntimeError('bad xlsx')),
            patch.object(ai_recognition, 'get_provider_name', return_value='gemini'),
        ):
            payload = ai_recognition.get_quota_status()

        self.assertFalse(payload['enabled'])
        self.assertEqual(payload['model'], 'gemini-2.5-flash')
        self.assertEqual(payload['message'], '系統設定儲存目前無法讀取，AI 規格辨識暫時停用。')

    def test_ai_recognition_module_has_no_tesseract_dependency_strings(self) -> None:
        module_path = Path(ai_recognition.__file__).resolve()
        content = module_path.read_text(encoding='utf-8').lower()
        for keyword in ('tesseract', 'tesseract_cmd', 'pytesseract'):
            self.assertNotIn(keyword, content)


if __name__ == '__main__':
    unittest.main()
