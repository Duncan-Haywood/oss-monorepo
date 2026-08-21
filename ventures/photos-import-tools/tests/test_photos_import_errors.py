import re
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

    def test_duplicate_preflight_timeout_triggers_run_preflight(self):
        # "duplicate preflight timed out" contains the substring "timed out",
        # so it must be checked before the generic timeout pattern -- placed
        # after it, that generic pattern always matches first and this one is
        # unreachable, silently downgrading a preflight-specific timeout to a
        # plain RETRY_BACKOFF instead of the RUN_PREFLIGHT recovery it needs.
        result = classify_error("Duplicate preflight timed out")
        self.assertEqual(result.category, ErrorCategory.TRANSIENT)
        self.assertEqual(result.action, ErrorAction.RUN_PREFLIGHT)
        self.assertEqual(result.code, "preflight_timeout")

    def test_file_missing_after_icloud_wait_is_classified_permanent(self):
        # resumable_photos_import.wait_for_file() gives up after
        # ICLOUD_WAIT_ATTEMPTS and classifies the literal message
        # f"file missing after {ICLOUD_WAIT_ATTEMPTS} iCloud wait attempts".
        # The permanent "file_missing" pattern was written as
        # "file missing after.*retries|permanently unavailable", but that
        # generated message says "wait attempts", not "retries" -- so the
        # pattern never matched the one message it exists to catch. It fell
        # through to every other transient/permanent pattern (none of which
        # match either) and landed on ErrorCategory.UNKNOWN /
        # ErrorAction.RETRY_BACKOFF, misreporting a legitimate permanent skip
        # (mark_skipped_permanent is called unconditionally at that call
        # site regardless of classification) as "unknown" in the error log
        # and in `status`'s "Recent errors" listing.
        result = classify_error("file missing after 6 iCloud wait attempts")
        self.assertEqual(result.category, ErrorCategory.PERMANENT)
        self.assertEqual(result.action, ErrorAction.SKIP_PERMANENT)
        self.assertEqual(result.code, "file_missing")

    def test_no_transient_pattern_is_shadowed_by_an_earlier_one(self):
        # Regression guard for the class of bug above, not just the one
        # instance: classify_error returns on the first pattern that matches,
        # so a pattern's own literal text must not itself be matched by any
        # pattern earlier in the list, or it can never fire no matter what
        # message it was written to catch.
        from photos_import_errors import _TRANSIENT_PATTERNS

        for index, (pattern, code, _action) in enumerate(_TRANSIENT_PATTERNS):
            probe = re.sub(r"[|()?*+\\.\[\]^$]", " ", pattern).strip()
            if not probe:
                continue
            for earlier_pattern, earlier_code, _ in _TRANSIENT_PATTERNS[:index]:
                self.assertIsNone(
                    re.search(earlier_pattern, probe),
                    f"pattern for {code!r} is shadowed by earlier pattern for {earlier_code!r}",
                )


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
