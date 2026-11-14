import tempfile
import unittest
from pathlib import Path

from check_form_clobbering import check_tree, clobbered_calls, main

PAGE = """<form id="form">
  <input id="rate">
  <button id="reset" type="button">Reset saved inputs</button>
</form>
<script>
document.querySelector('#reset').addEventListener('click', () => { CALL; });
</script>
"""


class ClobberedCalls(unittest.TestCase):
    def test_the_2026_11_14_shape_is_flagged(self):
        self.assertEqual(clobbered_calls(PAGE.replace("CALL", "form.reset()")), [("reset", 3)])

    def test_the_prototype_call_passes(self):
        self.assertEqual(clobbered_calls(PAGE.replace("CALL", "HTMLFormElement.prototype.reset.call(form)")), [])

    def test_a_comment_naming_the_call_is_not_a_call(self):
        self.assertEqual(clobbered_calls(PAGE.replace("CALL", "// form.reset() threw here\n HTMLFormElement.prototype.reset.call(form)")), [])

    def test_a_named_control_nobody_calls_is_fine(self):
        self.assertEqual(clobbered_calls(PAGE.replace("CALL", "update()")), [])

    def test_a_control_outside_the_form_hides_nothing(self):
        html = '<form id="f"><input id="a"></form>\n<button id="reset">R</button>\n<script>f.reset();</script>\n'
        self.assertEqual(clobbered_calls(html), [])

    def test_each_method_and_name_attribute(self):
        for method in ("submit", "requestSubmit", "checkValidity", "reportValidity"):
            html = f'<form><input name="{method}"></form>\n<script>form.{method}();</script>\n'
            with self.subTest(method=method):
                self.assertEqual(clobbered_calls(html), [(method, 1)])

    def test_case_differs_hides_nothing(self):
        self.assertEqual(clobbered_calls(PAGE.replace('id="reset"', 'id="Reset"').replace("CALL", "form.reset()")), [])


class Tree(unittest.TestCase):
    def test_tree_and_exit_code(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "a").mkdir()
            (Path(d) / "a" / "index.html").write_text(PAGE.replace("CALL", "form.reset()"))
            self.assertEqual(len(check_tree(d)), 1)
            self.assertEqual(main(["x", d]), 1)
            (Path(d) / "a" / "index.html").write_text(PAGE.replace("CALL", "HTMLFormElement.prototype.reset.call(form)"))
            self.assertEqual(main(["x", d]), 0)

    def test_a_call_in_the_page_module_counts(self):
        with tempfile.TemporaryDirectory() as d:
            v = Path(d) / "a"
            v.mkdir()
            (v / "index.html").write_text(PAGE.replace("CALL", "update()") + '<script type="module" src="app.mjs"></script>\n')
            (v / "app.test.mjs").write_text("form.reset();\n")
            self.assertEqual(check_tree(d), [], "a test file is not the page")
            (v / "app.mjs").write_text("const form = document.querySelector('#form');\nform.reset();\n")
            self.assertEqual(len(check_tree(d)), 1)

    def test_repo_is_clean(self):
        self.assertEqual(check_tree(Path(__file__).resolve().parents[2] / "ventures"), [])


if __name__ == "__main__":
    unittest.main()
