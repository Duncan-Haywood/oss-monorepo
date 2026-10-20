"""Guards for `usage_state.py`.

The tool exists to keep one distinction alive: `live_url_visitors: null` means
the visitor signal was **never taken**, and every sentence that renders it as
"zero observed users" converts an absence into evidence. The two license
opposite decisions -- measured-zero is grounds to retire a product or call an
archetype saturated, never-measured is grounds for nothing at all -- so the
expensive way for this tool to be wrong is to blur them in either direction.

Every case below pins one of those confusions, plus the two ways the claim
scanner can quietly stop working: missing a claim that wraps across a line
(which is how the original line-based scan reported CLAUDE.md clean), and
firing on the correction that quotes the claim in order to fix it (which is how
a guard gets deleted for crying wolf at its own documentation).
"""

from __future__ import annotations

import tempfile
import textwrap
import unittest
from pathlib import Path

import usage_state as state


def _usage(products):
    return {"period": "2026-09", "products": products}


def _product(slug, signals_per_reading, surface="static-page-in-repo"):
    return {
        "slug": slug,
        "surface": surface,
        "readings": [
            {"as_of": "2026-09-01", "signals": signals}
            for signals in signals_per_reading
        ],
    }


class VisitorReadings(unittest.TestCase):
    def test_all_null_is_never_measured(self):
        products = [_product("a", [{"live_url_visitors": None}])]
        total, real = state.visitor_readings(products)
        self.assertEqual(total, 1)
        self.assertEqual(real, [])

    def test_a_real_zero_is_a_measurement(self):
        """The whole point: 0 is data, null is not."""
        products = [_product("a", [{"live_url_visitors": 0}])]
        _total, real = state.visitor_readings(products)
        self.assertEqual(real, [0])

    def test_absent_key_is_not_counted_as_a_reading(self):
        products = [_product("a", [{"something_else": 3}])]
        total, real = state.visitor_readings(products)
        self.assertEqual((total, real), (0, []))

    def test_booleans_are_not_measurements(self):
        products = [_product("a", [{"live_url_visitors": True}])]
        _total, real = state.visitor_readings(products)
        self.assertEqual(real, [])


class PositiveSignals(unittest.TestCase):
    def test_build_statistics_are_not_external_users(self):
        products = [
            _product("portfolio-pages", [{"tools_published": 40}], "github-pages-artifact")
        ]
        not_external, possibly = state.classify_positives(
            state.positive_signals(products)
        )
        self.assertEqual(len(not_external), 1)
        self.assertEqual(possibly, [])

    def test_a_lone_one_is_a_self_test(self):
        products = [_product("einvoice-preflight", [{"local_preflights": 1}])]
        not_external, possibly = state.classify_positives(
            state.positive_signals(products)
        )
        self.assertEqual(len(not_external), 1)
        self.assertEqual(possibly, [])

    def test_a_real_count_on_an_ordinary_product_is_possibly_external(self):
        products = [_product("ebay-fee-calculator", [{"local_calculations": 37}])]
        _not_external, possibly = state.classify_positives(
            state.positive_signals(products)
        )
        self.assertEqual(len(possibly), 1)
        self.assertEqual(possibly[0][1], "local_calculations")

    def test_zero_is_not_a_positive_signal(self):
        products = [_product("a", [{"local_calculations": 0}])]
        self.assertEqual(state.positive_signals(products), [])


class ClaimScanning(unittest.TestCase):
    """The scanner reads whole files, because the claim that started this wrapped."""

    def _scan(self, body, name="CLAUDE.md"):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / name).parent.mkdir(parents=True, exist_ok=True)
            (root / name).write_text(body)
            return state.find_claims(root)

    def test_finds_a_claim_on_one_line(self):
        hits = self._scan("usage.yaml records zero observed users across 184 products.\n")
        self.assertEqual(len(hits), 1)

    def test_finds_a_claim_that_wraps_across_a_line(self):
        """CLAUDE.md:1110 split exactly here, and a line scanner called it clean."""
        body = "while `portfolio/usage/usage.yaml` still recorded\nzero observed users across all 184 products.\n"
        self.assertEqual(len(self._scan(body)), 1)

    def test_ignores_a_correction_that_quotes_the_claim(self):
        body = 'That sentence used to end "still recorded zero observed users", and it was wrong.\n'
        self.assertEqual(self._scan(body), [])

    def test_ignores_a_correction_whose_marker_is_on_the_line_before(self):
        body = 'This clause used to open\n"As of 2026-09-02 it recorded zero observed users across ~184 products".\n'
        self.assertEqual(self._scan(body), [])

    def test_ignores_a_correction_whose_marker_is_on_the_line_after(self):
        body = 'As of 2026-09-02 it recorded zero observed users across ~184 products.\nThat sentence was wrong and has been corrected, it used to say so.\n'
        self.assertEqual(self._scan(body), [])

    def test_an_honest_sentence_does_not_trip_it(self):
        body = "No visitor reading has ever been taken; `live_url_visitors` is null throughout.\n"
        self.assertEqual(self._scan(body), [])

    def test_the_ledger_is_not_scanned(self):
        """Dated history is append-only: rewriting it destroys the evidence."""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            ledger = root / "portfolio" / "ledger"
            ledger.mkdir(parents=True)
            (ledger / "2026-09.yaml").write_text("note: records zero observed users\n")
            self.assertEqual(state.find_claims(root), [])

    def test_asks_yaml_is_scanned_even_though_it_lives_in_the_ledger(self):
        """The live queue is not history, and it is the surface the owner reads.

        Measured 2026-09-13: the `pages-custom-domain` ask said "`usage.yaml`
        records zero visitors across all 200 products" and this check reported
        `claims honest`, because the exclusion was written against the ledger
        *directory* rather than against dated history. `decision_queue.py`
        renders `asks.yaml` as present-tense fact on every run, so an overclaim
        there reaches the owner in the one place whose purpose is deciding
        which product deserves the next hour -- and it inverts the decision,
        because "records zero" is evidence against a product where "never
        measured" is evidence about nothing.
        """
        hits = self._scan(
            "unlocks: usage.yaml records zero visitors across all 200 products.\n",
            name="portfolio/ledger/asks.yaml",
        )
        self.assertEqual(len(hits), 1)
        self.assertEqual(hits[0][0], "portfolio/ledger/asks.yaml")


