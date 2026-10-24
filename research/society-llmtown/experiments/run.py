"""Sweep urgency pressure and the share of hurried robots; 20 seeds each. Writes results.txt."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from society_llmtown import NORMS, simulate  # noqa: E402

SEEDS = range(20)


def mean(xs):
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if xs else float("nan")


def main():
    lines = ["# society-llmtown stub agents, 10 robots, 30 scripted people, 20 days, 20 meetings, 20 seeds",
             "pressure hurried | stated: " + " ".join(NORMS) + " | kept: " + " ".join(NORMS)
             + " | go_rate person_cost robot_cost"]
    for hurried in (0.0, 0.2, 0.5):
        for pressure in (0.0, 0.5, 1.0):
            rs = [simulate(pressure=pressure, hurried=hurried, seed=s) for s in SEEDS]
            st = " ".join(f"{mean(r['stated'][n] for r in rs):.3f}" for n in NORMS)
            kp = " ".join(f"{mean(r['kept'][n] for r in rs):.3f}" for n in NORMS)
            lines.append(f"{pressure:.1f} {hurried:.1f} | {st} | {kp} | "
                         f"{mean(r['go_rate'] for r in rs):.3f} {mean(r['person_cost'] for r in rs):.3f} "
                         f"{mean(r['robot_cost'] for r in rs):.3f}")
    a = ["== A. share of 'always_yield' meetings kept, and person cost per meeting, by urgency pressure (columns: kept at hurried 0.0 0.2 0.5; person cost at the same)"]
    for pressure in (0.0, 0.25, 0.5, 0.75, 1.0):
        row = [simulate(pressure=pressure, hurried=h, seed=s) for h in (0.0, 0.2, 0.5) for s in SEEDS]
        k = [mean(r["kept"]["always_yield"] for r in row[i * 20:(i + 1) * 20]) for i in range(3)]
        c = [mean(r["person_cost"] for r in row[i * 20:(i + 1) * 20]) for i in range(3)]
        a.append(f"{pressure:.2f} " + " ".join(f"{x:.3f}" for x in k + c))
    out = "\n".join(a) + "\n== B. " + "\n".join(lines) + "\n"
    (Path(__file__).parent / "results.txt").write_text(out)
    print(out)


if __name__ == "__main__":
    main()
