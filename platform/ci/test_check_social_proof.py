import contextlib
import io
import tempfile
import unittest
from pathlib import Path

import check_social_proof
from check_social_proof import check


class SocialProof(unittest.TestCase):
    def test_clean(self):
        self.assertEqual(check("<p>A free calculator. No signup.</p>"), [])

    def test_trusted_by_flagged(self):
        self.assertEqual(check("a\n<p>Trusted by 10,000 teams</p>")[0][0], 2)

    def test_join_count_flagged(self):
        self.assertTrue(check("Join 5,000+ happy users"))
        self.assertTrue(check("12 happy customers"))

    def test_comma_before_happy_is_prose_not_a_count(self):
        # A bare comma matched [\d,]+, so story prose failed CI (doc_friction 2026-11-11).
        self.assertEqual(check("<p>It was the long, happy night of the feast.</p>"), [])
        self.assertEqual(check("<p>We joined , then left.</p>"), [])

    def test_stars_flagged(self):
        self.assertTrue(check("<span>★★★★★</span>"))
        self.assertTrue(check("Rated 4.8 out of 5"))

    def test_award_and_press_flagged(self):
        self.assertTrue(check("Our award-winning tool"))
        self.assertTrue(check("As seen in the press"))

    def test_competitor_claim_allowed(self):
        self.assertEqual(check("It says it is trusted by thousands of pros."), [])
        self.assertEqual(check("Its own marketing calls it award-winning."), [])

    def test_format_example_allowed(self):
        self.assertEqual(check("start a block with <code>5 stars</code> or ★★★☆☆ e.g."), [])

    def test_snippet_has_forty_chars_of_context_each_side(self):
        pad = "x" * 59 + " "
        snip = check(f"{pad}trusted by {pad}")[0][1]
        self.assertEqual(snip, "x" * 39 + " trusted by" + " " + "x" * 39)

    def test_snippet_keeps_first_char_of_line_start_claim(self):
        self.assertEqual(check("Trusted by teams")[0][1], "Trusted by teams")
        self.assertEqual(check("  Trusted by teams")[0][1], "Trusted by teams")

    def test_default_root_is_repo_ventures(self):
        self.assertEqual(check_social_proof.ROOT / "ventures",
                         Path(__file__).resolve().parents[2] / "ventures")
        self.assertTrue((check_social_proof.ROOT / "ventures").is_dir())

    def test_usage_line_is_the_docstring_headline(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out), self.assertRaises(SystemExit):
            check_social_proof.main(["--help"])
        self.assertIn("Fail if visible page copy makes social-proof claims", out.getvalue())


class Cli(unittest.TestCase):
    def run_main(self, files):
        with tempfile.TemporaryDirectory() as d:
            for name, text in files.items():
                f = Path(d) / name
                f.parent.mkdir(parents=True, exist_ok=True)
                f.write_text(text, encoding="utf-8")
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                code = check_social_proof.main(["--root", d])
            return code, out.getvalue()

    def test_clean_tree_exits_zero_and_counts_files(self):
        code, out = self.run_main({"a.html": "<p>Free.</p>", "sub/README.md": "ok", "llms.txt": "ok",
                                   "notes.txt": "Trusted by 9,000 teams"})
        self.assertEqual(code, 0)
        self.assertIn("3 files scanned, 0 unattributed", out)

    def test_claim_exits_one_and_counts_each(self):
        code, out = self.run_main({"a.html": "Trusted by 9,000\nAward-winning", "b.html": "ok"})
        self.assertEqual(code, 1)
        self.assertIn("2 files scanned, 2 unattributed", out)
        self.assertIn("a.html:1:", out)
        self.assertIn("a.html:2:", out)

    def test_node_modules_skipped(self):
        code, out = self.run_main({"node_modules/x/README.md": "Trusted by 9,000", "a.html": "ok"})
        self.assertEqual(code, 0)
        self.assertIn("1 files scanned", out)


class Evasions(unittest.TestCase):
    """Red team 2026-11-11: copy that renders as a claim but slipped past."""

    def test_attribution_elsewhere_on_a_minified_line_does_not_excuse_a_claim(self):
        page = ("<p>Trusted by 5,000 businesses</p>" + "<p>Plain words here.</p>" * 10
                + "<footer>Enter amounts, for example 12.50</footer>")
        self.assertTrue(check_social_proof.check(page))

    def test_attribution_next_to_the_claim_still_counts(self):
        self.assertEqual(check_social_proof.check(
            "<p>Rival X says it is trusted by 10,000 teams.</p>"), [])

    def test_entities_and_inline_tags_do_not_hide_a_claim(self):
        for line in ("<p>Trusted&nbsp;by teams everywhere</p>",
                     "<p>Trusted\u00a0by teams</p>",
                     "<p>Join&#160;5,000 users</p>",
                     "<p>As&nbsp;seen in Forbes</p>",
                     "<p>Award&#8209;winning</p>",
                     "<p>Trusted <b>by</b> 4,000 shops</p>",
                     "<p><strong>Trusted</strong> by 4,000 shops</p>"):
            with self.subTest(line=line):
                self.assertTrue(check_social_proof.check(line))

    def test_abbreviated_counts(self):
        for line in ("<p>Join 10k+ freelancers</p>", "<p>Join 1.2M users</p>",
                     "<p>50K happy customers</p>"):
            with self.subTest(line=line):
                self.assertTrue(check_social_proof.check(line))

    def test_attribution_far_before_the_claim_does_not_excuse_it(self):
        # Red team 2026-11-12: the window was only tested after the claim; a slice
        # starting at 0 (min for max) let a header "for example" excuse the page.
        page = "<p>Enter amounts, for example 12.50</p>" + "<p>Plain words.</p>" * 20 + "<p>Trusted by 5,000 shops</p>"
        self.assertTrue(check_social_proof.check(page))

    def test_attribution_window_reaches_exactly_near_chars_before(self):
        # "says" opens the line; the claim starts `start` characters in. The window
        # reaches NEAR characters back, so it starts on the "s" of "says" or just past it.
        near = 120  # the docstring promises 120 characters; read from the module, a mutant would move with it
        for start, flagged in ((near, False), (near + 1, True)):
            line = "says " + "x" * (start - 5) + "trusted by 5,000 shops"
            with self.subTest(start=start):
                self.assertEqual(bool(check_social_proof.check(line)), flagged)

    def test_code_span_attribution_survives_normalising(self):
        self.assertEqual(check_social_proof.check(
            "<li>Flags <code>trusted by 5,000</code> in copy</li>"), [])


class PrefilterIsSuperset(unittest.TestCase):
    """The speed-up must never skip a line CLAIM would flag."""

    def test_random_lines_agree_with_raw_pattern(self):
        import random
        frags = ["Trusted BY", "join", "Joined", "10,000+", "5,000", "users", "happy",
                 "Satisfied", "customers", "rated", "4.8", "/5", "/ 5", "out of 5",
                 "stars", "★★★", "⭐⭐⭐", "3-star", "rating", "as seen", "AS FEATURED",
                 "on", "in", "award-winning", "Award winning", "#1 rated", "#1 choice",
                 "best-selling", "Best selling", "over", "more than", "x", " ", "<p>"]
        rng = random.Random(7)
        for _ in range(20000):
            line = " ".join(rng.choice(frags) for _ in range(rng.randint(1, 6)))
            if check_social_proof.CLAIM.search(line):
                self.assertTrue(check_social_proof.maybe_claim(line.lower()), line)


if __name__ == "__main__":
    unittest.main()
