import contextlib
import io
import tempfile
import datetime
import unittest
from pathlib import Path

from check_post_frontmatter import PAYWALL, PLACEHOLDER, ROOT, landed_broken, main, problems, tag_key

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

    def test_landed_broken_lists_posts_bad_in_their_adding_commit(self):
        import subprocess
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            posts = root / "docs" / "posts"
            posts.mkdir(parents=True)
            env = {"GIT_AUTHOR_DATE": "2026-10-24T12:00:00Z", "GIT_COMMITTER_DATE": "2026-10-24T12:00:00Z"}
            git = lambda *a: subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t", *a], cwd=root,
                                            check=True, capture_output=True, env={**__import__("os").environ, **env})
            git("init", "-q", "-b", "main")
            (posts / "2026-10-24-good.md").write_text(GOOD)
            git("add", "."); git("commit", "-qm", "good (#1)")
            (posts / "2026-10-24-bad.md").write_text(GOOD.replace('"DDD', '"' + "E" * 120 + "DDD"))
            (posts / "2026-10-25-early.md").write_text(GOOD.replace("2026-10-24", "2026-10-25"))
            git("add", "."); git("commit", "-qm", "bad (#2)")
            (posts / "2026-10-24-bad.md").write_text(GOOD)  # fixed later: still counted, it landed broken
            git("commit", "-qam", "fix (#3)")
            found = landed_broken("2026-10-01", ref="main", root=root)
            self.assertEqual(sorted(n for _, n, _ in found), ["2026-10-24-bad.md", "2026-10-25-early.md"])
            self.assertTrue(all("bad (#2)" in c for c, _, _ in found))

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

    def test_reports_need_doc_index_front_matter(self):
        # 43 of 131 reports added to main 2026-11-07..14 had no `kind`: doc_index's
        # check ran in no workflow a research or docs PR triggers. This one does.
        import json
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "docs" / "posts").mkdir(parents=True)
            (root / "docs" / "posts" / "2026-10-24-x.md").write_text(GOOD)
            (root / "docs" / "reports").mkdir()
            (root / "docs" / "taxonomy.json").write_text(json.dumps({"topics": [], "report_kinds": {"note": ""}}))
            good = root / "docs" / "reports" / "ok.md"
            good.write_text("---\nkind: note\ndate: 2026-11-14\n---\n# ok\n")
            bare = root / "docs" / "reports" / "bare.md"
            bare.write_text("# no front matter\n")
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                self.assertEqual(main(["--root", d]), 1)
            self.assertIn("docs/reports/bare.md: no front matter with `kind`", out.getvalue())
            self.assertNotIn("ok.md", out.getvalue())
            out = io.StringIO()
            with contextlib.redirect_stdout(out):  # a named report is checked alone, posts skipped
                self.assertEqual(main(["--root", d, str(good)]), 0)
            self.assertEqual(out.getvalue(), "ok: front matter clean on 1 report\n")
            bare.write_text("---\nkind: note\n---\n# fixed\n")
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(main(["--root", d]), 0)

    def test_good(self):
        self.assertEqual(problems("2026-10-24-x.md", GOOD), [])

    def test_placeholder_origin_fails_with_its_line(self):
        t = GOOD.replace("body\n", "body\n\nsee `https://example.invalid/x/`\n")
        [p] = problems("2026-10-24-x.md", t)
        self.assertTrue(p.startswith("line 9 holds `https://example.invalid`"), p)
        self.assertEqual(problems("2026-10-24-x.md", GOOD.replace("body", "the reserved `example.invalid` host")), [])

    def test_placeholder_matches_the_site_check(self):
        check = (ROOT / "platform" / "pages" / "check.mjs").read_text()
        self.assertIn(f"const PLACEHOLDER_ORIGIN = '{PLACEHOLDER}';", check)

    def test_paywall_words_in_title_or_description_fail_like_the_hub_test(self):
        # PR #17115: "A free trial is not churn" passed here and failed build.test.mjs.
        bad = GOOD.replace('title: "T"', 'title: "A free trial is not churn"')
        [p] = problems("2026-10-24-x.md", bad)
        self.assertIn("free trial", p)
        bad = GOOD.replace('description: "DDDD', 'description: "Upgrade to DDDD')
        [p] = problems("2026-10-24-x.md", bad)
        self.assertTrue(p.startswith("description holds `Upgrade to`"), p)
        # The domain nouns the hub test lets through pass here too.
        ok = GOOD.replace('title: "T"', 'title: "Subscriber counts and free trials"')
        self.assertEqual(problems("2026-10-24-x.md", ok), [])
        # The body is not on the hub.
        self.assertEqual(problems("2026-10-24-x.md", GOOD.replace("body", "subscribe now")), [])

    def test_paywall_pattern_matches_the_hub_test(self):
        hub_test = (ROOT / "platform" / "pages" / "build.test.mjs").read_text()
        self.assertIn(f"!/{PAYWALL.pattern}/i.test(visibleCopy(hub))", hub_test)

    def test_entity_in_title_or_top_heading_fails_like_the_site_build(self):
        # PR #16485: a post titled "yard&#x27;s" failed check.mjs (escaped twice).
        bad = GOOD.replace('title: "T"', 'title: "yard&#x27;s"')
        self.assertEqual(len(problems("2026-10-24-x.md", bad)), 1)
        self.assertIn("&#x27;", problems("2026-10-24-x.md", bad)[0])
        self.assertEqual(len(problems("2026-10-24-x.md", GOOD.replace("body", "## a &amp; b"))), 1)
        # Prose, code fences and h3 and below are not checked by the build.
        for body in ("each yard&#x27;s price", "```\n# x &amp; y\n```", "### a &amp; b", "## a & b"):
            self.assertEqual(problems("2026-10-24-x.md", GOOD.replace("body", body)), [], body)

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
        self.assertEqual(problems("2026-11-05-x.md", t.replace("2026-10-24", "2026-11-05"), datetime.date(2026, 11, 5)), ['title is 111 characters, 1 over; keep it to 110 (past the cap: "x")', "title is 111 characters with no clean cut to 70; add `seo_title:` (70 max)"])
        self.assertEqual(problems("2026-10-24-x.md", t), ["title is 111 characters with no clean cut to 70; add `seo_title:` (70 max)"])

    def test_long_description(self):
        t = GOOD.replace('"' + 'D' * 60 + '"', '"' + "x" * 161 + '"')
        self.assertEqual(problems("2026-10-24-x.md", t), ['description is 161 characters, 1 over; keep it to 160 (past the cap: "x")'])

    def test_long_description_quotes_the_words_past_the_cap(self):
        desc = "w" * 155 + " and then some"
        t = GOOD.replace('"' + 'D' * 60 + '"', '"' + desc + '"')
        self.assertEqual(problems("2026-10-24-x.md", t),
                         ['description is 169 characters, 9 over; keep it to 160 (past the cap: "then some")'])

    def test_description_of_exactly_160_is_fine(self):
        t = GOOD.replace('"' + 'D' * 60 + '"', '"' + "x" * 160 + '"')
        self.assertEqual(problems("2026-10-24-x.md", t), [])

    def test_stub_description(self):
        t = GOOD.replace('"' + 'D' * 60 + '"', '"d"')
        self.assertEqual(problems("2026-10-24-x.md", t), ["description is 1 characters; write at least 60 so a result says what the post is"])

    def test_long_seo_title(self):
        t = GOOD.replace('title: "T"\n', 'title: "T"\nseo_title: "' + "x" * 71 + '"\n')
        self.assertEqual(problems("2026-10-24-x.md", t), ['seo_title is 71 characters, 1 over; keep it to 70 (past the cap: "x")'])
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
        if distinct:  # each post needs its own description and title or the duplicate checks fire
            posts = {n: t.replace('description: "' + 'D' * 60 + '"', f'description: "{n} ' + 'D' * 60 + '"')
                     .replace('title: "T"', f'title: "T {n}"') for n, t in posts.items()}
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "docs" / "posts").mkdir(parents=True)
            for name, text in posts.items():
                (Path(d) / "docs" / "posts" / name).write_text(text, encoding="utf-8")
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                code = main(["--root", d])
        return code, out.getvalue()

    def test_main_exit_zero_when_clean(self):
        self.assertEqual(self._run({"2026-10-24-x.md": GOOD}), (0, "ok: front matter clean on 1 post\n"))

    def test_main_exit_one_and_names_each_problem(self):
        bad = GOOD.replace("tags: [a, b]\n", "")
        code, out = self._run({"2026-10-24-x.md": GOOD, "2026-10-24-y.md": bad, "z.md": "# hi\n"})
        self.assertEqual(code, 1)  # exit 1 whatever the count: CI treats only 1 as "check failed"
        self.assertEqual(out.splitlines()[:-2], ["2026-10-24-y.md: missing `tags`", "z.md: no front matter"])
        self.assertTrue(out.splitlines()[-2].startswith("front matter:"))
        # the last line names every failure, so `| tail -1` shows them all
        self.assertEqual(out.splitlines()[-1], "FAIL: 2 problem(s): 2026-10-24-y.md: missing `tags` | z.md: no front matter")

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

    def test_minority_spelling_names_the_post_to_edit(self):
        posts = {f"2026-10-24-x{i}.md": GOOD.replace("[a, b]", "[benchmarks]") for i in range(3)}
        posts["2026-10-24-new.md"] = GOOD.replace("[a, b]", "[benchmark]")
        code, out = self._run(posts)
        self.assertEqual((code, out), (1, "tag spelled 2 ways: benchmark, benchmarks; pick one\n"
                                          "  `benchmarks` is on 3 posts; change the other spelling in: "
                                          "2026-10-24-new.md\n"))

    def test_fix_respells_a_named_posts_tags_the_house_way(self):
        with tempfile.TemporaryDirectory() as d:
            posts = Path(d) / "docs" / "posts"
            posts.mkdir(parents=True)
            for i in range(3):
                (posts / f"2026-10-24-x{i}.md").write_text(
                    GOOD.replace("[a, b]", "[benchmarks, ArduPilot]").replace('"DDD', f'"D{i}D').replace('"T"', f'"T{i}"'))
            (posts / "2026-10-24-y.md").write_text(
                GOOD.replace("[a, b]", "[ardupilot]").replace('"DDD', '"YYY').replace('"T"', '"Y"'))
            new = posts / "2026-10-24-new.md"
            new.write_text(GOOD.replace("[a, b]", "[benchmark, ardupilot, Benchmarks, fresh]")
                           .replace('"DDD', '"NNN').replace('"T"', '"N"'))
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                self.assertEqual(main(["--root", d, str(new)]), 1)
            self.assertIn("`--fix <post>`", out.getvalue())
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                code = main(["--root", d, "--fix", str(new)])
            # ArduPilot is on 3 posts, ardupilot on 1: house spelling wins; fresh is new and stays
            self.assertIn("tags: [benchmarks, ArduPilot, fresh]", new.read_text())
            self.assertIn("benchmark -> benchmarks", out.getvalue())
            # y.md still spells it the minority way, so the group is still reported, naming y.md
            self.assertEqual(code, 1)
            self.assertIn("2026-10-24-y.md", out.getvalue())
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(main(["--root", d, "--fix", str(posts / "2026-10-24-x0.md")]), 1)
            (posts / "2026-10-24-y.md").unlink()
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(main(["--root", d, "--fix", str(new)]), 0)

    def test_fix_needs_named_posts(self):
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            main(["--fix"])

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

    def test_limits_are_printed_up_front_and_after_a_failure(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            self.assertEqual(main(["--limits"]), 0)
        self.assertIn("description 60 to 160", out.getvalue())
        self.assertIn("seo_title <= 70", out.getvalue())
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "docs" / "posts").mkdir(parents=True)
            bad = Path(d) / "2026-01-01-x.md"
            bad.write_text("---\ntitle: x\ndate: 2026-01-01\ndescription: " + "y" * 200 + "\ntags: [a]\n---\nbody\n")
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                self.assertEqual(main(["--root", d, str(bad)]), 1)
        self.assertIn("keep it to 160", out.getvalue())
        lines = out.getvalue().rstrip().splitlines()
        self.assertTrue(lines[-2].startswith("front matter:"))
        self.assertTrue(lines[-1].startswith("FAIL: 1 problem(s): 2026-01-01-x.md: description"))

    def test_fail_line_names_a_second_field_problem(self):
        # 2026-11-16: the FAIL line named only the first problem, and the
        # second (seo_title length) surfaced only on a rerun.
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "docs" / "posts").mkdir(parents=True)
            bad = Path(d) / "2026-01-01-x.md"
            bad.write_text("---\ntitle: x\ndate: 2026-01-01\ndescription: " + "y" * 200
                           + "\nseo_title: " + "z" * 75 + "\ntags: [a]\n---\nbody\n")
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                self.assertEqual(main(["--root", d, str(bad)]), 1)
        last = out.getvalue().rstrip().splitlines()[-1]
        self.assertIn("description is 200", last)
        self.assertIn("seo_title is 75", last)

    def _posts(self, d, posts):
        root = Path(d) / "docs" / "posts"
        root.mkdir(parents=True)
        for name, (title, seo) in posts.items():
            extra = f"seo_title: {seo}\n" if seo else ""
            (root / name).write_text(f"---\ntitle: {title}\n{extra}date: {name[:10]}\n"
                                     f"description: {name * 5}\ntags: [a]\n---\nbody\n")
        return root

    def test_two_posts_sharing_a_page_title_fail(self):
        # 2026-11-17 (PR #16945): a seo_title copied from a same-day sibling
        # post failed only the ~10-minute site build, as a duplicate <title>.
        long_a = "A census of every agent run this week by track: " + "x" * 40
        long_b = "A census of every agent run this week by track: " + "y" * 40
        with tempfile.TemporaryDirectory() as d:
            root = self._posts(d, {"2026-01-01-a.md": (long_a, None), "2026-01-02-b.md": (long_b, None),
                                   "2026-01-03-c.md": ("Other", "Same short title"),
                                   "2026-01-04-d.md": ("Another", "Same short title"),
                                   "2026-01-05-e.md": ("Unrelated headline", None)})
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                self.assertEqual(main(["--root", d, str(root / "2026-01-02-b.md")]), 1)
            self.assertIn('"A census of every agent run this week by track · Maris Stella Labs" on 2026-01-01-a.md, 2026-01-02-b.md',
                          out.getvalue())
            self.assertNotIn("Same short title", out.getvalue())
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                self.assertEqual(main(["--root", d, str(root / "2026-01-05-e.md")]), 0)
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                self.assertEqual(main(["--root", d]), 1)
            self.assertIn('"Same short title · Maris Stella Labs" on 2026-01-03-c.md, 2026-01-04-d.md', out.getvalue())

    def test_page_title_matches_writing_mjs(self):
        import json, shutil, subprocess
        from check_post_frontmatter import page_title
        if not shutil.which("node"):
            self.skipTest("node not installed")
        cases = [("Short", None), ("x" * 60, None), ("A head that is long enough to keep: " + "t" * 50, None),
                 ("Why does this run long enough to need a cut? " + "t" * 40, None), ("y" * 90, None),
                 ("Anything", "A seo title"), ("Anything", "s" * 60)]
        js = ("import { autoSeoTitle, postPageTitle, TITLE_BUDGET } from './platform/pages/writing.mjs';"
              "const cases = JSON.parse(process.argv[1]);"
              "console.log(JSON.stringify(cases.map(([t, s]) => postPageTitle(s || (t.length > TITLE_BUDGET ? autoSeoTitle(t) : undefined) || t))));")
        done = subprocess.run(["node", "--input-type=module", "-e", js, json.dumps(cases)], cwd=ROOT,
                              capture_output=True, text=True)
        self.assertEqual(done.returncode, 0, done.stderr)
        want = json.loads(done.stdout)
        for (t, s), w in zip(cases, want):
            text = f"---\ntitle: {t}\n" + (f"seo_title: {s}\n" if s else "") + "---\n"
            self.assertEqual(page_title(text), w, (t, s))

    def test_page_title_unquotes_like_writing_mjs(self):
        # 22 of 5,594 posts on 2026-11-17 quote a title holding \" or ''; a
        # plain strip left the backslashes in, so it disagreed with the page.
        from check_post_frontmatter import page_title
        self.assertEqual(page_title('---\ntitle: "Why \\"x\\" fails"\n---\n'), 'Why "x" fails · Maris Stella Labs')
        self.assertEqual(page_title("---\ntitle: 'It''s here'\n---\n"), "It's here · Maris Stella Labs")


if __name__ == "__main__":
    unittest.main()
