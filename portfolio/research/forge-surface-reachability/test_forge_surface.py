#!/usr/bin/env python3
"""Offline tests for the derivations in this directory.

No network. Every test either feeds a synthetic record through the same
functions the probes use, or re-derives the committed results file. The point is
that a reviewer can check the README's claims without re-running the probes --
which is the house rule in `portfolio/research/README.md`.

    python3 -m unittest discover -s portfolio/research/forge-surface-reachability
"""

import json
import unittest
from pathlib import Path

import probe_forges as pf
import search_registers as sr

HERE = Path(__file__).resolve().parent
RESULTS = HERE / "results-2026-08-21.json"
SEARCH_RESULTS = HERE / "register-search-2026-08-21.json"


class TestClassify(unittest.TestCase):
    """The classifier is the whole measurement. If it is wrong, so is the table."""

    def test_out_of_band_tunnel_denial(self):
        self.assertEqual(
            pf.classify("fatal: unable to access 'https://x/': CONNECT tunnel failed, response 403"),
            pf.EGRESS_DENIED,
        )

    def test_in_band_denial_is_not_an_origin_403(self):
        # This is the mistake `egress-reachability/` found in three prior
        # passes: the filter answers with a real HTTP 403, so the status code
        # alone reads as an origin answer. Only the body separates them.
        self.assertEqual(
            pf.classify("Host not in allowlist: foo.example. Add this host to your network egress settings", 403),
            pf.EGRESS_DENIED,
        )
        self.assertEqual(
            pf.classify('request blocked: no rule allows host "foo.example"', 403),
            pf.EGRESS_DENIED,
        )

    def test_signature_beats_status_code(self):
        """A denial carrying a 200 is still a denial."""
        self.assertEqual(pf.classify("Tunnel connection failed: 403 Forbidden", 200), pf.EGRESS_DENIED)

    def test_scope_denial_is_distinct_from_egress_denial(self):
        self.assertEqual(
            pf.classify("This tool is not enabled for this session", 403), pf.SCOPE_DENIED
        )

    def test_git_auth_prompt_means_the_origin_answered(self):
        # No credential is sent, so an auth demand proves the origin was
        # reached -- the same way the HTTP table treats a 401 as reachable.
        for msg in (
            "fatal: could not read Username for 'https://bitbucket.org': terminal prompts disabled",
            "remote: You may not have access to this repository or it no longer exists",
        ):
            self.assertEqual(pf.classify(msg), pf.REACHABLE, msg)

    def test_origin_status_is_reachable(self):
        self.assertEqual(pf.classify("Not Found", 404), pf.REACHABLE)
        self.assertEqual(pf.classify("Gone", 410), pf.REACHABLE)

    def test_unclassifiable_is_error_not_reachable(self):
        """A probe that cannot tell must not default to the optimistic answer."""
        self.assertEqual(pf.classify("", None), pf.ERROR)


class TestDeriveSurfaces(unittest.TestCase):
    def _payload(self, targets):
        return {"measured_at": "2026-01-01", "targets": targets}

    def test_split_host_is_detected(self):
        d = pf.derive(self._payload([{
            "host": "h", "forge": "F",
            "surfaces": {"git": {"verdict": pf.REACHABLE}, "api": {"verdict": pf.SCOPE_DENIED}},
        }]))
        self.assertEqual(len(d["splits"]), 1)

    def test_uniform_host_is_not_a_split(self):
        for verdict in (pf.REACHABLE, pf.EGRESS_DENIED):
            d = pf.derive(self._payload([{
                "host": "h", "forge": "F",
                "surfaces": {"git": {"verdict": verdict}, "api": {"verdict": verdict}},
            }]))
            self.assertEqual(d["splits"], [], verdict)

    def test_control_must_be_denied_on_every_surface(self):
        ok = pf.derive(self._payload([{
            "host": "example.com", "forge": "CONTROL",
            "surfaces": {"git": {"verdict": pf.EGRESS_DENIED}, "api": {"verdict": pf.EGRESS_DENIED}},
        }]))
        self.assertTrue(ok["control_ok"])

        leaky = pf.derive(self._payload([{
            "host": "example.com", "forge": "CONTROL",
            "surfaces": {"git": {"verdict": pf.EGRESS_DENIED}, "api": {"verdict": pf.REACHABLE}},
        }]))
        self.assertFalse(leaky["control_ok"])

    def test_control_is_excluded_from_the_forge_counts(self):
        d = pf.derive(self._payload([
            {"host": "a", "forge": "F", "surfaces": {"git": {"verdict": pf.REACHABLE}}},
            {"host": "example.com", "forge": "CONTROL", "surfaces": {"git": {"verdict": pf.EGRESS_DENIED}}},
        ]))
        self.assertEqual(d["n_forges"], 1)
        self.assertEqual(len(d["git_denied"]), 0)


