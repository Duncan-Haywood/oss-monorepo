"""The lift's jam cutoff on the simulated feeder (2026-11-15; cad/README.md "Lift jam cutoff").

    PYTHONPATH=src python3 tests/lift_jam_sweep.py

The real firmware (main.py's FeederHw and controller.LiftRun, through tests/feeder_sim.py) drives the lift's MOSFET
and reads the comparator on GPIO 0 every 10 ms tick. Between its 1 ms steps this file integrates the plant at 0.1 ms:
the gearmotor as a DC motor at its output shaft (cad `Feeder.lift_motor_model`: winding resistance, inductance,
torque and back-EMF constants, the rotor's inertia through the gearbox plus the belt, caps and balls), the belt's
load (every flight loaded, or an empty belt), the flyback diode when the MOSFET is off, the 0.05 ohm shunt (it sees
current only while the MOSFET conducts), the 1 ms RC filter and the comparator at a trip current. With the MOSFET off, the diode also brakes the belt when its
loaded strand's weight drives the motor backwards.

A jam is a ball caught between a flight and the boot (at the drive pulley: the ball's own stiffness, from the ITF's
deformation test) or the hood (at the top pulley: the ball in series with 2.36 m of belt). Corners: the pack at the
charger's 29.2 V with a cold winding (most current and force) and at the 24 V cut with the winding 80 K over ambient
(least current: hardest to trip); the trip current at the low and high ends of its tolerance; the rotor's inertia
at half, one and two times the assumed figure. Every motor and belt figure is an assumption (cad params); the
firmware is real.

Reported: for a start with every flight loaded, whether it tripped and how long the comparator stayed on; for a jam,
the time from the ball's contact to the motor's cut, the peak force on the flight, the energy put into the winding
over the 6 s after contact and when the lift gave up (FLAG_LIFT_JAM); and the same jam with the cutoff disabled.
"""

import math
import os
import sys

HERE = os.path.dirname(__file__)
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "cad"))
from feeder_sim import SimFeeder  # noqa: E402
from otr_cad.params import Feeder  # noqa: E402
from tennisbots import protocol as P  # noqa: E402

DT = 1e-4
SUB = 10                     # plant steps per firmware millisecond
DIODE_V = 0.7
BALL_ZETA = 0.1              # a ball's damping ratio on the jam's spring (rebound about 0.75)
CORNERS = (("29.2 V cold", 29.2, 0.0), ("24 V hot", 24.0, 80.0))
INERTIAS = (0.5, 1.0, 2.0)
TRIPS = ("lo", "hi")
WHERE = ("boot", "hood")


