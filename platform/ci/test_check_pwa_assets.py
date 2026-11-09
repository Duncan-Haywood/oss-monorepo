import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path

import check_pwa_assets as c


class T(unittest.TestCase):
    def tree(self, files):
        d = tempfile.TemporaryDirectory()
        self.addCleanup(d.cleanup)
        for k, v in files.items():
            p = Path(d.name, k)
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(v)
        return Path(d.name)

    def test_missing_icon(self):
        r = self.tree({"manifest.json": json.dumps({"start_url": "./", "icons": [{"src": "i.png"}]})})
        self.assertEqual(list(c.manifest_missing(r / "manifest.json")), ["i.png"])

    def test_present_icon_ok(self):
        r = self.tree({"manifest.json": json.dumps({"icons": [{"src": "i.png?v=2"}]}), "i.png": ""})
        self.assertEqual(list(c.manifest_missing(r / "manifest.json")), [])

    def test_non_pwa_manifest_skipped(self):
        r = self.tree({"manifest.json": json.dumps({"files": [{"src": "gone.png"}]})})
        self.assertEqual(list(c.manifest_missing(r / "manifest.json")), [])

    def test_screenshots_only_manifest_skipped(self):
        r = self.tree({"manifest.json": json.dumps({"screenshots": [{"src": "gone.png"}]})})
        self.assertEqual(list(c.manifest_missing(r / "manifest.json")), [])

    def test_sw_precache(self):
        r = self.tree({"sw.js": "cache.addAll(['./', './a.js', './b.css', 'https://x/y.js']);", "a.js": ""})
        self.assertEqual(list(c.sw_missing(r / "sw.js")), ["./b.css"])

    def test_main_exit_codes(self):
        r = self.tree({"v/sw.js": "['./a.js']"})
        self.assertEqual(c.main(["--root", str(r)]), 1)
        (r / "v" / "a.js").write_text("")
        self.assertEqual(c.main(["--root", str(r)]), 0)

    def test_local_skips_unresolvable_refs(self):
        base = Path("/b")
        for ref in ("", "?v=1", "#x", "https://x/a.png", "//cdn/a.png", "data:x", "/abs.png", "${dir}/a.png"):
            self.assertIsNone(c._local(base, ref), ref)
        self.assertEqual(c._local(base, "a.png?v=1#h"), base / "a.png")

    def run_main(self, root):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = c.main(["--root", str(root)])
        return code, out.getvalue()

    def test_main_file_selection_and_count(self):
        r = self.tree({
            "a/manifest.json": json.dumps({"icons": [{"src": "gone.png"}]}),
            "b/app.webmanifest": json.dumps({"icons": [{"src": "gone2.png"}]}),
            "c/other.json": json.dumps({"icons": [{"src": "gone3.png"}]}),
            "d/manifest.txt": json.dumps({"icons": [{"src": "gone4.png"}]}),
            "e/service-worker.js": "['./gone5.js']",
            "node_modules/x/sw.js": "['./gone6.js']",
        })
        code, out = self.run_main(r)
        self.assertEqual(code, 1)
        for n in ("gone.png", "gone2.png", "gone5.js"):
            self.assertIn(n, out)
        for n in ("gone3", "gone4", "gone6"):
            self.assertNotIn(n, out)
        self.assertIn("3 manifests and service workers, 3 missing", out)

    def test_help_uses_first_doc_line(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out), self.assertRaises(SystemExit):
            c.main(["--help"])
        self.assertIn("Fail if a PWA web manifest", out.getvalue())


if __name__ == "__main__":
    unittest.main()
