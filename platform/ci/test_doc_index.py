import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path

import doc_index as di

TAX = {
    "report_kinds": {"analysis": "", "milestone": "", "lane": "", "brief": "", "polish": "", "note": ""},
    "subject_aliases": {"vtm": "verifiable-training-mechanisms"},
    "topics": [
        {"id": "python-env", "label": "Python and pytest", "aliases": ["pytest", "numpy"],
         "covered_by": ["guide.md#Python and tests"]},
        {"id": "shallow-clone", "label": "Shallow clones", "aliases": ["deepen", "merge-base"],
         "covered_by": ["guide.md#Shallow", "CLAUDE.md"]},
        {"id": "money", "label": "API keys", "aliases": ["billing"], "infer": ["billing"],
         "covered_by": ["CLAUDE.md"]},
    ],
}
SYSTEM = {"layers": [{"id": "entry"}, {"id": "runbook"}],
          "docs": [{"path": "CLAUDE.md", "layer": "entry"}, {"path": "guide.md", "layer": "runbook"}]}


def tree(tmp: Path, tax=TAX) -> Path:
    (tmp / "docs" / "reports").mkdir(parents=True)
    (tmp / "docs" / "posts").mkdir()
    (tmp / "docs" / "history").mkdir()
    (tmp / "prompts").mkdir()
    (tmp / "research" / "verifiable-training-mechanisms").mkdir(parents=True)
    (tmp / "ventures" / "shed-designer").mkdir(parents=True)
    (tmp / "docs" / "taxonomy.json").write_text(json.dumps(tax))
    (tmp / "prompts" / "system.json").write_text(json.dumps(SYSTEM))
    (tmp / "CLAUDE.md").write_text("# Entry\n")
    (tmp / "guide.md").write_text("# Guide\n\n## Shallow clones\n\n```\n## Python and tests (in a fence)\n```\n\n## Python and tests\n")
    return tmp


class Anchors(unittest.TestCase):
    def test_resolves_prefix_and_skips_fences(self):
        with tempfile.TemporaryDirectory() as d:
            root = tree(Path(d))
            path, head, line, err = di.resolve_anchor(root, "guide.md#python and TESTS")
            self.assertIsNone(err)
            self.assertEqual(line, 9)

    def test_dangling_anchor_fails_check(self):
        with tempfile.TemporaryDirectory() as d:
            tax = json.loads(json.dumps(TAX))
            tax["topics"][0]["covered_by"] = ["guide.md#Renamed section"]
            root = tree(Path(d), tax)
            self.assertTrue(any("Renamed section" in e for e in di.check(root)))

    def test_alias_collision_fails_check(self):
        with tempfile.TemporaryDirectory() as d:
            tax = json.loads(json.dumps(TAX))
            tax["topics"][1]["aliases"].append("PyTests")
            root = tree(Path(d), tax)
            self.assertTrue(any("collides" in e for e in di.check(root)))