class Plant:
    """`slip`: None for a rigid drive (the pulley keyed to the gearmotor's shaft, as before 2026-11-15), or "lo", "nom"
    or "hi" for the slip hub at the low end, middle or high end of its set torque (`Feeder.lift_slip_design`)."""

    def __init__(self, p: Feeder, volts, rise_k, j_factor=1.0, trip="lo", loaded=True, slip="nom"):
        m = p.lift_motor_model()
        c = p.lift_jam_cutoff()
        self.p, self.m = p, m
        self.v = volts
        self.r_w = m["winding_ohm"] * (1 + 0.00393 * rise_k)
        self.r = self.r_w + m["lead_ohm"] + p.lift_shunt_ohm
        self.l = m["l_h"]
        self.kt, self.ke = m["kt"], m["ke"]
        self.t_f = m["kt"] * p.lift_motor_noload_a                     # no-load loss as friction at the output
        self.j_m = p.lift_rotor_kgm2 * j_factor * p.lift_gear_ratio ** 2
        self.j_b = m["moving_kg"] * m["r_m"] ** 2
        self.j = self.j_m + self.j_b
        self.rp = m["r_m"]
        if slip is None:
            self.t_stick = self.t_slide = math.inf
        else:
            t = p.lift_slip_nm * {"lo": 1 - p.lift_slip_tol, "nom": 1.0, "hi": 1 + p.lift_slip_tol}[slip]
            self.t_stick, self.t_slide = t, t * p.lift_slip_kinetic
        self.locked = True
        self.wb = 0.0                # belt side's speed (the same as the motor side's, w, while the hub is stuck)
        self.slid_ms = 0.0
        self.slide_j = 0.0
        d = p.lift_design()
        self.t_load = (d["pull_n"] if loaded else 0.1 * d["pull_n"]) * self.rp
        self.trip_v = c["trip_lo_a" if trip == "lo" else "trip_hi_a"] * p.lift_shunt_ohm
        self.rc = p.lift_sense_rc_s
        self.i = self.w = self.s = self.vf = 0.0
        self.k = 0.0
        self.s_jam = None
        self.c_damp = 0.0
        self.force = 0.0
        self.winding_j = 0.0

    def jam(self, where):
        k_ball = self.p.ball_k_n_m
        if where == "boot":
            k = k_ball
        else:
            k_belt = self.p.lift_belt_cspec_n / (self.p.lift_design()["centre_mm"] / 1000)
            k = 1 / (1 / k_ball + 1 / k_belt)
        self.k = k
        self.c_damp = 2 * BALL_ZETA * math.sqrt(k * self.j / self.rp ** 2)
        self.s_jam = self.s

    def step(self, duty):
        on = duty > 0
        if on:
            vm = self.v * duty
            self.i = (self.i + DT / self.l * (vm - self.ke * self.w)) / (1 + DT * self.r / self.l)
        else:
            # the flyback diode across the motor: it carries the winding's current down to zero after a cut, and it
            # conducts again when the belt drives the motor backwards (the loaded strand's weight), which brakes it
            r_loop = self.r - self.p.lift_shunt_ohm
            self.i = max(0.0, (self.i + DT / self.l * (-DIODE_V - self.ke * self.w)) / (1 + DT * r_loop / self.l))
        self.winding_j += self.i * self.i * self.r_w * DT
        f = 0.0
        if self.s_jam is not None and self.s > self.s_jam:
            f = max(0.0, self.k * (self.s - self.s_jam) + self.c_damp * self.wb * self.rp)
        self.force = f
        t_m = self.kt * self.i                    # the motor's torque at the gearbox's output
        t_b = -self.t_load - f * self.rp          # what the belt side has on it besides the hub
        if self.locked:
            drive = t_m + t_b
            if abs(self.w) < 1e-3 and abs(drive) <= self.t_f:
                a = -self.w / DT
            else:
                sign = 1.0 if (self.w > 0 or (self.w == 0 and drive > 0)) else -1.0
                a = (drive - self.t_f * sign) / self.j
            t_hub = self.j_b * a - t_b            # what the hub must pass to keep the belt side with the motor
            if abs(t_hub) <= self.t_stick:
                self.w = self.wb = self.w + a * DT
            else:
                self.locked = False
                self._slide_dir = 1.0 if t_hub > 0 else -1.0
        if not self.locked:
            rel = self.w - self.wb
            d = (1.0 if rel > 0 else -1.0) if abs(rel) > 1e-9 else self._slide_dir
            t_hub = self.t_slide * d
            dm = t_m - t_hub
            if abs(self.w) < 1e-3 and abs(dm) <= self.t_f:
                self.w = 0.0
            else:
                sign = 1.0 if (self.w > 0 or (self.w == 0 and dm > 0)) else -1.0
                self.w += (dm - self.t_f * sign) / self.j_m * DT
            self.wb += (t_hub + t_b) / self.j_b * DT
            self.slid_ms += DT * 1000
            self.slide_j += abs(t_hub * (self.w - self.wb)) * DT
            if (self.w - self.wb) * d <= 0:       # the speeds met: stuck again, sharing momentum
                self.w = self.wb = (self.j_m * self.w + self.j_b * self.wb) / self.j
                self.locked = True
        self.s += self.wb * self.rp * DT
        shunt = self.i * self.p.lift_shunt_ohm * duty if on else 0.0
        self.vf += (shunt - self.vf) * DT / self.rc
        return self.vf > self.trip_v


def _sim():
    sim = SimFeeder()
    for _ in range(4):                     # the contactor's coil settles; heartbeats keep the watchdog quiet
        sim.write(P.encode(P.HEARTBEAT))
        sim.run_ms(100)
    return sim


def _run(sim, plant, ms, on_ms=None):
    """Advance `ms` milliseconds; `on_ms(t, plant, duty)` is called after each one. Returns nothing."""
    hw = sim.hw
    for t in range(ms):
        if t % 100 == 0:
            sim.write(P.encode(P.HEARTBEAT))
        duty = hw.lift_pwm.duty / 65535
        over = False
        for _ in range(SUB):
            over = plant.step(duty)
        sim.lift_over = over
        sim.run_ms(1)
        if on_ms is not None:
            on_ms(t, plant, duty)


