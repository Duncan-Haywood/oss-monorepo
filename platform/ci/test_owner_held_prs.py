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

    def test_shared_files_ties_break_by_file_name(self):
        rows = [{"number": 1, "owned": ["b.md"]}, {"number": 2, "owned": ["b.md"]},
                {"number": 3, "owned": ["a.md"]}, {"number": 4, "owned": ["a.md"]}]
        self.assertEqual(ohp.shared_files(rows), [("a.md", [3, 4]), ("b.md", [1, 2])])


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


def row(n, title="t", added="", owned=("prompt.md",), on_main=()):
    return {"number": n, "title": title, "created_at": "2026-11-12T00:00:00Z", "draft": False,
            "owned": list(owned), "on_main": list(on_main), "unowned": 0, "added": added}


class Redteam(unittest.TestCase):
    """2026-11-15: three red-team runs each re-checked all 12 open entries by hand,
    though every one already had a fix waiting on the owner in a held PR."""

    WIRING = {"record": "r1.json", "index": 4, "file": ".github/workflows/portfolio-validate.yml",
              "issue": "check_csv_formula_guard.py runs in no PR workflow. Fix: in portfolio-validate.yml "
                       "add `python3 platform/ci/check_csv_formula_guard.py` and a step "
                       "`python3 -m unittest test_check_csv_formula_guard`."}
    NAMED = {"record": "r2.json", "index": 1, "file": "prompts/redteam.py",
             "issue": "run_suite kills only node; fix in control-plane PR #15945."}
    ORPHAN = {"record": "r3.json", "index": 0, "file": "platform/ci/x.py",
              "issue": "nothing guards report.mjs rounding."}

    def test_tokens_skip_the_file_it_is_filed_under(self):
        toks = ohp.entry_tokens(self.WIRING)
        self.assertIn("check_csv_formula_guard", toks)
        self.assertNotIn("portfolio-validate.yml", toks)
        self.assertNotIn("portfolio-validate", toks)

    def test_workflow_keywords_are_not_tokens(self):
        e = {"file": "x.yml", "issue": "add to both pull_request and push paths"}
        self.assertEqual(ohp.entry_tokens(e), [])

    def test_bare_stem_is_not_a_token(self):
        self.assertEqual(ohp.entry_tokens(self.ORPHAN), ["report.mjs"])

    def test_matches_added_lines_and_named_prs(self):
        rows = [row(15248, "wire csv", "- run: python3 platform/ci/check_csv_formula_guard.py"),
                row(15945, "kill the group", "os.killpg(p.pid)"),
                row(14000, "edits portfolio-validate.yml", "- run: other.py",
                    owned=(".github/workflows/portfolio-validate.yml",))]
        got = {m["record"]: [h["number"] for h in m["held_in"]]
               for m in ohp.match_redteam([self.WIRING, self.NAMED, self.ORPHAN], rows)}
        self.assertEqual(got, {"r1.json": [15248], "r2.json": [15945], "r3.json": []})

    def test_render_counts_and_flags_entries_with_no_pr(self):
        rows = [row(15248, added="check_csv_formula_guard.py", on_main=("prompt.md",))]
        out = ohp.render_redteam(ohp.match_redteam([self.WIRING, self.ORPHAN], rows))
        self.assertIn("2 open red-team entries", out)
        self.assertIn("1 have a fix waiting", out)
        self.assertIn("#15248 (check_csv_formula_guard.py, check_csv_formula_guard; already on main)", out)
        self.assertIn("NO HELD PR", out.split("r3.json")[1])

    def test_open_list_loads_from_the_repo(self):
        self.assertIsInstance(ohp.load_redteam_open(), list)


class GitMain(unittest.TestCase):
    def test_missing_ref_knows_nothing(self):
        main = ohp.GitMain("refs/does-not-exist")
        self.assertIsNone(main.blob("prompt.md"))
        self.assertIsNone(main.text("prompt.md"))

    def test_only_blob_entries_count(self):
        # A submodule shows in ls-tree as a "commit" gitlink with three fields
        # too; its sha is not a file on main and must not read as one.
        import subprocess
        from unittest import mock
        out = ("100644 blob aaa\tprompt.md\n"
               "160000 commit bbb\tvendor/sub\n")
        done = subprocess.CompletedProcess([], 0, stdout=out, stderr="")
        with mock.patch("subprocess.run", return_value=done):
            main = ohp.GitMain("origin/main")
        self.assertEqual(main.blob("prompt.md"), "aaa")
        self.assertIsNone(main.blob("vendor/sub"))


if __name__ == "__main__":
    unittest.main()
