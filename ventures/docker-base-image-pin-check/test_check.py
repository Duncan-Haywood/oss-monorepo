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

    def test_uppercase_sha256_hex_is_not_a_valid_pin(self):
        # go-digest validates sha256 as ^[a-f0-9]{64}$; Docker rejects upper case.
        classification, _, _, _ = dbc.classify_from(f"node@sha256:{'A' * 64}", set())
        self.assertEqual(classification, dbc.MUTABLE)

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

    def test_arg_default_is_substituted_and_classified(self):
        # Quality audit 2026-11-17 defect 0: this used to be dropped silently.
        text = "ARG BASE_IMAGE=node:18\nFROM ${BASE_IMAGE}\n"
        findings = dbc.scan_text(text, filename="Dockerfile")
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["classification"], dbc.MUTABLE)
        self.assertEqual((findings[0]["image"], findings[0]["tag"]), ("node", "18"))
        self.assertEqual(findings[0]["from_arg"], "${BASE_IMAGE}")

    def test_docker_reference_build_arg_pattern_is_flagged(self):
        text = "ARG NODE_VERSION=18\nFROM node:${NODE_VERSION}-alpine\n"
        [finding] = dbc.scan_text(text, filename="Dockerfile")
        self.assertEqual(finding["classification"], dbc.MUTABLE)
        self.assertEqual(finding["tag"], "18-alpine")
        self.assertEqual(finding["remediation"], "docker buildx imagetools inspect node:18-alpine")

    def test_arg_default_pinned_to_digest_is_pinned(self):
        text = f"ARG BASE=node@{DIGEST}\nFROM $BASE\n"
        [finding] = dbc.scan_text(text, filename="Dockerfile")
        self.assertEqual(finding["classification"], dbc.PINNED)

    def test_arg_with_no_default_is_unresolved_and_a_risk(self):
        text = "ARG NODE_VERSION\nFROM node:${NODE_VERSION}\n"
        findings = dbc.scan_text(text, filename="Dockerfile")
        self.assertEqual([f["classification"] for f in findings], [dbc.UNRESOLVED])
        self.assertEqual(findings[0]["unresolved_args"], ["NODE_VERSION"])
        self.assertTrue(dbc.has_unresolved_risk(findings))

    def test_arg_declared_inside_a_stage_does_not_reach_a_later_from(self):
        # Docker: only ARGs before the first FROM are in scope for FROM lines.
        text = "FROM alpine@" + DIGEST + "\nARG V=18\nFROM node:${V}\n"
        findings = dbc.scan_text(text, filename="Dockerfile")
        self.assertEqual(findings[1]["classification"], dbc.UNRESOLVED)

    def test_literal_digest_with_variable_registry_is_pinned(self):
        text = f"ARG REG\nFROM ${{REG}}/app@{DIGEST}\n"
        [finding] = dbc.scan_text(text, filename="Dockerfile")
        self.assertEqual(finding["classification"], dbc.PINNED)

    def test_default_operators(self):
        args = {"SET": "x", "EMPTY": "", "UNSET": None}
        self.assertEqual(dbc.expand_args("${UNSET:-d}", args), ("d", []))
        self.assertEqual(dbc.expand_args("${EMPTY:-d}", args), ("d", []))
        self.assertEqual(dbc.expand_args("${EMPTY-d}", args), ("", []))
        self.assertEqual(dbc.expand_args("${SET:+w}", args), ("w", []))
        self.assertEqual(dbc.expand_args("${UNSET+w}", args), ("", []))
        self.assertEqual(dbc.expand_args("$UNSET", args)[1], ["UNSET"])

    def test_cli_fails_on_an_arg_built_mutable_image(self):
        with tempfile.TemporaryDirectory() as root:
            with open(os.path.join(root, "Dockerfile"), "w") as fh:
                fh.write("ARG NODE_VERSION=18\nFROM node:${NODE_VERSION}-alpine\n")
            with unittest.mock.patch("sys.stdout", new_callable=io.StringIO):
                self.assertEqual(dbc.main([root, "--fail-on-risk"]), 2)

    def test_scratch_only_file_does_not_claim_no_from_lines(self):
        # Audit defect 2: "no FROM lines found" was printed for files with FROM lines.
        with tempfile.TemporaryDirectory() as root:
            with open(os.path.join(root, "Dockerfile"), "w") as fh:
                fh.write("FROM scratch\nCOPY app /app\n")
            out = io.StringIO()
            with unittest.mock.patch("sys.stdout", out):
                dbc.main([root])
            self.assertNotIn("no FROM lines", out.getvalue())
            self.assertIn("all 1 FROM line(s) are scratch", out.getvalue())

    def test_truncated_or_uppercase_sha256_is_not_pinned(self):
        # Audit defect 3: OCI fixes sha256 at 64 lowercase hex characters.
        for ref in ("node@sha256:" + "a" * 40, "node@sha256:" + "A" * 64):
            self.assertEqual(dbc.classify_from(ref, set())[0], dbc.MUTABLE, ref)
        self.assertEqual(dbc.classify_from("node@sha512:" + "b" * 128, set())[0], dbc.PINNED)

    def test_malformed_digest_on_tagged_image_suggests_the_tag(self):
        # Audit defect 4: used to print `node:18:latest`.
        [finding] = dbc.scan_text("FROM node:18@sha256:abc\n", filename="Dockerfile")
        self.assertEqual(finding["remediation"], "docker buildx imagetools inspect node:18")

    def test_blank_line_inside_continuation_is_skipped(self):
        # Audit defect 5: no test covered it.
        text = "FROM \\\n\n    node:18\n"
        [finding] = dbc.scan_text(text, filename="Dockerfile")
        self.assertEqual((finding["image"], finding["tag"], finding["line"]), ("node", "18", 1))

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


