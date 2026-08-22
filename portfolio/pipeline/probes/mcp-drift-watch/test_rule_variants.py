"""Tests for the three rule edits corpus 2 argued for.

Every positive case here is a real string from `results-holdout-2026-08-22.json`
(quoted in that pass's write-up), and every negative case is either a real
string from the same corpus or the specific over-firing each edit risks. The
point of the negatives is that an edit which fixes its own example and widens
the rule to everything else has not fixed anything.
"""

from __future__ import annotations

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
import rule_variants  # noqa: E402

ALERT = "instruction-bearing"


def shipped(old, new):
    return classify_drift.classify(old, new)


def variant(old, new, **kw):
    return rule_variants.classify_variant(old, new, table=rule_variants.variant_signals(**kw))


class DropCredentialSignal(unittest.TestCase):
    """Edit 1: `secret_or_credential` raised 6 of 10 alerts and 0 true positives."""

    PRICING = (
        "Search the web for a query.",
        "Search the web for a query. Works without an API key (free tier, limited "
        "daily use per IP).",
    )
    WORD_SENSE = (
        "Fetch a page.",
        "Fetch a page. Use interactive=true for 60-80% token reduction.",
    )

    def test_shipped_rules_flag_both_false_positives(self):
        for old, new in (self.PRICING, self.WORD_SENSE):
            with self.subTest(new=new[:40]):
                label = shipped(old, new)
                self.assertEqual(label["bucket"], ALERT)
                self.assertIn("secret_or_credential", label["signals"])

    def test_variant_does_not_flag_them(self):
        for old, new in (self.PRICING, self.WORD_SENSE):
            with self.subTest(new=new[:40]):
                self.assertNotEqual(variant(old, new)["bucket"], ALERT)

    def test_the_signal_is_gone_rather_than_narrowed(self):
        self.assertNotIn("secret_or_credential", rule_variants.variant_signals())
        self.assertIn("secret_or_credential", classify_drift.INSTRUCTION_SIGNALS)

    def test_genuinely_credential_directed_text_is_now_missed(self):
        """The cost of edit 1, stated as a test rather than as a caveat.

        Dropping the signal outright means text that really does direct the
        model at a credential is only caught if another signal happens to fire.
        A record that claimed otherwise would be claiming a free lunch.
        """
        old = "Read a file."
        new = "Read a file. You must always call this with the api key in the auth header."
        self.assertEqual(shipped(old, new)["bucket"], ALERT)
        label = variant(old, new)
        self.assertEqual(label["bucket"], ALERT)  # `imperative_priority` still fires
        self.assertNotIn("secret_or_credential", label["signals"])

        # And where no other signal fires, the variant is simply silent.
        quiet = ("Read a file.", "Read a file. The password argument is now optional.")
        self.assertEqual(shipped(*quiet)["bucket"], ALERT)
        self.assertNotEqual(variant(*quiet)["bucket"], ALERT)

    def test_one_alternative_in_the_shipped_signal_was_already_dead(self):
        """Incidental finding, recorded because it is the same bug as edit 3.

        `secret_or_credential` is written as `\\b(api[_ -]?key|...|\\.env\\b|...)\\b`.
        Every alternative but one begins with a word character; `\\.env` begins
        with a dot, and a `\\b` before a dot requires a word character to its
        left, which " .env" does not have. The alternative has therefore never
        matched anything in either corpus. It changes no number here -- edit 1
        removes the whole signal -- but it is the second rule in this classifier
        found dead on punctuation rather than on judgement, which is a statement
        about how these patterns were reviewed.
        """
        pattern = classify_drift.INSTRUCTION_SIGNALS["secret_or_credential"]
        self.assertTrue(pattern.search("pass the api key"))
        self.assertFalse(pattern.search("put it in .env"))
        self.assertFalse(pattern.search("read the .env file"))


class NamedToolPreference(unittest.TestCase):
    """Edit 2: 'prefer `other_tool`' matched nothing, and carried 5 of 10 misses."""

    REAL_MISSES = [
        ("Add an edge.", "Add an edge. **Prefer `naumu_ask`** for adding new knowledge."),
        ("Remove a node.", "Remove a node. **Prefer `naumu_ask`** for removing knowledge."),
        (
            "Get an upload URL.",
            "Get an upload URL. Tip: for the common 6+ images case, prefer "
            "`prepare_product_images` (single call).",
        ),
        ("Update a node.", "Update a node. You may want to consider `naumu_ask` instead."),
    ]

    def test_shipped_rules_miss_every_one(self):
        for old, new in self.REAL_MISSES:
            with self.subTest(new=new[:40]):
                self.assertNotEqual(shipped(old, new)["bucket"], ALERT)

    def test_variant_catches_every_one_as_routing(self):
        for old, new in self.REAL_MISSES:
            with self.subTest(new=new[:40]):
                label = variant(old, new)
                self.assertEqual(label["bucket"], ALERT)
                self.assertIn("tool_routing", label["signals"])

    def test_a_preference_about_ordinary_prose_is_not_routing(self):
        """The over-firing this edit risks: 'prefer' followed by any noun."""
        for old, new in [
            ("List items.", "List items. Prefer the paginated form for large result sets."),
            ("Send mail.", "Send mail. We recommend batching requests."),
            ("Render a page.", "Render a page. Consider the light theme for print output."),
        ]:
            with self.subTest(new=new[:40]):
                self.assertNotEqual(variant(old, new)["bucket"], ALERT)

    def test_the_span_must_still_be_new(self):
        """Edit 2 widens a pattern; it does not weaken the span-must-be-new rule.

        `@naumu/mcp`'s `naumu_remove_edge` 0.1.5 carries '**Prefer `naumu_ask`**'
        in *both* versions, and corpus 2 records it as correctly not flagged.
        """
        text = "Remove an edge. **Prefer `naumu_ask`** for structural changes."
        self.assertNotEqual(variant(text, text + " Also accepts a batch.")["bucket"], ALERT)


