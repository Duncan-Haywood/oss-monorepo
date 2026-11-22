"""research/_homepage/build.py's summary paragraphs.

Until 2026-11-18 a research project page printed its whole summary as one <p>. A programme adds a
milestone per run, so research/cell-fidelity's "What it found" was 6,894 words with no break and
229 of 1,080 summaries ran past 150 words. `summary_paragraphs` breaks at the text's own markers
(Milestone, Step, Limits) and then at sentence ends, and must never lose text or split a tag."""
import glob
import importlib.util
import json
import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "research" / "_homepage"))
spec = importlib.util.spec_from_file_location("research_build", ROOT / "research" / "_homepage" / "build.py")
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)
paras = build.summary_paragraphs


def squash(s):
    return re.sub(r"\s+|<br\s*/?>", "", s)


def balanced(s):
    opened = [t for t in re.findall(r"<(\w+)", s) if t != "br"]
    return sorted(opened) == sorted(re.findall(r"</(\w+)", s))


def sentence(i, words=20):
    return "Word " + " ".join(["word"] * (words - 2)) + f" end{i}."


class SummaryParagraphsTest(unittest.TestCase):
    def test_short_summary_is_one_paragraph(self):
        s = "Quantile scoring rules. A second sentence. Limits are many but unlabelled."
        self.assertEqual(paras(s), [s])
        self.assertEqual(build.summary_html(s), f"  <p>{s}</p>")

    def test_milestones_start_paragraphs(self):
        s = ("A programme on cameras. <strong>Milestone 1</strong> uses real photos. "
             "<strong>Milestone 2 (bends):</strong> tests the board. Step 3 (2026-11-12) adds a gate.")
        self.assertEqual(paras(s), ["A programme on cameras.", "<strong>Milestone 1</strong> uses real photos.",
                                    "<strong>Milestone 2 (bends):</strong> tests the board.",
                                    "Step 3 (2026-11-12) adds a gate."])

    def test_limits_get_their_own_paragraph(self):
        s = "It cuts energy 28%. Limits: modelled, not measured; one layer."
        self.assertEqual(paras(s), ["It cuts energy 28%.", "Limits: modelled, not measured; one layer."])

    def test_marker_mid_sentence_does_not_break(self):
        s = "As in milestone 2 and Step 3 of the plan, this holds. It also holds."
        self.assertEqual(paras(s), [s])

    def test_long_run_splits_at_sentence_ends(self):
        s = " ".join(sentence(i) for i in range(20))  # 400 words
        out = paras(s)
        self.assertGreater(len(out), 2)
        self.assertEqual(squash("".join(out)), squash(s))
        for p in out:
            self.assertTrue(p.endswith("."), p)
            self.assertLessEqual(len(p.split()), build.PARA_WORDS * 1.5)

    def test_no_break_inside_parentheses_code_or_after_abbreviations(self):
        filler = " ".join(["word"] * 90)
        s = (f"{filler} (an aside. With Two sentences.) More. <code>a. B</code> then e.g. Smith et al. Said so. "
             f"Next {filler}.")
        out = paras(s)
        for p in out:
            self.assertEqual(p.count("("), p.count(")"), p)
            self.assertTrue(balanced(p), p)
            self.assertFalse(p.startswith(("With", "B<", "Smith", "Said")), p)

    def test_br_runs_are_breaks(self):
        self.assertEqual(paras("First part.<br><br> Second part."), ["First part.", "Second part."])

    def test_structured_html_is_left_alone(self):
        s = "<ul><li>One. Milestone 2 x.</li></ul>"
        self.assertEqual(paras(s), [s])

    def test_every_real_summary_keeps_its_text_and_tags(self):
        data = json.loads((ROOT / "research" / "_homepage" / "projects.json").read_text())
        summaries = [p["summary"] for t in data["themes"] for p in t["projects"]]
        for f in glob.glob(str(ROOT / "research" / "*" / "project.json")):
            try:
                summaries.append(json.loads(Path(f).read_text())["summary"])
            except (ValueError, KeyError):
                pass
        self.assertGreater(len(summaries), 500)
        for s in summaries:
            out = paras(s)
            self.assertEqual(squash("".join(out)), squash(s))
            if balanced(s):
                for p in out:
                    self.assertTrue(balanced(p), p[:120])


