"""The Pi-side drill runner against the real firmware on a simulated feeder (tests/feeder_sim.py), and the firmware
pieces it leans on: the period tachometer, the wheel speed loop and the steady-wheels gate."""

import json
import math
import os
import statistics
import tempfile
import struct
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
        # the ball lift runs on for the balls still coming back, at the duty held to 24 V / the 25.6 V pack reading.
        # Checked inside the run-on: since 2026-11-18 (SURVEY_QUEUE 3, README "A queued survey's heap") the Pi's wait
        # for the last balls' surveys can outlast the 16 s after the last ball, and the lift has then rightly stopped.
        on_s = sim.clock() - sim.released[-1][0]
        if on_s < 15.9:
            self.assertEqual(sim.hw.lift_pwm.duty, int(24000 / sim.pack_mv * 65535))
        else:
            self.assertEqual(sim.hw.lift_pwm.duty, 0)
            sim2, wait = SimFeeder(elev_mode=mode), host.ESC_SURVEY_S
            host.ESC_SURVEY_S = 0.0                  # the same drill without the end wait: the lift still running
            try:
                r2, _ = run(sim2, drill())
            finally:
                host.ESC_SURVEY_S = wait
            self.assertTrue(r2.ok, r2.aborted)
            self.assertLess(sim2.clock() - sim2.released[-1][0], 15.9)
            self.assertEqual(sim2.hw.lift_pwm.duty, int(24000 / sim2.pack_mv * 65535))
        sim.run_ms(3100)
        self.assertEqual(sim.hw.agit_pwm.duty, 0)        # the agitator stops once no ball is wanted

    def test_pot_actuator(self):
        self._check_clean_run(controller.ELEV_POT)

    def test_timed_actuator_homes_first(self):
        self._check_clean_run(controller.ELEV_TIMED)

    def test_head_left_past_home_still_aims(self):
        # Powered up with the head turned to -35 deg, where the home cam already holds the switch closed. The old
        # firmware took that as home (-32), so every shot went 3 deg wide; it now backs off the cam and homes on the
        # closing edge (cad: Feeder.home_switch_design).
        sim = SimFeeder(az_start_deg=-35.0)
        shots = drill()
        res, _ = run(sim, shots)
        self.assertTrue(res.ok, res.aborted)
        for shot, (_, _, az, _, _, _) in zip(shots, sim.released):
            self.assertAlmostEqual(az, shot.azimuth_cdeg / 100, delta=0.05)

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
        self.assertEqual(sim.hw.lift_pwm.duty, 0)        # e-stop stops the lift too
        self.assertEqual(sim.hw.agit_pwm.duty, 0)        # and the hopper agitator

    def test_wireless_estop_mid_drill_aborts_and_no_more_balls(self):
        # 2026-11-14: the fob cuts the contactor's coil and the board sees no switch. The coil sense drops the stepper's
        # ENABLE, halts the board (the queued FEED included) and telemetry's FLAG_BUS_OFF aborts the drill.
        sim = SimFeeder()
        shots = drill()
        link = host.FeederLink(sim, sim.clock)

        def sleep(s):
            if len(sim.released) == 2:
                sim.fob_cut = True
            sim.sleep(s)

        res = host.run_drill(link, shots, sleep)
        self.assertFalse(res.ok)
        self.assertIn("switched bus off", res.aborted)
        self.assertNotIn("reports e-stop", res.aborted)     # the wired switch was never pressed
        self.assertEqual(len(sim.released), 2)
        self.assertEqual(sim.hw.az_enable.v, 1)
        self.assertFalse(sim.hw.azim.homed)
        self.assertEqual(sim.hw.feeding, 0)
        sim.fob_cut = False                               # fob released: the bus stays off until RESET (2026-11-18)
        sim.run_ms(2000)
        self.assertTrue(sim.hw.flags() & P.FLAG_BUS_OFF)
        sim.press_reset()                                 # RESET at the machine: the bus returns, but nothing was queued
        sim.run_ms(2000)
        self.assertFalse(sim.hw.flags() & P.FLAG_BUS_OFF)
        self.assertEqual(len(sim.released), 2)

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

    def _gate_shut_after_feed(self, shut_s, **kw):
        """Run the first two shots with the board's steady gate held shut for `shut_s` after the first FEED arrives (a
        slow wheel's reading slipping out of the 3% band once the Pi has fed: README "The slow drill's release
        timeout")."""
        sim = SimFeeder()
        shots = drill()[:2]
        link = host.FeederLink(sim, sim.clock)
        until = []

        def sleep(s):
            if not until and sim.hw.feeding:
                until.append(sim.clock() + shut_s)
            if until and sim.clock() < until[0]:
                sim.hw.wheels_steady.ok_ms = 0
            sim.sleep(s)

        return host.run_drill(link, shots, sleep, **kw), sim

    def test_release_waits_while_the_gate_rechecks_the_wheels(self):
        res, sim = self._gate_shut_after_feed(1.5)    # 1.5 s shut + the hold + a 0.9 s stroke: past a flat 2 s
        self.assertTrue(res.ok, res.aborted)
        self.assertEqual(len(sim.released), 2)

    def test_release_wait_on_a_shut_gate_is_capped(self):
        res, sim = self._gate_shut_after_feed(30.0, ready_timeout_s=3.0)
        self.assertFalse(res.ok)
        self.assertIn("shot 0 release", res.aborted)
        self.assertEqual(sim.released, [])

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


class ResetAtTheMachineTest(unittest.TestCase):
    """2026-11-18 (hardware/electronics.md "Reset at the machine"): after the e-stop or the fob, releasing it and a
    CLEAR_ESTOP from the Pi are not enough to power the motors; RESET pressed at the feeder is."""

    def _estop_and_release(self, sim, what):
        res, _ = run(sim, drill()[:1])
        self.assertTrue(res.ok, res.aborted)
        setattr(sim, what, True)
        sim.run_ms(200)
        setattr(sim, what, False)
        sim.write(P.encode(P.CLEAR_ESTOP))
        sim.run_ms(1000)

    def test_release_and_clear_leave_the_bus_off_and_a_drill_says_press_reset(self):
        for what in ("estop_button", "fob_cut"):
            sim = SimFeeder()
            self._estop_and_release(sim, what)
            self.assertFalse(sim.ctl.estop)                       # the board's own stop is cleared
            self.assertTrue(sim.hw.flags() & P.FLAG_BUS_OFF)      # but the contactor is open
            n = len(sim.released)
            res, _ = run(sim, drill())
            self.assertFalse(res.ok)
            self.assertIn("press and let go of RESET on the feeder", res.aborted)
            self.assertEqual(len(sim.released), n)
            sim.run_ms(20)
            self.assertTrue(sim.ctl.estop)                        # the aborted connect sent ESTOP, as any abort does
            sim.press_reset()                                     # RESET at the machine, then Clear stop as usual
            sim.write(P.encode(P.CLEAR_ESTOP))
            sim.run_ms(300)
            res, _ = run(sim, drill())
            self.assertTrue(res.ok, res.aborted)
            self.assertEqual(len(sim.released), n + 4)

    def test_reset_does_nothing_while_the_estop_is_down(self):
        sim = SimFeeder()
        sim.estop_button = True
        sim.press_reset()
        sim.estop_button = False
        sim.run_ms(500)
        self.assertTrue(sim.hw.flags() & P.FLAG_BUS_OFF)

    def test_old_wiring_comes_back_on_release(self):
        sim = SimFeeder(reset_latch=False)
        self._estop_and_release(sim, "estop_button")
        self.assertFalse(sim.hw.flags() & P.FLAG_BUS_OFF)
        res, _ = run(sim, drill())
        self.assertTrue(res.ok, res.aborted)


class ShuttleTimesTest(unittest.TestCase):
    def test_simulated_shuttle_moves_at_the_cad_stroke_times(self):
        import feeder_sim
        with open(os.path.join(HERE, "..", "manufacturing", "feeder", "manifest.json")) as f:
            derived = json.load(f)["derived"]
        out_s, back_s = derived["shuttle_stroke_s"]
        self.assertAlmostEqual(feeder_sim.SHUTTLE_OUT_S, out_s, delta=0.01)
        self.assertAlmostEqual(feeder_sim.SHUTTLE_BACK_S, back_s, delta=0.01)

    def test_a_shuttle_slower_than_the_gate_time_releases_nothing(self):
        sim = SimFeeder()
        sim.shuttle_out_s = 1.2              # slower than GATE_OUT_MS: the gate closes before the ball reaches the wheels
        res, _ = run(sim, drill()[:1])
        self.assertEqual(sim.released, [])   # it turns back short of the wheels with its ball still in the pocket
        self.assertTrue(sim.loaded)


class PeriodTachTest(unittest.TestCase):
    def test_reads_the_speed_the_old_counter_could_not(self):
        tach = controller.PeriodTach()
        for _ in range(6):
            tach.edge(20000)                 # 3000 rpm: one pulse every 20 ms
        self.assertEqual(tach.rpm(5000), 3000)
        # The old count-per-10-ms tachometer could only say 0 or 6000 at this speed.
        self.assertEqual({int(n * 60000 / 10) for n in (0, 1)}, {0, 6000})

    def test_window_averages_fewer_revolutions_on_a_slow_wheel(self):
        # README "A tach that averages a fixed time": the newest periods until they span the window, at most four
        tach = controller.PeriodTach(window_us=60000)
        for p in (20000, 20000, 20000, 20000):
            tach.edge(p)                     # 3000 rpm: 60 ms is three revolutions
        tach.edge(30000)                     # the wheel slows: the newest three span 70 ms
        self.assertEqual(tach.rpm(0), round(60e6 / (70000 / 3)))
        slow = controller.PeriodTach(window_us=60000)
        for p in (100000, 100000, 100000, 120000):
            slow.edge(p)                     # under 600 rpm one revolution spans the window: it alone is read
        self.assertEqual(slow.rpm(0), 500)
        fast = controller.PeriodTach(window_us=60000)
        for p in (5000, 5000, 5000, 5000, 6000):
            fast.edge(p)                     # 12,000 rpm: four revolutions are 21 ms, under the window; four is the most
        self.assertEqual(fast.rpm(0), round(60e6 / 5250))
        old = controller.PeriodTach(window_us=0)
        for p in (100000, 100000, 100000, 120000):
            old.edge(p)
        self.assertEqual(old.rpm(0), round(60e6 / 105000))

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

    def test_speed_esc_drops_the_proportional_term(self):
        # README "An ESC with its own speed loop": in cascade with an ESC that holds its own speed the board only trims
        loop = controller.WheelLoop(9000, speed_esc=True)
        self.assertAlmostEqual(loop.update(3000, 2900, 10) - 3000 / 9000,
                               6e-7 * controller.SPEED_ESC_KI_SHARE * 100 * 10)
        self.assertEqual(controller.WheelLoop(9000).kp, 2e-4)      # off by default (controller.ESC_SPEED_LOOP)

    def test_speed_esc_loop_holds_a_speed_loop_wheel_the_pi_rings(self):
        # tests/speed_esc_sweep.py's case: a 5 Hz, damping 0.4 ESC loop at 2,500 rpm whose map is 11,000 rpm at full
        # throttle against the 9,000 the board is told
        import loop_residual_sweep as sweep
        def swing(speed_esc):
            ws = []
            sweep.wheel(2500, 0.0, 0.4, free_rpm=11000.0, ball_ms=10 ** 9, total_ms=6000, speed_loop=(5, 0.4, 22500.0),
                        loop=controller.WheelLoop(9000, speed_esc=speed_esc), settled=False, speeds=ws)
            last = ws[-1000:]
            return (max(last) - min(last)) / 2500, sum(last) / len(last) / 2500 - 1
        rings, _ = swing(False)
        held, err = swing(True)
        self.assertGreater(rings, 0.05)
        self.assertLess(held, 0.002)
        self.assertLess(abs(err), 0.002)

    def test_slow_targets_scale_the_gains(self):
        # README "Slow wheels need slower gains": under LOOP_LOW_RPM both gains shrink with the target
        fast, slow = controller.WheelLoop(9000), controller.WheelLoop(9000)
        g = 750 / controller.LOOP_LOW_RPM
        self.assertAlmostEqual(fast.update(3000, 2900, 10) - 3000 / 9000, 2e-4 * 100 + 6e-7 * 100 * 10)
        self.assertAlmostEqual(slow.update(750, 650, 10) - 750 / 9000, g * (2e-4 * 100 + 6e-7 * 100 * 10))
        off = controller.WheelLoop(9000, low_rpm=0)
        self.assertAlmostEqual(off.update(750, 650, 10) - 750 / 9000, 2e-4 * 100 + 6e-7 * 100 * 10)

    def test_ball_hold_keeps_the_drop_out_of_the_integrator(self):
        # README "A ball charged the integrator": from the stroke until the wheel is back on target, the integrator
        # only sees +-ball_band of the target; then it integrates as before
        loop = controller.WheelLoop(9000, ball_band=0.01)
        loop.update(3000, 2990, 10)
        i0 = loop.i
        loop.ball()
        loop.update(3000, 3000, 10)                 # stroke under way, no drop yet
        for _ in range(50):
            loop.update(3000, 2000, 10)             # 33% low: counts as 1%
        self.assertAlmostEqual(loop.i - i0, 50 * 6e-7 * 30 * 10)
        self.assertEqual(loop.recover, 2)
        loop.update(3000, 3001, 10)                 # back on target: the hold ends
        self.assertEqual(loop.recover, 0)
        i1 = loop.i
        loop.update(3000, 2000, 10)
        self.assertAlmostEqual(loop.i - i1, 6e-7 * 1000 * 10)

    def test_ball_hold_times_out_and_can_be_off(self):
        loop = controller.WheelLoop(9000, ball_band=0.0, ball_ms=3000)
        loop.ball()
        for _ in range(299):
            loop.update(3000, 3000, 10)            # an empty pocket: no drop comes
        self.assertEqual(loop.recover, 1)
        loop.update(3000, 3000, 10)
        self.assertEqual(loop.recover, 0)
        off = controller.WheelLoop(9000, ball_band=None)
        off.ball()
        self.assertEqual(off.recover, 0)
        moved = controller.WheelLoop(9000, ball_band=0.0)
        moved.ball()
        moved.update(3000, 2000, 10)
        self.assertEqual(moved.recover, 2)
        moved.update(4000, 2100, 10)               # the Pi sent the next shot's speeds: the hold ends
        self.assertEqual(moved.recover, 0)

    def test_ball_gain_softens_only_a_wheel_faster_than_told(self):
        # firmware/esp32/README.md "The ball hold on a wheel faster than told": the stroke latches (ff + i) / ff and
        # scales the gains by it, capped at 1 ("down"), until the hold ends
        fast = controller.WheelLoop(9000, ball_gain="down", low_rpm=0)
        fast.update(3000, 3000, 10)
        fast.i = -0.2 * 3000 / 9000                 # the integrator learned a wheel 1.25x faster than told
        fast.ball()
        self.assertAlmostEqual(fast.gain, 0.8)
        cmd = fast.update(3000, 2000, 10)
        self.assertAlmostEqual(cmd, 3000 / 9000 + 0.8 * fast.kp * 1000 + fast.i, places=9)
        fast.update(3000, 3000, 10)                 # back at target: the hold ends, so do the scaled gains
        self.assertEqual((fast.recover, fast.gain), (0, 1.0))
        slow = controller.WheelLoop(9000, ball_gain="down")
        slow.update(3000, 3000, 10)
        slow.i = 0.2 * 3000 / 9000                  # slower than told: "down" leaves its gains alone
        slow.ball()
        self.assertEqual(slow.gain, 1.0)
        both = controller.WheelLoop(9000, ball_gain=True)
        both.update(3000, 3000, 10)
        both.i = 0.2 * 3000 / 9000
        both.ball()
        self.assertAlmostEqual(both.gain, 1.2)
        off = controller.WheelLoop(9000, ball_gain=False)
        off.update(3000, 3000, 10)
        off.i = -0.1
        off.ball()
        self.assertEqual(off.gain, 1.0)

    def test_braking_does_not_wind_the_integrator(self):
        # README "A ball charged the integrator", braking: while the ramp lowers the target the integrator holds, and
        # it never leaves +-LOOP_I_FF_MAX of the feedforward
        loop = controller.WheelLoop(9000, ramp_hold=True, i_ff_max=0.35)
        loop.update(3000, 2990, 10)
        i0 = loop.i
        for _ in range(100):
            loop.update(2000, 2400, 10, True)        # ramping down: the wheel lags the falling target
        self.assertEqual(loop.i, i0)
        for _ in range(2000):
            loop.update(526, 600, 10)                # arrived, the wheel still a little fast
        self.assertAlmostEqual(loop.i, -0.35 * 526 / 9000)
        free = controller.WheelLoop(9000, ramp_hold=False, i_ff_max=None)
        for _ in range(100):
            free.update(2000, 2400, 10, True)
        self.assertLess(free.i, -0.01)

    def test_gate_needs_the_speed_held(self):
        gate = controller.SteadyGate()
        self.assertFalse(gate.update((3000, 2500), (3050, 2510), 100))
        self.assertTrue(gate.update((3000, 2500), (3050, 2510), 60))
        self.assertFalse(gate.update((3000, 2500), (3100, 2510), 10))    # 3.3% off: start over

    def test_gate_holds_revolutions_of_a_slow_wheel(self):
        # README "Slow wheels need slower gains": at 500 rpm GATE_HOLD_REVS revolutions outlast the 150 ms hold
        gate = controller.SteadyGate()
        need = controller.GATE_HOLD_REVS * 60000 // 500
        self.assertFalse(gate.update((3000, 500), (3000, 500), need - 10))
        self.assertTrue(gate.update((3000, 500), (3000, 500), 10))
        fast = controller.SteadyGate()
        self.assertTrue(fast.update((3000, 2500), (3000, 2500), 150))     # 6 revolutions at 2,500 rpm are 144 ms
        self.assertFalse(gate.update((0, 2000), (0, 2000), 500))          # a stopped wheel is never ready

    def test_loop_settles_over_the_plant_grid(self):
        import wheel_loop_sweep as sweep
        for max_rpm, tau in ((7000, 0.8), (11000, 0.2), (9000, 0.4)):
            first, err, _ = sweep.trial(max_rpm, tau, (5531, 1958))
            self.assertIsNotNone(first)
            # from rest the spin-up ramp (2026-11-14) sets the pace: the CAD's ramp time to the faster wheel, plus the
            # loop's settling and the gate's hold (3.0 s flat before the ramp; the BMS allows no faster start)
            self.assertLess(first, _feeder().spinup_s(5531) + 1.0)
            self.assertLess(err, 0.035)


