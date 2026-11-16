"""The lift's current-sense amplifier against the 20 kHz PWM, switched cycle by cycle (2026-11-16; cad/README.md
"Sense amplifier against the PWM ripple").

    python3 tests/lift_sense_ripple_sweep.py            # everything (about a minute)
    python3 tests/lift_sense_ripple_sweep.py --quick    # the default design only

`tests/lift_jam_sweep.py` steps its plant at 0.1 ms and feeds the RC filter the motor's mean current: it averages the
PWM away and treats the INA186-class amplifier as an ideal gain. This file checks that shortcut. It steps at 0.25 us
and switches the MOSFET at `lift_pwm_hz`: while on, the pack less the back-EMF and the loop's I x R drives the
winding's inductance; while off, the flyback diode (0.7 V) freewheels it, with the high-side shunt inside that loop
in both states. The amplifier is a single pole at `lift_sense_bw_hz`, limited to `lift_sense_slew_v_us` and held
between 0 V and its rail less `lift_sense_headroom_v`; then the 1 ms RC and the comparator at the nominal reference.

The mechanics are frozen over each window: the mechanical time constant (41 ms, cad `lift_motor_model`) is about 800
PWM periods, so the back-EMF is set to give the mean current wanted. Reported for each steady case: the switched
current's peak to peak against `Feeder.lift_sense_ripple`'s formula; the ripple left at the comparator, switched and
analytic; that ripple in mA of motor current ("band": the mean currents near the reference over which the
comparator's state depends on the PWM phase); the mean the comparator sees less the ideal gain x R x mean current, in mA of motor current (what the
averaged plant leaves out); and how often the comparator toggles in a 5 ms window with the mean trimmed onto the reference (it toggles twice a period
when the mean sits inside the band, and not at all when the trim leaves it just outside, so 201 or 0-1).
Then a stall from the held duty's running current with the back-EMF dropped to zero at once (the fastest the
current can rise, set by L alone; a real jam is slower): the time for the comparator to cross the reference with the
switched current and the modelled amplifier, against the averaged current and an ideal amplifier (the sweep plant's
view), and against the switched current with an ideal amplifier.

Every motor figure is the assumed one in cad params (inductance swept 0.5 to 4 mH); the amplifier's figures are TI
SBOS318B's as quoted in params; the "slow amplifier" row is a hypothetical part at a tenth of them, to show where
the shortcut would stop holding.
"""

import math
import os
import sys

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "cad"))
from otr_cad.params import Feeder  # noqa: E402

DT = 0.25e-6
DIODE_V = 0.7


class Path:
    """Shunt, amplifier, RC and comparator, stepped at DT. `ideal`: an amplifier with no pole, slew or rail."""

    def __init__(self, p: Feeder, ideal=False, v0=0.0):
        c = p.lift_jam_cutoff()
        self.g = c["sense_v_per_a"]
        self.vref = c["trip_a"] * self.g
        self.wbw = 2 * math.pi * p.lift_sense_bw_hz
        self.slew = p.lift_sense_slew_v_us * 1e6 * DT
        self.rail = 3.3 * (1 - p.lift_rail_tol) - p.lift_sense_headroom_v
        self.rc = p.lift_sense_rc_s
        self.ideal = ideal
        self.va = self.vf = v0
        self.out = self.vf > self.vref

    def step(self, i):
        target = self.g * i
        if self.ideal:
            self.va = target
        else:
            dv = (target - self.va) * self.wbw * DT
            self.va = min(self.rail, max(0.0, self.va + max(-self.slew, min(self.slew, dv))))
        self.vf += (self.va - self.vf) * DT / self.rc
        return self.vf > self.vref


