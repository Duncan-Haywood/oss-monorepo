"""Push envelope and sheet-success curve in results.json -> figure.png."""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = Path(__file__).resolve().parent


def main():
    res = json.loads((HERE / "results.json").read_text())
    fig, (a, b) = plt.subplots(1, 2, figsize=(10.5, 4.3), constrained_layout=True)
    for key, col in (("g1-mu0.6", "tab:orange"), ("h1-mu0.6", "tab:blue")):
        rows = res["push"][key]
        zs = sorted({r["z"] for r in rows})
        best = [max([r["N"] for r in rows if r["z"] == z and r["N"] is not None], default=0) for z in zs]
        a.plot(best, zs, "o-", color=col, label=f"Unitree {key[:2].upper()}")
    a.set_xlabel("largest horizontal push into the wall, best reach (N)")
    a.set_ylabel("tool height above the floor (m)")
    a.set_title("How hard a stock humanoid can press a nailer on the wall\n(friction 0.6, 3.4 kg tool, peak torque limits)", fontsize=9)
    a.legend()
    a.grid(alpha=0.3)
    c = res["curve"]
    xs = [r["sigma_mm"] for r in c]
    b.plot(xs, [r["all"] for r in c], color="tab:red", label="windows with the 3/8 in edge distance")
    b.plot(xs, [r["no_edge_band"] for r in c], "--", color="tab:green", label="joint nails given the whole stud face")
    b.axhline(0.95, color="0.5", lw=0.8)
    b.set_xlabel("tip scatter in the wall plane, 1 sigma (mm)")
    b.set_ylabel("chance all 62 nails of a sheet land in their windows")
    b.set_title("Placement budget of one 4x8 sheet", fontsize=9)
    b.legend(fontsize=8)
    b.grid(alpha=0.3)
    fig.savefig(HERE / "figure.png", dpi=130)


if __name__ == "__main__":
    main()