def _feeder():
    import sys
    sys.path.insert(0, os.path.join(HERE, "..", "cad"))
    from otr_cad.params import Feeder  # pure dataclass, no CAD kernel needed
    return Feeder()


class SpinupRampTest(unittest.TestCase):
    """The launcher spin-up ramp (2026-11-14): capped shaft power, immediate stop, and the CAD's numbers."""

    def test_constant_power_above_the_low_speed_cap(self):
        inertia, power = 0.00155, 100.0
        ramp = controller.SpinupRamp(power, inertia, 1500.0)
        k = power / inertia * (60 / (2 * 3.141592653589793)) ** 2
        rpm_c = k / 1500.0
        t, r = 0.0, 0.0
        while r < 5000:
            r2 = ramp.update(5000, 0, 10)
            t += 0.01
            # the shaft power I w a of each step's target never passes the cap (by more than one step's rounding)
            a = (r2 - r) / 0.01 * 2 * 3.141592653589793 / 60
            self.assertLessEqual(inertia * r2 * 2 * 3.141592653589793 / 60 * a, power * 1.01 + 1e-9)
            r = r2
        self.assertEqual(r, 5000)
        self.assertAlmostEqual(t, _feeder().spinup_s(5000), delta=0.02)
        self.assertGreater(rpm_c, 0)

    def test_low_speed_cap_and_targets_reached_exactly(self):
        ramp = controller.SpinupRamp(100.0, 0.00155, 1500.0)
        self.assertAlmostEqual(ramp.update(3000, 0, 100), 150.0)       # 1500 rpm/s at low speed
        for _ in range(1000):
            ramp.update(1000, 0, 10)
        self.assertEqual(ramp.rpm, 1000)                               # never overshoots a target

    def test_lowering_is_ramped_and_stopping_is_not(self):
        ramp = controller.SpinupRamp(100.0, 0.00155, 1500.0)
        ramp.rpm = 6000.0
        self.assertGreater(ramp.update(2000, 6000, 10), 5900)          # down at the same capped power
        self.assertEqual(ramp.update(0, 6000, 10), 0)                  # a stop goes straight through
        self.assertEqual(ramp.rpm, 0.0)

    def test_restart_starts_from_the_coasting_speed(self):
        ramp = controller.SpinupRamp(100.0, 0.00155, 1500.0)
        r = ramp.update(5000, 4200, 10)                                # wheel still at 4200 after a stop
        self.assertGreater(r, 4200)
        self.assertLess(r, 4300)
        ramp = controller.SpinupRamp(100.0, 0.00155, 1500.0)
        self.assertLessEqual(ramp.update(3000, 4200, 10), 3000)        # coasting faster than the new target

    def test_firmware_config_matches_the_cad(self):
        import config
        p = _feeder()
        self.assertEqual(config.WHEEL_SPINUP_W, p.wheel_spinup_w)
        self.assertEqual(config.WHEEL_RAMP_MAX_RPM_S, p.wheel_ramp_max_rpm_s)
        self.assertAlmostEqual(config.WHEEL_INERTIA_KGM2, p.launch_wheel_kgm2, places=6)
        self.assertEqual(p.check_power(), [])
        self.assertLessEqual(p.wheel_spinup_w, p.power_distribution()["spinup_w_max"])
        self.assertEqual(config.LOW_BATTERY_MV, p.battery_v_min * 1000)

    def test_the_board_ramps_and_stops_at_once(self):
        sim = SimFeeder()
        sim.write(P.encode(P.HEARTBEAT) + P.encode(P.SET_WHEELS, 5000, 2000))
        sim.run_ms(500)
        self.assertLess(sim.hw.wheel_ramps[0].rpm, 1000)                # half a second in: still low on the ramp
        sim.estop_button = True
        sim.run_ms(20)
        self.assertEqual(sim.hw.esc_cmd, [0.0, 0.0])
        self.assertEqual(sim.hw.wheel_ramps[0].rpm, 0.0)

    def test_coasting_when_braking_is_off(self):
        ramp = controller.SpinupRamp(100.0, 0.00155, 1500.0)
        ramp.rpm = 6000.0
        self.assertEqual(ramp.update(3000, 5900, 10, brake=False), 5900)   # follows the wheel, not the power cap
        self.assertTrue(ramp.coasting)
        self.assertEqual(ramp.update(3000, 4000, 10, brake=False), 4000)
        self.assertEqual(ramp.update(3000, 2950, 10, brake=False), 3000)   # arrived: the loop takes over at the target
        self.assertFalse(ramp.coasting)
        self.assertGreater(ramp.update(5000, 3000, 10, brake=False), 3000)  # raising is ramped as before
        self.assertFalse(ramp.coasting)

    def _slow_down(self, pack_mv):
        sim = SimFeeder()
        sim.pack_mv = pack_mv
        sim.write(P.encode(P.HEARTBEAT) + P.encode(P.SET_WHEELS, 5000, 2000))
        for _ in range(120):
            sim.write(P.encode(P.HEARTBEAT))
            sim.run_ms(100)
        self.assertTrue(sim.hw.wheels_steady.steady)
        sim.write(P.encode(P.HEARTBEAT) + P.encode(P.SET_WHEELS, 3000, 2000))
        sim.run_ms(50)
        return sim

    def test_the_board_coasts_on_a_nearly_full_pack(self):
        import config
        braking = self._slow_down(config.REGEN_BRAKE_MAX_MV - 1000)
        self.assertGreater(braking.hw.esc_cmd[0], 0.0)                  # ramped down under power: the ESC brakes
        self.assertFalse(braking.hw.wheel_ramps[0].coasting)
        full = self._slow_down(config.REGEN_BRAKE_MAX_MV + 600)
        self.assertEqual(full.hw.esc_cmd[0], 0.0)                       # zero throttle: nothing to brake on
        self.assertTrue(full.hw.wheel_ramps[0].coasting)
        self.assertGreater(full.hw.esc_cmd[1], 0.0)                     # the bottom wheel's target did not change
        for _ in range(60):
            full.write(P.encode(P.HEARTBEAT))
            full.run_ms(100)
        self.assertFalse(full.hw.wheel_ramps[0].coasting)               # arrived, and held by the loop again
        self.assertAlmostEqual(full.wheel[0], 3000, delta=150)

    def _flips_on_slow_down(self, pack_mv, hyst_mv=None):
        """Brake/coast changes over a 20% slow-down from 5000 rpm with the reading lifted 260 mV while braking."""
        sim = SimFeeder()
        if hyst_mv is not None:
            sim.hw.brake_guard = controller.BrakeGuard(sim.cfg.REGEN_BRAKE_MAX_MV, hyst_mv)
        sim.write(P.encode(P.HEARTBEAT) + P.encode(P.SET_WHEELS, 5000, 2000))
        for _ in range(120):
            sim.write(P.encode(P.HEARTBEAT))
            sim.run_ms(100)
        sim.pack_mv, sim.brake_rise_mv = pack_mv, 260
        guard, seen = sim.hw.brake_guard, []
        update = guard.update
        guard.update = lambda mv: seen.append(update(mv)) or seen[-1]
        sim.write(P.encode(P.HEARTBEAT) + P.encode(P.SET_WHEELS, 4000, 2000))
        for _ in range(15):
            sim.write(P.encode(P.HEARTBEAT))
            sim.run_ms(100)
        return sum(1 for a, b in zip(seen, seen[1:]) if a != b), sim

    def test_braking_does_not_flip_the_guard(self):
        import config
        near = config.REGEN_BRAKE_MAX_MV - 100          # resting 100 mV under the threshold, inside the 260 mV rise
        old, _ = self._flips_on_slow_down(near, hyst_mv=0)   # the first firmware's single threshold
        self.assertGreater(old, 10)                                       # 21 on this plant
        new, sim = self._flips_on_slow_down(near)
        self.assertLessEqual(new, 1)
        self.assertAlmostEqual(sim.wheel[0], 4000, delta=200)            # it coasted the rest of the way and arrived
        low, sim = self._flips_on_slow_down(config.REGEN_BRAKE_MAX_MV - 1000)
        self.assertEqual(low, 0)                                          # well under: brakes throughout
        self.assertTrue(sim.hw.brake_guard.ok)

    def test_brake_guard_band(self):
        g = controller.BrakeGuard(27600, 700)
        self.assertTrue(g.update(27600))
        self.assertFalse(g.update(27601))
        self.assertFalse(g.update(27000))                                 # inside the band: still coasting
        self.assertTrue(g.update(26899))

    def test_regen_config_matches_the_cad(self):
        import config
        p = _feeder()
        self.assertEqual(config.REGEN_BRAKE_MAX_MV, p.regen_brake_max_v * 1000)
        self.assertEqual(config.REGEN_BRAKE_HYST_MV, round(p.regen_brake_hyst_v * 1000))
        self.assertTrue(config.WHEEL_BRAKE)
        self.assertEqual(p.check_regen(), [])

    def test_simulated_peak_stays_near_the_cap(self):
        import spinup_ramp_sweep as sweep
        p = _feeder()
        for max_rpm, tau in sweep.PLANTS:
            first, peak = sweep.trial(max_rpm, tau, (6500, 1500))
            self.assertIsNotNone(first)
            self.assertLess(peak, 1.15 * p.wheel_spinup_w, (max_rpm, tau))


class PotPickupTest(unittest.TestCase):
    """The elevation pot's pickup from the actuator's PWM (2026-11-14, cad/README.md "The pot's pickup from the motor
    pair"): the real firmware against the CAD's pickup model, through tests/pot_pickup_sweep.py."""

    def test_with_the_capacitor_every_read_timing_settles_and_a_jam_faults(self):
        import pot_pickup_sweep as sweep
        for timing in sweep.TIMINGS:
            t, err, fault = sweep.aim(1000.0, timing, "trimmed")
            self.assertIsNotNone(t, timing)
            self.assertFalse(fault)
            self.assertLess(err, 0.3)             # the 0.5 mm deadband is about 0.25 deg
            self.assertIsNotNone(sweep.jam(1000.0, timing, "trimmed"), timing)

    def test_without_it_the_firmware_works_or_faults_never_runs_blind(self):
        import pot_pickup_sweep as sweep
        t, _, fault = sweep.aim(0.0, "random", "one read")
        self.assertTrue(fault)                    # the old firmware: a spike reads as a broken wire
        self.assertIsNone(t)
        t, err, fault = sweep.aim(0.0, "random", "trimmed")
        self.assertIsNotNone(t)
        self.assertLess(err, 0.3)
        for timing in ("after-rise", "after-fall"):   # every reading on an edge: unusable, so it must fault
            t, _, fault = sweep.aim(0.0, timing, "trimmed")
            self.assertTrue(fault, timing)
            self.assertIsNotNone(sweep.jam(0.0, timing, "trimmed"))

    def test_firmware_reads_several_and_trims(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location("fw_config", os.path.join(HERE, "..", "firmware", "esp32", "config.py"))
        cfg = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cfg)
        self.assertGreaterEqual(cfg.ELEV_POT_READS, 5)
        p = _feeder()
        self.assertEqual(cfg.ELEV_SPEED_RET_MM_S, p.elev_fw_speed_mm_s)
        ax = SimFeeder().hw.elev
        self.assertEqual((ax.deadband, ax.stall_mm), (p.elev_deadband_mm, p.elev_stall_mm))
        with open(os.path.join(HERE, "..", "firmware", "esp32", "main.py")) as f:
            src = f.read()
        self.assertIn(f"freq={p.elev_pwm_hz:.0f}", src)
        self.assertIn("controller.trimmed_mean(", src)


class TelemetryTest(unittest.TestCase):
    def test_balls_fed_round_trip(self):
        (cmd, vals), = P.Decoder().feed(P.encode(P.TELEMETRY, P.FLAG_WHEELS_SETTLING, 0, 3000, 2000, 25600, 255))
        self.assertEqual(vals[-1], 255)
        self.assertEqual(P.FLAG_WHEELS_SETTLING & (P.FLAG_AIM_SETTLING | P.FLAG_ELEV_FAULT), 0)


if __name__ == "__main__":
    unittest.main()


