import tempfile
import unittest
from pathlib import Path

import check_local_assets as c


class T(unittest.TestCase):
    def run_on(self, files):
        with tempfile.TemporaryDirectory() as d:
            for name, body in files.items():
                p = Path(d, name)
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text(body)
            return list(c.broken(Path(d, "index.html")))

    def test_missing_image_reported(self):
        self.assertEqual(self.run_on({"index.html": '<img src="a.png">'}), ["a.png"])

    def test_present_and_query_ok(self):
        self.assertEqual(self.run_on({"index.html": '<script src="a.js?v=1"></script>', "a.js": ""}), [])

    def test_skips_remote_template_bundled_absolute(self):
        html = ('<img src="https://x/y.png"><img src="data:abc"><img src="${id}/v.svg">'
                '<script src="/src/main.tsx"></script><link href="/x.css">')
        self.assertEqual(self.run_on({"index.html": html}), [])


if __name__ == "__main__":
    unittest.main()
