"""Tests for probe_substitutes.py.

Every test is offline: no HTTP is done, no fixture is fetched. The two functions
under test — ``tokenize`` and ``relevant`` — are what decides whether a package
counts as a free substitute, and every headline number in the summary depends
on them. An earlier draft of this script matched substrings and reported
``jest`` as a free substitute for an agent evaluation harness and ``helmet`` as
one for prompt-injection testing; the whole point of these tests is that
regression would not slip in silently again.
"""

from __future__ import annotations

import json
import os
import sys
import unittest
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import probe_substitutes as ps  # noqa: E402


def pkg(name, description="", keywords=None):
    return {"name": name, "description": description, "keywords": list(keywords or [])}


class TokenizeTests(unittest.TestCase):
    def test_splits_on_non_alnum_and_bigrams_adjacent(self):
        t = ps.tokenize("prompt-injection detection")
        self.assertIn("prompt", t)
        self.assertIn("injection", t)
        self.assertIn("detection", t)
        self.assertIn("prompt injection", t)  # adjacent bigram from the hyphen split
        self.assertIn("injection detection", t)  # adjacent bigram across the space

    def test_case_insensitive(self):
        self.assertEqual(ps.tokenize("Prompt"), ps.tokenize("prompt"))

    def test_no_cross_word_substring_leakage(self):
        # The regression this whole test file exists for.
        # 'domain' contains 'ai' as a substring, 'user-agent' contains 'agent'.
        t = ps.tokenize("domain user-agent")
        self.assertNotIn("ai", t)
        self.assertIn("user", t)
        self.assertIn("agent", t)
        self.assertIn("user agent", t)


class TermMatchesTests(unittest.TestCase):
    def test_hyphenated_term_matches_bigram(self):
        tokens = ps.tokenize("prompt-injection detection library")
        self.assertTrue(ps.term_matches("prompt-injection", tokens))

    def test_single_term_needs_whole_token(self):
        tokens = ps.tokenize("user-agent parser")
        self.assertFalse(ps.term_matches("agent", tokens) is False)  # 'agent' IS a whole token here
        # But not inside 'agentic':
        self.assertNotIn("agent", ps.tokenize("agentic"))


class RelevantTests(unittest.TestCase):
    def _spec(self, domain, action):
        return {"domain_groups": domain, "action_groups": action}

    def test_domain_must_appear_in_name_or_keywords_not_description(self):
        spec = self._spec([["wcag"]], [["audit"]])
        p = pkg("some-tool", description="does wcag audit", keywords=["frontend"])
        self.assertFalse(ps.relevant(p, spec))  # wcag only in description
        p2 = pkg("wcag-tool", description="does an audit", keywords=[])
        self.assertTrue(ps.relevant(p2, spec))

    def test_action_may_appear_in_description(self):
        spec = self._spec([["wcag"]], [["audit"]])
        p = pkg("wcag-tool", description="runs a full audit", keywords=[])
        self.assertTrue(ps.relevant(p, spec))

    def test_action_group_empty_means_action_not_required(self):
        spec = self._spec([["mcp"]], [])
        p = pkg("mcp-utils", description="whatever", keywords=[])
        self.assertTrue(ps.relevant(p, spec))

    def test_all_domain_groups_must_match(self):
        spec = self._spec([["shopify"], ["a11y", "accessibility"]], [])
        p_only_first = pkg("shopify-thing", keywords=["storefront"])
        self.assertFalse(ps.relevant(p_only_first, spec))
        p_both = pkg("shopify-a11y", keywords=[])
        self.assertTrue(ps.relevant(p_both, spec))

    def test_hyphenated_term_via_bigram(self):
        spec = self._spec([["prompt-injection"]], [])
        # matches when the keyword is 'prompt injection' or 'prompt-injection':
        self.assertTrue(ps.relevant(pkg("x", keywords=["prompt injection"]), spec))
        self.assertTrue(ps.relevant(pkg("x", keywords=["prompt-injection"]), spec))

    # --- the two documented false-positive regressions the caveat calls out ---

    def test_jest_does_not_count_as_agent_eval_harness(self):
        # 'jest' has no ai/llm/agent domain term; the older substring rule matched
        # via 'ai' inside 'domain' or similar. Under whole-token matching it must not.
        spec = ps.CANDIDATES["agent-permission-harness"][1]  # agent-eval-harness
        jest = pkg("jest", description="Delightful JavaScript Testing.",
                   keywords=["ava", "browser", "jasmine", "javascript", "test", "testing", "unit", "jest"])
        self.assertFalse(ps.relevant(jest, spec))

    def test_helmet_does_not_count_as_prompt_injection_test(self):
        spec = ps.CANDIDATES["agent-permission-harness"][0]  # prompt-injection-testing
        helmet = pkg("helmet", description="help secure Express apps with various HTTP headers",
                     keywords=["express", "security", "headers"])
        self.assertFalse(ps.relevant(helmet, spec))

    def test_axe_core_counts_as_wcag_audit(self):
        spec = ps.CANDIDATES["eaa-remediation-pipeline"][0]  # wcag-audit
        axe = pkg("axe-core", description="Accessibility engine for automated Web UI testing",
                  keywords=["Accessibility", "a11y", "testing", "audit", "wcag"])
        self.assertTrue(ps.relevant(axe, spec))

    def test_cyclonedx_counts_as_sbom_generation(self):
        spec = ps.CANDIDATES["cra-evidence-desk"][0]  # sbom-generation
        cyc = pkg("@cyclonedx/cyclonedx-npm",
                  description="Create CycloneDX Software Bill of Materials (SBOM) from NPM projects.",
                  keywords=["CycloneDX", "SBOM", "BOM", "bill-of-materials", "spdx"])
        self.assertTrue(ps.relevant(cyc, spec))

    def test_ios_app_attest_does_not_count_as_vex_attestation(self):
        # This is the second documented regression: device/crypto attestation is a
        # different domain from supply-chain attestation.
        spec = ps.CANDIDATES["cra-evidence-desk"][2]  # vex-attestation
        ios = pkg("node-app-attest",
                  description="A JavaScript implementation of the App Attest protocol",
                  keywords=["ios", "app-attest", "attestation"])
        self.assertFalse(ps.relevant(ios, spec))

    def test_device_detection_does_not_count_as_register_monitor(self):
        # And the third: 'crawler' as a keyword of a device-detection library
        # is not evidence of a change-monitor.
        spec = ps.CANDIDATES["public-record-watch"][0]  # register-change-monitor
        dd = pkg("fiftyone.devicedetection",
                 description="Parse HTTP headers to detect the device type",
                 keywords=["device detection", "user-agent", "browser", "crawler", "detect"])
        self.assertFalse(ps.relevant(dd, spec))