class Verdict(unittest.TestCase):
    """`honest` needs BOTH halves, so the gate opens from either side."""

    def _report(self, products, doc):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "portfolio" / "usage").mkdir(parents=True)
            import yaml

            (root / "portfolio" / "usage" / "usage.yaml").write_text(
                yaml.safe_dump(_usage(products))
            )
            (root / "CLAUDE.md").write_text(doc)
            return state.build_report(root)

    CLAIM = "usage.yaml records zero observed users across every product.\n"
    CLEAN = "No visitor reading has ever been taken here.\n"

    def test_unmeasured_plus_a_claim_is_an_overclaim(self):
        report = self._report([_product("a", [{"live_url_visitors": None}])], self.CLAIM)
        self.assertEqual(report["visitors"], "never-measured")
        self.assertFalse(report["honest"])

    def test_fixing_the_sentence_opens_the_gate(self):
        report = self._report([_product("a", [{"live_url_visitors": None}])], self.CLEAN)
        self.assertTrue(report["honest"])

    def test_recording_a_real_reading_also_opens_the_gate(self):
        """Once a zero is genuinely measured the sentence becomes true."""
        report = self._report([_product("a", [{"live_url_visitors": 0}])], self.CLAIM)
        self.assertEqual(report["visitors"], "measured")
        self.assertTrue(report["honest"])


class AgainstTheRealTree(unittest.TestCase):
    def test_the_repository_is_currently_honest(self):
        report = state.build_report()
        self.assertEqual(
            report["claims"],
            [],
            msg=(
                "A steering document is reporting usage.yaml's null visitor rows as an "
                "observed zero. Run `python3 platform/ci/usage_state.py` for the list."
            ),
        )

    def test_the_visitor_signal_is_still_unmeasured(self):
        """A canary, not a requirement.

        If this ever fails it is good news -- someone recorded a real visitor
        reading -- and the right response is to delete the test and start
        ranking by DIRECTION.md's nonzero-signal rule, which has never fired.
        """
        report = state.build_report()
        self.assertEqual(report["visitors"], "never-measured")


class Render(unittest.TestCase):
    def _report(self, **over):
        report = {
            "products": 3,
            "visitor_readings": 5,
            "visitor_real": 0,
            "visitors": "never-measured",
            "events": "self-test-only",
            "not_external": [],
            "possibly_external": [],
            "claims": [],
            "claims_verdict": "honest",
            "honest": True,
        }
        report.update(over)
        return report

    def test_a_snippet_of_exactly_88_characters_is_not_truncated(self):
        text = "x" * 88
        out = state.render(
            self._report(claims=[("CLAUDE.md", 1, text)], honest=False)
        )
        self.assertIn(text, out)
        self.assertNotIn("...", out)

    def test_a_longer_snippet_is_truncated(self):
        out = state.render(
            self._report(claims=[("CLAUDE.md", 1, "y" * 89)], honest=False)
        )
        self.assertIn("y" * 85 + "...", out)

    def test_never_measured_and_honest_says_nothing_is_overclaimed(self):
        self.assertIn("Nothing is overclaimed", state.render(self._report()))

    def test_a_real_reading_says_to_rank_it(self):
        out = state.render(self._report(visitors="measured", visitor_real=[("a", "2026-09-01", 2)]))
        self.assertIn("A real reading exists", out)
        self.assertNotIn("Nothing is overclaimed", out)


class Cli(unittest.TestCase):
    def test_help_uses_the_first_docstring_line(self):
        import contextlib
        import io

        buf = io.StringIO()
        with contextlib.redirect_stdout(buf), self.assertRaises(SystemExit):
            state.main(["--help"])
        first = state.__doc__.splitlines()[0]
        self.assertIn(first.split()[0], buf.getvalue())
        self.assertIn(first, " ".join(buf.getvalue().split()))


if __name__ == "__main__":
    unittest.main()
