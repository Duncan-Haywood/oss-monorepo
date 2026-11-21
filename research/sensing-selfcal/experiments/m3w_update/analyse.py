"""Milestone 3w: which rule should a robot use to update the focal length it holds? Scores H247-H253
(LOG.md, milestone 3w planned). Re-uses milestone 3v's blocks (milestone 3s's real TUM solves, pooled with
milestone 3u's history floor); the held value is the board calibration shifted by delta, nothing is re-solved.
Rules: never adopt, always adopt, gate(c) (adopt when |pool - held| > c sd), and shrink, the positive-part
empirical-Bayes blend held + w (pool - held) with w = max(0, 1 - sd^2 / (pool - held)^2).
Writes summary.json and update.png.
Run (from research/sensing-selfcal): python3 experiments/m3w_update/analyse.py
"""
import importlib.util
import json
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
EXP = os.path.join(HERE, "..")


def _load(name, path):
    s = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(s)
    s.loader.exec_module(m)
    return m


m3v = _load("m3v_an", os.path.join(EXP, "m3v_stale", "analyse.py"))
KS, MODELS, DELTAS = m3v.KS, m3v.MODELS, m3v.DELTAS
CS = (0.5, 1.0, 1.5, 2.0, 3.0)
RULES = ("never", "always") + tuple(f"gate{c}" for c in CS) + ("shrink",)
POOL = "tf"


def update(rule, x, sd, held):
    """The value the robot holds after the rule, elementwise."""
    d = x - held
    if rule == "never":
        return held.copy()
    if rule == "always":
        return x.copy()
    if rule.startswith("gate"):
        c = float(rule[4:])
        return np.where(np.abs(d) > c * sd, x, held)
    if rule == "shrink":
        return held + shrink_weight(d, sd) * d
    raise ValueError(rule)


def shrink_weight(d, sd):
    d2 = np.asarray(d, float) ** 2
    with np.errstate(divide="ignore", invalid="ignore"):
        w = np.where(d2 > 0, 1.0 - np.asarray(sd, float) ** 2 / d2, 0.0)
    return np.clip(w, 0.0, 1.0)


def score(bl, ref="board", pool=POOL):
    """Median and 95th-percentile |e| (%) of every rule over the delta grid, and regret against the better
    of always and never at each delta."""
    R = np.array([b["ref"][ref] for b in bl])
    x = np.array([b[pool][0] for b in bl]); sd = np.array([b[pool][1] for b in bl])
    curve = {r: {"med": [], "p95": [], "w": []} for r in RULES}
    for dl in DELTAS:
        acc = {r: ([], []) for r in RULES}
        ws = []
        for sgn in ((1,) if dl == 0 else (1, -1)):
            held = R * (1 + sgn * dl / 100)
            ws.append(float(np.mean(shrink_weight(x - held, sd))))
            for r in RULES:
                e = np.abs(update(r, x, sd, held) - R) / R * 100
                acc[r][0].append(np.median(e)); acc[r][1].append(np.percentile(e, 95))
        for r in RULES:
            curve[r]["med"].append(float(np.mean(acc[r][0])))
            curve[r]["p95"].append(float(np.mean(acc[r][1])))
            curve[r]["w"].append(float(np.mean(ws)))
    best = np.minimum(curve["always"]["med"], curve["never"]["med"])
    out = {"n": len(bl), "rules": {}}
    for r in RULES:
        reg = np.array(curve[r]["med"]) - best
        out["rules"][r] = {"med": curve[r]["med"], "p95": curve[r]["p95"],
                           "worst_regret": float(reg.max()), "mean_regret": float(reg.mean()),
                           "argworst_delta": DELTAS[int(reg.argmax())], "worst_p95": float(max(curve[r]["p95"]))}
    out["shrink_w"] = {"0.0": curve["shrink"]["w"][0], "10.0": curve["shrink"]["w"][-1]}
    out["minimax"] = min(RULES, key=lambda r: out["rules"][r]["worst_regret"])
    return out


def analyse(R, S, refs):
    seqs = sorted({r["seq"] for r in S})
    res = {}
    for m in MODELS:
        res[m] = {}
        for k in KS:
            allb = []
            for s in seqs:
                rs = sorted([r for r in S if r["seq"] == s], key=lambda r: r["rank"])
                ur = sorted([r for r in R if r["unit"] == rs[0]["unit"]], key=lambda r: r["rank"])
                allb += m3v.blocks(rs, ur, m, k, refs)
            res[m][k] = {ref: score(allb, ref) for ref in refs}
    return res