class Reports(unittest.TestCase):
    def test_infer_from_name(self):
        slugs = {"verifiable-training-mechanisms": "research/x", "shed-designer": "ventures/x"}
        m = di.infer_report("vtm-milestone-48.md", "# VTM milestone 48 (agent note)\n", slugs, TAX)
        self.assertEqual(m["kind"], "milestone")
        self.assertEqual(m["subjects"], ["verifiable-training-mechanisms"])
        self.assertNotIn("date", m)  # never guessed
        m = di.infer_report("shed-designer-round3-lane6.md", "# lane 6: where the money goes\n", slugs, TAX)
        self.assertEqual((m["kind"], m["topics"]), ("lane", []))  # `money` only infers from "billing"
        m = di.infer_report("2026-10-30-billing-plan.md", "# Billing plan\n", slugs, TAX)
        self.assertEqual((m["kind"], m["date"], m["topics"]), ("analysis", "2026-10-30", ["money"]))
        m = di.infer_report("x-2026-10-29.md", "# Pytest and deepen\n", slugs, TAX)
        self.assertEqual((m["date"], m["topics"]), ("2026-10-29", ["python-env", "shallow-clone"]))

    def test_backfill_then_check(self):
        with tempfile.TemporaryDirectory() as d:
            root = tree(Path(d))
            r = root / "docs" / "reports"
            (r / "vtm-milestone-1.md").write_text("# m1\n\nbody\n")
            (r / "2026-10-20-x.md").write_text("---\ntitle: X\ndescription: d\n---\n# X\n")
            self.assertEqual(len([e for e in di.check(root) if "no front matter" in e]), 2)
            di.backfill(root, write=True)
            self.assertEqual(di.check(root), [])
            text = (r / "2026-10-20-x.md").read_text()
            self.assertTrue(text.startswith("---\nkind: analysis\n"))
            meta, body = di.parse_frontmatter(text)
            self.assertEqual((meta["title"], meta["date"], body), ("X", "2026-10-20", "# X\n"))
            self.assertEqual(di.backfill(root), [])  # idempotent

    def test_bad_tags(self):
        with tempfile.TemporaryDirectory() as d:
            root = tree(Path(d))
            (root / "docs" / "reports" / "a.md").write_text(
                "---\nkind: essay\ntopics: [pytests]\nsubjects: [nope]\ndate: 3 Nov\n---\n# a\n")
            errs = "\n".join(di.check(root))
            for want in ("kind 'essay'", "did you mean 'python-env'", "subject 'nope'", "not YYYY-MM-DD"):
                self.assertIn(want, errs)


class Find(unittest.TestCase):
    def test_alias_finds_guidance_reports_posts(self):
        with tempfile.TemporaryDirectory() as d:
            root = tree(Path(d))
            (root / "docs" / "reports" / "a.md").write_text("---\nkind: note\ntopics: [shallow-clone]\ndate: 2026-10-01\n---\n# A\n")
            (root / "docs" / "reports" / "b.md").write_text("---\nkind: note\ntopics: [shallow-clone]\ndate: 2026-10-05\nstatus: superseded\n---\n# B\n")
            (root / "docs" / "posts" / "2026-10-02-p.md").write_text("---\ntitle: P\ntags: [Deepen, git]\n---\n")
            (root / "docs" / "history" / "shallow-clone-2026-10-01.md").write_text("# h\n")
            r = di.find("merge-base", root)
            self.assertEqual([t["id"] for t in r["topics"]], ["shallow-clone"])
            self.assertEqual([g["layer"] for g in r["guidance"]], ["entry", "runbook"])  # precedence order
            self.assertEqual([x["path"] for x in r["reports"]], ["docs/reports/a.md", "docs/reports/b.md"])
            self.assertEqual([x["path"] for x in r["posts"]], ["docs/posts/2026-10-02-p.md"])
            self.assertEqual(r["history"], ["docs/history/shallow-clone-2026-10-01.md"])

    def test_project_and_unknown(self):
        with tempfile.TemporaryDirectory() as d:
            root = tree(Path(d))
            self.assertEqual(di.find("vtm", root)["projects"][0]["path"], "research/verifiable-training-mechanisms")
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(di.main(["--root", str(root), "find", "zzz-nothing"]), 1)


