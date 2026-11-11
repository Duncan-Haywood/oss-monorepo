import math
import os
import random
import sys
import unittest

from tennisbots import ballistics as bl
from tennisbots import catcher, collector, court, drive, protocol, tracker, vision

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "firmware", "esp32"))
sys.modules.setdefault("protocol", protocol)  # firmware imports it by bare name, as on the board
import controller  # noqa: E402


class TrackerTest(unittest.TestCase):
    def _track(self, topspin_rpm, seed=4):
        rng = random.Random(seed)
        v0 = bl.launch_velocity(24.0, math.radians(10), math.radians(178))
        spin = bl.spin_vector(v0, topspin_rpm * bl.RPM)
        truth = bl.simulate((11.5, 1.0, 1.0), v0, spin, max_bounces=0)
        self.assertFalse(truth.hit_net)
        tr = tracker.BallTracker(measurement_sigma=0.03)
        for s in truth.states[::4][:30]:  # 125 Hz for 0.24 s
            tr.observe(s.t, tuple(c + rng.gauss(0, 0.03) for c in s.pos))
        return truth, tr, spin

    def _landing_error(self, truth, pred):
        return math.hypot(pred.first_bounce.pos[0] - truth.first_bounce.pos[0],
                          pred.first_bounce.pos[1] - truth.first_bounce.pos[1])

    def test_estimates_velocity_and_predicts_landing(self):
        v_err, land_err = [], []
        for seed in range(10):
            truth, tr, _ = self._track(0.0, seed)
            t, _, v = tr.estimate()
            true_v = min(truth.states, key=lambda s: abs(s.t - t)).vel
            v_err.append(bl.norm(tuple(a - b for a, b in zip(v, true_v))))
            land_err.append(self._landing_error(truth, tr.predict(max_bounces=0)))
        # 3 cm fixes for 0.24 s: mean errors well under a net width.
        self.assertLess(sum(v_err) / 10, 0.5)
        self.assertLess(sum(land_err) / 10, 0.6)

    def test_unknown_spin_is_the_main_error(self):
        # Topspin the tracker cannot see shortens the real flight; the closed-loop
        # study replans as more frames arrive, which is how the robot copes.
        truth, tr, spin = self._track(1500.0)
        blind = self._landing_error(truth, tr.predict(max_bounces=0))
        told = self._landing_error(truth, tr.predict(max_bounces=0, spin=spin))
        self.assertLess(told, 0.6)
        self.assertGreater(blind, told)

    def test_resets_on_bounce(self):
        tr = tracker.BallTracker(measurement_sigma=0.01)
        for i in range(10):
            tr.observe(i * 0.01, (i * 0.2, 0.0, 1.0 - i * 0.1))
        tr.observe(0.10, (2.0, 0.0, 3.0))  # wildly inconsistent fix
        self.assertEqual(tr.fixes, 1)


class CatcherTest(unittest.TestCase):
    def test_move_is_time_optimal_and_stops(self):
        y, v = catcher.move(0.0, 0.0, 2.0, 3.0, 2.5, 5.0)
        self.assertAlmostEqual(y, 2.0, delta=0.01)
        self.assertAlmostEqual(v, 0.0, delta=0.02)
        # In 0.5 s from rest at 5 m/s^2 the base covers at most 0.625 m.
        y, _ = catcher.move(0.0, 0.0, 3.0, 0.5, 2.5, 5.0)
        self.assertLessEqual(y, 0.63)
        self.assertGreater(y, 0.55)

    def test_plan_reaches_wide_ball(self):
        rig = catcher.CatchRig()
        v = bl.launch_velocity(25.0, math.radians(8), math.atan2(-2.5, -court.HALF_LENGTH - 11.5))
        f = bl.simulate((11.5, 0.0, 1.0), v, max_bounces=3)
        p = catcher.plan(f, 0.0, 0.0, 0.0, rig)
        self.assertIsNotNone(p)
        self.assertTrue(p.catchable)
        self.assertLess(p.cross_y, -1.0)

    def test_moving_net_beats_fixed_net(self):
        moving = catcher.study(40, catcher.CatchRig(net_width=2.0), seed=7)
        fixed = catcher.study(40, catcher.CatchRig(net_width=2.0, max_speed=1e-9), seed=7)
        self.assertEqual(moving.returns, 40)
        self.assertGreater(moving.catch_rate, fixed.catch_rate + 0.3)


