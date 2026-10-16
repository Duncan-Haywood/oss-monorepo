"""Tests for research_archive.py against throwaway git repositories and a fake GraphQL API."""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

import research_archive as archive

ENV = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t",
       "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"}


def sh(cwd: Path, *args: str) -> str:
    return subprocess.run(["git", *args], cwd=cwd, env=ENV, check=True,
                          capture_output=True, text=True).stdout.strip()


class Branches(unittest.TestCase):
    """An upstream with branches and pull refs, an origin, and a clone of origin."""

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        base = Path(tmp.name)
        self.upstream, self.origin, self.work, self.here = (base / n for n in ("up.git", "origin.git", "w", "here"))
        sh(base, "init", "-q", "--bare", str(self.upstream))
        sh(base, "init", "-q", "--bare", str(self.origin))
        sh(base, "init", "-q", "-b", "main", str(self.work))
        self.commit("a")
        sh(self.work, "push", "-q", str(self.upstream), "main")
        sh(self.work, "push", "-q", str(self.origin), "main")
        sh(base, "clone", "-q", "-b", "main", str(self.origin), str(self.here))

    def commit(self, name: str) -> str:
        (self.work / name).write_text(name)
        sh(self.work, "add", name)
        sh(self.work, "commit", "-qm", name)
        return sh(self.work, "rev-parse", "HEAD")

    def push_up(self, src: str, ref: str) -> None:
        sh(self.work, "push", "-qf", str(self.upstream), f"{src}:{ref}")

    def archive(self, do_push=True):
        """What is still not a branch here after the run."""
        return archive.archive_branches(self.here, str(self.upstream), "origin", do_push)[1]

    def wanted(self):
        return archive.archive_branches(self.here, str(self.upstream), "origin", False)[0]

    def test_every_branch_is_archived_under_the_prefix(self):
        sh(self.work, "checkout", "-qb", "claude/x")
        tip = self.commit("x")
        self.push_up("claude/x", "refs/heads/claude/x")
        self.assertEqual(set(self.archive(do_push=False)), {"archive/research/main", "archive/research/claude/x"})
        self.assertEqual(self.archive(), {})
        have = archive.archived_refs(self.here, "origin")
        self.assertEqual(have["archive/research/claude/x"], tip)
        self.assertEqual(self.archive(), {}, "a second run has nothing to do")

    def test_only_pull_heads_no_branch_contains_get_a_branch(self):
        sh(self.work, "checkout", "-qb", "kept")
        kept = self.commit("k")
        self.push_up("kept", "refs/heads/kept")
        self.push_up(kept, "refs/pull/1/head")
        sh(self.work, "checkout", "-qb", "squashed", "main")
        gone = self.commit("s")
        self.push_up(gone, "refs/pull/2/head")
        want = self.wanted()
        self.assertNotIn("archive/research-pull/1", want)
        self.assertEqual(want["archive/research-pull/2"], gone)

    def test_a_branch_deleted_upstream_stays_archived(self):
        sh(self.work, "checkout", "-qb", "doomed")
        self.commit("d")
        self.push_up("doomed", "refs/heads/doomed")
        self.archive()
        sh(self.work, "push", "-q", str(self.upstream), ":refs/heads/doomed")
        self.assertEqual(self.archive(), {})
        self.assertIn("archive/research/doomed", archive.archived_refs(self.here, "origin"))

    def test_a_refused_branch_does_not_stop_the_others_and_the_bundle_keeps_it(self):
        # Per ref, as GitHub refuses a branch that would add a workflow file.
        hook = self.origin / "hooks" / "update"
        hook.write_text("#!/bin/sh\ncase $1 in *blocked*) echo refused >&2; exit 1;; esac\nexit 0\n")
        hook.chmod(0o755)
        for name in ("blocked", "fine"):
            sh(self.work, "checkout", "-qb", name, "main")
            self.commit(name)
            self.push_up(name, f"refs/heads/{name}")
        refused = self.archive()
        self.assertEqual(set(refused), {"archive/research/blocked"})
        self.assertIn("archive/research/fine", archive.archived_refs(self.here, "origin"))
        meta = self.here.parent / "meta"
        self.assertEqual(archive.write_bundle(self.here, meta, self.wanted()), 2)
        self.assertEqual(sh(self.here, "for-each-ref", archive.BUNDLE_NS), "", "temporary refs are removed")
        kept = archive.bundled(self.here, meta)
        self.assertEqual(kept["archive/research/blocked"], refused["archive/research/blocked"])
        self.assertIn("archive/research/main", kept, "a tip main contains needs no bundle")
        fresh = self.here.parent / "fresh"
        sh(self.here.parent, "clone", "-q", "-b", "main", str(self.origin), str(fresh))
        sh(fresh, "fetch", "-q", str(meta / archive.BUNDLE), f"{archive.BUNDLE_NS}*:refs/heads/*")
        self.assertEqual(sh(fresh, "rev-parse", "archive/research/blocked"), refused["archive/research/blocked"])

    def test_upstream_work_not_yet_synced_here_goes_in_the_bundle(self):
        sh(self.work, "checkout", "-q", "main")
        merged = self.commit("merged upstream, not synced")
        self.push_up("main", "refs/heads/main")
        meta = self.here.parent / "meta"
        self.assertEqual(archive.write_bundle(self.here, meta, self.wanted()), 1)
        self.assertEqual(archive.bundled(self.here, meta)["archive/research/main"], merged)

    def test_main_check_needs_upstream_main_in_our_history(self):
        tip = sh(self.here, "rev-parse", "HEAD")
        self.assertTrue(archive.main_check(self.here, tip)["ok"])
        sh(self.work, "checkout", "-qb", "elsewhere")
        later = self.commit("later")
        self.push_up("elsewhere", "refs/heads/elsewhere")
        sh(self.here, "fetch", "-q", str(self.upstream), "elsewhere")
        self.assertIn("not in this repository's history",
                      archive.main_check(self.here, later)["detail"])

    def test_a_moved_branch_is_moved_here(self):
        sh(self.work, "checkout", "-qb", "moving")
        self.commit("m1")
        self.push_up("moving", "refs/heads/moving")
        self.archive()
        tip = self.commit("m2")
        self.push_up("moving", "refs/heads/moving")
        self.assertEqual(self.archive(do_push=False), {"archive/research/moving": tip})
        self.archive()
        self.assertEqual(archive.archived_refs(self.here, "origin")["archive/research/moving"], tip)


