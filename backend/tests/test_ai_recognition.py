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
                            {'text': '{"name":"Router","model":"AX6000","specification":"Wi-Fi 6","raw_text_excerpt":"Router AX6000 Wi-Fi 6"}'}
                        ]
                    }
                }
            ]
        }
        with patch.object(ai_recognition, '_call_gemini', return_value=(payload, {'status': 'unknown'})):
            fields, raw_text_excerpt, quota = ai_recognition.extract_fields_with_gemini(
                image_mime_type='image/jpeg',
                image_base64='ZmFrZS1kYXRh',
            )

        self.assertEqual(fields['name'], 'Router')
        self.assertEqual(fields['model'], 'AX6000')
        self.assertEqual(fields['specification'], 'Wi-Fi 6')
        self.assertEqual(raw_text_excerpt, 'Router AX6000 Wi-Fi 6')
        self.assertEqual(quota, {'status': 'unknown'})

    def test_get_quota_status_disabled_message_is_gemini_only(self) -> None:
        with (
            patch.object(ai_recognition, 'is_feature_enabled', return_value=False),
            patch.object(ai_recognition, 'get_provider_name', return_value='gemini'),
            patch.object(ai_recognition, 'get_model_name', return_value='gemini-2.5-flash'),
        ):
            payload = ai_recognition.get_quota_status()

        self.assertFalse(payload['enabled'])
        self.assertEqual(payload['message'], 'Gemini token 尚未設定，AI 規格辨識功能未啟用。')
        self.assertNotIn('tesseract', payload['message'].lower())

    def test_ai_recognition_module_has_no_tesseract_dependency_strings(self) -> None:
        module_path = Path(ai_recognition.__file__).resolve()
        content = module_path.read_text(encoding='utf-8').lower()
        for keyword in ('tesseract', 'tesseract_cmd', 'pytesseract'):
            self.assertNotIn(keyword, content)


if __name__ == '__main__':
    unittest.main()
