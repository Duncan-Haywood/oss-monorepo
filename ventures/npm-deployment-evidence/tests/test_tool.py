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

    def test_names_yarn_lock_instead_of_json_parse_error(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "yarn.lock"
            path.write_text("# yarn lockfile v1\n\nlodash@^4.0.0:\n  version \"4.17.21\"\n", encoding="utf-8")
            with self.assertRaises(ValueError) as raised:
                build_report(path)
        message = str(raised.exception)
        self.assertIn("yarn.lock", message)
        self.assertIn("package-lock.json", message)
        self.assertNotIn("Expecting value", message)

    def test_names_pnpm_lock_from_filename_and_content(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "pnpm-lock.yaml"
            path.write_text(
                "lockfileVersion: 5.4\n\nimporters:\n  .\n    dependencies:\n      lodash: 4.17.21\n",
                encoding="utf-8",
            )
            with self.assertRaises(ValueError) as raised:
                build_report(path)
        self.assertIn("pnpm-lock.yaml", str(raised.exception))

    def test_writes_json_and_counts_only_an_aggregate_event(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            lockfile = self.fixture(root)
            usage = root / "usage.json"
            output = root / "report.json"
            self.assertEqual(main([str(lockfile), "--format", "json", "--output", str(output), "--usage-file", str(usage)]), 0)
            self.assertEqual(json.loads(usage.read_text()), {"report_generated": 1})
            self.assertEqual(json.loads(output.read_text())["component_count"], 3)

    def test_cli_prints_yarn_message_instead_of_traceback(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "yarn.lock"
            path.write_text("# yarn lockfile v1\n\nfoo@1.0.0:\n  version \"1.0.0\"\n", encoding="utf-8")
            with self.assertRaises(SystemExit) as raised:
                main([str(path)])
        self.assertEqual(raised.exception.code, 2)


if __name__ == "__main__":
    unittest.main()
