import contextlib
import io
import tempfile
import unittest
from pathlib import Path

import check_csv_formula_guard as g

UNGUARDED = 'export function toCsv(r) { return r.map((c) => (/[",\\n]/.test(c) ? `"${c}"` : c)).join(","); }\n'
GUARDED = UNGUARDED.replace("export", "const q = (s) => (/^[=+\\-@\\t\\r]/.test(s) && !/^-?\\d+(\\.\\d+)?$/.test(s) ? \"'\" + s : s);\nexport")


class CsvFormulaGuard(unittest.TestCase):
    def tree(self, files, baseline=""):
        d = Path(tempfile.mkdtemp())
        for rel, text in files.items():
            p = d / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(text)
        (d / "base.txt").write_text(baseline)
        return d

    def run_main(self, d):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = g.main(["--root", str(d), "--baseline", str(d / "base.txt")])
        return code, out.getvalue()

    def test_detects_exporters_and_guards(self):
        self.assertTrue(g.is_exporter(UNGUARDED))
        self.assertTrue(g.is_exporter("export const toCsv = (rows) => rows.join()"))
        self.assertFalse(g.is_exporter("import { toCsv } from './calc.mjs';"))

    def test_exporters_with_other_names_count_but_readers_do_not(self):
        # 2026-11-13: ratingsCsv and standingsCsv wrote player names unguarded
        # and the toCsv-only test never saw them.
        self.assertTrue(g.is_exporter("export function ratingsCsv(rows, method) {"))
        self.assertTrue(g.is_exporter("export async function reportCsv(r) {"))
        for reader in ("parseCsv", "splitCsvLine", "readCsv", "sampleCsv", "exampleCsv", "loadCsv", "importCsv"):
            self.assertFalse(g.is_exporter(f"export function {reader}(text) {{"), reader)
        self.assertFalse(g.is_exporter("function ratingsCsv(rows) {"), "unexported helpers stay out")
        self.assertFalse(g.is_guarded(UNGUARDED))
        self.assertTrue(g.is_guarded(GUARDED))
        self.assertTrue(g.is_guarded("if (/^[=@]/.test(v)) warn()"))

    def test_new_unguarded_exporter_fails(self):
        code, out = self.run_main(self.tree({"ventures/a/calc.mjs": UNGUARDED}))
        self.assertEqual(code, 1)
        self.assertIn("ventures/a/calc.mjs", out)

    def test_baselined_exporter_passes_and_guarded_one_needs_no_entry(self):
        d = self.tree({"ventures/a/calc.mjs": UNGUARDED, "ventures/b/calc.mjs": GUARDED,
                       "ventures/a/calc.test.mjs": UNGUARDED, "ventures/a/node_modules/x.mjs": UNGUARDED},
                      "# comment\nventures/a/calc.mjs\n")
        self.assertEqual(self.run_main(d)[0], 0)

    def test_stale_baseline_entry_fails_so_the_list_shrinks(self):
        d = self.tree({"ventures/a/calc.mjs": GUARDED}, "ventures/a/calc.mjs\n")
        code, out = self.run_main(d)
        self.assertEqual(code, 1)
        self.assertIn("delete its line", out)

    def test_repository_is_green(self):
        self.assertEqual(g.compare(g.scan(g.ROOT), g.read_baseline(g.BASELINE)), ([], []))



