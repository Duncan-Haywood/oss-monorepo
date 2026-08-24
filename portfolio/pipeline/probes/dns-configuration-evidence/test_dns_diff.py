import json
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from dns_diff import compare, load_observation

def observation(**changes):
    value = {"domain": "example.test", "captured_at": "2026-08-24T12:00:00Z", "resolver": "fixture-resolver-a", "queries": [{"type": "A", "state": "answer", "answers": ["192.0.2.10"]}, {"type": "TXT", "state": "answer", "answers": ["v=spf1 -all"]}]}
    value.update(changes); return value

class DnsDiffTests(unittest.TestCase):
    def test_changed_record_is_preserved(self):
        report = compare(observation(), observation(queries=[{"type": "A", "state": "answer", "answers": ["192.0.2.20"]}]))
        self.assertEqual(report["status"], "observed"); self.assertEqual(report["changes"][0]["change"], "changed")
    def test_timeout_is_inconclusive(self):
        report = compare(observation(), observation(queries=[{"type": "A", "state": "timeout", "answers": []}]))
        self.assertEqual(report["status"], "inconclusive")
    def test_resolver_change_is_inconclusive(self):
        self.assertEqual(compare(observation(), observation(resolver="fixture-resolver-b"))["status"], "inconclusive")
    def test_loader_rejects_missing_context(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "bad.json"; path.write_text(json.dumps({"domain": "example.test"}), encoding="utf-8")
            with self.assertRaises(ValueError): load_observation(path)

if __name__ == "__main__": unittest.main()
