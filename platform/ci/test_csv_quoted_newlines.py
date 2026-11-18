"""Ratchet: no new venture CSV parser that splits a quoted multi-line field.

Found by the red team on 2026-11-17 (prompts/runs/2026-11-17-session_01E5sJKmUqVrEsUrEZdS8BkF.json):
merchant-feed-check split a feed on line breaks before reading quotes, so an
export whose quoted description held a line break became two broken items.
deal-keeper and cost-sharing-calculator were fixed the same day.

csv_quoted_newlines.mjs feeds every exported parseCsv-style function a quoted
field spanning four lines. KNOWN lists the parsers that split it on
2026-11-17. Most are numeric-series engines (one number per cell, where a
multi-line cell is unlikely) or id,date event lists; fixing one is still
right. A new parser that splits it fails; a listed one that now keeps the
field together fails too, so the list only shrinks. Fix one by parsing the
whole text quote-aware (copy parseCsv from
ventures/clothing-design-studio/partnerfeed.mjs, with a test) and drop it
from KNOWN.

    cd platform/ci && python3 -m unittest test_csv_quoted_newlines
"""
import json
import shutil
import subprocess
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent

KNOWN = {
    "ventures/churn-radar/engine.mjs:parseCsv",
    "ventures/conformal-prediction-intervals/engine.mjs:parseCsv",
    "ventures/dynamic-time-warping/engine.mjs:parseCsv",
    "ventures/fdr-multiple-testing/engine.mjs:parseCsv",
    "ventures/gaussian-process-regression/engine.mjs:parseCsv",
    "ventures/h1b-weighted-lottery-odds-calculator/calc.mjs:parseCsv",
    "ventures/hdbscan-clustering/engine.mjs:parseCsv",
    "ventures/inter-rater-agreement/engine.mjs:parseCsv",
    "ventures/isolation-forest/engine.mjs:parseCsv",
    "ventures/kalman-smoother/engine.mjs:parseCsv",
    "ventures/lomb-scargle-periodogram/engine.mjs:parseCsv",
    "ventures/mann-kendall-trend/engine.mjs:parseCsv",
    "ventures/matrix-profile-explorer/engine.mjs:parseCsv",
    "ventures/pql-radar/engine.mjs:parseCsv",
    "ventures/probability-calibration/engine.mjs:parseCsv",
    "ventures/robust-pca/engine.mjs:parseCsv",
    "ventures/stl-decomposition/engine.mjs:parseCsv",
    "ventures/survival-analysis/engine.mjs:parseCsv",
    "ventures/wasserstein-distance/engine.mjs:parseCsv",
}


@unittest.skipIf(shutil.which("node") is None, "node is not installed")
class CsvQuotedNewlines(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        r = subprocess.run(["node", str(HERE / "csv_quoted_newlines.mjs")],
                           capture_output=True, text=True, timeout=180)
        if r.returncode != 0:
            raise AssertionError(r.stdout[-2000:] + r.stderr[-3000:])
        cls.result = json.loads(r.stdout.strip().splitlines()[-1])

    def test_scan_reaches_the_parsers(self):
        # 156 parsers on 2026-11-17; a collapse means the scan broke, not a fix.
        self.assertGreater(self.result["checked"], 100)

    def test_no_new_parser_splits_a_quoted_line_break(self):
        new = sorted(set(self.result["broken"]) - KNOWN)
        self.assertEqual(new, [], "these parsers split a quoted field that spans "
                         "lines; parse the whole text quote-aware (see the docstring)")

    def test_known_list_only_shrinks(self):
        fixed = sorted(KNOWN - set(self.result["broken"]))
        self.assertEqual(fixed, [], "these now keep a quoted line break together: "
                         "drop them from KNOWN")


if __name__ == "__main__":
    unittest.main()
