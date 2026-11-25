"""Tests for relicense_fsl.py: which licence files and phrases move to FSL-1.1-MIT."""
from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import relicense_fsl as r  # noqa: E402

MIT = (
    "MIT License\n\nCopyright (c) {year} {holder}\n\n"
    "Permission is hereby granted, free of charge, to any person obtaining a copy\n"
)


class LicenceFiles(unittest.TestCase):
    def test_owner_mit_becomes_fsl_with_the_same_notice(self):
        out = r.relicense_file(MIT.format(year=2026, holder="Duncan Haywood"))
        self.assertIsNotNone(out)
        self.assertTrue(out.startswith("# Functional Source License, Version 1.1, MIT Future License"))
        self.assertIn("Copyright (c) 2026 Duncan Haywood", out)
        self.assertIn("second anniversary", out)

    def test_third_party_mit_is_left_alone(self):
        self.assertIsNone(r.relicense_file(MIT.format(year=2019, holder="Stef Busking")))

    def test_fsl_file_is_not_rewritten_again(self):
        once = r.relicense_file(MIT.format(year=2026, holder="Maris Stella Labs"))
        self.assertIsNone(r.relicense_file(once))


class Phrases(unittest.TestCase):
    def rw(self, text: str, rel: str = "ventures/x/index.html") -> str:
        return r.rewrite_text(text, rel)

    def test_footer_claims_move(self):
        self.assertEqual(self.rw("Free and open source (MIT). Results"),
                         "Free to use and source available (FSL-1.1-MIT). Results")
        self.assertEqual(self.rw('the <a href="LICENSE" rel="noopener">code is under an MIT licence</a>'),
                         'the <a href="LICENSE" rel="noopener">code is under the FSL-1.1-MIT licence</a>')
        self.assertEqual(self.rw("MIT licensed. See `LICENSE`."), "FSL-1.1-MIT licensed. See `LICENSE`.")

    def test_rewrites_are_idempotent(self):
        for text in ("Free and open source (MIT).", "MIT licensed.", "code is under an MIT licence",
                     "[MIT](LICENSE)", "Open source, MIT, no fee", "\\n\\nFree and open source (MIT)."):
            once = self.rw(text)
            self.assertEqual(self.rw(once), once, text)
            self.assertNotIn("FSL-1.1-FSL", once)

    def test_third_party_credits_keep_their_licence(self):
        for text in ("the Rdatasets copy is as published by ggplot2 (MIT).",
                     "read by the open-source Kokoro text-to-speech voice",
                     "zizmor is an independent open-source project",
                     "Needs python-sat (pip install python-sat; MIT)"):
            self.assertEqual(self.rw(text), text)

    def test_manifests(self):
        self.assertEqual(self.rw('{\n  "license": "MIT",\n}', "ventures/x/package.json"),
                         '{\n  "license": "FSL-1.1-MIT",\n}')
        self.assertEqual(self.rw('license = "MIT"\n', "ventures/x/Cargo.toml"), 'license = "FSL-1.1-MIT"\n')
        py = 'license = {text = "MIT"}\nclassifiers = [\n  "License :: OSI Approved :: MIT License",\n]\n'
        self.assertEqual(self.rw(py, "ventures/x/pyproject.toml"),
                         'license = {text = "FSL-1.1-MIT"}\nclassifiers = [\n]\n')


class Scope(unittest.TestCase):
    def test_research_and_history_stay_out(self):
        self.assertFalse(r.in_scope("research/x/LICENSE"))
        self.assertFalse(r.in_scope("research/x/index.html"))
        self.assertFalse(r.in_scope("docs/posts/2026-01-01-x.md"))
        self.assertFalse(r.in_scope("ventures/x/package-lock.json"))
        self.assertFalse(r.in_scope("ventures/x/eval/corpus/LICENSE"))

    def test_ventures_and_licence_files_are_in(self):
        self.assertTrue(r.in_scope("ventures/x/index.html"))
        self.assertTrue(r.in_scope("LICENSE"))
        self.assertFalse(r.in_scope("platform/pages/build.mjs"))


if __name__ == "__main__":
    unittest.main()
