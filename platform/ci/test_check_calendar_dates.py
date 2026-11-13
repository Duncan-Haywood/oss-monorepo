import pathlib
import subprocess
import sys
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

    def test_the_pattern_it_guards_is_real(self):
        out = subprocess.run(["node", "-e", 'process.stdout.write(String(Number.isNaN(Date.parse("2026-02-30"))))'],
                             capture_output=True, text=True, check=True).stdout
        self.assertEqual(out, "false", "if V8 starts refusing 30 February, this lint can go")

    def test_the_tree_is_clean(self):
        self.assertEqual(c.scan([c.ROOT / "ventures", c.ROOT / "platform"]), [])


if __name__ == "__main__":
    unittest.main()
