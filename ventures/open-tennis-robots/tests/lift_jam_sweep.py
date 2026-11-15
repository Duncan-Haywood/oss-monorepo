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

Since 2026-11-15 (cad/README.md "Lift coupling dynamics") the drive is three inertias by default: the rotor through
the gearbox, then the jaw coupling as a spring with free play (`Feeder.lift_coupler_model`: stiffness, gap, the
spider's damping), then the drive shaft with its coupling hub, plates and collars, then the slip hub, then the pulley
and belt. The mechanics step at 12.5 us there, since the light shaft against the coupling rings near 1 kHz. A loaded
belt at rest sits on the coupling's drive face; an empty one is put on the far face, so a start crosses the whole gap.
The firmware's soft start (config LIFT_RAMP_MS) is on; `_ramped(0)` switches it off. `coupler=None` gives the
two-inertia plant as first landed, and `slip=None` with it the rigid drive before the slip hub.

Reported: for a start with every flight loaded, whether it tripped and how long the comparator stayed on; for a jam,
the time from the ball's contact to the motor's cut, the peak force on the flight, the energy put into the winding
over the 6 s after contact and when the lift gave up (FLAG_LIFT_JAM); and the same jam with the cutoff disabled. Over
the coupling's stiffness and play: the largest torque through it and whether a start slipped the hub, switched and
soft-started, loaded and empty; and the jam's peak and the coupling's torque.
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
MECH_SUB = 8                 # mechanical sub-steps per plant step with the jaw coupling in (12.5 us)
DIODE_V = 0.7
BALL_ZETA = 0.1              # a ball's damping ratio on the jam's spring (rebound about 0.75)
CORNERS = (("29.2 V cold", 29.2, 0.0), ("24 V hot", 24.0, 80.0))
INERTIAS = (0.5, 1.0, 2.0)
TRIPS = ("lo", "hi")
WHERE = ("boot", "hood")


class Plant:
    """`slip`: None for a rigid drive (the pulley keyed to the gearmotor's shaft, as before 2026-11-15), or "lo", "nom"
    or "hi" for the slip hub at the low end, middle or high end of its set torque (`Feeder.lift_slip_design`)."""

    def __init__(self, p: Feeder, volts, rise_k, j_factor=1.0, trip="lo", loaded=True, slip="nom", coupler="nom"):
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
        # The jaw coupling (2026-11-15, `Feeder.lift_coupler_model`): None keeps the rotor keyed straight to the shaft
        # (the two-inertia plant as first landed); "nom" takes the assumed stiffness and backlash; (k N m/rad, gap
        # degrees) sets them. With a coupling the shaft's own inertia sits between it and the hub, and the plant's
        # mechanics step at DT / MECH_SUB, since the shaft against the coupling alone rings at about 0.6-1.3 kHz.
        self.coupled = coupler is not None
        self.coupler_nm = 0.0          # largest torque through the coupling
        self.reversals = 0             # the jaws leaving one face and striking the other (the spider hammered)
        self.free_ms = 0.0             # time with the jaws inside the gap, touching neither face
        if self.coupled:
            cm = p.lift_coupler_model()
            k, gap = (cm["k_nm_rad"], cm["backlash_rad"]) if coupler == "nom" else (coupler[0], math.radians(coupler[1]))
            self.kc, self.half_gap = k, gap / 2
            self.j_s = cm["j_shaft"]
            j_load = self.j_s + self.j_b
            self.cc = 2 * cm["zeta"] * math.sqrt(k * self.j_m * j_load / (self.j_m + j_load))
            # twist, rotor less shaft. A loaded belt at rest has rolled back onto the drive face (its weight holds the
            # shaft against the rotor); an empty one may rest anywhere, worst on the far face, so a start crosses the gap.
            self.phi = self.half_gap if loaded else -self.half_gap
            self.ws = 0.0
            self._face = 1 if loaded else -1      # the face the jaws last touched

    def coupler_torque(self):
        """Torque the coupling passes from the rotor to the shaft: the spider's spring past the gap, its damping only
        while the jaws touch, and never pulling a face it is leaving."""
        g = self.half_gap
        if self.phi > g:
            return max(0.0, self.kc * (self.phi - g) + self.cc * (self.w - self.ws))
        if self.phi < -g:
            return min(0.0, self.kc * (self.phi + g) + self.cc * (self.w - self.ws))
        return 0.0

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
        if self.coupled:
            self._step_coupled(t_m)
        elif self.locked:
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
        if not self.coupled and not self.locked:
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
        if not self.coupled:
            self.s += self.wb * self.rp * DT
        shunt = self.i * self.p.lift_shunt_ohm * duty if on else 0.0
        self.vf += (shunt - self.vf) * DT / self.rc
        return self.vf > self.trip_v


    def _step_coupled(self, t_m):
        """One DT of the three-inertia drive: rotor (j_m) - coupling - shaft (j_s) - slip hub - belt side (j_b).
        Semi-implicit Euler at DT / MECH_SUB: speeds from the torques, then the twist and the belt from the new speeds.
        The ball's force is recomputed every sub-step from the belt's travel."""
        h = DT / MECH_SUB
        for _ in range(MECH_SUB):
            f = 0.0
            if self.s_jam is not None and self.s > self.s_jam:
                f = max(0.0, self.k * (self.s - self.s_jam) + self.c_damp * self.wb * self.rp)
            self.force = max(self.force, f)
            t_b = -self.t_load - f * self.rp
            tc = self.coupler_torque()
            self.coupler_nm = max(self.coupler_nm, abs(tc))
            dm = t_m - tc
            if abs(self.w) < 1e-3 and abs(dm) <= self.t_f:
                self.w = 0.0
            else:
                sign = 1.0 if (self.w > 0 or (self.w == 0 and dm > 0)) else -1.0
                self.w += (dm - self.t_f * sign) / self.j_m * h
            if self.locked:
                a = (tc + t_b) / (self.j_s + self.j_b)
                t_hub = self.j_b * a - t_b
                if abs(t_hub) <= self.t_stick:
                    self.ws = self.wb = self.ws + a * h
                else:
                    self.locked = False
                    self._slide_dir = 1.0 if t_hub > 0 else -1.0
            if not self.locked:
                rel = self.ws - self.wb
                d = (1.0 if rel > 0 else -1.0) if abs(rel) > 1e-9 else self._slide_dir
                t_hub = self.t_slide * d
                self.ws += (tc - t_hub) / self.j_s * h
                self.wb += (t_hub + t_b) / self.j_b * h
                self.slid_ms += h * 1000
                self.slide_j += abs(t_hub * (self.ws - self.wb)) * h
                if (self.ws - self.wb) * d <= 0:
                    self.ws = self.wb = (self.j_s * self.ws + self.j_b * self.wb) / (self.j_s + self.j_b)
                    self.locked = True
            self.phi += (self.w - self.ws) * h
            self.s += self.wb * self.rp * h
            face = 1 if self.phi > self.half_gap else (-1 if self.phi < -self.half_gap else 0)
            if face == 0:
                self.free_ms += h * 1000
            else:
                if self._face not in (0, face):
                    self.reversals += 1
                self._face = face


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


def start(volts, rise_k, j_factor, trip, loaded=True, slip="lo", coupler="nom"):
    """Kick the lift from rest. (tripped, ms the comparator was on, speed reached as a share of no-load); the plant's
    `slid_ms` says whether the hub slipped."""
    p = Feeder()
    sim, plant = _sim(), Plant(p, volts, rise_k, j_factor, trip, loaded, slip, coupler)
    start.plant = plant
    sim.hw.lift.kick(sim.us // 1000)
    over = [0]
    _run(sim, plant, 1500, lambda t, pl, d: over.__setitem__(0, over[0] + (1 if sim.lift_over else 0)))
    return sim.hw.lift.trips > 0 or sim.hw.lift.jammed, over[0], plant.w / plant.m["noload_rad_s"]


def jam(volts, rise_k, j_factor, trip, where, cutoff=True, after_ms=6000, slip="nom", coupler="nom"):
    """Run 1 s, then a ball jams. Returns a dict: ms from contact to the first cut (None: never), peak force on the
    flight before that cut and over the whole run, joules in the winding after contact, ms to FLAG_LIFT_JAM."""
    p = Feeder()
    sim, plant = _sim(), Plant(p, volts, rise_k, j_factor, trip, slip=slip, coupler=coupler)
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
    out["coupler_nm"], out["reversals"] = plant.coupler_nm, plant.reversals
    return out


CASES = (("hub lo, trip hi", "lo", "hi"), ("hub hi, trip lo", "hi", "lo"), ("rigid, trip lo", None, "lo"))
LOADS = (("loaded", True), ("empty", False))


def _ramped(ramp_ms):
    """Run `start` and `jam` with the firmware's soft start set to `ramp_ms` (config LIFT_RAMP_MS is the default)."""
    def mk():
        sim = _sim0()
        sim.hw.lift.ramp_ms = ramp_ms
        return sim
    return mk


_sim0 = _sim


def coupler_starts(ramp_ms, loaded):
    """Every start corner (pack, rotor 0.5-2x) at each coupling stiffness and gap, hub at its lowest, trip at its
    lowest. Returns {(k, gap): (largest coupling torque, starts that slipped the hub, longest ms over the trip,
    any tripped)}."""
    global _sim
    p = Feeder()
    _sim = _ramped(ramp_ms)
    out = {}
    try:
        for k in p.lift_coupler_k_sweep:
            for gap in p.lift_coupler_backlash_sweep:
                worst = slips = over_ms = 0
                tripped = False
                for _, v, rise in CORNERS:
                    for jf in INERTIAS:
                        t, over, _ = start(v, rise, jf, "lo", loaded=loaded, slip="lo", coupler=(k, gap))
                        worst = max(worst, start.plant.coupler_nm)
                        slips += start.plant.slid_ms > 0
                        over_ms = max(over_ms, over)
                        tripped = tripped or t
                out[(k, gap)] = (worst, slips, over_ms, tripped)
    finally:
        _sim = _sim0
    return out


def coupler_jams(case):
    """A jam at the assumed rotor over every pack corner, boot and hood, at each coupling stiffness and gap.
    Returns {(k, gap): (peak N on a flight, largest coupling torque, slowest cut ms, latest give-up ms)}."""
    p = Feeder()
    _, slip, trip = case
    out = {}
    for k in p.lift_coupler_k_sweep:
        for gap in p.lift_coupler_backlash_sweep:
            peak = tq = cut = gave = 0
            for where in WHERE:
                for _, v, rise in CORNERS:
                    r = jam(v, rise, 1.0, trip, where, slip=slip, coupler=(k, gap))
                    peak, tq = max(peak, r["peak_n"]), max(tq, r["coupler_nm"])
                    cut = max(cut, r["cut_ms"] if r["cut_ms"] is not None else math.inf)
                    gave = max(gave, r["jammed_ms"] if r["jammed_ms"] is not None else math.inf)
            out[(k, gap)] = (peak, tq, cut, gave)
    return out


def main():
    p = Feeder()
    c = p.lift_jam_cutoff()
    h = p.lift_slip_design()
    cm = p.lift_coupler_model()
    print(f"trip {c['trip_a']:.2f} A ({c['trip_lo_a']:.2f}-{c['trip_hi_a']:.2f}), blanking {p.lift_jam_blank_ms:g} ms, "
          f"soft start {p.lift_ramp_ms:g} ms, plate allows {c['plate_allow_n']:.0f} N, weld {c['weld_allow_n']:.0f} N")
    print(f"slip hub {p.lift_slip_nm:g} N m set ({h['stick_lo_nm']:.2f}-{h['stick_hi_nm']:.2f} sticking, "
          f"{h['slide_lo_nm']:.2f}-{h['slide_hi_nm']:.2f} sliding; {h['slide_lo_a']:.2f} A sliding at the lowest)")
    print(f"jaw coupling {cm['k_nm_rad']:g} N m/rad, {p.lift_coupler_backlash_deg:g} deg play, zeta {cm['zeta']:g} "
          f"(swept {p.lift_coupler_k_sweep} N m/rad, {p.lift_coupler_backlash_sweep} deg); inertias: rotor "
          f"{cm['j_motor']:.2e}, shaft side {cm['j_shaft']:.2e}, belt side {cm['j_belt']:.2e} kg m^2; modes "
          f"{cm['f_stuck_hz']:.0f} Hz hub stuck, {cm['f_sliding_hz']:.0f} Hz sliding; rated {p.lift_coupler_nm:g} N m")
    print("\nStart, every flight loaded, hub at its lowest, nominal coupling (1.5 s):")
    print(f"{'corner':12} {'J x':>4} {'trip':>4} {'tripped':>8} {'over ms':>8} {'speed':>6} {'slid ms':>8} {'coupler':>8}")
    for name, v, rise in CORNERS:
        for jf in INERTIAS:
            for trip in TRIPS:
                tripped, over, speed = start(v, rise, jf, trip)
                print(f"{name:12} {jf:4g} {trip:>4} {str(tripped):>8} {over:8d} {speed:6.0%} {start.plant.slid_ms:8.1f} "
                      f"{start.plant.coupler_nm:8.2f}")
    print(f"\nStarts over the coupling's stiffness and play (2 packs x 3 rotors each; hub {h['stick_lo_nm']:.2f} N m, "
          f"its lowest): largest coupling torque, starts that slipped the hub of 6, longest ms over the trip")
    for ramp in (0, p.lift_ramp_ms):
        for label, loaded in LOADS:
            res = coupler_starts(ramp, loaded)
            print(f"  {'switched' if ramp == 0 else f'{ramp:g} ms soft start'}, {label} belt:")
            for (k, gap), (tq, slips, over, tripped) in res.items():
                print(f"    {k:4g} N m/rad {gap:3g} deg  {tq:5.2f} N m ({tq / h['stick_lo_nm']:4.0%} of the hub)  "
                      f"slipped {slips}  over {over:3d} ms{'  TRIPPED' if tripped else ''}")
    print("\nJam after 1 s at speed, a ball fed every second, nominal coupling (6 s):")
    print(f"{'where':5} {'corner':12} {'J x':>4} {'case':16} {'cut ms':>7} {'first N':>8} {'peak N':>7} {'winding J':>10} "
          f"{'hub J':>6} {'coupler':>8} {'gave up ms':>10}")
    for where in WHERE:
        for name, v, rise in CORNERS:
            for jf in INERTIAS:
                for case, slip, trip in CASES:
                    r = jam(v, rise, jf, trip, where, slip=slip, coupler=None if slip is None else "nom")
                    print(f"{where:5} {name:12} {jf:4g} {case:16} {str(r['cut_ms']):>7} {r['first_peak_n']:8.0f} "
                          f"{r['peak_n']:7.0f} {r['winding_j']:10.0f} {r['slide_j']:6.1f} {r['coupler_nm']:8.2f} "
                          f"{str(r['jammed_ms']):>10}")
    print("\nJams over the coupling's stiffness and play (rotor 1x; both packs, boot and hood): peak N on a flight, "
          "largest coupling torque, slowest cut, latest give-up")
    for case in CASES[:2]:
        print(f"  {case[0]}:")
        for (k, gap), (peak, tq, cut, gave) in coupler_jams(case).items():
            print(f"    {k:4g} N m/rad {gap:3g} deg  peak {peak:4.0f} N  coupler {tq:4.2f} N m  cut by {cut:4g} ms  "
                  f"gave up by {gave:5g} ms")
    print("\nThe same jam with no cutoff, hub at its set torque, nominal coupling (6 s; the run-on is 16 s and restarts "
          "with every ball):")
    for where in WHERE:
        for name, v, rise in CORNERS:
            r = jam(v, rise, 1.0, "lo", where, cutoff=False)
            print(f"{where:5} {name:12} peak {r['peak_n']:5.0f} N, winding {r['winding_j']:5.0f} J, "
                  f"hub {r['slide_j']:5.0f} J, coupler {r['coupler_nm']:4.2f} N m")


if __name__ == "__main__":
    main()
