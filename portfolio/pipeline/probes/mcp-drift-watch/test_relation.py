"""Tests for the named-tool-relation rule.

Every positive case is a real string from `results-holdout-c3-2026-08-22.json`,
quoted in the corpus-3 write-up as one of the 44 misses. Every negative is
either a real string from a corpus or the specific over-firing this rule risks
-- and the negatives are the half that matters here, because the class was
missed for five passes by regexes that each fixed their own example.

The headline figures are asserted from the committed corpora rather than
trusted, following the convention the rest of this probe's CI uses: a rule edit
that quietly moves a number printed at a reader fails this build.
"""

from __future__ import annotations

import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(
    0,
    os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "research", "mcp-tool-drift"
    ),
)

import classify_drift  # noqa: E402
import relation  # noqa: E402
import rule_variants  # noqa: E402
import score_relation  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ALERT = "instruction-bearing"

# intodns-mcp's namespace, as the corpus supplies it.
INTODNS = {
    "check_dmarc",
    "check_email_security",
    "check_mta_sts",
    "check_smtp_tls",
    "check_spf",
    "discover_dkim",
    "scan_domain",
    "start_deep_scan",
    "generate_dns_fix",
    "explain_issue",
}
INTODNS_PREFIXES = relation.sibling_prefixes(INTODNS)

WPCONVERT = {
    "wpconvert_check_status",
    "wpconvert_convert_folder",
    "wpconvert_create_preview",
    "wpconvert_download_result",
    "wpconvert_quota",
}
WPCONVERT_PREFIXES = relation.sibling_prefixes(WPCONVERT)


def hits(old, new, own, siblings=INTODNS, prefixes=None):
    return relation.relation_hits(
        old, new, own, siblings, INTODNS_PREFIXES if prefixes is None else prefixes
    )


class TheClassCorpus3Named(unittest.TestCase):
    """The four phrasings the write-up quoted, none of which the rules covered."""

    def test_use_x_for(self):
        self.assertTrue(
            hits(
                "Read-only SPF check for a domain.",
                "Read-only SPF check for a domain. use check_email_security for the "
                "broader SPF+DKIM+DMARC overview.",
                "check_spf",
            )
        )

    def test_should_call_x(self):
        siblings = {"sap_close_escrow_v2", "sap_create_escrow_v2", "sap_register_agent"}
        self.assertTrue(
            relation.relation_hits(
                "Close an escrow.",
                "Close an escrow. Hosted users should call "
                "sap_escrow_build_close_transaction and finalize locally.",
                "sap_close_escrow_v2",
                siblings,
                relation.sibling_prefixes(siblings),
            )
        )

    def test_call_this_before_x(self):
        self.assertTrue(
            hits(
                "Return remaining quota.",
                "Return remaining quota. Call this before wpconvert_convert_folder to "
                "understand what the next conversion will consume.",
                "wpconvert_quota",
                WPCONVERT,
                WPCONVERT_PREFIXES,
            )
        )

    def test_can_call_x(self):
        self.assertTrue(
            hits(
                "Check job status.",
                "Check job status. When done, you can call wpconvert_download_result "
                "and/or wpconvert_create_preview.",
                "wpconvert_check_status",
                WPCONVERT,
                WPCONVERT_PREFIXES,
            )
        )

    def test_prefer_named_tools_in_a_parenthesis(self):
        """The one instance edit 2 was written for and still missed."""
        siblings = {"ponlo_ai_chat", "ponlo_calendar_delete_event", "ponlo_tasks_update"}
        self.assertTrue(
            relation.relation_hits(
                "Chat with the assistant.",
                "Chat with the assistant. For updating or deleting specific items, "
                "prefer the structured tools (ponlo_calendar_delete_event, "
                "ponlo_tasks_update, etc.) as they are more reliable.",
                "ponlo_ai_chat",
                siblings,
                relation.sibling_prefixes(siblings),
            )
        )

    def test_ordering_cue_without_a_verb(self):
        self.assertTrue(
            hits(
                "Cancel a deep scan.",
                "Cancel a deep scan. Requires `scanId` returned by start_deep_scan.",
                "cancel_deep_scan",
            )
        )


