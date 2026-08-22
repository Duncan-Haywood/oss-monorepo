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

RESULTS = pathlib.Path(__file__).resolve().parent / "results-2026-08-22.json"


def _page(app_counts_probe, app_counts_audit, app="ventures/x", page="p.html",
          findings=(), provenance=None):
    return {
        "app": app,
        "page": page,
        "provenance": provenance,
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


class Exclusions(unittest.TestCase):
    """The build-artifact filter's effect, tallied on a hand-built result set.

    Finding 1 asked for this filter and Finding 5 measures it. The tally has to
    keep two things apart that a single "excluded" count would merge: what the
    filter removed, and what a cheaper filter would have removed *as well* —
    the second is the whole reason this one reads markers instead of filenames.
    """

    SHELL = {"criterion": "3.1.1", "impact": "blocking", "element": "html",
             "message": "m"}

    def test_excluded_pages_and_their_findings_are_counted(self):
        data = {"per_page": [
            _page({}, {}, page="500.html", provenance="next-error-shell",
                  findings=[self.SHELL]),
            _page({}, {}, page="index.html", findings=[
                {"criterion": "1.1.1", "impact": "blocking", "element": "img",
                 "message": "m"}]),
        ]}
        ex = own.exclusions(data)
        self.assertTrue(ex["measured"])
        self.assertEqual((ex["pages"], ex["pages_excluded"]), (2, 1))
        self.assertEqual((ex["findings_total"], ex["findings_excluded"]), (2, 1))
        self.assertEqual(ex["criteria_excluded"], {"3.1.1": 1})
        self.assertEqual(ex["by_emitter"], {"next-error-shell": 1})

    def test_a_kept_page_with_an_error_page_name_is_reported(self):
        """The measurement Finding 5 turns on.

        `404.html` is rendered through the project's own layout and is a page
        real users reach. A filter keyed on the filename would delete it from
        the customer's audit and report nothing unusual; this counts it.
        """
        data = {"per_page": [
            _page({}, {}, page="500.html", provenance="next-error-shell"),
            _page({}, {}, page="404.html"),
        ]}
        ex = own.exclusions(data)
        self.assertEqual(ex["pages_kept_by_name"], ["ventures/x/404.html"])

    def test_a_results_file_predating_the_filter_says_so(self):
        """Absent field != nothing excluded. An old file must not read clean."""
        row = _page({}, {})
        row.pop("provenance")
        ex = own.exclusions({"per_page": [row]})
        self.assertFalse(ex["measured"])
        self.assertEqual(ex["pages_excluded"], 0)


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

    def test_every_disagreement_is_a_relabelling_not_a_missed_defect(self):
        agree = own.agreement(self.data)
        self.assertEqual(agree["pure_relabellings"], agree["disagreeing"])

    def test_the_filter_removes_exactly_the_seven_framework_lang_findings(self):
        """Finding 5's headline, pinned to the saved run.

        The claim is narrow and worth keeping narrow: 7 documents, 7 findings,
        all of them 3.1.1, which is exactly the false-positive class Finding 1
        identified by hand. If this filter ever starts removing a second
        criterion, that is a new claim about what a customer cannot fix and it
        should fail here first.
        """
        ex = own.exclusions(self.data)
        self.assertTrue(ex["measured"])
        self.assertEqual(ex["pages_excluded"], 7)
        self.assertEqual(ex["findings_excluded"], 7)
        self.assertEqual(ex["criteria_excluded"], {"3.1.1": 7})
        self.assertEqual(
            ex["by_emitter"],
            {"next-builtin-error-page": 5, "next-error-shell": 2},
        )

    def test_the_filter_keeps_the_seven_project_pages_a_naive_one_would_take(self):
        """The other half of Finding 5, and the half that fails silently.

        One `_not-found.html` per app: the project's own page, reached by real
        users, sharing a filename with the framework's documents. A filter that
        started matching filenames would delete all 7 from a customer's audit
        and look exactly as correct as this one.
        """
        ex = own.exclusions(self.data)
        self.assertEqual(len(ex["pages_kept_by_name"]), 7)
        self.assertTrue(
            all(p.endswith("/_not-found.html") for p in ex["pages_kept_by_name"]),
            ex["pages_kept_by_name"],
        )

    def test_contrast_is_evaluated_not_silently_absent(self):
        """2026-08-21: both adapters used to call their engine with no
        stylesheet at all, so 1.4.3 always found nothing to decide on every
        page in this corpus (see the `css_for_app`/`stylesheet_for_app`
        fix). A saved run with zero 1.4.3 findings anywhere is that bug, not
        a clean corpus — the fixed adapters find it on 4 of 7 apps.
        """
        table = own.defects_by_app(self.data)
        apps_with_contrast = [
            app for app, counts in table.items()
            if any(k.startswith("1.4.3") for k in counts)
        ]
        self.assertTrue(apps_with_contrast)


class StylesheetIsFed(unittest.TestCase):
    """The bug this pass fixed: both adapters used to call their engine with
    no stylesheet, so 1.4.3 silently found nothing to decide. Pin the fix on
    a synthetic page so a future edit that drops the stylesheet argument
    fails a test rather than quietly reintroducing the gap.
    """

    LOW_CONTRAST_PAGE = (
        "<html lang='en'><body>"
        "<p class='low'>text</p>"
        "</body></html>"
    )
    LOW_CONTRAST_CSS = ".low { color: #777777; background-color: #808080; }"

    def test_css_for_app_reads_the_whole_next_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            app = pathlib.Path(tmp)
            # CSS lives under `.next/static/css/`, a sibling of `server/` —
            # not under either of the BUILD_DIRS `discover()` walks for HTML.
            css_dir = app / ".next" / "static" / "css"
            css_dir.mkdir(parents=True)
            (css_dir / "app.css").write_text(self.LOW_CONTRAST_CSS)
            self.assertIn("low", own.css_for_app(app))

    def test_stylesheet_for_app_is_none_with_no_css(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertIsNone(own.stylesheet_for_app(pathlib.Path(tmp)))

    def test_probe_finds_contrast_only_when_given_the_stylesheet(self):
        without = own.probe_findings(self.LOW_CONTRAST_PAGE, stylesheet=None)
        self.assertFalse(any(f["criterion"] == "1.4.3" for f in without))

        import audit
        sheet = audit.merge_stylesheets([self.LOW_CONTRAST_CSS])
        with_sheet = own.probe_findings(self.LOW_CONTRAST_PAGE, stylesheet=sheet)
        self.assertTrue(any(f["criterion"] == "1.4.3" for f in with_sheet))

    def test_audit_py_finds_contrast_only_when_given_the_stylesheet(self):
        without = own.audit_py_criteria(self.LOW_CONTRAST_PAGE, stylesheet=None)
        self.assertNotIn("1.4.3", without)

        import audit
        sheet = audit.merge_stylesheets([self.LOW_CONTRAST_CSS])
        with_sheet = own.audit_py_criteria(self.LOW_CONTRAST_PAGE, stylesheet=sheet)
        self.assertIn("1.4.3", with_sheet)


if __name__ == "__main__":
    unittest.main()
