#!/usr/bin/env python3
"""Tests for venture_sweeps.py: which ventures a diff sends to the browser sweeps.

The sweeps themselves need Playwright and are exercised by hand
(`python3 platform/ci/venture_sweeps.py --sample 60`); what is pinned here is
the selection, since a selection that misses a page file is a check that
never fires, the failure this runner exists to end.
"""
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import venture_sweeps as vs  # noqa: E402


class Selection(unittest.TestCase):
    def setUp(self):
        self.repo = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.repo, True)
        for slug in ("tool-a", "tool-b"):
            os.makedirs(os.path.join(self.repo, "ventures", slug))
            open(os.path.join(self.repo, "ventures", slug, "index.html"), "w").close()
        os.makedirs(os.path.join(self.repo, "ventures", "no-page"))

    def test_page_files_select_their_venture(self):
        for path in ("ventures/tool-a/index.html", "ventures/tool-a/calc.mjs",
                     "ventures/tool-a/app.js", "ventures/tool-a/style.css",
                     "ventures/tool-a/sub/page.html"):
            self.assertEqual(vs.venture_of(path), "tool-a", path)

    def test_tests_docs_and_data_do_not(self):
        for path in ("ventures/tool-a/calc.test.mjs", "ventures/tool-a/README.md",
                     "ventures/tool-a/test/helper.mjs", "ventures/tool-a/eval/x.js",
                     "ventures/tool-a/data.json", "ventures/README.md",
                     "docs/posts/x.md", "platform/pages/build.mjs"):
            self.assertIsNone(vs.venture_of(path), path)

    def test_touched_ventures_needs_an_index_page_and_dedupes(self):
        changed = ["ventures/tool-b/calc.mjs", "ventures/tool-a/index.html",
                   "ventures/tool-a/calc.mjs", "ventures/no-page/x.js",
                   "ventures/gone/index.html"]
        self.assertEqual(vs.touched_ventures(changed, self.repo), ["tool-a", "tool-b"])

    def test_every_listed_sweep_exists_and_page_runtime_is_advisory(self):
        for name in vs.SWEEPS:
            self.assertTrue(os.path.isfile(os.path.join(vs.HERE, f"check_{name}.js")), name)
        self.assertFalse(vs.SWEEPS["page_runtime"])
        self.assertTrue(vs.SWEEPS["html_injection"])

    def test_every_check_js_beside_it_is_listed(self):
        # A new sweep added without a line here would be the next check nobody runs.
        on_disk = {f[len("check_"):-len(".js")] for f in os.listdir(vs.HERE)
                   if f.startswith("check_") and f.endswith(".js")}
        self.assertEqual(on_disk - set(vs.SWEEPS), set())

    def test_unknown_slug_exits_2(self):
        self.assertEqual(vs.main(["no-such-venture-xyz"]), 2)


if __name__ == "__main__":
    unittest.main()
