import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import research_log as rl  # noqa: E402

NEWEST_FIRST = """# Research log: x

Newest first.

## 2026-11-12 · Milestone 6zb: second
- b

## 2026-11-12 · Milestone 6za: first today
- a

## 2026-11-07 · Milestone 6z: older
- z

## 2026-11-03 · Milestone 6y: between
- y

## 2026-11-01 · Milestone 6z: much older, same label
- old
"""

OLDEST_FIRST = """## 2026-10-01 · Session 1: start
- one
## 2026-10-02 · Session 2: next
- two
"""


class Tests(unittest.TestCase):
    def test_newest_first_file(self):
        heads = [e[1] for e in rl.newest(NEWEST_FIRST, 2)]
        self.assertEqual(heads, ["2026-11-12 · Milestone 6zb: second", "2026-11-12 · Milestone 6za: first today"])

    def test_oldest_first_file(self):
        self.assertEqual(rl.newest(OLDEST_FIRST, 1)[0][1], "2026-10-02 · Session 2: next")

    def test_labels(self):
        self.assertEqual(rl.label("2026-11-12 · Milestone 6zp: is it"), ("Milestone", "6zp"))
        self.assertEqual(rl.label("Session 80, 2026-11-12: x"), ("Session", "80"))
        self.assertEqual(rl.label("2026-11-12 · M2 (part): x"), ("M", "2"))
        self.assertIsNone(rl.label("2026-11-12 · Voltage schedule (plan)"))

    def test_bump(self):
        for a, b in [("117", "118"), ("11h", "11i"), ("6zp", "6zq"), ("6z", "6za"), ("7az", "7aza")]:
            self.assertEqual(rl.bump(a), b)

    def test_next_free_skips_used(self):
        self.assertEqual(rl.next_free("11a", {"11a", "11b", "11c"}), "11d")

    def test_report(self):
        out = rl.labels_report(NEWEST_FIRST)
        self.assertIn("newest label: Milestone 6zb (2026-11-12)", out)
        self.assertIn("next free:    Milestone 6zc", out)
        self.assertIn("reused:       6z on 2026-11-01, 2026-11-07", out)

    def test_ref_labels_count(self):
        main = "## 2026-11-12 · Milestone 6zc: landed on main by a sibling\n"
        out = rl.labels_report(NEWEST_FIRST, main)
        self.assertIn("next free:    Milestone 6zd", out)

    def test_milestone_in_parts_not_a_reuse(self):
        t = ("## 2026-11-12 · M2 (part): c\n## 2026-11-07 · M2 (part): b\n"
             "## 2026-11-01 · M2 (part): a\n## 2026-10-20 · M1: start\n")
        self.assertEqual(rl.reuses([e[1] for e in rl.entries(t)]), {})

    def test_plan_and_outcome_not_a_reuse(self):
        t = "## 2026-11-12 · Milestone 5d outcome\n## 2026-11-11 · Milestone 5d plan\n"
        self.assertEqual(rl.reuses([e[1] for e in rl.entries(t)]), {})

    def test_hypotheses_next_free(self):
        log = ("## 2026-11-16 · Milestone 4s plan\n- **H104 (accuracy).** bar 2%\n"
               "- H105 (= H5) refuted above\n- H12-i: a sub-id counts as H12\n"
               "- Ran on an NVIDIA H100 GPU, which held up (not a hypothesis)\n"
               "- H5d-i held (milestone 5d's own numbering)\n")
        self.assertEqual(sorted(rl.hypotheses(log)), [5, 12, 104, 105])
        out = rl.labels_report(log)
        self.assertTrue(any(l.startswith("next free:    H106") for l in out), out)

    def test_hypotheses_need_hypothesis_wording(self):
        self.assertEqual(rl.hypotheses("Fit took H20 minutes on pool C\n"), {})

    def test_open_pr_adds_labels_and_hypotheses(self):
        base = "## 2026-11-15 · Milestone 3d\n- H100 held\n"
        pr = base + "## 2026-11-16 · Milestone 3e plan\n- **H101 (x).** bar 1\n- **H103 (y).** bar 2\n"
        self.assertEqual(rl.pr_lines([(7, pr)], base), ["open PR #7: labels 3e, H101-H103"])
        self.assertEqual(rl.pr_lines([(8, base)], base), [])
        out = rl.labels_report(base, pr)
        self.assertIn("next free:    Milestone 3f", out)
        self.assertTrue(any(l.startswith("next free:    H104") for l in out), out)

    def test_open_pr_logs_skips_own_fork_and_other_slugs(self):
        import pick_track as pt
        saved = (pt._open_pr_titles, dict(pt._HEADS), dict(pt._FORK), pt.is_own_pr)
        try:
            pt._open_pr_titles = lambda repo, limit: [
                (1, "research/sensing-selfcal: milestone 3e"), (2, "research/sensing-selfcal: fork"),
                (3, "research/sensing-selfcal-two: other"), (4, "research/sensing-selfcal: mine")]
            pt._HEADS.update({1: "a", 2: "b", 3: "c", 4: "d"})
            pt._FORK.update({1: False, 2: True, 3: False, 4: False})
            pt.is_own_pr = lambda n: n == 4
            got = rl.open_pr_logs("sensing-selfcal", fetch=lambda branch, slug: f"log of {branch}")
            self.assertEqual(got, [(1, "log of a")])
        finally:
            pt._open_pr_titles, pt.is_own_pr = saved[0], saved[3]
            pt._HEADS.clear(); pt._HEADS.update(saved[1]); pt._FORK.clear(); pt._FORK.update(saved[2])


CHAIN_LOG = """## 2026-11-18 · Milestone 6c: third knob
## 2026-11-17 · Milestone 6b: second knob
## 2026-11-17 · Milestone 6b: second knob, outcome
## 2026-11-16 · Paper step: DRAFT.md section 2 carries 6a
## 2026-11-15 · Milestone 6a: first knob
## 2026-11-14 · Milestone 6: the question
## 2026-11-10 · Milestone 5z: earlier number
"""


class ChainTest(unittest.TestCase):
    def test_counts_distinct_labels_under_newest_number(self):
        num, n, first, last, d0, d1, since = rl.chain(CHAIN_LOG)
        self.assertEqual((num, n, first, last), ("6", 4, "6", "6c"))
        self.assertEqual((d0, d1), ("2026-11-14", "2026-11-18"))
        self.assertEqual(since, 3)

    def test_model_term_paper_is_not_a_paper_step(self):
        text = "## 2026-11-15 · Milestone 11w: census paper weights\n## 2026-11-14 · Milestone 11v: x\n"
        self.assertIsNone(rl.chain(text)[6])
        self.assertIn("no paper/ directory", rl.chain_report(text, has_paper_dir=False)[1])

    def test_paper_colon_and_writing_step_headings_count(self):
        for head in ("Paper: Section 6.1, validity", "Paper sync: section 6 cites 36",
                     "Milestone 7y: certificate moves into the main text (a writing step, no experiment)"):
            text = f"## 2026-11-16 · Milestone 6c: knob\n## 2026-11-15 · {head}\n## 2026-11-14 · Milestone 6b: x\n"
            self.assertEqual(rl.chain(text)[6], 1, head)

    def test_too_few_labels(self):
        self.assertIsNone(rl.chain("## 2026-11-15 · Milestone 1: only\n"))


if __name__ == "__main__":
    unittest.main()
