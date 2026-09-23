#!/usr/bin/env python3
"""Tests for check.py."""

import unittest
from datetime import date

import check as dbe


class SplitNameAndTag(unittest.TestCase):
    def test_bare_name_no_tag(self):
        name, tag = dbe.split_name_and_tag("node")
        self.assertEqual(name, "node")
        self.assertIsNone(tag)

    def test_name_with_tag(self):
        name, tag = dbe.split_name_and_tag("node:18")
        self.assertEqual((name, tag), ("node", "18"))

    def test_digest_has_no_tag(self):
        name, tag = dbe.split_name_and_tag("node@sha256:" + "a" * 64)
        self.assertEqual((name, tag), ("node", None))

    def test_registry_with_port_is_not_mistaken_for_a_tag(self):
        name, tag = dbe.split_name_and_tag("registry.example.com:5000/team/node:18")
        self.assertEqual((name, tag), ("registry.example.com:5000/team/node", "18"))


class NormalizeTag(unittest.TestCase):
    def test_strips_os_variant_suffix(self):
        self.assertEqual(dbe.normalize_tag("18-bookworm"), "18")
        self.assertEqual(dbe.normalize_tag("3.11-slim"), "3.11")

    def test_bare_version_unchanged(self):
        self.assertEqual(dbe.normalize_tag("22.04"), "22.04")


class ClassifyFrom(unittest.TestCase):
    TODAY = date(2026, 9, 23)

    def test_stage_reference_is_skipped(self):
        result = dbe.classify_from("builder", {"builder"}, self.TODAY, 90)
        self.assertEqual(result["classification"], dbe.STAGE)

    def test_scratch_is_skipped(self):
        result = dbe.classify_from("scratch", set(), self.TODAY, 90)
        self.assertEqual(result["classification"], dbe.SCRATCH)

    def test_build_arg_variable_is_skipped(self):
        result = dbe.classify_from("${BASE_IMAGE}", set(), self.TODAY, 90)
        self.assertEqual(result["classification"], dbe.VARIABLE)

    def test_no_tag_is_unknown(self):
        result = dbe.classify_from("node", set(), self.TODAY, 90)
        self.assertEqual(result["classification"], dbe.UNKNOWN_TAG)

    def test_latest_tag_is_unknown(self):
        result = dbe.classify_from("node:latest", set(), self.TODAY, 90)
        self.assertEqual(result["classification"], dbe.UNKNOWN_TAG)

    def test_image_not_in_table_is_unknown_image(self):
        result = dbe.classify_from("myregistry/custom-base:7", set(), self.TODAY, 90)
        self.assertEqual(result["classification"], dbe.UNKNOWN_IMAGE)

    def test_openjdk_is_deprecated_image_regardless_of_tag(self):
        result = dbe.classify_from("openjdk:17-jdk", set(), self.TODAY, 90)
        self.assertEqual(result["classification"], dbe.DEPRECATED_IMAGE)
        self.assertIn("eclipse-temurin", result["note"])

    def test_eclipse_temurin_is_not_flagged_deprecated(self):
        result = dbe.classify_from("eclipse-temurin:17-jdk", set(), self.TODAY, 90)
        self.assertNotEqual(result["classification"], dbe.DEPRECATED_IMAGE)

    def test_node_18_is_past_eol_on_2026_09_23(self):
        # Node 18 EOL 2025-04-30; fixed reference date well after it.
        result = dbe.classify_from("node:18", set(), self.TODAY, 90)
        self.assertEqual(result["classification"], dbe.EOL)
        self.assertGreater(result["days_past_eol"], 0)

    def test_node_18_with_os_suffix_still_resolves(self):
        result = dbe.classify_from("node:18-bookworm-slim", set(), self.TODAY, 90)
        self.assertEqual(result["classification"], dbe.EOL)

    def test_node_22_is_supported_on_2026_09_23(self):
        # Node 22 EOL 2027-04-30; more than 90 days from the fixed reference date.
        result = dbe.classify_from("node:22", set(), self.TODAY, 90)
        self.assertEqual(result["classification"], dbe.SUPPORTED)

    def test_debian_codename_resolves_same_as_numeric(self):
        by_codename = dbe.classify_from("debian:bullseye", set(), self.TODAY, 90)
        by_number = dbe.classify_from("debian:11-slim", set(), self.TODAY, 90)
        self.assertEqual(by_codename["classification"], by_number["classification"])
        self.assertEqual(by_codename["cycle"], by_number["cycle"])

    def test_ubuntu_codename_resolves_same_as_numeric(self):
        result = dbe.classify_from("ubuntu:focal", set(), self.TODAY, 90)
        self.assertEqual(result["cycle"], "20.04")

    def test_eol_soon_window_is_configurable(self):
        # Python 3.10 EOL 2026-10-04 -- 11 days after the fixed reference date.
        narrow = dbe.classify_from("python:3.10-slim", set(), self.TODAY, 5)
        wide = dbe.classify_from("python:3.10-slim", set(), self.TODAY, 90)
        self.assertEqual(narrow["classification"], dbe.SUPPORTED)
        self.assertEqual(wide["classification"], dbe.EOL_SOON)

    def test_official_library_prefix_does_not_change_the_verdict(self):
        result = dbe.classify_from("library/node:18", set(), self.TODAY, 90)
        self.assertEqual(result["classification"], dbe.EOL)


class ScanText(unittest.TestCase):
    def test_multi_stage_dockerfile(self):
        text = (
            "FROM node:18 AS builder\n"
            "WORKDIR /app\n"
            "FROM node:22 AS runtime\n"
            "COPY --from=builder /app/dist ./dist\n"
        )
        findings = dbe.scan_text(text, today=date(2026, 9, 23))
        classifications = [f["classification"] for f in findings]
        self.assertEqual(classifications, [dbe.EOL, dbe.SUPPORTED])

    def test_commented_from_line_is_ignored(self):
        text = "# FROM node:18\nFROM node:22\n"
        findings = dbe.scan_text(text, today=date(2026, 9, 23))
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["image"], "node")


class HasUnresolvedRisk(unittest.TestCase):
    def test_true_when_an_eol_finding_exists(self):
        findings = [{"classification": dbe.EOL}, {"classification": dbe.SUPPORTED}]
        self.assertTrue(dbe.has_unresolved_risk(findings))

    def test_false_when_only_eol_soon(self):
        findings = [{"classification": dbe.EOL_SOON}]
        self.assertFalse(dbe.has_unresolved_risk(findings))


if __name__ == "__main__":
    unittest.main()
