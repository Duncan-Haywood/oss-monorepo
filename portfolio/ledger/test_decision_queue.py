#!/usr/bin/env python3
"""Unit tests for the owner decision queue renderer."""
import datetime as dt
import unittest

from decision_queue import (
    EXPOSURES,
    GATES,
    age_days,
    check,
    covers,
    load,
    render,
    sort_key,
    wrap,
)

TODAY = dt.date(2026, 8, 24)


def decision(**overrides):
    base = {
        "id": "payout-rail",
        "asks": [2],
        "prs": [],
        "gates": "revenue",
        "exposure": "legal-person",
        "opened": "2026-08-19",
        "action": "Open a merchant-of-record account.",
        "unlocks": ["Any revenue at all."],
        "blocked_by": [],
        "note": "Deliberately human-gated.",
    }
    base.update(overrides)
    return base


class Check(unittest.TestCase):
    def test_clean_record_has_no_problems(self):
        self.assertEqual(check([decision()]), [])

    def test_missing_field_is_reported_once(self):
        d = decision()
        del d["unlocks"]
        problems = check([d])
        self.assertEqual(len(problems), 1)
        self.assertIn("unlocks", problems[0])

    def test_unknown_gates_value_rejected(self):
        problems = check([decision(gates="vibes")])
        self.assertTrue(any("gates=" in p for p in problems))

    def test_unknown_exposure_value_rejected(self):
        problems = check([decision(exposure="mild")])
        self.assertTrue(any("exposure=" in p for p in problems))

    def test_bad_date_rejected(self):
        problems = check([decision(opened="last Tuesday")])
        self.assertTrue(any("YYYY-MM-DD" in p for p in problems))

    def test_duplicate_id_rejected(self):
        problems = check([decision(), decision(asks=[3])])
        self.assertTrue(any("duplicate id" in p for p in problems))

    def test_blocked_by_unknown_id_rejected(self):
        problems = check([decision(blocked_by=["no-such-thing"])])
        self.assertTrue(any("unknown id" in p for p in problems))

    def test_blocked_by_self_rejected(self):
        problems = check([decision(blocked_by=["payout-rail"])])
        self.assertTrue(any("itself" in p for p in problems))

    def test_covering_nothing_rejected(self):
        problems = check([decision(asks=[], prs=[])])
        self.assertTrue(any("neither an ask nor" in p for p in problems))

    def test_empty_unlocks_rejected(self):
        problems = check([decision(unlocks=[])])
        self.assertTrue(any("unlocks is empty" in p for p in problems))

    # The collapse is the point of this file, so an ask or PR landing under two
    # decisions is a real defect: the queue would show it twice and the counts
    # in the header would disagree with #139.
    def test_ask_claimed_twice_rejected(self):
        problems = check([
            decision(),
            decision(id="other", asks=[2, 3], gates="measurement"),
        ])
        self.assertTrue(any("ask 2 claimed by both" in p for p in problems))

    def test_pr_claimed_twice_rejected(self):
        problems = check([
            decision(id="a", asks=[], prs=[372]),
            decision(id="b", asks=[], prs=[372]),
        ])
        self.assertTrue(any("PR 372 claimed by both" in p for p in problems))


class Ordering(unittest.TestCase):
    def test_revenue_leads_however_cheap_the_rest_are(self):
        cheap = decision(id="cheap", asks=[3], gates="measurement", exposure="none")
        ordered = sorted([cheap, decision()], key=sort_key)
        self.assertEqual(ordered[0]["id"], "payout-rail")

    def test_blocked_sinks_below_actionable(self):
        blocked = decision(
            id="blocked", asks=[5], gates="distribution",
            blocked_by=["payout-rail"],
        )
        late = decision(id="late", asks=[6], gates="deployment", exposure="none")
        ordered = sorted([blocked, late], key=sort_key)
        self.assertEqual([d["id"] for d in ordered], ["late", "blocked"])

    def test_gates_ranking_matches_break_even(self):
        # break-even.md's own ordering: gates all revenue; gates distribution
        # but not capture; buys information; buys deployment.
        self.assertEqual(GATES, ["revenue", "distribution", "measurement", "deployment"])

    def test_within_a_class_lower_exposure_first(self):
        risky = decision(id="risky", asks=[4], gates="deployment", exposure="legal-person")
        safe = decision(id="safe", asks=[6], gates="deployment", exposure="none")
        ordered = sorted([risky, safe], key=sort_key)
        self.assertEqual([d["id"] for d in ordered], ["safe", "risky"])


class Helpers(unittest.TestCase):
    def test_age_counts_whole_days(self):
        self.assertEqual(age_days("2026-08-19", TODAY), 5)

    def test_covers_names_asks_and_prs(self):
        self.assertEqual(covers(decision(asks=[3, 7], prs=[372])), "ask 3, 7; #372")

    def test_wrap_keeps_every_word(self):
        text = "one two three four five six seven eight nine ten"
        lines = wrap(text, 20, "  ")
        self.assertEqual(" ".join(l.strip() for l in lines), text)

    def test_wrap_respects_width(self):
        lines = wrap("alpha beta gamma delta epsilon", 12, "    ")
        self.assertTrue(all(len(l) <= 12 + 4 for l in lines))


