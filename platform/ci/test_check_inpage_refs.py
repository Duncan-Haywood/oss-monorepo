import contextlib
import io
import tempfile
import unittest
from pathlib import Path

from check_inpage_refs import ROOT, broken, main, scan


class InpageRefs(unittest.TestCase):
    def test_missing_anchor_target(self):
        self.assertEqual(broken('<a href="#faq">x</a>\n<h2 id="faqs">'), [(1, "href", "faq")])

    def test_present_targets_and_top_pass(self):
        html = '<a href="#a">x</a><a href="#">t</a><a href="#top">t</a><h2 id="a"></h2>'
        self.assertEqual(broken(html), [])

    def test_aria_refs(self):
        html = '<div aria-labelledby="t h" aria-controls="p"></div><b id="t"></b>'
        self.assertEqual([r[2] for r in broken(html)], ["h", "p"])

    def test_script_text_ignored(self):
        self.assertEqual(broken("<script>x='<a href=\"#nope\">'</script>"), [])

    def test_scan_and_exit_code(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "ventures" / "v").mkdir(parents=True)
            (root / "ventures" / "v" / "index.html").write_text('<a href="#gone">x</a>')
            self.assertEqual(len(scan(root)), 1)
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(main(["--root", str(root)]), 1)

    def test_clean_tree_exits_zero(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "ventures").mkdir()
            (root / "ventures" / "index.html").write_text('<a href="#a">x</a><h2 id="a"></h2>')
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(main(["--root", str(root)]), 0)

    def test_default_root_is_the_repo_root(self):
        self.assertTrue((ROOT / "ventures").is_dir())

    def test_repo_is_clean(self):
        self.assertEqual(scan(ROOT), [])


if __name__ == "__main__":
    unittest.main()