class CollectorTest(unittest.TestCase):
    def test_segment_rect(self):
        r = court.Rect(0, 0, 1, 1)
        self.assertTrue(collector.segment_hits_rect((-1, 0.5), (2, 0.5), r))
        self.assertFalse(collector.segment_hits_rect((-1, 2), (2, 2), r))
        self.assertFalse(collector.segment_hits_rect((-1, 1), (2, 1), r))  # along an edge

    def test_detours_around_keep_out(self):
        p = collector.Planner([court.Rect(-1, -1, 1, 1)], rover_half_width=0.2, clearance=0.0)
        length, pts = p.path((-3, 0), (3, 0))
        self.assertGreater(length, 6.0)
        self.assertTrue(all(p.clear(a, b) for a, b in zip(pts, pts[1:])))

    def test_route_visits_every_reachable_ball_and_dumps(self):
        rng = random.Random(2)
        balls = [(rng.uniform(-13, 13), rng.uniform(-6, 6)) for _ in range(80)]
        p = collector.Planner(collector.practice_zones())
        r = p.collect((-14.0, 6.0), balls, capacity=20)
        self.assertEqual(r.picks + len(r.skipped), 80)
        self.assertGreaterEqual(sum(1 for e, _ in r.events if e == "dump"), math.ceil(r.picks / 20))
        self.assertTrue(all(p.clear(a, b) for a, b in zip(r.waypoints, r.waypoints[1:])))
        self.assertTrue(all(not p.blocked(b) for e, b in r.events if e == "pick"))

    def test_two_opt_not_worse_than_greedy_baseline(self):
        balls = [(float(x), float(y)) for x in range(5) for y in (0, 3)]
        p = collector.Planner()
        tour = p.order((0.0, -1.0), balls)
        length = sum(math.dist(a, b) for a, b in zip([(0.0, -1.0)] + tour, tour))
        self.assertLessEqual(length, 4 + 3 + 4 + 1 + 1e-6)

    def test_sweep_covers_lanes_and_avoids_zone(self):
        p = collector.Planner([court.Rect(2, 2, 4, 4)], rover_half_width=0.25, clearance=0.0)
        pts = p.sweep(court.Rect(0, 0, 6, 6), 0.5)
        ys = sorted({round(y, 3) for _, y in pts})
        self.assertGreaterEqual(len(ys), 11)
        self.assertTrue(all(p.clear(a, b) for a, b in zip(pts, pts[1:])))


class DriveTest(unittest.TestCase):
    def test_follows_path_to_goal(self):
        pose, t = drive.follow([(0, 0), (4, 0), (4, 4)], drive.Pose(0, 0, 0))
        self.assertLess(math.hypot(pose.x - 4, pose.y - 4), 0.1)
        self.assertLess(t, 60)

    def test_wheel_speeds_respect_limit(self):
        d = drive.DiffDrive(max_wheel_speed=1.0)
        left, right = d.wheels(1.0, 5.0)
        self.assertLessEqual(max(abs(left), abs(right)), 1.0 + 1e-9)


class VisionTest(unittest.TestCase):
    def test_homography_roundtrip(self):
        # A synthetic perspective camera.
        true = vision.Homography([0.02, 0.001, -5.0, 0.0005, 0.05, -12.0, 0.00001, 0.002, 1.0])
        pixels = [(100, 400), (1200, 420), (900, 120), (300, 110), (640, 300), (50, 250)]
        ground = [true.to_ground(u, v) for u, v in pixels]
        fit = vision.Homography.fit(pixels, ground)
        for u, v in [(700, 200), (200, 380)]:
            a, b = true.to_ground(u, v), fit.to_ground(u, v)
            self.assertAlmostEqual(a[0], b[0], places=5)
            self.assertAlmostEqual(a[1], b[1], places=5)

    def test_degenerate_points(self):
        with self.assertRaises(ValueError):
            vision.Homography.fit([(0, 0), (1, 1), (2, 2), (3, 3)], [(0, 0), (1, 1), (2, 2), (3, 3)])


