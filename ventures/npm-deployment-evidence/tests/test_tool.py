import json
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from npm_deployment_evidence import build_report, main


class DeploymentEvidenceTests(unittest.TestCase):
    def fixture(self, root: Path) -> Path:
        path = root / "package-lock.json"
        path.write_text(json.dumps({
            "lockfileVersion": 3,
            "packages": {
                "": {"dependencies": {"runtime-lib": "^1.0.0"}},
                "node_modules/runtime-lib": {"version": "1.2.0"},
                "node_modules/build-tool": {"version": "2.0.0", "dev": True},
                "node_modules/nested-build/node_modules/nested-lib": {"version": "3.0.0", "dev": True},
            },
        }))
        return path

    def test_classifies_direct_and_dev_only_components(self):
        with TemporaryDirectory() as directory:
            report = build_report(self.fixture(Path(directory)))
        surfaces = {row["name"]: row["surface"] for row in report["components"]}
        self.assertEqual(surfaces, {"build-tool": "build-only", "nested-lib": "build-only", "runtime-lib": "production"})
        self.assertEqual(report["counts"], {"build-only": 2, "production": 1})

    def test_writes_json_and_counts_only_an_aggregate_event(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            lockfile = self.fixture(root)
            usage = root / "usage.json"
            output = root / "report.json"
            self.assertEqual(main([str(lockfile), "--format", "json", "--output", str(output), "--usage-file", str(usage)]), 0)
            self.assertEqual(json.loads(usage.read_text()), {"report_generated": 1})
            self.assertEqual(json.loads(output.read_text())["component_count"], 3)


if __name__ == "__main__":
    unittest.main()
