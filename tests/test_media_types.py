import unittest

from media_tool.media_types import MediaKind, classify_extension, is_supported_media


class MediaTypeTests(unittest.TestCase):
    def test_classifies_common_camera_formats_case_insitively(self):
        self.assertEqual(classify_extension("CR3"), MediaKind.RAW_PHOTO)
        self.assertEqual(classify_extension(".jpg"), MediaKind.PHOTO)
        self.assertEqual(classify_extension("mov"), MediaKind.VIDEO)
        self.assertEqual(classify_extension(".wav"), MediaKind.AUDIO)
        self.assertEqual(classify_extension(".xmp"), MediaKind.SIDECAR)

    def test_identifies_unsupported_files(self):
        self.assertIsNone(classify_extension(".txt"))
        self.assertFalse(is_supported_media("notes.txt"))
        self.assertTrue(is_supported_media("clip.MP4"))


if __name__ == "__main__":
    unittest.main()