class Render(unittest.TestCase):
    def test_header_counts_asks_and_prs_not_decisions(self):
        out = render([
            decision(),
            decision(id="prs", asks=[], prs=[372, 368], gates="deployment"),
        ], TODAY)
        # "related", not "open": this file's PR numbers are provenance, and
        # calling them open had the queue overstating itself by seven closed
        # pull requests. See the `prs` note in asks.yaml.
        self.assertIn("2 decisions, collapsed from 1 asks and 2 related", out)
        self.assertNotIn("open pull requests", out)

    def test_blocked_items_are_marked(self):
        out = render([
            decision(),
            decision(id="later", asks=[5], gates="distribution",
                     blocked_by=["payout-rail"]),
        ], TODAY)
        self.assertIn("[blocked]", out)
        self.assertIn("blocked by: payout-rail", out)

    def test_footer_names_the_revenue_item(self):
        out = render([decision()], TODAY)
        self.assertIn("Only payout-rail changes what this portfolio can earn", out)

    def test_no_footer_claim_when_nothing_gates_revenue(self):
        out = render([decision(id="m", gates="measurement", asks=[3])], TODAY)
        self.assertNotIn("changes what this portfolio can earn", out)

    def test_oldest_age_is_the_max_not_the_first(self):
        out = render([
            decision(id="new", opened="2026-08-23"),
            decision(id="old", asks=[3], gates="measurement", opened="2026-08-19"),
        ], TODAY)
        self.assertIn("Oldest has waited 5 days", out)


class RealFile(unittest.TestCase):
    def test_committed_file_passes_its_own_schema(self):
        self.assertEqual(check(load()), [])

    def test_committed_file_renders(self):
        out = render(load(), TODAY)
        self.assertIn("The account owner's decision queue", out)

    def test_every_exposure_and_gate_value_is_declared(self):
        for d in load():
            self.assertIn(d["gates"], GATES)
            self.assertIn(d["exposure"], EXPOSURES)

    def test_product_prs_are_not_an_owner_decision(self):
        ids = {d["id"] for d in load()}
        self.assertNotIn("venture-gate-premise", ids)
        self.assertNotIn("eaa-evidence-product-line", ids)

    def test_no_two_rows_claim_the_same_pull_request(self):
        # The 2026-08-29 regression: #2003 added `portfolio-site-hetzner-
        # deploy` and #2006 added `hetzner-portfolio-site-live` -- one ask,
        # two rows, both claiming PR 1999. `check` caught it, but only
        # after the merge, and until it was fixed the queue printed
        # nothing at all. Named separately from the generic `check` run
        # above so a re-added duplicate says which rule it broke.
        seen = {}
        for d in load():
            for pr in d["prs"]:
                self.assertNotIn(
                    pr, seen,
                    f"PR #{pr} is claimed by both {seen.get(pr)!r} and "
                    f"{d['id']!r}; one ask gets one row",
                )
                seen[pr] = d["id"]


class MainDegradesGracefully(unittest.TestCase):
    """A bookkeeping mistake must not hide the queue from the owner."""

    def _run(self, decisions, argv):
        import contextlib
        import io
        from unittest import mock

        import decision_queue

        out, err = io.StringIO(), io.StringIO()
        with mock.patch.object(decision_queue, "load", lambda: decisions), \
                mock.patch("sys.argv", ["decision_queue.py", *argv]), \
                contextlib.redirect_stdout(out), \
                contextlib.redirect_stderr(err):
            code = decision_queue.main()
        return code, out.getvalue(), err.getvalue()

    def test_clean_queue_renders_and_exits_zero(self):
        code, out, _ = self._run([decision()], ["--today", "2026-08-24"])
        self.assertEqual(code, 0)
        self.assertIn("The account owner's decision queue", out)

    def test_duplicate_pr_still_renders_the_queue_but_exits_one(self):
        dupes = [decision(), decision(id="payout-rail-again", asks=[3], prs=[1])]
        dupes[0]["prs"] = [1]
        code, out, err = self._run(dupes, ["--today", "2026-08-24"])
        self.assertEqual(code, 1, "a reported problem must still fail loudly")
        self.assertIn("claimed by both", err)
        # The point of the change: both decisions are still legible.
        self.assertIn("payout-rail", out)
        self.assertIn("payout-rail-again", out)

    def test_check_stays_strict_and_prints_no_queue(self):
        dupes = [decision(), decision(id="other", asks=[3], prs=[1])]
        dupes[0]["prs"] = [1]
        code, out, err = self._run(dupes, ["--check"])
        self.assertEqual(code, 1)
        self.assertIn("claimed by both", err)
        self.assertNotIn("The account owner's decision queue", out)

    def test_unrenderable_record_falls_back_instead_of_a_traceback(self):
        broken = decision()
        del broken["opened"]
        code, out, err = self._run([broken], ["--today", "2026-08-24"])
        self.assertEqual(code, 1)
        self.assertIn("cannot render the queue", err)
        self.assertNotIn("Traceback", out)


if __name__ == "__main__":
    unittest.main()