class ProtocolTest(unittest.TestCase):
    def test_roundtrip_with_noise_and_split_reads(self):
        frames = [protocol.encode(protocol.SET_WHEELS, 4200, 2100), protocol.encode(protocol.FEED, 1),
                  protocol.encode(protocol.HEARTBEAT), protocol.encode(protocol.DRIVE, -300, 450)]
        stream = b"\x00\xff" + frames[0] + b"\xa5\x10\x04garbage" + b"".join(frames[1:])
        d = protocol.Decoder()
        out = []
        for i in range(0, len(stream), 3):
            out += d.feed(stream[i:i + 3])
        self.assertEqual(out, [(protocol.SET_WHEELS, (4200, 2100)), (protocol.FEED, (1,)),
                               (protocol.HEARTBEAT, ()), (protocol.DRIVE, (-300, 450))])
        self.assertGreaterEqual(d.errors, 1)

    def test_corrupt_crc_dropped(self):
        f = bytearray(protocol.encode(protocol.FEED, 2))
        f[-1] ^= 0xFF
        self.assertEqual(protocol.Decoder().feed(bytes(f)), [])


class FakeHw:
    def __init__(self):
        self.log = []
        self.button = False
        self.bump = False

    def __getattr__(self, name):
        def rec(*a):
            self.log.append((name,) + a)
        return rec

    def estop_pressed(self):
        return self.button

    def bumper(self):
        return self.bump

    def flags(self):
        return 0

    def base_y_mm(self):
        return 120

    def rpm(self):
        return (4000, 2000)

    def battery_mv(self):
        return 25600


