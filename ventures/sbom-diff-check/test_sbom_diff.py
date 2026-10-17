import json
import subprocess
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import sbom_diff  # noqa: E402

CYCLONEDX_OLD = {
    "bomFormat": "CycloneDX",
    "specVersion": "1.5",
    "serialNumber": "urn:uuid:aaaa",
    "components": [
        {"type": "library", "name": "lodash", "version": "4.17.20", "purl": "pkg:npm/lodash@4.17.20"},
        {"type": "library", "name": "left-pad", "version": "1.3.0", "purl": "pkg:npm/left-pad@1.3.0"},
        {"type": "library", "name": "express", "version": "4.18.0", "purl": "pkg:npm/express@4.18.0"},
    ],
}

CYCLONEDX_NEW = {
    "bomFormat": "CycloneDX",
    "specVersion": "1.5",
    "serialNumber": "urn:uuid:bbbb",
    "components": [
        {"type": "library", "name": "lodash", "version": "4.17.21", "purl": "pkg:npm/lodash@4.17.21"},
        {"type": "library", "name": "express", "version": "4.18.0", "purl": "pkg:npm/express@4.18.0"},
        {"type": "library", "name": "chalk", "version": "5.3.0", "purl": "pkg:npm/chalk@5.3.0"},
    ],
}

SPDX_DOC = {
    "spdxVersion": "SPDX-2.3",
    "packages": [
        {"name": "requests", "versionInfo": "2.31.0", "SPDXID": "SPDXRef-Package-requests"},
        {"name": "internal-tool", "versionInfo": "NOASSERTION", "SPDXID": "SPDXRef-Package-internal"},
    ],
}


class ParseSbomTests(unittest.TestCase):
    def test_detects_cyclonedx_by_bomformat(self):
        fmt, components = sbom_diff.parse_sbom(json.dumps(CYCLONEDX_OLD))
        self.assertEqual(fmt, "CycloneDX")
        self.assertEqual(len(components), 3)
        self.assertEqual(components[0], {"name": "lodash", "version": "4.17.20", "purl": "pkg:npm/lodash@4.17.20"})

    def test_detects_cyclonedx_by_bare_components_array(self):
        doc = {"components": [{"name": "foo", "version": "1.0.0"}]}
        fmt, components = sbom_diff.parse_sbom(json.dumps(doc))
        self.assertEqual(fmt, "CycloneDX")
        self.assertEqual(components, [{"name": "foo", "version": "1.0.0", "purl": None}])

    def test_detects_spdx_and_treats_noassertion_as_unknown_version(self):
        fmt, components = sbom_diff.parse_sbom(json.dumps(SPDX_DOC))
        self.assertEqual(fmt, "SPDX")
        self.assertEqual(components[0], {"name": "requests", "version": "2.31.0", "purl": None})
        self.assertEqual(components[1], {"name": "internal-tool", "version": None, "purl": None})

    def test_rejects_invalid_json(self):
        with self.assertRaisesRegex(ValueError, "not valid JSON"):
            sbom_diff.parse_sbom("{not json", label="broken.json")

    def test_rejects_unrecognized_shape(self):
        with self.assertRaisesRegex(ValueError, "not a recognized CycloneDX or SPDX"):
            sbom_diff.parse_sbom(json.dumps({"hello": "world"}), label="mystery.json")

    def test_skips_components_with_no_name(self):
        doc = {"components": [{"version": "1.0.0"}, {"name": "keep-me"}]}
        _, components = sbom_diff.parse_sbom(json.dumps(doc))
        self.assertEqual([c["name"] for c in components], ["keep-me"])


class NestedAndGroupedComponentTests(unittest.TestCase):
    DOC = {
        "bomFormat": "CycloneDX",
        "components": [
            {
                "name": "app",
                "version": "1.0.0",
                "components": [
                    {"name": "inner", "version": "2.0.0", "components": [{"name": "deep", "version": "3.0.0"}]},
                ],
            },
            {"group": "@types", "name": "node", "version": "20.1.0"},
            {"name": "node", "version": "18.0.0"},
        ],
    }

    def test_nested_components_are_included_in_document_order(self):
        _, comps = sbom_diff.parse_sbom(json.dumps(self.DOC))
        self.assertEqual([c["name"] for c in comps], ["app", "inner", "deep", "@types/node", "node"])

    def test_group_keeps_same_named_packages_apart(self):
        _, old = sbom_diff.parse_sbom(json.dumps(self.DOC))
        newer = json.loads(json.dumps(self.DOC))
        newer["components"][1]["version"] = "20.2.0"
        _, new = sbom_diff.parse_sbom(json.dumps(newer))
        diff = sbom_diff.diff_components(old, new)
        self.assertEqual(diff["version_changed"], [{"name": "@types/node", "from": ["20.1.0"], "to": ["20.2.0"]}])
        self.assertEqual(diff["added"] + diff["removed"], [])

    def test_nameless_parent_still_yields_its_children(self):
        doc = {"components": [{"components": [{"name": "kid", "version": "1"}]}]}
        _, comps = sbom_diff.parse_sbom(json.dumps(doc))
        self.assertEqual([c["name"] for c in comps], ["kid"])


