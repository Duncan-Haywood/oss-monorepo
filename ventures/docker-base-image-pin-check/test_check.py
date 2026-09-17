#!/usr/bin/env python3
"""Tests for check.py.

Most of these pin the boundary the tool exists to draw: a digest reference is
pinned, a tag -- even a specific-looking one like `:18` -- is mutable, and
stage/scratch/variable references are not this tool's concern at all because
none of them is a third-party registry pull whose owner can repoint it.
"""

import io
import json
import os
import tempfile
import unittest
import unittest.mock

import check as dbc

DIGEST = "sha256:" + "a" * 64


class SplitNameAndRef(unittest.TestCase):
    def test_bare_name_no_tag_no_digest(self):
        name, tag, digest = dbc.split_name_and_ref("node")
        self.assertEqual(name, "node")
        self.assertIsNone(tag)
        self.assertIsNone(digest)

    def test_name_with_tag(self):
        name, tag, digest = dbc.split_name_and_ref("node:18")
        self.assertEqual(name, "node")
        self.assertEqual(tag, "18")
        self.assertIsNone(digest)

    def test_name_with_digest(self):
        name, tag, digest = dbc.split_name_and_ref(f"node@{DIGEST}")
        self.assertEqual(name, "node")
        self.assertIsNone(tag)
        self.assertEqual(digest, DIGEST)

    def test_registry_with_port_is_not_mistaken_for_a_tag(self):
        name, tag, digest = dbc.split_name_and_ref("registry.example.com:5000/team/app:1.2")
        self.assertEqual(name, "registry.example.com:5000/team/app")
        self.assertEqual(tag, "1.2")
        self.assertIsNone(digest)

    def test_registry_with_port_and_no_tag(self):
        name, tag, digest = dbc.split_name_and_ref("registry.example.com:5000/team/app")
        self.assertEqual(name, "registry.example.com:5000/team/app")
        self.assertIsNone(tag)
        self.assertIsNone(digest)

    def test_tag_and_digest_both_present_keeps_digest(self):
        name, tag, digest = dbc.split_name_and_ref(f"node:18@{DIGEST}")
        self.assertEqual(name, "node:18")  # rsplit on "@" only -- digest wins downstream
        self.assertIsNone(tag)
        self.assertEqual(digest, DIGEST)


class ClassifyFrom(unittest.TestCase):
    def test_digest_reference_is_pinned(self):
        classification, name, tag, digest = dbc.classify_from(f"node@{DIGEST}", set())
        self.assertEqual(classification, dbc.PINNED)
        self.assertEqual(name, "node")
        self.assertIsNone(tag)
        self.assertEqual(digest, DIGEST)

    def test_uppercase_digest_hex_is_still_pinned(self):
        classification, _, _, _ = dbc.classify_from(f"node@sha256:{'A' * 64}", set())
        self.assertEqual(classification, dbc.PINNED)

    def test_specific_version_tag_is_still_mutable(self):
        """The one distinction this tool exists to draw: node:18 looks
        pinned and is not."""
        classification, name, tag, digest = dbc.classify_from("node:18", set())
        self.assertEqual(classification, dbc.MUTABLE)
        self.assertEqual(name, "node")
        self.assertEqual(tag, "18")
        self.assertIsNone(digest)

    def test_explicit_latest_is_mutable(self):
        classification, _, tag, _ = dbc.classify_from("node:latest", set())
        self.assertEqual(classification, dbc.MUTABLE)
        self.assertEqual(tag, "latest")

    def test_bare_name_with_no_tag_is_mutable(self):
        """No tag at all resolves to :latest -- the most mutable case there is."""
        classification, name, tag, digest = dbc.classify_from("node", set())
        self.assertEqual(classification, dbc.MUTABLE)
        self.assertEqual(name, "node")
        self.assertIsNone(tag)

    def test_scratch_is_skipped(self):
        classification, name, _, _ = dbc.classify_from("scratch", set())
        self.assertEqual(classification, dbc.SCRATCH)
        self.assertEqual(name, "scratch")

    def test_scratch_is_case_insensitive(self):
        classification, _, _, _ = dbc.classify_from("SCRATCH", set())
        self.assertEqual(classification, dbc.SCRATCH)

    def test_build_stage_reference_is_skipped(self):
        classification, name, _, _ = dbc.classify_from("builder", {"builder"})
        self.assertEqual(classification, dbc.STAGE)
        self.assertEqual(name, "builder")

    def test_arg_substitution_is_variable(self):
        classification, _, _, _ = dbc.classify_from("${BASE_IMAGE}", set())
        self.assertEqual(classification, dbc.VARIABLE)

    def test_arg_substitution_in_tag_position_is_variable(self):
        classification, _, _, _ = dbc.classify_from("node:${NODE_VERSION}", set())
        self.assertEqual(classification, dbc.VARIABLE)

    def test_malformed_digest_suffix_is_mutable_not_dropped(self):
        classification, _, _, digest = dbc.classify_from("node@not-a-real-digest", set())
        self.assertEqual(classification, dbc.MUTABLE)
        self.assertEqual(digest, "not-a-real-digest")


