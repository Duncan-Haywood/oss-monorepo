import contextlib
import io
import tempfile
import unittest
from pathlib import Path

from check_third_party_requests import ROOT, hosts, main


def h(html):
    return [x for x, _ in hosts(html)]


class ThirdPartyRequests(unittest.TestCase):
    def test_default_root_is_repo_root(self):
        self.assertTrue((ROOT / "ventures").is_dir())

    def test_script_font_frame_image_are_requests(self):
        html = ('<script src="https://cdn.jsdelivr.net/x.js"></script>'
                '<link rel="stylesheet" href="https://fonts.googleapis.com/css">'
                '<iframe src="//player.vimeo.com/v"></iframe>'
                "<img src='https://i.imgur.com/a.png'>")
        self.assertEqual(h(html), ["cdn.jsdelivr.net", "fonts.googleapis.com",
                                   "player.vimeo.com", "i.imgur.com"])

    def test_plain_links_and_placeholders_are_not(self):
        html = ('<a href="https://github.com/x">g</a>'
                '<link rel="canonical" href="https://other.org/p/">'
                '<link rel="alternate" href="https://other.org/feed.xml">'
                '<img src="https://example.invalid/c.png">'
                '<script src="app.js"></script>')
        self.assertEqual(h(html), [])

    def test_css_url_and_import(self):
        html = '<style>@import "https://x.test.io/a.css";b{background:url(https://y.io/i.png)}</style>'
        self.assertEqual(h(html), ["x.test.io", "y.io"])

    def test_cli_exit_codes(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "a.html"
            p.write_text("<p>ok</p>")
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(main(["--root", d]), 0)
                p.write_text('<script src="https://evil.io/t.js"></script>')
                self.assertEqual(main(["--root", d]), 1)


if __name__ == "__main__":
    unittest.main()