class DiffComponentsTests(unittest.TestCase):
    def test_added_removed_and_version_changed(self):
        _, old = sbom_diff.parse_sbom(json.dumps(CYCLONEDX_OLD))
        _, new = sbom_diff.parse_sbom(json.dumps(CYCLONEDX_NEW))
        diff = sbom_diff.diff_components(old, new)
        self.assertEqual(diff["added"], [{"name": "chalk", "version": "5.3.0"}])
        self.assertEqual(diff["removed"], [{"name": "left-pad", "version": "1.3.0"}])
        self.assertEqual(diff["version_changed"], [{"name": "lodash", "from": ["4.17.20"], "to": ["4.17.21"]}])
        self.assertTrue(sbom_diff.has_any_change(diff))

    def test_identical_documents_produce_no_changes(self):
        _, components = sbom_diff.parse_sbom(json.dumps(CYCLONEDX_OLD))
        diff = sbom_diff.diff_components(components, components)
        self.assertFalse(sbom_diff.has_any_change(diff))
        self.assertEqual(diff, {"added": [], "removed": [], "version_changed": []})

    def test_multi_version_package_reports_gained_and_lost_versions_not_a_crash(self):
        old = [{"name": "openssl", "version": "1.1.1", "purl": None}, {"name": "openssl", "version": "3.0.0", "purl": None}]
        new = [{"name": "openssl", "version": "3.0.0", "purl": None}, {"name": "openssl", "version": "3.1.0", "purl": None}]
        diff = sbom_diff.diff_components(old, new)
        self.assertEqual(diff["added"], [])
        self.assertEqual(diff["removed"], [])
        self.assertEqual(len(diff["version_changed"]), 1)
        vc = diff["version_changed"][0]
        self.assertEqual(vc["name"], "openssl")
        self.assertEqual(vc["from"], ["1.1.1"])
        self.assertEqual(vc["to"], ["3.1.0"])

    def test_missing_version_is_not_confused_with_a_real_version(self):
        old = [{"name": "vendored-thing", "version": None, "purl": None}]
        new = [{"name": "vendored-thing", "version": "2.0.0", "purl": None}]
        diff = sbom_diff.diff_components(old, new)
        self.assertEqual(diff["version_changed"], [{"name": "vendored-thing", "from": [None], "to": ["2.0.0"]}])

    def test_render_text_reports_no_changes(self):
        text = sbom_diff.render_text({"added": [], "removed": [], "version_changed": []}, 3, 3)
        self.assertIn("No package changes", text)
        self.assertIn("3", text)

    def test_render_text_lists_every_kind_of_change(self):
        diff = {
            "added": [{"name": "chalk", "version": "5.3.0"}],
            "removed": [{"name": "left-pad", "version": "1.3.0"}],
            "version_changed": [{"name": "lodash", "from": ["4.17.20"], "to": ["4.17.21"]}],
        }
        text = sbom_diff.render_text(diff, 3, 3)
        self.assertIn("+ chalk 5.3.0", text)
        self.assertIn("- left-pad 1.3.0", text)
        self.assertIn("lodash: 4.17.20 -> 4.17.21", text)
        self.assertIn("1 added, 1 removed, 1 version-changed", text)


class CliTests(unittest.TestCase):
    def _write(self, tmp_path, name, doc):
        path = tmp_path / name
        path.write_text(json.dumps(doc))
        return path

    def test_cli_json_output_and_exit_code(self, tmp_path=None):
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            old = self._write(tmp_path, "old.json", CYCLONEDX_OLD)
            new = self._write(tmp_path, "new.json", CYCLONEDX_NEW)

            result = subprocess.run(
                [sys.executable, str(Path(__file__).parent / "sbom_diff.py"), str(old), str(new), "--format", "json"],
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 0)
            payload = json.loads(result.stdout)
            self.assertEqual(payload["added"], [{"name": "chalk", "version": "5.3.0"}])

            fail_result = subprocess.run(
                [str(sys.executable), str(Path(__file__).parent / "sbom_diff.py"), str(old), str(new), "--fail-on-change"],
                capture_output=True,
                text=True,
            )
            self.assertEqual(fail_result.returncode, 2)

    def test_cli_no_change_exits_zero_even_with_fail_flag(self):
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            same = self._write(tmp_path, "same.json", CYCLONEDX_OLD)

            result = subprocess.run(
                [sys.executable, str(Path(__file__).parent / "sbom_diff.py"), str(same), str(same), "--fail-on-change"],
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 0)

    def test_cli_reports_unreadable_file(self):
        result = subprocess.run(
            [sys.executable, str(Path(__file__).parent / "sbom_diff.py"), "/nonexistent/old.json", "/nonexistent/new.json"],
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("error:", result.stderr)


if __name__ == "__main__":
    unittest.main()