class WeakNumberExemption(unittest.TestCase):
    # 2026-11-14: wash-sale-checker exempted /^-?\d/ (unanchored), so "-1+CMD|..." reached the sheet raw.
    def test_unanchored_exemption_is_flagged(self):
        for line in ('if (/^[=+\\-@\\t\\r]/.test(s) && !/^-?\\d/.test(s)) s = "\'" + s;',
                     'const t = /^[=+\\-@\\t\\r]/.test(s) && !/^-?\\d/.test(s) ? "\'" + s : s;',
                     'if (/^[=+\\-@]/.test(v) && !/^[-+]?[\\d.]+/i.test(v)) v = "\'" + v;'):
            self.assertTrue(g.weak_exemptions(line), line)

    def test_anchored_exemptions_and_plain_guards_pass(self):
        for line in ('if (/^[=+\\-@\\t\\r]/.test(s) && !/^-?\\d+(\\.\\d+)?$/.test(s)) s = "\'" + s;',
                     'const defuse = (s) => (/^[=+\\-@\\t\\r]/.test(s) && !/^[+-]?\\d[\\d.,]*$/.test(s) ? "\'" + s : s);',
                     'if (/^[=+\\-@\\t\\r]/.test(s) && !/^-?\\d+(\\.\\d+)?(e[-+]?\\d+)?$/i.test(s)) s = `\'${s}`;',
                     'if (/^[=+\\-@\\t\\r]/.test(s)) s = "\'" + s;'):
            self.assertEqual(g.weak_exemptions(line), [], line)

    def test_main_fails_on_a_weak_exemption_with_no_baseline_escape(self):
        d = Path(tempfile.mkdtemp())
        p = d / "ventures" / "x" / "calc.mjs"
        p.parent.mkdir(parents=True)
        p.write_text('const cell = (s) => (/^[=+\\-@\\t\\r]/.test(s) && !/^-?\\d/.test(s) ? "\'" + s : s);\n'
                     'export function reportCsv(r) { return r.map(cell).join(","); }\n')
        (d / "base.txt").write_text("")
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = g.main(["--root", str(d), "--baseline", str(d / "base.txt")])
        self.assertEqual(code, 1)
        self.assertIn("ventures/x/calc.mjs:1", out.getvalue())


class GuardShape(unittest.TestCase):
    # 2026-11-16 (red team): insurance-commission-reconciler defused "-" only before a non-digit
    # (`/^[=+@\t\r]/.test(s) || /^-[^\d.]/.test(s)`), so "-1+HYPERLINK(...)" reached the sheet raw; and about 100 guards
    # with no number exemption wrote a negative amount or notice hours as the text "'-12.50", which a sheet cannot sum.
    def test_a_class_without_minus_tab_or_cr_is_flagged(self):
        for line in ('if (/^[=+@\\t\\r]/.test(s) || /^-[^\\d.]/.test(s)) s = "\'" + s;',
                     'if (/^[=+\\-@]/.test(t) && !/^-?\\d+(\\.\\d+)?$/.test(t)) t = `\'${t}`;'):
            self.assertTrue(any("missing" in r for r in g.guard_shape(line)), line)

    def test_a_guard_with_no_number_exemption_is_flagged(self):
        for line in ('if (/^[=+\\-@\\t\\r]/.test(s)) s = "\'" + s;',
                     'const t = String(v ?? "").replace(/^[=+\\-@\\t\\r]/, "\'$&");'):
            self.assertTrue(any("plain number" in r for r in g.guard_shape(line)), line)

    def test_complete_guards_and_detectors_pass(self):
        for line in ('if (/^[=+\\-@\\t\\r]/.test(s) && !/^-?\\d+(\\.\\d+)?$/.test(s)) s = "\'" + s;',
                     'const safe = /^[=+\\-@\\t\\r]/.test(s) && !/^-?\\d+(\\.\\d+)?$/.test(s) ? "\'" + s : s;',
                     'const t = String(v ?? "").replace(/^[=+\\-@\\t\\r]/, (c, _i, all) => (/^-?\\d+(\\.\\d+)?$/.test(all) ? c : "\'" + c));',
                     'if (/^[=+\\-@\\t\\r]/.test(s) && typeof v !== "number") s = "\'" + s;',
                     # a checker that only warns about a cell, never writes one
                     'if (/^[=@]/.test(v) || /^[+-]\\D/.test(v)) add("warning", L, "starts with a formula character");'):
            self.assertEqual(g.guard_shape(line), [], line)

    def test_main_fails_on_a_bad_guard_shape_with_no_baseline_escape(self):
        d = Path(tempfile.mkdtemp())
        p = d / "ventures" / "x" / "calc.mjs"
        p.parent.mkdir(parents=True)
        p.write_text('const cell = (s) => (/^[=+@\\t\\r]/.test(s) || /^-[^\\d.]/.test(s) ? "\'" + s : s);\n'
                     'export function reportCsv(r) { return r.map(cell).join(","); }\n')
        (d / "base.txt").write_text("")
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = g.main(["--root", str(d), "--baseline", str(d / "base.txt")])
        self.assertEqual(code, 1)
        self.assertIn("ventures/x/calc.mjs:1", out.getvalue())

    def test_repository_has_no_bad_guard_shapes(self):
        self.assertEqual(g.scan_shape(g.ROOT), [])


if __name__ == "__main__":
    unittest.main()