def hypotheses(res):
    g = lambda m, k, ref="board": res[m][k][ref]
    r = lambda m, k, rule: g(m, k)["rules"][rule]
    h = {}
    w = r("est_c", 5, "gate1.0")["worst_regret"]
    h["H247"] = {"gate1_worst_regret": w, "always_worst_regret": r("est_c", 5, "always")["worst_regret"], "holds": w <= 1.0}
    a, b = r("est_c", 5, "shrink")["worst_regret"], r("est_c", 5, "always")["worst_regret"]
    h["H248"] = {"shrink": a, "always": b, "holds": a < b}
    m0 = r("est_c", 5, "shrink")["med"][0]
    h["H249"] = {"shrink_med_e_delta0": m0, "always": r("est_c", 5, "always")["med"][0], "holds": m0 <= 0.6}
    p = r("est_c", 5, "shrink")["worst_p95"]
    h["H250"] = {"shrink_worst_p95": p, "holds": p <= 4.0}
    w1 = r("est_c", 1, "shrink")["worst_regret"]
    h["H251"] = {"shrink_K1_worst_regret": w1, "holds": w1 <= 2.0}
    mm = g("est_c", 3)["minimax"]
    h["H252"] = {"minimax_K3": mm, "holds": mm == "shrink" or (mm.startswith("gate") and float(mm[4:]) <= 1.0)}
    mms = {ref: g("est_c", 5, ref)["minimax"] for ref in res["est_c"][5]}
    h["H253"] = {"minimax_by_ref": mms, "holds": len(set(mms.values())) == 1}
    return h


def main():
    m3s = _load("m3s_an", os.path.join(EXP, "m3s_causal", "analyse.py"))
    R, _ = m3s.rows()
    S = [r for r in R if r["scored"]]
    res = analyse(R, S, m3s.REFS)
    hyp = hypotheses(res)
    out = {"rules": {"K": KS, "deltas_pct": DELTAS, "gate_c": CS, "pool": POOL, "windows": len(S), "counted": len(R)},
           "hypotheses": hyp, "scores": res}
    with open(os.path.join(HERE, "summary.json"), "w") as fh:
        json.dump(out, fh, indent=1)
    for k, v in hyp.items():
        print(k, json.dumps(v))
    for m in MODELS:
        for k in KS:
            for ref in m3s.REFS:
                q = res[m][k][ref]
                print(f"{m:6s} K={k} {ref:5s} n={q['n']:2d} minimax={q['minimax']:8s} w0={q['shrink_w']['0.0']:.2f} "
                      f"w10={q['shrink_w']['10.0']:.2f} | " + " ".join(
                          f"{rr} {v['worst_regret']:.2f}@{v['argworst_delta']}/{v['mean_regret']:.2f}/p95 {v['worst_p95']:.1f}"
                          for rr, v in q["rules"].items()))
    figure(res)


def figure(res):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        print("matplotlib missing: update.png not drawn")
        return
    fig, axes = plt.subplots(1, 2, figsize=(10, 3.8))
    q = res["est_c"][5]["board"]["rules"]
    sty = {"never": ("k", ":"), "always": ("#7f7f7f", "--"), "gate2.0": ("#d62728", "-"),
           "gate1.0": ("#ff7f0e", "-"), "shrink": ("#1f77b4", "-")}
    for rr, (col, ls) in sty.items():
        axes[0].plot(DELTAS, q[rr]["med"], ls, color=col, label=rr)
        axes[1].plot(DELTAS, q[rr]["p95"], ls, color=col, label=rr)
    axes[0].set_xlabel("staleness of the held f, |delta| (%)"); axes[0].set_ylabel("median |e| after the update (%)")
    axes[1].set_xlabel("staleness of the held f, |delta| (%)"); axes[1].set_ylabel("95th-percentile |e| (%)")
    axes[0].set_title("causal prior (est_c), five windows: median error kept", fontsize=9)
    axes[1].set_title("tail of the error kept", fontsize=9)
    axes[0].set_ylim(0, 6); axes[1].set_ylim(0, 11)
    for a in axes:
        a.legend(fontsize=7)
    fig.tight_layout()
    fig.savefig(os.path.join(HERE, "update.png"), dpi=130)


if __name__ == "__main__":
    main()