class VerdictTests(unittest.TestCase):
    def _record(self, fit, count_10k, error=None):
        return {
            "ecosystem_fit": fit,
            "error": error,
            "substitutes_at_threshold": {"1000": 0, "10000": count_10k, "100000": 0},
        }

    def test_three_or_more_is_commoditised(self):
        self.assertEqual(ps.verdict(self._record(ps.FIT_NATIVE, 3)), "commoditised")

    def test_one_or_two_is_contested(self):
        self.assertEqual(ps.verdict(self._record(ps.FIT_NATIVE, 1)), "contested")
        self.assertEqual(ps.verdict(self._record(ps.FIT_NATIVE, 2)), "contested")

    def test_zero_on_native_is_no_substitute_found(self):
        self.assertEqual(ps.verdict(self._record(ps.FIT_NATIVE, 0)), "no-substitute-found")

    def test_zero_on_foreign_or_partial_is_not_measurable_here(self):
        self.assertEqual(ps.verdict(self._record(ps.FIT_FOREIGN, 0)), "not-measurable-here")
        self.assertEqual(ps.verdict(self._record(ps.FIT_PARTIAL, 0)), "not-measurable-here")

    def test_error_is_not_measurable_here(self):
        self.assertEqual(ps.verdict(self._record(ps.FIT_NATIVE, 0, error="proxy 403")),
                         "not-measurable-here")


class SavedResultsShapeTests(unittest.TestCase):
    """Structural checks against the committed results, so a rerun that changes
    the schema fails a test rather than silently changing what the write-up cites."""

    @classmethod
    def setUpClass(cls):
        here = os.path.dirname(os.path.abspath(__file__))
        with open(os.path.join(here, "results-2026-08-20.json"), encoding="utf-8") as fh:
            cls.data = json.load(fh)

    def test_measured_at_parses(self):
        datetime.fromisoformat(self.data["measured_at"]).astimezone(timezone.utc)

    def test_every_candidate_and_function_from_the_spec_is_present(self):
        self.assertEqual(set(self.data["candidates"].keys()), set(ps.CANDIDATES.keys()))
        for candidate, specs in ps.CANDIDATES.items():
            got = [r["function"] for r in self.data["candidates"][candidate]]
            want = [s["function"] for s in specs]
            self.assertEqual(got, want, candidate)

    def test_every_record_carries_the_three_thresholds(self):
        for records in self.data["candidates"].values():
            for r in records:
                self.assertEqual(set(r["substitutes_at_threshold"].keys()),
                                 {str(t) for t in ps.THRESHOLDS})


if __name__ == "__main__":
    unittest.main()
