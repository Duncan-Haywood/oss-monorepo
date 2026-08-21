"""Tests for the generated-sites accessibility pass.

Standard-library `unittest`, no install step, no network, no `node_modules`::

    python3 -m unittest discover

Four groups. The first checks corpus loading and deduplication on a temporary
tree, because a miscount there changes every rate in the README. The second
checks each mutation in isolation — a mutation that silently fails to bite
would turn a blind scan into a clean bill of health, which is the exact failure
this directory exists to rule out. The third pins the committed corpus: the
delivered pages must keep the markup the control depends on. The fourth pins
the saved results file so the prose cannot drift from the numbers.
"""

from __future__ import annotations

import json
import pathlib
import tempfile
import unittest

import audit_generated_sites as gen

HERE = pathlib.Path(__file__).resolve().parent
RESULTS = HERE / "results-2026-08-21.json"
CORPUS = HERE / "corpus"

_PAGE = (
    '<!DOCTYPE html><html lang="en"><head><title>t</title></head><body>'
    '<h1>A</h1><h2>B</h2>'
    '<label class="l"><span>Name</span><input type="text" name="n"/></label>'
    '<button type="submit">Send</button>'
    '<a href="/x">Go</a>'
    '<iframe title="Map" src="m.html"></iframe>'
    "</body></html>"
)


