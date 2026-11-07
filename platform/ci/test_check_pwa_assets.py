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

    def test_sw_precache(self):
        r = self.tree({"sw.js": "cache.addAll(['./', './a.js', './b.css', 'https://x/y.js']);", "a.js": ""})
        self.assertEqual(list(c.sw_missing(r / "sw.js")), ["./b.css"])

    def test_main_exit_codes(self):
        r = self.tree({"v/sw.js": "['./a.js']"})
        self.assertEqual(c.main(["--root", str(r)]), 1)
        (r / "v" / "a.js").write_text("")
        self.assertEqual(c.main(["--root", str(r)]), 0)


if __name__ == "__main__":
    unittest.main()
