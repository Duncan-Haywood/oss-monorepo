import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).parent
SCRIPT = ROOT / "vendor_evidence.py"


class VendorEvidenceTests(unittest.TestCase):
    def run_cli(self, *args):
        return subprocess.run([sys.executable, SCRIPT, *args], text=True, capture_output=True, check=True)

    def test_capture_and_diff_is_source_linked(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp); source = tmp / "privacy.html"; store = tmp / "snapshots"; usage = tmp / "usage.json"
            source.write_text("privacy\nversion one\n", encoding="utf-8")
            self.run_cli("capture", "--file", source, "--store", store, "--usage-file", usage)
            source.write_text("privacy\nversion two\n", encoding="utf-8")
            self.run_cli("capture", "--file", source, "--store", store, "--usage-file", usage)
            report = self.run_cli("diff", "--file", source, "--store", store, "--usage-file", usage).stdout
            self.assertIn("Changed since prior snapshot: yes", report)
            self.assertIn("-version one", report); self.assertIn("+version two", report)
            self.assertEqual(json.loads(usage.read_text())["snapshot_captured"], 2)
            self.assertEqual(json.loads(usage.read_text())["report_generated"], 1)

    def test_failed_url_capture_is_inconclusive(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = Path(tmp) / "snapshots"
            url = "http://127.0.0.1:1/privacy"
            self.run_cli("capture", "--url", url, "--store", store)
            report = self.run_cli("diff", "--url", url, "--store", store).stdout
            self.assertIn("Changed since prior snapshot: inconclusive", report)
            self.assertIn("Fetch failed", report)

    def test_failed_snapshot_does_not_become_comparison_baseline(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp); store = tmp / "snapshots"; url = "https://vendor.example/terms"
            store.mkdir()
            text = "same\n"
            digest = hashlib.sha256(text.encode()).hexdigest()
            snapshots = [
                {"captured_at": "2026-08-25T01:00:00Z", "source": url,
                 "source_type": "url", "status": 200, "sha256": digest, "text": text},
                {"captured_at": "2026-08-25T02:00:00Z", "source": url,
                 "source_type": "url", "status": None, "sha256": hashlib.sha256(b"").hexdigest(),
                 "text": "", "inconclusive": True, "error": "timeout"},
                {"captured_at": "2026-08-25T03:00:00Z", "source": url,
                 "source_type": "url", "status": 200, "sha256": digest, "text": text},
            ]
            for index, snapshot in enumerate(snapshots):
                (store / f"snapshot-{index}.json").write_text(json.dumps(snapshot), encoding="utf-8")
            report = self.run_cli("diff", "--url", url, "--store", store).stdout
            self.assertIn("Changed since prior snapshot: no", report)


if __name__ == "__main__":
    unittest.main()
