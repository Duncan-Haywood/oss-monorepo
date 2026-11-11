"""The Pi's drill player against the firmware itself on a simulated board (src/tennisbots/simboard.py).

The board is firmware/esp32/main.py and controller.py on stub pins; the plant's wheel and actuator numbers are
assumptions (see simboard's docstring), so these tests pin behaviour, not real timings.
"""

import json
import math
import os
import types
import unittest

from tennisbots import launcher, play, protocol as P
from tennisbots.simboard import SimBoard

HERE = os.path.dirname(__file__)


def example_shots():
    with open(os.path.join(HERE, "..", "drill.example.json")) as f:
        return play.plan(json.load(f))


def released_in(board, entry):
    return [r for r in board.releases if entry.fed_ms <= r["t_ms"] <= entry.done_ms]


class DrillOnSimBoardTest(unittest.TestCase):
    def test_every_ball_leaves_with_its_own_aim_in_each_elevation_mode(self):
        shots = example_shots()
        for mode in ("rc", "pot", "timed"):
            p, b = play.run_sim(shots, SimBoard(mode))
            self.assertEqual(p.state, "finished", (mode, p.abort))
            self.assertEqual(len(b.releases), len(shots), mode)
            for s, entry in zip(shots, p.log):
                rel = released_in(b, entry)
                self.assertEqual(len(rel), 1, (mode, entry))      # one ball, between FEED and the next aim
                r = rel[0]
                self.assertLess(abs(r["elev_deg"] - s.elevation_deg), 0.5, mode)
                self.assertLess(abs(r["az_deg"] - s.azimuth_deg), 0.1, mode)
                for got, want in zip(r["rpm"], (s.rpm_top, s.rpm_bottom)):
                    self.assertLess(abs(got - want) / want, 0.05, mode)

    def test_first_shot_waits_for_azimuth_homing(self):
        p, b = play.run_sim(example_shots()[:1], SimBoard("rc", az0_deg=0.0))
        # creeping 32 deg to the home switch at 5 deg/s takes 6.4 s; nothing may fly before then
        self.assertGreater(b.releases[0]["t_ms"], 6400)
        self.assertGreater(p.log[0].ready_ms, 6400)

    def test_repeated_aim_still_feeds_once_per_shot(self):
        s = example_shots()[2]
        p, b = play.run_sim([s, s, s], SimBoard("pot"))
        self.assertEqual(p.state, "finished", p.abort)
        self.assertEqual(len(b.releases), 3)

    def test_stale_ready_frame_after_a_new_aim_is_ignored(self):
        shots = example_shots()[:2]
        p = play.DrillPlayer(shots, steady_ms=0)
        p.step(0)                                   # start: clear, wheels, aim for shot 0
        p.state, p.i = "gap", 0                     # pretend shot 0 is done; next step sends shot 1
        p.log[0].done_ms = 0
        p._t0 = 0
        tx = p.step(1)
        self.assertIn(P.encode(P.SET_AIM, int(round(shots[1].elevation_deg * 100)),
                               int(round(shots[1].azimuth_deg * 100))), tx)
        ready = P.encode(P.TELEMETRY, 0, 0, shots[1].rpm_top, shots[1].rpm_bottom, 26000)
        tx = p.step(5, ready)                       # built before the board saw the new aim
        self.assertNotIn(P.encode(P.FEED, 1), tx)
        tx = p.step(105, ready)                     # the second frame since the send is fresh
        self.assertIn(P.encode(P.FEED, 1), tx)

    def test_settling_frame_proves_the_aim_arrived(self):
        s = example_shots()[0]
        p = play.DrillPlayer([s], steady_ms=0)
        p.step(0)
        p.step(5, P.encode(P.TELEMETRY, P.FLAG_AIM_SETTLING, 0, s.rpm_top, s.rpm_bottom, 26000))
        tx = p.step(10, P.encode(P.TELEMETRY, 0, 0, s.rpm_top, s.rpm_bottom, 26000))
        self.assertIn(P.encode(P.FEED, 1), tx)

    def test_out_of_range_shot_is_skipped_not_clamped(self):
        good = example_shots()[0]
        wide = play.PlannedShot(good.elevation_deg, 40.0, good.rpm_top, good.rpm_bottom)
        p, b = play.run_sim([wide, good], SimBoard("rc"))
        self.assertEqual(p.state, "finished")
        self.assertIn("azimuth 40.0", p.log[0].error)
        self.assertEqual(len(b.releases), 1)
        strict, b2 = play.run_sim([wide, good], SimBoard("rc"), skip_bad=False)
        self.assertEqual(strict.state, "aborted")
        self.assertEqual(b2.releases, [])

    def test_estop_aborts_and_nothing_more_flies(self):
        shots = example_shots()
        b = SimBoard("rc")
        p = play.DrillPlayer(shots)
        to_board = b""
        while not p.done:
            from_board = b.step(to_board)
            if len(b.releases) == 1 and not b.estop_pressed:
                b.estop_pressed = True
            to_board = p.step(b.now_ms, from_board)
        self.assertEqual(p.abort, "e-stop")
        for _ in range(2000):
            b.step(b"")
        self.assertEqual(len(b.releases), 1)
        self.assertEqual(b.hw.target_rpm, (0, 0))

    def test_silent_board_aborts(self):
        p = play.DrillPlayer(example_shots())
        p.step(0)
        for t in range(1, 600, 10):
            p.step(t)
        self.assertEqual(p.state, "aborted")
        self.assertIn("no telemetry", p.abort)

    def test_elevation_wire_off_aborts(self):
        b = SimBoard("pot")
        b.cfg.ELEV_POT_RAW_EXTENDED = 63000
        real = b._read_adc
        b._read_adc = lambda n: 0 if (n == b.ELEV_POT and b.now_ms > 3000) else real(n)
        p, _ = play.run_sim(example_shots(), b)
        self.assertEqual(p.abort, "elevation actuator fault")

    def test_tach_reads_the_wheel_to_a_fraction_of_a_percent(self):
        b = SimBoard("rc")
        b.hw.set_launch_rpm(3000, 4500)
        b.ctl.last_rx = 10 ** 9                     # keep the watchdog quiet with no Pi attached
        for _ in range(6000):
            b.step()
        for tach, true in zip((b.hw.tach_top, b.hw.tach_bottom), b.wheel_rpm):
            self.assertLess(abs(tach.rpm - true) / true, 0.005)

    def test_the_old_counting_tach_never_let_a_ball_go(self):
        """Regression: pulses counted per 10 ms tick read only 0/6,000/12,000 rpm, so the 5% gate never opened."""
        def counting_update(self, dt):
            n = self.pulses - getattr(self, "_seen", 0)
            self._seen = self.pulses
            self.rpm = int(n * 60000 / dt) if dt else 0
        b = SimBoard("rc")
        for t in (b.hw.tach_top, b.hw.tach_bottom):
            t.update = types.MethodType(counting_update, t)
        p, b = play.run_sim(example_shots()[:1], b, settle_timeout_ms=10000)
        self.assertEqual(p.state, "aborted")
        self.assertEqual(b.releases, [])

    def test_landing_from_the_released_aim(self):
        """Where the simulated balls land, flown from the aim and wheel speeds at the gate."""
        shots = example_shots()
        wheels, origin = launcher.WheelLauncher(), launcher.default_origin(0.0, 1.0)
        p, b = play.run_sim(shots, SimBoard("pot"))
        for s, r in zip(shots, b.releases):
            v, w = wheels.exit(*r["rpm"])
            f = launcher._fly(origin, v, math.radians(r["elev_deg"]), math.radians(r["az_deg"]), w, 0.0,
                              launcher.bl.DEFAULT_BALL)
            x, y, _ = f.first_bounce.pos
            self.assertLess(math.hypot(x - s.target[0], y - s.target[1]), 0.5)


if __name__ == "__main__":
    unittest.main()
