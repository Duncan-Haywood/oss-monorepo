import json
import tempfile
import unittest
from pathlib import Path

from src.cra_evidence_desk.cli import main


class CliUsageFileTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.tmp = Path(self._tmp.name)
        self.sbom = self.tmp / "sbom.json"
        self.advisories = self.tmp / "advisories.json"
        self.sbom.write_text(json.dumps({"components": [{"name": "x", "version": "1", "ecosystem": "npm"}]}))
        self.advisories.write_text(json.dumps([]))

    def _run(self, usage_file):
        return main([
            str(self.sbom), str(self.advisories),
            "--product", "P", "--version", "V",
            "--format", "json",
            "--usage-file", str(usage_file),
        ])

    def test_usage_file_counts_events_across_runs(self):
        usage_file = self.tmp / "usage.json"
        self.assertEqual(self._run(usage_file), 0)
        self.assertEqual(self._run(usage_file), 0)
        data = json.loads(usage_file.read_text())
        self.assertEqual(data["events"]["evidence_report_generated"], 2)

    def test_corrupt_usage_file_does_not_crash_the_run(self):
        # Regression: a non-JSON (or otherwise unreadable) --usage-file used
        # to raise json.JSONDecodeError straight out of main(), crashing the
        # whole CLI invocation even though the SBOM/advisory match had
        # already succeeded. The local tally is best-effort telemetry and
        # must never block the evidence report it is attached to -- the same
        # rule this portfolio's other ventures already apply to their own
        # local usage counters.
        usage_file = self.tmp / "usage.json"
        usage_file.write_text("not json")
        self.assertEqual(self._run(usage_file), 0)
        data = json.loads(usage_file.read_text())
        self.assertEqual(data["events"]["evidence_report_generated"], 1)

    def test_usage_file_with_non_object_contents_is_reset_not_fatal(self):
        usage_file = self.tmp / "usage.json"
        usage_file.write_text("[1, 2, 3]")
        self.assertEqual(self._run(usage_file), 0)
        data = json.loads(usage_file.read_text())
        self.assertEqual(data["events"]["evidence_report_generated"], 1)

    def test_run_without_usage_file_still_succeeds(self):
        self.assertEqual(main([
            str(self.sbom), str(self.advisories),
            "--product", "P", "--version", "V",
            "--format", "json",
        ]), 0)


if __name__ == "__main__":
    unittest.main()
