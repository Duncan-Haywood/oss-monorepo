"""Write experiments/results.txt: repulsion against the predictive planner (deterministic).

Platforms are capture-follow's. Wheeled runs on a flat plaza (its step-line blocking would swamp the controller
comparison, see capture-follow); wheel-legs and the drone run on the plaza with step lines.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[0] / "src"))
sys.path.insert(0, str(HERE.parents[1] / "capture-follow" / "src"))
from capture_follow.model import PLATFORMS  # noqa: E402
from capture_followplan.plan import simulate  # noqa: E402

P = {p.name: p for p in PLATFORMS}
SEEDS = range(8)
DENS = [0.02, 0.1, 0.3]
CASES = [("drone", True), ("wheeled", False), ("wheel-legs", True)]


def mean(rows, k):
    return sum(r[k] for r in rows) / len(rows)


def line(label, rows):
    return " | ".join([label, f"{100 * mean(rows, 'framed'):.1f}", f"{mean(rows, 'contacts_per_h'):.0f}",
                       f"{mean(rows, 'close_s_per_h'):.0f}", f"{mean(rows, 'wh_per_h'):.1f}"])


def main():
    out = [f"capture-followplan: {len(SEEDS)} seeds x 240 s walks, capture-follow plaza, 2.5 m target", ""]
    for d in DENS:
        for name, steps_on in CASES:
            out.append(f"A. {name}{'' if steps_on else ' (flat plaza)'}, density {d} people/m2")
            out.append("controller | framed % | contacts/h | close s/h | Wh/h")
            for mode in ("ignore", "repulsion", "plan"):
                out.append(line(mode, [simulate(P[name], d, s, mode=mode, steps_on=steps_on) for s in SEEDS]))
            out.append("")
    out.append("== B. drone, density 0.1: framed % against contacts/h (each row one setting)")
    out.append("setting | framed % | contacts/h")
    for g in (0.15, 0.3, 0.6, 1.2, 2.4, 4.8):
        r = [simulate(P["drone"], 0.1, s, mode="repulsion", gain=g) for s in SEEDS]
        out.append(f"repulsion gain {g} | {100 * mean(r, 'framed'):.1f} | {mean(r, 'contacts_per_h'):.0f}")
    for rad in (0.75, 1.0, 1.5, 2.0, 3.0):
        r = [simulate(P["drone"], 0.1, s, mode="plan", radius=rad) for s in SEEDS]
        out.append(f"planner radius {rad} | {100 * mean(r, 'framed'):.1f} | {mean(r, 'contacts_per_h'):.0f}")
    Path(__file__).with_name("results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