class TestCommittedSurfaceResults(unittest.TestCase):
    """Re-derive the README's headline numbers from the committed JSON."""

    @classmethod
    def setUpClass(cls):
        cls.d = pf.derive(json.loads(RESULTS.read_text()))

    def test_control_held(self):
        """Without this, no denial in the table is evidence about its host."""
        self.assertTrue(self.d["control_ok"])

    def test_four_forges_reachable_on_git(self):
        hosts = sorted(r["host"] for r in self.d["git_reachable"])
        self.assertEqual(hosts, ["bitbucket.org", "codeload.github.com", "github.com", "gitlab.com"])

    def test_git_is_not_a_blanket_allowance(self):
        """The claim the README exists to correct."""
        self.assertGreater(len(self.d["git_denied"]), len(self.d["git_reachable"]))

    def test_github_is_the_only_host_whose_surfaces_disagree(self):
        self.assertEqual([r["host"] for r in self.d["splits"]], ["github.com"])

    def test_gitlab_reachable_on_every_probed_surface(self):
        row = next(r for r in self.d["rows"] if r["host"] == "gitlab.com")
        self.assertEqual(set(row["verdicts"]), {"git", "api", "raw"})
        self.assertTrue(all(v == pf.REACHABLE for v in row["verdicts"].values()))


class TestRegisterSearch(unittest.TestCase):
    def test_data_marker_matches_on_any_field(self):
        self.assertTrue(sr.looks_like_data({"path": "org/kev-data", "name": "", "description": ""}))
        self.assertTrue(sr.looks_like_data({"path": "", "name": "", "description": "A mirror of the register"}))
        self.assertFalse(sr.looks_like_data({"path": "org/webapp", "name": "webapp", "description": "a website"}))

    def test_control_failure_invalidates_the_negative_result(self):
        payload = {"measured_at": "x", "searches": [
            {"vertical": "control", "term": "t", "projects": [{"path": "a/b", "name": "", "description": ""}]},
            {"vertical": "sanctions", "term": "t", "projects": []},
        ]}
        self.assertFalse(sr.derive(payload)["control_found_something"])

    def test_errors_are_counted_not_silently_dropped(self):
        payload = {"measured_at": "x", "searches": [
            {"vertical": "sanctions", "term": "t", "error": "boom", "projects": []},
        ]}
        d = sr.derive(payload)
        self.assertEqual(d["total_errors"], 1)
        self.assertEqual(d["candidate_data_like"], 0)


class TestCommittedSearchResults(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.d = sr.derive(json.loads(SEARCH_RESULTS.read_text()))

    def test_no_term_errored(self):
        self.assertEqual(self.d["total_errors"], 0)

    def test_control_found_register_data(self):
        """A null result in the candidate verticals only means something if this passes."""
        self.assertTrue(self.d["control_found_something"])

    def test_device_safety_found_nothing(self):
        row = next(v for v in self.d["verticals"] if v["vertical"] == "device-safety")
        self.assertEqual(row["data_like"], 0)


if __name__ == "__main__":
    unittest.main()
