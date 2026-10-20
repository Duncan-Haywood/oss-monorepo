"""Write experiments/results.txt: platform comparison across crowd densities (deterministic)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from capture_follow.model import PLATFORMS, W, TARGET, simulate  # noqa: E402

SEEDS = range(10)
DENS = [0.02, 0.1, 0.3]


def mean(rows, k):
    return sum(r[k] for r in rows) / len(rows)


def main():
    out = [f"capture-follow: {len(SEEDS)} seeds x 240 s walks, plaza {W:.0f} m x {W:.0f} m, target distance {TARGET} m", ""]
    framed = {}
    for d in DENS:
        out.append(f"A. density {d} people/m2 ({int(round(d * W * W))} pedestrians)")
        out.append("platform | framed % | clear view % | blocked % | close s/h | contacts/h | Wh/h")
        for p in PLATFORMS:
            rows = [simulate(p, d, s) for s in SEEDS]
            framed[(p.name, d)] = 100 * mean(rows, 'framed')
            out.append(" | ".join([p.name, f"{100 * mean(rows, 'framed'):.1f}", f"{100 * mean(rows, 'clear'):.1f}",
                                   f"{100 * mean(rows, 'blocked'):.1f}", f"{mean(rows, 'close_s_per_h'):.0f}",
                                   f"{mean(rows, 'contacts_per_h'):.1f}", f"{mean(rows, 'wh_per_h'):.1f}"]))
        out.append("")
    out.append("== D. framed % against density; columns: " + ", ".join(p.name for p in PLATFORMS))
    for d in DENS:
        out.append(f"{d} " + " ".join(f"{framed[(p.name, d)]:.1f}" for p in PLATFORMS))
    out.append("")
    out.append("B. the same walks on a flat plaza (no step lines), density 0.1")
    out.append("platform | framed % | clear view % | contacts/h | Wh/h")
    for p in PLATFORMS[1:]:
        rows = [simulate(p, 0.1, s, steps_on=False) for s in SEEDS]
        out.append(" | ".join([p.name, f"{100 * mean(rows, 'framed'):.1f}", f"{100 * mean(rows, 'clear'):.1f}",
                               f"{mean(rows, 'contacts_per_h'):.1f}", f"{mean(rows, 'wh_per_h'):.1f}"]))
    out.append("")
    out.append("C. packed size, mass and battery per hour of filming (assumed; battery at 200 Wh/kg, density 0.1)")
    out.append("platform | litres | kg | battery kg per hour")
    for p in PLATFORMS:
        rows = [simulate(p, 0.1, s, duration=120.0) for s in range(3)]
        wh = mean(rows, "wh_per_h")
        out.append(f"{p.name} | {p.packed_l:g} | {p.mass_kg:g} | {wh / 200:.2f}")
    Path(__file__).with_name("results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