class GlobAndCli(unittest.TestCase):
    def test_glob_semantics(self):
        m = lambda pat, s: bool(di._glob_re(pat).match(s))
        self.assertTrue(m("a/**/b.md", "a/b.md"))
        self.assertTrue(m("a/**/b.md", "a/x/y/b.md"))
        self.assertTrue(m("a/**", "a/x/y"))
        self.assertTrue(m("a/*.md", "a/b.md"))
        self.assertFalse(m("a/*.md", "a/x/b.md"))  # * stops at a slash
        self.assertTrue(m("a.md", "a.md"))
        self.assertFalse(m("a.md", "aXmd"))  # . is literal
        self.assertTrue(m("ab", "ab"))  # every literal char consumed once

    def test_cli_exit_codes_and_backfill(self):
        with tempfile.TemporaryDirectory() as d:
            root = tree(Path(d))
            (root / "docs" / "reports" / "2026-10-01-pytest-notes.md").write_text("# no front matter\n")
            out = io.StringIO()
            with contextlib.redirect_stdout(out), contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(di.main(["--root", str(root), "check"]), 1)  # untagged report fails
                self.assertEqual(di.main(["--root", str(root), "backfill"]), 0)
                self.assertIn("2026-10-01-pytest-notes.md", out.getvalue())
                f = root / "docs" / "reports" / "2026-10-01-pytest-notes.md"
                self.assertNotIn("kind:", f.read_text())  # dry run writes nothing
                self.assertEqual(di.main(["--root", str(root), "backfill", "--write"]), 0)
                self.assertIn("kind:", f.read_text())
                self.assertEqual(di.main(["--root", str(root), "check"]), 0)

    def test_topic_counts_reads_report_topics(self):
        with tempfile.TemporaryDirectory() as d:
            root = tree(Path(d))
            (root / "docs" / "reports" / "r.md").write_text("---\nkind: note\ntopics: [python-env]\n---\n# r\n")
            counts = {t[0]: t[2] for t in di.topic_counts(root)}
            self.assertEqual(counts["python-env"], 1)
            self.assertEqual(counts["money"], 0)

    def test_topic_counts_post_column_counts_posts_once_per_topic(self):
        with tempfile.TemporaryDirectory() as d:
            root = tree(Path(d))
            (root / "docs" / "posts" / "2026-10-02-p.md").write_text("---\ntitle: P\ntags: [Deepen, merge-base]\n---\n")
            posts = {t[0]: t[3] for t in di.topic_counts(root)}
            self.assertEqual(posts["shallow-clone"], 1)  # two aliases of one topic count once
            self.assertEqual(posts["money"], 0)  # a topic with no post reads 0, not 1

    def test_print_find_shows_guidance_lines_and_topic_only_or_project_only_terms(self):
        with tempfile.TemporaryDirectory() as d:
            root = tree(Path(d))
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                di.print_find(di.find("merge-base", root))
            text = out.getvalue()
            self.assertIn("topic shallow-clone: Shallow clones", text)
            self.assertIn("[runbook] guide.md:", text)
            self.assertIn('"shallow clones"', text)
            for term, expect in (("vtm", "project vtm"), ("money", "topic money")):
                out = io.StringIO()
                with contextlib.redirect_stdout(out):
                    di.print_find(di.find(term, root))
                self.assertNotIn("names no topic or project", out.getvalue(), term)


class Parsing(unittest.TestCase):
    def test_frontmatter_skips_indented_comment_and_colonless_lines(self):
        text = "---\nkind: note\n  nested: x\n# c: y\nno colon here\ndate: 2026-01-02\n---\nbody\n"
        meta, body = di.parse_frontmatter(text)
        self.assertEqual(meta, {"kind": "note", "date": "2026-01-02"})
        self.assertEqual(body, "body\n")

    def test_project_slugs_ignore_files_and_hidden_dirs(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "ventures" / "real").mkdir(parents=True)
            (root / "ventures" / ".hidden").mkdir()
            (root / "ventures" / "_private").mkdir()
            (root / "ventures" / "afile").write_text("x")
            self.assertEqual(di.project_slugs(root), {"real": "ventures/real"})