class LiftJamTest(unittest.TestCase):
    """The ball lift's jam cutoff (2026-11-15, cad/README.md "Lift jam cutoff"): the real board layer reading the
    comparator on GPIO 0, and the plant model in tests/lift_jam_sweep.py."""

    def _beat(self, sim, ms):
        for _ in range(ms // 100):
            sim.write(P.encode(P.HEARTBEAT))
            sim.run_ms(100)

    def test_board_cuts_retries_reports_and_clears_on_the_estop(self):
        sim = SimFeeder()
        self._beat(sim, 400)
        hw = sim.hw
        hw.lift.kick(sim.us // 1000)
        sim.lift_over = True                         # stalled from the start: a ball wedged in the boot
        self._beat(sim, 300)
        self.assertEqual(hw.lift_pwm.duty, int(hw.lift.run_duty() * 65535))    # blanked
        self._beat(sim, 200)
        self.assertEqual(hw.lift_pwm.duty, 0)        # cut
        self.assertFalse(hw.flags() & P.FLAG_LIFT_JAM)
        self._beat(sim, 2500)                        # rest, retry, second stall
        self.assertEqual(hw.lift_pwm.duty, 0)
        self.assertTrue(hw.flags() & P.FLAG_LIFT_JAM)
        sim.lift_over = False
        sim.write(P.encode(P.ESTOP))                 # the Pi's ESTOP frame and its clear do not reset it
        sim.run_ms(10)
        sim.write(P.encode(P.CLEAR_ESTOP))
        self._beat(sim, 200)
        self.assertTrue(hw.flags() & P.FLAG_LIFT_JAM)
        sim.estop_button = True                      # a person presses the e-stop: the contactor drops the bus
        self._beat(sim, 200)
        sim.estop_button = False
        sim.press_reset()
        sim.write(P.encode(P.CLEAR_ESTOP))
        self._beat(sim, 400)
        self.assertFalse(hw.flags() & P.FLAG_LIFT_JAM)
        hw.lift.kick(sim.us // 1000)
        self._beat(sim, 100)
        self.assertEqual(hw.lift_pwm.duty, int(hw.lift.run_duty() * 65535))    # runs again

    def test_drill_carries_on_and_warns_once(self):
        sim = SimFeeder()
        sim.hw.lift.jammed = True
        logs = []
        res, _ = run(sim, drill(), log=logs.append)
        self.assertTrue(res.ok, res.aborted)
        self.assertEqual(len(res.shots), 4)
        self.assertEqual(len(res.warnings), 1)
        self.assertEqual(sum("lift jammed" in line for line in logs), 1)

    def _stall(self, sim):
        """A ball wedged in the boot: the lift cuts, rests, retries and cuts again (two slides of the hub)."""
        sim.hw.lift.kick(sim.us // 1000)
        sim.lift_over = True
        self._beat(sim, 3000)
        sim.lift_over = False

    def test_jams_counted_in_flash_survive_a_power_cycle(self):
        # 2026-11-16, cad/README.md "Slip hub wear": every cut slides the hub, so every cut is counted, and the count
        # outlives the session: a board power-cycled between drills is the same hub.
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "lift_jams.json")
            sim = SimFeeder(jam_log=path)
            self._beat(sim, 400)
            self._stall(sim)
            self.assertTrue(sim.hw.lift.jammed)
            self.assertEqual((sim.hw.lift_jams.jams, sim.hw.lift_jams.since_set), (2, 2))
            again = SimFeeder(jam_log=path)                   # power off and on
            self.assertEqual((again.hw.lift_jams.jams, again.hw.lift_jams.since_set), (2, 2))
            self.assertFalse(again.hw.flags() & P.FLAG_LIFT_HUB_DUE)
            self.assertFalse(again.hw.lift.jammed)            # the jam itself is not remembered: the e-stop cleared it

    def test_hub_due_at_the_cads_count_then_reset_over_the_link(self):
        p = _feeder()
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "lift_jams.json")
            with open(path, "w") as f:
                json.dump({"jams": 1000, "since_set": p.lift_slip_jams - 1}, f)
            sim = SimFeeder(jam_log=path)
            self._beat(sim, 400)
            self.assertFalse(sim.hw.flags() & P.FLAG_LIFT_HUB_DUE)
            self._stall(sim)
            self.assertTrue(sim.hw.flags() & P.FLAG_LIFT_HUB_DUE)
            self.assertEqual(sim.hw.lift_jams.since_set, p.lift_slip_jams + 1)
            # The drill still runs: the warning is reported once, the lift is not stopped for it.
            sim.estop_button = True
            self._beat(sim, 200)
            sim.estop_button = False
            sim.press_reset()
            sim.write(P.encode(P.CLEAR_ESTOP))
            self._beat(sim, 600)
            logs = []
            res, link = run(sim, drill(), log=logs.append)
            self.assertTrue(res.ok, res.aborted)
            self.assertEqual(sum("slip hub due" in line for line in logs), 1)
            # A wrong key is dropped; the right one, after the bench set, clears it and keeps the lifetime count.
            sim.write(P.encode(P.RESET_LIFT_HUB, 0))
            self._beat(sim, 200)
            self.assertTrue(sim.hw.flags() & P.FLAG_LIFT_HUB_DUE)
            self.assertIsNone(host.reset_lift_hub(link, sim.sleep))
            self.assertFalse(sim.hw.flags() & P.FLAG_LIFT_HUB_DUE)
            again = SimFeeder(jam_log=path)
            self.assertEqual((again.hw.lift_jams.jams, again.hw.lift_jams.since_set), (1002, 0))

    def test_lost_count_flags_the_hub(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "lift_jams.json")
            with open(path, "w") as f:
                f.write('{"jams": 4, "since_se')                # a write cut short by a power loss on an old firmware
            sim = SimFeeder(jam_log=path)
            self.assertTrue(sim.hw.flags() & P.FLAG_LIFT_HUB_DUE)
            self._beat(sim, 400)
            self.assertIsNone(host.reset_lift_hub(host.FeederLink(sim, sim.clock), sim.sleep))
            self.assertEqual(SimFeeder(jam_log=path).hw.lift_jams.since_set, 0)

    def test_reset_refused_while_the_estop_is_down(self):
        sim = SimFeeder()
        sim.hw.lift_jams.unreadable = True
        sim.estop_button = True
        why = host.reset_lift_hub(host.FeederLink(sim, sim.clock), sim.sleep)
        self.assertIn("e-stop", why)
        self.assertTrue(sim.hw.lift_jams.due)

    def test_starts_never_trip_and_jams_are_cut(self):
        import lift_jam_sweep as sweep
        for name, v, rise in sweep.CORNERS:
            tripped, over_ms, speed = sweep.start(v, rise, 2.0, "lo")    # the slowest start against the lowest trip
            self.assertFalse(tripped, name)
            self.assertLess(over_ms, _feeder().lift_jam_blank_ms / 2, name)
            for where in sweep.WHERE:
                r = sweep.jam(v, rise, 1.0, "hi", where, slip="lo")      # the highest trip, the hub sliding lowest
                self.assertIsNotNone(r["cut_ms"], (name, where))
                self.assertLess(r["cut_ms"], 150, (name, where))
                self.assertIsNotNone(r["jammed_ms"], (name, where))
                self.assertLess(r["jammed_ms"], 3000, (name, where))
                off = sweep.jam(v, rise, 1.0, "hi", where, cutoff=False)
                self.assertLess(r["winding_j"], off["winding_j"] / 10, (name, where))
                self.assertLess(r["peak_n"], _feeder().lift_jam_cutoff()["weld_allow_n"], (name, where))

    def test_worn_slip_hub_still_cuts_a_jam(self):
        # 2026-11-16, cad/README.md "Slip hub wear": the facings' lost thickness comes off the disc stack's deflection.
        # The single A disc it replaced, 40 um worn at its lowest setting and friction, let a jam slide with no cut and
        # no flag at the 24 V hot corner; four B discs in series at 4x that loss still cut it.
        import lift_jam_sweep as sweep
        Feeder = type(_feeder())
        old = Feeder(lift_slip_spring_t=0.7, lift_slip_spring_h0=0.3, lift_slip_spring_count=1).lift_slip_wear()
        new = Feeder().lift_slip_wear()
        old_40 = dict((l, nm) for l, _, nm in old["sweep"])[40.0]
        new_160 = dict((l, nm) for l, _, nm in new["sweep"])[160.0]
        _, v, rise = sweep.CORNERS[1]
        self.assertIsNone(sweep.jam(v, rise, 1.0, "hi", "boot", slip=old_40)["cut_ms"])
        for where in sweep.WHERE:
            r = sweep.jam(v, rise, 1.0, "hi", where, slip=new_160)
            self.assertIsNotNone(r["cut_ms"], where)
            self.assertIsNotNone(r["jammed_ms"], where)

    def test_slip_hub_keeps_a_jam_under_the_cap_plate(self):
        # 2026-11-15, cad/README.md "Lift slip coupling": rigid, the rotor's inertia put up to 214 N on a flight (the
        # plate allows 156 N) before any cut; with the hub at the top of its torque and the cutoff at its lowest trip the
        # peak stays under the plate's allowance at every corner, the twice-assumed rotor included, and a start with
        # the hub at its lowest never slips it.
        import lift_jam_sweep as sweep
        allow = _feeder().lift_jam_cutoff()["plate_allow_n"]
        for name, v, rise in sweep.CORNERS:
            sweep.start(v, rise, 0.5, "lo", slip="lo")              # the lightest rotor puts the most torque on the hub
            self.assertEqual(sweep.start.plant.slid_ms, 0.0, name)
            for where in sweep.WHERE:
                for jf in sweep.INERTIAS:
                    r = sweep.jam(v, rise, jf, "lo", where, slip="hi")
                    self.assertLess(r["peak_n"], allow, (name, where, jf))
                    self.assertGreater(r["slid_ms"], 0.0, (name, where, jf))
                    self.assertIsNotNone(r["jammed_ms"], (name, where, jf))
            rigid = sweep.jam(v, rise, 2.0, "lo", "boot", slip=None)
            self.assertGreater(rigid["peak_n"], r["peak_n"], name)

    def test_jaw_coupling_soft_start_keeps_starts_off_the_hub(self):
        # 2026-11-15, cad/README.md "Lift coupling dynamics": with the jaw coupling as a spring with free play between
        # the rotor and the shaft, a switched start rings the drive's 49 Hz mode, and with a hard, worn spider an empty
        # belt's start crosses the play at speed and slips the hub at its lowest. The firmware's soft start keeps every
        # start, loaded or empty, at the stiffest spider and 3 degrees of play, off the hub with the margin the hub's
        # start rule asks for loaded, and never trips the cutoff.
        import lift_jam_sweep as sweep
        p = _feeder()
        lo = p.lift_slip_design()["stick_lo_nm"]
        hard_worn = (max(p.lift_coupler_k_sweep), 3.0)
        switched = sweep._sim
        try:
            sweep._sim = sweep._ramped(0)
            sweep.start(29.2, 0.0, 0.5, "lo", loaded=False, slip="lo", coupler=hard_worn)
            self.assertGreater(sweep.start.plant.slid_ms, 0.0)             # what the soft start is for
            self.assertGreater(sweep.start.plant.reversals, 0)
        finally:
            sweep._sim = switched
        for name, v, rise in sweep.CORNERS:
            for jf in sweep.INERTIAS:
                for loaded in (True, False):
                    tripped, _, _ = sweep.start(v, rise, jf, "lo", loaded=loaded, slip="lo", coupler=hard_worn)
                    pl = sweep.start.plant
                    self.assertFalse(tripped, (name, jf, loaded))
                    self.assertEqual(pl.slid_ms, 0.0, (name, jf, loaded))
                    if loaded:
                        self.assertLess(pl.coupler_nm * p.lift_slip_start_factor, lo, (name, jf))

    def test_jaw_coupling_jams_stay_under_the_plate_and_the_coupling_rating(self):
        # the slip hub still bounds a jam with the coupling's spring and play in the drive: the flight's peak stays
        # under the cap plate, the coupling never passes more than its rating, and the cutoff still trips
        import lift_jam_sweep as sweep
        p = _feeder()
        allow = p.lift_jam_cutoff()["plate_allow_n"]
        for k in (min(p.lift_coupler_k_sweep), max(p.lift_coupler_k_sweep)):
            for where in sweep.WHERE:
                r = sweep.jam(29.2, 0.0, 1.0, "lo", where, slip="hi", coupler=(k, 3.0))
                self.assertLess(r["peak_n"], allow, (k, where))
                self.assertLess(r["coupler_nm"], p.lift_coupler_nm, (k, where))
                self.assertIsNotNone(r["jammed_ms"], (k, where))
                r = sweep.jam(24.0, 80.0, 1.0, "hi", where, slip="lo", coupler=(k, 3.0))
                self.assertIsNotNone(r["cut_ms"], (k, where))
                self.assertLess(r["cut_ms"], 200, (k, where))

    def test_belt_stretch_modes(self):
        # 2026-11-15, cad/README.md "Lift belt stretch": the belt mass on its strands rings near the coupling's 49 Hz
        # mode, so the two split; an ever stiffer belt gives back the three-inertia plant's stuck mode, and the lumped
        # belt keeps the belt side's whole inertia
        p = _feeder()
        cm = p.lift_coupler_model()
        bm = p.lift_belt_model()
        self.assertAlmostEqual(bm["j_mass"] + bm["j_pulley"], cm["j_belt"])
        self.assertLess(bm["f_stuck_hz"], cm["f_stuck_hz"])
        self.assertGreater(bm["f_upper_hz"], max(cm["f_stuck_hz"], bm["f_belt_hz"]))
        stiff = p.lift_belt_model(1e4)
        self.assertAlmostEqual(stiff["f_stuck_hz"], cm["f_stuck_hz"], delta=0.1)
        self.assertAlmostEqual(bm["slack_at_n"], 2 * p.lift_tension_design()["t0_n"])

    def test_belt_stretch_jams_and_starts(self):
        # with the belt's stretch in the plant a hood jam slackens the down strand at the drive pulley, the flight's
        # peak still stays under the cap plate and the cutoff still trips; and the soft start's one slipping corner on
        # the rigid belt (80 N m/rad, 5 deg, empty, lightest rotor, full pack) no longer slips
        import lift_jam_sweep as sweep
        p = _feeder()
        allow = p.lift_jam_cutoff()["plate_allow_n"]
        for b in (min(p.lift_belt_cspec_sweep), max(p.lift_belt_cspec_sweep)):
            r = sweep.jam(29.2, 0.0, 1.0, "lo", "hood", slip="hi", belt=b)
            self.assertLess(r["peak_n"], allow, b)
            self.assertGreater(r["slack_ms"], 0.0, b)
            self.assertIsNotNone(r["jammed_ms"], b)
            r = sweep.jam(24.0, 80.0, 1.0, "hi", "boot", slip="lo", belt=b)
            self.assertIsNotNone(r["cut_ms"], b)
            self.assertLess(r["cut_ms"], 200, b)
            self.assertEqual(r["slack_ms"], 0.0, b)        # at the boot the ball stops the pulley, not the belt's mass
        corner = dict(loaded=False, slip="lo", coupler=(max(p.lift_coupler_k_sweep), 5.0))
        sweep.start(29.2, 0.0, 0.5, "lo", **corner)
        # since 2026-11-15 ("Lift duty follows the battery": duty 0.82 on a full pack, hub set to 1.0 N m, 0.9 since the high-side sense) the rigid
        # belt's corner no longer slips either
        self.assertEqual(sweep.start.plant.slid_ms, 0.0)
        tripped, _, _ = sweep.start(29.2, 0.0, 0.5, "lo", belt=1.0, **corner)
        self.assertFalse(tripped)
        self.assertEqual(sweep.start.plant.slid_ms, 0.0)

    def test_belt_chain_rests_and_rings(self):
        # 2026-11-15 later, cad/README.md "Lift belt as a chain": at rest the chain holds still with the strands at the
        # drive pulley averaging T0 (T0 -/+ P / 2) and the loaded up strand's top over its bottom by the balls' and
        # belt's weight; with the pulley held, a half-sine pluck rings at the solver's first held mode
        import lift_jam_sweep as sweep
        p = _feeder()
        h = 1.25e-5
        for every in (1, 2):
            pl = sweep.Plant(p, 29.2, 0.0, chain={"cspec": 1.0, "every": every})
            k, u = pl.ck, pl.cu
            t_up = pl.t0 + k * (u[0] - pl.s)
            t_down = pl.t0 + k * (pl.s - u[-1])
            t0 = p.lift_tension_design()["t0_n"]
            self.assertAlmostEqual((t_up + t_down) / 2, t0, places=6)
            self.assertAlmostEqual(t_down - t_up, pl.t_load / pl.rp / every, delta=0.01)
            self.assertGreater(pl.t0 + k * (u[pl.top] - u[pl.top - 1]), t_up)
            for _ in range(2000):
                pl._chain_step(h, 0.0)
            self.assertLess(max(abs(v) for v in pl.cv), 1e-9)
            held = p.lift_belt_axial_modes(every, stuck=False, nodes_per_pitch=2)["modes_hz"][0]
            rest, nn = list(pl.cu), len(pl.cv)
            pl.cv = [0.05 * math.sin(math.pi * (i + 1) / (nn + 1)) for i in range(nn)]
            x = []
            for _ in range(int(0.2 / h)):
                pl._chain_step(h, 0.0)
                for i in range(nn):
                    pl.cu[i] += pl.cv[i] * h
                x.append(sum(m * (a - b) for m, a, b in zip(pl.cm, pl.cu, rest)))
            ups = [i for i in range(1, len(x)) if x[i - 1] < 0 <= x[i]]
            f = (len(ups) - 1) / ((ups[-1] - ups[0]) * h)
            self.assertAlmostEqual(f, held, delta=0.01 * held)

    def test_belt_chain_hood_jam(self):
        # the chained belt's hood jam: the flight stays under the cap plate, the cutoff trips and the lift gives up,
        # part of the up strand goes slack, and the net pull at the drive pulley stays within `lift_jam_belt_n`
        import lift_jam_sweep as sweep
        p = _feeder()
        r = sweep.jam(29.2, 0.0, 1.0, "lo", "hood", slip="hi", chain={"cspec": 1.0, "every": 1}, after_ms=3000)
        self.assertLess(r["peak_n"], p.lift_jam_cutoff()["plate_allow_n"])
        self.assertIsNotNone(r["cut_ms"])
        self.assertIsNotNone(r["jammed_ms"])
        self.assertGreater(r["slack_ms"], 0.0)
        self.assertLessEqual(r["belt_n"], p.lift_jam_belt_n)

    def test_coupling_model_parts_and_modes(self):
        p = _feeder()
        cm = p.lift_coupler_model()
        self.assertAlmostEqual(cm["j_shaft"], sum(cm["parts"].values()))
        self.assertLess(cm["j_shaft"], cm["j_belt"] / 50)          # the shaft side is light: it rings fast when sliding
        self.assertGreater(cm["f_sliding_hz"], 10 * cm["f_stuck_hz"])
        stiffer = type(p)(lift_coupler_k_nm_rad=4 * p.lift_coupler_k_nm_rad).lift_coupler_model()
        self.assertAlmostEqual(stiffer["f_stuck_hz"], 2 * cm["f_stuck_hz"], places=6)


class EmptyHopperTest(unittest.TestCase):
    """2026-11-16, firmware/esp32/README.md "Empty hopper": a feed stroke is judged by the launcher wheels' speed drop
    (controller.LaunchCheck), because the feeder's ESP32 has no pin left for a sensor; the runner stops on the first
    dry stroke and names it."""

    def _model(self):
        import config
        return (config.WHEEL_INERTIA_KGM2, config.BALL_KG, config.WHEEL_RADIUS_M, config.BALL_RADIUS_M,
                config.LAUNCH_SPEED_EFF, config.LAUNCH_SPIN_EFF)

    def test_config_matches_the_cad_and_the_launcher_model(self):
        import config
        from tennisbots import ballistics, launcher
        p = _feeder()
        lm = launcher.WheelLauncher()
        self.assertAlmostEqual(config.BALL_KG, p.ball_g / 1000)
        self.assertAlmostEqual(config.WHEEL_RADIUS_M, p.wheel_head_d / 2000)
        self.assertAlmostEqual(config.WHEEL_RADIUS_M, lm.wheel_radius)
        self.assertAlmostEqual(config.BALL_RADIUS_M, ballistics.DEFAULT_BALL.radius)
        self.assertEqual((config.LAUNCH_SPEED_EFF, config.LAUNCH_SPIN_EFF), (lm.speed_efficiency, lm.spin_efficiency))
        self.assertEqual((config.WHEEL_INERTIA_KGM2, config.BALL_KG), (launcher.WHEEL_INERTIA_KGM2, launcher.BALL_KG))
        # one ball across the project: the drop fit's mass is the flight model's (2026-11-16: 57.0 g against the
        # simulator's 57.7 g read every speed efficiency 0.9-1.9% high, firmware/esp32/README.md)
        self.assertAlmostEqual(config.BALL_KG, ballistics.DEFAULT_BALL.mass)
        # the verdict must land before the back stroke ends, so it never overlaps the next forward stroke
        self.assertLess(config.LAUNCH_CHECK_MS, config.GATE_BACK_MS)

    def test_flat_shot_drop_and_the_faster_wheels_floor(self):
        inertia, m, r_w = self._model()[:3]
        eff = self._model()[4]
        flat = m * eff * r_w ** 2 / (2 * inertia)
        self.assertAlmostEqual(flat, 0.088, delta=0.001)              # 8.8% with the CAD's numbers
        for rpm in (1000, 3000, 7000):
            top, bottom = controller.launch_dips(rpm, rpm, *self._model())
            self.assertAlmostEqual(top, flat, places=9)                 # the same fraction at any speed
            self.assertAlmostEqual(bottom, flat, places=9)
        for top_rpm, bottom_rpm in ((7000, 0), (6000, 1500), (1500, 6000), (4000, 3500)):
            d = controller.launch_dips(top_rpm, bottom_rpm, *self._model())
            fast = 0 if top_rpm >= bottom_rpm else 1
            self.assertGreaterEqual(d[fast], flat / 2 - 1e-12)          # whatever the spin
        self.assertEqual(controller.launch_dips(5000, 0, *self._model())[1], 0.0)

    def test_check_judges_freezes_on_a_new_target_and_cancels(self):
        chk = controller.LaunchCheck(*self._model())
        _, need = chk.threshold((4000, 4000))
        self.assertAlmostEqual(need, 0.25 * 0.088, delta=0.001)
        chk.start((4000, 4000), 0)
        for t in range(0, 1000, 10):                                     # control ticks, 10 ms apart
            self.assertIsNone(chk.update(t, (3990, 4005), (4000, 4000)))
        chk.stroke_done(900)
        self.assertIsNone(chk.update(1000, (3700, 3800), (4000, 4000)))  # a ball: 7.5% below the 4,000 target
        self.assertIs(chk.update(1150, (3950, 3960), (4000, 4000)), True)
        self.assertAlmostEqual(chk.last_dip, 1 - 3700 / 3990)            # judged from the speed the ball met
        self.assertAlmostEqual(chk.last_dip_target, 0.075)
        chk.start((4000, 4000), 2000)
        chk.stroke_done(2900)
        self.assertIsNone(chk.update(2950, (3990, 3995), (4000, 4000)))
        self.assertIsNone(chk.update(3000, (0, 0), (0, 0)))              # the Pi's stop: not taken as a ball
        self.assertIs(chk.update(3150, (0, 0), (0, 0)), False)
        chk.start((4000, 4000), 4000)
        chk.cancel()                                                     # an e-stop mid-stroke
        self.assertIsNone(chk.update(9999, (0, 0), (4000, 4000)))
        chk.start((0, 0), 5000)
        chk.stroke_done(5900)
        self.assertIsNone(chk.update(6200, (0, 0), (0, 0)))              # wheels at rest: no verdict

    def test_check_reads_the_drop_from_the_wheels_own_speed(self):
        """A stroke fed as the gate opens after a speed change starts with the wheel up to 3% off target (2026-11-16,
        firmware/esp32/README.md "The verdict from the pre-ball speed"): climbing from 2.9% below with no ball is no
        launch, though it reads 2.9% below target; a ball met 2.9% above target still counts."""
        chk = controller.LaunchCheck(*self._model())
        _, need = chk.threshold((4000, 4000))
        chk.start((4000, 4000), 0)
        for t in range(0, 1150, 10):                                     # 3,884 rpm climbing to 4,000, no ball
            rpm = 4000 - 116 * 0.995 ** t
            self.assertIsNone(chk.update(t, (rpm, rpm), (4000, 4000)))
            if t == 900:
                chk.stroke_done(900)
        self.assertIs(chk.update(1150, (4000, 4000), (4000, 4000)), False)
        self.assertGreater(chk.last_dip_target, need)                    # against the target: 2.9%, read as a ball
        chk.start((4000, 4000), 2000)
        for t in range(2000, 2760, 10):
            chk.update(t, (4116, 4116), (4000, 4000))
        went = None
        for t, rpm in ((2760, 3920), (2770, 3940), (2900, 4000), (3000, 4100), (3150, 4116)):
            if t == 2900:
                chk.stroke_done(2900)
            went = chk.update(t, (rpm, rpm), (4000, 4000)) if went is None else went
        self.assertIs(went, True)                                        # 4.8% from the speed it met: over `need`
        self.assertLess(chk.last_dip_target, need)                       # against the target only 2%: read as dry

    def test_drill_runs_while_balls_last(self):
        sim = SimFeeder(balls=3)                       # the pocket's ball and three behind it: exactly four
        res, _ = run(sim, drill())
        self.assertTrue(res.ok, res.aborted)
        self.assertEqual(len(sim.released), 4)
        self.assertEqual((sim.hw.launches, sim.hw.dry_strokes), (4, 0))
        self.assertFalse(sim.hw.flags() & P.FLAG_HOPPER_EMPTY)

    def test_dry_stroke_stops_the_drill_and_names_the_shot(self):
        sim = SimFeeder(balls=1)                       # two balls for a four-shot drill
        logs = []
        res, _ = run(sim, drill(), log=logs.append)
        self.assertFalse(res.ok)
        self.assertEqual(res.dry_shot, 2)
        self.assertIn("hopper empty", res.aborted)
        self.assertIn("(2 shots flew)", res.aborted)
        self.assertEqual(len(res.shots), 2)            # the dry stroke is not reported as a shot
        self.assertEqual(len(sim.released), 2)
        self.assertEqual(sim.hw.dry_strokes, 1)        # stopped at the first dry stroke, not a release timeout later
        sim.run_ms(50)
        self.assertFalse(sim.ctl.estop)                # not a fault: the e-stop is not latched
        self.assertEqual(sim.hw.target_rpm, (0, 0))
        # refill and go again: the stale flag does not stop the next run before it feeds, and a FEED clears it
        sim.balls = 10
        sim.loaded = True
        self.assertTrue(sim.hw.flags() & P.FLAG_HOPPER_EMPTY)
        res2, _ = run(sim, drill())
        self.assertTrue(res2.ok, res2.aborted)
        self.assertFalse(sim.hw.flags() & P.FLAG_HOPPER_EMPTY)

    def test_the_last_shot_dry_is_caught_too(self):
        sim = SimFeeder(balls=2)
        res, _ = run(sim, drill())
        self.assertEqual(res.dry_shot, 3)              # caught by the wait for the last shot's verdict

    def test_sweep_corners_separate(self):
        # tests/launch_check_sweep.py's worst corners (README "Empty hopper"): a wheel 1.5x heavier than config.py's,
        # a ball taking 60% of the modelled momentum, the fastest wheel lag; and the noisiest dry case
        import launch_check_sweep as sweep
        lo, _, _, _ = sweep.run_case(1.5, 0.6, 0.2)
        self.assertGreaterEqual(lo, 1.0)
        _, hi, _, _ = sweep.run_case(1.0, 0.6, 0.8)
        self.assertLess(hi, 0.5)


class ShotLogTest(unittest.TestCase):
    """2026-11-16, firmware/esp32/README.md "Shot log": every judged stroke's record (both wheels' speed before the ball
    and their drops) reaches the Pi as a LAUNCH frame, and launcher.fit_from_drops reads the launcher's efficiencies
    from a drill's worth of them, with no radar gun."""

    MODEL = (0.00155, 0.0577, 0.075, 0.0335)

    def _exact(self, shots, se, sp, tau, inertia=0.00155):
        from tennisbots import launcher
        out = []
        for top, bottom in shots:
            d = controller.launch_dips(top, bottom, inertia, 0.0577, 0.075, 0.0335, se, sp)
            out.append({"rpm_top": top, "rpm_bottom": bottom, "launched": True,
                        "drop_top": d[0] * launcher._tach_share(60 / top, tau) if top else 0.0,
                        "drop_bottom": d[1] * launcher._tach_share(60 / bottom, tau) if bottom else 0.0})
        return out

    def test_launch_frame_round_trips(self):
        frame = P.encode(P.LAUNCH, 7, 4000, 2500, 880, 1230, 1)
        self.assertEqual(P.Decoder().feed(frame), [(P.LAUNCH, (7, 4000, 2500, 880, 1230, 1))])

    def test_record_measures_from_the_wheels_own_speed_not_the_target(self):
        import config
        chk = controller.LaunchCheck(config.WHEEL_INERTIA_KGM2, config.BALL_KG, config.WHEEL_RADIUS_M,
                                     config.BALL_RADIUS_M, config.LAUNCH_SPEED_EFF, config.LAUNCH_SPIN_EFF)
        chk.start((4000, 4000), 0)
        t = 0
        for _ in range(50):                       # the wheels sit 2% over target (the gate allows 3%)
            t += 10
            chk.update(t, (4080, 4080), (4000, 4000))
        chk.stroke_done(t)
        for r in (3900, 3720, 3740, 3800, 3900):  # the ball: straddling revolution, then the low one
            t += 10
            chk.update(t, (r, r), (4000, 4000))
        while chk.update(t, (4000, 4000), (4000, 4000)) is None:
            t += 10
        seq, top, bottom, d_top, d_bottom, went = chk.record
        self.assertEqual((seq, top, bottom, went), (1, 4080, 4080, 1))
        self.assertAlmostEqual(d_top / 1e4, 1 - 3720 / 4080, places=4)     # 8.8%, not the 7.0% below target
        self.assertEqual(d_top, d_bottom)

    def test_fit_recovers_exact_drops(self):
        from tennisbots import launcher
        import launch_fit_sweep as sweep
        fit = launcher.fit_from_drops(self._exact(sweep.CALIBRATION, 0.78, 0.42, 0.3))
        self.assertAlmostEqual(fit.speed_efficiency, 0.78, delta=0.01)
        self.assertAlmostEqual(fit.spin_efficiency, 0.42, delta=0.01)
        self.assertAlmostEqual(fit.recovery_s, 0.3, delta=0.03)
        self.assertLess(fit.rms, 1e-3)
        flat = launcher.fit_from_drops(self._exact([(2000, 2000), (5000, 5000)], 0.8, 0.5, None))
        self.assertIsNone(flat.spin_efficiency)
        self.assertIn("flat shots only", flat.note)
        one = launcher.fit_from_drops(self._exact([(4000, 4000), (4200, 3800)], 0.8, 0.5, None))
        self.assertIsNone(one.recovery_s)
        self.assertIn("one speed", one.note)
        with self.assertRaises(ValueError):
            launcher.fit_from_drops([{"rpm_top": 3000, "rpm_bottom": 3000, "drop_top": 0.0, "drop_bottom": 0.0,
                                      "launched": False}])

    def test_calibration_drill_spins_fast_wheels(self):
        # firmware/esp32/README.md "Spin from fast wheels": spin read from slow wheels was up to 17% off
        from tennisbots import launcher
        with open(os.path.join(HERE, "..", "drill.calibration.json")) as f:
            shots = host.plan_drill(json.load(f))
        spin = [s for s in shots if s.rpm_top != s.rpm_bottom]
        self.assertGreaterEqual(len(spin), 6)
        self.assertGreaterEqual(min(min(s.rpm_top, s.rpm_bottom) for s in spin), 2400)
        wheels = [(s.rpm_top, s.rpm_bottom) for s in shots]
        fast = launcher.fit_from_drops(self._exact(wheels, 0.8, 0.45, None))
        self.assertNotIn("spin shot", fast.note)
        slow = launcher.fit_from_drops(self._exact(wheels + [(3500, 1500)], 0.8, 0.45, None))
        self.assertIn("1 spin shot with a wheel under 2000 rpm", slow.note)
        self.assertAlmostEqual(slow.spin_efficiency, 0.45, delta=0.005)    # exact drops: the note warns, not corrects

    def test_drill_records_reach_the_pi_and_fit_the_true_launcher(self):
        from tennisbots import launcher
        true = launcher.WheelLauncher(speed_efficiency=0.78, spin_efficiency=0.42)
        sim = SimFeeder(true_launcher=true)
        with open(os.path.join(HERE, "..", "drill.calibration.json")) as f:
            shots = host.plan_drill(json.load(f))
        res, _ = run(sim, shots)
        self.assertTrue(res.ok, res.aborted)
        self.assertEqual([r["shot"] for r in res.launches], list(range(12)))
        self.assertTrue(all(r["launched"] for r in res.launches))
        fit = launcher.fit_from_drops(res.launches)
        self.assertLess(abs(fit.speed_efficiency / 0.78 - 1), 0.03)       # README "Shot log": within 2% swept
        # 0.4% on this build with the loop-command drops (8.8% with the parabola's; firmware/esp32/README.md "A recovery
        # shaped by the loop's own commands"); the bound leaves room for the simulator, not for that bias
        self.assertLess(abs(fit.spin_efficiency / 0.42 - 1), 0.03)
        self.assertTrue(all(r["loop_top"] and r["loop_bottom"] for r in res.launches))
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "shots.jsonl")
            self.assertEqual(host.append_shot_log(path, res, "drill.calibration.json"), 12)
            self.assertEqual(len(host.read_shot_log(path)), 12)

    def test_dry_stroke_record_says_no_ball(self):
        sim = SimFeeder(balls=1)
        res, _ = run(sim, drill())
        self.assertEqual(res.dry_shot, 2)
        self.assertEqual([(r["shot"], r["launched"]) for r in res.launches], [(0, True), (1, True), (2, False)])

    def test_heavier_wheel_scales_the_fit_and_one_radar_reading_finds_it(self):
        from tennisbots import launcher
        import launch_fit_sweep as sweep
        fit, _, _, _ = sweep.run_case(0.85, 0.5, 0.4, inertia_x=1.3)
        self.assertLess(abs(fit.speed_efficiency * 1.3 / 0.85 - 1), 0.05)  # reads 0.85 / 1.3
        inertia = launcher.inertia_from_radar(fit, 0.85)
        self.assertLess(abs(inertia / (0.00155 * 1.3) - 1), 0.05)


class PulseDropTest(unittest.TestCase):
    """2026-11-16, firmware/esp32/README.md "The drop from the pulse times": controller.drop_from_periods fits a ball's
    whole speed drop to the wheel's revolution periods, where the lowest single-revolution reading shows only part."""

    @staticmethod
    def _periods(rpm, drop, t0_us, rec_per_s, rec2_per_s2=0.0, revs=40):
        """Revolution periods (us) of a wheel at `rpm` that loses `drop` of its speed at t0 and then recovers at
        `rec_per_s` (+ `rec2_per_s2` t) of its speed per second, integrated in 1 us steps."""
        w0 = rpm / 60e6                     # rev per us
        t, ang, last, out = 0.0, 0.0, 0.0, []
        while len(out) < revs:
            if t < t0_us:
                w = w0
            else:
                s = (t - t0_us) / 1e6
                w = w0 * min(1.0, 1 - drop + rec_per_s * s + rec2_per_s2 * s * s)
            ang += w
            t += 1.0
            if ang >= 1.0:
                ang -= 1.0
                out.append(round(t - last))
                last = t
        return out

    def test_whole_drop_from_the_pulse_times(self):
        for rpm, drop, t0 in ((1500, 0.15, 400000), (4000, 0.088, 300137), (6500, 0.07, 200050)):
            ps = self._periods(rpm, drop, t0, 0.15, 1.5)
            got = controller.drop_from_periods(ps)
            self.assertIsNotNone(got, rpm)
            self.assertAlmostEqual(got[0] / drop, 1.0, delta=0.01, msg=rpm)
            self.assertAlmostEqual(got[1] / rpm, 1.0, delta=0.002, msg=rpm)
            self.assertEqual(got[2], 5)
            lowest = 1 - min(60e6 / p for p in ps) / rpm
            self.assertLess(lowest, drop * 0.99)         # what the record carried before: only part of it

    def test_too_few_revolutions_after_the_ball_is_no_fit(self):
        ps = self._periods(2000, 0.1, 200000, 0.2)
        k = max(range(len(ps)), key=lambda j: ps[j])
        self.assertIsNone(controller.drop_from_periods(ps[:k + 1]))    # cut at the slowest revolution
        self.assertIsNone(controller.drop_from_periods([30000] * 3))

    def test_ring_keeps_the_last_periods(self):
        tach = controller.PeriodTach(ring=8)
        for p in range(10000, 10020):
            tach.edge(p)
        self.assertEqual(tach.recent(3), [10017, 10018, 10019])
        self.assertEqual(tach.recent(50), list(range(10012, 10020)))
        self.assertEqual(tach.recent(2, upto=15), [10013, 10014])
        tach.edge(2000000)                                  # a stall restarts the count
        self.assertEqual(tach.recent(5), [])

    def test_whole_drops_need_no_recovery_time(self):
        from tennisbots import launcher
        recs = []
        for top, bottom in ((4000, 4000), (4500, 3000), (3000, 4500), (2000, 2000)):
            d = controller.launch_dips(top, bottom, 0.00155, 0.0577, 0.075, 0.0335, 0.8, 0.45)
            recs.append({"rpm_top": top, "rpm_bottom": bottom, "launched": True, "drop_top": d[0],
                         "drop_bottom": d[1], "fit_top": True, "fit_bottom": True})
        fit = launcher.fit_from_drops(recs)
        self.assertAlmostEqual(fit.speed_efficiency, 0.8, places=6)
        self.assertAlmostEqual(fit.spin_efficiency, 0.45, places=6)
        self.assertIsNone(fit.recovery_s)
        self.assertNotIn("one speed", fit.note)

    def test_slow_wheels_are_set_aside(self):
        """2026-11-16, firmware/esp32/README.md "Slow wheels": a wheel under launcher.MIN_FIT_RPM gets too few
        revolutions before the verdict for its whole drop; its reading (here a third short) must not move the fit."""
        from tennisbots import launcher
        recs = []
        for top, bottom in ((4000, 4000), (4500, 3000), (3000, 4500), (2000, 2000), (5000, 600), (5000, 520)):
            d = controller.launch_dips(top, bottom, 0.00155, 0.0577, 0.075, 0.0335, 0.8, 0.45)
            short = 0.7 if bottom < launcher.MIN_FIT_RPM else 1.0
            recs.append({"rpm_top": top, "rpm_bottom": bottom, "launched": True, "drop_top": d[0],
                         "drop_bottom": d[1] * short, "fit_top": True, "fit_bottom": True})
        fit = launcher.fit_from_drops(recs)
        self.assertAlmostEqual(fit.speed_efficiency, 0.8, places=6)
        self.assertAlmostEqual(fit.spin_efficiency, 0.45, places=6)
        self.assertIn("2 wheel readings under 1000 rpm set aside", fit.note)
        with self.assertRaises(ValueError):
            launcher.fit_from_drops([{"rpm_top": 800, "rpm_bottom": 700, "launched": True, "drop_top": 0.3,
                                      "drop_bottom": 0.3}])

    def test_slow_wheel_keeps_its_revolutions_until_the_verdict(self):
        """2026-11-16, firmware/esp32/README.md "The 1,000 rpm floor retested": the next shot's wheel speeds froze the
        board's pulse snapshot straight after the release, leaving a 700 rpm wheel too few revolutions for the
        loop-command fit. With host.HOLD_RPM the Pi waits for the verdict first, and the fit is made."""
        spec = {"machine": {"y": 0.0, "height": 1.0}, "interval": 3.0,
                "shots": [{"x": 9.0, "y": 0.0, "speed": 22, "topspin": 2800},
                          {"x": 10.5, "y": 0.0, "speed": 26, "topspin": 0}]}
        shots = host.plan_drill(spec)
        self.assertLess(shots[0].rpm_bottom, 800)
        got = {}
        old = host.HOLD_RPM
        try:
            for hold in (0.0, 1000.0):
                host.HOLD_RPM = hold
                res, _ = run(SimFeeder(), host.plan_drill(spec))
                self.assertTrue(res.ok, res.aborted)
                got[hold] = res.launches[0]["loop_bottom"]
        finally:
            host.HOLD_RPM = old
        self.assertEqual(got, {0.0: False, 1000.0: True})

    def test_slow_wheel_is_watched_past_the_verdict(self):
        """2026-11-16, firmware/esp32/README.md "Slow wheels watched past the verdict": a 615 rpm wheel had three or
        four revolutions after its ball by the verdict, and the loop fit read 0.96-1.26 of its drop. The board now
        watches it on until the fit's LOOP_AFTER_REVS, and the Pi holds the next speeds (and the drill's final stop,
        which froze the last ball's snapshot straight after its release) until then."""
        spec = {"machine": {"y": 0.0, "height": 1.0}, "interval": 3.0,
                "shots": [{"x": 9.0, "y": 0.0, "speed": 22, "topspin": 3000},
                          {"x": 10.5, "y": 0.0, "speed": 26, "topspin": 0},
                          {"x": 9.0, "y": 0.0, "speed": 22, "topspin": 3000}]}
        shots = host.plan_drill(spec)
        self.assertLess(shots[0].rpm_bottom, 650)
        self.assertGreater(host.hold_s(shots[0]), host.VERDICT_S)
        old = controller.LOOP_AFTER_REVS, host.LOOP_AFTER_REVS
        got = {}
        try:
            for revs in (0, 8):
                controller.LOOP_AFTER_REVS = host.LOOP_AFTER_REVS = revs
                sim = SimFeeder(balls=None)
                truth, after = [], []
                take = sim._take_momentum

                def taken():
                    before = sim.wheel[1]
                    take()
                    truth.append(1 - sim.wheel[1] / before)
                sim._take_momentum = taken
                link = host.FeederLink(sim, sim.clock)
                lc = sim.hw.launch
                fit = lc._loop_fit

                def kept(snap, *a):
                    after.append(len(snap[1]) - controller._anchor(snap[1]))
                    return fit(snap, *a)
                lc._loop_fit = kept
                res = host.run_drill(link, shots, sim.sleep)
                self.assertTrue(res.ok, res.aborted)
                recs = [r for r in res.launches if r["launched"]]
                got[revs] = ([r["drop_bottom"] / t for r, t in zip(recs, truth)][0::2], after[0::2],
                             lc.extended)
        finally:
            controller.LOOP_AFTER_REVS, host.LOOP_AFTER_REVS = old
        ratios, after, extended = got[8]
        self.assertEqual(extended, 2)                     # both slow shots, the last one too
        self.assertTrue(all(n >= 9 for n in after), after)
        self.assertTrue(all(abs(x - 1) < 0.01 for x in ratios), ratios)
        self.assertTrue(all(n < 8 for n in got[0][1]), got[0][1])
        self.assertEqual(got[0][2], 0)

    def test_slow_wheel_is_watched_through_the_next_speed_change(self):
        """2026-11-17, firmware/esp32/README.md "The fit floor on held-out builds": the Pi's hold made the shot after a
        slow one late. With LOOP_THROUGH_CHANGE the board watches the slow wheel on through the next shot's speed change
        (the loop fit models the commands), so the Pi sends the next speeds straight away: the second shot releases
        sooner and the slow wheel's drop still reads within 1%. Off by default on both sides."""
        self.assertFalse(controller.LOOP_THROUGH_CHANGE)
        self.assertFalse(host.LOOP_THROUGH_CHANGE)
        spec = {"machine": {"y": 0.0, "height": 1.0}, "interval": 3.0,
                "shots": [{"x": 9.0, "y": 0.0, "speed": 22, "topspin": 3000},
                          {"x": 10.5, "y": 0.0, "speed": 26, "topspin": 0}]}
        shots = host.plan_drill(spec)
        got = {}
        try:
            for through in (False, True):
                controller.LOOP_THROUGH_CHANGE = host.LOOP_THROUGH_CHANGE = through
                sim = SimFeeder(balls=None)
                truth = []
                take = sim._take_momentum

                def taken():
                    before = sim.wheel[1]
                    take()
                    truth.append(1 - sim.wheel[1] / before)
                sim._take_momentum = taken
                res = host.run_drill(host.FeederLink(sim, sim.clock), shots, sim.sleep)
                self.assertTrue(res.ok, res.aborted)
                rec = res.launches[0]
                got[through] = (res.shots[1].released_at - res.shots[0].released_at, rec["drop_bottom"] / truth[0],
                                rec["loop_bottom"], sim.hw.launch.extended)
        finally:
            controller.LOOP_THROUGH_CHANGE = host.LOOP_THROUGH_CHANGE = False
        held, thru = got[False], got[True]
        self.assertLess(thru[0], held[0] - 0.5)
        self.assertTrue(thru[2] and thru[3] >= 1, thru)
        self.assertLess(abs(thru[1] - 1), 0.01, thru)

    def test_a_stop_still_ends_the_watch_through_changes(self):
        """A coast down is the ESC's braking, which no command describes: LOOP_THROUGH_CHANGE keeps watching through a
        change of speed, never through a stop."""
        self.assertTrue(controller._stopped((5000, 600), (0, 0)))
        self.assertTrue(controller._stopped((5000, 600), (5000, 0)))
        self.assertFalse(controller._stopped((5000, 600), (4000, 4000)))
        self.assertFalse(controller._stopped((0, 600), (0, 4000)))

    def test_hold_matches_the_board(self):
        """The Pi's hold and the board's watch past the verdict count the same revolutions over the same time."""
        self.assertEqual(host.LOOP_AFTER_REVS, controller.LOOP_AFTER_REVS)
        self.assertAlmostEqual(host.HOLD_MAX_S, 0.25 + controller.EXTEND_MS / 1000.0)
        shot = lambda top, bottom: type("S", (), {"rpm_top": top, "rpm_bottom": bottom})
        self.assertEqual(host.hold_s(shot(3500, 3500)), 0.0)
        self.assertEqual(host.hold_s(shot(5000, 2000)), host.VERDICT_S)
        self.assertGreater(host.hold_s(shot(5900, 600)), host.VERDICT_S)
        self.assertLessEqual(host.hold_s(shot(5900, 500)), host.HOLD_MAX_S + host.FRESH_S)

    def test_launch_flags_reach_the_pi(self):
        sim = SimFeeder()
        res, _ = run(sim, drill())
        self.assertTrue(res.ok, res.aborted)
        self.assertTrue(all(r["launched"] and r["fit_top"] and r["fit_bottom"] for r in res.launches))
        # the loop-command drops replaced every record, the last shot's too (run_drill waits for its fit)
        self.assertTrue(all(r["loop_top"] and r["loop_bottom"] and not r["loop_pending"] for r in res.launches))


class LoopDropTest(unittest.TestCase):
    """2026-11-16, firmware/esp32/README.md "A recovery shaped by the loop's own commands": the drop fitted from the
    periods and the ESC commands the speed loop sent, with the wheel a first-order lag of unknown time constant."""

    @staticmethod
    def _wheel(rpm, drop, tau_s, free_rpm, ball_ms=1500.4, total_ms=1900, esc_tau_s=0.0):
        """A first-order wheel (free speed `free_rpm`, the firmware told 9000) on the firmware's own PeriodTach and
        WheelLoop, 1 ms steps, the ball taking `drop` of its speed at `ball_ms`. Returns (periods, ticks) from
        200 ms before the ball, as LaunchCheck would log them."""
        tach, loop = controller.PeriodTach(), controller.WheelLoop(9000)
        loop.i = rpm / free_rpm - rpm / 9000
        w, cmd, rev, last = float(rpm), rpm / free_rpm, 0.0, 0
        drive = float(rpm)                                   # the ESC's output, behind its own lag when esc_tau_s > 0
        periods, ticks, e0 = [], [], None
        for ms in range(total_ms):
            if ms == int(ball_ms):
                w *= 1 - drop
            drive = drive + (free_rpm * cmd - drive) * 0.001 / esc_tau_s if esc_tau_s else free_rpm * cmd
            w += (drive - w) * 0.001 / tau_s
            before = rev
            rev += w / 60000.0
            if int(rev) > int(before):
                e = ms * 1000 + int((int(rev) - before) / (rev - before) * 1000)
                tach.edge(e - last)
                if e0 is not None:
                    periods.append(e - last)
                last = e
            if ms % 10 == 0:
                now = ms * 1000 + 1000
                cmd = loop.update(rpm, tach.rpm(now - last), 10)
                if ms >= ball_ms - 200:
                    if e0 is None:
                        e0 = tach.edges
                    ticks.append((tach.edges - e0, now - last, cmd))
        return periods, ticks

    def test_whole_drop_on_a_loop_driven_wheel(self):
        for rpm, drop, tau_s, free in ((2500, 0.10, 0.2, 9000), (5500, 0.07, 0.2, 9000), (3500, 0.09, 0.6, 10500),
                                       (1800, 0.12, 0.3, 7500)):
            ps, ticks = self._wheel(rpm, drop, tau_s, free)
            got = controller.drop_from_commands(ps, ticks)
            self.assertIsNotNone(got, rpm)
            self.assertAlmostEqual(got[0] / drop, 1.0, delta=0.006, msg=(rpm, tau_s))
            self.assertAlmostEqual(got[1] / rpm, 1.0, delta=0.003, msg=rpm)

    def test_an_esc_lag_reads_low_unless_the_fit_knows_it(self):
        # README "An ESC lag picked from the build's own balls"
        ps, ticks = self._wheel(3000, 0.09, 0.4, 9000, esc_tau_s=0.1)
        self.assertIs(controller.esc_lagged_ticks(ps, ticks, 0), ticks)
        one = controller.drop_from_commands(ps, ticks)
        two = controller.drop_from_commands(ps, controller.esc_lagged_ticks(ps, ticks, 100000))
        self.assertLess(one[0] / 0.09, 0.99)                       # low
        self.assertAlmostEqual(two[0] / 0.09, 1.0, delta=0.006)
        self.assertLess(two[4], one[4])                            # and the right lag fits better

    def test_it_is_spread_over_ticks(self):
        ps, ticks = self._wheel(3000, 0.09, 0.4, 9000)
        steps = list(controller.drop_from_commands_steps(ps, ticks))
        self.assertEqual(steps[-1][0], "fit")
        self.assertTrue(all(s is None for s in steps[:-1]))
        self.assertLessEqual(len(steps) - 1, 40)              # 5 + 7 time constants x 3 t0 grids

    def test_polish_finds_the_ball_between_grid_points(self):
        # README "Not the simulator's step either": the 3-level t0 grid's last step (1/64 of a revolution) left a 0.3%
        # scatter on noise-free wheels; one solve at the parabola's vertex halves it and adds no step
        for rpm in (2500, 5000):
            errs = {}
            for polish in (False, True):
                errs[polish] = []
                for i in range(16):                        # the ball at 16 moments across a revolution or two
                    ps, ticks = self._wheel(rpm, 0.08, 0.3, 9000, ball_ms=1500 + i)
                    errs[polish].append(controller.drop_from_commands(ps, ticks, polish=polish)[0] / 0.08 - 1)
            sd = {p: statistics.pstdev(e) for p, e in errs.items()}
            self.assertLess(sd[True], 0.6 * sd[False], rpm)
            self.assertLess(max(map(abs, errs[True])), 0.004, rpm)
        ps, ticks = self._wheel(3000, 0.09, 0.4, 9000)
        self.assertEqual(len(list(controller.drop_from_commands_steps(ps, ticks))),
                         len(list(controller.drop_from_commands_steps(ps, ticks, polish=False))))

    def test_the_record_fit_reads_a_longer_window_through_tach_jitter(self):
        # 2026-11-18 (README "The record's drop fit and its window"): 24 revolutions after the ball average a jittery
        # tach that 8 do not; held out on the simulator the jitter builds' rms fell from 0.62% to 0.47%
        import random
        self.assertEqual(controller.LOOP_FIT_AFTER, 24)
        rng = random.Random(5)
        errs = {8: [], controller.LOOP_FIT_AFTER: []}
        for i in range(24):
            ps, ticks = self._wheel(4500, 0.08, 0.45, 9000, ball_ms=1500 + i * 0.37, total_ms=1950)
            edges = [0.0]
            for p in ps:
                edges.append(edges[-1] + p)
            edges = [e + rng.gauss(0, 3.0) for e in edges]             # a 3 us (sd) edge timer
            jit = [b - a for a, b in zip(edges, edges[1:])]
            for a in errs:
                errs[a].append(controller.drop_from_commands(jit, ticks, after=a)[0] / 0.08 - 1)
        rms = {a: math.sqrt(statistics.fmean([e * e for e in v])) for a, v in errs.items()}
        self.assertLess(rms[controller.LOOP_FIT_AFTER], 0.9 * rms[8], rms)

    def test_no_fit_without_commands_or_revolutions(self):
        ps, ticks = self._wheel(3000, 0.09, 0.4, 9000)
        self.assertIsNone(controller.drop_from_commands(ps, []))
        k = max(range(len(ps)), key=lambda j: ps[j])
        self.assertIsNone(controller.drop_from_commands(ps[:k + 2], ticks))

    def test_same_seq_with_new_flags_replaces_the_record(self):
        class Port:
            def __init__(self):
                self.buf = bytearray()

            def write(self, data):
                pass

            def read(self):
                out, self.buf = bytes(self.buf), bytearray()
                return out
        port, now = Port(), [0.0]
        link = host.FeederLink(port, lambda: now[0])
        port.buf += P.encode(P.LAUNCH, 4, 4000, 3000, 880, 900, 1 | 2 | 4 | 32)
        link.poll()
        port.buf += P.encode(P.LAUNCH, 4, 4000, 3000, 880, 900, 1 | 2 | 4 | 32)   # repeated: nothing new
        link.poll()
        self.assertEqual(len(link.launch_log), 1)
        self.assertTrue(link.launch_log[0][1]["loop_pending"])
        now[0] = 0.4
        port.buf += P.encode(P.LAUNCH, 4, 4010, 2995, 875, 912, 1 | 2 | 4 | 8 | 16)
        link.poll()
        self.assertEqual(len(link.launch_log), 1)
        t, rec = link.launch_log[0]
        self.assertEqual(t, 0.0)                               # first seen, not replaced
        self.assertEqual((rec["drop_bottom"], rec["loop_top"], rec["loop_pending"]), (0.0912, True, False))
        port.buf += P.encode(P.LAUNCH, 5, 4000, 3000, 870, 905, 1 | 2 | 4)
        link.poll()
        self.assertEqual(len(link.launch_log), 2)
        port.buf += P.encode(P.LAUNCH, 6, 4000, 3000, 870, 905, 1 | 2 | 4 | 8 | 16 | 128)
        link.poll()
        rec = link.launch_log[-1][1]
        self.assertEqual((rec["unsure_top"], rec["unsure_bottom"]), (False, True))


class EscSurveyTest(unittest.TestCase):
    """2026-11-16, firmware/esp32/README.md "The ESC lag surveyed on the board": the board sums each wheel's fit
    residual at six ESC lags after its record is out, the ESC_SURVEY frame carries the sums to the Pi, and the Pi says
    which ESC_TAU_US the balls pick."""

    def test_pick_refines_between_neighbours(self):
        g = controller.ESC_SURVEY_GRID_US
        self.assertEqual(controller.survey_pick(g, [0.0] * 6), (None, None))
        self.assertEqual(controller.survey_pick(g, [1, 2, 3, 4, 5, 6]), (0, 0.0))        # an end: the grid point
        i, ref = controller.survey_pick(g, [9, 5, 4, 5, 9, 12])                         # symmetric in log around 50
        self.assertEqual(i, 2)
        self.assertAlmostEqual(ref, (20000 * 100000) ** 0.5, delta=1000)  # the vertex of a parabola symmetric in log
        i, ref = controller.survey_pick(g, [9, 5, 5.5, 8, 9, 12])                       # 0 below: linear in the lag
        self.assertEqual(i, 1)
        self.assertTrue(0 <= ref <= 50000)

    def test_spline_pick_finds_a_v_between_grid_lags(self):
        # README "The ESC-lag survey's pick between grid lags": a V-shaped, lopsided sum curve (as the residuals are)
        # with its least at 40 ms: the spline reads it within 5%
        import math
        g = controller.ESC_SURVEY_GRID_US
        sums = [(1.0 + 30 * abs(math.log((v + 10000) / 50000.0))) ** 2 for v in g]
        self.assertEqual(controller.survey_spline_pick(g, [0.0] * 7), (None, None))
        self.assertEqual(controller.survey_spline_pick(g, [1, 2, 3, 4, 5, 6, 7]), (0, 0.0))
        self.assertEqual(controller.survey_spline_pick(g, [7, 6, 5, 4, 3, 2, 1]), (6, 400000.0))
        i, ref = controller.survey_spline_pick(g, sums)
        self.assertEqual(i, 2)
        self.assertTrue(20000 <= ref <= 100000)                     # inside the neighbours' span
        self.assertLess(abs(ref - 40000), 0.05 * 40000)
        # an exact parabola in log(lag + 10 ms) has its least where the spline says
        sq = [(math.log(v + 10000) - math.log(70000)) ** 2 + 1 for v in g]
        self.assertAlmostEqual(controller.survey_spline_pick(g, sq)[1], 60000, delta=3000)

    def test_board_surveys_a_drill_and_the_pi_reads_it(self):
        import esc_survey_sweep as S
        sim = S.sim_for({"esc_tau_s": 0.08}, 0.4, 0.95, 0.65)
        res = S.drill(sim, "drill.rally.json")
        sv = res.esc_survey
        self.assertIsNotNone(sv)
        self.assertGreaterEqual(sv["wheels"], 16)
        # the refined survey (36 steps a fit) outlasts the gap between rally balls: some queued surveys give way
        # (controller.SURVEY_QUEUE, README "The ESC-lag survey's search, traced"), never the records
        self.assertLessEqual(sim.hw.launch.survey_cut, 8)
        self.assertEqual(sv["least_ms"], 100)
        self.assertAlmostEqual(sv["refined_ms"], 80, delta=12)
        self.assertEqual(len(sv["rms_ppm"]), P.ESC_SURVEY_LAGS)
        self.assertIn("set ESC_TAU_US = ", host.esc_survey_advice(sv))
        sim = S.sim_for({}, 0.4, 0.95, 0.65)
        sv = S.drill(sim, "drill.rally.json").esc_survey
        self.assertEqual(sv["refined_ms"], 0)
        self.assertIn("keep ESC_TAU_US = 0", host.esc_survey_advice(sv))

    def test_a_long_esc_lag_on_a_slow_wheel_is_named(self):
        # 2026-11-18 (README "Long ESC lags: the survey read too little of the recovery"): reading 8 revolutions after
        # the ball, an untold 180 ms ESC on a 0.35 s wheel picked 106 ms on the calibration drill; the board's refits
        # now read ESC_SURVEY_AFTER = 16 and it picks 182
        import esc_survey_sweep as S
        self.assertEqual(controller.ESC_SURVEY_AFTER, 16)
        sv = S.drill(S.sim_for({"esc_tau_s": 0.18}, 0.35, 0.95, 0.65), "drill.calibration.json").esc_survey
        self.assertGreaterEqual(sv["wheels"], host.ESC_SURVEY_MIN_WHEELS)
        self.assertAlmostEqual(sv["refined_ms"], 180, delta=27)

    def test_a_new_stroke_pauses_the_survey_not_the_record(self):
        # 2026-11-18 (README "The ESC-lag survey's search, traced"): a new stroke no longer cuts the last ball's
        # survey; no survey step runs while the stroke is under way, and it resumes once the stroke's verdict is in.
        import esc_survey_sweep as S
        sim = S.sim_for({}, 0.4, 0.95, 0.65)
        lc = sim.hw.launch
        S.drill(sim, "drill.rally.json")
        cut = lc.survey_cut
        it = iter([None] * 10)
        lc.surveying = it                         # a survey under way ...
        lc.start((3000, 2000), 0)                 # ... and a new stroke
        self.assertIs(lc.surveying, it)
        self.assertFalse(lc.step())               # paused during the stroke
        self.assertEqual(len(list(iter(it))), 10)  # not one step was taken
        it = iter([None] * 10)
        lc.surveying = it
        lc.cancel()                               # the stroke is over
        self.assertTrue(lc.step())
        self.assertEqual(len(list(it)), 9)
        self.assertEqual(lc.survey_cut, cut)

    def test_packed_ticks_read_back_as_the_tuples(self):
        # 2026-11-18 (README "A queued survey's heap"): a queued survey's tick logs are packed into arrays; they must
        # iterate as the very tuples they were made from, and an empty log stays falsy.
        log = [(12, 340, 0.4125), (13, 0, 0.5), (15, 1999, 0.0)]
        packed = controller.PackedTicks(log)
        self.assertEqual(list(packed), log)
        self.assertEqual(len(packed), 3)
        self.assertFalse(controller.PackedTicks([]))
        both = controller.pack_ticks([log, packed])
        self.assertIs(both[1], packed)
        self.assertEqual(list(both[0]), log)

    def test_queued_surveys_hold_packed_ticks(self):
        import esc_survey_sweep as S
        sim = S.sim_for({}, 0.4, 0.95, 0.65)
        lc = sim.hw.launch
        held = []
        orig = controller.LaunchCheck.queue_survey

        def queue(self, survey):
            held.append(survey.gi_frame.f_locals["ticks"])
            return orig(self, survey)
        controller.LaunchCheck.queue_survey = queue
        try:
            S.drill(sim, "drill.example.json")
        finally:
            controller.LaunchCheck.queue_survey = orig
        self.assertTrue(held)
        self.assertTrue(all(isinstance(t, controller.PackedTicks) for ticks in held for t in ticks))
        self.assertTrue(all(isinstance(t, controller.PackedTicks) for t in lc.last_ticks))

    def test_waiting_surveys_queue_and_the_oldest_gives_way(self):
        import esc_survey_sweep as S
        lc = S.sim_for({}, 0.4, 0.95, 0.65).hw.launch
        ran = []

        def survey(name, n):
            for _ in range(n):
                ran.append(name)
                yield None
        lc.queue_survey(survey("a", 2))
        names = [chr(ord("b") + i) for i in range(controller.SURVEY_QUEUE + 1)]
        for name in names:                        # the first two give way to later ones; the rest wait behind a
            lc.queue_survey(survey(name, 1))
        self.assertEqual((lc.survey_cut, len(lc.survey_queue)), (2, controller.SURVEY_QUEUE - 1))
        while lc.step():
            pass
        self.assertEqual(ran, ["a", "a"] + names[2:])
        self.assertIsNone(lc.surveying)           # the running survey, then each waiting one, ran to the end

    def test_advice_waits_for_enough_wheels_and_frame_round_trips(self):
        self.assertIsNone(host.esc_survey_advice(None))
        self.assertIn("run more balls", host.esc_survey_advice({"wheels": 6, "least_ms": 50, "refined_ms": 44}))
        self.assertIn("already matches", host.esc_survey_advice({"wheels": 30, "least_ms": 50, "refined_ms": 44}, 45))
        # a pick at the grid's last lag names no number (README "Long ESC lags: the survey read too little of the
        # recovery"): the advice says to scope the ESC, and the calibration drill is not held on it
        end = {"wheels": 30, "least_ms": 400, "refined_ms": 400}
        self.assertIn("cannot name it", host.esc_survey_advice(end))
        self.assertIsNone(host.esc_lag_check(end, 0))
        frame = P.encode(P.ESC_SURVEY, 30, 100, 79, 817, 808, 361, 290, 330, 566, 65535)
        (cmd, vals), = list(P.Decoder().feed(frame))
        self.assertEqual((cmd, vals[:3]), (P.ESC_SURVEY, (30, 100, 79)))

    def test_board_reports_its_lag_and_the_check_compares_it(self):
        # README "Checked before a calibration drill": the ESC_TAU frame carries the board's ESC_TAU_US, and the
        # check says re-flash when the last survey (enough wheels) picks another lag; 0 only matches 0.
        frame = P.encode(P.ESC_TAU, 80)
        (cmd, vals), = list(P.Decoder().feed(frame))
        self.assertEqual((cmd, vals), (P.ESC_TAU, (80,)))
        sv = {"wheels": 30, "least_ms": 100, "refined_ms": 79}
        self.assertIsNone(host.esc_lag_check(None, 0))
        self.assertIsNone(host.esc_lag_check(dict(sv, wheels=6), 0))           # too few wheels to advise
        self.assertIsNone(host.esc_lag_check(sv, 80))                          # within 15%
        self.assertIn("set ESC_TAU_US = 79000", host.esc_lag_check(sv, 0))
        self.assertIn("set ESC_TAU_US = 0", host.esc_lag_check(dict(sv, refined_ms=0), 50))
        self.assertIsNone(host.esc_lag_check(dict(sv, refined_ms=0), 0))
        self.assertIn("does not report", host.esc_lag_check(sv, None))
        self.assertIn("set ESC_TAU_US = 79000", host.esc_survey_advice(sv, 0))
        self.assertIn("already matches", host.esc_survey_advice(sv, 80))

    def test_survey_kept_in_the_shot_log_and_left_out_of_the_fit(self):
        res = host.DrillResult(launches=[{"seq": 1, "rpm_top": 4000, "rpm_bottom": 3000, "drop_top": 0.08,
                                          "drop_bottom": 0.09, "launched": True, "shot": 0}],
                               esc_survey={"wheels": 30, "least_ms": 100, "refined_ms": 79, "rms_ppm": [1] * 6},
                               esc_tau_ms=0)
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "shots.jsonl")
            self.assertIsNone(host.last_survey_from_log(path))                 # no file yet
            self.assertEqual(host.append_shot_log(path, res, "drill.rally.json"), 1)
            self.assertEqual(len(host.read_shot_log(path)), 1)                 # the survey line is not a record
            sv = host.last_survey_from_log(path)
            self.assertEqual((sv["refined_ms"], sv["esc_tau_ms"], sv["drill"]), (79, 0, "drill.rally.json"))
            res.esc_survey = dict(res.esc_survey, wheels=60, refined_ms=81)
            host.append_shot_log(path, res, "drill.calibration.json")
            self.assertEqual(host.last_survey_from_log(path)["refined_ms"], 81)  # the newest
            self.assertEqual(len(host.read_shot_log(path)), 2)

    def test_calibration_drill_held_until_the_board_is_told_the_lag(self):
        import esc_survey_sweep as S
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "shots.jsonl")
            res = S.drill(S.sim_for({"esc_tau_s": 0.08}, 0.4, 0.95, 0.65), "drill.rally.json")
            self.assertEqual(res.esc_tau_ms, 0)
            host.append_shot_log(path, res, "drill.rally.json")
            prior = host.last_survey_from_log(path)
        cal = host.plan_drill(S.load("drill.calibration.json"))
        self.assertTrue(host.is_calibration(S.load("drill.calibration.json")))
        self.assertFalse(host.is_calibration(S.load("drill.rally.json")))
        sim = S.sim_for({"esc_tau_s": 0.08}, 0.4, 0.95, 0.65)
        held = host.run_drill(host.FeederLink(sim, sim.clock), cal, sim.sleep, prior_survey=prior, hold_on_esc_lag=True)
        self.assertTrue(held.held)
        self.assertEqual((held.fed, held.shots), ([], []))
        self.assertIn(f"set ESC_TAU_US = {prior['refined_ms'] * 1000}", held.aborted)
        self.assertFalse(sim.ctl.estop)                                         # held, not e-stopped
        # Told the lag, the same drill runs with no warning about it.
        sim = S.sim_for({"esc_tau_s": 0.08}, 0.4, 0.95, 0.65, prior["refined_ms"] * 1000)
        ran = host.run_drill(host.FeederLink(sim, sim.clock), cal, sim.sleep, prior_survey=prior, hold_on_esc_lag=True)
        self.assertTrue(ran.ok, ran.aborted)
        self.assertEqual(ran.esc_tau_ms, prior["refined_ms"])
        self.assertFalse(any("ESC_TAU_US" in w for w in ran.warnings))

    def test_other_drills_only_warn(self):
        import esc_survey_sweep as S
        prior = {"wheels": 30, "least_ms": 100, "refined_ms": 79}
        sim = S.sim_for({}, 0.4, 0.95, 0.65)
        res = host.run_drill(host.FeederLink(sim, sim.clock), host.plan_drill(S.load("drill.rally.json"))[:2],
                             sim.sleep, prior_survey=prior)
        self.assertTrue(res.ok, res.aborted)
        self.assertEqual(len(res.fed), 2)
        self.assertTrue(any("set ESC_TAU_US = 79000" in w for w in res.warnings))

    def test_one_badly_fitted_wheel_does_not_outvote_the_rest(self):
        # README "One wheel's misses outvoted the drill": eight wheels fit 100 ms best by 20-30%; one with misses 30
        # times theirs fits 0 best by 5%. The plain sum of squares followed the one; the trimmed sum follows the eight.
        lc = controller.LaunchCheck(0.00155, 0.0577, 0.075, 0.0335, 0.85, 0.5)
        good = [r * 1e-8 for r in (1.6, 1.4, 1.25, 1.0, 1.15, 1.3, 1.5)]       # 0 / 20 / 50 / 100 / 150 / 200 / 400 ms
        bad = [r * 9e-6 for r in (1.0, 1.01, 1.02, 1.05, 1.055, 1.06, 1.07)]
        for _ in range(8):
            lc.survey_add(good)
        lc.survey_add(bad)
        plain = [8 * g + b for g, b in zip(good, bad)]
        self.assertEqual(controller.survey_pick(lc.survey, plain)[0], 0)
        n, least, refined, rms = lc.survey_report()
        self.assertEqual((n, least, lc.survey_trimmed), (9, 100, 1))
        self.assertTrue(80 <= refined <= 125, refined)
        self.assertEqual(rms[3], 100)                       # the kept wheels' rms, 1e-4 of the speed
        for _ in range(4):                                 # wheels within 5x of the median stay in
            lc.survey_add([4 * v for v in good])
        lc.survey_report()
        self.assertEqual(lc.survey_trimmed, 1)
        for _ in range(controller.SURVEY_KEEP):            # only the last SURVEY_KEEP are kept
            lc.survey_add(good)
        self.assertEqual((len(lc.survey_wheels), lc.survey_n), (controller.SURVEY_KEEP, 13 + controller.SURVEY_KEEP))

    def test_survey_off_sends_nothing(self):
        lc = controller.LaunchCheck(0.00155, 0.0577, 0.075, 0.0335, 0.85, 0.5, survey=())
        self.assertIsNone(lc.survey_report())


