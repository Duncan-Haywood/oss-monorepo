import contextlib
import io
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_posts  # noqa: E402

BODY = " ".join(f"word{i}" for i in range(80))


def post(n, body=BODY):
    return (f'---\ntitle: "Title {n}"\ndate: 2026-10-24\n'
            f'description: "{n} ' + "D" * 60 + '"\ntags: [a, b]\n---\n' + body + "\n")


class T(unittest.TestCase):
    def _run(self, posts, named, strict=False):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "docs" / "posts").mkdir(parents=True)
            for name, text in posts.items():
                (root / "docs" / "posts" / name).write_text(text, encoding="utf-8")
            lines = []
            with contextlib.redirect_stdout(io.StringIO()) as buf:
                code = check_posts.run([f"docs/posts/{n}" for n in named], root=root,
                                       strict=strict, out=lines.append)
            return code, "\n".join(lines) + "\n" + buf.getvalue()

    def test_clean_post_passes(self):
        code, out = self._run({"2026-10-24-a.md": post("a")}, ["2026-10-24-a.md"])
        self.assertEqual(code, 0, out)
        self.assertIn("check_posts: ok, 1 file(s)", out)

    def test_broken_link_fails(self):
        code, out = self._run({"2026-10-24-a.md": post("a", BODY + " [x](gone.md)")}, ["2026-10-24-a.md"])
        self.assertEqual(code, 1)
        self.assertIn("broken link gone.md", out)

    def test_front_matter_problem_fails(self):
        code, out = self._run({"2026-10-24-a.md": post("a").replace("tags: [a, b]\n", "")}, ["2026-10-24-a.md"])
        self.assertEqual(code, 1)
        self.assertIn("tags", out)

    def test_near_copy_is_listed_but_fails_only_when_strict(self):
        posts = {"2026-10-24-a.md": post("a"), "2026-10-24-b.md": post("b")}
        code, out = self._run(posts, ["2026-10-24-b.md"])
        self.assertEqual(code, 0, out)
        self.assertIn("2026-10-24-a.md  |  2026-10-24-b.md", out)
        code, _ = self._run(posts, ["2026-10-24-b.md"], strict=True)
        self.assertEqual(code, 1)

    def test_fix_respells_tags_through_this_command(self):
        # The front-matter checker's hint names `--fix <post>`; check_posts
        # used to reject the flag (run record, 2026-11-18).
        posts = {f"2026-10-24-{n}.md": post(n, BODY + f" {n} " * 40).replace("tags: [a, b]", "tags: [benchmarks]")
                 for n in "abc"}
        posts["2026-10-24-d.md"] = post("d", "other " * 80).replace("tags: [a, b]", "tags: [benchmark]")
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "docs" / "posts").mkdir(parents=True)
            for name, text in posts.items():
                (root / "docs" / "posts" / name).write_text(text, encoding="utf-8")
            target = root / "docs" / "posts" / "2026-10-24-d.md"
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(check_posts.main(["--root", d, str(target)]), 1)
                self.assertEqual(check_posts.main(["--root", d, "--fix", str(target)]), 0)
            self.assertIn("tags: [benchmarks]", target.read_text(encoding="utf-8"))

    def test_nothing_changed_is_a_pass(self):
        lines = []
        self.assertEqual(check_posts.run([], out=lines.append), 0)
        self.assertIn("nothing to check", lines[0])

    def test_missing_file_is_a_usage_error(self):
        self.assertEqual(check_posts.run(["docs/posts/nope.md"], out=lambda m: None), 2)

    def test_changed_files_unions_branch_worktree_and_untracked(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "docs" / "posts").mkdir(parents=True)
            (root / "docs" / "reports").mkdir(parents=True)
            for n in ("docs/posts/a.md", "docs/posts/b.md", "docs/reports/r.md"):
                (root / n).write_text("x")
            calls = []

            def git(*args, root=None):
                calls.append(args)
                if args[0] == "merge-base":
                    return None  # shallow clone: falls back to origin/main
                if args[0] == "diff" and args[3] == "origin/main":
                    return ["docs/posts/a.md", "docs/posts/gone.md", "docs/posts/img.svg"]
                if args[0] == "diff":
                    return ["docs/reports/r.md"]
                return ["docs/posts/b.md"]
            got = check_posts.changed_files(root, git=git)
            self.assertEqual(got, ["docs/posts/a.md", "docs/posts/b.md", "docs/reports/r.md"])

    def test_limits_line_names_this_checker(self):
        import check_post_frontmatter
        self.assertIn("check_posts.py", check_post_frontmatter.limits_line())


class StaleBase(unittest.TestCase):
    def _main(self, n):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "docs" / "posts").mkdir(parents=True)
            names = [f"docs/posts/2026-10-24-p{i}.md" for i in range(n)]
            for i, name in enumerate(names):
                (root / name).write_text(post(i, body=f"{BODY} unique{i} " + " ".join(f"z{i}x{j}" for j in range(60))))
            orig = check_posts.changed_files
            check_posts.changed_files = lambda root: names
            try:
                with contextlib.redirect_stdout(io.StringIO()) as buf:
                    check_posts.main(["--root", d, "--no-fetch"])
            finally:
                check_posts.changed_files = orig
            return buf.getvalue()

    def test_many_changed_files_print_the_stale_origin_hint(self):
        self.assertIn("origin/main is stale", self._main(check_posts.STALE_HINT_AT + 1))
        self.assertNotIn("origin/main is stale", self._main(2))


class Refresh(unittest.TestCase):
    def test_refresh_relists_after_fetch(self):
        calls, lines = [], []
        lists = iter([["a.md"]])
        got = check_posts.refresh_and_relist(Path("."), 531, fetch=lambda: calls.append(1) or 0,
                                             relist=lambda root: next(lists), out=lines.append)
        self.assertEqual(got, ["a.md"])
        self.assertEqual(calls, [1])
        self.assertIn("531 files differed", lines[0])
        self.assertIn("now 1", lines[0])

    def test_failed_or_raising_fetch_keeps_listing(self):
        lines = []
        got = check_posts.refresh_and_relist(Path("."), 9, fetch=lambda: 1,
                                             relist=lambda root: ["x"] * 9, out=lines.append)
        self.assertEqual(len(got), 9)
        self.assertIn("failed", lines[0])

        def boom():
            raise OSError("no network")
        got = check_posts.refresh_and_relist(Path("."), 9, fetch=boom,
                                             relist=lambda root: ["x"] * 9, out=lines.append)
        self.assertEqual(len(got), 9)
        self.assertIn("could not refresh", lines[1])

    def test_hint_names_fetch_ref_not_a_cutting_depth_fetch(self):
        self.assertIn("fetch_ref.py main", check_posts.FETCH_HINT)


class WrongRoot(unittest.TestCase):
    def test_root_without_posts_refuses(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(check_posts.main(["--root", d]), 2)


if __name__ == "__main__":
    unittest.main()