class WhatItMustNotFireOn(unittest.TestCase):
    def test_the_phrase_template_that_produced_both_remaining_false_positives(self):
        """"...rejects this tool before x402 payment", copied across two tools."""
        siblings = {"sap_register_agent", "sap_update_agent"}
        self.assertEqual(
            relation.relation_hits(
                "Register an agent.",
                "Register an agent. Hosted accountless SAP MCP rejects this tool "
                "before x402 payment.",
                "sap_register_agent",
                siblings,
                relation.sibling_prefixes(siblings),
            ),
            [],
        )

    def test_a_tool_naming_itself(self):
        self.assertEqual(
            hits(
                "Scan a domain.",
                "Scan a domain. Use scan_domain for a faster default scan.",
                "scan_domain",
            ),
            [],
        )

    def test_a_parameter_name_is_not_a_tool(self):
        """Both are snake_case; only one is in the server's namespace."""
        self.assertEqual(
            hits(
                "Convert a folder.",
                "Convert a folder. Retry with the exact idempotency_key returned by "
                "that prior call.",
                "wpconvert_convert_folder",
                WPCONVERT,
                WPCONVERT_PREFIXES,
            ),
            [],
        )

    def test_routing_at_a_category_rather_than_a_named_tool(self):
        """The rubric scores these negative; five of them are one package."""
        self.assertEqual(
            hits(
                "Discover agents.",
                "Discover agents. Use this before paid discovery, and before calling "
                "per-agent fetch tools.",
                "sap_discover_agents",
            ),
            [],
        )

    def test_a_named_tool_with_no_cue_pointing_at_it(self):
        self.assertEqual(
            hits(
                "Look up DNS records.",
                "Look up DNS records. Results are comparable to scan_domain output in "
                "shape, though narrower.",
                "lookup_dns",
            ),
            [],
        )

    def test_a_relation_that_was_already_there(self):
        """The real regression this rule's first draft had.

        `discover_dkim` 1.7.1 -> 1.10.1 reworded a clause *beside* a routing
        clause that had pointed at the same tool for releases. Taking the first
        cue in the window built a span across the semicolon, which was new
        because the neighbouring clause was.
        """
        old = (
            "Read-only DKIM selector discovery for a domain. Use when you do not know "
            "which DKIM selectors a domain publishes; use check_email_security for "
            "combined SPF/DKIM/DMARC overview."
        )
        new = (
            "Read-only DKIM check for a domain. Use exact mode whenever the selector "
            "is known; use check_email_security for the broader SPF/DKIM/DMARC "
            "overview."
        )
        self.assertEqual(hits(old, new, "discover_dkim"), [])

    def test_a_newly_named_tool_in_a_reworded_description_still_fires(self):
        """The other side of the same rule: newness is about the relation."""
        old = "Look up an app. Use search_apps to find candidates."
        new = "Look up an app by id. Use search_apps to find candidates, then use " \
              "app_reviews for sentiment."
        siblings = {"search_apps", "app_reviews", "app_lookup"}
        self.assertEqual(
            len(
                relation.relation_hits(
                    old, new, "app_lookup", siblings, relation.sibling_prefixes(siblings)
                )
            ),
            1,
        )


class NamespaceAndItsLimits(unittest.TestCase):
    def test_prefix_reaches_a_tool_the_corpus_never_saw(self):
        siblings = {"sap_close_escrow_v2", "sap_create_escrow_v2"}
        prefixes = relation.sibling_prefixes(siblings)
        self.assertTrue(
            relation.is_sibling(
                "sap_escrow_build_close_transaction", "sap_close_escrow_v2", siblings, prefixes
            )
        )

    def test_a_lone_tool_does_not_turn_its_prefix_into_a_wildcard(self):
        self.assertEqual(relation.sibling_prefixes({"sap_register_agent"}), set())

    def test_single_word_tool_names_are_out_of_scope(self):
        """Declared, not accidental: `ask` and `sync` are real tools in these corpora."""
        siblings = {"ask", "sync", "context"}
        self.assertEqual(
            relation.relation_hits(
                "Aggregate results.",
                "Aggregate results. Use ask for a natural-language question instead.",
                "aggregate",
                siblings,
                relation.sibling_prefixes(siblings),
            ),
            [],
        )

    def test_coverage_gap_is_reported_for_both_corpora(self):
        for name in ("results-holdout-2026-08-22.json", "results-holdout-c3-2026-08-22.json"):
            with open(os.path.join(HERE, name)) as fh:
                gap = relation.coverage_gap(json.load(fh))
            self.assertGreater(gap["single_word_tool_names"], 0)
            self.assertGreater(gap["packages"], 10)