def start(volts, rise_k, j_factor, trip, loaded=True, slip="lo"):
    """Kick the lift from rest. (tripped, ms the comparator was on, speed reached as a share of no-load); the plant's
    `slid_ms` says whether the hub slipped."""
    p = Feeder()
    sim, plant = _sim(), Plant(p, volts, rise_k, j_factor, trip, loaded, slip)
    start.plant = plant
    sim.hw.lift.kick(sim.us // 1000)
    over = [0]
    _run(sim, plant, 1500, lambda t, pl, d: over.__setitem__(0, over[0] + (1 if sim.lift_over else 0)))
    return sim.hw.lift.trips > 0 or sim.hw.lift.jammed, over[0], plant.w / plant.m["noload_rad_s"]


def jam(volts, rise_k, j_factor, trip, where, cutoff=True, after_ms=6000, slip="nom"):
    """Run 1 s, then a ball jams. Returns a dict: ms from contact to the first cut (None: never), peak force on the
    flight before that cut and over the whole run, joules in the winding after contact, ms to FLAG_LIFT_JAM."""
    p = Feeder()
    sim, plant = _sim(), Plant(p, volts, rise_k, j_factor, trip, slip=slip)
    hw = sim.hw
    if not cutoff:
        hw.lift.blank_ms = 10 ** 9
    hw.lift.kick(sim.us // 1000)
    _run(sim, plant, 1000)
    plant.jam(where)
    plant.winding_j = 0.0
    out = {"cut_ms": None, "first_peak_n": 0.0, "peak_n": 0.0, "jammed_ms": None}

    def watch(t, pl, duty):
        out["peak_n"] = max(out["peak_n"], pl.force)
        if out["cut_ms"] is None:
            out["first_peak_n"] = max(out["first_peak_n"], pl.force)
            if hw.lift_pwm.duty == 0:
                out["cut_ms"] = t
        if out["jammed_ms"] is None and hw.flags() & P.FLAG_LIFT_JAM:
            out["jammed_ms"] = t
        if t % 1000 == 0:
            hw.lift.kick(sim.us // 1000)       # balls keep being fed: each one restarts the run-on

    _run(sim, plant, after_ms, watch)
    out["winding_j"] = plant.winding_j
    out["slid_ms"], out["slide_j"] = plant.slid_ms, plant.slide_j
    return out


CASES = (("hub lo, trip hi", "lo", "hi"), ("hub hi, trip lo", "hi", "lo"), ("rigid, trip lo", None, "lo"))


def main():
    p = Feeder()
    c = p.lift_jam_cutoff()
    h = p.lift_slip_design()
    print(f"trip {c['trip_a']:.2f} A ({c['trip_lo_a']:.2f}-{c['trip_hi_a']:.2f}), blanking {p.lift_jam_blank_ms:g} ms, "
          f"plate allows {c['plate_allow_n']:.0f} N, weld {c['weld_allow_n']:.0f} N")
    print(f"slip hub {p.lift_slip_nm:g} N m set ({h['stick_lo_nm']:.2f}-{h['stick_hi_nm']:.2f} sticking, "
          f"{h['slide_lo_nm']:.2f}-{h['slide_hi_nm']:.2f} sliding; {h['slide_lo_a']:.2f} A sliding at the lowest)")
    print("\nStart, every flight loaded, hub at its lowest (1.5 s):")
    print(f"{'corner':12} {'J x':>4} {'trip':>4} {'tripped':>8} {'over ms':>8} {'speed':>6} {'slid ms':>8}")
    for name, v, rise in CORNERS:
        for jf in INERTIAS:
            for trip in TRIPS:
                tripped, over, speed = start(v, rise, jf, trip)
                print(f"{name:12} {jf:4g} {trip:>4} {str(tripped):>8} {over:8d} {speed:6.0%} {start.plant.slid_ms:8.1f}")
    print("\nJam after 1 s at speed, a ball fed every second (6 s):")
    print(f"{'where':5} {'corner':12} {'J x':>4} {'case':16} {'cut ms':>7} {'first N':>8} {'peak N':>7} {'winding J':>10} "
          f"{'hub J':>6} {'gave up ms':>10}")
    for where in WHERE:
        for name, v, rise in CORNERS:
            for jf in INERTIAS:
                for case, slip, trip in CASES:
                    r = jam(v, rise, jf, trip, where, slip=slip)
                    print(f"{where:5} {name:12} {jf:4g} {case:16} {str(r['cut_ms']):>7} {r['first_peak_n']:8.0f} "
                          f"{r['peak_n']:7.0f} {r['winding_j']:10.0f} {r['slide_j']:6.1f} {str(r['jammed_ms']):>10}")
    print("\nThe same jam with no cutoff, hub at its set torque (6 s; the run-on is 16 s and restarts with every ball):")
    for where in WHERE:
        for name, v, rise in CORNERS:
            r = jam(v, rise, 1.0, "lo", where, cutoff=False)
            print(f"{where:5} {name:12} peak {r['peak_n']:5.0f} N, winding {r['winding_j']:5.0f} J, "
                  f"hub {r['slide_j']:5.0f} J")


if __name__ == "__main__":
    main()
