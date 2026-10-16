import json
import os
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from swe_cleanbroken import check


def git(d, *a):
    return subprocess.run(["git", "-C", d, *a], check=True, capture_output=True, text=True).stdout.strip()


class Repo:
    def __init__(self):
        self.d = tempfile.mkdtemp()
        git(self.d, "init", "-q", "-b", "main")
        git(self.d, "config", "user.email", "t@t")
        git(self.d, "config", "user.name", "t")
        self.names = [f"p{i}" for i in range(12)]  # spread lines so far-apart appends merge cleanly
        for n in self.names:
            self.put(f"research/{n}/README.md", "x")
        self.write(self.names, self.names)
        self.root = self.commit("init")

    def put(self, p, s):
        os.makedirs(os.path.dirname(os.path.join(self.d, p)), exist_ok=True)
        with open(os.path.join(self.d, p), "w") as f:
            f.write(s)

    def write(self, js, rd):
        self.put("research/_homepage/projects.json", json.dumps({"featured": [], "themes": [
            {"id": "t", "projects": [{"slug": s, "title": "t", "summary": "s"} for s in js]}]}, indent=1))
        self.put("research/README.md", "# R\n\n" + "".join(f"- [`research/{s}`]({s}) — l.\n" for s in rd))

    def commit(self, m):
        git(self.d, "add", "-A")
        git(self.d, "commit", "-qm", m)
        return git(self.d, "rev-parse", "HEAD")

    def branch(self, name, slug, js_at, rd_at, js=True, rd=True):
        """Branch from root adding project `slug` at the front ('head') or end ('tail') of each index."""
        git(self.d, "checkout", "-q", "-B", name, self.root)
        self.put(f"research/{slug}/README.md", "x")
        place = lambda at: [slug] + self.names if at == "head" else self.names + [slug]
        self.write(place(js_at) if js else self.names, place(rd_at) if rd else self.names)
        return self.commit(name)


class T(unittest.TestCase):
    def test_pairs_window(self):
        cs = [(0, "a"), (100, "b"), (5000, "c")]
        self.assertEqual(check.pairs(cs, 2), [("a", "b")])
        self.assertEqual(len(check.pairs(cs, 100)), 3)

    def test_same_position_edits_conflict(self):
        r = Repo()
        a, b = r.branch("a", "pa", "tail", "tail"), r.branch("b", "pb", "tail", "tail")
        kind, paths = check.classify(a, b, r.d)
        self.assertEqual(kind, "conflict")
        self.assertIn("research/README.md", paths)

    def test_far_apart_edits_merge_clean_and_consistent(self):
        r = Repo()
        a, b = r.branch("a", "pa", "head", "head"), r.branch("b", "pb", "tail", "tail")
        self.assertEqual(check.classify(a, b, r.d), ("ok", []))

    def test_clean_but_broken_when_one_side_deletes_what_the_other_extends(self):
        r = Repo()
        git(r.d, "checkout", "-q", "-B", "a", r.root)
        git(r.d, "rm", "-rq", "research/p5")
        r.write([n for n in r.names if n != "p5"], [n for n in r.names if n != "p5"])
        a = r.commit("a removes p5")
        git(r.d, "checkout", "-q", "-B", "b", r.root)
        r.put("research/p5/LOG.md", "new entry")  # b adds a file to the project a deletes
        b = r.commit("b extends p5")
        kind, errs = check.classify(a, b, r.d)
        self.assertEqual(kind, "broken")
        self.assertIn(("json missing project", "p5"), errs)
        self.assertIn(("readme missing bullet", "p5"), errs)

    def test_preexisting_error_is_not_blamed_on_the_merge(self):
        r = Repo()
        git(r.d, "checkout", "-q", "-B", "a", r.root)
        r.write(r.names, [r.names[0]] + r.names)  # a's own tree has a duplicate bullet, at the head
        a = r.commit("a")
        b = r.branch("b", "pb", "tail", "tail")
        self.assertEqual(check.classify(a, b, r.d), ("ok", []))

    def test_tree_errors_flag_duplicate_bullet_and_bad_json(self):
        r = Repo()
        r.write(r.names, r.names + [r.names[0]])
        tree = git(r.d, "rev-parse", r.commit("dup") + "^{tree}")
        self.assertEqual([k for k, _ in check.tree_errors(tree, r.d)],
                         ["readme duplicate bullet (not caught by build.py)"])
        r.put("research/_homepage/projects.json", "{ not json")
        tree = git(r.d, "rev-parse", r.commit("bad") + "^{tree}")
        self.assertEqual(check.tree_errors(tree, r.d)[0][0], "projects.json invalid JSON")


if __name__ == "__main__":
    unittest.main()