def conn(nodes, more=False, cursor=None):
    return {"nodes": nodes, "pageInfo": {"hasNextPage": more, "endCursor": cursor}}


def pr(number, **extra):
    node = {"id": f"PR{number}", "number": number, "title": f"t{number}", "state": "MERGED",
            "mergedAt": "2026-10-01T00:00:00Z", "updatedAt": "2026-10-01T00:00:00Z",
            "headRefName": f"b{number}", "headRefOid": "f" * 40,
            "labels": conn([]), "comments": conn([]), "reviews": conn([]), "reviewThreads": conn([])}
    node.update(extra)
    return node


class FakeAPI:
    def __init__(self, pages, nodes=None):
        self.pages, self.nodes, self.calls = pages, nodes or {}, []

    def __call__(self, query, variables):
        self.calls.append((query, variables))
        if "node(id:" in query:
            return {"node": self.nodes[(variables["id"], variables["after"])]}
        kind = "pullRequests" if "pullRequests(" in query else "issues"
        return {"repository": {kind: self.pages[kind][variables["after"]]}}


class Export(unittest.TestCase):
    def test_pages_and_nested_connections_are_drained(self):
        thread = {"id": "T1", "path": "a.py", "comments": conn([{"body": "c1"}], True, "tc")}
        first = pr(1, comments=conn([{"body": "one"}], True, "c"), reviewThreads=conn([thread]))
        api = FakeAPI(
            {"pullRequests": {None: conn([first], True, "p"), "p": conn([pr(2)])}},
            {("PR1", "c"): {"comments": conn([{"body": "two"}])},
             ("T1", "tc"): {"comments": conn([{"body": "c2"}])}})
        pulls = archive.fetch_all(api, "pullRequests")
        self.assertEqual([p["number"] for p in pulls], [1, 2])
        self.assertEqual([c["body"] for c in pulls[0]["comments"]], ["one", "two"])
        self.assertEqual([c["body"] for c in pulls[0]["reviewThreads"][0]["comments"]], ["c1", "c2"])
        self.assertNotIn("id", pulls[0], "GraphQL node ids are dropped from the export")

    def test_write_export_and_index(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            (out / "pulls").mkdir()
            (out / "pulls" / "99.json").write_text("{}")
            pulls = [archive.flatten(pr(1)), archive.flatten(pr(2, title="a | b"))]
            archived = {"archive/research/b1": "f" * 40, "archive/research-pull/2": "e" * 40}
            archive.write_export(out, {"description": "d"}, pulls, [], archived)
            self.assertEqual(sorted(p.name for p in (out / "pulls").iterdir()), ["1.json", "2.json"])
            index = (out / "INDEX.md").read_text()
            self.assertIn("`archive/research/b1`", index)
            self.assertIn("`archive/research-pull/2`", index)
            self.assertIn("a \\| b", index)
            self.assertEqual(archive.exported(out, "pullRequests"), {1: "2026-10-01T00:00:00Z",
                                                                     2: "2026-10-01T00:00:00Z"})


class Ready(unittest.TestCase):
    def test_export_check_names_missing_stale_and_open(self):
        listing = {1: {"updatedAt": "u1", "state": "MERGED"}, 2: {"updatedAt": "u2b", "state": "OPEN"},
                   3: {"updatedAt": "u3", "state": "CLOSED"}}
        problems = archive.check_export(listing, {1: "u1", 2: "u2"}, "pull requests")
        self.assertEqual(len(problems), 3)
        self.assertIn("not exported: 3", problems[0])
        self.assertIn("changed since the export: 2", problems[1])
        self.assertIn("#2", problems[2])
        self.assertEqual(archive.check_export({1: listing[1]}, {1: "u1"}, "pull requests"), [])

    def test_record_writes_the_verdict(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            ok = archive.record(out, [{"name": "a", "ok": True, "detail": "d"},
                                      {"name": "b", "ok": False, "detail": "e"}], "2026-10-16T00:00Z")
            self.assertFalse(ok)
            data = json.loads((out / "READY.json").read_text())
            self.assertFalse(data["ready"])
            self.assertIn("**Not yet**", (out / "READY.md").read_text())
            self.assertTrue(archive.record(out, [{"name": "a", "ok": True, "detail": "d"}], "x"))
            self.assertIn("**Yes**", (out / "READY.md").read_text())


if __name__ == "__main__":
    unittest.main()
