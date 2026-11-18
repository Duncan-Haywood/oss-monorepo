import pathlib
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import check_blank_defaults as c  # noqa: E402

SILENT = 'const opts = () => { const o = {}; for (const k of KEYS) { const n = num($(k).value); o[k] = Number.isFinite(n) ? n : DEFAULTS[k]; } return o; };'
FIXED = 'const opts = () => { const o = {}; for (const k of KEYS) { const n = num($(k).value); if (Number.isFinite(n)) o[k] = n; else { o[k] = DEFAULTS[k]; $(k).value = DEFAULTS[k]; } } return o; };'


class BlankDefaults(unittest.TestCase):
    def test_flags_the_silent_fallback(self):
        self.assertEqual(c.scan_text(SILENT), [1])
        self.assertEqual(c.scan_text("x\n    return isFinite(v) ? v : DEFAULTS[key];"), [2])

    def test_flags_the_if_else_form_without_a_write_back(self):
        line = "if (Number.isFinite(n)) o[k] = n; else o[k] = DEFAULTS[k];"
        self.assertEqual(c.scan_text(line), [1])

    def test_accepts_a_write_back_and_unrelated_lines(self):
        self.assertEqual(c.scan_text(FIXED), [])
        self.assertEqual(c.scan_text("const fill = () => { for (const k of KEYS) $(k).value = DEFAULTS[k]; };"), [])
        self.assertEqual(c.scan_text("o[k] = Number.isFinite(n) ? n : 0;"), [])

    def test_main_reads_html_only_and_exits_1_on_a_hit(self):
        with tempfile.TemporaryDirectory() as d:
            root = pathlib.Path(d)
            (root / "a").mkdir()
            (root / "a" / "calc.mjs").write_text(SILENT)
            self.assertEqual(c.main([str(root)]), 0)
            (root / "a" / "index.html").write_text(f"<script>\n{SILENT}\n</script>")
            self.assertEqual(c.scan([root]), [f"{root / 'a' / 'index.html'}:2"])
            r = subprocess.run([sys.executable, str(pathlib.Path(c.__file__)), str(root)],
                               capture_output=True, text=True)
            self.assertEqual(r.returncode, 1, r.stdout)

    def test_the_tree_is_clean(self):
        self.assertEqual(c.scan([c.ROOT / "ventures"]), [])


if __name__ == "__main__":
    unittest.main()
