import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from atomic_io import write_json_atomic


class WriteJsonAtomicTests(unittest.TestCase):
    def test_writes_valid_json_and_leaves_no_tmp(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "record.json"
            write_json_atomic(path, {"b": 2, "a": 1})

            self.assertEqual(json.loads(path.read_text()), {"b": 2, "a": 1})
            self.assertEqual(list(path.parent.glob("*.tmp")), [])

    def test_sort_keys_matches_previous_writers(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "record.json"
            payload = {"b": 2, "a": 1}
            write_json_atomic(path, payload, sort_keys=True)

            # The importer/watchdog wrote sorted, indented JSON with a trailing
            # newline; the atomic writer must reproduce that byte-for-byte so
            # switching to it changes durability, not output.
            self.assertEqual(
                path.read_text(encoding="utf-8"),
                json.dumps(payload, indent=2, sort_keys=True) + "\n",
            )

    def test_creates_parent_directories(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "nested" / "deep" / "record.json"
            write_json_atomic(path, {"ok": True})

            self.assertTrue(path.exists())
            self.assertEqual(json.loads(path.read_text()), {"ok": True})

    def test_serialization_failure_leaves_existing_record_intact(self):
        # A plain write_text truncates the destination before it discovers the
        # payload cannot be serialized. Serializing first must leave a prior
        # record untouched -- the observability file stays readable.
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "record.json"
            write_json_atomic(path, {"generation": 1})

            with self.assertRaises(TypeError):
                write_json_atomic(path, {"bad": {1, 2, 3}})  # sets are not JSON

            self.assertEqual(json.loads(path.read_text()), {"generation": 1})
            self.assertEqual(list(path.parent.glob("*.tmp")), [])

    def test_failed_replace_preserves_previous_file_and_cleans_tmp(self):
        # If the process dies (or os.replace fails) after the temp file is
        # written but before the swap, the destination must still hold the
        # previous complete record -- never a half-written one -- and no temp
        # file may be orphaned next to it.
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "record.json"
            write_json_atomic(path, {"generation": 1})

            with mock.patch("atomic_io.os.replace", side_effect=OSError("boom")):
                with self.assertRaises(OSError):
                    write_json_atomic(path, {"generation": 2})

            self.assertEqual(json.loads(path.read_text()), {"generation": 1})
            self.assertEqual(list(path.parent.glob("*.tmp")), [])

    def test_a_reader_during_a_write_never_sees_a_torn_file(self):
        # The watchdog polls status.json while the importer rewrites it. Model
        # a poll landing mid-write: read the destination at the moment the new
        # content sits only in the temp file, just before the swap. The reader
        # must still parse the previous complete record.
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "status.json"
            write_json_atomic(path, {"generation": 1}, sort_keys=True)

            observed: list[dict] = []
            real_replace = os.replace

            def read_then_replace(src, dst):
                # Destination still untouched here; a concurrent reader sees v1.
                observed.append(json.loads(Path(dst).read_text()))
                real_replace(src, dst)

            with mock.patch("atomic_io.os.replace", side_effect=read_then_replace):
                write_json_atomic(path, {"generation": 2}, sort_keys=True)

            self.assertEqual(observed, [{"generation": 1}])
            self.assertEqual(json.loads(path.read_text()), {"generation": 2})


if __name__ == "__main__":
    unittest.main()
