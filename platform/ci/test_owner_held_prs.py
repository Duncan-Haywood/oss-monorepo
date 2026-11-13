#!/usr/bin/env python3
"""Tests for owner_held_prs: which open PRs wait on the owner, and how they group.

The list is only useful if it skips fork PRs and PRs that touch no owned path,
puts the oldest first, and names the files several PRs fight over. If it got
those wrong, the owner would review in the wrong order and agents would miss
the PR that already holds their fix.
"""

import datetime as dt
import unittest

import control_plane_guard as cpg
import owner_held_prs as ohp

RULES = cpg.parse_codeowners("/prompt.md @owner\n/prompts/ @owner\n/prompts/runs/\n/.github/ @owner\n")


def pr(n, created, fork=False, title=None, draft=False):
    base = {"full_name": "o/r"}
    head = {"full_name": "someone/r" if fork else "o/r"}
    return {"number": n, "title": title or f"pr {n}", "created_at": created, "draft": draft,
            "head": {"repo": head}, "base": {"repo": base}}


def f(name, sha="x", status="modified"):
    return {"filename": name, "sha": sha, "status": status}


FILES = {
    1: [f("prompt.md", "a1"), f("docs/posts/p.md")],
    2: [f("prompts/promptctl.py", "b2")],
    3: [f("prompt.md", "c3")],
    4: [f("ventures/x/index.mjs")],                  # nothing owned
    5: [f("prompt.md")],                             # fork: skipped
    6: [f("prompts/runs/r.json")],                   # unowned by the later rule
    7: [f(".github/workflows/x.yml", "main-blob")],  # identical to main
}
PRS = [pr(3, "2026-11-03T00:00:00Z"), pr(1, "2026-11-01T00:00:00Z", draft=True),
       pr(2, "2026-11-02T00:00:00Z"), pr(4, "2026-10-01T00:00:00Z"),
       pr(5, "2026-10-01T00:00:00Z", fork=True), pr(6, "2026-10-01T00:00:00Z"),
       pr(7, "2026-11-04T00:00:00Z")]
class Main(ohp.NoMain):
    blobs = {".github/workflows/x.yml": "main-blob", "prompt.md": "old"}
    texts = {"prompt.md": "# Master\nIf the fetch fails, go on.\n"}

    def blob(self, path):
        return self.blobs.get(path)

    def text(self, path):
        return self.texts.get(path)


MAIN = Main()


class Held(unittest.TestCase):
    def setUp(self):
        self.rows = ohp.held(PRS, FILES.__getitem__, RULES, MAIN)

    def test_only_same_repo_prs_touching_owned_paths_oldest_first(self):
        self.assertEqual([r["number"] for r in self.rows], [1, 2, 3, 7])

    def test_counts_unowned_files_and_owned_paths(self):
        first = self.rows[0]
        self.assertEqual(first["owned"], ["prompt.md"])
        self.assertEqual(first["unowned"], 1)
        self.assertTrue(first["draft"])

    def test_on_main_when_blob_matches(self):
        by = {r["number"]: r for r in self.rows}
        self.assertEqual(by[7]["on_main"], [".github/workflows/x.yml"])
        self.assertEqual(by[1]["on_main"], [])

    def test_removed_file_is_never_on_main(self):
        rows = ohp.held([pr(9, "2026-11-01T00:00:00Z")], {9: [f("prompt.md", "old", "removed")]}.__getitem__,
                        RULES, MAIN)
        self.assertEqual(rows[0]["on_main"], [])

    def test_shared_files_names_contended_file(self):
        self.assertEqual(ohp.shared_files(self.rows), [("prompt.md", [1, 3])])


class ChangeOnMain(unittest.TestCase):
    def test_every_added_line_present_counts(self):
        patch = "@@ -1,2 +1,2 @@\n # Master\n-old line\n+  If the fetch fails, go on.\n+\n"
        self.assertTrue(ohp.change_on_main(f("prompt.md", "new", "modified") | {"patch": patch}, MAIN))

    def test_rewrapped_fix_counts(self):
        patch = "@@ -1 +1,2 @@\n+If the fetch\n+fails, go on.\n"
        self.assertTrue(ohp.change_on_main(f("prompt.md", "new") | {"patch": patch}, MAIN))

    def test_one_new_line_is_enough_to_need_review(self):
        patch = "@@ -1 +1,2 @@\n+If the fetch fails, go on.\n+and something new\n"
        self.assertFalse(ohp.change_on_main(f("prompt.md", "new") | {"patch": patch}, MAIN))

    def test_no_patch_or_no_file_on_main(self):
        self.assertFalse(ohp.change_on_main(f("prompt.md", "new"), MAIN))
        self.assertFalse(ohp.change_on_main(f("prompts/x.py", "n") | {"patch": "+x\n"}, MAIN))

    def test_pure_deletion_patch_does_not_count(self):
        self.assertFalse(ohp.change_on_main(f("prompt.md", "new") | {"patch": "-gone\n"}, MAIN))


class Render(unittest.TestCase):
    NOW = dt.datetime(2026, 11, 13, tzinfo=dt.timezone.utc)

    def test_empty(self):
        self.assertIn("nothing waits on the owner", ohp.render([], self.NOW))

    def test_sections(self):
        out = ohp.render(ohp.held(PRS, FILES.__getitem__, RULES, MAIN), self.NOW)
        self.assertIn("4 open PR(s) wait on the owner", out)
        self.assertIn("| #1 | 12d | (draft) pr 1 |", out)
        self.assertIn("- `prompt.md`: #1, #3", out)
        self.assertIn("Already on main", out)
        self.assertIn("#7", out.split("Already on main")[1].splitlines()[0])
        self.assertIn("Mixed: 1 PR(s)", out)

    def test_pipe_in_title_does_not_break_table(self):
        rows = [{"number": 8, "title": "a | b", "created_at": "2026-11-12T00:00:00Z", "draft": False,
                 "owned": ["prompt.md"], "on_main": [], "unowned": 0}]
        self.assertIn("a / b", ohp.render(rows, self.NOW))


class GitMain(unittest.TestCase):
    def test_missing_ref_knows_nothing(self):
        main = ohp.GitMain("refs/does-not-exist")
        self.assertIsNone(main.blob("prompt.md"))
        self.assertIsNone(main.text("prompt.md"))


if __name__ == "__main__":
    unittest.main()