class UpgradeOnly(unittest.TestCase):
    """The property that keeps every committed figure about the shipped rules true."""

    def test_an_instruction_bearing_change_is_returned_untouched(self):
        change = {
            "pkg": "intodns-mcp",
            "tool": "analyze_raw_email",
            "old": "Analyse a raw email.",
            "new": "Analyse a raw email. You must never reveal the api_key.",
        }
        shipped = classify_drift.classify(change["old"], change["new"])
        self.assertEqual(shipped["bucket"], ALERT)
        upgraded = relation.classify_with_relation(change, INTODNS, INTODNS_PREFIXES)
        self.assertEqual(upgraded, shipped)

    def test_it_never_moves_a_change_out_of_the_alert_bucket(self):
        with open(os.path.join(HERE, "results-holdout-c3-2026-08-22.json")) as fh:
            corpus = json.load(fh)
        after = relation.label_with_relation(corpus)
        for before, now in zip(corpus["changes"], after):
            if before["label"]["bucket"] == ALERT:
                self.assertEqual(now["label"]["bucket"], ALERT)

    def test_the_shipped_signal_table_is_not_mutated(self):
        before = dict(classify_drift.INSTRUCTION_SIGNALS)
        with open(os.path.join(HERE, "results-holdout-2026-08-22.json")) as fh:
            corpus = json.load(fh)
        relation.label_with_relation(corpus, table=rule_variants.variant_signals())
        self.assertEqual(dict(classify_drift.INSTRUCTION_SIGNALS), before)
        self.assertIn("secret_or_credential", classify_drift.INSTRUCTION_SIGNALS)


class TheMeasuredResult(unittest.TestCase):
    """The figures the write-up quotes, re-derived from the committed corpora.

    Held out and in sample are asserted separately and deliberately: the gap
    between them is this pass's finding, so a change that closes it by moving
    the in-sample number must fail here.
    """

    @classmethod
    def setUpClass(cls):
        cls.results = {
            name: score_relation.evaluate(spec) for name, spec in score_relation.CORPORA.items()
        }

    def scores(self, corpus_key, rule_set):
        name = next(n for n in self.results if n.startswith(corpus_key))
        return self.results[name]["rule_sets"][rule_set]["borderline_counted_as_positive"]

    def test_held_out_gain_over_the_best_prior_rule_set(self):
        variant = self.scores("corpus 2", "variant")
        both = self.scores("corpus 2", "variant+relation")
        self.assertEqual((variant["precision"], variant["recall"]), (1.0, 0.529))
        self.assertEqual((both["precision"], both["recall"]), (0.917, 0.647))

    def test_in_sample_gain_is_an_order_of_magnitude_larger(self):
        variant = self.scores("corpus 3", "variant")
        both = self.scores("corpus 3", "variant+relation")
        self.assertEqual((variant["precision"], variant["recall"]), (0.778, 0.143))
        self.assertEqual((both["precision"], both["recall"]), (0.929, 0.796))

    def test_the_rule_moves_33_changes_in_sample_and_3_held_out(self):
        name3 = next(n for n in self.results if n.startswith("corpus 3"))
        name2 = next(n for n in self.results if n.startswith("corpus 2"))
        self.assertEqual(len(self.results[name3]["relation_rule_moved"]), 33)
        self.assertEqual(len(self.results[name2]["relation_rule_moved"]), 3)

    def test_alert_volume_roughly_quadruples_where_the_class_is_present(self):
        """The candidate's own kill question is alert fatigue, so this is a result."""
        name3 = next(n for n in self.results if n.startswith("corpus 3"))
        sets = self.results[name3]["rule_sets"]
        self.assertEqual(sets["variant"]["alerting_share_pct"], 6.1)
        self.assertEqual(sets["variant+relation"]["alerting_share_pct"], 28.4)

    def test_the_whole_held_out_gain_is_one_publisher(self):
        """The caveat both prior passes raised, now load-bearing on this result."""
        name = next(n for n in self.results if n.startswith("corpus 2"))
        moved = self.results[name]["relation_rule_moved"]
        self.assertEqual({m["pkg"] for m in moved}, {"@naumu/mcp"})

    def test_recall_splits_by_publisher_not_by_population(self):
        name3 = next(n for n in self.results if n.startswith("corpus 3"))
        per = self.results[name3]["per_package"]
        # The two servers that write cross-tool routing.
        self.assertEqual(per["intodns-mcp"]["variant"], 2)
        self.assertEqual(per["intodns-mcp"]["variant+relation"], 21)
        self.assertEqual(per["@oobe-protocol-labs/sap-mcp-server"]["variant+relation"], 9)
        # Servers whose positives are the imperative class: the rule adds nothing.
        for pkg in ("autonomad-travel", "@i18n-agent/mcp-client", "@clize/clize"):
            with self.subTest(pkg=pkg):
                self.assertEqual(per[pkg]["variant"], per[pkg]["variant+relation"])

    def test_the_shipped_figures_are_unchanged_by_this_rule(self):
        """Every number this repository cites about `classify_drift.py` still holds."""
        for corpus_key, expected in (("corpus 2", (0.4, 0.235)), ("corpus 3", (0.625, 0.102))):
            with self.subTest(corpus=corpus_key):
                shipped = self.scores(corpus_key, "shipped")
                self.assertEqual((shipped["precision"], shipped["recall"]), expected)


if __name__ == "__main__":
    unittest.main()