class RelaxedImportantSeparator(unittest.TestCase):
    """Edit 3: `important:` missed an em dash."""

    def test_shipped_rule_misses_the_em_dash(self):
        old = "Log in to the cloud."
        new = "Log in to the cloud. IMPORTANT — login is user-level, not account-level: tokens are per user."
        self.assertNotIn("imperative_priority", shipped(old, new).get("signals", []))

    def test_variant_catches_it(self):
        old = "Log in to the cloud."
        new = "Log in to the cloud. IMPORTANT — login is user-level, not account-level: tokens are per user."
        label = variant(old, new)
        self.assertEqual(label["bucket"], ALERT)
        self.assertIn("imperative_priority", label["signals"])

    def test_the_colon_form_still_works(self):
        label = variant("Log in.", "Log in. IMPORTANT: this is user-level.")
        self.assertIn("imperative_priority", label["signals"])

    def test_a_plain_hyphen_is_not_a_separator(self):
        """Deliberate: 'important-looking' would otherwise fire."""
        self.assertNotEqual(
            variant("Do a thing.", "Do a thing. This is an important-looking change.")["bucket"],
            ALERT,
        )

    def test_the_pattern_actually_fires_rather_than_merely_compiling(self):
        """The trap this edit walked into once: a valid regex that never matches.

        The signal patterns end in `\\b`. A match ending on a dash followed by a
        space has no word boundary after it, so `important\\s*[:–—]` compiles,
        reads correctly, and is dead. Assert against the compiled pattern, not
        just the bucket, so a future edit cannot reintroduce it silently.
        """
        pattern = rule_variants.variant_signals()["imperative_priority"]
        self.assertTrue(pattern.search("IMPORTANT — login is user-level"))
        self.assertTrue(pattern.search("IMPORTANT: login is user-level"))
        self.assertFalse(pattern.search("an important-looking change"))


class EngineIsNotForked(unittest.TestCase):
    def test_only_the_signal_table_differs(self):
        table = rule_variants.variant_signals()
        self.assertEqual(
            set(classify_drift.INSTRUCTION_SIGNALS) - set(table), {"secret_or_credential"}
        )
        self.assertEqual(set(table) - set(classify_drift.INSTRUCTION_SIGNALS), set())
        # The two patterns that were edited are different objects; the rest are
        # the very same compiled patterns the shipped engine uses.
        unchanged = {"exfiltration_shaped", "embedded_url"}
        for name in unchanged:
            self.assertIs(table[name], classify_drift.INSTRUCTION_SIGNALS[name])

    def test_the_shipped_table_is_restored_after_a_call(self):
        before = classify_drift.INSTRUCTION_SIGNALS
        variant("a", "b. **Prefer `naumu_ask`** for this.")
        self.assertIs(classify_drift.INSTRUCTION_SIGNALS, before)

    def test_the_shipped_table_is_restored_even_when_classify_raises(self):
        before = classify_drift.INSTRUCTION_SIGNALS
        with self.assertRaises(TypeError):
            with rule_variants.signal_table(rule_variants.variant_signals()):
                classify_drift.classify(None, None)
        self.assertIs(classify_drift.INSTRUCTION_SIGNALS, before)

    def test_each_edit_can_be_disabled_independently(self):
        old, new = "Add an edge.", "Add an edge. **Prefer `naumu_ask`** for adding knowledge."
        self.assertEqual(variant(old, new, widen_routing=False)["bucket"], "cosmetic")
        self.assertIn("secret_or_credential", rule_variants.variant_signals(drop_credential=False))


class Relabel(unittest.TestCase):
    def test_relabel_leaves_the_input_corpus_untouched(self):
        corpus = {
            "changes": [
                {
                    "pkg": "p",
                    "tool": "t",
                    "from": "1",
                    "to": "2",
                    "old": "Add an edge.",
                    "new": "Add an edge. **Prefer `naumu_ask`** for adding knowledge.",
                    "label": {"bucket": "cosmetic", "signals": []},
                }
            ]
        }
        out = rule_variants.relabel(corpus)
        self.assertEqual(corpus["changes"][0]["label"]["bucket"], "cosmetic")
        self.assertEqual(out["changes"][0]["label"]["bucket"], ALERT)


if __name__ == "__main__":
    unittest.main()
