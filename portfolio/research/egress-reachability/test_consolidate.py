#!/usr/bin/env python3
"""Tests for the consolidation rules that a re-ingest can silently change.

Two defects on 2026-08-24 motivated these, and both were invisible in the
committed output: a tie in the verdict count was broken by dict insertion
order, and the table lagged a fresh ingest by six hosts with nothing checking
it. Both are properties of `--ingest`, which is why they are pinned here.
"""

from __future__ import annotations

import json
import os
import unittest
from collections import Counter

import check_ask_hosts
import consolidate

HERE = os.path.dirname(os.path.abspath(__file__))


class ConsensusTieBreak(unittest.TestCase):
    """A tie resolves to the denial, never to insertion order."""

    def test_tie_prefers_denial_over_reachable(self):
        self.assertEqual(
            consolidate._consensus(
                Counter({consolidate.REACHABLE: 6, consolidate.SCOPE_DENIED: 6})
            ),
            consolidate.SCOPE_DENIED,
        )

    def test_tie_prefers_denial_regardless_of_insertion_order(self):
        a = Counter()
        a[consolidate.REACHABLE] = 1
        a[consolidate.SCOPE_DENIED] = 1
        b = Counter()
        b[consolidate.SCOPE_DENIED] = 1
        b[consolidate.REACHABLE] = 1
        self.assertEqual(consolidate._consensus(a), consolidate._consensus(b))
        self.assertEqual(consolidate._consensus(a), consolidate.SCOPE_DENIED)

    def test_egress_denial_outranks_scope_denial_on_a_tie(self):
        self.assertEqual(
            consolidate._consensus(
                Counter({consolidate.SCOPE_DENIED: 2, consolidate.EGRESS_DENIED: 2})
            ),
            consolidate.EGRESS_DENIED,
        )

    def test_a_clear_majority_still_wins(self):
        self.assertEqual(
            consolidate._consensus(
                Counter({consolidate.REACHABLE: 5, consolidate.EGRESS_DENIED: 1})
            ),
            consolidate.REACHABLE,
        )

    def test_tie_is_reported(self):
        self.assertTrue(_tied({consolidate.REACHABLE: 2, consolidate.EGRESS_DENIED: 2}))
        self.assertFalse(_tied({consolidate.REACHABLE: 3, consolidate.EGRESS_DENIED: 2}))
        self.assertFalse(_tied({consolidate.REACHABLE: 1}))


def _tied(d):
    return consolidate._is_tied(Counter(d))


class CuratedVerdicts(unittest.TestCase):
    """Pinned verdicts survive a re-ingest, and stay visible as pinned."""

    @classmethod
    def setUpClass(cls):
        cls.table = json.load(open(os.path.join(HERE, "prior-verdicts.json")))

    def test_every_curated_host_is_in_the_table(self):
        for host in consolidate.CURATED:
            self.assertIn(host, self.table["hosts"], host)

    def test_curated_hosts_carry_the_pinned_verdict_and_say_so(self):
        for host, (verdict, reason) in consolidate.CURATED.items():
            entry = self.table["hosts"][host]
            self.assertEqual(entry["prior_consensus"], verdict, host)
            self.assertTrue(entry.get("curated"), host)
            self.assertEqual(entry.get("curated_reason"), reason, host)

    def test_the_raw_vote_stays_visible(self):
        """Pinning must not hide the disagreement it is overriding."""
        for host in consolidate.CURATED:
            entry = self.table["hosts"][host]
            self.assertIn("vote_consensus", entry, host)
            self.assertIn("prior_verdicts", entry, host)

    def test_github_hosts_are_all_scope_denied(self):
        """The README says all three; the table used to say two."""
        for host in ("github.com", "api.github.com", "codeload.github.com"):
            self.assertEqual(
                self.table["hosts"][host]["prior_consensus"],
                consolidate.SCOPE_DENIED,
                host,
            )


