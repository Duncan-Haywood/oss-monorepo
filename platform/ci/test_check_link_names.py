import unittest

from check_link_names import problems, scan, main


class LinkNames(unittest.TestCase):
    def test_icon_only_link_flagged(self):
        self.assertEqual(problems('<a href="/x"><i class="ic"></i></a>'),
                         [(1, "link has no accessible name")])

    def test_named_forms_pass(self):
        html = ('<a href="/a">Text</a><a href="/b" aria-label="B"></a>'
                '<a href="/c"><img src="c.png" alt="C"></a><a href="/d" title="D"></a>'
                '<a href="/e"><svg aria-label="E"></svg></a>')
        self.assertEqual(problems(html), [])

    def test_empty_alt_does_not_name(self):
        self.assertEqual(len(problems('<a href="/x"><img src="x" alt=""></a>')), 1)

    def test_whitespace_only_link_flagged(self):
        self.assertEqual(problems('<a href="/x">  \n </a>'),
                         [(1, "link has no accessible name")])

    def test_text_outside_link_does_not_crash(self):
        self.assertEqual(problems('hello <a href="/x">Go</a> bye'), [])

    def test_anchor_without_href_skipped(self):
        self.assertEqual(problems('<a id="top"></a>'), [])

    def test_iframe_needs_title(self):
        self.assertEqual(problems('<iframe src="x"></iframe>'), [(1, "iframe has no title")])
        self.assertEqual(problems('<iframe src="x" title="T"></iframe>'), [])


    def test_scan_walks_venture_pages_and_main_exits_nonzero(self):
        import tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "ventures" / "v").mkdir(parents=True)
            (root / "ventures" / "v" / "index.html").write_text('<a href="/x"><img src="i.png"></a>')
            (root / "ventures" / "top.html").write_text('<a href="/x"><img src="i.png"></a>')
            bad = scan(root)
            self.assertEqual([str(b[0]) for b in bad], ["ventures/v/index.html"])
            self.assertEqual(main(["--root", str(root)]), 1)
            (root / "ventures" / "v" / "index.html").write_text('<a href="/x">Home</a>')
            self.assertEqual(main(["--root", str(root)]), 0)


if __name__ == "__main__":
    unittest.main()
