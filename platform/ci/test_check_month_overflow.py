import pathlib
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import check_month_overflow as c  # noqa: E402


class MonthOverflow(unittest.TestCase):
    def test_flags_unclamped_month_steps(self):
        for line in [
            "const addMonths = (t, m) => { const d = new Date(t); d.setUTCMonth(d.getUTCMonth() + m); return d.getTime(); };",
            "d.setMonth(d.getMonth() + 1);",
            "const start = Date.UTC(x.getUTCFullYear(), x.getUTCMonth() - n, x.getUTCDate() + 1);",
            "const next = new Date(y, m + 1, d);",
            "const t = Date.UTC(y + a, d0.getUTCMonth() + Number(m[2] || 0), d0.getUTCDate());",
        ]:
            self.assertEqual(c.scan_text(line), [1], line)

    def test_accepts_clamped_and_parse_shapes(self):
        for text in [
            # step to day 1 first, then clamp (grant-deadline-tracker)
            "d.setUTCDate(1);\nd.setUTCMonth(d.getUTCMonth() + n);\nd.setUTCDate(Math.min(day, last));",
            # a second argument names the day (cron-heartbeat)
            "d.setUTCMonth(d.getUTCMonth() + 1, 1);",
            # 1-based months read in from text
            "const t = Date.UTC(y, m - 1, d);",
            "const t = Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));",
            "const t = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));",
            # day 0 = last day of the previous month, day 1 = first
            "const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();",
            "const first = Date.UTC(y, m + 1, 1);",
            # clamped day, demo days that cannot pass 28
            "const t = Date.UTC(y, m + n, Math.min(day, last));",
            "const sold = Date.UTC(2026, 3 + Math.floor(i / 14), 1 + ((i * 7) % 27));",
            # reviewed and marked, on the line or the one before
            "x = Date.UTC(y, m + 1, d); // month-overflow: ok",
            "// month-overflow: ok (checked below)\nx = Date.UTC(y, m + 1, d);",
        ]:
            self.assertEqual(c.scan_text(text), [], text)

    def test_root_is_the_repository(self):
        self.assertTrue((c.ROOT / "platform" / "ci" / "check_month_overflow.py").is_file())

    def test_cli_exit_codes_and_root_argument(self):
        script = pathlib.Path(c.__file__)
        with tempfile.TemporaryDirectory() as bad, tempfile.TemporaryDirectory() as clean:
            pathlib.Path(bad, "dates.mjs").write_text("d.setUTCMonth(d.getUTCMonth() + 3);\n")
            pathlib.Path(clean, "dates.mjs").write_text("d.setUTCMonth(d.getUTCMonth() + 3, 1);\n")
            r = subprocess.run([sys.executable, str(script), bad], capture_output=True, text=True)
            self.assertEqual(r.returncode, 1, r.stdout)
            self.assertIn("dates.mjs:1", r.stdout)
            r = subprocess.run([sys.executable, str(script), clean], capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stdout)

    def test_ventures_tree_is_clean(self):
        r = subprocess.run([sys.executable, str(pathlib.Path(c.__file__))], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stdout)


if __name__ == "__main__":
    unittest.main()
