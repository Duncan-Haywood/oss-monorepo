"""Tests for promptctl.py: routing, records, measurement and validation."""

from __future__ import annotations

import contextlib
import io
import json
import random
import tempfile
import unittest
from pathlib import Path

import promptctl


def _record(track="ventures", version=0, day="2026-10-12", outcome="success", **extra):
    rec = json.loads(json.dumps(promptctl.RECORD_FIELDS))
    rec.update({"date": day, "session": f"https://claude.ai/code/session_{day}",
                "track": track, "prompt_version": version, "outcome": outcome})
    rec.update(extra)
    return rec


class Fixture:
    """A throwaway repository holding a minimal, valid prompt system."""

    def __init__(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.repo = Path(self._tmp.name)
        self.root = self.repo / "prompts"
        (self.root / "runs").mkdir(parents=True)
        (self.repo / "prompt.md").write_text("Run `python3 prompts/promptctl.py route`.\n")
        for name in ("goals.md", "experiments.md", "README.md"):
            (self.root / name).write_text(f"# {name}\n")
        for track in ("ventures", "research", "review"):
            self.prompt(track, 0)
        self.routing({
            "review_every": 3,
            "tracks": {
                "ventures": {"weight": 1, "champion": 0, "candidate": None, "candidate_share": 0},
                "research": {"weight": 1, "champion": 0, "candidate": None, "candidate_share": 0},
                "review": {"weight": 0, "champion": 0, "candidate": None, "candidate_share": 0},
            },
        })

    def prompt(self, track: str, version: int, text: str = "Follow prompts/goals.md.\n") -> None:
        (self.root / track).mkdir(exist_ok=True)
        (self.root / track / f"prompt-{version}.md").write_text(text)

    def routing(self, data: dict) -> None:
        (self.root / "routing.json").write_text(json.dumps(data))

    def edit_routing(self, track: str, **changes) -> None:
        data = json.loads((self.root / "routing.json").read_text())
        data["tracks"][track].update(changes)
        self.routing(data)

    def run(self, name: str, rec: dict) -> None:
        (self.root / "runs" / name).write_text(json.dumps(rec))

    def close(self) -> None:
        self._tmp.cleanup()


class PromptTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.fx = Fixture()
        self.addCleanup(self.fx.close)


class RouteTest(PromptTestCase):
    def test_forced_track_uses_its_champion(self):
        r = promptctl.route(self.fx.root, track="research", rng=random.Random(0))
        self.assertEqual((r["track"], r["version"], r["role"]), ("research", 0, "champion"))
        self.assertEqual(r["path"], "prompts/research/prompt-0.md")
        self.assertEqual(r["trailer"], "Prompt-Version: research/0")

    def test_unknown_track_is_refused(self):
        with self.assertRaises(SystemExit):
            promptctl.route(self.fx.root, track="nope")

    def test_weighted_draw_never_picks_review_or_a_zero_weight_track(self):
        self.fx.edit_routing("research", weight=0)
        tracks = {promptctl.route(self.fx.root, rng=random.Random(seed))["track"] for seed in range(50)}
        self.assertEqual(tracks, {"ventures"})

    def test_weighted_draw_reaches_every_weighted_track(self):
        tracks = {promptctl.route(self.fx.root, rng=random.Random(seed))["track"] for seed in range(50)}
        self.assertEqual(tracks, {"ventures", "research"})

    def test_a_track_past_its_until_date_is_not_drawn(self):
        self.fx.edit_routing("research", until="2026-11-30")
        draw = lambda day: {promptctl.route(self.fx.root, rng=random.Random(seed),
                                            today=promptctl.date.fromisoformat(day))["track"]
                            for seed in range(50)}
        self.assertEqual(draw("2026-11-30"), {"ventures", "research"})
        self.assertEqual(draw("2026-12-01"), {"ventures"})
        self.assertEqual(promptctl.route(self.fx.root, track="research")["track"], "research")

    def test_review_is_due_after_review_every_runs(self):
        for i in range(3):
            self.fx.run(f"2026-10-0{i + 1}-s{i}.json", _record(day=f"2026-10-0{i + 1}"))
        r = promptctl.route(self.fx.root, rng=random.Random(0))
        self.assertEqual(r["track"], "review")
        self.assertIn("3 merged runs since the last review", r["reason"])

    def test_a_review_resets_the_count(self):
        for i in range(3):
            self.fx.run(f"2026-10-0{i + 1}-s{i}.json", _record(day=f"2026-10-0{i + 1}"))
        self.fx.run("2026-10-05-rev.json", _record(track="review", day="2026-10-05"))
        self.assertEqual(promptctl.runs_since_review(promptctl.load_runs(self.fx.root)), 0)
        self.assertNotEqual(promptctl.route(self.fx.root, rng=random.Random(0))["track"], "review")

    def test_mirrored_upstream_records_do_not_make_a_review_due(self):
        self.fx.run("2026-10-01-a.json", _record(day="2026-10-01"))
        mirrored = _record(day="2026-10-02")
        mirrored["source"] = "oss-research-monorepo prompts/runs.jsonl"
        self.fx.run("2026-10-02-b.json", mirrored)
        self.assertEqual(promptctl.runs_since_review(promptctl.load_runs(self.fx.root)), 1)

    def test_same_day_records_count_in_landing_order(self):
        import subprocess
        git = lambda *a: subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t", *a],
                                        cwd=self.fx.repo, check=True, capture_output=True)
        git("init", "-q")
        # File names sort opposite to landing order: the review landed first.
        for name, track in [("z-review.json", "review"), ("a-run1.json", "ventures"),
                            ("m-run2.json", "ventures")]:
            self.fx.run(name, _record(track=track, day="2026-10-05"))
            git("add", "-A")
            git("commit", "-qm", name)
        self.assertEqual(promptctl.runs_since_review(promptctl.load_runs(self.fx.root)), 2)

    def test_a_due_review_goes_to_a_share_of_runs(self):
        for i in range(3):
            self.fx.run(f"2026-10-0{i + 1}-s{i}.json", _record(day=f"2026-10-0{i + 1}"))
        data = json.loads((self.fx.root / "routing.json").read_text())
        data["review_when_due"] = 0.25
        self.fx.routing(data)
        picks = [promptctl.route(self.fx.root, rng=random.Random(s))["track"] for s in range(200)]
        self.assertTrue(20 < picks.count("review") < 80, picks.count("review"))
        data["review_when_due"] = 0
        self.fx.routing(data)
        self.assertTrue(any("review_when_due" in e for e in promptctl.validate(self.fx.root)))

    def test_task_text_picks_the_track_it_names(self):
        for seed in range(20):
            r = promptctl.route(self.fx.root, rng=random.Random(seed),
                                task="develop, deploy and sell revenue generating software products")
            self.assertEqual(r["track"], "ventures")
        r = promptctl.route(self.fx.root, rng=random.Random(0), track="research", task="revenue")
        self.assertEqual(r["track"], "research")  # an explicit --track wins over the text

    def test_task_text_without_a_hint_leaves_the_draw(self):
        a = promptctl.route(self.fx.root, rng=random.Random(3), task="tidy up")
        b = promptctl.route(self.fx.root, rng=random.Random(3))
        self.assertEqual(a["track"], b["track"])

    def test_skip_review_routes_to_work_when_a_review_is_claimed(self):
        for i in range(3):
            self.fx.run(f"2026-10-0{i + 1}-s{i}.json", _record(day=f"2026-10-0{i + 1}"))
        r = promptctl.route(self.fx.root, skip_review=True, rng=random.Random(0))
        self.assertNotEqual(r["track"], "review")

    def test_candidate_share_splits_runs(self):
        self.fx.prompt("ventures", 1)
        self.fx.edit_routing("ventures", candidate=1, candidate_share=1.0)
        r = promptctl.route(self.fx.root, track="ventures", rng=random.Random(0))
        self.assertEqual((r["version"], r["role"]), (1, "candidate"))
        self.fx.edit_routing("ventures", candidate_share=0.0)
        r = promptctl.route(self.fx.root, track="ventures", rng=random.Random(0))
        self.assertEqual((r["version"], r["role"]), (0, "champion"))


