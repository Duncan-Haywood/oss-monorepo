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

    def test_the_pattern_it_guards_is_real(self):
        out = subprocess.run(["node", "-e", 'process.stdout.write(String(Number.isNaN(Date.parse("2026-02-30"))))'],
                             capture_output=True, text=True, check=True).stdout
        self.assertEqual(out, "false", "if V8 starts refusing 30 February, this lint can go")

    def test_the_tree_is_clean(self):
        self.assertEqual(c.scan([c.ROOT / "ventures", c.ROOT / "platform"]), [])


if __name__ == "__main__":
    unittest.main()
