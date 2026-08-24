#!/usr/bin/env python3
"""Offline tests for the demand-signal probe's classifier and summariser.

No network. Every test runs against literal fixtures or the two committed result
files, so a reviewer can check the claims in README.md without re-probing.

The two behaviours worth pinning are the ones that would have made a *wrong*
finding look like a right one:

  * a count field that answers with a sentinel (-1) rather than a number, which
    reads as a successful measurement to any `is not None` test; and
  * a refusal the enforcement layer delivers in band as a real HTTP 403, which
    the original classifier would have coded as the host's own refusal.
"""
from __future__ import annotations

import json
import os
import unittest

import probe_demand_signals as P

HERE = os.path.dirname(os.path.abspath(__file__))


def row(channel, gate, verdict, **kw):
    r = {
        "channel": channel, "gate": gate, "url": kw.get("url"), "note": "",
        "http_status": kw.get("http_status"), "verdict": verdict,
        "count_field": None, "count_value": kw.get("count_value"),
        "count_is_sentinel": P.is_sentinel(kw.get("count_value")),
        "parse_error": None, "public_count": kw.get("public_count"),
        "bytes": 0, "snippet": "",
    }
    return r


class TestVerdict(unittest.TestCase):
    def test_tunnel_refusal_is_egress_denied(self):
        body = b"URLError: <urlopen error Tunnel connection failed: 403 Forbidden>"
        self.assertEqual(P.verdict(None, body), "EGRESS_DENIED")

    def test_in_band_allowlist_refusal_is_egress_denied(self):
        # upload.pypi.org's actual response, verbatim. Same policy and the same
        # one-setting remedy as the tunnel refusal above, delivered differently.
        body = (b"Host not in allowlist: upload.pypi.org. Add this host to your "
                b"network egress settings to allow access.")
        self.assertEqual(P.verdict(403, body), "EGRESS_DENIED")

    def test_an_ordinary_403_is_still_the_hosts_own_refusal(self):
        self.assertEqual(P.verdict(403, b"Forbidden: you do not own this package"),
                         "HTTP_403")

    def test_scope_refusal_outranks_status(self):
        body = b"This GitHub API path is not available: sessions are bound to their configured repositories."
        self.assertEqual(P.verdict(403, body), "SCOPE_DENIED")

    def test_401_means_the_host_answered(self):
        self.assertEqual(P.verdict(401, b'{"error":"unauthorized"}'), "REACHABLE")

    def test_unclassified_failure_is_not_called_egress(self):
        self.assertEqual(P.verdict(None, b"TimeoutError: timed out"), "UNREACHABLE")


class TestSentinel(unittest.TestCase):
    def test_negative_is_a_sentinel(self):
        self.assertTrue(P.is_sentinel(-1))

    def test_zero_downloads_is_a_real_measurement(self):
        self.assertFalse(P.is_sentinel(0))

    def test_bool_is_not_a_count(self):
        # bool is a subclass of int; False < 0 is False, but True would slip
        # through a naive numeric test as a count of 1.
        self.assertFalse(P.is_sentinel(True))
        self.assertFalse(P.is_sentinel(False))

    def test_absent_and_non_numeric(self):
        self.assertFalse(P.is_sentinel(None))
        self.assertFalse(P.is_sentinel("-1"))


class TestSummarize(unittest.TestCase):
    def test_sentinel_is_not_a_readable_count(self):
        s = P.summarize([
            row("pypi", P.GATE_STATS, "REACHABLE", count_value=-1, public_count=False),
        ])
        self.assertNotIn("pypi", s["count_readable_from_here"])
        self.assertTrue(s["by_channel"]["pypi"]["count_sentinel_seen"])
        self.assertIsNone(s["by_channel"]["pypi"]["count_read"])

    def test_a_real_count_still_counts(self):
        s = P.summarize([
            row("crates.io", P.GATE_STATS, "REACHABLE", count_value=1234, public_count=True),
        ])
        self.assertEqual(s["count_readable_from_here"], ["crates.io"])

    def test_reachable_but_credentialed_is_its_own_bucket(self):
        url = next(iter(P.COUNT_NEEDS_CREDENTIAL))
        s = P.summarize([
            row("pypi", P.GATE_STATS, "REACHABLE", url=url, public_count=True),
        ])
        self.assertEqual(s["count_reachable_only_behind_a_credential"], ["pypi"])
        self.assertNotIn("pypi", s["count_readable_from_here"])
        self.assertNotIn("pypi", s["count_exists_but_is_not_readable_from_here"])

    def test_a_credentialed_surface_that_did_not_answer_does_not_claim_the_bucket(self):
        url = next(iter(P.COUNT_NEEDS_CREDENTIAL))
        s = P.summarize([
            row("pypi", P.GATE_STATS, "EGRESS_DENIED", url=url, public_count=True),
        ])
        self.assertEqual(s["count_reachable_only_behind_a_credential"], [])

    def test_controls_are_excluded_from_channel_summary(self):
        s = P.summarize([row("control-reachable", "control", "REACHABLE")])
        self.assertEqual(s["by_channel"], {})


class TestCommittedResults(unittest.TestCase):
    """The saved runs must re-derive their own summaries, so the README's tables
    are checkable offline and a later edit to the summariser cannot quietly
    restate a past run's finding."""

    def load(self, name):
        with open(os.path.join(HERE, name)) as f:
            return json.load(f)

    def test_2026_08_24_recomputes_to_its_committed_summary(self):
        p = self.load("results-2026-08-24.json")
        self.assertEqual(P.summarize(p["results"]), p["summary"])

    def test_2026_08_19_still_recomputes_under_the_new_summariser(self):
        # Backward compatibility: the older rows predate `count_is_sentinel`
        # and `count_needs_credential`, and must still summarise without them.
        p = self.load("results-2026-08-19.json")
        s = P.summarize(p["results"])
        for k in ("count_readable_from_here", "channel_publishes_no_count_at_all",
                  "count_exists_but_is_not_readable_from_here"):
            self.assertEqual(s[k], p["summary"][k], k)
        self.assertEqual(s["count_reachable_only_behind_a_credential"], [])

    def test_the_five_countable_channels_did_not_change_in_five_days(self):
        a = self.load("results-2026-08-19.json")["summary"]
        b = self.load("results-2026-08-24.json")["summary"]
        self.assertEqual(a["count_readable_from_here"], b["count_readable_from_here"])
        self.assertEqual(a["channel_publishes_no_count_at_all"],
                         b["channel_publishes_no_count_at_all"])

    def test_pypi_publish_and_zero_credential_stats_are_both_denied(self):
        rows = [r for r in self.load("results-2026-08-24.json")["results"]
                if r["channel"] == "pypi"]
        publish = [r for r in rows if r["gate"] == P.GATE_PUBLISH]
        self.assertTrue(publish and all(r["verdict"] == "EGRESS_DENIED" for r in publish))
        # Every stats surface either was refused, is credentialed, or answered
        # without a count. None of them yields a number for free.
        for r in (r for r in rows if r["gate"] == P.GATE_STATS):
            self.assertFalse(
                r["verdict"] == "REACHABLE"
                and r.get("count_value") is not None
                and not r["count_is_sentinel"],
                f"{r['url']} returned a usable count; README must be updated",
            )


if __name__ == "__main__":
    unittest.main()
