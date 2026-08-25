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


if __name__ == "__main__":
    unittest.main()