class RemediationCommand(unittest.TestCase):
    def test_with_tag(self):
        self.assertEqual(
            dbc.remediation_command("node", "18"),
            "docker buildx imagetools inspect node:18",
        )

    def test_with_no_tag_assumes_latest(self):
        self.assertEqual(
            dbc.remediation_command("node", None),
            "docker buildx imagetools inspect node:latest",
        )


class ScanText(unittest.TestCase):
    def test_pinned_image_produces_a_clean_pinned_finding(self):
        text = f"FROM node@{DIGEST}\nRUN npm install\n"
        findings = dbc.scan_text(text, filename="Dockerfile")
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["classification"], dbc.PINNED)
        self.assertEqual(findings[0]["line"], 1)
        self.assertNotIn("remediation", findings[0])

    def test_mutable_tag_is_flagged_with_remediation(self):
        text = "FROM node:18\n"
        findings = dbc.scan_text(text, filename="Dockerfile")
        self.assertEqual(len(findings), 1)
        finding = findings[0]
        self.assertEqual(finding["classification"], dbc.MUTABLE)
        self.assertEqual(finding["image"], "node")
        self.assertEqual(finding["tag"], "18")
        self.assertEqual(finding["remediation"], "docker buildx imagetools inspect node:18")

    def test_multi_stage_second_from_referencing_first_is_skipped(self):
        text = "FROM node:18 AS builder\nRUN npm run build\nFROM builder AS runtime\nCMD [\"node\", \"server.js\"]\n"
        findings = dbc.scan_text(text, filename="Dockerfile")
        # Only the first FROM (node:18) is a finding; the second references
        # the "builder" stage, not a registry image.
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["image"], "node")

    def test_scratch_is_skipped_entirely(self):
        text = "FROM scratch\nCOPY app /app\n"
        findings = dbc.scan_text(text, filename="Dockerfile")
        self.assertEqual(findings, [])

    def test_variable_reference_is_skipped_entirely(self):
        text = "ARG BASE_IMAGE=node:18\nFROM ${BASE_IMAGE}\n"
        findings = dbc.scan_text(text, filename="Dockerfile")
        self.assertEqual(findings, [])

    def test_commented_out_from_line_is_ignored(self):
        text = f"# FROM node:18\nFROM node@{DIGEST}\n"
        findings = dbc.scan_text(text, filename="Dockerfile")
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["classification"], dbc.PINNED)

    def test_platform_flag_is_tolerated(self):
        text = "FROM --platform=linux/amd64 node:18\n"
        findings = dbc.scan_text(text, filename="Dockerfile")
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["image"], "node")
        self.assertEqual(findings[0]["tag"], "18")

    def test_multiple_from_stages_all_scanned(self):
        text = (
            f"FROM node:18 AS builder\n"
            f"RUN npm run build\n"
            f"FROM node@{DIGEST} AS runtime\n"
            f"COPY --from=builder /app/dist /app/dist\n"
        )
        findings = dbc.scan_text(text, filename="Dockerfile")
        self.assertEqual(len(findings), 2)
        classifications = [f["classification"] for f in findings]
        self.assertEqual(classifications.count(dbc.MUTABLE), 1)
        self.assertEqual(classifications.count(dbc.PINNED), 1)

    def test_line_numbers_are_one_indexed_and_correct(self):
        text = "# comment\nARG X=1\nFROM node:18\n"
        findings = dbc.scan_text(text, filename="Dockerfile")
        self.assertEqual(findings[0]["line"], 3)


