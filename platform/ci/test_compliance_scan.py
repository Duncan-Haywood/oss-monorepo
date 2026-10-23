#!/usr/bin/env python3
"""Tests for the compliance review's mechanical scan."""

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

import compliance_scan as scan

# Built at runtime so this file never contains a string that looks like a key.
REAL_AWS = "AKIA" + "Q3EGZ7RT2HN5WLPV"


class Scan(unittest.TestCase):
    def setUp(self):
        self.tmp = TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)

    def write(self, rel_path: str, text: str) -> None:
        path = self.root / rel_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")

    def found(self, check: str) -> list[str]:
        return [row["path"] for row in scan.scan(self.root).get(check, [])]

    def test_brand_page_without_disclaimer_is_found(self):
        self.write("ventures/etsy-fee-calculator/index.html", "<p>Etsy fees</p>")
        self.write("ventures/etsy-fee-calculator/index.test.html", "<p>fixture</p>")
        self.assertEqual(self.found("brand-disclaimer"), ["ventures/etsy-fee-calculator/index.html"])

    def test_brand_page_with_disclaimer_passes(self):
        self.write("ventures/etsy-fee-calculator/index.html",
                   "<p>Not affiliated with Etsy, Inc.</p>")
        self.assertEqual(self.found("brand-disclaimer"), [])

    def test_brand_token_must_be_a_whole_slug_word(self):
        # "squared" and "awsome" are not the brands Square and AWS.
        self.write("ventures/squared-footage-calculator/index.html", "<p>x</p>")
        self.assertEqual(self.found("brand-disclaimer"), [])

    def test_external_font_is_a_third_party_request(self):
        self.write("ventures/demo/index.html",
                   '<link rel="preconnect" href="https://fonts.googleapis.com">'
                   '<link rel="canonical" href="https://example.com/demo/">'
                   '<script src="./app.mjs"></script>')
        rows = scan.scan(self.root)["third-party-request"]
        self.assertEqual([r["detail"] for r in rows], ["fonts.googleapis.com"])

    def test_own_host_is_not_third_party(self):
        self.write("ventures/demo/index.html",
                   '<script src="https://duncan-haywood.github.io/monorepo-projects/c.js"></script>')
        self.assertEqual(self.found("third-party-request"), [])

    def test_persistent_cookie_write_is_found_but_header_read_is_not(self):
        self.write("ventures/ref/pages.mjs",
                   'document.cookie = "ref=" + v + ";max-age=5184000";\n')
        self.write("ventures/probe/probe.mjs",
                   "const c = res.headers['set-cookie']; // max-age is parsed below\n")
        self.assertEqual(self.found("tracking-cookie"), ["ventures/ref/pages.mjs"])

    def test_competitor_figure_needs_an_as_of_date(self):
        self.write("ventures/a/vs-jobber.html", "<p>Jobber says it serves over 200,000 users.</p>")
        self.write("ventures/b/vs-jobber.html",
                   "<p>Jobber says it serves over 200,000 users (as of 2026-10).</p>")
        self.assertEqual(self.found("unsourced-competitor-figure"), ["ventures/a/vs-jobber.html"])

    def test_real_key_is_found_and_placeholders_are_not(self):
        self.write("infra/notes.md", f"key = {REAL_AWS}\n")
        self.write("docs/example.md", "AKIAIOSFODNN7EXAMPLE and sk-ant-api03-" + "x" * 40 + "\n")
        self.write("infra/test_keys.py", f"K = '{REAL_AWS}'\n")
        self.assertEqual(self.found("secret"), ["infra/notes.md"])

    def test_canonical_link_at_start_of_page_is_not_third_party(self):
        # The tag opens at offset 0; a search window that skips it loses the rel.
        self.write("ventures/demo/index.html", '<link rel="canonical" href="https://example.com/demo/">')
        self.assertEqual(self.found("third-party-request"), [])

    def test_null_byte_just_past_the_sniff_window_is_still_text(self):
        # Binary detection looks at the first 8192 bytes only: byte 8192 is outside it.
        text = scan.text_of(self._file("a.txt", b"x" * 8192 + b"\0y"))
        self.assertIsNotNone(text)
        self.assertIsNone(scan.text_of(self._file("b.txt", b"x" * 8191 + b"\0y")))

    def _file(self, name: str, data: bytes) -> Path:
        path = self.root / name
        path.write_bytes(data)
        return path

    def test_tracking_cookie_detail_is_cut_at_eighty_characters(self):
        line = 'document.cookie = "ref=" + v + ";max-age=5184000"; // ' + "z" * 60
        self.write("ventures/ref/pages.mjs", line + "\n")
        rows = scan.scan(self.root)["tracking-cookie"]
        self.assertEqual(rows[0]["detail"], line[:80])

    def test_strict_fails_only_when_something_is_found(self):
        root = str(self.root)
        self.assertEqual(scan.main(["--root", root, "--strict", "--json"]), 0)
        self.write("ventures/etsy-fee-calculator/index.html", "<p>Etsy fees</p>")
        self.assertEqual(scan.main(["--root", root, "--json"]), 0)
        self.assertEqual(scan.main(["--root", root, "--strict", "--json"]), 1)


if __name__ == "__main__":
    unittest.main()