class Winding:
    """The lift motor's electrical loop under PWM with a frozen back-EMF (high-side shunt in both states)."""

    def __init__(self, p: Feeder, volts, duty, amps, switched=True):
        m = p.lift_motor_model()
        self.l = m["l_h"]
        self.r = m["winding_ohm"] + m["lead_ohm"] + p.lift_shunt_ohm
        self.v, self.d, self.switched = volts, duty, switched
        self.period = 1.0 / p.lift_pwm_hz
        # mean volts across the motor balance its back-EMF plus I x R (continuous conduction)
        self.e = duty * volts - (1 - duty) * DIODE_V - amps * self.r
        self.i = amps
        self.t = 0.0

    def step(self):
        if self.switched:
            on = (self.t % self.period) < self.d * self.period
            vm = self.v if on else -DIODE_V
        else:
            vm = self.d * self.v - (1 - self.d) * DIODE_V
        self.i = max(0.0, (self.i + DT / self.l * (vm - self.e)) / (1 + DT * self.r / self.l))
        self.t += DT
        return self.i


def steady(p, volts, duty, amps, settle_ms=20.0, window_ms=5.0):
    w = Winding(p, volts, duty, amps)
    n_settle, n_win = int(settle_ms * 1e-3 / DT), int(window_ms * 1e-3 / DT)
    # the continuous-conduction balance leaves the switched mean a few tens of mA off: trim the back-EMF once so the
    # mean sits on `amps` (with the mean at the reference, any chatter shows), then settle the filter from there
    n_period = int(round(w.period / DT))
    for _ in range(int(3e-3 / DT)):
        w.step()
    i_avg = sum(w.step() for _ in range(n_period)) / n_period
    w.e += (i_avg - amps) * w.r
    path = Path(p, v0=amps * p.lift_jam_cutoff()["sense_v_per_a"])
    for _ in range(n_settle):
        path.step(w.step())
    i_lo = i_hi = w.i
    vf_lo = vf_hi = path.vf
    i_sum = vf_sum = 0.0
    toggles, last = 0, path.out
    for _ in range(n_win):
        i = w.step()
        o = path.step(i)
        i_lo, i_hi = min(i_lo, i), max(i_hi, i)
        vf_lo, vf_hi = min(vf_lo, path.vf), max(vf_hi, path.vf)
        i_sum += i
        vf_sum += path.vf
        toggles += o != last
        last = o
    i_mean, vf_mean = i_sum / n_win, vf_sum / n_win
    return {"i_mean": i_mean, "pp_a": i_hi - i_lo, "comp_pp_v": vf_hi - vf_lo,
            "bias_ma": (vf_mean - path.g * i_mean) / path.g * 1000, "toggles": toggles}


def stall_cross_us(p, volts, duty, switched, ideal):
    """From the held duty's running current, the back-EMF drops to zero: microseconds until the comparator crosses."""
    c = p.lift_jam_cutoff()
    w = Winding(p, volts, duty, c["run_a"], switched)
    path = Path(p, ideal=ideal, v0=c["run_a"] * c["sense_v_per_a"])
    for _ in range(int(8e-3 / DT)):           # settle at the running current
        path.step(w.step())
    w.e = 0.0
    for k in range(int(20e-3 / DT)):
        if path.step(w.step()):
            return k * DT * 1e6
    return math.inf


def table(rows_kw, label_w=34):
    print(f"{'design':{label_w}} {'L mH':>5} {'D':>5} {'pp A sw':>8} {'formula':>8} {'comp mV sw':>10} {'analytic':>9} "
          f"{'band mA':>8} {'bias mA':>8} {'toggles':>8}")
    for label, kw, volts, duty, amps_key in rows_kw:
        p = Feeder(**kw)
        c = p.lift_jam_cutoff()
        amps = c[amps_key]
        s = steady(p, volts, duty, amps)
        a = p.lift_sense_ripple(duty=duty, volts=volts)
        print(f"{label:{label_w}} {p.lift_motor_mh:5g} {duty:5.2f} {s['pp_a']:8.3f} {a['pp_a']:8.3f} "
              f"{s['comp_pp_v'] * 1000:10.3f} {a['comp_pp_v'] * 1000:9.3f} {s['comp_pp_v'] / Feeder(**kw).lift_jam_cutoff()['sense_v_per_a'] * 1000:8.2f} {s['bias_ma']:8.2f} {s['toggles']:8d}")