class DiscoverDockerfiles(unittest.TestCase):
    def test_finds_dockerfile_and_variants(self):
        with tempfile.TemporaryDirectory() as tmp:
            open(os.path.join(tmp, "Dockerfile"), "w").close()
            open(os.path.join(tmp, "Dockerfile.prod"), "w").close()
            open(os.path.join(tmp, "worker.dockerfile"), "w").close()
            open(os.path.join(tmp, "notes.txt"), "w").close()
            files = dbc.discover_dockerfiles(tmp)
            names = sorted(os.path.basename(f) for f in files)
            self.assertEqual(names, ["Dockerfile", "Dockerfile.prod", "worker.dockerfile"])

    def test_skips_git_and_node_modules(self):
        with tempfile.TemporaryDirectory() as tmp:
            os.makedirs(os.path.join(tmp, ".git"))
            open(os.path.join(tmp, ".git", "Dockerfile"), "w").close()
            os.makedirs(os.path.join(tmp, "node_modules", "some-pkg"))
            open(os.path.join(tmp, "node_modules", "some-pkg", "Dockerfile"), "w").close()
            open(os.path.join(tmp, "Dockerfile"), "w").close()
            files = dbc.discover_dockerfiles(tmp)
            self.assertEqual(len(files), 1)

    def test_missing_dir_returns_empty(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(dbc.discover_dockerfiles(os.path.join(tmp, "nope")), [])


class ScanPath(unittest.TestCase):
    def test_scans_every_dockerfile(self):
        with tempfile.TemporaryDirectory() as tmp:
            with open(os.path.join(tmp, "Dockerfile"), "w", encoding="utf-8") as fh:
                fh.write("FROM node:18\n")
            with open(os.path.join(tmp, "Dockerfile.worker"), "w", encoding="utf-8") as fh:
                fh.write(f"FROM node@{DIGEST}\n")
            findings = dbc.scan_path(tmp)
            self.assertEqual(len(findings), 2)


class HasUnresolvedRisk(unittest.TestCase):
    def test_true_when_any_mutable_finding(self):
        findings = [{"classification": dbc.PINNED}, {"classification": dbc.MUTABLE}]
        self.assertTrue(dbc.has_unresolved_risk(findings))

    def test_false_when_all_pinned(self):
        self.assertFalse(dbc.has_unresolved_risk([{"classification": dbc.PINNED}]))

    def test_false_on_empty(self):
        self.assertFalse(dbc.has_unresolved_risk([]))


class Main(unittest.TestCase):
    def run_main(self, argv):
        buf = io.StringIO()
        with unittest.mock.patch("sys.stdout", buf):
            code = dbc.main(argv)
        return code, buf.getvalue()

    def make_repo(self, tmp, text, name="Dockerfile"):
        with open(os.path.join(tmp, name), "w", encoding="utf-8") as handle:
            handle.write(text)

    def test_clean_repo_exits_zero_even_without_fail_on_risk(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.make_repo(tmp, f"FROM node@{DIGEST}\n")
            code, out = self.run_main([tmp])
            self.assertEqual(code, 0)
            self.assertIn("already pinned", out)

    def test_mutable_repo_exits_zero_without_fail_on_risk(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.make_repo(tmp, "FROM node:18\n")
            code, out = self.run_main([tmp])
            self.assertEqual(code, 0)
            self.assertIn("mutable base image reference(s) found", out)

    def test_mutable_repo_with_fail_on_risk_exits_two(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.make_repo(tmp, "FROM node:18\n")
            code, _ = self.run_main([tmp, "--fail-on-risk"])
            self.assertEqual(code, 2)

    def test_clean_repo_with_fail_on_risk_exits_zero(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.make_repo(tmp, f"FROM node@{DIGEST}\n")
            code, _ = self.run_main([tmp, "--fail-on-risk"])
            self.assertEqual(code, 0)

    def test_json_output_shape(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.make_repo(tmp, "FROM node:18\n")
            code, out = self.run_main([tmp, "--format", "json"])
            self.assertEqual(code, 0)
            data = json.loads(out)
            self.assertEqual(len(data), 1)
            self.assertEqual(
                set(data[0]),
                {"file", "line", "image", "tag", "digest", "classification", "remediation"},
            )
            self.assertEqual(data[0]["classification"], "mutable")
            self.assertEqual(data[0]["tag"], "18")

    def test_json_output_pinned_finding_has_no_remediation_key(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.make_repo(tmp, f"FROM node@{DIGEST}\n")
            code, out = self.run_main([tmp, "--format", "json"])
            data = json.loads(out)
            self.assertNotIn("remediation", data[0])

    def test_no_dockerfiles_reports_clearly(self):
        with tempfile.TemporaryDirectory() as tmp:
            code, out = self.run_main([tmp])
            self.assertEqual(code, 0)
            self.assertIn("No Dockerfile", out)

    def test_default_path_is_current_directory(self):
        # Smoke check: invoking with no path argument does not raise.
        with tempfile.TemporaryDirectory() as tmp:
            cwd = os.getcwd()
            try:
                os.chdir(tmp)
                code, _ = self.run_main([])
                self.assertEqual(code, 0)
            finally:
                os.chdir(cwd)


if __name__ == "__main__":
    unittest.main()