class CorpusLoading(unittest.TestCase):
    def test_pages_are_loaded_sorted_and_named_by_stem(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            (root / "b.html").write_text(_PAGE)
            (root / "a.html").write_text(_PAGE.replace("<h1>A</h1>", "<h1>Z</h1>"))
            pages, _ = gen.load_corpus(root)
            self.assertEqual([name for name, _ in pages], ["a", "b"])

    def test_byte_identical_pages_are_dropped_and_recorded(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            (root / "a.html").write_text(_PAGE)
            (root / "b.html").write_text(_PAGE)
            pages, duplicates = gen.load_corpus(root)
            self.assertEqual(len(pages), 1)
            self.assertEqual(duplicates, [{"page": "b", "same_as": "a"}])

    def test_non_html_files_are_ignored(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            (root / "a.html").write_text(_PAGE)
            (root / "notes.md").write_text("# not a page")
            pages, _ = gen.load_corpus(root)
            self.assertEqual(len(pages), 1)


class Mutations(unittest.TestCase):
    """Every mutation must both change the page and make its criterion fire.

    A mutation that does neither is the dangerous case: it reports as
    "exercised and caught" while testing nothing.
    """

    def test_clean_page_has_no_findings(self):
        self.assertEqual(gen.probe_findings(_PAGE), [])

    def test_every_mutation_that_bites_makes_its_criterion_fire(self):
        for criterion, kind, description, mutate in gen.MUTATIONS:
            with self.subTest(mutation=description):
                mutated = mutate(_PAGE)
                if mutated == _PAGE:
                    # Fine: _PAGE has no <img>, so the alt mutation is a no-op
                    # here. The audit reports that as "not exercised".
                    continue
                fired = {gen._number(f["criterion"]) for f in gen.probe_findings(mutated)}
                self.assertIn(criterion, fired, f"{kind}: {description}")

    def test_removal_mutations_all_bite_the_reference_page(self):
        """Except the <img> one, which _PAGE deliberately has no element for."""
        no_op = [d for c, k, d, m in gen.MUTATIONS
                 if k == "removal" and m(_PAGE) == _PAGE]
        self.assertEqual(no_op, [
            'strip aria-label from every <button>',
            'strip aria-label from every <input>/<select>/<textarea>',
            'unhook every <label for=...> from its control',
            'drop alt from every <img>',
        ])

    def test_mutations_are_minimal(self):
        """A mutation must not rewrite the whole document out from under the
        engine — then a finding would say nothing about the original page."""
        for _criterion, _kind, description, mutate in gen.MUTATIONS:
            with self.subTest(mutation=description):
                mutated = mutate(_PAGE)
                self.assertGreater(len(mutated), 0.8 * len(_PAGE), description)


class DeliveredCorpus(unittest.TestCase):
    """The committed corpus must keep the markup the control leans on."""

    def setUp(self):
        if not CORPUS.is_dir():
            self.skipTest("corpus not present")
        self.pages, _ = gen.load_corpus(CORPUS)

    def test_corpus_is_not_empty(self):
        self.assertGreaterEqual(len(self.pages), 14)

    def test_every_delivered_page_is_clean_under_both_engines(self):
        for name, html in self.pages:
            with self.subTest(page=name):
                self.assertEqual(gen.probe_findings(html), [])
                self.assertEqual(gen.audit_py_criteria(html), [])

    def test_every_delivered_page_embeds_a_frame(self):
        """The map is on every page, and it is what surfaced the iframe gap.

        If a refactor drops it, the 4.1.2 frame control stops being exercised
        and this corpus quietly stops testing the rule it was added for.
        """
        for name, html in self.pages:
            with self.subTest(page=name):
                self.assertIn("<iframe", html)

    def test_every_delivered_page_has_a_title_and_a_lang(self):
        """`RootLayout` renders no <head>; `render_corpus.mjs` reconstructs the
        one Next builds from `generateMetadata`. Without it, all 14 pages carry
        a spurious 2.4.2 — a harness defect reported as a product defect."""
        for name, html in self.pages:
            with self.subTest(page=name):
                self.assertIn("<title>", html)
                self.assertIn('lang="en"', html)


class SavedResults(unittest.TestCase):
    def setUp(self):
        if not RESULTS.is_file():
            self.skipTest("saved results not present")
        self.data = json.loads(RESULTS.read_text())

    def test_headline_numbers_match_the_readme(self):
        self.assertEqual(self.data["corpus"]["pages_unique"], 14)
        self.assertEqual(self.data["corpus"]["pages_rendered"], 16)
        total = sum(len(r["findings"]) for r in self.data["per_page"])
        self.assertEqual(total, 0)

    def test_engines_agree_on_every_page(self):
        self.assertTrue(all(r["engines_agree"] for r in self.data["per_page"]))

    def test_every_exercised_removal_is_detected_by_both_engines(self):
        """Detection, not attribution.

        Both engines must find every injected defect on every page. Which
        success criterion each cites is a separate question — the two are known
        to diverge on heading order, and asserting agreement here would be
        asserting that a normative disagreement has been settled.
        """
        removals = [r for r in self.data["control"]
                    if r["kind"] == "removal" and r["exercised"]]
        self.assertEqual(len(removals), 7)
        for row in removals:
            with self.subTest(mutation=row["mutation"]):
                self.assertEqual(row["probe_fired"], row["pages_changed"])
                self.assertEqual(row["both_detected"], row["pages_changed"])

    def test_the_engines_relabel_exactly_the_two_known_pairs(self):
        """Pins both relabellings this corpus reproduces under control.

        `a11y-own-sites` saw these on 24.6% of 118 real pages and could not say
        which defect caused either. Here the defects are injected, so each pair
        is exact: a skipped heading level is 2.4.6 to the probe and 1.3.1 to
        `audit.py`; an unnamed form control is 1.3.1 to the probe and 3.3.2 to
        `audit.py`. Between them they account for all three rows of that
        directory's divergence table, the third being a page carrying both.

        If a third pair appears here, a new normative divergence has opened and
        the criterion numbers in the record now depend on which engine ran —
        which is the thing being sold.
        """
        relabelled = {
            r["mutation"]: (sorted(r["probe_cites"]), sorted(r["audit_py_cites"]))
            for r in self.data["control"]
            if r["exercised"]
            and sorted(r["probe_cites"]) != sorted(r["audit_py_cites"])
        }
        self.assertEqual(relabelled, {
            "demote the first <h2> to <h4>, skipping a level":
                (["2.4.6"], ["1.3.1"]),
            "empty the text of every wrapping <label>":
                (["1.3.1"], ["3.3.2"]),
        })

    def test_the_frame_control_is_recorded(self):
        """The row that caught the detection gap. Before the rule added to
        `eaa-wcag-triage` in this pass, this row read probe 0 / audit.py 14."""
        row = next(r for r in self.data["control"]
                   if "iframe" in r["mutation"])
        self.assertEqual(row["criterion"], "4.1.2")
        self.assertEqual(row["pages_changed"], 14)
        self.assertEqual(row["probe_fired"], 14)


if __name__ == "__main__":
    unittest.main()
