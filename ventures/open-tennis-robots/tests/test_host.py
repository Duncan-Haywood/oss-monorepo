"""The Pi-side drill runner against the real firmware on a simulated feeder (tests/feeder_sim.py), and the firmware
pieces it leans on: the period tachometer, the wheel speed loop and the steady-wheels gate."""

import json
import math
import os
import tempfile
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
        # the ball lift runs on for the balls still coming back, at the duty held to 24 V / the 25.6 V pack reading
        self.assertEqual(sim.hw.lift_pwm.duty, int(24000 / sim.pack_mv * 65535))
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
        sim.fob_cut = False                               # fob released: the bus returns, but nothing was queued
        sim.run_ms(2000)
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
        # 8.8% on this build; 10.3% worst, 2.2% mean over 40 random builds (firmware/esp32/README.md "Spin from fast
        # wheels", tests/spin_drill_sweep.py --random): the drops' speed-dependent bias, not yet removed
        self.assertLess(abs(fit.spin_efficiency / 0.42 - 1), 0.10)
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

    def test_launch_flags_reach_the_pi(self):
        sim = SimFeeder()
        res, _ = run(sim, drill())
        self.assertTrue(res.ok, res.aborted)
        self.assertTrue(all(r["launched"] and r["fit_top"] and r["fit_bottom"] for r in res.launches))


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
