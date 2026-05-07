import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


class CliTests(unittest.TestCase):
    def test_dry_run_does_not_copy_or_write_manifest(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "card"
            library = root / "library"
            source.mkdir()
            (source / "IMG_0001.JPG").write_bytes(b"jpeg bytes")

            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "media_tool.cli",
                    "--source",
                    str(source),
                    "--library",
                    str(library),
                    "--shoot",
                    "dry-run-shoot",
                    "--dry-run",
                ],
                check=False,
                capture_output=True,
                text=True,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("Dry run only. No files copied.", result.stdout)
            self.assertFalse((library / "dry-run-shoot").exists())

    def test_invalid_input_returns_concise_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "media_tool.cli",
                    "--source",
                    str(root / "missing"),
                    "--library",
                    str(root / "library"),
                    "--shoot",
                    "../bad",
                ],
                check=False,
                capture_output=True,
                text=True,
            )

            self.assertEqual(result.returncode, 2)
            self.assertIn("Error:", result.stderr)
            self.assertNotIn("Traceback", result.stderr)

    def test_plan_time_filesystem_error_returns_concise_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "card"
            library = root / "library"
            source.mkdir()
            library.write_bytes(b"not a directory")
            (source / "IMG_0001.JPG").write_bytes(b"jpeg bytes")

            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "media_tool.cli",
                    "--source",
                    str(source),
                    "--library",
                    str(library),
                    "--shoot",
                    "bad-library",
                    "--dry-run",
                ],
                check=False,
                capture_output=True,
                text=True,
            )

            self.assertEqual(result.returncode, 2)
            self.assertIn("Error:", result.stderr)
            self.assertNotIn("Traceback", result.stderr)


if __name__ == "__main__":
    unittest.main()
