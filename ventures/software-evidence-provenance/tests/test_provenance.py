"""Unit tests for the provenance evidence-bundle logic.

Every test writes real files into a temp dir and hashes them -- no mocking of
the hash or the filesystem -- because the whole product claim is "these are the
actual bytes we looked at."
"""

import hashlib
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from provenance_ledger.provenance import (  # noqa: E402
    STATUS_CHANGED,
    STATUS_INCOMPLETE,
    STATUS_INCONCLUSIVE,
    STATUS_REPRODUCED,
    build_bundle,
    markdown_bundle,
    markdown_verification,
    verify_bundle,
)


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class BuildBundleTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.addCleanup(self._tmp.cleanup)

    def _write(self, name: str, data: bytes) -> str:
        (self.root / name).write_bytes(data)
        return name

    def test_records_real_hash_of_each_input(self):
        self._write("package.json", b'{"name":"acme"}')
        self._write("package-lock.json", b"lock-contents")
        descriptor = {
            "release": "acme@1.0.0",
            "inputs": [
                {"role": "manifest", "path": "package.json"},
                {"role": "lockfile", "path": "package-lock.json"},
            ],
        }
        bundle = build_bundle(descriptor, base_dir=self.root)
        self.assertEqual(bundle["release"], "acme@1.0.0")
        by_role = {inp["role"]: inp for inp in bundle["inputs"]}
        self.assertEqual(by_role["manifest"]["sha256"], _sha256(b'{"name":"acme"}'))
        self.assertEqual(by_role["lockfile"]["sha256"], _sha256(b"lock-contents"))
        self.assertEqual(bundle["problems"], [])

    def test_missing_input_is_not_present_and_fails_the_check(self):
        self._write("package.json", b"{}")
        descriptor = {
            "release": "acme@1.0.0",
            "inputs": [
                {"role": "manifest", "path": "package.json"},
                {"role": "artifact", "path": "dist/does-not-exist.tgz"},
            ],
        }
        bundle = build_bundle(descriptor, base_dir=self.root)
        artifact = next(i for i in bundle["inputs"] if i["role"] == "artifact")
        self.assertFalse(artifact["exists"])
        self.assertIsNone(artifact["sha256"])
        self.assertEqual(artifact["hash_match"], "unresolved")
        checks = {c["name"]: c for c in bundle["checks"]}
        self.assertEqual(checks["all_inputs_present"]["state"], "fail")
        self.assertEqual(checks["artifact_present"]["state"], "fail")

    def test_declared_hash_match_and_mismatch(self):
        good = self._write("good.tgz", b"good-artifact")
        bad = self._write("bad.tgz", b"tampered")
        descriptor = {
            "release": "r",
            "inputs": [
                {"role": "artifact", "path": good, "declared_sha256": _sha256(b"good-artifact")},
                {"role": "sbom", "path": bad, "declared_sha256": _sha256(b"what-was-expected")},
            ],
        }
        bundle = build_bundle(descriptor, base_dir=self.root)
        by_role = {inp["role"]: inp for inp in bundle["inputs"]}
        self.assertEqual(by_role["artifact"]["hash_match"], "matched")
        self.assertEqual(by_role["sbom"]["hash_match"], "mismatch")
        checks = {c["name"]: c for c in bundle["checks"]}
        self.assertEqual(checks["declared_hashes_matched"]["state"], "fail")

    def test_no_declared_hash_is_unresolved_never_pass(self):
        # The central invariant: an input we hashed but were given nothing to
        # check against is an unverified observation, not a passed check.
        self._write("a.json", b"content")
        descriptor = {"release": "r", "inputs": [{"role": "manifest", "path": "a.json"}]}
        bundle = build_bundle(descriptor, base_dir=self.root)
        self.assertEqual(bundle["inputs"][0]["hash_match"], "unresolved")
        checks = {c["name"]: c for c in bundle["checks"]}
        self.assertEqual(checks["declared_hashes_matched"]["state"], "unresolved")

    def test_undescribed_role_is_unresolved_never_pass(self):
        # No artifact input described at all -> the presence check for it is
        # unresolved, never "pass". Absence of description is not evidence.
        self._write("a.json", b"content")
        descriptor = {"release": "r", "inputs": [{"role": "manifest", "path": "a.json"}]}
        bundle = build_bundle(descriptor, base_dir=self.root)
        checks = {c["name"]: c for c in bundle["checks"]}
        self.assertEqual(checks["artifact_present"]["state"], "unresolved")
        self.assertEqual(checks["lockfile_present"]["state"], "unresolved")

    def test_source_commit_recorded_but_marked_unverified(self):
        self._write("a.json", b"x")
        descriptor = {
            "release": "r",
            "source": {"commit": "9f3a1c", "url": "https://example.test/commit/9f3a1c"},
            "inputs": [{"role": "manifest", "path": "a.json"}],
        }
        bundle = build_bundle(descriptor, base_dir=self.root)
        self.assertEqual(bundle["source"]["commit"], "9f3a1c")
        self.assertFalse(bundle["source"]["verified"])
        commit_check = next(c for c in bundle["checks"] if c["name"] == "source_commit_recorded")
        self.assertEqual(commit_check["state"], "pass")
        self.assertIn("not verified", commit_check["detail"])

    def test_bundle_is_deterministic_on_same_files(self):
        self._write("a.json", b"stable-content")
        descriptor = {"release": "r", "inputs": [{"role": "manifest", "path": "a.json"}]}
        first = build_bundle(descriptor, base_dir=self.root)
        second = build_bundle(descriptor, base_dir=self.root)
        # generated_at is null by design so the bundle is reproducible.
        self.assertIsNone(first["generated_at"])
        self.assertEqual(first["inputs"], second["inputs"])
        self.assertEqual(first["checks"], second["checks"])

    def test_malformed_descriptor_records_problems_without_raising(self):
        self.assertEqual(build_bundle(["not", "a", "dict"])["problems"][0][:10], "descriptor")
        empty = build_bundle({"release": "r", "inputs": []})
        self.assertIn("`inputs` must be a non-empty list", empty["problems"])
        no_release = build_bundle({"inputs": [{"role": "m", "path": "x"}]}, base_dir=self.root)
        self.assertIn("descriptor has no `release` label", no_release["problems"])

    def test_directory_path_is_unresolved_not_a_crash(self):
        (self.root / "adir").mkdir()
        descriptor = {"release": "r", "inputs": [{"role": "artifact", "path": "adir"}]}
        bundle = build_bundle(descriptor, base_dir=self.root)
        self.assertIsNone(bundle["inputs"][0]["sha256"])
        self.assertEqual(bundle["inputs"][0]["hash_match"], "unresolved")
        checks = {c["name"]: c for c in bundle["checks"]}
        # A directory exists but was never hashed -- presence is not a pass.
        self.assertEqual(checks["all_inputs_present"]["state"], "unresolved")
        self.assertEqual(checks["artifact_present"]["state"], "unresolved")
        self.assertNotIn("every named input file exists", checks["all_inputs_present"]["detail"])
        self.assertNotEqual(checks["artifact_present"]["detail"], "artifact input present")

    def test_unhashable_declared_hash_does_not_claim_match(self):
        (self.root / "adir").mkdir()
        descriptor = {
            "release": "r",
            "inputs": [
                {"role": "artifact", "path": "adir", "declared_sha256": "a" * 64},
                {"role": "manifest", "path": "gone.json", "declared_sha256": "b" * 64},
            ],
        }
        bundle = build_bundle(descriptor, base_dir=self.root)
        self.assertEqual(bundle["inputs"][0]["hash_match"], "unresolved")
        self.assertEqual(bundle["inputs"][1]["hash_match"], "unresolved")
        check = next(c for c in bundle["checks"] if c["name"] == "declared_hashes_matched")
        self.assertEqual(check["state"], "fail")
        self.assertNotIn("every declared_sha256 matched", check["detail"])
        self.assertIn("adir", check["detail"])
        self.assertIn("gone.json", check["detail"])


class VerifyBundleTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.addCleanup(self._tmp.cleanup)

    def _bundle(self, **overrides):
        (self.root / "a.json").write_bytes(b"v1")
        (self.root / "b.tgz").write_bytes(b"artifact-v1")
        descriptor = {
            "release": "acme@1.0.0",
            "inputs": [
                {"role": "manifest", "path": "a.json"},
                {"role": "artifact", "path": "b.tgz"},
            ],
        }
        descriptor.update(overrides)
        return build_bundle(descriptor, base_dir=self.root)

    def test_unchanged_files_reproduce(self):
        bundle = self._bundle()
        report = verify_bundle(bundle, base_dir=self.root)
        self.assertEqual(report["status"], STATUS_REPRODUCED)
        self.assertEqual(report["counts"].get("reproduced"), 2)

    def test_changed_content_reports_changed(self):
        bundle = self._bundle()
        (self.root / "b.tgz").write_bytes(b"artifact-v2-rebuilt")
        report = verify_bundle(bundle, base_dir=self.root)
        self.assertEqual(report["status"], STATUS_CHANGED)
        changed = next(f for f in report["findings"] if f["path"] == "b.tgz")
        self.assertEqual(changed["outcome"], "changed")

    def test_deleted_file_is_missing_and_incomplete_never_reproduced(self):
        bundle = self._bundle()
        (self.root / "b.tgz").unlink()
        report = verify_bundle(bundle, base_dir=self.root)
        self.assertEqual(report["status"], STATUS_INCOMPLETE)
        self.assertNotEqual(report["status"], STATUS_REPRODUCED)

    def test_unhashed_input_cannot_reproduce(self):
        # An input the bundle never resolved a hash for must not count toward a
        # reproduced result -- it is unresolved, and drags the whole to incomplete.
        bundle = self._bundle()
        bundle["inputs"].append({"role": "sbom", "path": "never-hashed.json", "sha256": None})
        report = verify_bundle(bundle, base_dir=self.root)
        self.assertEqual(report["status"], STATUS_INCOMPLETE)

    def test_changed_dominates_incomplete(self):
        bundle = self._bundle()
        (self.root / "a.json").write_bytes(b"mutated")
        (self.root / "b.tgz").unlink()
        report = verify_bundle(bundle, base_dir=self.root)
        # A known-changed input is a stronger signal than a merely missing one.
        self.assertEqual(report["status"], STATUS_CHANGED)

    def test_malformed_bundle_is_inconclusive(self):
        self.assertEqual(verify_bundle("nope")["status"], STATUS_INCONCLUSIVE)
        self.assertEqual(verify_bundle({"no": "inputs"})["status"], STATUS_INCONCLUSIVE)
        self.assertEqual(verify_bundle({"inputs": []})["status"], STATUS_INCONCLUSIVE)

    def test_round_trip_through_json_shape(self):
        import json

        bundle = json.loads(json.dumps(self._bundle()))
        report = verify_bundle(bundle, base_dir=self.root)
        self.assertEqual(report["status"], STATUS_REPRODUCED)


class MarkdownTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.addCleanup(self._tmp.cleanup)

    def test_markdown_bundle_shows_unverified_commit_and_limits(self):
        (self.root / "a.json").write_bytes(b"x")
        bundle = build_bundle(
            {"release": "r", "source": {"commit": "abc123"}, "inputs": [{"role": "manifest", "path": "a.json"}]},
            base_dir=self.root,
        )
        md = markdown_bundle(bundle)
        self.assertIn("not verified", md)
        self.assertIn("## Limits", md)
        self.assertIn("## Checks", md)

    def test_markdown_verification_states_result(self):
        (self.root / "a.json").write_bytes(b"x")
        bundle = build_bundle({"release": "r", "inputs": [{"role": "manifest", "path": "a.json"}]}, base_dir=self.root)
        md = markdown_verification(verify_bundle(bundle, base_dir=self.root))
        self.assertIn("REPRODUCED", md)
        self.assertIn("## Limits", md)


if __name__ == "__main__":
    unittest.main()
