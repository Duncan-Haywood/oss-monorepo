"""The elevation pot's pickup from the actuator's PWM, on the simulated feeder (2026-11-14; cad/README.md "The pot's
pickup from the motor pair").

    PYTHONPATH=src python3 tests/pot_pickup_sweep.py

Each pot reading the firmware takes gets the wiper node's error from cad `Feeder.elev_pot_error_v` at the H-bridge's
duty and a PWM phase. When each reading falls in the PWM period depends on how long a MicroPython `read_u16()` takes
next to the 50 us period, which is not measured, so three timings are tried: every reading at an independent random
phase, and every reading locked to the phase just after the rising edge or just after the falling edge (the worst a
read loop that aliases with the PWM can do). Two firmwares: "one read" (one reading per tick, a missing reading
faults at once: the firmware before 2026-11-14) and "trimmed" (ELEV_POT_READS readings, the two highest and lowest
dropped, three missing ticks in a row to fault). Two jobs: aim from stroke 60 mm to +10 deg (the seconds until the
axis settles, the head's angle error then, and whether it faulted), and a jammed actuator 3 mm short of its goal, where
the loop runs at its minimum duty (the seconds until the stall check faults it; 0.6 s is the firmware's stall time). The pickup model's capacitances are assumptions (cad params); the firmware is real.
"""

import os
import random
import sys

HERE = os.path.dirname(__file__)
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "cad"))
from feeder_sim import SimFeeder  # noqa: E402
from otr_cad.params import Feeder  # noqa: E402
from tennisbots import protocol as P  # noqa: E402

FILTERS_NF = (0.0, 100.0, 1000.0)
TIMINGS = ("random", "after-rise", "after-fall")
FIRMWARES = ("one read", "trimmed")


def _sim(filter_nf, timing, firmware, seed=1):
    p = Feeder()
    rng = random.Random(seed)

    def pickup(duty, _n):
        d = abs(duty)
        if timing == "random":
            ph = rng.random()
        elif timing == "after-rise":
            ph = 1e-6
        else:
            ph = d + 1e-6
        return p.elev_pot_error_v(d, ph, filter_nf=filter_nf)

    sim = SimFeeder()
    if firmware == "one read":
        sim.cfg.ELEV_POT_READS = 1
        sim.hw.elev.lost_ticks = 1
    sim.pot_pickup = pickup
    return sim


def _run(sim, seconds, until=None):
    """Run with the Pi's heartbeat (or the board's watchdog stops everything); seconds until `until()` first held."""
    for k in range(int(seconds * 10)):
        sim.write(P.encode(P.HEARTBEAT))
        sim.run_ms(100)
        if until is not None and until():
            return (k + 1) / 10
    return None


def aim(filter_nf, timing, firmware, goal_deg=10.0, seconds=6.0):
    """(seconds to settle or None, |angle error| deg there, faulted) aiming from stroke 60 mm to `goal_deg`. Unpicked
    up, the move takes about 2.6 s."""
    sim = _sim(filter_nf, timing, firmware)
    hw = sim.hw
    hw.set_aim(int(goal_deg * 100), 0)
    t = _run(sim, seconds, until=lambda: hw.elev.settled or hw.elev.fault)
    err = abs(hw.elev.geom.elev(sim.elev_true + sim.cfg.ELEV_CLOSED_MM) - goal_deg)
    return (t if hw.elev.settled else None), err, hw.elev.fault


def jam(filter_nf, timing, firmware, gap_mm=3.0, seconds=2.0):
    """Seconds until a jammed actuator `gap_mm` short of its goal faults, or None (the stall check is 0.6 s). A gap
    under 4.4 mm runs the H-bridge at the loop's minimum duty, where the PWM has edges; a long move runs it at full
    duty, which has none, so the far case is not the one at risk."""
    sim = _sim(filter_nf, timing, firmware)
    sim.elev_jammed = True
    ax = sim.hw.elev
    ax.goal = sim.elev_true + gap_mm
    return _run(sim, seconds, until=lambda: ax.fault)


def main():
    p = Feeder()
    for nf in FILTERS_NF:
        d = p.elev_pot_pickup(filter_nf=nf)
        print(f"filter {nf:g} nF: step {d['step_v'] * 1e3:.1f} mV per edge, tau {d['tau_us']:.1f} us, one reading off by up "
              f"to {d['err_mm']:.2f} mm, {d['bad_read_frac']:.0%} of phases off by over {p.elev_pot_err_frac * p.elev_deadband_mm:g} mm")
    print(f"{'filter nF':>9} {'timing':>10} {'firmware':>9} | {'settled s':>9} {'err deg':>7} {'fault':>5} | jam fault s")
    for nf in FILTERS_NF:
        for timing in TIMINGS:
            for fw in FIRMWARES:
                t, err, fault = aim(nf, timing, fw)
                j = jam(nf, timing, fw)
                print(f"{nf:>9g} {timing:>10} {fw:>9} | {'never' if t is None else f'{t:.1f}':>9} {err:>7.2f} "
                      f"{fault!s:>5} | {'never' if j is None else f'{j:.1f}'}")


if __name__ == "__main__":
    main()
