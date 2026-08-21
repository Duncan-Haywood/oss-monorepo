"""Tests for the own-sites accessibility pass.

Standard-library `unittest`, no install step, no network:

    python3 -m unittest discover

The tests split into three groups. The first checks the corpus-shaping logic
(discovery and deduplication) on a temporary tree, because a miscount there
silently changes every rate in the README. The second checks the two summary
functions against a hand-built result set, so a wrong tally is visible without
running an engine. The third pins the saved results file so its headline
numbers cannot drift from the prose that quotes them.
"""

from __future__ import annotations

import json
import pathlib
import tempfile
import unittest

import audit_own_sites as own

RESULTS = pathlib.Path(__file__).resolve().parent / "results-2026-08-21.json"


def _page(app_counts_probe, app_counts_audit, app="ventures/x", page="p.html",
          findings=()):
    return {
        "app": app,
        "page": page,
        "findings": list(findings),
        "probe_criteria": app_counts_probe,
        "audit_py_criteria": app_counts_audit,
        "only_probe": {k: v for k, v in app_counts_probe.items()
                       if app_counts_audit.get(k, 0) < v},
        "only_audit_py": {k: v for k, v in app_counts_audit.items()
                          if app_counts_probe.get(k, 0) < v},
        "engines_agree": app_counts_probe == app_counts_audit,
    }


class Discovery(unittest.TestCase):
    """What counts as a built page, and which app it is attributed to."""

    def _tree(self, root):
        root = pathlib.Path(root)
        app = root / "ventures" / "demo"
        (app / ".next/server/app").mkdir(parents=True)
        (app / "package.json").write_text("{}")
        (app / ".next/server/app/index.html").write_text("<html></html>")
        return root, app

    def test_finds_prerendered_pages_under_an_app(self):
        with tempfile.TemporaryDirectory() as tmp:
            root, _ = self._tree(tmp)
            found = own.discover(root)
            self.assertEqual([label for label, _ in found], ["ventures/demo"])

    def test_a_nested_package_is_its_own_app(self):
        with tempfile.TemporaryDirectory() as tmp:
            root, app = self._tree(tmp)
            docs = app / "docs-site"
            (docs / "out").mkdir(parents=True)
            (docs / "package.json").write_text("{}")
            (docs / "out/index.html").write_text("<html></html>")
            labels = sorted({label for label, _ in own.discover(root)})
            self.assertEqual(labels, ["ventures/demo", "ventures/demo/docs-site"])

    def test_node_modules_is_never_an_app(self):
        with tempfile.TemporaryDirectory() as tmp:
            root, app = self._tree(tmp)
            dep = app / "node_modules" / "pkg"
            (dep / "out").mkdir(parents=True)
            (dep / "package.json").write_text("{}")
            (dep / "out/index.html").write_text("<html></html>")
            labels = sorted({label for label, _ in own.discover(root)})
            self.assertEqual(labels, ["ventures/demo"])

    def test_source_html_outside_a_build_directory_is_not_a_page(self):
        with tempfile.TemporaryDirectory() as tmp:
            root, app = self._tree(tmp)
            (app / "public").mkdir()
            (app / "public/legacy.html").write_text("<html></html>")
            names = [p.name for _, p in own.discover(root)]
            self.assertEqual(names, ["index.html"])


class Deduplication(unittest.TestCase):
    """Byte-identical pages are counted once."""

    def _pages(self, bodies):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        out = []
        for i, body in enumerate(bodies):
            path = pathlib.Path(tmp.name) / f"p{i}.html"
            path.write_text(body)
            out.append(("ventures/demo", path))
        return out

    def test_identical_bodies_collapse_to_one(self):
        unique, dupes = own.dedupe(self._pages(["<html>a</html>"] * 3))
        self.assertEqual((len(unique), len(dupes)), (1, 2))

    def test_different_bodies_are_all_kept(self):
        unique, dupes = own.dedupe(self._pages(["<html>a</html>", "<html>b</html>"]))
        self.assertEqual((len(unique), len(dupes)), (2, 0))

    def test_the_first_occurrence_is_the_one_kept(self):
        pages = self._pages(["<html>a</html>", "<html>a</html>"])
        unique, _ = own.dedupe(pages)
        self.assertEqual(unique[0][1].name, "p0.html")


class Summaries(unittest.TestCase):
    """The two tallies the README quotes, on a hand-built result set."""

    def test_defects_are_tallied_per_app_and_impact(self):
        data = {"per_page": [
            _page({}, {}, app="ventures/a", findings=[
                {"criterion": "3.1.1", "impact": "blocking",
                 "element": "html", "message": "m"},
                {"criterion": "3.1.1", "impact": "blocking",
                 "element": "html", "message": "m"},
                {"criterion": "2.4.6", "impact": "degrading",
                 "element": "h3", "message": "m"},
            ]),
            _page({}, {}, app="ventures/b"),
        ]}
        self.assertEqual(own.defects_by_app(data), {
            "ventures/a": {"2.4.6 (degrading)": 1, "3.1.1 (blocking)": 2},
        })

    def test_an_app_with_no_findings_is_absent_rather_than_zero(self):
        data = {"per_page": [_page({}, {}, app="ventures/clean")]}
        self.assertEqual(own.defects_by_app(data), {})

    def test_agreement_counts_pages_not_findings(self):
        data = {"per_page": [
            _page({"1.3.1": 4}, {"3.3.2": 4}),
            _page({"1.1.1": 1}, {"1.1.1": 1}),
        ]}
        self.assertEqual(own.agreement(data)["agreeing"], 1)
        self.assertEqual(own.agreement(data)["disagreeing"], 1)

    def test_a_relabelling_is_distinguished_from_a_detection_gap(self):
        relabel = {"per_page": [_page({"1.3.1": 1}, {"3.3.2": 1})]}
        missed = {"per_page": [_page({"1.3.1": 1}, {})]}
        self.assertEqual(own.agreement(relabel)["pure_relabellings"], 1)
        self.assertEqual(own.agreement(missed)["pure_relabellings"], 0)


