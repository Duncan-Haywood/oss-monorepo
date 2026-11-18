import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import check_heading_order as c


class HeadingOrder(unittest.TestCase):
    def test_flags_skip_and_double_h1(self):
        self.assertEqual(c.heading_problems("<h1>a</h1><h3>b</h3>"), ["h1 then h3"])
        self.assertEqual(c.heading_problems("<h1>a</h1><h2>b</h2><h1>c</h1>"), ["2 h1 elements"])

    def test_going_back_up_and_hidden_text_are_fine(self):
        html = ("<h1>a</h1><h2>b</h2><h3>c</h3><h2>d</h2><!-- <h5>x</h5> -->"
                "<script>x='<h6>'</script><template><h4>t</h4></template>")
        self.assertEqual(c.heading_problems(html), [])


if __name__ == "__main__":
    unittest.main()