class AnchorTest(unittest.TestCase):
    """2026-11-16, firmware/esp32/README.md "The outlier wheel was anchored past its ball": behind a slow recovery the
    revolutions after the ball are nearly level, and tach jitter could make the second one the longest, putting the
    ball outside the fit's t0 search."""

    # a 5,479 rpm wheel behind a 100 ms ESC on a 0.8 s wheel, 5 us jitter (seed 7): the ball is in revolution 69
    LEVEL = [10830, 10841, 10833, 10839, 10827, 10835, 10839, 10827, 10838, 11189, 11475, 11489, 11467, 11452, 11452,
             11428, 11413, 11400, 11390, 11380]

    def test_walks_back_over_a_level_run(self):
        ball = 9
        self.assertEqual(controller._anchor(self.LEVEL, 0), ball + 2)       # the longest period: past the search
        self.assertEqual(controller._anchor(self.LEVEL), ball + 1)

    def test_a_partial_ball_revolution_stays_the_one_before(self):
        ps = [10835] * 9 + [11189, 11475, 11300, 11200, 11150, 11100, 11050, 11000, 10950, 10900]
        self.assertEqual(controller._anchor(ps), 10)
        self.assertEqual(controller._anchor(ps, 0), 10)

    def test_no_wheel_outvotes_the_survey_on_the_build_that_failed(self):
        import survey_outlier_cause as C
        ws = [w for w in C.wheels({"esc_tau_s": 0.10, "tach_jitter_us": 5.0}, 0.8, 0.7, 0.35, 7) if w[3] is not None]
        best = sorted(min(w[3]) ** 0.5 for w in ws)
        med = best[len(best) // 2]
        self.assertGreater(len(ws), 50)
        self.assertLess(best[-1], controller.SURVEY_TRIM * med)
        for _, periods, b, _ in ws:
            self.assertIn(controller._anchor(periods) - b, (0, 1))


class EdgeFormTest(unittest.TestCase):
    """2026-11-16, README "The drop on the edge times": the loop fit can run on the edge times (`edges=True`); it is
    off by default because at a few microseconds of jitter it spread the drop more than the period form."""

    def test_edge_form_fits_a_clean_wheel_as_well(self):
        import loop_residual_sweep as lr
        for rpm, tau in ((2500, 0.2), (4000, 0.4), (6000, 0.8)):
            ps, tk = lr.wheel(rpm, 0.08, tau)
            got = controller.drop_from_commands(ps, tk, edges=True)
            self.assertAlmostEqual(got[0] / 0.08, 1.0, delta=0.008, msg=(rpm, tau))
            self.assertLess(got[5], controller.LOOP_SE_MAX)


class LoopFitUnsureTest(unittest.TestCase):
    """2026-11-16 later, firmware/esp32/README.md "When the wheel is not a first-order lag": the loop fit's standard
    error from its own misses marks drops it cannot vouch for, and the Pi's launcher fit warns when enough are marked."""

    def test_standard_error_marks_a_jittery_tach_and_a_lagging_esc_not_a_clean_wheel(self):
        import loop_residual_sweep as lr
        for rpm, tau in ((2500, 0.2), (4000, 0.4), (6000, 0.8)):
            ps, tk = lr.wheel(rpm, 0.08, tau)
            got = controller.drop_from_commands(ps, tk)
            self.assertEqual(len(got), 8)    # 8th: the take straddles an edge (2026-11-19)
            self.assertLess(got[5], controller.LOOP_SE_MAX, (rpm, tau))
        ps, tk = lr.wheel(4000, 0.06, 0.4, jitter_us=20, seed=3)
        got = controller.drop_from_commands(ps, tk)
        self.assertGreater(got[5], controller.LOOP_SE_MAX)
        # The four-revolution tach (the default): with a 40 ms window (README "A tach that averages a fixed time") this
        # loop rings less and the fit is only 2.8% off, so the badly-off case is pinned to the tach it was found on
        old, controller.TACH_WINDOW_US = controller.TACH_WINDOW_US, 0
        try:
            ps, tk = lr.wheel(1500, 0.06, 0.2, tau_esc=0.08)
        finally:
            controller.TACH_WINDOW_US = old
        got = controller.drop_from_commands(ps, tk)
        self.assertGreater(abs(got[0] / 0.06 - 1), 0.05)       # the fit is badly off ...
        self.assertGreater(got[5], controller.LOOP_SE_MAX)       # ... and says so

    def test_launcher_fit_warns_on_unsure_drops(self):
        from tennisbots import launcher
        r_w = launcher.WheelLauncher().wheel_radius
        recs = []
        for top, bot in ((3000, 3000), (4500, 3000), (3000, 4500), (5000, 5000), (6000, 4000), (4000, 6000)):
            def drop(w, sign):          # the fit's own model with speed efficiency 0.8 and spin efficiency 0.5
                k = launcher.BALL_KG * r_w ** 2 / (launcher.WHEEL_INERTIA_KGM2 * w)
                return k * (0.8 * (top + bot) / 4 + sign * 0.5 * (top - bot) / 6)
            recs.append({"launched": True, "rpm_top": top, "rpm_bottom": bot, "drop_top": drop(top, 1),
                         "drop_bottom": drop(bot, -1), "fit_top": True, "fit_bottom": True})
        base = launcher.fit_from_drops(recs)
        self.assertAlmostEqual(base.speed_efficiency, 0.8, places=6)
        bad = [dict(r) for r in recs]
        bad[1]["unsure_top"] = True                                       # one mark: kept, counted, no warning
        one = launcher.fit_from_drops(bad)
        self.assertEqual(one.unsure, 1)
        self.assertNotIn("marked unsure", one.note)
        bad[2]["unsure_bottom"] = True                                    # two of 12: warned, still used
        two = launcher.fit_from_drops(bad)
        self.assertEqual(two.unsure, 2)
        self.assertIn("2 of 12 wheel readings marked unsure", two.note)
        self.assertAlmostEqual(two.speed_efficiency, 0.8, places=6)

    def test_unsure_weight_scales_a_marked_reading(self):
        # 2026-11-17, firmware/esp32/README.md "Unsure marks on the noisy wheels": a marked reading counts w times
        from tennisbots import launcher
        r_w = launcher.WheelLauncher().wheel_radius
        recs = []
        for top, bot in ((3000, 3000), (4500, 3000), (3000, 4500), (5000, 5000), (6000, 4000), (4000, 6000)):
            def drop(w, sign):
                k = launcher.BALL_KG * r_w ** 2 / (launcher.WHEEL_INERTIA_KGM2 * w)
                return k * (0.8 * (top + bot) / 4 + sign * 0.5 * (top - bot) / 6)
            recs.append({"launched": True, "rpm_top": top, "rpm_bottom": bot, "drop_top": drop(top, 1),
                         "drop_bottom": drop(bot, -1), "fit_top": True, "fit_bottom": True})
        recs[1] = dict(recs[1], drop_top=recs[1]["drop_top"] * 1.1, unsure_top=True)   # 10% high, inside TRIM
        full = launcher.fit_from_drops(recs)
        half = launcher.fit_from_drops(recs, unsure_weight=0.5)
        none = launcher.fit_from_drops(recs, unsure_weight=0.0)
        self.assertEqual(launcher.fit_from_drops(recs, unsure_weight=1.0), full)
        self.assertGreater(abs(full.spin_efficiency - 0.5), abs(half.spin_efficiency - 0.5))
        self.assertAlmostEqual(none.spin_efficiency, 0.5, places=6)    # set aside: the clean rows alone
        self.assertAlmostEqual(none.speed_efficiency, 0.8, places=6)


class RefitTest(unittest.TestCase):
    """2026-11-16, firmware/esp32/README.md "Re-planning a drill from its own shots": host.Refitter fits the launcher's
    efficiencies to a drill's own wheel speed drops after N shots and re-plans the remaining shots' wheel speeds."""

    def test_rewheel_keeps_the_aim_and_the_ball(self):
        from tennisbots import launcher
        shots = drill()
        new, problems = host.rewheel(shots, launcher.WheelLauncher(speed_efficiency=0.75, spin_efficiency=0.4))
        self.assertEqual(problems, [])
        for a, b in zip(shots, new):
            self.assertEqual((a.elevation_cdeg, a.azimuth_cdeg, a.landing), (b.elevation_cdeg, b.azimuth_cdeg, b.landing))
            self.assertGreater(b.rpm_top + b.rpm_bottom, a.rpm_top + a.rpm_bottom)    # a weaker launcher spins faster
        same, problems = host.rewheel(shots, launcher.WheelLauncher(speed_efficiency=0.3))   # needs > 7000 rpm
        self.assertEqual(same, shots)
        self.assertEqual(len(problems), len(shots))
        self.assertTrue(problems[0].startswith("shot 0: kept"))

    def test_spin_the_fitted_launcher_cannot_give_is_cut_and_re_aimed(self):
        from tennisbots import launcher
        spec = {"machine": {"y": 0.0, "height": 1.0}, "shots": [{"x": 8.5, "y": -3.0, "speed": 21, "topspin": 1800}]}
        shot = host.plan_drill(spec)[0]
        weak = launcher.WheelLauncher(speed_efficiency=0.97, spin_efficiency=0.32)
        origin = launcher.default_origin(0.0, 1.0)
        (new,), (note,) = host.rewheel([shot], weak, origin)
        self.assertIn("spin cut from 1800", note)
        self.assertGreaterEqual(min(new.rpm_top, new.rpm_bottom), host.MIN_WHEEL_RPM)
        self.assertLess(new.topspin_rpm, 1800)
        self.assertLess(math.dist(host.landing_with(new, weak, origin), shot.landing), 0.15)

    def test_a_wheel_too_slow_to_hold_or_judge_is_refused_at_plan_time(self):
        spec = {"machine": {"y": 0.0, "height": 1.0}, "launcher": {"spin_efficiency": 0.3},
                "shots": [{"x": 8.5, "y": -3.0, "speed": 21, "topspin": 1800}]}
        with self.assertRaisesRegex(ValueError, "shot 0: .* outside 500..7000"):
            host.plan_drill(spec)

    def test_a_wrong_launcher_model_is_corrected_mid_drill(self):
        import refit_sweep as sweep
        out, recovery = sweep.run_case(0.78, 0.42, 0.4)
        self.assertIsNone(recovery)            # every drop is fitted from the pulse times: no recovery time to fit
        fixed, refit = out["fixed"][0], out["refit"][0]
        self.assertTrue(all(e > 1.8 for e in fixed))             # every shot about 2 m off on the planner's default
        for a, b in zip(fixed[:4], refit[:4]):                  # the first four are fed before any fit (the wait for
            self.assertAlmostEqual(a, b, delta=0.02)             # each verdict moves the wheels' timing a little)
        self.assertLess(max(refit[4:]), 0.8)
        used = [e for e in out["refit"][1].events if e["used"]]
        self.assertEqual(used[0]["after_shots"], 4)
        self.assertTrue(all(s["short_m"] > 1.0 for s in used[0]["landing_shift"]))   # the old speeds fell short

    def test_a_right_model_is_left_alone_and_a_mad_fit_is_refused(self):
        spec = {"machine": {"y": 0.0, "height": 1.0}, "shots": [{"x": 9.0, "y": 0.0, "speed": 22, "topspin": 1500}] * 6}
        shots = host.plan_drill(spec)
        exact = ShotLogTest()._exact([(s.rpm_top, s.rpm_bottom) for s in shots[:4]], 0.85, 0.5, 0.3)
        r = host.Refitter(spec, after=4, recovery_s=0.3)
        self.assertIsNone(r(exact[:3], shots[3:]))               # not yet
        self.assertIsNone(r(exact, shots[4:]))
        self.assertFalse(r.events[-1]["used"])
        self.assertIn("no change", r.events[-1]["why"])
        mad = [dict(e, drop_top=e["drop_top"] * 3, drop_bottom=e["drop_bottom"] * 3) for e in exact]
        r = host.Refitter(spec, after=4, recovery_s=0.3)
        self.assertIsNone(r(mad, shots[4:]))
        self.assertIn("refused", r.events[-1]["why"])
        with self.assertRaises(ValueError):
            host.Refitter(spec, after=1)

    def test_recovery_comes_from_a_calibration_log(self):
        import launch_fit_sweep as sweep
        recs = ShotLogTest()._exact(sweep.CALIBRATION, 0.8, 0.45, 0.3)
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "shots.jsonl")
            with open(path, "w") as fh:
                fh.writelines(json.dumps(r) + "\n" for r in recs)
            self.assertAlmostEqual(host.recovery_from_log(path), 0.3, delta=0.03)
            self.assertIsNone(host.recovery_from_log(os.path.join(d, "missing.jsonl")))


