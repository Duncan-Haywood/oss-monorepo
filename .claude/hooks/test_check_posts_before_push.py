import json, os, subprocess, sys, tempfile, unittest
from pathlib import Path

HOOK = Path(__file__).with_name("check_posts_before_push.py")


def run(cmd, repo=None):
    env = {**os.environ, **({"POSTS_HOOK_REPO": str(repo)} if repo else {})}
    return subprocess.run([sys.executable, str(HOOK)], input=json.dumps({"tool_input": {"command": cmd}}),
                          capture_output=True, text=True, env=env).returncode


GOOD = '---\ntitle: "T"\ndate: 2026-10-24\ndescription: "' + "D" * 70 + '"\ntags: [a]\n---\nbody\n'


class Hook(unittest.TestCase):
    def test_ignores_non_push(self):
        self.assertEqual(run("git status"), 0)
        self.assertEqual(run("echo 'git push later'"), 0)

    def test_push_runs_without_crashing(self):
        self.assertIn(run("git push -u origin x"), (0, 2))

    def test_chained_edit_before_push_is_not_judged_on_the_old_tree(self):
        self.assertEqual(run("sed -i s/a/b/ docs/posts/x.md && git commit -am fix && git push -u origin x"), 0)
        self.assertEqual(run("git checkout -- . && git push"), 0)

    def test_add_commit_push_chain_judges_the_files_on_disk(self):
        # The usual push is one call; skipping it let 10 bad posts reach main
        # in four days (check_post_frontmatter.py --landed-since 2026-11-10).
        with tempfile.TemporaryDirectory() as d:
            repo = Path(d)
            g = lambda *a: subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t", *a], cwd=repo,
                                          check=True, capture_output=True)
            g("init", "-q", "-b", "main")
            (repo / "docs" / "posts").mkdir(parents=True)
            (repo / "docs" / "posts" / "2026-10-24-old.md").write_text(GOOD)
            g("add", "."); g("commit", "-qm", "base")
            g("update-ref", "refs/remotes/origin/main", "HEAD")
            chain = "git add -A && git commit -m post && git push -u origin x"
            self.assertEqual(run(chain, repo), 0)
            new = repo / "docs" / "posts" / "2026-10-24-new.md"
            new.write_text(GOOD.replace("D" * 70, "D" * 170))  # untracked, description over 160
            self.assertEqual(run(chain, repo), 2)
            new.write_text(GOOD)
            self.assertEqual(run(chain, repo), 0)
            (repo / "docs" / "posts" / "2026-10-24-old.md").write_text(GOOD.replace("tags: [a]\n", ""))
            self.assertEqual(run("git commit -am edit && git push", repo), 2)  # tracked edit, not yet committed

    def test_bad_input_is_ignored(self):
        r = subprocess.run([sys.executable, str(HOOK)], input="not json", capture_output=True, text=True)
        self.assertEqual(r.returncode, 0)


if __name__ == "__main__":
    unittest.main()
