import pathlib
import subprocess
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import check_dst_day_step as c  # noqa: E402

LOCAL = "const r = new Date(`${value}T00:00:00`);\n"


class DstDayStep(unittest.TestCase):
    def test_flags_day_steps_on_local_midnights(self):
        for line in [
            "const deadline = new Date(renewal.getTime() - days * MS_PER_DAY);",
            "const next = new Date(d.getTime() + 365 * 86400000);",
            "const due = new Date(+start + n * 864e5);",
            "d.setTime(d.getTime() + 7 * 24 * 60 * 60 * 1000);",
            "const end = new Date(start.valueOf() + DAY_MS * 30);",
        ]:
            self.assertEqual(c.scan_text(LOCAL + line), [2], line)
        for opener in ["const d = new Date(y, m - 1, day);\n", "today.setHours(0, 0, 0, 0);\n"]:
            self.assertEqual(c.scan_text(opener + "const x = new Date(today.getTime() + 3 * DAY);"), [2], opener)

    def test_accepts_utc_calendar_steps_and_day_counts(self):
        for text in [
            # UTC dates have no daylight saving
            "const d = new Date(`${s}T00:00:00Z`);\nconst e = new Date(d.getTime() + 5 * 86400000);",
            'const d = new Date(s + (s.length > 10 ? "" : "T00:00:00") + "Z");\nconst e = new Date(d.getTime() + 5 * 86400000);',
            "const t = Date.UTC(y, m - 1, d);\nconst e = new Date(t + 5 * 86400000);",
            # calendar steps and rounded day counts
            LOCAL + "const e = new Date(r.getFullYear(), r.getMonth(), r.getDate() - days);",
            LOCAL + "const n = Math.round((r.getTime() - now.getTime()) / MS_PER_DAY);",
            LOCAL + "const n = (new Date(b).getTime() - r.getTime()) / 86400000;",
            # marked as checked
            LOCAL + "// dst-day-step: ok (timestamps, not calendar days)\nconst e = new Date(r.getTime() + DAY);",
            # millisecond arithmetic that makes no Date is a timestamp, not a calendar day
            LOCAL + "const until = r.getTime() + 7 * 86400000;",
        ]:
            self.assertEqual(c.scan_text(text), [], text)

    def test_repository_ventures_are_clean(self):
        script = pathlib.Path(c.__file__)
        out = subprocess.run([sys.executable, str(script)], capture_output=True, text=True)
        self.assertEqual(out.returncode, 0, out.stdout)

    def test_cli_exits_1_on_a_hit_in_the_root_it_is_given(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            bad = pathlib.Path(d, "renewal.mjs")
            bad.write_text(LOCAL + "const e = new Date(r.getTime() - 30 * MS_PER_DAY);\n", encoding="utf-8")
            out = subprocess.run([sys.executable, str(pathlib.Path(c.__file__)), d], capture_output=True, text=True)
        self.assertEqual(out.returncode, 1, out.stdout)
        self.assertIn("renewal.mjs:2:", out.stdout)


if __name__ == "__main__":
    unittest.main()
