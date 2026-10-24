import unittest

import check_heading_order as c


class HeadingOrder(unittest.TestCase):

    def test_clean_outline_has_no_skips(self):
        self.assertEqual(c.skips("<h1>a</h1><h2>b</h2><h3>c</h3><h2>d</h2>"), [])


    def test_skip_is_found(self):
        self.assertEqual(c.skips("<h1>a</h1><h3>b</h3>"), [(1, 3)])


    def test_script_strings_and_comments_are_ignored(self):
        html = '<h1>a</h1><script>x="<h4>q</h4>"</script><!-- <h3>z</h3> --><h2>b</h2>'
        self.assertEqual(c.skips(html), [])


    def test_fix_pulls_a_run_up_and_keeps_closing_tags_paired(self):
        html = '<h1 id="t">A</h1><h3 class="x">B</h3><h4>C</h4><h2>D</h2><h3>E</h3>'
        out = c.fix(html)
        self.assertEqual(out, '<h1 id="t">A</h1><h2 class="x">B</h2><h3>C</h3><h2>D</h2><h3>E</h3>')
        self.assertEqual(c.skips(out), [])


    def test_fix_leaves_script_strings_alone(self):
        html = '<h1>A</h1><h3>B</h3><script>"<h3>x</h3>"</script>'
        self.assertIn('"<h3>x</h3>"', c.fix(html))


    def test_repo_pages_have_no_skips(self):
        self.assertEqual(c.main([]), 0)


if __name__ == "__main__":
    unittest.main()