class RedTeam20261111(unittest.TestCase):
    """Guards for the mutants that escaped on 2026-11-11, and the defects that run found."""

    def test_three_letter_tags_keep_their_s(self):
        self.assertEqual(di.tag_key("DNS"), "dns")
        self.assertEqual(di.tag_key("Pytests"), "pytest")

    def test_glob_layer_needs_a_match(self):
        with tempfile.TemporaryDirectory() as d:
            root = tree(Path(d))
            sysj = {"layers": [{"id": "entry"}, {"id": "area"}],
                    "docs": [{"path": "CLAUDE.md", "layer": "entry"}, {"glob": "ventures/**/AGENTS.md", "layer": "area"}]}
            (root / "prompts" / "system.json").write_text(json.dumps(sysj))
            self.assertEqual(di.layer_of(root, "ventures/x/AGENTS.md"), "area")
            self.assertIsNone(di.layer_of(root, "guide.md"))

    def test_brief_from_name_or_title_alone(self):
        self.assertEqual(di.infer_report("x-for-agents.md", "# X\n", {}, TAX)["kind"], "brief")
        self.assertEqual(di.infer_report("x.md", "# X (agent note)\n", {}, TAX)["kind"], "brief")

    def test_two_and_three_word_aliases_tag(self):
        tax = json.loads(json.dumps(TAX))
        tax["topics"][2]["infer"] = True
        tax["topics"][2]["aliases"] = ["billing", "api-key-switch"]
        m = di.infer_report("x.md", "# Notes on merge base\n", {}, tax)
        self.assertEqual(m["topics"], ["shallow-clone"])
        m = di.infer_report("x.md", "# The API key switch\n", {}, tax)
        self.assertEqual(m["topics"], ["money"])

    def test_cli_help_and_missing_command(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out), self.assertRaises(SystemExit):
            di.main(["--help"])
        self.assertIn(di.__doc__.split("\n\n")[0].split("\n")[0][:40], " ".join(out.getvalue().split()))
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as cm:
            di.main([])
        self.assertEqual(cm.exception.code, 2)

    # Real defects (2026-11-11), each reproduced on main before the fix.

    def test_polish_after_the_date_is_polish(self):
        slugs = {"shed-designer": "ventures/shed-designer"}
        m = di.infer_report("2026-11-06-polish-shed-designer-faq.md", "# FAQ\n", slugs, TAX)
        self.assertEqual((m["kind"], m["date"], m["subjects"]), ("polish", "2026-11-06", ["shed-designer"]))

    def test_crlf_front_matter_is_read_and_not_duplicated(self):
        with tempfile.TemporaryDirectory() as d:
            root = tree(Path(d))
            f = root / "docs" / "reports" / "a.md"
            f.write_bytes(b"---\r\nkind: note\r\ntopics: [python-env]\r\n---\r\n# A\r\n")
            self.assertEqual(di.check(root), [])
            di.backfill(root, write=True)
            self.assertEqual(f.read_bytes().count(b"---"), 2)

    def test_backfill_keeps_fields_it_does_not_know(self):
        with tempfile.TemporaryDirectory() as d:
            root = tree(Path(d))
            f = root / "docs" / "reports" / "2026-10-20-x.md"
            f.write_text("---\nowner: research\ntitle: X\n---\n# X\n")
            di.backfill(root, write=True)
            meta, _ = di.parse_frontmatter(f.read_text())
            self.assertEqual((meta["kind"], meta["owner"], meta["title"]), ("analysis", "research", "X"))

    def test_backfill_canonicalises_alias_topics(self):
        # 'aeo' reached main as a topic three times; the check names the fix and backfill applies it.
        with tempfile.TemporaryDirectory() as d:
            root = tree(Path(d))
            f = root / "docs" / "reports" / "a.md"
            f.write_text("---\nkind: note\ntopics: [Pytests, deepen, python-env]\n---\n# A\n")
            errs = di.check(root)
            self.assertTrue(errs and all("backfill --write" in e for e in errs), errs)
            self.assertEqual([n for n, _ in di.backfill(root)], ["a.md"])
            di.backfill(root, write=True)
            meta, body = di.parse_frontmatter(f.read_text())
            self.assertEqual((meta["topics"], body), (["python-env", "shallow-clone"], "# A\n"))
            self.assertEqual(di.check(root), [])
            self.assertEqual(di.backfill(root), [])


class RealTree(unittest.TestCase):
    def test_repository_taxonomy_and_reports_check(self):
        self.assertEqual(di.check(di.ROOT), [])


if __name__ == "__main__":
    unittest.main()
