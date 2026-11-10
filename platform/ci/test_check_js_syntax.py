import unittest
import check_js_syntax as c


class CheckText(unittest.TestCase):
    def test_ok(self):
        self.assertIsNone(c.check_text("const a = 1;\nconsole.log(a);\n"))

    def test_module_in_js(self):
        self.assertIsNone(c.check_text("import fs from 'fs';\nexport const x = fs;\n"))

    def test_syntax_error(self):
        self.assertTrue(c.check_text("function (){\n"))

    def test_jsx_skipped(self):
        self.assertEqual(c.check_text("const A = () => (\n  <View style={s}>\n  </View>\n);\n"), "jsx")


if __name__ == "__main__":
    unittest.main()