class LongSummaryFoldTest(unittest.TestCase):
    def test_short_summary_never_folds(self):
        s = " ".join(sentence(i) for i in range(10))  # 200 words
        self.assertNotIn("<details", build.summary_html(s, fold=True))

    def test_long_summary_shows_its_start_and_folds_the_rest(self):
        s = " ".join(sentence(i) for i in range(60))  # 1,200 words
        out = build.summary_html(s, fold=True)
        head, rest = out.split('<details class="summary-more">')
        self.assertGreaterEqual(len(build.plain(head).split()), build.SUMMARY_OPEN)
        self.assertIn("Show the rest of the summary", rest)
        self.assertEqual(squash(build.plain(out).replace("Show the rest", "|")).count("end59."), 1)
        self.assertNotIn("<details", build.summary_html(s))  # topic cards: already inside a <details>


class ShortLedeTest(unittest.TestCase):
    def test_short_lede_unchanged(self):
        self.assertEqual(build.short_lede("Answer; second clause.", 10), "Answer; second clause.")

    def test_cut_at_the_last_clause_that_fits(self):
        lede = "One two three; four five six; seven eight nine ten eleven"
        self.assertEqual(build.short_lede(lede, 7), "One two three; four five six&hellip;")

    def test_never_cut_inside_parentheses_or_code(self):
        lede = "Alpha beta (gamma; delta epsilon) zeta; <code>a; b</code> eta theta iota kappa lambda"
        out = build.short_lede(lede, 8)
        self.assertEqual(out, "Alpha beta (gamma; delta epsilon) zeta&hellip;")

    def test_first_clause_far_too_long_leaves_it_whole(self):
        lede = " ".join(["w"] * 30) + "; tail"
        self.assertEqual(build.short_lede(lede, 10), lede + ".")

    def test_cut_keeps_the_closing_disclosure(self):
        # research/homebot's header dropped "Simulated only, not yet built." (2026-11-22).
        lede = "One two three; four five six; seven eight nine ten. Simulated only, not yet built."
        self.assertEqual(build.short_lede(lede, 11),
                         "One two three; four five six&hellip; Simulated only, not yet built.")
        self.assertEqual(build.short_lede("A b c; d e f; g h i j; stylised, preliminary", 8),
                         "A b c; d e f&hellip; Stylised, preliminary.")

    def test_disclosure_after_a_parenthesised_sentence(self):
        lede = "One two three; four five six (a sentence here.) Stylised, nothing built."
        self.assertTrue(build.short_lede(lede, 9).endswith("&hellip; Stylised, nothing built."))

    def test_a_tail_that_is_not_a_disclosure_is_cut(self):
        lede = "One two three; four five six; seven eight nine ten eleven twelve."
        self.assertEqual(build.short_lede(lede, 7), "One two three; four five six&hellip;")

    def test_a_short_lede_ends_with_a_full_stop(self):
        self.assertEqual(build.short_lede("Saves 28%", 10), "Saves 28%.")
        self.assertEqual(build.short_lede("Does it? <em>No</em>", 10), "Does it? <em>No</em>.")
        for done in ("Ends here.", "Is it?", "(see log)", "x &minus;"):
            self.assertEqual(build.short_lede(done, 10), done)


class LogFoldTest(unittest.TestCase):
    def render(self, entries):
        saved = build.read_log
        build.read_log = lambda slug: entries
        try:
            return build.log_html("x")
        finally:
            build.read_log = saved

    def entry(self, i, words):
        return (f"2026-11-{i:02d} · Entry {i}", [("li", " ".join(["w"] * words))])

    def test_short_log_is_all_open(self):
        out = self.render([self.entry(i, 50) for i in range(3, 0, -1)])
        self.assertNotIn("<details", out)
        self.assertEqual(out.count('<article class="log-entry">'), 3)

    def test_long_log_keeps_the_newest_open_and_folds_the_rest(self):
        out = self.render([self.entry(i, 400) for i in range(20, 0, -1)])
        self.assertEqual(out.count('<article class="log-entry">'), 1)
        self.assertIn("Entry 20", out.split("<details")[0])
        self.assertIn('<summary>Show 19 earlier entries</summary>', out)
        self.assertEqual(out.count('<details class="log-entry"><summary><h3>'), 19)
        self.assertEqual(out.count("<details"), out.count("</details>"))

    def test_folding_a_single_entry_is_not_worth_it(self):
        out = self.render([self.entry(2, 600), self.entry(1, 600)])
        self.assertNotIn("<details", out)


if __name__ == "__main__":
    unittest.main()
