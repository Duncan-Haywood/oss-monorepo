import contextlib
import io
import tempfile
import datetime
import unittest
from pathlib import Path

from check_post_frontmatter import ROOT, main, problems

GOOD = '---\ntitle: "T"\ndate: 2026-10-24\ndescription: "d"\ntags: [a, b]\n---\nbody\n'


class T(unittest.TestCase):
    def test_good(self):
        self.assertEqual(problems("2026-10-24-x.md", GOOD), [])

    def test_missing_tags(self):
        t = GOOD.replace("tags: [a, b]\n", "")
        self.assertEqual(problems("2026-10-24-x.md", t), ["missing `tags`"])

    def test_empty_tags(self):
        t = GOOD.replace("[a, b]", "[]")
        self.assertEqual(problems("2026-10-24-x.md", t), ["`tags` is not a non-empty [list]"])

    def test_date_mismatch(self):
        self.assertEqual(len(problems("2026-10-25-x.md", GOOD)), 1)

    def test_long_description(self):
        t = GOOD.replace('"d"', '"' + "x" * 161 + '"')
        self.assertEqual(problems("2026-10-24-x.md", t), ["description is 161 characters; keep it to 160"])

    def test_description_of_exactly_160_is_fine(self):
        t = GOOD.replace('"d"', '"' + "x" * 160 + '"')
        self.assertEqual(problems("2026-10-24-x.md", t), [])

    def test_long_seo_title(self):
        t = GOOD.replace('title: "T"\n', 'title: "T"\nseo_title: "' + "x" * 71 + '"\n')
        self.assertEqual(problems("2026-10-24-x.md", t), ["seo_title is 71 characters; keep it to 70"])
        self.assertEqual(problems("2026-10-24-x.md", t.replace("x" * 71, "x" * 70)), [])

    def test_future_date(self):
        t = GOOD.replace("2026-10-24", "2026-10-27")
        today = datetime.date(2026, 10, 25)
        self.assertEqual(len(problems("2026-10-27-x.md", t, today)), 1)
        tomorrow = GOOD.replace("2026-10-24", "2026-10-26")
        self.assertEqual(len(problems("2026-10-26-x.md", tomorrow, today)), 1)  # no slack
        self.assertEqual(problems("2026-10-25-x.md", GOOD.replace("2026-10-24", "2026-10-25"), today), [])

    def _run(self, posts, distinct=True):
        if distinct:  # each post needs its own description or the duplicate check fires
            posts = {n: t.replace('description: "d"', f'description: "d {n}"') for n, t in posts.items()}
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "docs" / "posts").mkdir(parents=True)
            for name, text in posts.items():
                (Path(d) / "docs" / "posts" / name).write_text(text, encoding="utf-8")
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                code = main(["--root", d])
        return code, out.getvalue()

    def test_main_exit_zero_when_clean(self):
        self.assertEqual(self._run({"2026-10-24-x.md": GOOD}), (0, ""))

    def test_main_exit_one_and_names_each_problem(self):
        bad = GOOD.replace("tags: [a, b]\n", "")
        code, out = self._run({"2026-10-24-x.md": GOOD, "2026-10-24-y.md": bad, "z.md": "# hi\n"})
        self.assertEqual(code, 1)  # exit 1 whatever the count: CI treats only 1 as "check failed"
        self.assertEqual(out.splitlines(), ["2026-10-24-y.md: missing `tags`", "z.md: no front matter"])

    def test_indented_line_is_not_a_field(self):
        # a nested/continued value must not satisfy a required key
        t = GOOD.replace("tags: [a, b]\n", "extra:\n  tags: [a, b]\n")
        self.assertEqual(problems("2026-10-24-x.md", t), ["missing `tags`"])

    def test_tag_spelled_two_ways(self):
        other = GOOD.replace("[a, b]", "[red-team, bs]")
        code, out = self._run({"2026-10-24-x.md": GOOD.replace("[a, b]", "[redteam]"), "2026-10-24-y.md": other})
        self.assertEqual((code, out), (1, "tag spelled 2 ways: red-team, redteam; pick one\n"))

    def test_four_letter_plural_is_a_variant(self):
        # `len(k) > 3` is the boundary: "labs" must fold to "lab", or "labs"/"lab" split the filter
        code, out = self._run({"2026-10-24-x.md": GOOD.replace("[a, b]", "[labs]"), "2026-10-24-y.md": GOOD.replace("[a, b]", "[lab]")})
        self.assertEqual((code, out), (1, "tag spelled 2 ways: lab, labs; pick one\n"))

    def test_three_letter_s_is_not_a_plural(self):
        code, out = self._run({"2026-10-24-x.md": GOOD.replace("[a, b]", "[gas]"), "2026-10-24-y.md": GOOD.replace("[a, b]", "[ga]")})
        self.assertEqual(code, 0)

    def test_default_root_is_the_repo_root(self):
        # parents[2] from platform/ci/: one more level and the check scans nothing and always passes
        self.assertTrue((ROOT / "docs" / "posts").is_dir())

    def test_one_description_on_two_posts_fails(self):
        code, out = self._run({"2026-10-24-x.md": GOOD, "2026-10-24-y.md": GOOD.replace('title: "T"', 'title: "U"')}, distinct=False)
        self.assertEqual(code, 1)
        self.assertIn("one description on 2 posts", out)

    def test_long_title_needs_seo_title(self):
        long = GOOD.replace('title: "T"', 'title: "' + "x" * 71 + '"')
        self.assertEqual(len(problems("2026-10-24-x.md", long)), 1)
        ok = long.replace("date:", 'seo_title: "short"\ndate:')
        self.assertEqual(problems("2026-10-24-x.md", ok), [])
        self.assertEqual(problems("2026-10-24-x.md", GOOD.replace('"T"', '"' + "x" * 70 + '"')), [])

    def test_no_front_matter(self):
        self.assertEqual(problems("x.md", "# hi\n"), ["no front matter"])


if __name__ == "__main__":
    unittest.main()
