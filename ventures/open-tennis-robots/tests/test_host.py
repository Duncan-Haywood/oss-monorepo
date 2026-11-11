"""The Pi-side drill runner against the real firmware on a simulated feeder (tests/feeder_sim.py), and the firmware
pieces it leans on: the period tachometer, the wheel speed loop and the steady-wheels gate."""

import json
import os
import unittest

from feeder_sim import SimFeeder, controller
from tennisbots import host
from tennisbots import protocol as P

HERE = os.path.dirname(__file__)


def drill():
    with open(os.path.join(HERE, "..", "drill.example.json")) as f:
        return host.plan_drill(json.load(f))


def run(sim, shots, **kw):
    link = host.FeederLink(sim, sim.clock)
    return host.run_drill(link, shots, sim.sleep, **kw), link


class DrillOnSimulatedFeederTest(unittest.TestCase):
    def _check_clean_run(self, mode):
        sim = SimFeeder(elev_mode=mode)
        shots = drill()
        res, link = run(sim, shots)
        self.assertTrue(res.ok, res.aborted)
        self.assertEqual(len(res.shots), 4)
        self.assertEqual(len(sim.released), 4)          # one gate opening per FEED, no extra ball
        self.assertEqual(res.link_errors, 0)
        for shot, (t, elev, az, top, bottom, target) in zip(shots, sim.released):
            self.assertEqual(target, (shot.rpm_top, shot.rpm_bottom))
            self.assertAlmostEqual(elev, shot.elevation_cdeg / 100, delta=0.6)   # pot deadband 0.5 mm ~ 0.25 deg
            self.assertAlmostEqual(az, shot.azimuth_cdeg / 100, delta=0.05)
            self.assertLess(abs(top - shot.rpm_top) / shot.rpm_top, 0.035)
            self.assertLess(abs(bottom - shot.rpm_bottom) / shot.rpm_bottom, 0.035)
        gaps = [b[0] - a[0] for a, b in zip(sim.released, sim.released[1:])]
        self.assertTrue(all(g >= 3.0 - 0.15 for g in gaps), gaps)
        sim.run_ms(20)
        self.assertEqual(sim.hw.target_rpm, (0, 0))      # wheels told to stop at the end
        self.assertFalse(sim.ctl.estop)

    def test_pot_actuator(self):
        self._check_clean_run(controller.ELEV_POT)

    def test_timed_actuator_homes_first(self):
        self._check_clean_run(controller.ELEV_TIMED)

    def test_estop_mid_drill_aborts_and_no_more_balls(self):
        sim = SimFeeder()
        shots = drill()
        link = host.FeederLink(sim, sim.clock)
        calls = {"n": 0}

        def sleep(s):
            calls["n"] += 1
            if len(sim.released) == 2:
                sim.estop_button = True
            sim.sleep(s)

        res = host.run_drill(link, shots, sleep)
        self.assertFalse(res.ok)
        self.assertIn("e-stop", res.aborted)
        self.assertEqual(len(sim.released), 2)
        sim.run_ms(20)
        self.assertEqual(sim.hw.target_rpm, (0, 0))

    def test_lost_feed_frame_aborts_and_drops_the_queued_ball(self):
        sim = SimFeeder()
        sim.drop_cmd = P.FEED
        res, _ = run(sim, drill())
        self.assertFalse(res.ok)
        self.assertIn("shot 0 release", res.aborted)
        sim.run_ms(20)
        self.assertTrue(sim.ctl.estop)                   # the runner's ESTOP latched the board
        self.assertEqual(sim.hw.feeding, 0)
        sim.run_ms(2000)
        self.assertEqual(sim.released, [])

    def test_broken_pot_wire_aborts(self):
        sim = SimFeeder()
        shots = drill()
        link = host.FeederLink(sim, sim.clock)

        def sleep(s):
            if len(sim.released) == 1:
                sim.pot_broken = True
            sim.sleep(s)

        res = host.run_drill(link, shots, sleep)
        self.assertFalse(res.ok)
        self.assertIn("elevation actuator fault", res.aborted)
        self.assertEqual(len(sim.released), 1)

    def test_silent_board_aborts(self):
        class Dead:
            def __init__(self):
                self.t = 0.0

            def write(self, data):
                pass

            def read(self):
                return b""

            def clock(self):
                return self.t

            def sleep(self, s):
                self.t += s

        d = Dead()
        res = host.run_drill(host.FeederLink(d, d.clock), drill(), d.sleep)
        self.assertIn("no telemetry at all", res.aborted)

    def test_plan_rejects_a_shot_it_cannot_make(self):
        with self.assertRaisesRegex(ValueError, "shot 1"):
            host.plan_drill({"shots": [{"x": 9.5, "y": 0, "speed": 20}, {"x": 9.5, "y": 0, "speed": 80}]})


