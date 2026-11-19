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
        # Exact counts pin the closed loop (flight, tracker, planner, net geometry): a changed net width,
        # lift constant or drive limit moves them (quality audit 2026-11-08: a doubled net passed every test).
        self.assertEqual((moving.caught, moving.too_wide, moving.too_high), (32, 8, 0))
        self.assertEqual((fixed.caught, fixed.too_wide, fixed.too_high), (8, 32, 0))

    def test_catch_window_is_the_net_minus_a_ball_radius(self):
        # A 3.0 m x 2.5 m net catches a ball whose centre is within 1.5 - 0.0335 m of the base centre and
        # at most 2.5 - 0.0335 m up (ITF ball, 6.54-6.86 cm diameter; the model's radius is 33.5 mm).
        rig = catcher.CatchRig()
        self.assertTrue(rig.catches(0.5, 0.5 + 1.4660, 1.0))
        self.assertFalse(rig.catches(0.5, 0.5 + 1.4670, 1.0))
        self.assertTrue(rig.catches(0.5, 0.5 - 1.4660, 1.0))
        self.assertFalse(rig.catches(0.5, 0.5 - 1.4670, 1.0))
        self.assertTrue(rig.catches(0.0, 0.0, 2.4660))
        self.assertFalse(rig.catches(0.0, 0.0, 2.4670))

    def test_readme_headline_cell_reproduces(self):
        # README "What the simulation says about the catch net": 3.0 m net on a 2.5 m/s base, 300 returns,
        # seed 1 -> 91%, and the same net fixed -> 31%. Recomputed 2026-11-14: 274/300 and 93/300 (~30 s each).
        moving = catcher.study(300, catcher.CatchRig(net_width=3.0, max_speed=2.5), seed=1)
        self.assertEqual((moving.returns, moving.caught), (300, 274))
        with open(os.path.join(os.path.dirname(__file__), "..", "README.md")) as fh:
            readme = fh.read()
        self.assertIn("| 3.0 m | 31% | 64% | 91% | 97% |", readme)


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
    def test_base_target_is_clamped_to_the_rail(self):
        # hardware/feeder-catcher.md: lateral travel +/- 4.0 m; safety.md: base limits are enforced in firmware.
        hw = FakeHw()
        c = controller.Controller(hw, controller.ROLE_FEEDER, 0)
        c.tick(protocol.encode(protocol.SET_BASE, 9000, 2000), 10)
        c.tick(protocol.encode(protocol.SET_BASE, -32000, 9000), 20)
        c.tick(protocol.encode(protocol.SET_BASE, 1234, 1500), 30)
        moves = [e for e in hw.log if e[0] == "set_base"]
        self.assertEqual(moves, [("set_base", 4000, 2000), ("set_base", -4000, controller.MAX_BASE_MM_S),
                                 ("set_base", 1234, 1500)])

    def test_commands_and_role_filter(self):
        hw = FakeHw()
        c = controller.Controller(hw, controller.ROLE_FEEDER, 0)
        c.tick(protocol.encode(protocol.SET_WHEELS, 9000, 3000) + protocol.encode(protocol.DRIVE, 100, 100), 10)
        self.assertIn(("set_launch_rpm", controller.MAX_RPM, 3000), hw.log)
        self.assertFalse(any(e[0] == "drive" for e in hw.log))
        self.assertEqual(c.rejected, 1)

    def test_power_gate_enables_only_after_the_coil_settles(self):
        # 2026-11-14: the stepper driver's ENABLE stays off through the precharge and until the contactor's coil has been
        # on for settle_ms (pull-in plus bounce); any drop turns it off at once and is reported once.
        g = controller.PowerGate(150)
        self.assertFalse(g.update(False, 0))
        self.assertFalse(g.enabled)
        g.update(True, 500)               # the timer closes the coil
        g.update(True, 649)
        self.assertFalse(g.enabled)
        g.update(True, 650)
        self.assertTrue(g.enabled)
        self.assertTrue(g.update(False, 700))    # e-stop: lost, reported once
        self.assertFalse(g.enabled)
        self.assertFalse(g.update(False, 710))
        self.assertEqual(g.losses, 1)
        # a coil that flickers (a loose wire) restarts the wait each time
        for t in (800, 900, 1000):
            g.update(True, t)
            g.update(False, t + 100 - 1)
        self.assertFalse(g.enabled)
        self.assertEqual(g.losses, 1)

    def test_bus_loss_halts_and_drops_the_feed_queue(self):
        # A wireless e-stop cuts the coil without the board seeing its switch; bus_tick reports it and the controller
        # halts, so a FEED queued before the cut cannot start the servo during the next precharge.
        class BusHw(FakeHw):
            def __init__(self):
                super().__init__()
                self.lost_at = None

            def bus_tick(self, now):
                return now == self.lost_at

        hw = BusHw()
        c = controller.Controller(hw, controller.ROLE_FEEDER, 0)
        c.tick(protocol.encode(protocol.FEED, 2), 10)
        hw.log.clear()
        hw.lost_at = 20
        c.tick(protocol.encode(protocol.HEARTBEAT), 20)
        self.assertIn(("stop_all",), hw.log)
        hw.log.clear()
        c.tick(protocol.encode(protocol.HEARTBEAT), 30)
        self.assertNotIn(("stop_all",), hw.log)

    def test_unpowered_stepper_must_home_again(self):
        ax = controller.StepperAxis(55.6, 60.0, 120.0, -32.0, -30.0, 30.0)
        ax.homed, ax.pos = True, 10.0
        ax.unpowered()
        self.assertFalse(ax.homed)
        self.assertFalse(ax.settled)

    def test_settle_time_matches_the_cad_model(self):
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "cad"))
        from otr_cad.params import Feeder
        import config
        self.assertEqual(config.CONTACTOR_SETTLE_MS, Feeder.stepper_enable_after_ms)
        self.assertFalse(Feeder.stepper_holds_at_power_up)

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
        # A pivot with either wheel forward is still forward motion into the obstacle (quality audit 2026-11-19:
        # `or` -> `and` in the bumper rule passed every test).
        # tick() re-zeroes forward drive as a second line, so also check the handler never commands it at all.
        c.tick(protocol.encode(protocol.DRIVE, 300, -100), 30)
        self.assertEqual(hw.log[-1], ("drive", 0, 0))
        c.tick(protocol.encode(protocol.DRIVE, -100, 300), 40)
        self.assertEqual(hw.log[-1], ("drive", 0, 0))
        self.assertNotIn(("drive", 300, -100), hw.log)
        self.assertNotIn(("drive", -100, 300), hw.log)

    def test_safety_doc_speed_covers_firmware_limit(self):
        # safety.md once said ~30 m/s while MAX_RPM allows ~47 m/s (quality audit 2026-11-19).
        import re
        from tennisbots import launcher
        v = launcher.WheelLauncher().exit(controller.MAX_RPM, controller.MAX_RPM)[0]
        path = os.path.join(os.path.dirname(__file__), "..", "hardware", "safety.md")
        with open(path, encoding="utf-8") as f:
            stated = float(re.search(r"up to about (\d+(?:\.\d+)?) m/s", f.read()).group(1))
        self.assertGreaterEqual(stated, v - 0.5)

    def test_telemetry(self):
        hw = FakeHw()
        c = controller.Controller(hw, controller.ROLE_FEEDER, 0)
        out = c.tick(protocol.encode(protocol.ESTOP), controller.TELEMETRY_MS)
        (cmd, vals), = protocol.Decoder().feed(out)
        self.assertEqual(cmd, protocol.TELEMETRY)
        self.assertTrue(vals[0] & protocol.FLAG_ESTOP)
        self.assertEqual(vals[1:], (120, 4000, 2000, 25600, 0))

    def _axis(self):
        return controller.StepperAxis(200 * 4 * 10 / 360, 60.0, 120.0, -32.0, -30.0, 30.0)

    def _home(self, ax, start_deg=0.0, limit_ms=60000):
        """Run the axis against a turntable whose cam holds the switch closed at or below -32 deg (cad:
        Feeder.home_switch_design); return the true angle once homed."""
        true = start_deg
        for _ in range(limit_ms // 10):
            if ax.homed or ax.fault:
                break
            true += ax.update(10, true <= -32.0) / ax.k
        return true

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
        self._home(ax, -32.0)                 # at home (-32 deg); the goal is still 0
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
        self._home(ax, -32.0)
        ax.target(30.0)
        for _ in range(40):
            ax.update(10, False)
        self.assertGreater(abs(ax.v), 10.0)
        ax.stop()                             # e-stop at speed: steps may be lost
        self.assertFalse(ax.homed)
        for _ in range(2000):                 # switch never closes: 82 deg at 5 deg/s is 16.4 s
            ax.update(10, False)
        self.assertTrue(ax.fault)
        self.assertEqual(ax.update(10, True), 0)
        slow = self._axis()
        self._home(slow, -32.0)
        slow.stop()                           # a stop at rest keeps the home
        self.assertTrue(slow.homed)
        self.assertNotIn(protocol.FLAG_AZ_UNHOMED, (protocol.FLAG_ESTOP, protocol.FLAG_WATCHDOG, protocol.FLAG_BUMPER,
                                                     protocol.FLAG_HOPPER_EMPTY, protocol.FLAG_HOPPER_FULL,
                                                     protocol.FLAG_LOW_BATTERY))

    def test_azimuth_homes_from_either_side_of_the_switch(self):
        # The cam holds the switch closed below home. Before 2026-11-12 a closed switch was taken as home at once, so
        # a head left at -35 deg (turned by hand, or coasting after a power cut) homed 3 deg off: 1.3 m at 24 m.
        for start in (25.0, 0.0, -31.9, -32.0, -33.0, -35.0, -37.4):
            ax = self._axis()
            true = self._home(ax, start)
            self.assertTrue(ax.homed, start)
            # the home is taken on the closing edge, so the true angle is within one microstep below -32
            self.assertLessEqual(true, -32.0, start)
            self.assertGreater(true, -32.0 - 1.5 / ax.k, start)
            for _ in range(600):
                true += ax.update(10, true <= -32.0) / ax.k
            self.assertLess(abs(true - ax.pos), 1.5 / ax.k, start)   # it knows where it is
            self.assertAlmostEqual(ax.pos, 0.0, places=6)

    def test_azimuth_stuck_closed_switch_faults_instead_of_homing(self):
        ax = self._axis()
        moved = 0
        for _ in range(1000):                 # a switch wire shorted to ground reads closed everywhere
            moved += ax.update(10, True)
            if ax.fault:
                break
        self.assertTrue(ax.fault)
        self.assertFalse(ax.homed)
        self.assertGreater(moved, 0)          # it tried to leave the cam toward positive angles
        self.assertLess(moved / ax.k, 12.5)   # and gave up after off_cam_deg

    def test_azimuth_home_matches_the_cad(self):
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "cad"))
        from otr_cad.params import Feeder  # pure dataclass, no CAD kernel needed
        p, ax = Feeder(), self._axis()
        h = p.home_switch_design()
        import config  # noqa: E402  (firmware/esp32 is on the path)
        self.assertEqual(config.AZ_HOME_DEG, p.az_home_deg)
        self.assertEqual(config.AZ_MICROSTEPS, p.az_microsteps)
        self.assertEqual(config.AZ_RATIO, p.az_ratio)
        # backing off from the lowest angle the pinion still drives must not trip the stuck-switch fault
        self.assertLess(h["off_cam_max_deg"], ax.off_cam)
        # and a seek from the top of the sector's teeth must not trip the broken-switch fault
        self.assertLess((p.az_sector_ends_deg()[1] - 90.0) - p.az_home_deg, ax.search)

    # ---- elevation actuator (2026-11-11) ----------------------------------------------------------------------

    def test_lift_runs_on_after_each_ball_and_stops_with_everything(self):
        lift = controller.LiftRun(16000)
        self.assertEqual(lift.update(0), 0.0)                 # off from power-up
        lift.kick(1000)
        self.assertEqual(lift.update(1001), 1.0)
        lift.kick(9000)                                       # a second ball restarts the timer
        self.assertEqual(lift.update(24999), 1.0)
        self.assertEqual(lift.update(25000), 0.0)
        lift.kick(30000)
        lift.stop()                                           # e-stop or watchdog
        self.assertEqual(lift.update(30001), 0.0)

    def test_lift_jam_cutoff_blanks_the_start_trips_retries_and_latches(self):
        # 2026-11-15, cad/README.md "Lift jam cutoff": over-current ignored for blank_ms after each start, then on two
        # ticks (trip_ms) it cuts the motor, rests, retries once, then stays off until clear() (the bus dropping).
        lift = controller.LiftRun(16000, 1.0, blank_ms=300, trip_ms=10, rest_ms=2000, retries=1)
        lift.kick(0)
        for t in range(0, 300, 10):
            self.assertEqual(lift.update(t, True), 1.0, t)      # a start draws stall current: blanked
        self.assertEqual(lift.update(300, False), 1.0)
        self.assertEqual(lift.update(310, True), 1.0)            # one tick over: a stray reading, not a stall
        self.assertEqual(lift.update(320, False), 1.0)
        self.assertEqual(lift.update(330, True), 1.0)
        self.assertEqual(lift.update(340, True), 0.0)            # two ticks over: cut
        self.assertEqual(lift.trips, 1)
        self.assertFalse(lift.jammed)
        for t in range(350, 2340, 10):
            self.assertEqual(lift.update(t, False), 0.0, t)     # resting
        lift.kick(1000)                                          # a ball fed meanwhile does not end the rest
        self.assertEqual(lift.update(1500, False), 0.0)
        self.assertEqual(lift.update(2340, True), 1.0)           # retry: blanked again from its own start
        self.assertEqual(lift.update(2630, True), 1.0)
        self.assertEqual(lift.update(2640, True), 1.0)
        self.assertEqual(lift.update(2650, True), 0.0)           # second stall: give up
        self.assertTrue(lift.jammed)
        lift.kick(3000)                                          # balls fed while jammed do not restart it
        self.assertEqual(lift.update(3010, False), 0.0)
        lift.stop()                                              # a watchdog or ESTOP frame does not clear it
        lift.kick(3100)
        self.assertEqual(lift.update(3110, False), 0.0)
        self.assertTrue(lift.jammed)
        lift.clear()                                             # the e-stop pressed: the bus dropped
        self.assertFalse(lift.jammed)
        lift.kick(4000)
        self.assertEqual(lift.update(4000, False), 1.0)

    def test_lift_trip_count_resets_after_a_clean_run_on(self):
        lift = controller.LiftRun(1000, 1.0, blank_ms=100, trip_ms=10, rest_ms=200, retries=1)
        lift.kick(0)
        lift.update(0, False)
        for t in range(100, 130, 10):
            lift.update(t, True)
        self.assertEqual(lift.trips, 1)                          # cut at 110; retry from 310 with a full run-on
        for t in range(130, 1310, 10):
            self.assertEqual(lift.update(t, False), 0.0 if t < 310 else 1.0, t)
        self.assertEqual(lift.update(1310, False), 0.0)          # run-on over, untripped
        self.assertEqual(lift.trips, 0)
        lift.kick(2000)
        lift.update(2000, False)
        for t in range(2100, 2130, 10):
            lift.update(t, True)
        self.assertFalse(lift.jammed)                            # one trip again, not the second in a row

    def test_lift_jam_config_matches_the_cad(self):
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "cad"))
        import config
        from otr_cad.params import Feeder
        p = Feeder()
        self.assertEqual(config.LIFT_JAM_BLANK_MS, p.lift_jam_blank_ms)
        self.assertEqual(config.LIFT_JAM_TRIP_MS, p.lift_jam_trip_ms)
        self.assertEqual(config.LIFT_JAM_REST_MS, p.lift_jam_rest_ms)
        self.assertEqual(config.LIFT_JAM_RETRIES, p.lift_jam_retries)
        self.assertEqual(config.LIFT_DUTY, p.lift_duty)
        self.assertEqual(config.LIFT_RAMP_MS, p.lift_ramp_ms)
        self.assertEqual(config.LIFT_V_REF_MV / 1000, p.lift_v_ref)
        self.assertEqual(config.LIFT_DUTY_MIN, p.lift_duty_min)
        self.assertEqual(config.LIFT_SLIP_JAMS, p.lift_slip_jams)
        self.assertEqual(p.check_lift_jam(), [])
        self.assertEqual(p.check_lift_slip(), [])
        bad = Feeder(lift_ramp_ms=250.0)
        self.assertTrue(any("soft start" in m for m in bad.check_lift_jam()))

    def test_lift_counts_every_cut(self):
        n = []
        lift = controller.LiftRun(1000, 1.0, blank_ms=100, trip_ms=10, rest_ms=200, retries=1, on_trip=lambda: n.append(1))
        lift.kick(0)
        for t in range(0, 2000, 10):
            lift.update(t, True)
        self.assertTrue(lift.jammed)
        self.assertEqual(len(n), 2)                              # the first cut and the retry's: two slides of the hub

    def test_jam_log_persists_flags_and_resets(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "j.json")
            log = controller.JamLog(path, 3)
            self.assertEqual((log.jams, log.since_set, log.due), (0, 0, False))       # no file: a new board
            for _ in range(3):
                log.add()
            self.assertTrue(log.due)
            self.assertFalse(os.path.exists(path + ".tmp"))
            log = controller.JamLog(path, 3)
            self.assertEqual((log.jams, log.since_set, log.due), (3, 3, True))
            log.reset()
            log = controller.JamLog(path, 3)
            self.assertEqual((log.jams, log.since_set, log.due), (3, 0, False))
            self.assertFalse(controller.JamLog(path, 0).due)                          # 0 never flags
            for bad in ("", "{", "[]", '{"jams": 1}', '{"jams": 1, "since_set": 2}', '{"jams": -1, "since_set": -1}',
                        '{"jams": "4", "since_set": 0}'):
                with open(path, "w") as f:
                    f.write(bad)
                log = controller.JamLog(path, 300)
                self.assertTrue(log.due, bad)                                         # a lost count is due
                self.assertTrue(controller.JamLog(path, 0).due, bad)
            log.add()
            log.reset()
            self.assertEqual(controller.JamLog(path, 300).due, False)

    def test_jam_log_keeps_counting_when_flash_will_not_write(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            log = controller.JamLog(os.path.join(d, "missing-dir", "j.json"), 2)
            log.add()
            log.add()
            self.assertTrue(log.write_failed)
            self.assertTrue(log.due)

    def test_reset_lift_hub_needs_its_key_and_the_feeder(self):
        calls = []

        class H:
            def stop_all(self): pass
            def estop_pressed(self): return False
            def lift_hub_reset(self): calls.append(1)
        c = controller.Controller(H(), controller.ROLE_FEEDER, 0)
        c.handle(protocol.RESET_LIFT_HUB, (1,), 10)
        self.assertEqual((calls, c.rejected), ([], 1))
        c.handle(protocol.RESET_LIFT_HUB, (protocol.RESET_LIFT_HUB_KEY,), 20)
        self.assertEqual(calls, [1])
        col = controller.Controller(H(), controller.ROLE_COLLECTOR, 0)
        col.handle(protocol.RESET_LIFT_HUB, (protocol.RESET_LIFT_HUB_KEY,), 10)
        self.assertEqual((calls, col.rejected), ([1], 1))

    def test_lift_soft_start_ramps_every_start(self):
        # 2026-11-15, cad/README.md "Lift coupling dynamics": the first start and the retry after a trip both ramp
        lift = controller.LiftRun(16000, 1.0, blank_ms=400, trip_ms=10, rest_ms=2000, retries=1, ramp_ms=100)
        lift.kick(0)
        duties = [lift.update(t, False) for t in range(0, 120, 10)]
        self.assertAlmostEqual(duties[0], 0.1)
        self.assertEqual(duties, sorted(duties))
        self.assertEqual(duties[9:], [1.0, 1.0, 1.0])
        for t in range(400, 430, 10):
            lift.update(t, True)                                 # stalled past the blanking: cut
        self.assertEqual(lift.update(500, False), 0.0)
        self.assertAlmostEqual(lift.update(2420, False), 0.1)    # the retry ramps again
        plain = controller.LiftRun(16000)                        # ramp_ms 0: straight to full duty
        plain.kick(0)
        self.assertEqual(plain.update(0, False), 1.0)

    def test_lift_duty_follows_the_battery(self):
        # 2026-11-15, cad/README.md "Lift duty follows the battery": the duty is held to v_ref / battery
        lift = controller.LiftRun(16000, 1.0, v_ref_mv=24000, duty_min=0.82, bus_tau_ms=500)
        lift.kick(0)
        self.assertEqual(lift.update(0, False, 24000), 1.0)                   # at the cut: full duty
        lift2 = controller.LiftRun(16000, 1.0, v_ref_mv=24000, duty_min=0.82, bus_tau_ms=500)
        lift2.kick(0)
        self.assertAlmostEqual(lift2.update(0, False, 29200), 24 / 29.2)     # first reading seeds the filter
        self.assertEqual(lift2.update(10, False, 22000), lift2.update(10, False, 22000))
        lift2.update(20, False, 1000)                                        # a dead reading is ignored
        self.assertLess(lift2.update(30, False, 29200), 1.0)
        for t in range(40, 3000, 10):                                        # a reading drifts down to 26 V
            d = lift2.update(t, False, 26000)
        self.assertAlmostEqual(d, 24 / 26, places=3)
        one = lift2.update(3010, False, 26260)                               # a braking wheel's 260 mV step
        self.assertLess(d - one, 0.2 * (d - 24 / 26.26))                     # moves it under a fifth of the way
        floor = controller.LiftRun(16000, 1.0, v_ref_mv=24000, duty_min=0.82)
        floor.kick(0)
        self.assertAlmostEqual(floor.update(0, False, 36000), 0.82)          # never under the floor
        none = controller.LiftRun(16000, 1.0, v_ref_mv=24000)
        none.kick(0)
        self.assertEqual(none.update(0, False, None), 1.0)                   # no reading yet: the fixed duty
        fixed = controller.LiftRun(16000, 1.0)
        fixed.kick(0)
        self.assertEqual(fixed.update(0, False, 29200), 1.0)                 # v_ref 0: the fixed duty
        ramp = controller.LiftRun(16000, 1.0, ramp_ms=100, v_ref_mv=24000, duty_min=0.82)
        ramp.kick(0)
        self.assertAlmostEqual(ramp.update(0, False, 29200), 0.1 * 24 / 29.2)  # the soft start ramps to the held duty

    def test_lift_run_on_covers_the_cad_return_time(self):
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "cad"))
        import config
        from otr_cad.params import Feeder  # pure dataclass, no CAD kernel needed
        need = Feeder().lift_design()["run_on_s"] * 1000
        self.assertGreaterEqual(config.LIFT_RUN_ON_MS, need)
        self.assertLess(config.LIFT_RUN_ON_MS, need + 5000)    # not running a minute for nothing

    def test_agitator_stirs_while_balls_are_wanted_and_stops_with_everything(self):
        agit = controller.AgitatorRun(3000)
        self.assertEqual(agit.update(0, False), 0.0)          # off from power-up
        self.assertEqual(agit.update(1000, True), 1.0)        # a ball queued
        self.assertEqual(agit.update(9000, True), 1.0)        # still feeding
        self.assertEqual(agit.update(11999, False), 1.0)      # run-on after the last ball left
        self.assertEqual(agit.update(12000, False), 0.0)
        agit.update(20000, True)
        agit.stop()                                           # e-stop or watchdog
        self.assertEqual(agit.update(20001, False), 0.0)

    def test_agitator_run_on_covers_two_passes(self):
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "cad"))
        import config
        from otr_cad.params import Feeder  # pure dataclass, no CAD kernel needed
        p = Feeder()
        self.assertEqual(p.check_agitator(), [])
        per_pass_ms = 60000 / p.agitator_design()["passes_per_min"]
        self.assertGreaterEqual(config.AGIT_RUN_ON_MS, 2 * per_pass_ms)
        self.assertLess(config.AGIT_RUN_ON_MS, 10000)

    def test_agitator_checks_catch_a_bad_design(self):
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "cad"))
        from otr_cad.params import Feeder
        self.assertTrue(any("past the outlet" in b for b in Feeder(agit_arm_l=100.0).check_agitator()))
        self.assertTrue(any("tub's wall" in b for b in Feeder(agit_arm_l=140.0).check_agitator()))
        self.assertTrue(any("times a minute" in b for b in Feeder(agit_motor_rpm=10.0).check_agitator()))
        self.assertTrue(any("MPa" in b for b in Feeder(agit_arm_w=8.0).check_agitator()))
        self.assertTrue(any("N m is" in b for b in Feeder(agit_motor_nm=0.5).check_agitator()))
        self.assertTrue(any("hub sits over" in b for b in Feeder(agit_back=30.0, agit_side=0.0).check_agitator()))
        self.assertTrue(any("sink into" in b for b in Feeder(agit_floor_hole=40.0).check_agitator()))
        self.assertTrue(any("shelf and tub-floor holes" in b for b in Feeder(agit_shelf_hole=7.0).check_agitator()))
        self.assertTrue(any("boss wall" in b for b in Feeder(agit_boss_d=12.0).check_agitator()))
        self.assertTrue(any("grips only" in b for b in Feeder(agit_shaft_len=18.0).check_agitator()))
        self.assertTrue(any("set screw" in b for b in Feeder(agit_shaft_len=21.0).check_agitator()))

    def _elev(self, mode, **kw):
        return controller.LinearAxis(mode, controller.ElevationGeometry(), 246.0, 150.0, -15.0, 45.0, 18.0, 22.0, **kw)

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
            self.assertLess(abs(g.elev(pos + 246.0) - goal), 0.3)
        ax = self._elev(controller.ELEV_POT)
        ax.target(80.0)                       # clamped to +45 deg
        self.assertAlmostEqual(ax.goal, g.length(45.0) - 246.0)   # 1.7 mm off the retract limit
        ax.target(-80.0)
        self.assertAlmostEqual(ax.goal, g.length(-15.0) - 246.0)

    def test_elevation_pot_faults_on_stall_and_lost_feedback(self):
        ax = self._elev(controller.ELEV_POT)
        ax.target(0.0)
        self._plant(ax, 100, 20.0, moves=False)     # jammed (or no motor power): 1 s without moving
        self.assertTrue(ax.fault)
        self.assertEqual(ax.update(10, 20.0), 0.0)
        self.assertFalse(ax.settled)
        ax = self._elev(controller.ELEV_POT)
        ax.target(0.0)
        d = ax.update(10, 60.0)
        self.assertNotEqual(d, 0.0)
        self.assertEqual(ax.update(10, None), d)    # one or two missing readings: the last duty is held
        self.assertEqual(ax.update(10, None), d)
        self.assertFalse(ax.fault)
        self.assertEqual(ax.update(10, None), 0.0)  # the third in a row (pot wire off): fault
        self.assertTrue(ax.fault)

    def test_elevation_pot_missing_readings_do_not_hide_a_stall(self):
        """2026-11-14: a reading that drops out every other tick (a PWM edge caught with no filter capacitor) must
        not reset the stall timer, or a jammed actuator never faults (tests/pot_pickup_sweep.py)."""
        ax = self._elev(controller.ELEV_POT)
        ax.target(0.0)
        for k in range(100):                        # jammed at 60 mm for 1 s, every other reading lost
            ax.update(10, None if k % 2 else 60.0)
            if ax.fault:
                break
        self.assertTrue(ax.fault)
        self.assertLessEqual(k, 70)
        ax = self._elev(controller.ELEV_POT)        # moving normally with the same dropouts: no fault
        ax.target(0.0)
        pos = 60.0
        for k in range(100):
            d = ax.update(10, None if k % 2 else pos)
            pos += 22.0 * d * 0.01
        self.assertFalse(ax.fault)

    def test_trimmed_mean_drops_the_extremes(self):
        self.assertEqual(controller.trimmed_mean([10, 11, 12, 13, 14, 15, 0, 65535]), 12.5)
        self.assertEqual(controller.trimmed_mean([7]), 7)
        self.assertEqual(controller.trimmed_mean([1, 2, 3], trim=1), 2)
        with self.assertRaises(ValueError):
            controller.trimmed_mean([1, 2], trim=1)

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
        self.assertLess(abs(g.elev(pos + 246.0) - 10.0), 1.0)
        # 5% off instead: the same move lands about 1.8 deg off, still inside the budget it reports
        far = self._elev(controller.ELEV_TIMED)
        far.target(10.0)
        p5 = self._plant(far, 2000, 0.0, ext=18.9, ret=23.1)
        self.assertLessEqual(abs(p5 - far.pos), far.budget + 0.25)
        self.assertGreater(abs(g.elev(p5 + 246.0) - 10.0), 1.5)
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

    def test_elevation_timed_refuses_a_retract_limit_past_the_clear_range(self):
        short = controller.LinearAxis(controller.ELEV_TIMED, controller.ElevationGeometry(), 240.0, 150.0, -15.0, 45.0,
                                      18.0, 22.0)
        self.assertTrue(short.fault)          # homing would pull the head to +48.8 deg, into the turntable plate
        self.assertEqual(short.update(10, None), 0.0)
        self.assertFalse(self._elev(controller.ELEV_TIMED).fault)   # 246 mm stops at +45.8 deg, inside 46.3

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
        self.assertAlmostEqual(frac, (g.length(15.0) - 246.0) / 150.0)
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
        self._home(ax, -32.0)                 # homed at -32 deg; the goal is still 0
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
        state = {"adc": 30000, "coil": False}

        class Pin:
            IN, OUT, PULL_UP, IRQ_RISING, IRQ_FALLING = 0, 1, 2, 4, 8

            def __init__(self, n, *a, **k):
                self.n, self.v = n, k.get("value", 1)

            def value(self, v=None):
                if v is None:
                    if self.n == 15:
                        return 0 if state["coil"] else 1  # contactor coil sense: low while energised
                    return 0 if self.n == 22 else self.v   # azimuth home switch closed; e-stop (4) not pressed
                self.v = v

            def irq(self, *a, **k):
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
                                          ticks_us=lambda: 0, ticks_diff=lambda a, b: a - b)
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
            # Bus precharging, contactor open (2026-11-14): the stepper driver is held off, nothing is driven even with
            # a FEED queued, and telemetry says why.
            state["coil"] = False
            hw.set_aim(1000, 0)
            hw.feed(1)
            for t in range(0, 100, 10):
                self.assertFalse(hw.bus_tick(t), mode)
                hw.update(10, t)
            self.assertEqual(hw.az_enable.v, 1, mode)
            self.assertEqual(hw.gate.pwm.duty, 0, mode)
            self.assertTrue(hw.flags() & protocol.FLAG_BUS_OFF, mode)
            # the timer closes the coil; ENABLE waits CONTACTOR_SETTLE_MS for the contacts to close and stop bouncing
            state["coil"] = True
            hw.bus_tick(100)
            hw.update(10, 100)
            self.assertEqual(hw.az_enable.v, 1, mode)
            self.assertEqual(hw.gate.pwm.duty, 0, mode)
            hw.bus_tick(100 + cfg.CONTACTOR_SETTLE_MS)
            self.assertEqual(hw.az_enable.v, 0, mode)
            self.assertFalse(hw.flags() & protocol.FLAG_BUS_OFF, mode)
            hw.stop_all()                      # what Controller does when the watchdog clears, say: queue dropped
            hw.gate_homed = False
            # No FEED yet: the shuttle's servo gets no pulse, so it draws nothing while the bus precharges (2026-11-14)
            for t in range(0, 100, 10):
                hw.update(10, t)
            self.assertEqual(hw.gate.pwm.duty, 0, mode)
            hw.set_aim(1000, 0)
            hw.feed(1)
            hw.update(10, 100)
            self.assertTrue(hw.flags() & protocol.FLAG_AIM_SETTLING, mode)
            self.assertEqual(hw.gate.pwm.duty, int(cfg.GATE_LO_US / 20000 * 65535), mode)   # back stroke first, held while aiming
            hw.update(10, 100 + cfg.GATE_BACK_MS)
            self.assertEqual(hw.gate.pwm.duty, 0, mode)     # back at the crank's dead centre: rests unpowered
            hw.stop_all()
            self.assertEqual(hw.gate.pwm.duty, 0, mode)
            self.assertFalse(hw.gate_homed, mode)            # the next FEED runs a back stroke first
            self.assertFalse(hw.flags() & protocol.FLAG_ELEV_FAULT, mode)
            # the coil drops (a wireless e-stop): ENABLE off at once, the azimuth must home again
            state["coil"] = False
            self.assertTrue(hw.bus_tick(5000), mode)
            self.assertEqual(hw.az_enable.v, 1, mode)
            self.assertFalse(hw.azim.homed, mode)
            state["coil"] = True
            hw.bus_tick(6000)
            hw.bus_tick(6000 + cfg.CONTACTOR_SETTLE_MS)
            if mode == controller.ELEV_POT:
                state["adc"] = 0               # wiper off: below the calibrated span
                hw.update(10, 10)
                hw.update(10, 20)
                self.assertFalse(hw.flags() & protocol.FLAG_ELEV_FAULT)   # two ticks could be a PWM edge (2026-11-14)
                hw.update(10, 30)
                self.assertTrue(hw.flags() & protocol.FLAG_ELEV_FAULT)
                state["adc"] = 30000

if __name__ == "__main__":
    unittest.main()
