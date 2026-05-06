import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

from mediaflow.cli import main


class CliTests(unittest.TestCase):
    def test_sources_outputs_json_candidates(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            card = root / "EOS_DIGITAL" / "DCIM" / "100CANON"
            card.mkdir(parents=True)
            (card / "IMG_0001.CR3").write_bytes(b"raw")

            output = self._run_cli("mediaflow", "sources", str(root))

            candidates = json.loads(output)
            self.assertEqual(candidates[0]["path"], str(card.parents[1]))
            self.assertEqual(candidates[0]["media_count"], 1)

    def test_ingest_dry_run_outputs_plan_summary(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "card"
            destination = root / "library"
            source.mkdir()
            (source / "IMG_0001.JPG").write_bytes(b"jpeg")

            output = self._run_cli(
                "mediaflow",
                "ingest",
                "--source",
                str(source),
                "--destination",
                str(destination),
                "--source-kind",
                "removable",
            )

            summary = json.loads(output)
            self.assertEqual(summary["operation_count"], 1)
            self.assertEqual(summary["mode"], "copy")
            self.assertFalse(destination.exists())

    def test_ingest_execute_prints_manifest_path(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "card"
            destination = root / "library"
            source.mkdir()
            (source / "IMG_0001.JPG").write_bytes(b"jpeg")

            output = self._run_cli(
                "mediaflow",
                "ingest",
                "--source",
                str(source),
                "--destination",
                str(destination),
                "--execute",
            )

            self.assertIn("Manifest written:", output)
            self.assertTrue((destination / "_manifests").exists())

    def _run_cli(self, *argv: str) -> str:
        stdout = io.StringIO()
        with patch("sys.argv", list(argv)), redirect_stdout(stdout):
            exit_code = main()
        self.assertEqual(exit_code, 0)
        return stdout.getvalue()


if __name__ == "__main__":
    unittest.main()
