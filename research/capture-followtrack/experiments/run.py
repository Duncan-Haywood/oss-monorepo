"""Write experiments/results.txt: the capture-followplan planner fed by a Kalman tracker over noisy, delayed detections.

Drone, 0.1 people/m2 (the density where capture-followplan's gap was clearest), 8 seeds, 240 s walks.
Sweeps detection noise sigma and latency; baselines are exact velocities (capture-followplan) and repulsion.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
for d in ("src",):
    sys.path.insert(0, str(HERE.parent / d))
sys.path.insert(0, str(HERE.parents[1] / "capture-followplan" / "src"))
sys.path.insert(0, str(HERE.parents[1] / "capture-follow" / "src"))
from capture_follow.model import PLATFORMS  # noqa: E402
from capture_followplan.plan import simulate  # noqa: E402
from capture_followtrack.track import Tracker  # noqa: E402

P = {p.name: p for p in PLATFORMS}
SEEDS = range(8)


def stats(xs):
    m = sum(xs) / len(xs)
    sd = (sum((x - m) ** 2 for x in xs) / (len(xs) - 1)) ** 0.5
    return m, 1.96 * sd / len(xs) ** 0.5


def row(label, runs):
    f, fe = stats([100 * r["framed"] for r in runs])
    c, ce = stats([r["contacts_per_h"] for r in runs])
    return f"{label} | {f:.1f} +- {fe:.1f} | {c:.0f} +- {ce:.0f}"


def main():
    out = [f"capture-followtrack: drone, 0.1 people/m2, {len(SEEDS)} seeds x 240 s, planner radius 1.5 m; mean +- 95% CI (t~1.96)", "",
           "setting | framed % | contacts/h"]
    out.append(row("ignore", [simulate(P["drone"], 0.1, s, mode="ignore") for s in SEEDS]))
    out.append(row("repulsion gain 1.2", [simulate(P["drone"], 0.1, s, mode="repulsion") for s in SEEDS]))
    out.append(row("planner, exact", [simulate(P["drone"], 0.1, s, mode="plan") for s in SEEDS]))
    out.append("")
    out.append("== sigma (m) x latency (s): planner + tracker")
    for sig in (0.1, 0.3, 0.6, 1.0):
        for lat in (0.0, 0.25, 0.5, 1.0):
            out.append(row(f"sigma {sig} latency {lat}", [simulate(P["drone"], 0.1, s, mode="plan", estimator=Tracker(s, sig, lat)) for s in SEEDS]))
    Path(__file__).with_name("results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
