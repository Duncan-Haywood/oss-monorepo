"""End-to-end CLI tests: build a bundle from a descriptor, then verify it.

These drive the real argparse entry point and read the files it writes, so the
exit-code contract (0 only on a clean bundle / full reproduction) is covered.
"""

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from provenance_ledger import cli  # noqa: E402


class CliTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.addCleanup(self._tmp.cleanup)
        (self.root / "package.json").write_bytes(b'{"name":"acme","version":"1.0.0"}')
        (self.root / "package-lock.json").write_bytes(b"lockfile-bytes")
        self.descriptor_path = self.root / "release.json"
        self.descriptor_path.write_text(
            json.dumps(
                {
                    "release": "acme@1.0.0",
                    "source": {"commit": "9f3a1c", "url": "https://example.test/c/9f3a1c"},
                    "inputs": [
                        {"role": "manifest", "path": "package.json"},
                        {"role": "lockfile", "path": "package-lock.json"},
                    ],
                }
            )
        )

    def _run(self, argv) -> int:
        try:
            cli.main(argv)
        except SystemExit as exc:
            return int(exc.code or 0)
        return 0

    def test_bundle_then_verify_round_trip(self):
        bundle_path = self.root / "bundle.json"
        code = self._run(["bundle", str(self.descriptor_path), "--output", str(bundle_path)])
        self.assertEqual(code, 0)
        bundle = json.loads(bundle_path.read_text())
        self.assertEqual(bundle["release"], "acme@1.0.0")
        self.assertEqual(len(bundle["inputs"]), 2)

        code = self._run(["verify", str(bundle_path)])
        self.assertEqual(code, 0)  # full reproduction

    def test_verify_detects_tampering_and_exits_nonzero(self):
        bundle_path = self.root / "bundle.json"
        self._run(["bundle", str(self.descriptor_path), "--output", str(bundle_path)])
        # Rebuild an "artifact" out from under the recorded hash.
        (self.root / "package.json").write_text('{"name":"acme","version":"1.0.1"}')
        code = self._run(["verify", str(bundle_path)])
        self.assertEqual(code, 1)

    def test_bundle_with_problem_exits_nonzero(self):
        bad = self.root / "bad.json"
        bad.write_text(json.dumps({"inputs": []}))  # no release, empty inputs
        code = self._run(["bundle", str(bad)])
        self.assertEqual(code, 1)

    def test_unreadable_descriptor_exits_two(self):
        code = self._run(["bundle", str(self.root / "nope.json")])
        self.assertEqual(code, 2)

    def test_markdown_output_written(self):
        out = self.root / "bundle.md"
        self._run(["bundle", str(self.descriptor_path), "--format", "markdown", "--output", str(out)])
        text = out.read_text()
        self.assertIn("# Software evidence bundle", text)
        self.assertIn("## Limits", text)

    def test_usage_file_counts_events(self):
        usage = self.root / "usage.json"
        bundle_path = self.root / "bundle.json"
        self._run(["bundle", str(self.descriptor_path), "--output", str(bundle_path), "--usage-file", str(usage)])
        self._run(["verify", str(bundle_path), "--usage-file", str(usage)])
        data = json.loads(usage.read_text())
        self.assertEqual(data["bundle_built"], 1)
        self.assertEqual(data["bundle_verified"], 1)
        # Usage records only event names and counts -- no paths or hashes.
        self.assertEqual(set(data), {"bundle_built", "bundle_verified"})


if __name__ == "__main__":
    unittest.main()
