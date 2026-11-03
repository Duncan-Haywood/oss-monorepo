#!/usr/bin/env python3
"""Unit tests for the owner decision queue renderer."""
import datetime as dt
import unittest

from decision_queue import (
    EXPOSURES,
    GATES,
    PUBLIC_ORIGINS,
    VERDICTS,
    load_infra,
    serving_origins,
    viability,
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

    def test_an_outage_outranks_even_revenue(self):
        # The case the flag exists for: on 2026-09-04 every hostname refused
        # connections, so the `deployment` row that restores one outranks the
        # `revenue` row that cannot earn through a dead host.
        down = decision(
            id="down", asks=[7], gates="deployment", exposure="credential", outage=True
        )
        ordered = sorted([decision(), down], key=sort_key)
        self.assertEqual([d["id"] for d in ordered], ["down", "payout-rail"])

    def test_a_blocked_outage_still_sinks(self):
        # Wanting it badly does not make it actionable.
        stuck = decision(
            id="stuck", asks=[7], gates="deployment",
            outage=True, blocked_by=["payout-rail"],
        )
        ordered = sorted([stuck, decision()], key=sort_key)
        self.assertEqual([d["id"] for d in ordered], ["payout-rail", "stuck"])

    def test_absent_outage_field_orders_exactly_as_before(self):
        # The flag is optional; every existing row omits it and must be
        # unaffected. Compare a set with no flags against itself.
        rows = [
            decision(),
            decision(id="a", asks=[3], gates="measurement", exposure="none"),
            decision(id="b", asks=[4], gates="deployment", exposure="credential"),
        ]
        with_false = [dict(r, outage=False) for r in rows]
        self.assertEqual(
            [d["id"] for d in sorted(rows, key=sort_key)],
            [d["id"] for d in sorted(with_false, key=sort_key)],
        )


class OutageFlag(unittest.TestCase):
    """The flag is narrow on purpose; these pin the narrowness."""

    def test_a_non_boolean_outage_is_a_schema_problem(self):
        problems = check([decision(outage="yes")])
        self.assertEqual(len(problems), 1)
        self.assertIn("not true or false", problems[0])

    def test_a_boolean_outage_is_clean(self):
        self.assertEqual(check([decision(outage=True)]), [])
        self.assertEqual(check([decision(outage=False)]), [])

    def test_omitting_it_is_clean(self):
        self.assertEqual(check([decision()]), [])

    def test_the_header_names_the_outage_row_and_says_to_start_there(self):
        down = decision(
            id="down", asks=[7], gates="deployment", exposure="credential", outage=True
        )
        text = render([decision(), down], TODAY)
        self.assertIn("OUTAGE: the public surface is down.", text)
        self.assertIn("down", text.split("1. ")[0])
        self.assertIn("[OUTAGE]", text)

    def test_no_outage_row_means_no_outage_header(self):
        self.assertNotIn("OUTAGE", render([decision()], TODAY))

    def test_a_blocked_outage_row_is_not_announced_as_actionable(self):
        stuck = decision(
            id="stuck", asks=[7], gates="deployment",
            outage=True, blocked_by=["payout-rail"],
        )
        text = render([decision(), stuck], TODAY)
        self.assertNotIn("OUTAGE: the public surface is down.", text)
        self.assertIn("[blocked]", text)

    # The portfolio ships to two independent public origins (the k3s cluster
    # and GitHub Pages), and #3199 established they fail independently. When
    # both are dark, two rows carry the flag and they are alternatives, not a
    # sequence -- so the header must not tell the owner to start at the first
    # and must not repeat the singular claim that everything else is
    # "downstream of a host answering at all". Getting this wrong is expensive
    # in one specific direction: the owner spends a day on the route that
    # needs a credential they may no longer have, while the two-click route
    # sits unflipped.
    def test_two_outage_rows_are_announced_as_alternatives_not_an_order(self):
        cluster = decision(
            id="cluster", asks=[7], gates="deployment", exposure="credential",
            outage=True,
        )
        pages = decision(
            id="pages", asks=[8], gates="deployment", exposure="credential",
            outage=True,
        )
        header = render([decision(), cluster, pages], TODAY).split("1. ")[0]
        self.assertIn("OUTAGE: the public surface is down.", header)
        self.assertIn("cluster", header)
        self.assertIn("pages", header)
        # The whole point: neither is presented as the one to do first, and
        # each alone is said to be sufficient.
        self.assertNotIn("comes first", header)
        self.assertIn("not downstream of each other", header)
        self.assertIn("any one of them alone", header)

    def test_one_outage_row_keeps_the_singular_wording(self):
        down = decision(
            id="down", asks=[7], gates="deployment", exposure="credential", outage=True
        )
        header = render([decision(), down], TODAY).split("1. ")[0]
        self.assertIn("down comes first", header)
        self.assertNotIn("not downstream of each other", header)

    def test_the_live_queue_flags_no_outage_after_the_servers_were_deleted(self):
        # Not a fixture: the real asks.yaml.
        #
        # Until 2026-10-01 this asserted that `hetzner-ssh-key-is-a-public-key`
        # was the one origin still flagged dark. The owner deleted the Hetzner
        # servers that day, so the k3s route is retired rather than down and
        # its row is gone; GitHub Pages is the only host and it is served.
        # Nothing in the live queue may claim a restorable outage, so the
        # header must carry no OUTAGE banner at all.
        flagged = {d["id"] for d in load() if d.get("outage") and not d["blocked_by"]}
        self.assertEqual(flagged, set())
        ids = {d["id"] for d in load()}
        for gone in (
            "hetzner-ssh-key-is-a-public-key",
            "codex-governor-enable",
            "portfolio-site-hetzner-deploy",
        ):
            self.assertNotIn(gone, ids, f"{gone} depends on servers deleted 2026-10-01")
        header = render(load(), TODAY).split("1. ")[0]
        self.assertNotIn("OUTAGE", header)


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


class Viability(unittest.TestCase):
    """A route that restores a surface is not the same as one that can be taken.

    Every case here is a form of the 2026-09-04 error: `deploy-settings` was a
    genuine independent route to a public origin, and simultaneously could not
    publish anything, because the workflow behind it needed an Actions runner
    and runner assignment had stopped. The queue printed it at position 1 and
    told the owner to do the cheapest first.
    """

    DAY = dt.date(2026, 9, 4)

    def infra(self, verdict="up", measured="2026-09-04", **extra):
        return {"ci": dict({"verdict": verdict, "measured": measured, "run": 1}, **extra)}

    def test_no_requirements_is_viable(self):
        self.assertEqual(viability(decision(), self.infra(), self.DAY)[0], "up")

    def test_route_is_down_when_its_prerequisite_is_down(self):
        d = decision(requires=["ci"])
        self.assertEqual(viability(d, self.infra("down"), self.DAY)[0], "down")

    def test_route_is_up_when_its_prerequisite_is_up(self):
        d = decision(requires=["ci"])
        self.assertEqual(viability(d, self.infra("up"), self.DAY)[0], "up")

    def test_unmeasured_prerequisite_is_unknown_not_up(self):
        # The failure direction that matters: an absent reading must never be
        # read as a healthy one. That is precisely how "nothing is served"
        # stood unchallenged for five days.
        d = decision(requires=["never-measured"])
        verdict, why = viability(d, self.infra(), self.DAY)
        self.assertEqual(verdict, "unknown")
        self.assertIn("never measured", why[0])

    def test_stale_reading_ages_out_to_unknown_not_up(self):
        d = decision(requires=["ci"])
        stale = self.infra("up", measured="2026-08-01")
        verdict, why = viability(d, stale, self.DAY)
        self.assertEqual(verdict, "unknown")
        self.assertIn("too stale", why[0])

    def test_a_reading_from_the_future_is_not_trusted(self):
        d = decision(requires=["ci"])
        verdict, _ = viability(d, self.infra("up", measured="2026-12-25"), self.DAY)
        self.assertEqual(verdict, "unknown")

    def test_one_down_prerequisite_outweighs_an_up_one(self):
        infra = {
            "ci": {"verdict": "up", "measured": "2026-09-04"},
            "cluster": {"verdict": "down", "measured": "2026-09-04"},
        }
        d = decision(requires=["ci", "cluster"])
        self.assertEqual(viability(d, infra, self.DAY)[0], "down")


class ViabilityOrdering(unittest.TestCase):
    DAY = dt.date(2026, 9, 4)

    def routes(self):
        return [
            decision(id="needs-ci", asks=[4], gates="deployment",
                     exposure="credential", outage=True, requires=["ci"]),
            decision(id="needs-nothing", asks=[5], gates="deployment",
                     exposure="credential", outage=True),
        ]

    def down(self):
        return {"ci": {"verdict": "down", "measured": "2026-09-04", "run": 1}}

    def test_unusable_route_sinks_below_the_usable_one(self):
        got = sorted(self.routes(), key=lambda d: sort_key(d, self.down(), self.DAY))
        self.assertEqual([d["id"] for d in got], ["needs-nothing", "needs-ci"])

    def test_ordering_is_unchanged_when_no_readings_are_supplied(self):
        # Back-compat: `sort_key(d)` is still the one-argument function the
        # rest of the tool and its tests call.
        got = sorted(self.routes(), key=sort_key)
        self.assertEqual([d["id"] for d in got], ["needs-ci", "needs-nothing"])

    def test_banner_names_the_route_that_works_and_why_the_other_does_not(self):
        out = render(self.routes(), self.DAY, self.down())
        self.assertIn("Not all of them work today", out)
        self.assertIn("needs-nothing", out)
        self.assertIn("needs-ci — down", out)
        # The sentence that misdirected the owner must not survive unqualified.
        self.assertNotIn("Do the cheapest first.", out)

    def test_banner_keeps_the_old_advice_when_every_route_works(self):
        up = {"ci": {"verdict": "up", "measured": "2026-09-04", "run": 1}}
        out = render(self.routes(), self.DAY, up)
        self.assertIn("Do the cheapest first.", out)
        self.assertNotIn("Not all of them work today", out)

    def test_banner_says_so_when_no_route_works_at_all(self):
        routes = [dict(d, requires=["ci"]) for d in self.routes()]
        out = render(routes, self.DAY, self.down())
        self.assertIn("None of them works today", out)


class RequiresSchema(unittest.TestCase):
    def test_requires_must_name_a_reading_that_exists(self):
        d = decision(requires=["typo"])
        problems = check([d], {"ci": {"verdict": "up", "measured": "2026-09-04"}})
        self.assertTrue(any("no reading in infra_state.yaml" in p for p in problems))

    def test_requires_must_be_a_list_of_names(self):
        problems = check([decision(requires="ci")], {"ci": {}})
        self.assertTrue(any("not a list of names" in p for p in problems))

    def test_a_declared_reading_that_exists_is_clean(self):
        d = decision(requires=["ci"])
        self.assertEqual(check([d], {"ci": {"verdict": "up", "measured": "2026-09-04"}}), [])


class ShippedInfraState(unittest.TestCase):
    """The committed readings must stay loadable and well-formed."""

    def test_every_reading_parses_and_carries_its_evidence(self):
        infra = load_infra()
        self.assertTrue(infra, "infra_state.yaml should carry readings")
        for name, entry in infra.items():
            with self.subTest(reading=name):
                self.assertIn(entry.get("verdict"), VERDICTS)
                dt.date.fromisoformat(str(entry["measured"]))
                self.assertTrue(str(entry.get("how", "")).strip(),
                                "a reading must say how to re-measure it")

    def test_every_requires_in_the_shipped_asks_resolves(self):
        self.assertEqual(check(load(), load_infra()), [])


class DispatchNeedsARunner(unittest.TestCase):
    """See DISPATCH_MARKERS in decision_queue.py.

    A row's action prose and its `requires` list could disagree in silence,
    and on 2026-09-05 the top-ranked outage row did: it told the owner to
    dispatch two workflows while declaring no prerequisites, so it rendered
    `up` and the banner called it the one grantable row. Both dispatches
    would have returned `runner_id: 0`.
    """

    def test_dispatch_without_a_declared_runner_is_a_problem(self):
        d = decision(action="Then dispatch `hetzner-gitops CI` with preflight.")
        problems = check([d], {})
        self.assertEqual(len(problems), 1)
        self.assertIn("github-actions-runners", problems[0])

    def test_declaring_the_runner_dependency_clears_it(self):
        d = decision(
            action="Then dispatch `hetzner-gitops CI` with preflight.",
            requires=["github-actions-runners"],
        )
        self.assertEqual(
            check([d], {"github-actions-runners": {"verdict": "down"}}), []
        )

    def test_naming_a_runner_free_route_clears_it(self):
        # The escape hatch the real ssh-key row uses: the workflow is
        # mentioned, but a route that needs no runner is spelled out.
        d = decision(
            action="Run it locally. Or dispatch `hetzner-gitops CI` later.",
            runner_free="bootstrap/restore-cluster.sh from the owner's machine.",
        )
        self.assertEqual(check([d], {}), [])

    def test_an_empty_runner_free_does_not_count_as_an_explanation(self):
        d = decision(
            action="Then dispatch `hetzner-gitops CI`.", runner_free="   "
        )
        problems = check([d], {})
        self.assertEqual(len(problems), 2)
        self.assertTrue(any("is present but empty" in p for p in problems))

    def test_an_action_that_only_pastes_a_secret_is_not_flagged(self):
        # Pasting a secret works fine while runners are starved; it is
        # running a workflow that does not. The marker set is deliberately
        # narrow so this stays clean.
        d = decision(action="Paste the key into Settings -> Secrets.")
        self.assertEqual(check([d], {}), [])
    # `test_the_shipped_pages_row_names_a_runner_free_route` retired on
    # 2026-10-31 with the `deploy-settings` row: the owner confirmed the old
    # Pages address redirects to marisstella.app, served by Cloudflare.


class UnmeasuredIsNotBlocked(unittest.TestCase):
    """`down` and `unknown` warrant opposite advice, and used to get the same.

    The banner told the owner that every non-viable outage route "buys
    nothing, however cheap it looks". True of a route whose infrastructure is
    measured down; false of one nobody has measured. On 2026-09-05 the second
    case was `deploy-settings` — one dropdown, no credential, no runner, no
    cluster, the only route not downstream of an outage, with the `gh-pages`
    snapshot already current at the tip of `main` — and the queue was telling
    the owner it was not worth the thirty seconds.
    """

    DAY = dt.date(2026, 9, 5)

    def outage_row(self, rid, requires):
        return decision(id=rid, outage=True, requires=requires, gates="deployment")

    def render_with(self, rows, infra):
        # `render` returns a single string; joining it would split it per
        # character and make every assertion below vacuously pass.
        #
        # Collapse whitespace before asserting: the banner is hard-wrapped at
        # 72 columns, so a phrase under test can straddle a line break and an
        # exact-substring assertion would fail on wrapping rather than on
        # behaviour. This checks the wording, not the column it lands in.
        return " ".join(render(rows, self.DAY, infra=infra).split())

    def test_an_unmeasured_route_is_not_described_as_buying_nothing(self):
        rows = [self.outage_row("pages", ["unmeasured-thing"])]
        out = self.render_with(rows, {})
        self.assertNotIn("buys nothing", out)
        self.assertIn("unverified rather than blocked", out)

    def test_a_down_route_is_still_described_as_buying_nothing(self):
        # The safeguard must keep working for the case it was written for.
        rows = [
            self.outage_row("pages", ["cluster"]),
            self.outage_row("ssh", []),
        ]
        infra = {"cluster": {"verdict": "down", "measured": "2026-09-05", "run": 1}}
        out = self.render_with(rows, infra)
        self.assertIn("buys nothing", out)

    def test_unmeasured_and_down_are_described_separately_in_one_render(self):
        rows = [
            self.outage_row("down-route", ["cluster"]),
            self.outage_row("unmeasured-route", ["never-read"]),
            self.outage_row("live-route", []),
        ]
        infra = {"cluster": {"verdict": "down", "measured": "2026-09-05", "run": 1}}
        out = self.render_with(rows, infra)
        # The down one is named as buying nothing; the unmeasured one is not
        # swept into the same sentence.
        self.assertIn("down-route", out)
        self.assertIn("buys nothing", out)
        self.assertIn("unmeasured-route is unverified rather than blocked", out)

    def test_all_unmeasured_does_not_claim_none_of_them_works(self):
        # With nothing viable and nothing measured down, the old wording
        # asserted "None of them works today" — the exact unchecked claim
        # this split exists to stop.
        rows = [self.outage_row("pages", ["never-read"])]
        out = self.render_with(rows, {})
        self.assertNotIn("None of them works today", out)
        self.assertIn("None of them is confirmed to work today", out)

    def test_viability_still_refuses_to_rank_unknown_as_up(self):
        # The description changed; the ranking rule must not. An unmeasured
        # prerequisite reading as healthy is what cost five days.
        d = self.outage_row("pages", ["never-read"])
        self.assertEqual(viability(d, {}, self.DAY)[0], "unknown")


class AServedCatalogueIsNotADarkOne(unittest.TestCase):
    """The banner must not call the catalogue dark while an origin serves it.

    Fixed 2026-09-06. `render()` printed "OUTAGE: the public surface is down
    ... every other row here is downstream of a host answering at all"
    whenever any row carried `outage: true`, with no reference to whether a
    surface was in fact serving. That day `github-pages-branch-route` read
    `up` -- GitHub's own managed builder had run on `gh-pages` and succeeded,
    which it does only for the configured Pages source -- so 186 tools were
    publicly served while the queue told the owner the catalogue was dark and
    that reading no further was correct.

    The cost is specific: the banner exists to suppress the rest of the queue,
    and suppressing it against a served catalogue buries the three rows that
    move the revenue ceiling off $0 behind a route the owner may not be able
    to take today.
    """

    DAY = dt.date(2026, 9, 6)
    ORIGIN = "github-pages-branch-route"

    def render_with(self, infra, ids=("ssh",)):
        rows = [decision(id=i, outage=True, gates="deployment") for i in ids]
        rows.append(decision())
        return " ".join(render(rows, self.DAY, infra=infra).split())

    def up(self, name):
        return {name: {"verdict": "up", "measured": self.DAY.isoformat(), "run": 1}}

    def test_a_served_origin_replaces_the_dark_catalogue_claim(self):
        out = self.render_with(self.up(self.ORIGIN))
        self.assertNotIn("the public surface is down", out)
        self.assertIn("PARTIAL OUTAGE", out)
        self.assertIn("the catalogue is being served by", out)

    def test_it_tells_the_owner_to_keep_reading(self):
        # The one behaviour the bug destroyed: the rest of the queue is not
        # all downstream of this outage, so it must not be suppressed.
        out = self.render_with(self.up(self.ORIGIN))
        self.assertIn("read on", out)
        self.assertNotIn("downstream of a host answering at all", out)

    def test_it_still_names_the_route_that_repairs_the_dark_origin(self):
        out = self.render_with(self.up(self.ORIGIN))
        self.assertIn("ssh restores the origin that is down", out)

    def test_deployed_is_never_reported_as_fetched(self):
        # The mirror of the bug, and the worse one: an unauthenticated 200 is
        # a different reading (`github-pages-origin`) that no session can
        # take. Claiming it would stop the owner making the one check that
        # settles it.
        out = self.render_with(self.up(self.ORIGIN))
        self.assertIn("Not yet confirmed by a logged-out fetch", out)
        self.assertIn("github-pages-origin", out)
        self.assertIn("not that a stranger has read it", out)

    def test_a_confirmed_origin_drops_the_caveat(self):
        infra = self.up(self.ORIGIN) | self.up("github-pages-origin")
        out = self.render_with(infra)
        self.assertIn("PARTIAL OUTAGE", out)
        self.assertNotIn("Not yet confirmed by a logged-out fetch", out)

    def test_no_served_origin_keeps_the_original_outage_banner(self):
        # The safeguard must keep working for the case it was written for:
        # with every origin dark, the old wording is correct and stays.
        out = self.render_with({self.ORIGIN: {"verdict": "down",
                                              "measured": self.DAY.isoformat(),
                                              "run": 1}})
        self.assertIn("OUTAGE: the public surface is down", out)
        self.assertIn("ssh comes first", out)
        self.assertNotIn("PARTIAL OUTAGE", out)

    def test_a_stale_reading_falls_back_to_the_outage_banner(self):
        # The direction that must not invert: an origin nobody has re-measured
        # ages out to `unknown` and stops suppressing the banner. Keeping a
        # stale `up` would be the 2026-08-30..09-04 "nothing is served"
        # episode again, with the queue as the thing asserting it.
        stale = {self.ORIGIN: {"verdict": "up", "measured": "2026-08-01", "run": 1}}
        self.assertEqual(serving_origins(stale, self.DAY), [])
        self.assertIn("OUTAGE: the public surface is down",
                      self.render_with(stale))

    def test_an_unmeasured_origin_does_not_count_as_serving(self):
        self.assertEqual(serving_origins({}, self.DAY), [])

    def test_every_named_origin_has_an_owner_facing_label(self):
        for name, label in PUBLIC_ORIGINS.items():
            self.assertTrue(label.strip(), f"{name} has no label")

    def test_the_live_readings_still_name_a_real_origin(self):
        # Not a fixture: PUBLIC_ORIGINS keys must exist in infra_state.yaml,
        # or the banner silently reverts to claiming the catalogue is dark.
        infra = load_infra()
        for name in PUBLIC_ORIGINS:
            self.assertIn(
                name, infra,
                f"{name} is named in PUBLIC_ORIGINS but has no reading in "
                "infra_state.yaml, so it can never suppress the outage banner",
            )


if __name__ == "__main__":
    unittest.main()
