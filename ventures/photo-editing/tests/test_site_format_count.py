"""The public pages state one raw-format count, and it matches the formats table.

Quality round 85 (2026-11-19) found the home page and llms.txt saying "12 raw formats" while
camera-raw-formats.html said "Fourteen" and its table listed fifteen format families (Kodak DCR was
added on 2026-11-18 and no count followed it). This test counts the table's rows, folds the variants
that share a reader (Coolpix NRW is a NEF, Phocus FFF is a 3FR), and checks every stated count.
"""

from __future__ import annotations

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
VARIANTS = {"nrw", "fff"}  # read by the NEF and 3FR readers; listed as rows but not separate formats
WORDS = {13: "Thirteen", 14: "Fourteen", 15: "Fifteen", 16: "Sixteen", 17: "Seventeen", 18: "Eighteen"}


def table_formats() -> set[str]:
    html = (SITE / "camera-raw-formats.html").read_text(encoding="utf-8")
    return set(re.findall(r'<tr id="f-([a-z0-9]+)"', html)) - VARIANTS


class SiteFormatCountTest(unittest.TestCase):
    def test_site_never_shows_a_bare_shootflow_command(self) -> None:
        # No `shootflow` console script is installed, so a bare `shootflow cull` fails as written
        # (quality round 85, 2026-11-19-photo-editing-r4.json).
        html = (SITE / "index.html").read_text(encoding="utf-8")
        self.assertIsNone(re.search(r"<code>shootflow\s", html))

    def test_counts_match_the_formats_table(self) -> None:
        n = len(table_formats())
        self.assertGreaterEqual(n, 15)
        index = (SITE / "index.html").read_text(encoding="utf-8")
        self.assertEqual(re.findall(r"<strong>(\d+) raw formats</strong>", index), [str(n)])
        llms = (ROOT / "llms.txt").read_text(encoding="utf-8")
        self.assertEqual(re.findall(r"develops camera raw files \((\d+) formats", llms), [str(n)])
        formats = (SITE / "camera-raw-formats.html").read_text(encoding="utf-8")
        stated = re.findall(r"\b(" + "|".join(WORDS.values()) + r") (?:RAW )?formats", formats)
        self.assertTrue(stated)
        self.assertEqual(set(stated), {WORDS[n]})

    def test_home_page_develop_answer_names_every_format_family(self) -> None:
        index = (SITE / "index.html").read_text(encoding="utf-8")
        answer = re.search(r"<code>develop</code> turns (.*?) files into neutral", index)
        self.assertIsNotNone(answer)
        names = {
            "dng": "DNG", "cr3": "CR3", "cr2": "CR2", "crw": "CRW", "arw": "ARW", "nef": "NEF", "raf": "RAF",
            "orf": "ORF", "rw2": "RW2", "pef": "PEF", "srw": "SRW", "mrw": "MRW", "dcr": "DCR", "iiq": "IIQ",
            "3fr": "3FR",
        }
        for fmt in table_formats():
            self.assertIn(names[fmt], answer.group(1), fmt)


if __name__ == "__main__":
    unittest.main()