class UnindexedHosts(unittest.TestCase):
    """Hosts measured outside the walk's reach reach the table anyway."""

    @classmethod
    def setUpClass(cls):
        cls.blob = json.load(open(consolidate.UNINDEXED_PATH))
        cls.table = json.load(open(os.path.join(HERE, "prior-verdicts.json")))

    def test_each_record_names_the_document_that_measured_it(self):
        for rec in self.blob["results"]:
            self.assertTrue(rec.get("source"), rec["host"])

    def test_each_record_was_probed_twice_and_agreed(self):
        for rec in self.blob["results"] + self.blob["controls"]:
            self.assertTrue(rec.get("stable"), rec["host"])

    def test_a_reachable_control_separates_denial_from_a_broken_probe(self):
        verdicts = {r["host"]: r["verdict"] for r in self.blob["controls"]}
        self.assertIn(consolidate.REACHABLE, verdicts.values())
        self.assertIn(consolidate.EGRESS_DENIED, verdicts.values())

    def test_the_records_land_in_the_table(self):
        for rec in self.blob["results"]:
            self.assertIn(rec["host"], self.table["hosts"], rec["host"])

    def test_controls_are_not_folded_in_as_unindexed_hosts(self):
        """Controls are already in the table; re-adding them would double-count."""
        sources = {
            s
            for host in ("example.com", "pypi.org")
            for s in self.table["hosts"][host]["sources"]
        }
        self.assertNotIn("egress-reachability/unindexed-hosts.json", sources)


class TableIsCurrent(unittest.TestCase):
    def test_check_passes(self):
        """The committed table equals a fresh ingest. Offline."""
        self.assertEqual(
            consolidate.check(os.path.join(HERE, "prior-verdicts.json")), 0
        )


class AskHostExtraction(unittest.TestCase):
    """The extractor that decides which backticked tokens are hosts."""

    FILES = {"readme.md", "asks.yaml", "break_even.py", "channel-inventory.md"}

    def extract(self, text):
        return check_ask_hosts.hostnames_in(text, self.FILES)

    def test_plain_hosts(self):
        self.assertEqual(
            self.extract("covering `api.wordpress.org` and `zed.dev`."),
            {"api.wordpress.org", "zed.dev"},
        )

    def test_repo_files_are_not_hosts(self):
        self.assertEqual(self.extract("see `asks.yaml` and `break_even.py`"), set())

    def test_hosts_whose_tld_looks_like_a_file_extension(self):
        """The bug this checker had on its first draft."""
        self.assertEqual(
            self.extract("storefronts `obsidian.md`, `formulae.brew.sh`"),
            {"obsidian.md", "formulae.brew.sh"},
        )

    def test_a_repo_file_ending_in_md_is_still_a_file(self):
        self.assertEqual(self.extract("per `channel-inventory.md`"), set())

    def test_a_file_outside_this_repo_is_not_a_host(self):
        """The regression that put `Portfolio validate` red on `main`.

        `auth.json` lives on the owner's laptop, so `_tracked_basenames()`
        cannot recognise it and every other rule accepts it as a host.
        """
        self.assertEqual(
            self.extract("worker.sh learned to seed `auth.json` from a Secret"),
            set(),
        )

    def test_non_tld_suffixes_cover_the_shapes_this_repo_writes(self):
        for token in ("policy.json", "group_vars.yml", "build.mjs",
                      "config.toml", "robots.txt"):
            with self.subTest(token=token):
                self.assertEqual(self.extract(f"see `{token}` for it"), set())

    def test_the_non_tld_set_never_swallows_a_real_cctld(self):
        """The trap the extension blocklist fell into the first time.

        `.md` and `.sh` are Moldova and St Helena, so an entry for either
        would silently drop `obsidian.md` and `formulae.brew.sh` — the
        failure this checker exists to catch.
        """
        delegated = {"md", "sh", "py", "io", "ai", "co", "so", "is", "it",
                     "me", "tv", "cc", "ws", "to", "gg", "dev", "app", "org"}
        self.assertEqual(check_ask_hosts._NOT_TLDS & delegated, set())

    def test_sdk_method_paths_are_not_hosts(self):
        """The third source of host-shaped tokens, after files and versions.

        `print-atelier-stripe-checkout` quotes the calls a session found in
        the venture. They are method paths on a library object -- lowercase,
        dotted, alphabetic-final -- so every structural rule accepted them
        and `Portfolio validate` went red on `main` asking for a verdict on a
        host that cannot exist.
        """
        self.assertEqual(
            self.extract(
                "real `stripe.checkout.sessions.create` and `stripe.accounts` calls"
            ),
            set(),
        )

    def test_versions_and_criteria_are_not_hosts(self):
        self.assertEqual(self.extract("`next@16.3.1` fixes `1.4.3`"), set())

    def test_unbackticked_prose_is_ignored(self):
        self.assertEqual(self.extract("we probed www.ftc.gov last week"), set())


