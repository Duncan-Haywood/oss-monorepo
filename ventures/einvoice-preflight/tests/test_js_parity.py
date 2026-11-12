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

from einvoice_preflight import document, endpoint, linenet

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


if __name__ == "__main__":
    unittest.main()
