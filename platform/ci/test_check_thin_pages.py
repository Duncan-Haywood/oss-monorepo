import contextlib
import io
import tempfile
import unittest
from pathlib import Path

import check_thin_pages as c


class T(unittest.TestCase):
    def test_counts_only_visible_text(self):
        html = "<style>a{}</style><script>var x = 1 2 3</script><svg><text>no</text></svg><p>one two <b>three</b></p>"
        self.assertEqual(c.word_count(html), 3)

    def test_exit_code_and_threshold(self):
        with tempfile.TemporaryDirectory() as d:
            Path(d, "a").mkdir()
            Path(d, "a", "index.html").write_text("<p>" + "w " * 10 + "</p>")
            self.assertEqual(c.main(["--root", d, "--min", "5"]), 0)
            self.assertEqual(c.main(["--root", d, "--min", "50"]), 1)

    def _run(self, words, *argv):
        with tempfile.TemporaryDirectory() as d:
            Path(d, "a").mkdir()
            Path(d, "a", "index.html").write_text("<p>" + "w " * words + "</p>")
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                code = c.main(["--root", d, *argv])
            return code, out.getvalue()

    def test_a_page_with_exactly_min_words_is_not_thin(self):
        self.assertEqual(self._run(5, "--min", "5")[0], 0)
        self.assertEqual(self._run(4, "--min", "5")[0], 1)

    def test_default_threshold_is_200_words(self):
        self.assertEqual(self._run(200)[0], 0)
        self.assertEqual(self._run(199)[0], 1)

    def test_summary_line_reports_median(self):
        _, out = self._run(7, "--min", "5")
        self.assertIn("1 pages, median 7 words, 0 under 5", out)

    def test_empty_tree_reports_median_zero(self):
        with tempfile.TemporaryDirectory() as d:
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                self.assertEqual(c.main(["--root", d]), 0)
        self.assertIn("0 pages, median 0 words", out.getvalue())

    def test_root_is_the_repository_root(self):
        self.assertTrue((c.ROOT / "ventures").is_dir())

    def test_help_text_is_the_summary_line(self):
        with self.assertRaises(SystemExit), contextlib.redirect_stdout(io.StringIO()) as out:
            c.main(["-h"])
        self.assertIn("List venture landing pages with little visible text", out.getvalue())


if __name__ == "__main__":
    unittest.main()
