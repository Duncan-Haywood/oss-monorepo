"""Launcher spin-up ramp on the simulated feeder (2026-11-14; cad/README.md "Power distribution").

    PYTHONPATH=src python3 tests/spinup_ramp_sweep.py

For each low-speed ramp cap, wheel pair and plant (free speed, spin-up time constant), it starts both wheels from rest
and reports the seconds until the feed gate first counts them steady and each wheel's peak shaft power, read from the
simulated wheel's true speed as I w dw/dt with I from cad `Feeder.launch_wheel_kgm2`. The firmware asks for at most
WHEEL_SPINUP_W per wheel; the gap above it is the speed loop pushing the wheel past its ramp, which is worst at low
speed, where the once-per-rev tachometer reads 0. The wheel model (first-order lag) is an assumption, as in
tests/wheel_loop_sweep.py; the tach, ramp, loop and gate are the firmware's own code.
"""

import math
import os
import sys

HERE = os.path.dirname(__file__)
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "cad"))
from feeder_sim import SimFeeder, controller  # noqa: E402
from otr_cad.params import Feeder  # noqa: E402
from tennisbots import protocol as P  # noqa: E402

PAIRS = [(5531, 1958), (6500, 1500), (2160, 3232)]
PLANTS = [(7000, 0.8), (9000, 0.4), (11000, 0.2)]


def trial(max_rpm, tau, pair, cap=None, power_w=None):
    """(seconds to steady, peak shaft W of either wheel) from rest; `cap`/`power_w` override the firmware's config."""
    p = Feeder()
    inertia = p.launch_wheel_kgm2
    sim = SimFeeder(wheel_max_rpm=max_rpm, wheel_tau_s=tau)
    if cap is not None or power_w is not None:
        sim.hw.wheel_ramps = tuple(controller.SpinupRamp(power_w or p.wheel_spinup_w, inertia,
                                                         cap or p.wheel_ramp_max_rpm_s) for _ in range(2))
    sim.write(P.encode(P.HEARTBEAT) + P.encode(P.SET_WHEELS, *pair))
    t0, prev, peak = sim.clock(), list(sim.wheel), 0.0
    while sim.clock() - t0 < 12:
        sim.write(P.encode(P.HEARTBEAT))
        sim.run_ms(10)
        w = list(sim.wheel)
        for a, b in zip(w, prev):
            peak = max(peak, inertia * (a * 2 * math.pi / 60) * ((a - b) * 2 * math.pi / 60 / 0.01))
        prev = w
        if sim.hw.wheels_steady.steady:
            return sim.clock() - t0, peak
    return None, peak


def main():
    p = Feeder()
    print(f"cap on each wheel's shaft power: {p.wheel_spinup_w:g} W; I = {p.launch_wheel_kgm2:.5f} kg m^2")
    for cap in (1e9, 6000, 3000, 2000, 1500, 1000):
        rows = [trial(m, t, pair, cap=cap, power_w=1e9 if cap == 1e9 else None) for pair in PAIRS for m, t in PLANTS]
        steady = [r[0] for r in rows]
        peaks = sorted(r[1] for r in rows)
        label = "no ramp" if cap == 1e9 else f"{cap:g} rpm/s"
        print(f"{label:>12}: worst steady {max(steady):.2f} s, per-wheel peak median {peaks[len(peaks) // 2]:.0f} W, "
              f"worst {peaks[-1]:.0f} W")


if __name__ == "__main__":
    main()
