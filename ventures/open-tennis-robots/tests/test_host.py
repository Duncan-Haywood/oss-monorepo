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
        self.assertEqual(sim.hw.lift_pwm.duty, 65535)    # the ball lift runs on for the balls still coming back
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
        self._beat(sim, 200)
        self.assertEqual(hw.lift_pwm.duty, 65535)    # blanked
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
        self.assertEqual(hw.lift_pwm.duty, 65535)    # runs again

    def test_drill_carries_on_and_warns_once(self):
        sim = SimFeeder()
        sim.hw.lift.jammed = True
        logs = []
        res, _ = run(sim, drill(), log=logs.append)
        self.assertTrue(res.ok, res.aborted)
        self.assertEqual(len(res.shots), 4)
        self.assertEqual(len(res.warnings), 1)
        self.assertEqual(sum("lift jammed" in line for line in logs), 1)

    def test_starts_never_trip_and_jams_are_cut(self):
        import lift_jam_sweep as sweep
        for name, v, rise in sweep.CORNERS:
            tripped, over_ms, speed = sweep.start(v, rise, 2.0, "lo")    # the slowest start against the lowest trip
            self.assertFalse(tripped, name)
            self.assertLess(over_ms, _feeder().lift_jam_blank_ms / 2, name)
            for where in sweep.WHERE:
                r = sweep.jam(v, rise, 1.0, "hi", where)                  # the highest trip
                self.assertIsNotNone(r["cut_ms"], (name, where))
                self.assertLess(r["cut_ms"], 100, (name, where))
                self.assertIsNotNone(r["jammed_ms"], (name, where))
                self.assertLess(r["jammed_ms"], 3000, (name, where))
                off = sweep.jam(v, rise, 1.0, "hi", where, cutoff=False)
                self.assertLess(r["winding_j"], off["winding_j"] / 10, (name, where))
                self.assertLess(r["peak_n"], _feeder().lift_jam_cutoff()["weld_allow_n"], (name, where))