class RedTeam20261116(unittest.TestCase):
    """Digest-grammar edges (three escaped mutants of _DIGEST_RE) and two real
    false positives: case-insensitive stage names and backslash continuations."""

    def test_digest_using_every_hex_digit_is_pinned(self):
        hexd = "0123456789abcdef" * 4
        self.assertEqual(dbc.classify_from(f"node@sha256:{hexd}", set())[0], dbc.PINNED)

    def test_32_hex_digest_is_shortest_pinned(self):
        self.assertEqual(dbc.classify_from("node@md5:" + "a" * 32, set())[0], dbc.PINNED)
        self.assertEqual(dbc.classify_from("node@md5:" + "a" * 31, set())[0], dbc.MUTABLE)

    def test_algorithm_with_separator_and_digits_is_pinned(self):
        self.assertEqual(dbc.classify_from("node@multihash+sha256:" + "a" * 64, set())[0], dbc.PINNED)

    def test_stage_name_matches_case_insensitively(self):
        findings = dbc.scan_text("FROM node:18 AS Build\nRUN make\nFROM build\nFROM B\n")
        self.assertEqual([f["image"] for f in findings], ["node", "B"])
        self.assertEqual(len(dbc.scan_text("FROM node:18 AS b\nFROM B\n")), 1)

    def test_backslash_continuation_is_one_instruction(self):
        text = (
            "FROM --platform=linux/amd64 \\\n    node:20 \\\n    AS build\nFROM build\n"
            "FROM \\\r\n  # a comment inside the continuation\n  ubuntu@" + DIGEST + "\r\n"
        )
        findings = dbc.scan_text(text, filename="Dockerfile")
        self.assertEqual(len(findings), 2)
        f0, f1 = findings
        self.assertEqual((f0["line"], f0["image"], f0["tag"], f0["classification"]), (1, "node", "20", dbc.MUTABLE))
        self.assertEqual(f0["remediation"], "docker buildx imagetools inspect node:20")
        self.assertEqual((f1["line"], f1["image"], f1["classification"]), (5, "ubuntu", dbc.PINNED))


    def test_backslash_right_after_the_tag_drops_only_the_backslash(self):
        findings = dbc.scan_text("FROM node:20\\\n  AS build\nFROM build\n", filename="Dockerfile")
        self.assertEqual(len(findings), 1)
        self.assertEqual((findings[0]["line"], findings[0]["image"], findings[0]["tag"]), (1, "node", "20"))


class RedTeam20261119(unittest.TestCase):
    """Red-team 2026-11-19: an escaped mutant (a set ARG beating a `:-`
    default) and three real defects in how main() reads its input, each of
    which let `--fail-on-risk` pass a Dockerfile with a mutable base image."""

    def run_main(self, argv):
        buf = io.StringIO()
        with unittest.mock.patch("sys.stdout", buf):
            code = dbc.main(argv)
        return code, buf.getvalue()

    def test_a_set_arg_beats_its_colon_dash_default(self):
        findings = dbc.scan_text("ARG V=3.12\nFROM python:${V:-3.11}\n")
        self.assertEqual((findings[0]["image"], findings[0]["tag"]), ("python", "3.12"))
        findings = dbc.scan_text('ARG V=""\nFROM python:${V:-3.11}\n')
        self.assertEqual(findings[0]["tag"], "3.11")

    def test_a_dockerfile_path_is_scanned_not_skipped(self):
        # Pre-commit hooks and CI steps pass file names; scanning nothing and
        # exiting 0 passed the very file the gate exists to reject.
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "build.Containerfile")
            with open(path, "w", encoding="utf-8") as handle:
                handle.write("FROM node:18\n")
            code, out = self.run_main([path, "--fail-on-risk"])
            self.assertEqual(code, 2)
            self.assertIn("node:18", out)

    def test_a_missing_path_is_an_error_not_a_pass(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(SystemExit) as raised, unittest.mock.patch("sys.stderr", io.StringIO()):
                self.run_main([os.path.join(tmp, "no-such-dir"), "--fail-on-risk"])
            self.assertNotEqual(raised.exception.code, 0)

    def test_a_utf8_bom_does_not_hide_the_first_from(self):
        # BuildKit strips a UTF-8 byte order mark (Windows editors write one).
        with tempfile.TemporaryDirectory() as tmp:
            with open(os.path.join(tmp, "Dockerfile"), "wb") as handle:
                handle.write(b"\xef\xbb\xbfFROM node:18\n")
            code, out = self.run_main([tmp, "--fail-on-risk"])
            self.assertEqual(code, 2)

    def test_a_non_utf8_byte_does_not_crash_the_scan(self):
        with tempfile.TemporaryDirectory() as tmp:
            with open(os.path.join(tmp, "Dockerfile"), "wb") as handle:
                handle.write(b"# caf\xe9\nFROM node:18\n")
            code, out = self.run_main([tmp, "--fail-on-risk"])
            self.assertEqual(code, 2)
            self.assertIn("node:18", out)


if __name__ == "__main__":
    unittest.main()