DESIGNS = (
    ("A2, 0.01 ohm (as built)", {}),
    ("A1, 0.02 ohm, 45 kHz", {"lift_sense_gain": 25.0, "lift_shunt_ohm": 0.02, "lift_sense_bw_hz": 45e3, "lift_shunt_w": 2.0}),
    ("A3, 0.005 ohm, 35 kHz", {"lift_sense_gain": 100.0, "lift_shunt_ohm": 0.005, "lift_sense_bw_hz": 35e3}),
    ("slow amp (hypothetical, 3.7 kHz)", {"lift_sense_bw_hz": 3.7e3, "lift_sense_slew_v_us": 0.03}),
)


def main(quick=False):
    p = Feeder()
    c = p.lift_jam_cutoff()
    held = p.lift_duty_at(p.battery_v_max)
    print(f"PWM {p.lift_pwm_hz / 1000:g} kHz; amplifier {p.lift_sense_gain:g} V/V x {p.lift_shunt_ohm:g} ohm = "
          f"{c['sense_v_per_a']:g} V/A, {p.lift_sense_bw_hz / 1000:g} kHz, {p.lift_sense_slew_v_us:g} V/us; RC "
          f"{p.lift_sense_rc_s * 1000:g} ms; trip {c['trip_a']:.3f} A ({c['trip_lo_a']:.3f}-{c['trip_hi_a']:.3f}); held duty "
          f"on a full pack {held:.3f}; DT {DT * 1e6:g} us")
    print("\nSteady, 29.2 V pack, mean current at the nominal trip (the mean the comparator must judge):")
    rows = []
    designs = DESIGNS[:1] if quick else DESIGNS
    mhs = (2.0,) if quick else (0.5, 1.0, 2.0, 4.0)
    for label, kw in designs:
        for mh in mhs:
            for duty in (0.5, held):
                rows.append((label, dict(kw, lift_motor_mh=mh), 29.2, duty, "trip_a"))
    table(rows)
    print("\nSteady near the rail (29.2 V cold stall): held duty, and full duty with no battery reading (no ripple):")
    table([("A2, held duty, cold stall", {}, 29.2, held, "stall_cold_a"),
           ("A2, full duty, unregulated stall", {}, 29.2, 1.0, "stall_unregulated_a")])
    if not quick:
        print("\n  (the unregulated stall asks for "
              f"{c['stall_unregulated_a'] * c['sense_v_per_a']:.2f} V; the output stops at "
              f"{3.3 * (1 - p.lift_rail_tol) - p.lift_sense_headroom_v:.2f} V, {(3.3 * (1 - p.lift_rail_tol) - p.lift_sense_headroom_v) / (c['trip_hi_a'] * c['sense_v_per_a']):.1f}x the highest reference)")
    print("\nStall from the held duty's running current, back-EMF to zero at once: us to the comparator's crossing")
    print(f"{'design':34} {'L mH':>5} {'averaged, ideal':>16} {'switched, ideal':>16} {'switched, amp':>14} {'amp adds':>9} {'vs plant':>9}")
    for label, kw in designs:
        for mh in mhs:
            q = Feeder(**dict(kw, lift_motor_mh=mh))
            avg = stall_cross_us(q, 29.2, held, False, True)
            sw_i = stall_cross_us(q, 29.2, held, True, True)
            sw_a = stall_cross_us(q, 29.2, held, True, False)
            print(f"{label:34} {mh:5g} {avg:16.1f} {sw_i:16.1f} {sw_a:14.1f} {sw_a - sw_i:9.1f} {sw_a - avg:9.1f}")
    print("\nThe firmware samples the comparator every 10 ms and cuts on two ticks over; the 10k/100 nF filter's "
          f"corner is {1 / (2 * math.pi * p.lift_sense_rc_s):.0f} Hz.")


if __name__ == "__main__":
    main(quick="--quick" in sys.argv[1:])
