"""tennisbots.tach: the edge-jitter estimate recovers a known jitter through a speed ramp, ripple and glitches."""

import math
import os
import random
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from tennisbots import tach  # noqa: E402


def edges(n, rpm, sd, ramp_rpm_s=0.0, seed=1):
    """Edge times in whole us of a wheel at `rpm` changing by `ramp_rpm_s`, each edge off by N(0, sd) then rounded."""
    rng = random.Random(seed)
    t, w, out = 0.0, rpm, []
    for _ in range(n + 1):
        p = 60e6 / w
        t += p
        w += ramp_rpm_s * p / 1e6
        out.append(int(round(t + rng.gauss(0.0, sd))))
    return out


def periods(e):
    return [b - a for a, b in zip(e, e[1:])]


class TachJitterTest(unittest.TestCase):
    def test_recovers_known_jitter(self):
        for sd in (0.5, 1.0, 2.0, 5.0):
            got = tach.edge_jitter(periods(edges(2000, 6000, sd, seed=int(sd * 10))))
            # whole-us rounding adds 1/12 us^2 per edge
            want = math.sqrt(sd * sd + 1 / 12)
            self.assertAlmostEqual(got["jitter_us"], want, delta=0.12 * want, msg=(sd, got))

    def test_a_speed_ramp_is_not_read_as_jitter(self):
        # a hand drill's wander, 300 rpm/s at 3,000 rpm: its first differences alone would read ~13 us
        got = tach.edge_jitter(periods(edges(1500, 3000, 1.0, ramp_rpm_s=300.0)))
        self.assertLess(abs(got["jitter_us"] - 1.04), 0.15, got)

    def test_a_missed_pulse_is_dropped(self):
        p = periods(edges(600, 6000, 1.0))
        p[300] = p[300] + p[301]
        del p[301]
        got = tach.edge_jitter(p)
        self.assertEqual(got["dropped"], 1)
        self.assertLess(got["jitter_us"], 1.3)

    def test_too_few_periods(self):
        with self.assertRaises(ValueError):
            tach.edge_jitter([10000] * 10)

    def test_advice_bands(self):
        self.assertIn("can name", tach.jitter_advice(0.4))
        self.assertIn("can name", tach.jitter_advice(0.4))
        self.assertIn("near its limit", tach.jitter_advice(0.7))
        self.assertIn("near its limit", tach.jitter_advice(1.1))
        self.assertIn("cannot see", tach.jitter_advice(2.0))

    def test_capture_hint_from_the_limit(self):
        # 2026-11-18 (README "A tach timed in hardware"): a reading at or past the survey's limit names the capture test
        self.assertNotIn("capture=True", tach.jitter_advice(0.4))
        for j in (0.7, 2.0):
            self.assertIn("capture=True", tach.jitter_advice(j))
            self.assertIn("TACH_CAPTURE", tach.jitter_advice(j))

    def test_cli(self):
        with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as f:
            f.write("# tach_log pin 34 400 periods (us)\n")
            f.write("\n".join(str(v) for v in periods(edges(400, 6000, 3.0))))
            path = f.name
        try:
            env = dict(os.environ, PYTHONPATH=os.path.join(os.path.dirname(__file__), "..", "src"))
            r = subprocess.run([sys.executable, "-m", "tennisbots", "tach-jitter", path], capture_output=True,
                               text=True, env=env)
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertIn('"jitter_us"', r.stdout)
            self.assertIn("cannot see", r.stdout)
        finally:
            os.unlink(path)


if __name__ == "__main__":
    unittest.main()