class SpreadTakeTest(unittest.TestCase):
    """SimFeeder(take_ms=) spreads the ball's take over its contact time (tests/take_spread.py): the same rpm leaves
    the wheels as an instant take, only later, and the force profile sets how it is shared out."""

    def _take(self, take_ms, shape="halfsine"):
        sim = SimFeeder(take_ms=take_ms, take_shape=shape, wheel_tau_s=1e9)   # a wheel that neither speeds up nor coasts
        sim.wheel, sim._drive = [5000.0, 3000.0], [0.0, 0.0]
        sim._take_momentum()
        trace = []
        for _ in range(8):
            sim.run_ms(1)
            trace.append(sim.wheel[0])
        return sim, trace

    def test_spread_take_removes_the_instant_takes_rpm(self):
        inst, _ = self._take(0.0)
        for shape in ("halfsine", "front"):
            sim, trace = self._take(4.0, shape)
            self.assertEqual(sim.taken, inst.taken)                # the same momentum, recorded at first contact
            self.assertAlmostEqual(trace[3], inst.wheel[0], places=6)   # all of it gone after 4 ms
            self.assertGreater(trace[0], trace[3])                 # but not at once
            self.assertEqual(sim._takes, [])

    def test_front_profile_takes_more_early(self):
        _, half = self._take(4.0, "halfsine")
        _, front = self._take(4.0, "front")
        self.assertLess(front[0], half[0])                         # 7/16 of it in the first ms against 15%

    def test_half_sine_offsets_carry_the_profiles_spread(self):
        # 2026-11-18, firmware/esp32/README.md "The take fit's four parts and its high reading"
        half_sine_var = 0.25 - 2.0 / math.pi ** 2
        for parts in (4, 8):
            xs = [o / 4000 for o in controller.take_offsets(4000, "halfsine", parts)]
            self.assertAlmostEqual(sum(xs) / parts, 0.5, places=9)               # centred on the take's middle
            self.assertAlmostEqual(sum((x - 0.5) ** 2 for x in xs) / parts, half_sine_var, places=9)
            self.assertTrue(all(0 < x < 1 for x in xs))
        old = [o / 4000 for o in controller.take_offsets(4000, match_spread=False)]
        self.assertAlmostEqual(sum((x - 0.5) ** 2 for x in old) / 4, 0.0397, places=4)  # the midpoints, as before
        self.assertEqual(controller.take_offsets(0), ())