class PeriodTachTest(unittest.TestCase):
    def test_reads_the_speed_the_old_counter_could_not(self):
        tach = controller.PeriodTach()
        for _ in range(6):
            tach.edge(20000)                 # 3000 rpm: one pulse every 20 ms
        self.assertEqual(tach.rpm(5000), 3000)
        # The old count-per-10-ms tachometer could only say 0 or 6000 at this speed.
        self.assertEqual({int(n * 60000 / 10) for n in (0, 1)}, {0, 6000})

    def test_glitch_is_folded_into_its_revolution(self):
        tach = controller.PeriodTach()
        for _ in range(4):
            tach.edge(20000)
        tach.edge(1000)                      # noise spike: faster than 12000 rpm
        tach.edge(19000)
        self.assertEqual(tach.rpm(0), 3000)

    def test_slowing_and_stopped_wheel(self):
        tach = controller.PeriodTach()
        for _ in range(4):
            tach.edge(20000)
        self.assertEqual(tach.rpm(40000), 1500)     # no pulse for 40 ms: at most 1500 rpm
        self.assertEqual(tach.rpm(300000), 0)
        tach.edge(2000000)                          # first pulse after two seconds stopped
        self.assertEqual(tach.rpm(0), 0)
        tach.edge(30000)
        self.assertEqual(tach.rpm(0), 2000)


class WheelLoopTest(unittest.TestCase):
    def test_feedforward_and_stop(self):
        loop = controller.WheelLoop(9000)
        self.assertAlmostEqual(loop.update(4500, 4500, 10), 0.5)
        self.assertEqual(loop.update(0, 4000, 10), 0.0)
        self.assertEqual(loop.i, 0.0)

    def test_no_windup_while_saturated(self):
        loop = controller.WheelLoop(9000)
        for _ in range(500):
            self.assertEqual(loop.update(8500, 0, 10), 1.0)
        self.assertEqual(loop.i, 0.0)

    def test_gate_needs_the_speed_held(self):
        gate = controller.SteadyGate()
        self.assertFalse(gate.update((3000, 2000), (3050, 2010), 100))
        self.assertTrue(gate.update((3000, 2000), (3050, 2010), 60))
        self.assertFalse(gate.update((3000, 2000), (3100, 2010), 10))    # 3.3% off: start over
        self.assertFalse(gate.update((0, 2000), (0, 2000), 500))          # a stopped wheel is never ready

    def test_loop_settles_over_the_plant_grid(self):
        import wheel_loop_sweep as sweep
        for max_rpm, tau in ((7000, 0.8), (11000, 0.2), (9000, 0.4)):
            first, err, _ = sweep.trial(max_rpm, tau, (5531, 1958))
            self.assertIsNotNone(first)
            self.assertLess(first, 3.0)
            self.assertLess(err, 0.035)


class TelemetryTest(unittest.TestCase):
    def test_balls_fed_round_trip(self):
        (cmd, vals), = P.Decoder().feed(P.encode(P.TELEMETRY, P.FLAG_WHEELS_SETTLING, 0, 3000, 2000, 25600, 255))
        self.assertEqual(vals[-1], 255)
        self.assertEqual(P.FLAG_WHEELS_SETTLING & (P.FLAG_AIM_SETTLING | P.FLAG_ELEV_FAULT), 0)


if __name__ == "__main__":
    unittest.main()
