import subprocess
import tempfile
import unittest
from pathlib import Path

import check_playwright_import as c


class EsmOnlyTest(unittest.TestCase):
    def test_bare_dynamic_import_is_flagged(self):
        self.assertTrue(c.esm_only("const pw = await import('playwright');"))

    def test_env_or_specifier_is_flagged(self):
        # sideways.mjs before 2026-11-19: PLAYWRIGHT is unset in a cloud session
        self.assertTrue(c.esm_only("const specifier = process.env.PLAYWRIGHT || 'playwright';\n"
                                   "const loaded = await import(specifier);"))

    def test_static_import_is_flagged(self):
        self.assertTrue(c.esm_only('import { chromium } from "playwright";'))

    def test_shared_loader_passes(self):
        self.assertFalse(c.esm_only("import { requirePlaywright } from './load-playwright.mjs';"))

    def test_require_fallback_passes(self):
        self.assertFalse(c.esm_only("try { pw = await import('playwright'); } "
                                    "catch { pw = createRequire(import.meta.url)('playwright'); }"))
        self.assertFalse(c.esm_only("pw = require(process.env.PLAYWRIGHT || 'playwright');"))

    def test_mentions_without_import_pass(self):
        self.assertFalse(c.esm_only("// needs Playwright; run npx playwright install"))
        self.assertFalse(c.esm_only("import('@playwright/test')"))


class MainTest(unittest.TestCase):
    def test_flags_only_the_esm_only_file(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "bad.mjs").write_text("const pw = await import('playwright');\n")
            (root / "good.mjs").write_text("import { loadPlaywright } from './load-playwright.mjs';\n")
            (root / "node_modules").mkdir()
            (root / "node_modules" / "x.js").write_text("import('playwright')\n")
            subprocess.run(["git", "init", "-q"], cwd=root, check=True)
            self.assertEqual(c.main(["--root", d]), 1)
            (root / "bad.mjs").unlink()
            self.assertEqual(c.main(["--root", d]), 0)
            (root / "good.mjs").unlink()
            self.assertEqual(c.main(["--root", d]), 2)  # a scan of nothing is not a pass

    def test_repository_is_clean(self):
        self.assertEqual(c.main([]), 0)


if __name__ == "__main__":
    unittest.main()
