import pathlib
import subprocess
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import check_parse_sign as c  # noqa: E402


class ParseSign(unittest.TestCase):
    def test_flags_a_leading_minus_test_before_a_strip(self):
        for text in [
            'const neg = /^\\(.*\\)$/.test(s) || /^[-−]/.test(s);\ns = s.replace(/[^0-9.,]/g, "");',
            'const neg = /^\\(.*\\)$/.test(s) || s.startsWith("-");\ns = s.replace(/[^0-9.,]/g, "");',
            "const negative = /^\\(.*\\)$/.test(raw) || raw.startsWith('-');\nconst cleaned = raw.replace(/[^0-9.]/g, '');",
            'const neg = /^\\(.*\\)$/.test(s) || /^\\$?\\s*[-−]/.test(s);\ns = s.replace(/[^0-9.,]/g, "");',
            'const neg = /^\\(.*\\)$/.test(t) || /^-/.test(t);\nconst n = Number(t.replace(/[()$,\\s-]/g, ""));',
            'const neg = /^[-−]/.test(s);\nconst m = s.match(/\\d[\\d.,]*/);',
        ]:
            self.assertEqual(c.scan_text(text), [1], text)

    def test_accepts_a_minus_anywhere_before_the_first_digit(self):
        for text in [
            'const neg = /^\\(.*\\)$/.test(s) || /^[^0-9]*[-−]/.test(s);\ns = s.replace(/[^0-9.,]/g, "");',
            'const neg = /^\\(.*\\)$/.test(t) || /^[^0-9]*[-−]/.test(t) || /[-−]$/.test(t);\nconst core = t.replace(/[^0-9.,]/g, "");',
        ]:
            self.assertEqual(c.scan_text(text), [], text)

    def test_leaves_a_parser_that_refuses_symbols_alone(self):
        # sepa-pain001-validator: a leading "-" is split off and anything but
        # digits is refused, so "$-5" is a format error, not +5.
        text = 'const neg = text.startsWith("-");\nconst body = neg ? text.slice(1) : text;\nif (!/^(\\d+\\.?\\d*|\\.\\d+)$/.test(body)) return bad;'
        self.assertEqual(c.scan_text(text), [])

    def test_the_tree_is_clean(self):
        r = subprocess.run([sys.executable, str(pathlib.Path(c.__file__))], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stdout)


if __name__ == "__main__":
    unittest.main()
