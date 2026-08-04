import unittest

from photos_import_errors import (
    ErrorAction,
    ErrorCategory,
    classify_error,
    split_batch,
)


class ErrorClassificationTests(unittest.TestCase):
    def test_timeout_is_transient_with_backoff(self):
        result = classify_error("Timed out after 180s")
        self.assertEqual(result.category, ErrorCategory.TRANSIENT)
        self.assertEqual(result.action, ErrorAction.RETRY_BACKOFF)
        self.assertEqual(result.code, "photos_timeout")

    def test_permission_denied_is_permanent(self):
        result = classify_error("Permission denied reading file")
        self.assertEqual(result.category, ErrorCategory.PERMANENT)
        self.assertEqual(result.action, ErrorAction.SKIP_PERMANENT)

    def test_icloud_missing_is_transient(self):
        result = classify_error("Can't get POSIX file: file does not exist")
        self.assertEqual(result.category, ErrorCategory.TRANSIENT)
        self.assertEqual(result.code, "icloud_unavailable")

    def test_photos_unresponsive_triggers_relaunch(self):
        result = classify_error("Application Photos is not responding")
        self.assertEqual(result.action, ErrorAction.RELAUNCH_PHOTOS)


class BatchSplitTests(unittest.TestCase):
    def test_split_batch_halves_items(self):
        items = list(range(8))
        left, right = split_batch(items)
        self.assertEqual(len(left), 4)
        self.assertEqual(len(right), 4)
        self.assertEqual(left + right, items)

    def test_split_batch_single_item(self):
        left, right = split_batch([1])
        self.assertEqual(left, [1])
        self.assertEqual(right, [])


if __name__ == "__main__":
    unittest.main()
