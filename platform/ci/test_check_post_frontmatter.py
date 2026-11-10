import contextlib
import io
import tempfile
import datetime
import unittest
from pathlib import Path

from check_post_frontmatter import ROOT, main, problems, tag_key

GOOD = '---\ntitle: "T"\ndate: 2026-10-24\ndescription: "DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD"\ntags: [a, b]\n---\nbody\n'


class T(unittest.TestCase):
    def test_fallback_cut_matches_propose_seo_titles(self):
        import importlib.util
        src = Path(__file__).resolve().parent / "check_post_frontmatter.py"
        text = src.read_text()
        start = text.index("    def _cut(")
        body = "\n".join(l[4:] for l in text[start:].split("\n\n")[0].splitlines())
        ns = {}
        exec(body, ns)
        spec = importlib.util.spec_from_file_location("pst", ROOT / "platform" / "pages" / "propose_seo_titles.py")
        pst = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(pst)
        for title in ["Short: x", "A head that is long enough to keep: and then a much longer tail that runs on",
                      "Why does this question run long enough? Because it keeps on going past seventy chars",
                      "x" * 90, "Q? tail", "A" * 71 + ": tail"]:
            self.assertEqual(ns["_cut"](title), pst.cut(title), title)

    def test_runs_when_copied_alone_into_another_tree(self):
        # prompts/test_promptctl.py copies this script by itself onto a fixture
        # tree; an import that only resolves in the real repository crashed it
        # there, and promptctl read the crash as "no problems" (2026-11-10).
        import shutil, subprocess, sys
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "platform" / "ci").mkdir(parents=True)
            (root / "docs" / "posts").mkdir(parents=True)
            src = Path(__file__).resolve().parent / "check_post_frontmatter.py"
            shutil.copy(src, root / "platform" / "ci" / src.name)
            (root / "docs" / "posts" / "2020-01-01-a.md").write_text(
                f'---\ntitle: T\ndate: 2020-01-01\ndescription: "{"x" * 161}"\ntags: [a]\n---\n')
            done = subprocess.run([sys.executable, str(root / "platform" / "ci" / src.name), "--root", str(root)],
                                  capture_output=True, text=True)
            self.assertEqual(done.returncode, 1, done.stderr)
            self.assertIn("description is 161", done.stdout)

    def test_tag_key_es_plural(self):
        self.assertEqual(tag_key("taxes"), tag_key("tax"))
        self.assertNotEqual(tag_key("cases"), tag_key("cas"))

    def test_named_posts_are_checked_alone(self):
        with tempfile.TemporaryDirectory() as d:
            posts = Path(d) / "docs" / "posts"
            posts.mkdir(parents=True)
            (posts / "2026-10-24-good.md").write_text(GOOD.replace("[a, b]", "[Tax]"))
            (posts / "2026-10-24-bad.md").write_text(GOOD.replace("tags: [a, b]\n", "")
                                                     .replace('"DDD', '"EEE'))
            (posts / "2026-10-24-other.md").write_text(GOOD.replace("[a, b]", "[taxes]").replace('"DDD', '"FFF'))
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                self.assertEqual(main(["--root", d, str(posts / "2026-10-24-bad.md")]), 1)
            self.assertIn("missing `tags`", out.getvalue())
            self.assertNotIn("spelled", out.getvalue())  # bad.md has no tags in the Tax/taxes group
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                self.assertEqual(main(["--root", d, str(posts / "2026-10-24-good.md")]), 1)
            self.assertIn("tag spelled 2 ways", out.getvalue())
            self.assertNotIn("missing", out.getvalue())
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(main(["--root", d, str(posts / "nope.md")]), 1)

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

    def test_long_title_only_for_new_posts(self):
        t = GOOD.replace('title: "T"', 'title: "' + "x" * 111 + '"')
        self.assertEqual(problems("2026-11-05-x.md", t.replace("2026-10-24", "2026-11-05"), datetime.date(2026, 11, 5)), ["title is 111 characters; keep it to 110", "title is 111 characters with no clean cut to 70; add `seo_title:` (70 max)"])
        self.assertEqual(problems("2026-10-24-x.md", t), ["title is 111 characters with no clean cut to 70; add `seo_title:` (70 max)"])

    def test_long_description(self):
        t = GOOD.replace('"' + 'D' * 60 + '"', '"' + "x" * 161 + '"')
        self.assertEqual(problems("2026-10-24-x.md", t), ["description is 161 characters; keep it to 160"])

    def test_description_of_exactly_160_is_fine(self):
        t = GOOD.replace('"' + 'D' * 60 + '"', '"' + "x" * 160 + '"')
        self.assertEqual(problems("2026-10-24-x.md", t), [])

    def test_stub_description(self):
        t = GOOD.replace('"' + 'D' * 60 + '"', '"d"')
        self.assertEqual(problems("2026-10-24-x.md", t), ["description is 1 characters; write at least 60 so a result says what the post is"])

    def test_long_seo_title(self):
        t = GOOD.replace('title: "T"\n', 'title: "T"\nseo_title: "' + "x" * 71 + '"\n')
        self.assertEqual(problems("2026-10-24-x.md", t), ["seo_title is 71 characters; keep it to 70"])
        self.assertEqual(problems("2026-10-24-x.md", t.replace("x" * 71, "x" * 70)), [])

    def test_title_over_70_with_no_clean_cut(self):
        t = GOOD.replace('title: "T"\n', 'title: "' + "x" * 80 + '"\n')
        self.assertEqual(problems("2026-10-24-x.md", t), ["title is 80 characters with no clean cut to 70; add `seo_title:` (70 max)"])
        t2 = t.replace('title: "' + "x" * 80 + '"\n', 'title: "' + "x" * 80 + '"\nseo_title: "short title"\n')
        self.assertEqual(problems("2026-10-24-x.md", t2), [])

    def test_title_of_71_flags_and_70_does_not(self):
        t = lambda n: GOOD.replace('title: "T"\n', 'title: "' + "x" * n + '"\n')
        self.assertEqual(problems("2026-10-24-x.md", t(71)), ["title is 71 characters with no clean cut to 70; add `seo_title:` (70 max)"])
        self.assertEqual(problems("2026-10-24-x.md", t(70)), [])

    def test_future_date(self):
        t = GOOD.replace("2026-10-24", "2026-10-27")
        today = datetime.date(2026, 10, 25)
        self.assertEqual(len(problems("2026-10-27-x.md", t, today)), 1)
        tomorrow = GOOD.replace("2026-10-24", "2026-10-26")
        self.assertEqual(len(problems("2026-10-26-x.md", tomorrow, today)), 1)  # no slack
        self.assertEqual(problems("2026-10-25-x.md", GOOD.replace("2026-10-24", "2026-10-25"), today), [])

    def _run(self, posts, distinct=True):
        if distinct:  # each post needs its own description or the duplicate check fires
            posts = {n: t.replace('description: "' + 'D' * 60 + '"', f'description: "{n} ' + 'D' * 60 + '"') for n, t in posts.items()}
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

    def test_no_front_matter(self):
        self.assertEqual(problems("x.md", "# hi\n"), ["no front matter"])


if __name__ == "__main__":
    unittest.main()