class TakeSurveyTest(unittest.TestCase):
    """2026-11-17, firmware/esp32/README.md "The contact time surveyed on the board": with SURVEY_TAKE on, the board
    refits each launched wheel at nine contact times (seven before 2026-11-19, then eight that day), the TAKE_SURVEY frame carries the sums to the Pi, and the Pi says
    which TAKE_US the balls pick."""

    def test_frames_round_trip(self):
        (cmd, vals), = list(P.Decoder().feed(P.encode(P.SURVEY_TAKE, 1)))
        self.assertEqual((cmd, vals), (P.SURVEY_TAKE, (1,)))
        frame = P.encode(P.TAKE_SURVEY, 24, 60, 57, 0, 700, 640, 625, 620, 600, 590, 588, 610, 640, 9, 10, 3, 1, 5, 2)
        (cmd, vals), = list(P.Decoder().feed(frame))
        self.assertEqual((cmd, vals[:4], len(vals)), (P.TAKE_SURVEY, (24, 60, 57, 0), 10 + P.TAKE_SURVEY_TIMES))
        # wheels summed (2026-11-18), tenths, the straddle vote for and against, then the 2.5 ms vote (2026-11-19)
        self.assertEqual(vals[-6:], (9, 10, 3, 1, 5, 2))
        self.assertEqual(len(controller.TAKE_SURVEY_GRID_US), P.TAKE_SURVEY_TIMES)
        self.assertEqual(tuple(g / 1000 for g in controller.TAKE_SURVEY_GRID_US), host.TAKE_SURVEY_MS)

    def test_advice(self):
        sv = {"wheels": 24, "least_ms10": 60, "refined_ms10": 57, "board_ms10": 0,
              "rms_ppm": [136, 140, 119, 98, 95, 50, 112]}
        self.assertIsNone(host.take_survey_advice(None))
        self.assertIn("run more balls", host.take_survey_advice(dict(sv, wheels=6)))
        self.assertIn("set TAKE_US = 5500", host.take_survey_advice(sv))
        self.assertIn("already matches", host.take_survey_advice(dict(sv, board_ms10=60)))
        self.assertIn("keep TAKE_US = 0", host.take_survey_advice(dict(sv, least_ms10=0, refined_ms10=0)))
        # an instant take's build on the simulator: 3 ms fits 25% better than the step, under the margin
        flat = dict(sv, least_ms10=30, refined_ms10=26, rms_ppm=[68, 62, 51, 75, 81, 107, 197])
        self.assertIn("keep TAKE_US = 0", host.take_survey_advice(flat))
        self.assertIn("only 25% less", host.take_survey_advice(flat))
        self.assertIn("set TAKE_US = 0", host.take_survey_advice(dict(sv, least_ms10=0, refined_ms10=0, board_ms10=40)))
        # the grid's last contact time (2026-11-18, README "The take survey's pick between contact times"): 7 ms read 8
        end = dict(sv, least_ms10=80, refined_ms10=80, rms_ppm=[136, 130, 120, 110, 100, 90, 40])
        self.assertIn("about 7 ms or longer", host.take_survey_advice(end))
        self.assertIn("set TAKE_US = 8000", host.take_survey_advice(end))
        self.assertIn("already matches", host.take_survey_advice(dict(end, board_ms10=80)))

    def test_share_bound_from_whole_ppm(self):
        # the sub-8 instant build (2026-11-19, README "The sub-8 advised instant build was the frame's rounding"): the
        # frame carried 7 and 4 ppm, 0.571, where the board's sums gave 0.635; the frame allows up to 4.5 / 6.5
        self.assertAlmostEqual(host.take_share_bound([7, 8, 6, 4, 26, 54, 132]), 4.5 / 6.5)
        self.assertGreater(host.take_share_bound([7, 8, 6, 4, 26, 54, 132]), host.TAKE_ADVISE_RATIO)
        self.assertLess(host.take_share_bound([136, 140, 119, 98, 95, 50, 112]), host.TAKE_ADVISE_RATIO)
        self.assertEqual(host.take_share_bound([0, 0, 0]), 1.0)
        self.assertEqual(host.take_share_bound([]), 1.0)
        # shipped by its pre-registered rule (eval/take-share-rounding-2026-11-19.md): no advice on that build
        sv = {"wheels": 22, "least_ms10": 30, "refined_ms10": 35, "board_ms10": 0, "rms_ppm": [7, 8, 6, 4, 26, 54, 132]}
        got = host.take_survey_advice(sv)
        self.assertIn("keep TAKE_US = 0", got)
        self.assertIn("too close to the frame's 1 ppm", got)
        self.assertNotIn("set TAKE_US = 3", got)

    def test_instant_verdict_names_its_bound(self):
        # 2026-11-19 (README "Short takes that read 0: no ball saw them"): a TAKE_US = 0 verdict names the first
        # candidate that fits clearly worse than the step, the longest take these balls cannot tell from an instant one
        shelf = {"wheels": 22, "least_ms10": 0, "refined_ms10": 0, "board_ms10": 0,
                 "rms_ppm": [100, 100, 112, 128, 160, 200, 250, 300, 350]}
        self.assertEqual(host.take_survey_bound(shelf), 2.5)
        a = host.take_survey_advice(shelf)
        self.assertIn("keep TAKE_US = 0", a)
        self.assertIn("up to 2.5 ms", a)
        self.assertIn("up to 1.5 ms", host.take_survey_advice(dict(shelf, rms_ppm=[100, 103] + [150] * 7)))
        # a share over the margin is told TAKE_US = 0 too, and carries the bound
        flat = dict(shelf, least_ms10=30, refined_ms10=26, rms_ppm=[100, 99, 95, 90, 101, 120, 150, 180, 200])
        self.assertIn("up to 5 ms", host.take_survey_advice(flat))
        # every candidate within the tolerance: the balls bound nothing, and the line says nothing more
        self.assertIsNone(host.take_survey_bound(dict(shelf, rms_ppm=[100] * 9)))
        self.assertNotIn("up to", host.take_survey_advice(dict(shelf, rms_ppm=[100] * 9)))
        # older frames read on their own grid (eight: 0, 2-8 ms)
        self.assertEqual(host.take_survey_bound(dict(shelf, rms_ppm=[100, 101, 130, 140, 150, 160, 170, 180])), 3.0)
        # a pick the Pi acts on is not given a bound
        self.assertNotIn("up to", host.take_survey_advice(dict(shelf, least_ms10=40, refined_ms10=40,
                                                               rms_ppm=[100, 90, 80, 50, 30, 60, 90, 120, 150])))
        # a ppm floor (2026-11-19, README "A ppm floor on the bound"): at a 16 ppm step, 17 (at 2.5 ms) is 6% over but one ppm
        # of the frame's rounding, so the bound moves on to the first candidate at least 2 ppm over
        low = dict(shelf, rms_ppm=[16, 16, 17, 19, 21, 25, 30, 35, 40])
        self.assertEqual(host.take_survey_bound(low), 3.0)
        self.assertIn("up to 3 ms", host.take_survey_advice(low))
        import take_shelf_bound
        for rms in ([100, 100, 112, 128, 160, 200, 250, 300, 350], [100, 103] + [150] * 7, [100] * 9,
                    [16, 16, 17, 19, 21, 25, 30, 35, 40]):
            self.assertEqual(host.take_survey_bound(dict(shelf, rms_ppm=rms)),
                             take_shelf_bound.bound_ms(rms, host.TAKE_SURVEY_MS))

    def test_bound_floor_lifted_by_straddle_vote(self):
        # 2026-11-19, README "The straddle vote in the take bound": with TAKE_BOUND_STRADDLE, a frame whose 1.5 ms vote has
        # a straddling wheel and does not lead names the 2% bar's bound (2.5 ms here, not the floor's 3 ms); no straddling
        # wheel, a leading vote or an older frame keeps the floor
        low = {"wheels": 22, "least_ms10": 0, "refined_ms10": 0, "board_ms10": 0,
               "rms_ppm": [16, 16, 17, 19, 21, 25, 30, 35, 40]}
        saved = host.TAKE_BOUND_STRADDLE
        try:
            host.TAKE_BOUND_STRADDLE = True
            self.assertEqual(host.take_survey_bound(dict(low, straddle_for=0, straddle_against=1)), 2.5)
            self.assertEqual(host.take_survey_bound(dict(low, straddle_for=1, straddle_against=1)), 2.5)
            self.assertEqual(host.take_survey_bound(dict(low, straddle_for=0, straddle_against=0)), 3.0)
            self.assertEqual(host.take_survey_bound(dict(low, straddle_for=2, straddle_against=1)), 3.0)
            self.assertEqual(host.take_survey_bound(low), 3.0)
            host.TAKE_BOUND_STRADDLE = False
            self.assertEqual(host.take_survey_bound(dict(low, straddle_for=0, straddle_against=1)), 3.0)
        finally:
            host.TAKE_BOUND_STRADDLE = saved

    def test_verdict_needs_two_summed_wheels(self):
        # 2026-11-18, README "The take survey's verdict needs two informative wheels": with the minimum at 2, 24 wheels
        # surveyed but one summed (the rest take-blind) is held back; two are enough; older firmware (no count) is not.
        sv = {"wheels": 24, "least_ms10": 60, "refined_ms10": 57, "board_ms10": 0,
              "rms_ppm": [136, 140, 119, 98, 95, 50, 112]}
        self.assertEqual(host.TAKE_SURVEY_MIN_KEPT, 0)               # shipped off: failed held out (prediction (a))
        self.assertIn("set TAKE_US = 5500", host.take_survey_advice(dict(sv, kept=1)))
        saved = host.TAKE_SURVEY_MIN_KEPT
        host.TAKE_SURVEY_MIN_KEPT = 2                                # the pre-registered value, opt-in
        try:
            one = host.take_survey_advice(dict(sv, kept=1))
            self.assertIn("only 1 told the contact times apart", one)
            self.assertNotIn("set TAKE_US =", one)
            self.assertIn("set TAKE_US = 5500", host.take_survey_advice(dict(sv, kept=2)))
            self.assertIn("set TAKE_US = 5500", host.take_survey_advice(dict(sv, kept=None)))
        finally:
            host.TAKE_SURVEY_MIN_KEPT = saved

    def _older_link(self, fmt, *vals):
        body = struct.pack(fmt, *vals)
        b = bytes([P.TAKE_SURVEY, len(body)]) + body
        frame = bytes([P.SYNC]) + b + bytes([P.crc8(b)])

        class Port:
            def __init__(self):
                self.data = frame

            def read(self):
                d, self.data = self.data, b""
                return d

            def write(self, _):
                pass
        link = host.FeederLink(Port(), lambda: 0.0)
        link.poll()
        return link

    def test_seven_candidate_frame_still_reads(self):
        # firmware from 2026-11-18 to 2026-11-19 sends seven candidates (no 7 ms) and the summed-wheel byte
        link = self._older_link(P.OLDER_FORMATS[P.TAKE_SURVEY][4], 24, 60, 57, 0, 136, 140, 119, 98, 95, 50, 112, 9)
        self.assertEqual(link.take_survey["kept"], 9)
        self.assertEqual(link.take_survey["rms_ppm"], [136, 140, 119, 98, 95, 50, 112])
        self.assertIn("set TAKE_US = 5500", host.take_survey_advice(link.take_survey))

    def test_eight_candidate_frame_still_reads(self):
        # firmware on 2026-11-19 before the short-take grid sends eight candidates (0, 2-8 ms) and the summed-wheel byte
        link = self._older_link(P.OLDER_FORMATS[P.TAKE_SURVEY][3], 24, 70, 68, 0, 136, 140, 119, 98, 95, 70, 50, 112, 9)
        self.assertEqual(link.take_survey["kept"], 9)
        self.assertEqual(link.take_survey["rms_ppm"], [136, 140, 119, 98, 95, 70, 50, 112])
        self.assertIn("set TAKE_US = 7000", host.take_survey_advice(link.take_survey))

    def test_nine_candidate_frame_reads(self):
        # the short-take grid (2026-11-19, README "Short takes on a second held-out set"): 0, 1.5, 2.5, 3-8 ms, in whole
        # ppm before the tenths frame
        link = self._older_link(P.OLDER_FORMATS[P.TAKE_SURVEY][2], 24, 15, 14, 0, 136, 60, 119, 125, 128, 130, 135, 140,
                                150, 9)
        self.assertEqual(link.take_survey["kept"], 9)
        self.assertEqual(link.take_survey["rms_ppm"][:2], [136, 60])
        self.assertEqual(link.take_survey["rms_step_ppm"], 1)
        self.assertIn("set TAKE_US = 1500", host.take_survey_advice(link.take_survey))

    def test_tenths_frame_reads(self):
        # 2026-11-19, README "The take survey's rms in tenths of a ppm": a last byte gives the units per ppm (firmware
        # from then until the straddle vote, which sends two more bytes)
        frame = P.encode(P.TAKE_SURVEY, 24, 15, 14, 0, 1360, 600, 1190, 1250, 1280, 1300, 1350, 1400, 65535, 9, 10, 0, 0, 0, 0)
        self.assertEqual(len(frame), 4 + 1 + 2 * 3 + 2 * 9 + 6)
        link = self._older_link(P.OLDER_FORMATS[P.TAKE_SURVEY][1], 24, 15, 14, 0, 1361, 604, 1190, 1250, 1280, 1300, 1350, 1400,
                                65535, 9, 10)
        sv = link.take_survey
        self.assertEqual((sv["kept"], sv["rms_step_ppm"]), (9, 0.1))
        self.assertEqual(sv["rms_ppm"][:2], [136.1, 60.4])
        self.assertIsNone(sv["rms_ppm"][-1])                         # 65535 still means none
        self.assertIn("set TAKE_US = 1500", host.take_survey_advice(sv))
        self.assertIsNone(sv["straddle_for"])                        # no vote before the straddle frame
        whole = self._older_link(P.FORMATS[P.TAKE_SURVEY], 24, 15, 14, 0, 136, 60, 119, 125, 128, 130, 135, 140, 150, 9, 1,
                                 0, 0, 0, 0)
        self.assertEqual((whole.take_survey["rms_ppm"][:2], whole.take_survey["rms_step_ppm"]), ([136, 60], 1))

    def test_tenths_lift_the_rounding_guard(self):
        # the traced sub-8 build (README "The sub-8 advised instant build was the frame's rounding"): 4 / 7 whole ppm
        # sits inside the margin but the frame cannot tell it from 0.6, so the guard withholds it; in tenths the same
        # fits read 4.4 / 6.9 (0.638) and are judged on their share, and a true 3.9 / 7.1 (0.549) is advised
        sv = {"wheels": 24, "least_ms10": 30, "refined_ms10": 35, "board_ms10": 0, "kept": 20}
        whole = host.take_survey_advice(dict(sv, rms_ppm=[7, 6, 5, 4, 8, 9, 10, 11, 12], rms_step_ppm=1))
        self.assertIn("too close to the frame's 1 ppm", whole)
        tenths = host.take_survey_advice(dict(sv, rms_ppm=[6.9, 6.0, 5.1, 4.4, 8, 9, 10, 11, 12], rms_step_ppm=0.1))
        self.assertIn("miss only", tenths)
        good = host.take_survey_advice(dict(sv, rms_ppm=[7.1, 6.0, 5.1, 3.9, 8, 9, 10, 11, 12], rms_step_ppm=0.1))
        self.assertIn("set TAKE_US = 3500", good)
        self.assertAlmostEqual(host.take_share_bound([7.1, 3.9], 0.1), 3.95 / 7.05)

    def test_straddle_frame_reads_and_votes(self):
        # 2026-11-19, README "Straddling wheels vote on the short takes": the sums read instant (1.5 ms within 2% of
        # the step) but the straddling wheels vote 1.5 ms by 4 to 1
        rms = (604, 600, 1190, 1250, 1280, 1300, 1350, 1400, 1450)
        link = self._older_link(P.OLDER_FORMATS[P.TAKE_SURVEY][0], 24, 0, 0, 0, *rms, 9, 10, 4, 1)
        sv = link.take_survey
        self.assertIsNone(sv["straddle_long_for"])                   # firmware before the 2.5 ms vote
        self.assertEqual((sv["straddle_for"], sv["straddle_against"]), (4, 1))
        self.assertIn("set TAKE_US = 1500", host.take_survey_advice(sv))
        self.assertIn("4 fit 1.5 ms better", host.take_survey_advice(sv))
        self.assertIn("keep TAKE_US = 0", host.take_survey_advice_sums(sv))
        self.assertIn("keep TAKE_US = 0", host.take_survey_advice(dict(sv, straddle_for=2)))   # 2 - 1 under the margin
        self.assertIn("already matches", host.take_survey_advice(dict(sv, board_ms10=15)))
        saved = host.TAKE_STRADDLE_MARGIN
        host.TAKE_STRADDLE_MARGIN = 0                                  # off: the sums' line
        try:
            self.assertIn("keep TAKE_US = 0", host.take_survey_advice(sv))
        finally:
            host.TAKE_STRADDLE_MARGIN = saved
        # a spread pick is never overridden
        self.assertIn("set TAKE_US = 5500", host.take_survey_advice(
            {"wheels": 24, "least_ms10": 60, "refined_ms10": 57, "board_ms10": 0,
             "rms_ppm": [136, 140, 119, 98, 95, 50, 112], "straddle_for": 9, "straddle_against": 0}))

    def test_long_straddle_vote_reads_and_leads(self):
        # 2026-11-19, README "A second straddle vote at 2.5 ms": the frame's last two bytes; the 2.5 ms vote is read
        # before the 1.5 ms one, and either needs its own margin
        rms = (604, 600, 1190, 1250, 1280, 1300, 1350, 1400, 1450)
        link = self._older_link(P.FORMATS[P.TAKE_SURVEY], 24, 0, 0, 0, *rms, 9, 10, 0, 0, 3, 1)
        sv = link.take_survey
        self.assertEqual((sv["straddle_long_for"], sv["straddle_long_against"]), (3, 1))
        self.assertIn("set TAKE_US = 2500", host.take_survey_advice(sv))
        self.assertIn("3 fit 2.5 ms better", host.take_survey_advice(sv))
        self.assertIn("set TAKE_US = 2500", host.take_survey_advice(dict(sv, straddle_for=4, straddle_against=0)))
        self.assertIn("set TAKE_US = 1500", host.take_survey_advice(dict(sv, straddle_for=4, straddle_long_for=2)))
        self.assertIn("keep TAKE_US = 0", host.take_survey_advice(dict(sv, straddle_long_for=2)))   # 2 - 1
        self.assertIn("already matches", host.take_survey_advice(dict(sv, board_ms10=25)))
        saved = host.TAKE_STRADDLE_LONG_MARGIN
        host.TAKE_STRADDLE_LONG_MARGIN = 0                             # off: the 1.5 ms vote, then the sums
        try:
            self.assertIn("keep TAKE_US = 0", host.take_survey_advice(sv))
            self.assertIn("set TAKE_US = 1500", host.take_survey_advice(dict(sv, straddle_for=4)))
        finally:
            host.TAKE_STRADDLE_LONG_MARGIN = saved

    def test_board_counts_the_long_straddle_vote(self):
        launch = controller.LaunchCheck(1e-3, 0.057, 0.05, 0.033, 0.9, 0.9, take_grid=controller.TAKE_SURVEY_GRID_US)
        ts = launch.take_survey
        self.assertEqual(ts.vote_long, controller.TAKE_SURVEY_GRID_US.index(controller.TAKE_STRADDLE_LONG_US))
        row = lambda r25: [(100e-6) ** 2, (120e-6) ** 2, (r25 * 1e-6) ** 2] + [(300e-6) ** 2] * 6   # noqa: E731
        ts.add(row(60), False, True)    # straddles at 2.5 ms, fits it better: for (1.5 ms: no straddle, no vote)
        ts.add(row(60), True, True)     # straddles at both: for at 2.5, against at 1.5 (120 > 100)
        ts.add(row(160), False, True)   # against at 2.5
        ts.add(row(60), False, False)   # no straddle: no vote
        self.assertEqual(launch.take_straddle_long(), (2, 1))
        self.assertEqual(launch.take_straddle(), (0, 1))

    def test_board_counts_the_straddle_vote(self):
        launch = controller.LaunchCheck(1e-3, 0.057, 0.05, 0.033, 0.9, 0.9, take_grid=controller.TAKE_SURVEY_GRID_US)
        ts = launch.take_survey
        self.assertEqual(ts.vote, controller.TAKE_SURVEY_GRID_US.index(controller.TAKE_STRADDLE_US))
        row = lambda r15: [(100e-6) ** 2, (r15 * 1e-6) ** 2] + [(300e-6) ** 2] * 7   # noqa: E731
        ts.add(row(60), True)           # straddles, fits 1.5 ms better: for
        ts.add(row(160), True)          # straddles, worse: against
        ts.add(row(60), False)          # better, but its take fell inside one revolution: noise, no vote
        ts.add([(100e-6) ** 2] * 9, True)   # take-blind: left out, no vote
        self.assertEqual(launch.take_straddle(), (1, 1))
        self.assertEqual((ts.kept_n, ts.blind_n), (3, 1))

    def test_fit_reports_whether_the_take_straddles(self):
        # the drop fit's last field is the traced placement's answer (tests/take_blind_trace.py) on stored wheels
        import gzip
        import take_blind_trace as tbt
        path = os.path.join(os.path.dirname(__file__), "..", "eval", "take-bound-o-2026-11-19.jsonl.gz")
        with gzip.open(path, "rt") as f:
            wheels = json.loads(f.readline())["wheels"][12:17]   # wheel 15 straddles at 1.5 ms, 12-14 and 16 do not
        traced = tbt._fit_with_t0()
        offs = controller.take_offsets(controller.TAKE_STRADDLE_US)
        seen = set()
        for w in wheels:
            res = None
            for item in traced(w["periods"], [tuple(t) for t in w["ticks"]], take=offs,
                               levels=controller.TAKE_SURVEY_LEVELS, after=controller.TAKE_SURVEY_AFTER):
                if item is not None:
                    res = item[1]
            self.assertIsNotNone(res)
            straddles = len(set(tbt.placement(res[8], res[7], offs))) > 1
            self.assertEqual(res[10], straddles)
            seen.add(straddles)
        self.assertEqual(seen, {True, False})

    def test_board_sends_tenths_and_falls_back_to_whole_ppm(self):
        launch = controller.LaunchCheck(1e-3, 0.057, 0.05, 0.033, 0.9, 0.9, take_grid=(0, 3000, 6000))
        ts = launch.take_survey
        ts.add([(4.04e-6) ** 2, (2.0e-6) ** 2, (1.0e-6) ** 2])
        r = launch.take_report()
        self.assertEqual((r[3], r[4]), ([40, 20, 10], P.TAKE_SURVEY_TENTHS))
        ts.add([(12000e-6) ** 2, (8000e-6) ** 2, (1.0e-6) ** 2])    # mean rms over 6553 ppm: tenths would clip
        r = launch.take_report()
        self.assertEqual(r[4], 1)
        self.assertTrue(all(v < 65535 for v in r[3]))

    def test_older_frame_still_reads(self):
        # firmware before 2026-11-18 sends the frame without the summed-wheel byte: it decodes, and the Pi has no count
        body = struct.pack(P.OLDER_FORMATS[P.TAKE_SURVEY][5], 24, 60, 57, 0, 136, 140, 119, 98, 95, 50, 112)
        b = bytes([P.TAKE_SURVEY, len(body)]) + body
        frame = bytes([P.SYNC]) + b + bytes([P.crc8(b)])

        class Port:
            def __init__(self):
                self.data = frame

            def read(self):
                d, self.data = self.data, b""
                return d

            def write(self, _):
                pass
        link = host.FeederLink(Port(), lambda: 0.0)
        link.poll()
        self.assertEqual(link.take_survey["kept"], None)
        self.assertEqual(link.take_survey["rms_ppm"][-1], 112)
        self.assertIn("set TAKE_US = 5500", host.take_survey_advice(link.take_survey))

    def test_board_reports_summed_wheels(self):
        rs = controller.ResidualSurvey((0, 3000, 6000), 0, controller.TAKE_SURVEY_BLIND)
        rs.add([1.0, 1.1, 1.2])                                    # take-blind: left out
        rs.add([4.0, 2.0, 1.0])                                    # tells them apart: summed
        self.assertEqual((rs.n, rs.blind_n, rs.kept_n), (2, 1, 1))

    def test_board_off_by_default_and_on_for_a_calibration_drill(self):
        import esc_survey_sweep as S
        sim = S.sim_for({}, 0.4, 0.95, 0.65)
        shots = host.plan_drill(S.load("drill.calibration.json"))[:3]
        res = host.run_drill(host.FeederLink(sim, sim.clock), shots, sim.sleep)
        self.assertTrue(res.ok, res.aborted)
        self.assertIsNone(res.take_survey)                     # not asked for: no survey, no extra board time
        sim = S.sim_for({}, 0.4, 0.95, 0.65)
        res = host.run_drill(host.FeederLink(sim, sim.clock), shots, sim.sleep, take_survey=True)
        self.assertTrue(res.ok, res.aborted)
        sv = res.take_survey
        self.assertIsNotNone(sv)
        self.assertGreaterEqual(sv["wheels"], 4)               # the Pi waits for each ball's survey before the next
        self.assertEqual(sim.hw.launch.survey_cut, 0)
        self.assertEqual(len(sv["rms_ppm"]), P.TAKE_SURVEY_TIMES)
        sim.sleep(0.05)                                        # the board reads the drill's last frame
        self.assertFalse(sim.hw.launch.take_on)                # turned off at the drill's end

    def test_take_survey_keeps_the_straddling_wheels(self):
        # 2026-11-18, README "Take-blind rows traced": take-blind wheels fit every candidate alike and well; a wheel
        # whose take straddles a revolution's edge tells them apart but fits worse at every candidate. SURVEY_TRIM's
        # 5 x the median best drops it and the pick falls to the step; the take survey sums every wheel.
        n, k = len(controller.TAKE_SURVEY_GRID_US), controller.TAKE_SURVEY_GRID_US.index(6000)
        blind = [(3e-6 + 1e-7 * i) ** 2 for i in range(n)]          # 3.0-3.8 ppm, the step least
        straddle = [(300e-6 - 40e-6 * i) ** 2 for i in range(k + 1)] + [(200e-6) ** 2] * (n - k - 1)   # 6 ms least
        for trim, pick, dropped in ((None, 0, 1), (controller.TAKE_SURVEY_TRIM, k, 0)):
            rs = controller.ResidualSurvey(controller.TAKE_SURVEY_GRID_US, trim)
            for _ in range(10):
                rs.add(blind)
            rs.add(straddle)
            self.assertEqual(rs.report(100)[1], controller.TAKE_SURVEY_GRID_US[pick] // 100)
            self.assertEqual(rs.trimmed, dropped)
        self.assertEqual(controller.TAKE_SURVEY_TRIM, 0)
        lc = controller.LaunchCheck(0.00155, 0.0577, 0.075, 0.0335, 0.85, 0.5, take_grid=controller.TAKE_SURVEY_GRID_US)
        self.assertEqual(lc.take_survey.trim, controller.TAKE_SURVEY_TRIM)

    def test_take_survey_leaves_out_take_blind_wheels(self):
        # 2026-11-18, README "The take survey skips take-blind wheels": a wheel whose candidates all fit alike adds the
        # same to every sum, so it cannot move the pick but pulls the best / step share toward 1. Leaving such wheels
        # out (TAKE_SURVEY_BLIND) keeps the pick and sharpens the share; a wheel that tells them apart stays in.
        grid = controller.TAKE_SURVEY_GRID_US
        k = grid.index(6000)
        blind = [(30e-6 * (1 + 1e-3 * i)) ** 2 for i in range(len(grid))]   # 30 ppm, every candidate within 0.8% of the step
        tells = [(60e-6 - 7e-6 * i) ** 2 for i in range(k + 1)] + [(40e-6) ** 2] * (len(grid) - k - 1)   # 6 ms at 18 ppm
        shares = {}
        for b in (0, controller.TAKE_SURVEY_BLIND):
            rs = controller.ResidualSurvey(grid, 0, b)
            for _ in range(20):
                rs.add(blind)
            for _ in range(3):
                rs.add(tells)
            n, least, _, rms = rs.report(100)
            self.assertEqual((n, least), (23, grid[k] // 100))     # every wheel counts as surveyed; the pick holds
            self.assertEqual(rs.blind_n, 20 if b else 0)
            shares[b] = min(rms) / rms[0]
        self.assertGreater(shares[0], 0.6)                          # diluted: host.TAKE_ADVISE_RATIO would not advise
        self.assertLess(shares[controller.TAKE_SURVEY_BLIND], 0.4)
        rs = controller.ResidualSurvey(grid, 0, controller.TAKE_SURVEY_BLIND)
        rs.add(blind)
        self.assertEqual(rs.report(100), (1, 0, 0, [0] * len(grid)))   # only blind wheels: the count, no verdict
        sv = {"wheels": 20, "least_ms10": 0, "refined_ms10": 0, "board_ms10": 30, "rms_ppm": [0] * len(grid)}
        self.assertIn("none told the contact times apart", host.take_survey_advice(sv))
        self.assertIn("keep TAKE_US = 3000", host.take_survey_advice(sv))
        lc = controller.LaunchCheck(0.00155, 0.0577, 0.075, 0.0335, 0.85, 0.5, take_grid=grid)
        self.assertEqual(lc.take_survey.blind, controller.TAKE_SURVEY_BLIND)

    def test_take_survey_spline_flag_picks_the_report(self):
        grid = (0, 2000, 3000, 4000, 5000, 6000, 8000)    # the seven-point grid shipped before 2026-11-19
        sums = [9.0, 6.0, 4.0, 2.5, 1.2, 1.0, 1.4]          # least at 6 ms, a shallow side toward 8
        saved = controller.TAKE_SURVEY_SPLINE
        try:
            got = {}
            for flag in (False, True):
                controller.TAKE_SURVEY_SPLINE = flag
                rs = controller.ResidualSurvey(grid, 0)
                rs.add(sums)
                got[flag] = rs.report(100)[2]
            self.assertEqual(got[False], int(round(controller.survey_pick(grid, sums)[1] / 100)))
            self.assertEqual(got[True], int(round(controller.survey_spline_pick(grid, sums)[1] / 100)))
            self.assertEqual((got[False], got[True]), (61, 57))     # the two picks differ by 0.4 ms here
        finally:
            controller.TAKE_SURVEY_SPLINE = saved

    def test_take_us_sets_the_record_fit(self):
        lc = controller.LaunchCheck(0.00155, 0.0577, 0.075, 0.0335, 0.85, 0.5, take_us=6000)
        self.assertEqual(lc.take(), controller.take_offsets(6000))
        self.assertEqual(lc.take_ms10(), 60)
        self.assertEqual(controller.LaunchCheck(0.00155, 0.0577, 0.075, 0.0335, 0.85, 0.5).take(), controller.LOOP_TAKE)

    def test_survey_kept_in_the_shot_log(self):
        res = host.DrillResult(launches=[{"seq": 1, "rpm_top": 4000, "rpm_bottom": 3000, "drop_top": 0.08,
                                          "drop_bottom": 0.09, "launched": True, "shot": 0}],
                               take_survey={"wheels": 24, "least_ms10": 60, "refined_ms10": 57, "board_ms10": 0})
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "shots.jsonl")
            self.assertIsNone(host.last_take_survey_from_log(path))
            host.append_shot_log(path, res, "drill.calibration.json")
            self.assertEqual(len(host.read_shot_log(path)), 1)
            self.assertEqual(host.last_take_survey_from_log(path)["refined_ms10"], 57)
            self.assertIsNone(host.last_survey_from_log(path))
