"""Tests for platform/ci/quality_metrics.py and the detailed audit schema in quality_audit.py."""
import datetime as dt
import importlib.util
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))


def _load(name):
    spec = importlib.util.spec_from_file_location(name, HERE / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


q = _load("quality_audit")
m = _load("quality_metrics")

FULL = {d: 3 for d in q.DIMENSIONS}
EV = {d: "ran `node --test` and compared three outputs against the published table" for d in q.DIMENSIONS}


def audit(subject="ventures/ai-bookkeeper", stratum="venture", date="2026-11-07", **kw):
    a = {"_file": f"{date}-{subject.split('/')[-1]}.json", "date": date, "subject": subject, "stratum": stratum,
         "status": "audited", "professional": "a CPA", "scores": dict(FULL), "evidence": dict(EV),
         "defects": [], "fix_prs": [], "verdict": "fine"}
    a.update(kw)
    return a


def check(dim="correctness", result="pass"):
    return {"dimension": dim, "what": "monthly payment at 6%", "method": "hand computation from the annuity formula",
            "expected": "599.55", "observed": "599.55", "result": result}


DETAILED = dict(
    checks=[check() for _ in range(3)] + [check("claims") for _ in range(5)],
    mutations=[{"where": "calc.mjs:40", "change": "> to >=", "caught": True},
               {"where": "calc.mjs:88", "change": "12 to 11", "caught": False}],
    defects=[{"severity": "medium", "what": "x", "where": "calc.mjs:88", "category": "untested-core", "origin": "tests"}],
)


class TaxonomyTest(unittest.TestCase):
    def test_rules_classify_the_common_kinds(self):
        cases = {
            "Seeded mutation of the threshold left all 29 tests green": "untested-core",
            "llms.txt points at the retired duncan-haywood.github.io host": "source-only",
            "sitemap.xml uses relative URLs, invalid per the sitemap protocol": "source-only",
            "Headline claim that the tool and Lighthouse never disagree is false": "overclaim",
            "A comma inside a quoted number is split into extra cells": "input-handling",
            "Novelty is low: the result is textbook queueing theory": "research-design",
            "The iOS app was never compiled or run": "not-built-or-run",
            "README states 321 tests; the suite has 343.": "stale-docs",
            "Something entirely unlike the rules": "other",
        }
        for text, want in cases.items():
            self.assertEqual(m.classify({"what": text})[0], want, text)

    def test_auditor_category_wins(self):
        self.assertEqual(m.classify({"what": "mutation survived", "category": "domain-rule", "origin": "spec"}),
                         ("domain-rule", "spec", "audit"))

    def test_every_category_has_a_known_origin(self):
        for cat, origin, _ in m.CATEGORIES:
            self.assertIn(origin, m.ORIGINS, cat)

    def test_label_agreement_on_the_real_labels(self):
        rows = m.defect_rows(q.load_audits())
        agree = m.label_agreement(rows)
        self.assertGreaterEqual(agree["n"], 50)
        # The keyword rules are approximate; this floor catches a rule edit that breaks them wholesale.
        self.assertGreaterEqual(agree["share"], 0.65)


class SignalsTest(unittest.TestCase):
    def test_mutation_outcome_from_text_and_structure(self):
        self.assertEqual(m.mutation_outcome(audit()), "unknown")
        ev = {**EV, "verification": "Seeded mutation in calc.mjs: 3 tests failed (caught), reverted."}
        self.assertEqual(m.mutation_outcome(audit(evidence=ev)), "caught")
        ev = {**EV, "verification": "Two seeded mutations: one caught, one survived all 12 tests."}
        self.assertEqual(m.mutation_outcome(audit(evidence=ev)), "survived")
        self.assertEqual(m.mutation_outcome(audit(evidence=ev, mutations=[{"caught": True}])), "caught")

    def test_persistence_matches_repeated_defects(self):
        first = audit(date="2026-11-07", defects=[{"severity": "high", "what": "overtime threshold mutation survives calc tests"},
                                                  {"severity": "low", "what": "unused helper in render module"}])
        second = audit(date="2026-11-09", _file="2026-11-09-ai-bookkeeper.json",
                       defects=[{"severity": "high", "what": "unchanged: overtime threshold mutation survives calc tests"}])
        p = m.persistence([first, second])
        self.assertEqual((p["pairs"], p["earlier_defects"], p["reappeared"]), (1, 2, 1))
        self.assertEqual(p["later_defects_saying_unchanged"], 1)

    def test_agreement_counts_identical_and_close_scores(self):
        x = audit(date="2026-11-09", _file="2026-11-09-ai-bookkeeper-b.json")
        y = audit(date="2026-11-09", _file="2026-11-09-ai-bookkeeper.json", scores={**FULL, "claims": 2})
        g = m.agreement([x, y], q.meets_bar)["same_day"]
        self.assertEqual((g["pairs"], g["cells"], g["exact"], g["within_one"], g["bar_verdict_agrees"]), (1, 7, 6, 7, 0))
        fixed = dict(x, fix_prs=[1])
        self.assertEqual(m.agreement([fixed, y], q.meets_bar)["same_day"]["pairs"], 0)

    def test_queue_skips_fixed_and_source_only(self):
        a = audit(defects=[{"severity": "high", "what": "wrong Section 179 cap"},
                           {"severity": "medium", "what": "llms.txt links the retired github.io host"},
                           {"severity": "low", "what": "unused import"}])
        b = audit(subject="ventures/b", _file="2026-11-07-b.json", fix_prs=[123],
                  defects=[{"severity": "high", "what": "fixed already"}])
        rows = m.queue([a, b], "medium")
        self.assertEqual([r["what"] for r in rows], ["wrong Section 179 cap"])
        self.assertEqual(len(m.queue([a], "low")), 2)

    def test_queue_seed_spreads_parallel_sessions(self):
        # Two fix sessions took the same top row the same minute (doc_friction 2026-11-16T16:41).
        subs = [audit(subject=f"ventures/s{i}", _file=f"2026-11-0{i}-s{i}.json",
                      defects=[{"severity": "medium", "what": f"s{i} first"}, {"severity": "medium", "what": f"s{i} second"}])
                for i in range(1, 9)]
        subs.append(audit(subject="ventures/hi", _file="2026-11-09-hi.json",
                          defects=[{"severity": "high", "what": "hi"}]))
        fixed = [r["subject"] for r in m.queue(subs, "medium")]
        self.assertEqual(fixed[:3], ["ventures/hi", "ventures/s1", "ventures/s1"])
        tops = {m.queue(subs, "medium", seed=f"2026-11-16-{t}")[1]["subject"] for t in ("aa", "bb", "cc", "dd", "ee")}
        self.assertGreater(len(tops), 1)  # different seeds lead with different medium subjects
        for seed in ("x", "y"):
            rows = m.queue(subs, "medium", seed=seed)
            self.assertEqual(rows, m.queue(subs, "medium", seed=seed))  # a seed repeats its order
            self.assertEqual(rows[0]["subject"], "ventures/hi")  # severity still comes first
            self.assertEqual(sorted(map(str, rows), key=str), sorted(map(str, m.queue(subs, "medium")), key=str))
            for i in range(1, len(rows)):  # a subject's defects stay together, in index order
                if rows[i]["subject"] == rows[i - 1]["subject"]:
                    self.assertEqual(rows[i]["index"], rows[i - 1]["index"] + 1)

    def test_queue_reads_fixed_by_per_defect(self):
        url = "https://example.test/pull/1"
        a = audit(fix_prs=[url], defects=[{"severity": "medium", "what": "fixed one", "fixed_by": url},
                                          {"severity": "medium", "what": "left open"}])
        self.assertEqual([r["what"] for r in m.queue([a], "medium")], ["left open"])
        self.assertEqual([r["fixed"] for r in m.defect_rows([a])], [True, False])
        legacy = dict(a, defects=[{"severity": "medium", "what": "x"}, {"severity": "high", "what": "y"}])
        self.assertEqual(m.queue([legacy], "medium"), [])
        self.assertEqual(len(m.unmarked_fixes([legacy], "medium")), 1)
        self.assertEqual(m.unmarked_fixes([a], "medium"), [])


class FixLoopTest(unittest.TestCase):
    """Reflection 2 (2026-11-17): fixes were recorded but never re-checked, and the mutation share saturated."""
    URL = "https://example.test/pull/7"

    def test_reaudit_lists_unchecked_fixes_highs_first(self):
        fixed_low = audit(subject="ventures/a", date="2026-11-08", fix_prs=[self.URL],
                          defects=[{"severity": "low", "what": "x"}])
        fixed_high = audit(subject="ventures/b", date="2026-11-12", fix_prs=[self.URL],
                           defects=[{"severity": "high", "what": "y", "fixed_by": self.URL},
                                    {"severity": "medium", "what": "z"}])
        rechecked = [audit(subject="ventures/c", date="2026-11-08", fix_prs=[self.URL],
                           defects=[{"severity": "high", "what": "w"}]),
                     audit(subject="ventures/c", date="2026-11-14")]
        untouched = audit(subject="ventures/d", defects=[{"severity": "high", "what": "v"}])
        rows = m.reaudit_due([fixed_low, fixed_high, untouched] + rechecked)
        self.assertEqual([r["subject"] for r in rows], ["ventures/b", "ventures/a"])
        self.assertEqual((rows[0]["fixed"], rows[0]["explicit"], rows[0]["high_fixed"]), (1, 1, 1))
        self.assertEqual(sorted(r["subject"] for r in m.reaudit_due([fixed_low, fixed_high], "s")),
                         ["ventures/a", "ventures/b"])

    def test_documented_open_goes_first(self):
        import tempfile
        root = Path(tempfile.mkdtemp())
        (root / "ventures" / "a").mkdir(parents=True)
        (root / "ventures" / "a" / "README.md").write_text(
            "## Known gaps\n\nFrom `portfolio/quality/audits/2026-11-12-a.json`: not yet fixed.\n")
        (root / "ventures" / "b").mkdir(parents=True)
        (root / "ventures" / "b" / "README.md").write_text("All fixed.\n")
        high = [{"severity": "high", "what": "y"}]
        a = audit(subject="ventures/a", date="2026-11-12", fix_prs=[self.URL], defects=high)
        a["_file"] = "2026-11-12-a.json"
        b = audit(subject="ventures/b", date="2026-11-08", fix_prs=[self.URL], defects=high)
        rows = m.reaudit_due([b, a], root=root)
        self.assertEqual([(r["subject"], r["documented_open"]) for r in rows], [("ventures/a", True), ("ventures/b", False)])
        self.assertFalse(m.documented_open(dict(a, subject="ventures/missing"), root))

    def test_fix_confirmation_separates_marked_from_assumed(self):
        marked = audit(subject="ventures/a", fix_prs=[self.URL],
                       defects=[{"severity": "high", "what": "y", "fixed_by": self.URL}, {"severity": "low", "what": "z"}])
        blanket = audit(subject="ventures/b", fix_prs=[self.URL],
                        defects=[{"severity": "low", "what": "x"}, {"severity": "medium", "what": "w"}])
        later = [audit(subject="ventures/c", date="2026-11-07", fix_prs=[self.URL]), audit(subject="ventures/c", date="2026-11-09")]
        f = m.fix_confirmation([marked, blanket] + later)
        self.assertEqual((f["explicit"], f["assumed"], f["open"]), (1, 2, 1))
        self.assertEqual((f["rechecked_after_fix"], f["awaiting_recheck"]), (1, 2))

    def test_kill_rate_moves_where_the_audit_share_cannot(self):
        mut = lambda caught: {"where": "calc.mjs:1", "change": "a -> b", "caught": caught}
        weak = audit(subject="ventures/a", mutations=[mut(True)] * 5 + [mut(False)])
        weaker = audit(subject="ventures/b", mutations=[mut(True)] + [mut(False)] * 5)
        self.assertEqual(m.mutation_outcome(weak), m.mutation_outcome(weaker))  # both "survived"
        self.assertEqual(m.mutation_kill([weak])["kill_rate"], 0.833)
        self.assertEqual(m.mutation_kill([weak, weaker]), {"mutants": 12, "killed": 6, "audits": 2, "kill_rate": 0.5,
                                                            "per_audit": 6.0})

    def test_bar_by_instrument_splits_prose_from_structured(self):
        mut = [{"where": "x:1", "change": "a -> b", "caught": True}]
        rows = [audit(subject="ventures/a"), audit(subject="ventures/b", mutations=mut),
                audit(subject="ventures/c", mutations=mut, drawn_by="census"),
                audit(subject="ventures/d", stratum="flagship")]
        b = m.bar_by_instrument(rows, q.meets_bar)
        self.assertEqual(b, {"prose": {"n": 1, "meets_bar": 1}, "structured": {"n": 1, "meets_bar": 1}})

    def test_reaudit_mode_drops_out_when_nothing_waits(self):
        modes = {m.mode_for("2026-11-11", seed=str(i), last_reflect="2026-11-10", reaudit_waiting=0)["mode"]
                 for i in range(200)}
        self.assertNotIn("reaudit", modes)
        self.assertIn("reaudit", {m.mode_for("2026-11-11", seed=str(i), last_reflect="2026-11-10", reaudit_waiting=3)["mode"]
                                  for i in range(200)})
        self.assertEqual(q.validate_audit(audit(drawn_by="reaudit")), [])


class CoverageTest(unittest.TestCase):
    POP = {"flagship": ["ventures/a"], "venture": ["ventures/a", "ventures/b", "ventures/c"],
           "research": ["research/r1", "research/r2"], "platform": ["platform/p"]}

    def test_coverage_counts_and_pace(self):
        audits = [audit(subject="ventures/b", date="2026-11-01"), audit(subject="research/r1", date="2026-11-02")]
        c = m.coverage(audits, self.POP, dt.date(2026, 11, 3))
        self.assertEqual(c["all"]["population"], 6)
        self.assertEqual(c["all"]["audited_ever"], 2)
        self.assertEqual(c["all"]["days_of_audits"], 2)
        self.assertEqual(c["all"]["days_to_first_full_pass"], 4)
        self.assertEqual(c["venture"]["audited_ever"], 1)

    def test_census_puts_never_audited_first_and_skips_flagships(self):
        audits = [audit(subject="ventures/b", date="2026-11-01")]
        picks = m.census(audits, self.POP, 4, "s")
        subjects = [p["subject"] for p in picks]
        self.assertNotIn("ventures/a", subjects)
        self.assertNotIn("ventures/b", subjects)  # four never-audited subjects come first
        self.assertEqual(picks, m.census(audits, self.POP, 4, "s"))
        self.assertEqual(m.census(audits, self.POP, 5, "s")[-1]["subject"], "ventures/b")

    def test_census_free_passes_over_subjects_an_open_pr_names(self):
        audits = [audit(subject="ventures/b", date="2026-11-01")]
        first = m.census(audits, self.POP, 1, "s")[0]["subject"]
        prs = [(901, f"quality: census {first} audit")]
        picks, skipped = m.census_free(audits, self.POP, 4, "s", prs)
        self.assertNotIn(first, [p["subject"] for p in picks])
        self.assertEqual(len(picks), 4)  # the next subject fills the gap
        self.assertEqual(skipped, [(first, prs)])
        self.assertEqual(m.census_free(audits, self.POP, 4, "s", [])[0], m.census(audits, self.POP, 4, "s"))


class ModeTest(unittest.TestCase):
    def test_reflection_is_forced_after_a_week(self):
        self.assertEqual(m.mode_for("2026-11-10", last_reflect=None)["mode"], "reflect")
        self.assertEqual(m.mode_for("2026-11-17", last_reflect="2026-11-10")["mode"], "reflect")
        self.assertNotEqual(m.mode_for("2026-11-11", last_reflect="2026-11-10")["mode"], "reflect")

    def test_draw_covers_every_mode_and_is_seeded(self):
        modes = {m.mode_for("2026-11-11", seed=str(i), last_reflect="2026-11-10")["mode"] for i in range(200)}
        self.assertEqual(modes, set(m.MODES))
        self.assertEqual(m.mode_for("2026-11-11", "x", "2026-11-10"), m.mode_for("2026-11-11", "x", "2026-11-10"))


class DetailSchemaTest(unittest.TestCase):
    def test_old_audits_need_no_detail(self):
        self.assertEqual(q.validate_audit(audit(date="2026-11-10", _file="2026-11-10-ai-bookkeeper.json")), [])

    def test_new_audits_need_checks_mutations_and_categories(self):
        bare = audit(date="2026-11-11", _file="2026-11-11-ai-bookkeeper.json",
                     defects=[{"severity": "low", "what": "x"}])
        errs = "\n".join(q.validate_audit(bare))
        for needle in ("checks must be a list", "mutations must be a list", "category", "'where'"):
            self.assertIn(needle, errs)
        good = audit(date="2026-11-11", _file="2026-11-11-ai-bookkeeper.json", **DETAILED)
        self.assertEqual(q.validate_audit(good), [])

    def test_detail_counts_are_enforced(self):
        thin = audit(date="2026-11-11", _file="2026-11-11-ai-bookkeeper.json",
                     **{**DETAILED, "checks": [check()], "mutations": DETAILED["mutations"][:1]})
        errs = "\n".join(q.validate_audit(thin))
        self.assertIn("at least 3 correctness checks", errs)
        self.assertIn("at least 8 checks", errs)
        self.assertIn("at least 2 mutations", errs)

    def test_detail_shape_is_checked_on_old_audits_when_present(self):
        bad = audit(checks=[{"dimension": "speed", "result": "ok"}], mutations=[{"where": "x"}])
        errs = "\n".join(q.validate_audit(bad))
        self.assertIn("checks[0].dimension", errs)
        self.assertIn("checks[0].result", errs)
        self.assertIn("mutations[0]", errs)


class DrawnByTest(unittest.TestCase):
    def test_census_audits_stay_out_of_the_sampled_share(self):
        rows = [audit(subject="ventures/a"), audit(subject="ventures/b", drawn_by="census", scores={**FULL, "claims": 1})]
        s = q.summarize(rows)
        self.assertEqual((s["sampled"]["n"], s["sampled"]["meets_bar"]), (1, 1))
        self.assertEqual(s["strata"]["venture"]["n"], 2)
        self.assertTrue(any("drawn_by" in e for e in q.validate_audit(audit(drawn_by="whim"))))


class RealCorpusTest(unittest.TestCase):
    def test_metrics_run_on_the_repository(self):
        audits = q.load_audits()
        out = m.metrics(audits, q.population(), dt.date(2026, 11, 10), q.meets_bar, q.wilson)
        self.assertEqual(out["subjects"], sum(v["n"] for v in q.summarize(audits)["strata"].values()))
        self.assertIn("Coverage of the repository", m.render_md(out))


class ChangesSinceTest(unittest.TestCase):
    """queue's 'changed since audit' note: a fix can land without fix_prs (PR #14329, photo-editing)."""

    def fake(self, log="", boundary_date=None, has_ref=True, shallow=None, added="", calls=None):
        def git(args):
            if calls is not None:
                calls.append(args)
            if args[:2] == ["log", "--diff-filter=A"]:
                return added
            if args[0] == "rev-parse" and args[1] == "--verify":
                return "abc\n" if has_ref else ""
            if args[:2] == ["rev-parse", "--git-path"]:
                return str(shallow) if shallow else ""
            if args[0] == "log" and args[1] == "-1":
                return (boundary_date or "") + "\n"
            if args[0] == "log":
                return log
            return ""
        return git

    def shallow_file(self, sha):
        import tempfile
        f = Path(tempfile.mkdtemp()) / "shallow"
        f.write_text(sha + "\n")
        return f

    def test_changed_drops_the_shallow_boundary_commit(self):
        log = "f1\tf596041\tquality: audit round 30 + photo-editing page fix (#14329)\nb0\tb0short\tboundary\n"
        out = m.changes_since("ventures/photo-editing", "2026-11-09",
                              git=self.fake(log, "2026-11-01", shallow=self.shallow_file("b0")))
        self.assertEqual(out["status"], "changed")
        self.assertEqual([c["sha"] for c in out["commits"]], ["f596041"])  # audit-round commits that touch the subject count

    def test_history_starting_after_the_audit_is_unknown(self):
        out = m.changes_since("ventures/x", "2026-11-07", git=self.fake("", "2026-11-10", shallow=self.shallow_file("b0")))
        self.assertEqual(out["status"], "unknown")
        self.assertIn("--shallow-since=2026-11-07", out["why"])

    def test_untouched_and_no_git(self):
        self.assertEqual(m.changes_since("ventures/x", "2026-11-07", git=self.fake(""))["status"], "untouched")
        self.assertEqual(m.changes_since("ventures/x", "2026-11-07", git=self.fake("", has_ref=False))["status"], "unknown")

    def test_the_audits_own_commit_is_not_a_change_since_it(self):
        calls = []
        out = m.changes_since("research/x", "2026-11-17", audit_path="portfolio/quality/audits/2026-11-17-x.json",
                              git=self.fake("", added="cens1\n", calls=calls))
        self.assertEqual(out["status"], "untouched")
        span = [c for c in calls if c[0] == "log" and "--" in c and c[-1] == "research/x"][0]
        self.assertIn("cens1..origin/main", span)  # starts after the census commit, not at the audit date
        self.assertFalse(any(a.startswith("--since") for a in span))

    def test_without_the_audits_commit_it_falls_back_to_the_date(self):
        calls = []
        m.changes_since("research/x", "2026-11-17", audit_path="portfolio/quality/audits/gone.json",
                        git=self.fake("", calls=calls))
        span = [c for c in calls if c[0] == "log" and c[-1] == "research/x"][0]
        self.assertIn("--since=2026-11-17 00:00", span)

    def test_deepen_fetches_back_to_the_oldest_audit_once(self):
        calls = []
        git = self.fake("", "2026-11-13", shallow=self.shallow_file("b0"))
        note = m.deepen_for("2026-11-07", m.dt.date(2026, 11, 14), git=git, git_run=lambda c: calls.append(c) or 0)
        self.assertEqual(calls, [["git", "fetch", "-q", "--shallow-since=2026-11-07", "origin", "main"]])
        self.assertIn("fetched main since 2026-11-07", note)

    def test_deepen_skips_complete_or_deep_enough_history_and_old_audits(self):
        never = lambda c: self.fail("fetched")
        self.assertEqual(m.deepen_for("2026-11-07", m.dt.date(2026, 11, 14), git=self.fake(""), git_run=never), "")
        deep = self.fake("", "2026-11-01", shallow=self.shallow_file("b0"))
        self.assertEqual(m.deepen_for("2026-11-07", m.dt.date(2026, 11, 14), git=deep, git_run=never), "")
        late = self.fake("", "2026-11-13", shallow=self.shallow_file("b0"))
        self.assertIn("not fetching", m.deepen_for("2026-09-01", m.dt.date(2026, 11, 14), git=late, git_run=never))

    def test_deepen_reports_a_failed_fetch(self):
        late = self.fake("", "2026-11-13", shallow=self.shallow_file("b0"))
        self.assertIn("failed", m.deepen_for("2026-11-07", m.dt.date(2026, 11, 14), git=late, git_run=lambda c: 128))


class OpenPrTest(unittest.TestCase):
    """queue marks rows an open PR already names: osrobot-pairprice was fixed twice in one morning
    and platform/agents read as unfixed while PR #14674 sat open (2026-11-14 run records)."""

    PRS = [(14674, "quality fix: platform/agents toJson writes shared references in full (control plane)"),
           (15746, "quality fix: osrobot-pairprice pays the drone pilot"),
           (15760, "ai-bookkeeper: (claim, work in progress)"),
           (15000, "platform/agents-extra: something else"),
           (15001, "research: osrobot-pairprice-v2 notes")]

    def test_names(self):
        self.assertEqual(m.subject_names("platform/agents"), ["platform/agents"])  # "agents" alone is too generic
        self.assertEqual(m.subject_names("research/osrobot-pairprice"), ["research/osrobot-pairprice", "osrobot-pairprice"])

    def test_matches_whole_names_only(self):
        self.assertEqual([n for n, _ in m.prs_naming("platform/agents", self.PRS)], [14674])
        self.assertEqual([n for n, _ in m.prs_naming("research/osrobot-pairprice", self.PRS)], [15746])
        self.assertEqual([n for n, _ in m.prs_naming("ventures/ai-bookkeeper", self.PRS)], [15760])
        self.assertEqual(m.prs_naming("ventures/agents", self.PRS), [])

    def test_pulls_list_first_newest_first_without_forks(self):
        own = {"full_name": "duncan-haywood/oss-monorepo"}
        pulls = [{"number": 5, "title": "a", "head": {"repo": own}},
                 {"number": 9, "title": "b", "head": {"repo": own}},
                 {"number": 7, "title": "fork", "head": {"repo": {"full_name": "x/oss-monorepo"}}}]
        self.assertEqual(m.open_pr_titles(pulls=lambda: pulls), [(9, "b"), (5, "a")])

    def test_search_pages_and_fails_soft(self):
        import subprocess
        pages = {1: "\n".join(f"{i}\tt{i}" for i in range(100)), 2: "7\tlast"}
        got = m.open_pr_titles(run=lambda p: subprocess.CompletedProcess([], 0, pages.get(p, ""), ""))
        self.assertEqual(len(got), 101)
        self.assertEqual(got[-1], (7, "last"))
        self.assertIsNone(m.open_pr_titles(run=lambda p: subprocess.CompletedProcess([], 1, "", "rate limited")))

        def boom(p):
            raise OSError("no gh")
        self.assertIsNone(m.open_pr_titles(run=boom))


if __name__ == "__main__":
    unittest.main()
