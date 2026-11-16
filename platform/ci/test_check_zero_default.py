import pathlib
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import check_zero_default as c  # noqa: E402

FIELD = '<input id="lag" inputmode="numeric" value="30">\n'


class ZeroDefault(unittest.TestCase):
    def test_flags_each_cast_that_swaps_a_typed_zero(self):
        for read in ['parseInt($("#lag").value, 10) || 30',
                     'parseFloat($("#lag").value) || 30',
                     'Number(document.getElementById("lag").value) || 30',
                     '+$("lag").value || 30',
                     "Number($('#lag').value) || 0.25"]:
            with self.subTest(read=read):
                self.assertEqual(c.scan_text(FIELD + f"x = {read};"), [(2, "lag", read.split("|| ")[1])])

    def test_a_read_on_the_first_line_is_still_flagged(self):
        # Red-team 2026-11-16: `rfind(...) + 1` -> `- 1` sliced the line from
        # -2 when no newline precedes the read, so the cast was never seen.
        for read in ['x = Number($("#lag").value) || 30;', 'x = +$("lag").value || 30;']:
            with self.subTest(read=read):
                self.assertEqual(c.scan_text(read + "\n" + FIELD), [(1, "lag", "30")])

    def test_a_field_that_refuses_zero_is_fine(self):
        page = '<input type="number" id="lag" min="1" value="30">\nx = Number($("#lag").value) || 30;'
        self.assertEqual(c.scan_text(page), [])

    def test_min_zero_or_negative_still_allows_zero(self):
        for m in ("0", "-5", "0.0"):
            page = f'<input type="number" id="lag" min="{m}" value="30">\nx = Number($("#lag").value) || 30;'
            self.assertEqual(len(c.scan_text(page)), 1, m)

    def test_zero_fallback_unknown_field_and_marked_line_are_fine(self):
        self.assertEqual(c.scan_text(FIELD + 'x = Number($("#lag").value) || 0;'), [])
        self.assertEqual(c.scan_text('x = Number($("#lag").value) || 30;'), [])
        marked = FIELD + 'x = Number($("#lag").value) || 30; /* zero-default: a lag of 0 is meaningless */'
        self.assertEqual(c.scan_text(marked), [])

    def test_string_fallbacks_and_uncast_reads_are_not_reads_of_a_number(self):
        self.assertEqual(c.scan_text(FIELD + 'x = $("#lag").value || "30";'), [])
        self.assertEqual(c.scan_text(FIELD + 'x = $("#lag").value || 30;'), [])

    def test_main_reads_html_only_and_exits_1_on_a_hit(self):
        bad = FIELD + '<script>x = Number($("#lag").value) || 30;</script>'
        with tempfile.TemporaryDirectory() as d:
            root = pathlib.Path(d)
            (root / "a").mkdir()
            (root / "a" / "calc.mjs").write_text(bad)
            self.assertEqual(c.main([str(root)]), 0)
            (root / "a" / "index.html").write_text(bad)
            self.assertEqual(c.scan([root]), [f"{root / 'a' / 'index.html'}:2: #lag || 30"])
            r = subprocess.run([sys.executable, str(pathlib.Path(c.__file__)), str(root)],
                               capture_output=True, text=True)
            self.assertEqual(r.returncode, 1, r.stdout)

    def test_the_tree_is_clean(self):
        self.assertEqual(c.scan([c.ROOT / "ventures"]), [])


if __name__ == "__main__":
    unittest.main()