class StylesheetFix(unittest.TestCase):
    """The bug: without a stylesheet, 1.4.3 finds nothing to decide at all.

    A future edit that drops the stylesheet argument from `measure()` should
    fail a test rather than silently reintroducing the gap `a11y-axe-recall/`
    found in this module.
    """

    LOW_CONTRAST_PAGE = (
        "<html lang='en'><head>"
        "<link rel='stylesheet' href='/style.css'></head>"
        "<body><p class='low'>text</p></body></html>"
    )
    CSS = ".low { color: #777; background-color: #999; }"

    def test_no_stylesheet_means_no_contrast_finding(self):
        probe = own.probe_findings(self.LOW_CONTRAST_PAGE)
        audit_criteria = own.audit_py_criteria(self.LOW_CONTRAST_PAGE)
        self.assertNotIn("1.4.3", {f["criterion"] for f in probe})
        self.assertNotIn("1.4.3", audit_criteria)

    def test_with_the_linked_stylesheet_both_engines_catch_it(self):
        import audit

        sheet = audit.merge_stylesheets([self.CSS])
        probe = own.probe_findings(self.LOW_CONTRAST_PAGE, stylesheet=sheet)
        audit_criteria = own.audit_py_criteria(self.LOW_CONTRAST_PAGE, stylesheet=sheet)
        self.assertIn("1.4.3", {f["criterion"] for f in probe})
        self.assertIn("1.4.3", audit_criteria)

    def test_css_for_app_reads_every_stylesheet_under_the_build_dirs(self):
        with tempfile.TemporaryDirectory() as tmp:
            app = pathlib.Path(tmp)
            (app / ".next/static/css").mkdir(parents=True)
            (app / ".next/static/css/a.css").write_text(".a { color: red; }")
            (app / "out/_next/css").mkdir(parents=True)
            (app / "out/_next/css/b.css").write_text(".b { color: blue; }")
            css = own.css_for_app(app)
            self.assertIn(".a { color: red; }", css)
            self.assertIn(".b { color: blue; }", css)

    def test_stylesheet_for_app_is_none_with_no_css(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertIsNone(own.stylesheet_for_app(pathlib.Path(tmp)))


class SavedResults(unittest.TestCase):
    """Pin the numbers the README quotes to the saved run."""

    @classmethod
    def setUpClass(cls):
        cls.data = json.loads(RESULTS.read_text())

    def test_corpus_size(self):
        corpus = self.data["corpus"]
        self.assertEqual(corpus["pages_unique"], 118)
        self.assertEqual(corpus["pages_built"], 138)
        self.assertEqual(len(corpus["apps"]), 7)

    def test_every_app_carries_at_least_one_finding(self):
        table = own.defects_by_app(self.data)
        self.assertEqual(sorted(table), sorted(self.data["corpus"]["apps"]))

    def test_missing_lang_appears_once_in_every_app(self):
        table = own.defects_by_app(self.data)
        for app, counts in table.items():
            self.assertEqual(counts.get("3.1.1 (blocking)"), 1, app)

    def test_agreement_rate(self):
        agree = own.agreement(self.data)
        self.assertEqual(agree["pages"], 118)
        self.assertEqual(agree["agreeing"], 91)

    def test_contrast_now_fires_where_the_build_css_declares_it(self):
        """Regression guard for the stylesheet fix: 1.4.3 must appear in the
        saved run wherever an app's build actually ships low-contrast text —
        confirmed independently against `a11y-contrast-decidability/`'s own
        21/333 counts for local-site-studio/ai-first-markets.
        """
        table = own.defects_by_app(self.data)
        self.assertEqual(
            table["ventures/local-site-studio"]["1.4.3 (blocking)"]
            + table["ventures/local-site-studio"]["1.4.3 (degrading)"],
            21,
        )
        self.assertEqual(
            table["ventures/ai-first-markets"]["1.4.3 (blocking)"]
            + table["ventures/ai-first-markets"]["1.4.3 (degrading)"],
            333,
        )
        self.assertNotIn("1.4.3 (blocking)", table.get("ventures/print-atelier", {}))

    def test_every_disagreement_is_a_relabelling_not_a_missed_defect(self):
        agree = own.agreement(self.data)
        self.assertEqual(agree["pure_relabellings"], agree["disagreeing"])


if __name__ == "__main__":
    unittest.main()
