"""results.json -> figure.png: sheet tilt, robot torque margin and ISO/TS 15066 speed limits."""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = Path(__file__).resolve().parent


def main():
    res = json.loads((HERE / "results.json").read_text())
    fig, (a, b, c) = plt.subplots(1, 3, figsize=(13.5, 4.2), constrained_layout=True)
    for T, col in ((0.5, "tab:red"), (1.0, "tab:orange"), (2.0, "tab:blue"), (4.0, "tab:green")):
        rows = [r for r in res["sweep"] if r["T"] == T and r["K"] == 1000.0 and r["B"] == 150.0]
        a.plot([r["lag"] for r in rows], [r["tilt_peak_deg"] for r in rows], "o-", color=col, label=f"lift in {T} s")
    a.set_xlabel("robot's lag behind the person (s)")
    a.set_ylabel("peak sheet tilt (deg)")
    a.set_title("Tilt of a 4x8 sheet while the person lifts one end 0.3 m\n(K = 1000 N/m, B = 150 N s/m)", fontsize=9)
    a.legend(fontsize=8)
    a.grid(alpha=0.3)
    for rn, col in (("g1", "tab:orange"), ("h1", "tab:blue")):
        for T, ls in ((2.0, "-"), (0.5, "--")):
            rows = [r for r in res["feasibility"] if r["robot"] == rn and r["T"] == T and r["ratio"] is not None]
            b.plot([r["sheet_kg"] for r in rows], [r["ratio"] for r in rows], "o" + ls, ms=3, color=col, label=f"{rn.upper()}, {T} s lead")
    b.axhline(1.0, color="k", lw=0.8)
    b.set_xlabel("sheet mass (kg)")
    b.set_ylabel("worst joint torque / limit along the lift")
    b.set_title("Robot's half of the sheet against joint limits", fontsize=9)
    b.legend(fontsize=8)
    b.grid(alpha=0.3)
    vs = res["iso"]["v_safe"]["g1_22.0"]
    regs = [k for k in vs if k != "m_robot"]
    c.barh(regs, [vs[k] for k in regs], color="tab:gray")
    for T, col in ((0.5, "tab:red"), (2.0, "tab:blue")):
        c.axvline(res["iso"]["hand_speed_peak"][str(T)], color=col, ls="--", label=f"peak hand speed, {T} s lead")
    c.set_xlabel("ISO/TS 15066 speed limit (m/s), G1, 22 kg sheet")
    c.set_title("Speed limits by body region", fontsize=9)
    c.tick_params(axis="y", labelsize=7)
    c.legend(fontsize=8)
    fig.savefig(HERE / "figure.png", dpi=130)


if __name__ == "__main__":
    main()