class RecordTest(PromptTestCase):
    def test_record_writes_a_skeleton_that_validate_rejects_until_filled_in(self):
        path = promptctl.record(self.fx.root, "research", 0,
                                "https://claude.ai/code/session_abc", model="m", text="hi",
                                day="2026-10-12")
        self.assertEqual(path.name, "2026-10-12-session_abc.json")
        rec = json.loads(path.read_text())
        self.assertEqual(rec["input_sha256"],
                         "8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4")
        self.assertEqual(set(rec), set(promptctl.RECORD_FIELDS))
        self.assertTrue(any("outcome must be one of" in e for e in promptctl.validate(self.fx.root)))
        rec["outcome"] = "success"
        path.write_text(json.dumps(rec))
        self.assertEqual(promptctl.validate(self.fx.root), [])

    def test_a_successful_record_from_the_cutoff_date_must_name_its_pr(self):
        path = promptctl.record(self.fx.root, "research", 0, "https://x/session_abc", day="2026-10-19")
        rec = json.loads(path.read_text())
        rec["outcome"] = "success"
        path.write_text(json.dumps(rec))
        self.assertTrue(any("names its pull request" in e for e in promptctl.validate(self.fx.root)))
        rec["pr"] = "123"
        path.write_text(json.dumps(rec))
        self.assertEqual(promptctl.validate(self.fx.root), [])

    def test_mirrored_upstream_line_with_no_date_or_session_is_valid_but_a_native_one_is_not(self):
        path = promptctl.record(self.fx.root, "research", 0, "https://x/session_abc", day="2026-10-12")
        rec = json.loads(path.read_text())
        rec.update(outcome="success", date=None, session=None)
        path.write_text(json.dumps(rec))
        self.assertTrue(any("date must be" in e for e in promptctl.validate(self.fx.root)))
        rec["source"] = promptctl.MIRRORED_RUNS_SOURCE
        path.write_text(json.dumps(rec))
        self.assertEqual(promptctl.validate(self.fx.root), [])

    def test_record_refuses_a_version_with_no_prompt_file(self):
        with self.assertRaises(SystemExit):
            promptctl.record(self.fx.root, "research", 7, "https://x/session_abc")

    def test_record_repo_is_stored_and_validated(self):
        path = promptctl.record(self.fx.root, "research", 0, "https://x/s2", day="2026-10-12",
                                repo="duncan-haywood/oss-research-monorepo")
        rec = json.loads(path.read_text())
        self.assertEqual(rec["repo"], "duncan-haywood/oss-research-monorepo")
        rec.update(outcome="success")
        path.write_text(json.dumps(rec))
        self.assertEqual(promptctl.validate(self.fx.root), [])
        rec["repo"] = "not a repo"
        path.write_text(json.dumps(rec))
        self.assertTrue(any("repo must be" in e for e in promptctl.validate(self.fx.root)))

    def test_record_stamps_ended_so_reviews_can_order_records(self):
        path = promptctl.record(self.fx.root, "research", 0, "https://x/s3", day="2026-10-12")
        self.assertRegex(json.loads(path.read_text())["ended"], r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$")

    def test_record_never_overwrites(self):
        promptctl.record(self.fx.root, "research", 0, "https://x/s1", day="2026-10-12")
        with self.assertRaises(SystemExit):
            promptctl.record(self.fx.root, "research", 0, "https://x/s1", day="2026-10-12")


class ValidateTest(PromptTestCase):
    def assertError(self, fragment: str) -> None:
        errors = promptctl.validate(self.fx.root)
        self.assertTrue(any(fragment in e for e in errors), errors)

    def test_minimal_system_is_valid(self):
        self.assertEqual(promptctl.validate(self.fx.root), [])

    def test_until_must_be_a_date(self):
        self.fx.edit_routing("research", until="soon")
        self.assertError("until must be a YYYY-MM-DD date")

    def test_overlong_post_description_is_reported(self):
        ci = self.fx.repo / "platform" / "ci"
        ci.mkdir(parents=True)
        real = Path(__file__).resolve().parents[1] / "platform" / "ci" / "check_post_frontmatter.py"
        (ci / real.name).write_text(real.read_text())
        posts = self.fx.repo / "docs" / "posts"
        posts.mkdir(parents=True)
        (posts / "2020-01-01-a.md").write_text(
            f'---\ntitle: T\ndate: 2020-01-01\ndescription: "{"x" * 161}"\ntags: [a]\n---\n')
        self.assertError("docs/posts/2020-01-01-a.md: description is 161")

    def test_master_prompt_must_route(self):
        (self.fx.repo / "prompt.md").write_text("do whatever\n")
        self.assertError("prompt.md must exist")

    def test_champion_file_must_exist(self):
        self.fx.edit_routing("research", champion=4)
        self.assertError("research: champion must name")

    def test_candidate_must_differ_and_share_must_be_zero_without_one(self):
        self.fx.edit_routing("ventures", candidate=0)
        self.assertError("candidate and champion are the same version")
        self.fx.edit_routing("ventures", candidate=None, candidate_share=0.2)
        self.assertError("candidate_share must be 0")

    def test_every_prompt_version_links_to_goals(self):
        self.fx.prompt("ventures", 1, "No guardrails here.\n")
        self.assertError("prompts/ventures/prompt-1.md: must link to prompts/goals.md")

    def test_stray_file_in_a_track_is_flagged(self):
        (self.fx.root / "ventures" / "draft.md").write_text("x goals.md\n")
        self.assertError("prompt files are named prompt-<n>.md")

    def test_needs_a_working_track(self):
        self.fx.edit_routing("ventures", weight=0)
        self.fx.edit_routing("research", weight=0)
        self.assertError("at least one non-review track needs a positive weight")

    def test_bad_records_are_named(self):
        self.fx.run("2026-10-12-a.json", _record(track="nope"))
        self.fx.run("2026-10-12-b.json", _record(version=9))
        self.fx.run("2026-10-11-c.json", _record(day="2026-10-12"))
        self.fx.run("2026-10-12-d.json", _record(doc_friction=["just a string"]))
        self.fx.run("2026-10-12-e.json", _record(merged="yes"))
        (self.fx.root / "runs" / "2026-10-12-f.json").write_text("{not json")
        (self.fx.root / "runs" / "notes.txt").write_text("x")
        errors = "\n".join(promptctl.validate(self.fx.root))
        for fragment in ("unknown track 'nope'", "no prompt file for ventures/9",
                         "must start with the record's date", "needs a 'file' and an 'issue'",
                         "merged must be true, false or null", "invalid JSON",
                         "run records are .json files"):
            self.assertIn(fragment, errors)


class MeasureTest(PromptTestCase):
    def test_wilson_interval(self):
        self.assertEqual(promptctl.wilson(0, 0), (0.0, 1.0))
        low, high = promptctl.wilson(8, 10)
        self.assertAlmostEqual(low, 0.4902, places=3)
        self.assertAlmostEqual(high, 0.9433, places=3)

    def test_filter_sections_keeps_only_matching_titles(self):
        text = "# Title\n\n## One\na\n\n## Two friction\nb\n"
        self.assertEqual(promptctl.filter_sections(text, "FRICTION"), "## Two friction\nb\n".rstrip("\n"))
        self.assertEqual(promptctl.filter_sections(text, None), text)
        with self.assertRaises(SystemExit):
            promptctl.filter_sections(text, "missing")

    def test_measure_groups_by_version_model_and_friction(self):
        friction = [{"file": "CLAUDE.md", "issue": "stale command"}]
        self.fx.run("2026-10-12-a.json", _record(day="2026-10-01", model="m1", merged=True,
                                                  doc_friction=friction))
        self.fx.run("2026-10-02-b.json", _record(day="2026-10-02", model="m1", outcome="failed",
                                                  merged=False, errors=["ci red"]))
        self.fx.run("2026-10-03-c.json", _record(track="research", day="2026-10-03", model="m2",
                                                  integrity_issues=["bad cite"]))
        m = promptctl.measure(self.fx.root)
        v = m["by_version"]["ventures/0"]
        self.assertEqual((v["runs"], v["success"], v["leaked"], v["errors_per_run"]), (2, 1, 1, 0.5))
        self.assertEqual(m["by_version"]["research/0"]["integrity_issues"], 1)
        self.assertEqual(m["by_model"]["ventures m1"]["runs"], 2)
        self.assertEqual(m["doc_friction"]["CLAUDE.md"]["reports"], 1)
        self.assertEqual(m["since_review"], 3)

    def test_measure_ignores_no_friction_reports(self):
        friction = [{"file": "CLAUDE.md", "issue": "none significant; picking took a while"},
                    {"file": "CLAUDE.md", "issue": "No friction."},
                    {"file": "CLAUDE.md", "issue": "none of the listed commands exist"},
                    {"file": "CLAUDE.md", "issue": "stale command"}]
        self.fx.run("2026-10-12-a.json", _record(day="2026-10-01", doc_friction=friction))
        m = promptctl.measure(self.fx.root)
        self.assertEqual(m["doc_friction"]["CLAUDE.md"]["reports"], 2)

    def test_measure_hides_friction_the_reporting_run_fixed(self):
        friction = [{"file": "CLAUDE.md", "issue": "stale command; fixed here."},
                    {"file": "CLAUDE.md", "issue": "flag unmentioned (fixed)"},
                    {"file": "CLAUDE.md", "issue": "plots nothing; not fixed here"},
                    {"file": "CLAUDE.md", "issue": "stale command"}]
        self.fx.run("2026-10-12-a.json", _record(day="2026-10-01", doc_friction=friction))
        m = promptctl.measure(self.fx.root)
        self.assertEqual(m["doc_friction"]["CLAUDE.md"]["reports"], 2)

    def test_friction_listing_drops_reports_older_than_the_fresh_window(self):
        import contextlib, io
        self.fx.run("2026-10-01-a.json", _record(day="2026-10-01", doc_friction=[{"file": "CLAUDE.md", "issue": "ancient"}]))
        self.fx.run("2026-10-20-a.json", _record(day="2026-10-20", doc_friction=[{"file": "CLAUDE.md", "issue": "recent"}]))
        m = promptctl.measure(self.fx.root)
        self.assertEqual(m["doc_friction"]["CLAUDE.md"]["reports"], 2)
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            promptctl.print_measure(m)
        self.assertNotIn("ancient", out.getvalue())
        self.assertIn("recent", out.getvalue())

    def test_friction_listing_marks_files_that_no_longer_exist(self):
        import contextlib, io
        self.fx.run("2026-10-20-a.json", _record(day="2026-10-20", doc_friction=[{"file": "research/gone/deleted_file.py", "issue": "tests red"}]))
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            promptctl.print_measure(promptctl.measure(self.fx.root))
        self.assertIn("deleted_file.py` (file no longer exists): 1 report(s), 0 live", out.getvalue())

    def test_friction_listing_truncates_long_reports(self):
        import contextlib, io
        long = "x" * 500
        self.fx.run("2026-10-20-a.json", _record(day="2026-10-20", doc_friction=[{"file": "CLAUDE.md", "issue": long}]))
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            promptctl.print_measure(promptctl.measure(self.fx.root))
        self.assertNotIn("x" * 300, out.getvalue())
        self.assertIn("x" * 150, out.getvalue())

    def test_verdict_rules(self):
        champ = {"runs": 20, "success_rate": 0.5, "integrity_issues": 0,
                 "success_ci95": [0.3, 0.7]}
        few = dict(champ, runs=5)
        self.assertIn("keep collecting", promptctl.verdict(champ, few))
        worse = dict(champ, integrity_issues=1)
        self.assertIn("retire", promptctl.verdict(champ, worse))
        better = dict(champ, success_rate=0.85, success_ci95=[0.64, 0.95])
        self.assertIn("promote", promptctl.verdict(champ, better))
        lower = dict(champ, success_rate=0.2, success_ci95=[0.08, 0.42])
        self.assertIn("retire", promptctl.verdict(champ, lower))
        self.assertIn("overlap", promptctl.verdict(champ, dict(champ)))


class RepositoryTest(unittest.TestCase):
    def test_the_real_prompt_system_is_valid(self):
        self.assertEqual(promptctl.validate(promptctl.ROOT), [])

    def test_the_real_router_runs(self):
        r = promptctl.route(promptctl.ROOT, rng=random.Random(0))
        self.assertTrue((promptctl.ROOT.parent / r["path"]).is_file())

    def test_free_choice_gets_about_five_percent(self):
        # The owner's request: about 5% of effort is the agent's own choice.
        tracks = promptctl.load_routing(promptctl.ROOT)["tracks"]
        weights = {t: float(c["weight"]) for t, c in tracks.items() if t != promptctl.REVIEW}
        self.assertAlmostEqual(weights["explore"] / sum(weights.values()), 0.05, places=3)

    def test_creative_work_gets_about_ten_percent(self):
        # The owner, 2026-10-21: a portion of the scheduled fleet operates the
        # creative projects (prompts/creative/prompt-0.md).
        tracks = promptctl.load_routing(promptctl.ROOT)["tracks"]
        weights = {t: float(c["weight"]) for t, c in tracks.items() if t != promptctl.REVIEW}
        self.assertAlmostEqual(weights["creative"] / sum(weights.values()), 0.10, places=3)

    def test_polish_gets_about_five_percent_for_a_period(self):
        # The owner, 2026-10-28: "like 5% of work going to making the sites
        # looking as impressive as possible. for some period of time", plus SEO and AEO.
        tracks = promptctl.load_routing(promptctl.ROOT)["tracks"]
        weights = {t: float(c["weight"]) for t, c in tracks.items() if t != promptctl.REVIEW}
        self.assertAlmostEqual(weights["polish"] / sum(weights.values()), 0.05, places=3)
        self.assertTrue(tracks["polish"].get("until"))




class SystemMapTest(PromptTestCase):
    """prompts/system.json: every guidance file has a layer (prompts/SYSTEM.md)."""

    def system(self, docs, **extra) -> None:
        data = {"layers": [{"id": "goals", "question": "?"}, {"id": "entry", "question": "?"},
                           {"id": "area", "question": "?"}],
                "changed_by": ["owner", "review", "any"], "docs": docs,
                "guidance_patterns": ["prompt.md", "**/CLAUDE.md"], "ignore": ["**/fixtures/**"]}
        data.update(extra)
        (self.fx.root / "system.json").write_text(json.dumps(data))

    def entry(self, **doc):
        return {"layer": "entry", "changed_by": "review", "answers": "x", **doc}

    def test_no_map_is_not_an_error(self):
        self.assertEqual(promptctl.validate_system(self.fx.root), [])

    def test_a_mapped_tree_is_valid(self):
        (self.fx.repo / "ventures" / "a").mkdir(parents=True)
        (self.fx.repo / "ventures" / "a" / "CLAUDE.md").write_text("notes\n")
        self.system([self.entry(path="prompt.md"),
                     {"glob": "ventures/*/CLAUDE.md", "layer": "area", "changed_by": "any", "answers": "x"}])
        self.assertEqual(promptctl.validate_system(self.fx.root), [])

    def test_an_unmapped_guidance_file_fails(self):
        (self.fx.repo / "research" / "deep" / "p").mkdir(parents=True)
        (self.fx.repo / "research" / "deep" / "p" / "CLAUDE.md").write_text("notes\n")
        self.system([self.entry(path="prompt.md")])
        errors = promptctl.validate_system(self.fx.root)
        self.assertEqual(len(errors), 1)
        self.assertIn("research/deep/p/CLAUDE.md", errors[0])

    def test_ignored_paths_are_not_guidance(self):
        (self.fx.repo / "x" / "fixtures" / "repo").mkdir(parents=True)
        (self.fx.repo / "x" / "fixtures" / "repo" / "CLAUDE.md").write_text("bait\n")
        self.system([self.entry(path="prompt.md")])
        self.assertEqual(promptctl.validate_system(self.fx.root), [])

    def test_bad_entries_fail(self):
        self.system([self.entry(path="prompt.md"), self.entry(path="gone.md"),
                     self.entry(path="prompt.md"), {"path": "prompt.md", "glob": "x", "layer": "entry"},
                     self.entry(path="prompts/goals.md", layer="nowhere", budget=0, answers=""),
                     {"path": "prompts/README.md", "layer": "goals", "changed_by": "review", "answers": "x"}])
        text = "\n".join(promptctl.validate_system(self.fx.root))
        for needle in ("gone.md does not exist", "listed twice", "exactly one of path or glob",
                       "layer 'nowhere'", "budget must be", "which question", "belongs to the owner"):
            self.assertIn(needle, text)

    def test_glob(self):
        self.assertTrue(promptctl.glob_re("**/CLAUDE.md").match("CLAUDE.md"))
        self.assertTrue(promptctl.glob_re("**/CLAUDE.md").match("a/b/CLAUDE.md"))
        self.assertFalse(promptctl.glob_re("ventures/*/CLAUDE.md").match("ventures/a/b/CLAUDE.md"))
        self.assertTrue(promptctl.glob_re("**/fixtures/**").match("v/t/fixtures/r/AGENTS.md"))
        self.assertFalse(promptctl.glob_re("prompt.md").match("prompt.mdx"))

    def test_the_real_map_feeds_measure(self):
        self.assertIn("CLAUDE.md", promptctl.INSTRUCTION_FILES)
        self.assertIn("prompts/goals.md", promptctl.INSTRUCTION_FILES)
        self.assertEqual(promptctl.budget_for("prompts/ventures/prompt-9.md"), promptctl.SUBPROMPT_BUDGET)


class RedteamTest(PromptTestCase):
    def _with_redteam(self, weight):
        data = json.loads((self.fx.root / "routing.json").read_text())
        self.fx.prompt("redteam", 0)
        data["tracks"]["redteam"] = {"weight": weight, "champion": 0, "candidate": None,
                                     "candidate_share": 0}
        self.fx.routing(data)

    def test_share_outside_five_to_ten_percent_warns_but_validates(self):
        self._with_redteam(0.15)  # 0.15 / 2.15 = 7.0%
        self.assertEqual(promptctl.validate(self.fx.root), [])
        self.assertIsNone(promptctl.redteam_band_warning(self.fx.root))
        for weight in (0.05, 0.5):  # 2.4% and 20%
            self._with_redteam(weight)
            self.assertEqual(promptctl.validate(self.fx.root), [])
            self.assertIn("redteam is", promptctl.redteam_band_warning(self.fx.root))

    def test_redteam_records_are_checked_and_measured(self):
        self._with_redteam(0.15)
        mutant = {"line": 3, "operator": "eq-flip", "caught": False, "triage": "gap",
                  "caught_after_fix": True}
        rt = {"campaigns": [{"target": "a.mjs", "mutants": [
            mutant, {**mutant, "caught": True, "triage": None},
            {**mutant, "triage": "equivalent", "caught_after_fix": None}]}],
            "real_defects": [{"file": "a.mjs", "issue": "x", "patched": True}]}
        self.fx.run("2026-10-12-a.json", _record(track="redteam", redteam=rt))
        self.assertEqual(promptctl.validate(self.fx.root), [])
        m = promptctl.measure(self.fx.root)["redteam"]
        self.assertEqual((m["seeded"], m["caught"], m["escaped"], m["equivalent"]), (3, 1, 1, 1))
        self.assertEqual((m["catch_rate"], m["catch_rate_after_fix"]), (0.5, 1.0))
        self.assertEqual((m["real_defects"], m["real_defects_patched"]), (1, 1))

        bad = json.loads(json.dumps(rt))
        bad["campaigns"][0]["mutants"][1]["triage"] = "equivalent"
        self.fx.run("2026-10-12-a.json", _record(track="redteam", redteam=bad))
        self.assertTrue(any("cannot be 'equivalent'" in e for e in promptctl.validate(self.fx.root)))
        bad["campaigns"][0]["mutants"][1] = {"line": 1, "operator": "x", "caught": "yes"}
        self.fx.run("2026-10-12-a.json", _record(track="redteam", redteam=bad))
        self.assertTrue(any("boolean 'caught'" in e for e in promptctl.validate(self.fx.root)))


def _item(iid="P001", status="open", owner="agent", effect=2, cost=1, **extra):
    item = {"id": iid, "title": f"item {iid}", "status": status, "owner": owner,
            "problem": "p", "evidence": ["source"], "change": "c", "metric": "m",
            "effect": effect, "cost": cost, "opened": "2026-10-15", "pr": None, "result": None}
    item.update(extra)
    return item


class BacklogTest(PromptTestCase):
    def put(self, name: str, item: dict) -> None:
        folder = self.fx.root / "process" / "backlog"
        folder.mkdir(parents=True, exist_ok=True)
        (folder / name).write_text(json.dumps(item))

    def test_valid_items_pass_and_rank_by_effect_over_cost_agent_first(self):
        self.put("P001-a.json", _item("P001", effect=3, cost=3))
        self.put("P002-b.json", _item("P002", effect=2, cost=1))
        self.put("P003-c.json", _item("P003", owner="owner", effect=3, cost=1))
        self.put("P004-d.json", _item("P004", status="done", pr="https://example/1"))
        self.assertEqual(promptctl.validate(self.fx.root), [])
        items = [i for _, i in promptctl.load_backlog(self.fx.root)]
        self.assertEqual([i["id"] for i in promptctl.backlog_rank(items)], ["P002", "P001", "P003"])
        summary = promptctl.measure(self.fx.root)["backlog"]
        self.assertEqual(summary["counts"]["done"], 1)
        self.assertEqual(summary["done_unverified"], ["P004"])

    def test_backlog_flags_blocked_items_and_points_to_critique(self):
        self.put("P001-a.json", dict(_item("P001"), change="Blocked on P018 step 2. Then do x."))
        self.assertTrue(promptctl.backlog_blocked(_item("P001", change="blocked on y")))
        self.assertFalse(promptctl.backlog_blocked(_item("P002")))
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            promptctl.print_backlog(self.fx.root)
        self.assertIn("(blocked)", buf.getvalue())
        self.assertIn("Critique mode", buf.getvalue())

    def test_bad_items_are_refused(self):
        cases = [
            ("P001-a.json", _item("P001", status="maybe"), "status must be"),
            ("P001-a.json", _item("P002"), "file name must start"),
            ("P001-a.json", _item("P001", effect=5), "effect must be"),
            ("P001-a.json", _item("P001", evidence=[]), "evidence must be"),
            ("P001-a.json", _item("P001", status="done"), "names the pull request"),
            ("P001-a.json", _item("P001", status="dropped"), "says why"),
        ]
        for name, item, message in cases:
            self.put(name, item)
            errors = promptctl.validate(self.fx.root)
            self.assertTrue(any(message in e for e in errors), (message, errors))

    def test_duplicate_ids_are_refused(self):
        self.put("P001-a.json", _item("P001"))
        self.put("P001-b.json", _item("P001"))
        self.assertTrue(any("also used by" in e for e in promptctl.validate(self.fx.root)))


class DeviationTest(PromptTestCase):
    def test_deviations_are_checked_and_grouped_by_file(self):
        dev = {"file": "CLAUDE.md", "instruction": "x", "did": "y", "why": "z", "result": "ok"}
        self.fx.run("2026-10-12-a.json", _record(deviations=[dev]))
        self.assertEqual(promptctl.validate(self.fx.root), [])
        self.assertEqual(promptctl.measure(self.fx.root)["deviations"]["CLAUDE.md"]["reports"], 1)
        self.fx.run("2026-10-12-a.json", _record(deviations=[{"file": "CLAUDE.md"}]))
        self.assertTrue(any("deviations must" in e for e in promptctl.validate(self.fx.root)))

    def test_old_records_without_the_field_stay_valid(self):
        rec = _record()
        del rec["deviations"]
        self.fx.run("2026-10-12-a.json", rec)
        self.assertEqual(promptctl.validate(self.fx.root), [])


class WriteupTest(PromptTestCase):
    def test_writeups_are_checked_and_counted_from_the_start_date(self):
        ups = ["docs/reports/2026-10-21-x-for-agents.md", "docs/posts/2026-10-21-x.md"]
        self.fx.run("2026-10-20-a.json", _record(date="2026-10-20", pr="1", writeups=ups))
        self.fx.run("2026-10-21-b.json", _record(date="2026-10-21", pr="1", writeups=ups))
        self.fx.run("2026-10-21-c.json", _record(date="2026-10-21", pr="1", writeups=ups[1:]))
        self.assertEqual(promptctl.validate(self.fx.root), [])
        self.assertEqual(promptctl.measure(self.fx.root)["writeups"],
                         {"runs": 2, "agent_doc": 1, "post": 2})
        self.fx.run("2026-10-21-c.json", _record(date="2026-10-21", pr="1", writeups="docs/posts/x.md"))
        self.assertTrue(any("writeups must" in e for e in promptctl.validate(self.fx.root)))

    def test_posts_per_day_counts_filename_dates_up_to_the_newest(self):
        posts = self.fx.repo / "docs" / "posts"
        posts.mkdir(parents=True)
        for name in ("2026-10-20-a.md", "2026-10-22-b.md", "2026-10-22-c.md", "notes.md"):
            (posts / name).write_text("x\n")
        self.assertEqual(promptctl.posts_per_day(self.fx.root, days=4),
                         [("2026-10-19", 0), ("2026-10-20", 1), ("2026-10-21", 0), ("2026-10-22", 2)])


class BackfillPrTest(unittest.TestCase):
    def test_pr_number_comes_from_the_squash_subject(self):
        import subprocess
        with tempfile.TemporaryDirectory() as d:
            repo = Path(d)
            root = repo / "prompts"
            (root / "runs").mkdir(parents=True)
            git = lambda *a: subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t", *a],
                                            cwd=repo, check=True, capture_output=True)
            git("init", "-q")
            (root / "runs" / "a.json").write_text(json.dumps({"pr": None}))
            (root / "runs" / "b.json").write_text(json.dumps({"pr": "5"}))
            git("add", "-A")
            git("commit", "-qm", "redteam: x (#123)")
            self.assertEqual(promptctl.backfill_prs(root, write=False), [("a.json", "123")])
            promptctl.backfill_prs(root)
            self.assertEqual(json.loads((root / "runs" / "a.json").read_text())["pr"], "123")
            self.assertEqual(json.loads((root / "runs" / "b.json").read_text())["pr"], "5")


