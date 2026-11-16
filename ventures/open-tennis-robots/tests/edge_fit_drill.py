"""The calibration drill's launcher fit with the loop-command drop fit on periods vs on edge times, over several seeds
(2026-11-16, firmware/esp32/README.md "The drop on the edge times: tried, kept off", "The whole drill").

tests/plant_drill_sweep.py runs one seed per design build, and its worst and mean spin errors move by a few points
between seeds, so this repeats the 18 builds `--seeds` times (seed = build + 100 x s) and prints the rms, mean size,
worst and mean (bias) of the spin efficiency's error, and the speed efficiency's rms and worst.

    PYTHONPATH=src:tests:firmware/esp32 python tests/edge_fit_drill.py "hall 10us" [--edges] [--seeds N]

About 20 s a seed. Plants as tests/plant_drill_sweep.py; they are assumptions, not measurements of a real wheel.
"""

import functools
import statistics
import sys

import plant_drill_sweep as P
from feeder_sim import controller


def main():
    edges = "--edges" in sys.argv
    if edges:   # the board calls drop_from_commands_steps with its default (periods); swap in the edge form
        controller.drop_from_commands_steps = functools.partial(controller.drop_from_commands_steps, edges=True)
    seeds = int(sys.argv[sys.argv.index("--seeds") + 1]) if "--seeds" in sys.argv else 3
    plants = [a for a in sys.argv[1:] if a in P.PLANTS] or list(P.PLANTS)
    for plant in plants:
        spin, speed = [], []
        for s in range(seeds):
            for i, (se, sp, tau) in enumerate(P.DESIGN):
                r = P.run(plant, se, sp, tau, seed=i + 100 * s)
                speed.append(r["err"][0] * 100)
                spin.append(r["err"][1] * 100)
        rms = lambda v: (sum(x * x for x in v) / len(v)) ** 0.5   # noqa: E731
        print(f"{plant:10} {'edges' if edges else 'periods':7} drills {len(spin)}: spin rms "
              f"{rms(spin):5.2f} mean size {statistics.mean(map(abs, spin)):5.2f} worst {max(map(abs, spin)):6.2f} "
              f"bias {statistics.mean(spin):+5.2f} | speed rms {rms(speed):4.2f} worst {max(map(abs, speed)):4.2f}")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
