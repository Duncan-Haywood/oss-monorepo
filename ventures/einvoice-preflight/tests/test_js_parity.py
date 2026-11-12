"""The Python CLI mirrors the browser checker's code tables.

On 2026-11-12 the browser gained PINT's type code 480, 19 EAS codes and
zero-percent readings for E/Z/AE/K/G, and the Python mirror got none of them:
the CLI then called OpenPeppol's own Japan and Oman examples invalid while the
page passed them (red-team run 2026-11-12). These tests read each table out of
the .mjs source and compare it with the Python one, so the next one-sided edit
fails here instead of waiting for a red-team run.
"""

import re
import unittest
from pathlib import Path

from einvoice_preflight import aside, document, endpoint, linenet
from einvoice_preflight.cli import main as cli_main

ROOT = Path(__file__).resolve().parents[1]


def _js_block(filename: str, start: str) -> str:
    text = (ROOT / filename).read_text(encoding="utf-8")
    begin = text.index(start)
    end = text.index("]);" if start.endswith("([") else "};", begin)
    # Drop // comments so a code quoted in a comment is not read as an entry.
    return re.sub(r"//[^\n]*", "", text[begin:end])


class JsParityTest(unittest.TestCase):
    def test_known_eas_schemes_match(self):
        block = _js_block("endpoint.mjs", "const KNOWN_SCHEMES = new Set([")
        js = set(re.findall(r'"([^"]+)"', block))
        self.assertGreater(len(js), 50)
        self.assertEqual(js - endpoint._KNOWN_SCHEMES, set(), "in endpoint.mjs, missing from endpoint.py")
        self.assertEqual(endpoint._KNOWN_SCHEMES - js, set(), "in endpoint.py, missing from endpoint.mjs")

    def test_document_type_table_matches(self):
        block = _js_block("document.mjs", "const TYPES = {")
        js = {key.strip('"'): kind for key, kind in re.findall(r'^\s*("[^"]+"|\w+):\s*"(\w+)"', block, re.M)}
        self.assertGreater(len(js), 60)
        for key, kind in js.items():
            with self.subTest(key=key):
                self.assertEqual(document.normalize_document_type(key), kind)
        for key, kind in document._TYPES.items():
            with self.subTest(py_key=key):
                self.assertEqual(js.get(key), kind, f"{key} is in document.py but not document.mjs")

    def test_no_rate_categories_match(self):
        block = _js_block("linenet.mjs", "const NO_RATE_CATEGORIES = new Set([")
        js = set(re.findall(r'"([^"]+)"', block))
        self.assertIn("O", js)
        for category in sorted(js):
            with self.subTest(category=category):
                self.assertEqual(linenet.tax_percent_of({"tax_category": category}), 0)
                self.assertEqual(linenet.tax_percent_of({"tax_category": f" {category.lower()} "}), 0)
        self.assertIsNone(linenet.tax_percent_of({"tax_category": "S"}))


    def test_stepped_aside_table_matches(self):
        # aside.mjs and aside.py list the same rule ids per profile family; the CLI
        # gave OpenPeppol's PINT JP example INV-022 and INV-035 while the page did not
        # (red-team runs 2026-11-12).
        block = _js_block("aside.mjs", "export const ASIDE = {")
        js = {key: re.findall(r'"([^"]+)"', ids) for key, ids in re.findall(r"^\s*(\w+):\s*\[([^\]]*)\]", block, re.M)}
        self.assertEqual(set(js), set(aside.ASIDE))
        for key, ids in js.items():
            self.assertEqual(ids, aside.ASIDE[key], key)

    def test_stepped_aside_profiles(self):
        sa = aside.stepped_aside
        self.assertEqual(sa({}), set())
        self.assertEqual(sa(None), set())
        self.assertEqual(sa({"specification_id": "urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0"}), set())
        self.assertEqual(sa({"specification_id": "urn:peppol:pint:billing-1@sg-1"}), set(aside.ASIDE["pint"]))
        self.assertTrue({"INV-022", "INV-035"} <= sa({"specification_id": "urn:peppol:pint:billing-1@jp-1"}))
        self.assertNotIn("INV-022", sa({"specification_id": "urn:peppol:pint:billing-1@aunz-1"}))
        self.assertIn("INV-018", sa({"specification_id": "urn:peppol:pint:nontaxinvoice-1@jp-1"}))
        ae = lambda tax: sa({"specification_id": "urn:peppol:pint:billing-1@ae-1", "tax_breakdown": [{"tax_category": "AE", "tax_percent": 5, "tax": tax}]})
        self.assertIn("INV-018", ae(0))
        self.assertNotIn("INV-018", ae(5))
        self.assertIn("INV-006", sa({"profile_id": "reporting:1.0"}))

    def test_cli_passes_openpeppol_style_pint_examples(self):
        import contextlib
        import io

        for name in ("pint-current-jp-invoice.xml", "pint-current-sg-invoice.xml", "pint-current-aunz-invoice.xml", "pint-sg-invoice.xml"):
            with self.subTest(name=name):
                out = io.StringIO()
                with contextlib.redirect_stdout(out):
                    code = cli_main([str(ROOT / "examples" / name), "--format", "json"])
                self.assertEqual(code, 0, out.getvalue())
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = cli_main([str(ROOT / "examples" / "pint-sg-invoice-with-defects.xml")])
        self.assertNotEqual(code, 0)
        self.assertIn("INV-038", out.getvalue())


if __name__ == "__main__":
    unittest.main()
