"""How long the machine really takes between balls, against the page's estimate (drill.mjs shotGap).

Runs each preset drill (eval/drill_gap_check.mjs, intervals forced to 0.1 s so the machine's own readiness sets the
pace) through host.run_drill on the simulated feeder running the real firmware (tests/feeder_sim.py), and prints the
release-to-release time of every ball next to the estimate. The simulator's wheel physics (a 0.4 s first-order ESC lag
to 9000 rpm x command) is an assumption, not a measurement.

    node eval/drill_gap_check.mjs > /tmp/drills.json
    PYTHONPATH=src python3 tests/drill_gap_check.py /tmp/drills.json
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from feeder_sim import SimFeeder  # noqa: E402
from tennisbots import host  # noqa: E402


def main(path):
    with open(path) as f:
        drills = json.load(f)
    rows = []
    for name, d in drills.items():
        sim = SimFeeder()
        shots = host.plan_drill(d["spec"])
        link = host.FeederLink(sim, sim.clock)
        res = host.run_drill(link, shots, sim.sleep)
        assert res.ok, (name, res.aborted)
        t = [s.released_at for s in res.shots]
        for i, est in enumerate(d["estimate"]):
            real = t[i + 1] - t[i]
            rows.append((name, i + 1, real, est["seconds"], est["by"]))
    print(f"{'drill':10} {'ball':>4} {'sim s':>6} {'page s':>6} {'diff':>6}  limited by (page)")
    for r in rows:
        print(f"{r[0]:10} {r[1]:4d} {r[2]:6.2f} {r[3]:6.2f} {r[3] - r[2]:+6.2f}  {r[4]}")
    for label, keep in (("presets", lambda r: not r[0].startswith("random")),
                        ("random (held out)", lambda r: r[0].startswith("random"))):
        diffs = [r[3] - r[2] for r in rows if keep(r)]
        if not diffs:
            continue
        under = sum(1 for x in diffs if x < 0)
        within = sum(1 for x in diffs if abs(x) <= 0.3)
        print(f"{label}: {len(diffs)} gaps; page minus sim: mean {sum(diffs) / len(diffs):+.2f} s, "
              f"min {min(diffs):+.2f}, max {max(diffs):+.2f}; page shorter on {under}; within 0.3 s on {within}")


if __name__ == "__main__":
    main(sys.argv[1])