class FirmwareTest(unittest.TestCase):
    def test_commands_and_role_filter(self):
        hw = FakeHw()
        c = controller.Controller(hw, controller.ROLE_FEEDER, 0)
        c.tick(protocol.encode(protocol.SET_WHEELS, 9000, 3000) + protocol.encode(protocol.DRIVE, 100, 100), 10)
        self.assertIn(("set_launch_rpm", controller.MAX_RPM, 3000), hw.log)
        self.assertFalse(any(e[0] == "drive" for e in hw.log))
        self.assertEqual(c.rejected, 1)

    def test_watchdog_stops_and_recovers(self):
        hw = FakeHw()
        c = controller.Controller(hw, controller.ROLE_FEEDER, 0)
        c.tick(protocol.encode(protocol.HEARTBEAT), 100)
        hw.log.clear()
        c.tick(b"", 100 + controller.WATCHDOG_MS + 1)
        self.assertTrue(c.watchdog_tripped)
        self.assertIn(("stop_all",), hw.log)
        c.tick(protocol.encode(protocol.FEED, 1), 500)
        self.assertNotIn(("feed", 1), hw.log)
        c.tick(protocol.encode(protocol.HEARTBEAT) + protocol.encode(protocol.FEED, 1), 510)
        self.assertIn(("feed", 1), hw.log)

    def test_physical_estop_latches(self):
        hw = FakeHw()
        c = controller.Controller(hw, controller.ROLE_FEEDER, 0)
        hw.button = True
        c.tick(protocol.encode(protocol.HEARTBEAT), 10)
        self.assertTrue(c.estop)
        c.tick(protocol.encode(protocol.CLEAR_ESTOP), 20)
        self.assertTrue(c.estop)  # still held down
        hw.button = False
        c.tick(protocol.encode(protocol.CLEAR_ESTOP), 30)
        self.assertFalse(c.estop)

    def test_bumper_allows_only_reverse(self):
        hw = FakeHw()
        c = controller.Controller(hw, controller.ROLE_COLLECTOR, 0)
        hw.bump = True
        c.tick(protocol.encode(protocol.DRIVE, 300, 300), 10)
        self.assertEqual(hw.log[-1], ("drive", 0, 0))
        c.tick(protocol.encode(protocol.DRIVE, -200, -200), 20)
        self.assertEqual(hw.log[-1], ("drive", -200, -200))

    def test_telemetry(self):
        hw = FakeHw()
        c = controller.Controller(hw, controller.ROLE_FEEDER, 0)
        out = c.tick(protocol.encode(protocol.ESTOP), controller.TELEMETRY_MS)
        (cmd, vals), = protocol.Decoder().feed(out)
        self.assertEqual(cmd, protocol.TELEMETRY)
        self.assertTrue(vals[0] & protocol.FLAG_ESTOP)
        self.assertEqual(vals[1:], (120, 4000, 2000, 25600))

    def _axis(self):
        return controller.StepperAxis(200 * 4 * 10 / 360, 60.0, 120.0, -32.0, -30.0, 30.0)

    def test_azimuth_stepper_homes_then_moves(self):
        ax = self._axis()
        sent, t = 0, 0
        ax.target(10.0)                       # remembered while unhomed
        while not ax.homed:
            sent += ax.update(10, t >= 1000)  # the switch closes after 1 s of creeping
            t += 10
        self.assertLess(sent, 0)              # it crept toward negative angles
        self.assertEqual(ax.pos, -32.0)
        sent = 0
        for _ in range(300):
            sent += ax.update(10, False)
        self.assertAlmostEqual(ax.pos, 10.0, places=6)
        self.assertEqual(sent, round(42.0 * ax.k))   # every step from the switch to the goal, none lost to rounding

    def test_azimuth_trapezoid_takes_the_sized_time(self):
        ax = self._axis()
        ax.update(10, True)                   # at home (-32 deg); the goal is still 0
        for _ in range(300):
            ax.update(10, False)
        self.assertEqual(ax.pos, 0.0)
        ax.target(30.0)
        t, peak, sent = 0, 0.0, 0
        while abs(ax.pos - 30.0) > 1e-9 or ax.v:
            sent += ax.update(10, False)
            peak = max(peak, abs(ax.v))
            t += 10
            self.assertLess(t, 3000)
        # triangular profile: 2 * sqrt(30 / 120) = 1.0 s, the time cad/ sized the stepper for
        self.assertLessEqual(abs(t - 1000), 30)
        self.assertLessEqual(peak, 60.0 + 1e-9)
        self.assertEqual(sent, round(30.0 * ax.k))
        ax.target(99.0)                       # clamped to the turntable's range
        self.assertEqual(ax.goal, 30.0)

    def test_azimuth_abrupt_stop_rehomes_and_broken_switch_faults(self):
        ax = self._axis()
        ax.update(10, True)
        ax.target(30.0)
        for _ in range(40):
            ax.update(10, False)
        self.assertGreater(abs(ax.v), 10.0)
        ax.stop()                             # e-stop at speed: steps may be lost
        self.assertFalse(ax.homed)
        for _ in range(2000):                 # switch never closes: 70 deg at 5 deg/s is 14 s
            ax.update(10, False)
        self.assertTrue(ax.fault)
        self.assertEqual(ax.update(10, True), 0)
        slow = self._axis()
        slow.update(10, True)
        slow.stop()                           # a stop at rest keeps the home
        self.assertTrue(slow.homed)
        self.assertNotIn(protocol.FLAG_AZ_UNHOMED, (protocol.FLAG_ESTOP, protocol.FLAG_WATCHDOG, protocol.FLAG_BUMPER,
                                                     protocol.FLAG_HOPPER_EMPTY, protocol.FLAG_HOPPER_FULL,
                                                     protocol.FLAG_LOW_BATTERY))

    # ---- elevation actuator (2026-11-11) ----------------------------------------------------------------------

    def _elev(self, mode, **kw):
        return controller.LinearAxis(mode, controller.ElevationGeometry(), 240.0, 150.0, -15.0, 45.0, 18.0, 22.0, **kw)

    def test_elevation_geometry_matches_the_cad(self):
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "cad"))
        from otr_cad.params import Feeder  # pure dataclass, no CAD kernel needed
        p, g = Feeder(), controller.ElevationGeometry()
        self.assertEqual((p.elev_pin_x, p.elev_pin_z, p.pivot_z_rel, p.elev_anchor_dx, p.elev_anchor_dz),
                         (g.pin_x, g.pin_z + p.pivot_z_rel, p.pivot_z_rel, g.ax, g.az))
        prev = None
        for i in range(111):
            e = -40.0 + i
            self.assertAlmostEqual(g.length(e), p.elev_act_len(e), places=9)
            if prev is not None:
                self.assertLess(g.length(e), prev)          # monotonic over the whole bisection span
            prev = g.length(e)
            self.assertAlmostEqual(g.elev(g.length(e)), e, places=6)
        # a servo pulse spread evenly over -15..45 deg (the old firmware) is off by this much mid-range
        lo, hi = g.length(45.0), g.length(-15.0)
        worst = max(abs(g.elev(hi - (hi - lo) * (e + 15) / 60) - e) for e in range(-15, 46))
        self.assertAlmostEqual(worst, 1.46, places=2)

    def _plant(self, ax, steps, pos, ext=18.0, ret=22.0, dt=10, moves=True, feedback=True):
        """Drive `ax` against a simulated actuator: it moves at duty x its speed (stops at its own limits)."""
        duty = 0.0
        for _ in range(steps):
            if moves:
                pos = min(150.0, max(0.0, pos + (ext * duty if duty > 0 else ret * duty) * dt / 1000))
            duty = ax.update(dt, pos if feedback else None)
        return pos

    def test_elevation_pot_loop_reaches_the_angle(self):
        g = controller.ElevationGeometry()
        for start, goal in ((5.0, 30.0), (140.0, -10.0), (60.0, 44.9), (100.0, 0.0)):
            ax = self._elev(controller.ELEV_POT)
            ax.target(goal)
            pos = self._plant(ax, 1200, start)
            self.assertTrue(ax.settled, (start, goal))
            self.assertLess(abs(g.elev(pos + 240.0) - goal), 0.3)
        ax = self._elev(controller.ELEV_POT)
        ax.target(80.0)                       # clamped to +45 deg, 3 mm off the stops at most
        self.assertAlmostEqual(ax.goal, max(3.0, g.length(45.0) - 240.0))
        ax.target(-80.0)
        self.assertAlmostEqual(ax.goal, g.length(-15.0) - 240.0)

    def test_elevation_pot_faults_on_stall_and_lost_feedback(self):
        ax = self._elev(controller.ELEV_POT)
        ax.target(0.0)
        self._plant(ax, 100, 20.0, moves=False)     # jammed (or no motor power): 1 s without moving
        self.assertTrue(ax.fault)
        self.assertEqual(ax.update(10, 20.0), 0.0)
        self.assertFalse(ax.settled)
        ax = self._elev(controller.ELEV_POT)
        ax.target(0.0)
        self.assertEqual(ax.update(10, None), 0.0)  # pot wire off
        self.assertTrue(ax.fault)

    def test_elevation_timed_homes_then_dead_reckons(self):
        g = controller.ElevationGeometry()
        ax = self._elev(controller.ELEV_TIMED)
        ax.target(10.0)
        self.assertFalse(ax.homed)
        t, pos, duty = 0, 90.0, 0.0
        while not ax.homed:                   # retracts onto its own limit
            pos = max(0.0, pos + 22.0 * duty * 0.01)
            duty = ax.update(10, None)
            t += 10
        self.assertEqual(pos, 0.0)
        self.assertAlmostEqual(t / 1000, 150 / 22.0 * 1.25 + 0.5, delta=0.02)
        # the real actuator runs 2% fast both ways (speeds measured, not exact); the budget covers the error
        pos = self._plant(ax, 1000, pos, ext=18.36, ret=22.44)
        self.assertTrue(ax.settled)
        self.assertLessEqual(abs(pos - ax.pos), ax.budget + 0.25)
        self.assertLess(abs(g.elev(pos + 240.0) - 10.0), 1.0)
        # 5% off instead: the same move lands about 1.8 deg off, still inside the budget it reports
        far = self._elev(controller.ELEV_TIMED)
        far.target(10.0)
        p5 = self._plant(far, 2000, 0.0, ext=18.9, ret=23.1)
        self.assertLessEqual(abs(p5 - far.pos), far.budget + 0.25)
        self.assertGreater(abs(g.elev(p5 + 240.0) - 10.0), 1.5)
        # back and forth until the budget forces a re-home before a move, then it is clean again
        rehomed = False
        for goal in (40.0, -10.0, 40.0, -10.0, 40.0, -10.0):
            ax.target(goal)
            pos = self._plant(ax, 1, pos)
            rehomed = rehomed or not ax.homed
            pos = self._plant(ax, 2500, pos, ext=18.36, ret=22.44)   # homing (8.5 s) and a full move fit
            self.assertTrue(ax.settled)
            self.assertLessEqual(abs(pos - ax.pos), ax.budget + 0.25)
            self.assertLessEqual(ax.budget, 3.0 + 150 * 0.05)
        self.assertTrue(rehomed)

    def test_elevation_timed_stops(self):
        ax = self._elev(controller.ELEV_TIMED)
        self._plant(ax, 1000, 0.0)
        ax.target(-10.0)
        self._plant(ax, 50, 0.0)
        before = ax.budget
        ax.stop()                             # e-stop mid-move: coast added, home kept
        self.assertTrue(ax.homed)
        self.assertAlmostEqual(ax.budget, before + 1.0)
        loose = self._elev(controller.ELEV_TIMED, self_locking=False)
        self._plant(loose, 1000, 0.0)
        self.assertTrue(loose.homed)
        loose.stop()                          # the head sinks with the power off: position unknown
        self.assertFalse(loose.homed)

    def test_elevation_rc_pulse_follows_the_geometry(self):
        g = controller.ElevationGeometry()
        ax = self._elev(controller.ELEV_RC)
        ax.target(15.0)
        frac = ax.update(10, None)
        self.assertAlmostEqual(frac, (g.length(15.0) - 240.0) / 150.0)
        self.assertFalse(ax.settled)          # the estimate assumes it starts at the far end
        n = 1
        while not ax.settled:
            ax.update(10, None)
            n += 1
        self.assertLessEqual(n * 10, 150 / 18.0 * 1000 + 20)
        ax.stop()
        ax.update(10, None)
        self.assertFalse(ax.settled)

    def test_azimuth_settled(self):
        ax = self._axis()
        self.assertFalse(ax.settled)
        ax.update(10, True)                   # homed at -32 deg; the goal is still 0
        self.assertFalse(ax.settled)
        for _ in range(300):
            ax.update(10, False)
        self.assertTrue(ax.settled)
        ax.target(10.0)
        self.assertFalse(ax.settled)
        self.assertNotIn(protocol.FLAG_AIM_SETTLING, (protocol.FLAG_AZ_UNHOMED, protocol.FLAG_LOW_BATTERY))
        self.assertEqual(protocol.FLAG_AIM_SETTLING & protocol.FLAG_ELEV_FAULT, 0)

    def test_feeder_board_layer_runs_on_stub_pins(self):
        """main.py's FeederHw on stand-in machine/time modules: each elevation mode builds, aims and stops, and the
        feed gate stays shut until the aim has arrived (the layer has never run on a board)."""
        import types
        state = {"adc": 30000}

        class Pin:
            IN, OUT, PULL_UP, IRQ_RISING, IRQ_FALLING = 0, 1, 2, 4, 8

            def __init__(self, n, *a, **k):
                self.n, self.v = n, k.get("value", 1)

            def value(self, v=None):
                if v is None:
                    return 0 if self.n == 22 else self.v   # azimuth home switch closed; e-stop (4) not pressed
                self.v = v

            def irq(self, *a):
                pass

        class PWM:
            def __init__(self, pin, freq=0, duty_u16=0):
                self.duty = duty_u16

            def duty_u16(self, d):
                self.duty = d

        class ADC:
            ATTN_11DB = 3

            def __init__(self, pin, atten=None):
                self.pin = pin

            def read_u16(self):
                return state["adc"]

            def read_uv(self):
                return 2_300_000

        machine = types.SimpleNamespace(Pin=Pin, PWM=PWM, ADC=ADC, UART=object)
        fake_time = types.SimpleNamespace(sleep_us=lambda us: None, sleep_ms=lambda ms: None, ticks_ms=lambda: 0,
                                          ticks_diff=lambda a, b: a - b)
        path = os.path.join(os.path.dirname(__file__), "..", "firmware", "esp32")
        with open(os.path.join(path, "main.py")) as f:
            src = f.read()
        self.assertTrue(src.rstrip().endswith("run()"))
        src = src.rstrip()[:-len("run()")]
        import importlib.util
        spec = importlib.util.spec_from_file_location("fw_config", os.path.join(path, "config.py"))
        for mode in (controller.ELEV_RC, controller.ELEV_POT, controller.ELEV_TIMED):
            cfg = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(cfg)
            cfg.ELEV_MODE = mode
            saved = {k: sys.modules.get(k) for k in ("machine", "time", "config")}
            sys.modules.update(machine=machine, time=fake_time, config=cfg)
            try:
                ns = {"__name__": "fw_main"}
                exec(compile(src, "main.py", "exec"), ns)
                hw = ns["FeederHw"]()
            finally:
                for k, v in saved.items():
                    if v is None:
                        sys.modules.pop(k, None)
                    else:
                        sys.modules[k] = v
            hw.set_aim(1000, 0)
            hw.feed(1)
            hw.update(10, 0)
            self.assertTrue(hw.flags() & protocol.FLAG_AIM_SETTLING, mode)
            self.assertEqual(hw.gate.pwm.duty, int(1000 / 20000 * 65535), mode)   # gate shut while aiming
            hw.stop_all()
            self.assertFalse(hw.flags() & protocol.FLAG_ELEV_FAULT, mode)
            if mode == controller.ELEV_POT:
                state["adc"] = 0               # wiper off: below the calibrated span
                hw.update(10, 10)
                self.assertTrue(hw.flags() & protocol.FLAG_ELEV_FAULT)
                state["adc"] = 30000

if __name__ == "__main__":
    unittest.main()
