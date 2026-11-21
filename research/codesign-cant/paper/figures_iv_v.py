"""Figure IV-V of the draft: one figure for sections IV and V in place of the two milestone figures. Runs no flights.

(a) Paired by seed, cant <= 80 deg minus no cant, held-out attitude RMS (deg), for each attitude law, in the stylised
    simulator and the four RotorPy conditions of milestone 5 (`../experiments/m5_rotorpy/results.json`; 32 held-out
    episodes per design, so the stylised column is milestone 5's re-score, not milestone 4's 64-episode one).
    One dot per seed, a bar at the mean. Below zero means cant is better.
(b) The cant CMA-ES chose, per seed, for each law (milestone 4, `../experiments/m4_controllers/results.json`) and for
    milestone 2's three-start `prio` PID runs at lam = 1 deg per 100 W (its lam = 0.3 runs are milestone 4's PID seeds 0-4) (`../experiments/m2_polytope/restarts.json`),
    against the 5-20 deg band of the rule of thumb (hypothesis H1).
`summary()` returns the numbers the figure draws; tests/test_paper_numbers.py checks them against the results text files.
Usage: python3 figures_iv_v.py   (writes fig_IV_V.png beside this file)"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
EXP = os.path.join(HERE, "..", "experiments")
LAWS = [("pid", "PID"), ("indi", "INDI"), ("geo", "geometric")]
MODES = [("stylised", "stylised"), ("torque", "RotorPy\ntorque"), ("aero", "RotorPy\naero"),
         ("aero_cop", "RotorPy\naero_cop"), ("aero_cop2", "RotorPy\naero_cop2")]


def _load(rel):
    with open(os.path.join(EXP, rel)) as f:
        return json.load(f)


def paired():
    """{law: {mode: [cant minus no cant per seed, seed order]}} from milestone 5's re-scored designs."""
    d = _load("m5_rotorpy/results.json")["designs"]
    by = {(x["ctrl"], x["cap"], x["seed"]): x for x in d}
    out = {}
    for law, _ in LAWS:
        seeds = sorted(s for (c, cap, s) in by if c == law and cap == 0)
        out[law] = {m: [by[(law, 80, s)][m]["rms"] - by[(law, 0, s)][m]["rms"] for s in seeds] for m, _ in MODES}
    return out


def chosen_cant():
    """{label: [chosen cant per seed, deg]} for the canted arms of milestone 4 and milestone 2's restarts."""
    out = {}
    for law, name in LAWS:
        runs = [r for r in _load("m4_controllers/results.json")["runs"] if r["ctrl"] == law and r["cap"] == 80]
        out[name + "\n(m4, λ 0.3)"] = [r["alpha_deg"] for r in sorted(runs, key=lambda r: r["seed"])]
    # milestone 4's PID seeds 0-4 are milestone 2's three-start runs at lam = 0.3, so only lam = 1 adds a column
    runs = [r for r in _load("m2_polytope/restarts.json") if r["mix"] == "prio" and r["cap"] == 80 and abs(r["lam"] - 1.0) < 1e-9]
    out["PID\n(m2, λ 1)"] = [r["alpha_deg"] for r in sorted(runs, key=lambda r: r["seed"])]
    return out


def summary():
    p = paired()
    return {"paired_mean": {law: {m: sum(v) / len(v) for m, v in mv.items()} for law, mv in p.items()},
            "paired_better": {law: {m: sum(1 for x in v if x < 0) for m, v in mv.items()} for law, mv in p.items()},
            "chosen": chosen_cant()}


def main():
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    p, ch = paired(), chosen_cant()
    fig, (ax, bx) = plt.subplots(1, 2, figsize=(10.5, 3.9), gridspec_kw={"width_ratios": [1.6, 1]})
    colours = {"pid": "#4269d0", "indi": "#efb118", "geo": "#3ca951"}
    w = 0.25
    for j, (law, name) in enumerate(LAWS):
        for i, (m, _) in enumerate(MODES):
            x0 = i + (j - 1) * w
            v = p[law][m]
            xs = [x0 + (k - (len(v) - 1) / 2) * 0.012 for k in range(len(v))]
            ax.scatter(xs, v, s=9, color=colours[law], alpha=0.75, linewidths=0, label=name if i == 0 else None)
            mu = sum(v) / len(v)
            ax.plot([x0 - 0.09, x0 + 0.09], [mu, mu], color="black", lw=1.2)
    ax.axhline(0, color="grey", lw=0.8)
    ax.set_xticks(range(len(MODES)))
    ax.set_xticklabels([lab for _, lab in MODES], fontsize=8)
    ax.set_ylabel("cant − no cant, held-out RMS (deg)")
    ax.set_title("(a) cant's paired advantage, 10 seeds per law", fontsize=9, loc="left")
    ax.legend(fontsize=8, frameon=False, loc="lower right")
    ax.set_ylim(top=0.5)

    labels = list(ch)
    bx.axhspan(5, 20, color="#dddddd", zorder=0, label="rule of thumb (H1), 5–20°")
    for i, lab in enumerate(labels):
        v = ch[lab]
        xs = [i + (k - (len(v) - 1) / 2) * 0.05 for k in range(len(v))]
        bx.scatter(xs, v, s=12, color="#555555", linewidths=0)
    bx.set_xticks(range(len(labels)))
    bx.set_xticklabels(labels, fontsize=7)
    bx.set_ylim(0, 80)
    bx.set_ylabel("chosen cant (deg)")
    bx.set_title("(b) the cant CMA-ES chose, per seed", fontsize=9, loc="left")
    bx.legend(fontsize=7, frameon=False, loc="upper right")
    fig.tight_layout()
    out = os.path.join(HERE, "fig_IV_V.png")
    fig.savefig(out, dpi=160)
    print("wrote", out)


if __name__ == "__main__":
    main()