if __name__ == "__main__":
    unittest.main()


class MeasureToleratesFreeTextEntriesTest(unittest.TestCase):
    def test_newest_orders_by_time_not_file_order(self):
        got = promptctl._newest(["2026-10-18T00:20: c", "2026-10-17T00:38: a", "undated", "2026-10-17T09:00: b"], 3)
        self.assertEqual(got, ["2026-10-17T00:38: a", "2026-10-17T09:00: b", "2026-10-18T00:20: c"])

    def test_flag_stale_marks_reports_older_than_the_file_change(self):
        self.assertEqual(promptctl._flag_stale("2026-10-15: x", "2026-10-16"), "[file changed since] 2026-10-15: x")
        self.assertEqual(promptctl._flag_stale("2026-10-16: x", "2026-10-16"), "2026-10-16: x")
        self.assertEqual(promptctl._flag_stale("no date: x", "2026-10-16"), "no date: x")
        self.assertEqual(promptctl._flag_stale("2026-10-15: x", ""), "2026-10-15: x")
        # a timestamped report is compared to the commit time, so same-day reports can be told apart
        self.assertEqual(promptctl._flag_stale("2026-10-17T09:00: x", "2026-10-17T12:00:00+00:00"),
                         "[file changed since] 2026-10-17T09:00: x")
        self.assertEqual(promptctl._flag_stale("2026-10-17T13:00: x", "2026-10-17T12:00:00+00:00"),
                         "2026-10-17T13:00: x")

    def test_changed_note_ignores_the_shallow_boundary(self):
        from unittest import mock
        run = mock.Mock(return_value=mock.Mock(stdout="abc123 2026-10-20T04:30:00+00:00\n"))
        with mock.patch.object(promptctl.subprocess, "run", run), \
                mock.patch.object(promptctl, "_shallow_boundary", return_value={"abc123"}):
            note, changed = promptctl._changed_note("CLAUDE.md")
        self.assertEqual(changed, "")
        self.assertIn("shallow-clone edge", note)
        with mock.patch.object(promptctl.subprocess, "run", run), \
                mock.patch.object(promptctl, "_shallow_boundary", return_value=set()):
            self.assertEqual(promptctl._changed_note("CLAUDE.md")[1], "2026-10-20T04:30:00+00:00")

    def test_latest_and_named_files(self):
        self.assertEqual(promptctl._latest("", "2026-10-17"), "2026-10-17")
        self.assertEqual(promptctl._latest("2026-10-18", "2026-10-17"), "2026-10-18")
        self.assertEqual(promptctl._latest("2026-10-18", ""), "2026-10-18")
        self.assertEqual(promptctl._named_files_changed("no path here"), "")
        self.assertEqual(promptctl._named_files_changed("nonexistent/zzz.py broke"), "")
        from unittest import mock
        with mock.patch.object(promptctl, "_shallow_boundary", return_value=set()):  # shallow clones know no dates
            self.assertTrue(promptctl._named_files_changed("prompts/promptctl.py is long"))

    def test_string_friction_and_deviation_entries_do_not_crash(self):
        import tempfile, json
        from pathlib import Path
        import promptctl
        real = promptctl.measure(promptctl.ROOT)
        self.assertIn("doc_friction", real)
