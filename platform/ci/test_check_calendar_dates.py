import pathlib
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import check_calendar_dates as c  # noqa: E402


class CalendarDates(unittest.TestCase):
    def test_flags_the_rollover_patterns(self):
        for line in [
            'const isDay = (s) => /^\\d{4}-\\d{2}-\\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));',
            'if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(t) || Number.isNaN(Date.parse(t))) errors.push("x");',
            'list.some((h) => isNaN(new Date(h + "T00:00:00Z").getTime()))',
        ]:
            self.assertEqual(c.scan_text(line), [1], line)

    def test_accepts_a_round_trip_and_timestamps(self):
        for line in [
            'const ok = /^\\d{4}-\\d{2}-\\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;',
            'return Number.isNaN(Date.parse(iso)) || new Date(iso).getUTCDate() !== +day ? null : iso;',
            'if (Number.isNaN(Date.parse(observation.observed_at))) {',
        ]:
            self.assertEqual(c.scan_text(line), [], line)

    def test_flags_a_day_range_that_gives_every_month_31_days(self):
        for text in [
            'if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return null;\nreturn `${y}-${mo}-${d}`;',
            'if (m) return +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31 ? "iso" : "bad";',
            'if (mm >= 0 && mm < 12 && dd >= 1 && dd <= 31) {\n  return iso(y, mm, dd);\n}',
        ]:
            self.assertEqual(c.scan_text(text), [1], text)

    def test_accepts_a_day_range_followed_by_a_calendar_check(self):
        for text in [
            'if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return false;\nconst t = new Date(Date.UTC(y, m - 1, d));\nreturn t.getUTCDate() === d;',
            'if (mm >= 0 && mm < 12 && dd >= 1 && dd <= 31) {\n  return calDate(y, mm, dd);\n}',
            'const validDmy = (d, m) => m >= 1 && m <= 12 && d >= 1 && d <= MONTH_DAYS[m - 1];',
            'if (!(daysOpen >= 1 && daysOpen <= 31)) errors.push("Days open per month must be 1 to 31.");',
        ]:
            self.assertEqual(c.scan_text(text), [], text)

    def test_flags_the_negated_day_range(self):
        for text in [
            'if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;\nreturn Date.UTC(y, mo - 1, d);',
            'const iso = (y, m, d) => {\n  if (m < 1 || m > 12 || d < 1 || d > 31) return null;\n  return `${y}-${m}-${d}`;\n};',
            'if (!monthOk || day < 1 || day > 31) return false;',
        ]:
            self.assertEqual(c.scan_text(text), [text.count("\n", 0, text.index("31")) + 1], text)

    def test_flags_the_one_sided_reject_in_a_chain(self):
        for text in [
            'if (Number.isNaN(t) || +mo > 12 || +d > 31 || +h > 23) return null;',
            'if (x > 12 && y > 12 || x < 1 || y < 1 || x > 31 || y > 31) add("error");',
        ]:
            self.assertEqual(c.scan_text(text), [1], text)

    def test_accepts_the_one_sided_reject_with_a_round_trip_or_an_accept_range(self):
        for text in [
            'if (Number.isNaN(t) || +mo > 12 || +d > 31) return null;\nif (day.getUTCDate() !== +d) return null;',
            'if (a >= 1 && a <= 12 && b > 12 && b <= 31) return `${MON_NAME[a - 1]} ${b}`;',
            'if (hours > 12 || days > 31) warn();\nconst n = daysInMonth(m);',
        ]:
            self.assertEqual(c.scan_text(text), [], text)

    def test_accepts_the_negated_range_with_a_round_trip(self):
        for text in [
            'if (mo < 1 || mo > 12 || d < 1 || d > 31) return NaN;\nconst back = new Date(Date.UTC(y, mo - 1, d));\nif (back.getUTCMonth() !== mo - 1) return NaN;',
            'if (month < 1 || month > 12 || day < 1 || day > 31) return NaN;\nreturn utcChecked(year, month, day);',
            'if (pay < 1 || pay > 31) errors.push("Pay-run day must be 1 to 31.");',
        ]:
            self.assertEqual(c.scan_text(text), [], text)

    def test_the_calendar_check_must_sit_within_the_window(self):
        head = 'if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;\n'
        inside = head + "x;\n" * (c.WINDOW - 1) + "return t.getUTCDate() === d;"
        outside = head + "x;\n" * c.WINDOW + "return t.getUTCDate() === d;"
        self.assertEqual(c.WINDOW, 12)
        self.assertEqual(c.scan_text(inside), [])
        self.assertEqual(c.scan_text(outside), [1])

    def test_flags_the_rollover_split_over_lines(self):
        for text in [
            'function parseDate(value) {\n  const date = new Date(`${value}T00:00:00Z`);\n  return Number.isNaN(date.getTime()) ? null : date;\n}',
            'if (/^\\d{4}-\\d{2}-\\d{2}$/.test(s)) iso = s + "T00:00:00Z";\nconst d = new Date(iso);\nreturn Number.isNaN(d.getTime()) ? null : d;',
            'const t = Date.parse(s + "T00:00:00Z");\nreturn Number.isNaN(t) ? null : t;',
        ]:
            line = next(n for n, l in enumerate(text.splitlines(), 1) if "isNaN(" in l)
            self.assertEqual(c.scan_text(text), [line], text)

    def test_accepts_the_split_form_with_a_round_trip_nearby(self):
        for text in [
            'const date = new Date(`${value}T00:00:00Z`);\nreturn Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;',
            'const t = Date.parse(s + "T00:00:00Z");\nif (Number.isNaN(t)) return null;\nreturn new Date(t).getUTCDate() === d ? t : null;',
            'const start = new Date(`${x}T00:00:00Z`);\nif (isNaN(start.getTime()) || !realDay(x, start)) return null;',
            'const n = Number(raw);\nif (Number.isNaN(n)) return null;',
            'const d = new Date(stamp * 1000);\nreturn Number.isNaN(d.getTime()) ? null : d;',
        ]:
            self.assertEqual(c.scan_text(text), [], text)

    def test_root_is_the_repository(self):
        self.assertTrue((c.ROOT / "platform" / "ci" / "check_calendar_dates.py").is_file())

    def test_cli_exit_codes_and_root_argument(self):
        script = pathlib.Path(c.__file__)
        with tempfile.TemporaryDirectory() as bad, tempfile.TemporaryDirectory() as clean:
            pathlib.Path(bad, "parse.mjs").write_text("if (m < 1 || m > 12 || d < 1 || d > 31) return null;\n")
            pathlib.Path(clean, "ok.mjs").write_text("export const x = 1;\n")
            hit = subprocess.run([sys.executable, str(script), bad], capture_output=True, text=True)
            self.assertEqual(hit.returncode, 1, hit.stdout + hit.stderr)
            self.assertIn("parse.mjs:1", hit.stdout)
            ok = subprocess.run([sys.executable, str(script), clean], capture_output=True, text=True)
            self.assertEqual(ok.returncode, 0, ok.stdout + ok.stderr)
            self.assertIn("no YYYY-MM-DD validator", ok.stdout)

    def test_the_pattern_it_guards_is_real(self):
        out = subprocess.run(["node", "-e", 'process.stdout.write(String(Number.isNaN(Date.parse("2026-02-30"))))'],
                             capture_output=True, text=True, check=True).stdout
        self.assertEqual(out, "false", "if V8 starts refusing 30 February, this lint can go")

    def test_the_tree_is_clean(self):
        self.assertEqual(c.scan([c.ROOT / "ventures", c.ROOT / "platform"]), [])


if __name__ == "__main__":
    unittest.main()
