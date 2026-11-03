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


if __name__ == "__main__":
    unittest.main()
