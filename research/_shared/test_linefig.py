import math
import re
import subprocess
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import linefig  # noqa: E402

TEXT = ["== A", "x y", "1 2", "2 4", "3 8", "next 1 2"]


class LineFig(unittest.TestCase):
    def test_table_parses_numeric_rows_only(self):
        xs, ys = linefig.table(TEXT, "== A", 0, [1])
        self.assertEqual((xs, ys), ([1.0, 2.0, 3.0], [[2.0, 4.0, 8.0]]))

    def test_table_splits_on_custom_separator(self):
        rows = ["== P", "| n | v |", "|---|---|", "| 1 | 2.5 |", "| 2 | 3.5 |"]
        xs, ys = linefig.table(rows, "== P", 0, [1], sep="|")
        self.assertEqual((xs, ys), ([1.0, 2.0], [[2.5, 3.5]]))

    def test_table_accepts_a_string(self):
        xs, ys = linefig.table("\n".join(TEXT), "== A", 0, [1])
        self.assertEqual(xs, [1.0, 2.0, 3.0])

    def test_table_section_ignores_equals_signs(self):
        xs, _ = linefig.table(TEXT, "A", 0, [1])
        self.assertEqual(xs, [1.0, 2.0, 3.0])

    def test_table_without_rows_exits(self):
        with self.assertRaises(SystemExit):
            linefig.table(TEXT, "== missing", 0, [1])

    def test_num_reads_value_with_standard_error(self):
        self.assertEqual(linefig.num("0.3818(0.0020)"), 0.3818)
        self.assertEqual(linefig.num("-1.5e-3(2e-4)"), -1.5e-3)
        self.assertEqual(linefig.num("0.38±0.02"), 0.38)
        self.assertEqual(linefig.num("12+-3"), 12.0)
        self.assertIsNone(linefig.num("(0.002)"))
        self.assertIsNone(linefig.num("n/a"))
        self.assertIsNone(linefig.num("0.3(0.1)x"))

    def test_table_parses_value_se_cells(self):
        rows = ["== S", "n mean(se)", "10 0.3818(0.0020)", "20 0.4010(0.0015)"]
        xs, ys = linefig.table(rows, "== S", 0, [1])
        self.assertEqual((xs, ys), ([10.0, 20.0], [[0.3818, 0.401]]))

    def test_vline_draws_and_widens_the_axis(self):
        series = [("s", [1, 2, 3], [2, 4, 8])]
        plain = linefig.svg_lines("T", "a", "x", "y", series)
        one = linefig.svg_lines("T", "a", "x", "y", series, vline=2.0)
        self.assertEqual(one.count('stroke-dasharray'), plain.count('stroke-dasharray') + 1)
        two = linefig.svg_lines("T", "a", "x", "y", series, vline=[1.5, 6])
        self.assertEqual(two.count('stroke-dasharray'), plain.count('stroke-dasharray') + 2)
        # x = 6 lies past the data, so the right-most point no longer sits at the plot's edge
        self.assertNotIn('<circle cx="624.0"', two)

    def test_table_xtext_keeps_category_labels(self):
        rows = ["== C", "cause effect", "seed -0.4", "robot 1.2", "steer 0.3"]
        xs, ys = linefig.table(rows, "== C", 0, [1], xtext=True)
        self.assertEqual((xs, ys), (["seed", "robot", "steer"], [[-0.4, 1.2, 0.3]]))
        # a header row whose y cell is text still drops out
        self.assertNotIn("cause", xs)

    def test_table_xtext_with_pipe_labels_containing_spaces(self):
        rows = ["== P", "| method | v |", "|---|---|", "| social force | 2.5 |", "| ORCA, fitted | 3.5 |"]
        xs, ys = linefig.table(rows, "== P", 0, [1], sep="|", xtext=True)
        self.assertEqual((xs, ys), (["social force", "ORCA, fitted"], [[2.5, 3.5]]))

    def test_bars_one_rect_per_value_and_no_legend_for_one_series(self):
        svg = linefig.svg_bars("T", "alt", "v", ["a", "b", "c"], [("s", [1, 2, 3])])
        self.assertEqual(len(re.findall(r'<rect x="[\d.]+" y="[\d.]+" width', svg)), 3)
        self.assertNotIn('height="10" fill=', svg)  # legend swatch

    def test_bars_grouped_with_legend_whiskers_and_ref(self):
        series = [("one", [1.0, -2.0]), ("two", [0.5, 0.25])]
        errs = [[(0.8, 1.2), (-2.5, -1.5)], None]
        svg = linefig.svg_bars("T", "alt", "v", ["x", "y"], series, errs=errs, ref=1.5)
        self.assertEqual(svg.count('stroke-width="1.5"'), 2)
        self.assertEqual(svg.count('stroke-dasharray'), 1)
        self.assertEqual(svg.count('height="10" fill='), 2)
        self.assertIn(">-2<", svg)

    def test_bars_negative_bar_sits_left_of_zero(self):
        svg = linefig.svg_bars("T", "alt", "v", ["neg", "pos"], [("s", [-1.0, 1.0])])
        zero = float(re.search(r'<line x1="([\d.]+)" x2="\1" y1="\d+" y2="\d+" stroke="#555"/>', svg).group(1))
        rects = [(float(x), float(w)) for x, w in re.findall(r'<rect x="([\d.]+)" y="[\d.]+" width="([\d.]+)" height="1', svg)]
        self.assertAlmostEqual(rects[0][0] + rects[0][1], zero, places=0)
        self.assertAlmostEqual(rects[1][0], zero, places=0)

    def test_bars_escape_labels_and_check_lengths(self):
        svg = linefig.svg_bars("A & B", "a<b", "v", ["x<y"], [("s", [1])])
        self.assertIn("A &amp; B", svg)
        self.assertIn("x&lt;y", svg)
        with self.assertRaises(ValueError):
            linefig.svg_bars("T", "a", "v", ["x", "y"], [("s", [1])])

    def test_bars_fit_the_width(self):
        names = ["series number %d" % k for k in range(6)]
        series = [(n, [k + 1.0, -k - 0.5]) for k, n in enumerate(names)]
        svg = linefig.svg_bars("T", "a", "v", ["a long category label", "b"], series)
        xs = [float(x) for x in re.findall(r'<(?:rect|text) x="([\d.]+)"', svg)]
        self.assertTrue(all(0 <= x <= 640 for x in xs), max(xs))

    def test_svg_has_series_and_alt(self):
        svg = linefig.svg_lines("T", "alt text", "x", "y", [("s", [1, 2, 3], [2, 4, 8])])
        self.assertIn('aria-label="alt text"', svg)
        self.assertEqual(svg.count("<polyline"), 1)
        self.assertTrue(svg.endswith("</svg>\n"))

    def test_workcell_twin_figure_reproduces_committed_svg(self):
        exp = Path(__file__).resolve().parents[1] / "workcell-twin" / "experiments"
        before = (exp / "claim_vs_real.svg").read_bytes()
        subprocess.run([sys.executable, str(exp / "figure.py")], check=True, capture_output=True)
        self.assertEqual((exp / "claim_vs_real.svg").read_bytes(), before)


    def test_xticks_override_replaces_data_ticks(self):
        svg = linefig.svg_lines("t", "a", "x", "y", [("s", [0.0, 0.79687, 0.853125], [1.0, 0.5, 0.1])],
                                xticks=[0, 0.5, 1.0])
        self.assertIn(">0.5<", svg)
        self.assertNotIn(">0.853125<", svg)

    def test_logy_under_three_decades_gets_readable_ticks(self):
        svg = linefig.svg_lines("t", "a", "x", "y", [("s", [1, 2, 3], [0.17, 1, 2.2])], logy=True, hline=1)
        labels = re.findall(r'text-anchor="end" font-family="sans-serif" font-size="11">([^<]*)<', svg)
        self.assertEqual(labels, ["0.2", "0.5", "1", "2"])
        self.assertEqual(linefig._log_ticks(-3, 2), [0.001, 0.01, 0.1, 1, 10, 100])
        narrow = linefig._log_ticks(math.log10(1.1), math.log10(1.8))
        self.assertGreaterEqual(len(narrow), 3)
        self.assertTrue(all(1.1 <= v <= 1.8 for v in narrow))

    def test_hline_at_zero_is_drawn(self):
        # a zero reference line (effects that change sign) was dropped because 0 is falsy
        svg = linefig.svg_lines("t", "a", "x", "y", [("s", [1, 2], [-1.0, 1.0])], hline=0)
        self.assertIn('stroke-dasharray="4 3"', svg)
        self.assertNotIn('stroke-dasharray="4 3"', linefig.svg_lines("t", "a", "x", "y", [("s", [1, 2], [-1.0, 1.0])]))

    def test_five_series_get_five_colours_inside_the_width(self):
        names = ["real (HERMES)", "SF", "CFSM", "ORCA", "Vadere OSM"]
        series = [(n, [1, 2], [k, k + 1]) for k, n in enumerate(names)]
        svg = linefig.svg_lines("t", "a", "x", "y", series)
        strokes = re.findall(r'<polyline [^>]*stroke="(#[0-9a-f]+)"', svg)
        self.assertEqual(len(set(strokes)), 5)
        for x, text in re.findall(r'<text x="([\d.]+)" y="\d+" [^>]*font-size="11">([^<]+)</text>', svg):
            if text in names:
                self.assertLessEqual(float(x) + linefig.CHAR_W * len(text), 640)

    def test_short_legends_keep_the_original_pitch(self):
        self.assertEqual(linefig.legend_slots(["a", "b", "c"], 64, 624), [(64, 0), (234, 0), (404, 0)])

    def test_long_legends_wrap_and_grow_the_figure(self):
        names = ["a rather long series label %d" % i for i in range(5)]
        slots = linefig.legend_slots(names, 64, 624)
        self.assertGreater(max(r for _, r in slots), 0)
        svg = linefig.svg_lines("t", "a", "x", "y", [(n, [1, 2], [1, 2]) for n in names])
        self.assertNotIn('viewBox="0 0 640 380"', svg)


if __name__ == "__main__":
    unittest.main()


