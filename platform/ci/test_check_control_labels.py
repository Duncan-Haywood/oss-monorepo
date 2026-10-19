import unittest

from check_control_labels import unlabeled


class ControlLabels(unittest.TestCase):
    def test_placeholder_is_not_a_name(self):
        self.assertEqual(unlabeled('<textarea id="p" placeholder="Paste"></textarea>'), [(1, "p")])

    def test_for_wrapping_and_aria_count(self):
        html = ('<label for="a">A</label><input id="a">'
                '<label>B <input id="b"></label>'
                '<input id="c" aria-label="C"><select id="d" title="D"></select>')
        self.assertEqual(unlabeled(html), [])

    def test_label_scope_ends(self):
        self.assertEqual(unlabeled('<label>x</label><input id="e">'), [(1, "e")])

    def test_skips_buttons_and_hidden(self):
        self.assertEqual(unlabeled('<input type="hidden"><input type="submit"><input type="button">'), [])


if __name__ == "__main__":
    unittest.main()