class AsksAreBackedByMeasurements(unittest.TestCase):
    def test_check_passes(self):
        self.assertEqual(check_ask_hosts.main(), 0)

    def test_the_euvd_api_host_is_measured(self):
        """The wedge needs the API host, not the website host. The ask that
        named it was granted on 2026-10-31; what must stay true is that the
        API host carries a measured verdict, not just the website."""
        results = os.path.join(HERE, "results-2026-10-31.json")
        hosts = {r["host"]: r["verdict"] for r in json.load(open(results))["results"]}
        self.assertEqual(hosts.get("euvdservices.enisa.europa.eu"), "reachable")

class PublicationHostsAreNotEgress(unittest.TestCase):
    """A host the portfolio serves on is the other direction from egress.

    The deployment asks added on 2026-08-29 name `tools.marisstella.dev`,
    which nothing fetches and nothing can measure. Left unexempted it failed
    this check, and `main` carried that failure unnoticed because no Actions
    runner ran a job here between 2026-08-26 and the 2026-09-01 recovery.
    """

    def extract(self, text):
        return check_ask_hosts.hostnames_in(text, filenames=set())

    def test_the_site_host_is_not_demanded_of_the_egress_table(self):
        self.assertEqual(self.extract("point `marisstella.dev` at the site"), set())

    def test_the_pages_origin_is_not_demanded_either(self):
        self.assertEqual(self.extract("`duncan-haywood.github.io` is the base"), set())

    def test_the_bare_pages_suffix_is_not_demanded_either(self):
        """`github-pages-origin` quotes the denial that makes it an owner ask.

        The row explains why no session can load the page itself: the proxy
        answers `403 to CONNECT` for `github.io`. Quoting that measurement in
        backticks is what made the checker demand a verdict for it -- so the
        report of a denial read as an unmeasured host, and `main` went red on
        the one row about the origin that is actually serving.
        """
        self.assertEqual(
            self.extract("the proxy answers `403 to CONNECT` for `github.io`"),
            set(),
        )

    def test_the_exemption_is_not_a_blanket(self):
        """A third-party host in the very same sentence is still checked."""
        found = self.extract(
            "publish to `duncan-haywood.github.io` after fetching `api.wordpress.org`"
        )
        self.assertEqual(found, {"api.wordpress.org"})

    def test_every_exempt_host_is_one_this_repository_publishes_on(self):
        """Guards against the list growing into an escape hatch: each entry
        must be justified by something committed, not by prose in an ask."""
        # The haystack is every committed place a publication host can be
        # declared: the site build's origin, and the hosting record that names
        # the owner's domain. (The `gitops/prod` manifests and `infra/README.md`
        # were here until those trees were deleted on 2026-10-30.)
        names = [
            ("platform", "pages", "build.mjs"),
            ("portfolio", "hosting", "README.md"),
        ]
        haystack = ""
        for parts in names:
            with open(os.path.join(check_ask_hosts.REPO, *parts)) as fh:
                haystack += fh.read()
        for host in check_ask_hosts.PUBLICATION_HOSTS:
            self.assertIn(host, haystack, f"{host} is exempt but unpublished")

    def test_the_retired_cluster_hosts_are_no_longer_exempt(self):
        """The k3s origin and its manifests are gone, so the hostnames only
        they served must not stay exempt from the egress check."""
        self.assertNotIn("tools.marisstella.dev", check_ask_hosts.PUBLICATION_HOSTS)
        self.assertNotIn("www.marisstella.dev", check_ask_hosts.PUBLICATION_HOSTS)

if __name__ == "__main__":
    unittest.main()
