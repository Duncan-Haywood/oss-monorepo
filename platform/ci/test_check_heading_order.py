import unittest

import check_heading_order as c


class HeadingOrder(unittest.TestCase):
    def test_skip_found(self):
        self.assertEqual(c.skips("<h1>a</h1><h2>b</h2><h4>c</h4>"), [(2, 4)])

    def test_ok_and_ignored(self):
        self.assertEqual(c.skips("<h1>a</h1><h2>b</h2><h3>c</h3><h2>d</h2>"), [])
        self.assertEqual(c.skips("<h1>a</h1><script>'<h4>'</script><!-- <h5> --><h2>b</h2>"), [])


if __name__ == "__main__":
    unittest.main()
