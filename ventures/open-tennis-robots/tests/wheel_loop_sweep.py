"""Launcher wheel loop on the simulated feeder over plant assumptions (README "Wheel speed loop").

    PYTHONPATH=src python3 tests/wheel_loop_sweep.py

For each wheel free speed (the real plant's, vs the 9000 rpm the firmware is told), spin-up time constant and wheel
pair from drill.example.json, it starts from rest, sets the speeds and reports: seconds until the firmware's feed
gate first counts the wheels steady, the true speed error at that moment, and the worst true error over the next 2 s.
The wheel model (first-order lag) is an assumption; the tach, loop and gate are the firmware's own code.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from feeder_sim import SimFeeder, controller  # noqa: E402
from tennisbots import protocol as P  # noqa: E402

PAIRS = [(4635, 1955), (2160, 3232), (5531, 1958), (6500, 1500)]


def trial(max_rpm, tau, pair, rpm_full=9000, **loop):
    sim = SimFeeder(wheel_max_rpm=max_rpm, wheel_tau_s=tau, rpm_full=rpm_full)
    if loop:
        sim.hw.wheel_loops = tuple(controller.WheelLoop(rpm_full, **loop) for _ in range(2))
    sim.write(P.encode(P.HEARTBEAT) + P.encode(P.SET_WHEELS, *pair))
    t0 = sim.clock()
    first, err_at, worst = None, None, 0.0
    while sim.clock() - t0 < 12:
        sim.write(P.encode(P.HEARTBEAT))
        sim.run_ms(10)
        e = max(abs(w - p) / p for w, p in zip(sim.wheel, pair))
        if first is None and sim.hw.wheels_steady.steady:
            first, err_at = sim.clock() - t0, e
        elif first is not None:
            worst = max(worst, e)
            if sim.clock() - t0 > first + 2:
                break
    return first, err_at, worst


def main():
    print("free rpm | tau s | wheels      | steady after s | error then | worst error next 2 s")
    rows = []
    for max_rpm in (7000, 9000, 11000):
        for tau in (0.2, 0.4, 0.8):
            for pair in PAIRS:
                if max(pair) > 0.95 * max_rpm:
                    continue
                first, e0, worst = trial(max_rpm, tau, pair)
                rows.append((first, e0, worst))
                print(f"{max_rpm:8d} | {tau:5.1f} | {pair[0]:4d}/{pair[1]:4d}   | "
                      f"{'never' if first is None else f'{first:5.2f}':>14} | "
                      f"{'-' if e0 is None else f'{e0:6.1%}':>10} | {worst:6.1%}")
    ok = [r for r in rows if r[0] is not None]
    print(f"{len(ok)}/{len(rows)} reached steady; worst error at the gate {max(r[1] for r in ok):.1%}, "
          f"worst over the next 2 s {max(r[2] for r in ok):.1%}, slowest {max(r[0] for r in ok):.2f} s")


if __name__ == "__main__":
    main()
