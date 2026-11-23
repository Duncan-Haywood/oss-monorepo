"""Milestone 3zb: when the held distortion is itself wrong, does adopting the windows' distortion pay?
Scores H280-H284 (LOG.md, milestone 3zb planned). Analysis only: milestone 3s's saved TUM solves, milestone
3za's blocks, rules and P(r) score, milestone 3y's scatter-only floored pool (applied to f and to D200).

Held model: the truth's f shifted by delta % with the distortion of a source H: another real calibration of
the same camera (cross pairs), the truth itself (control), or the board's k1, k2 scaled by (1 + eps) (sweep).
Six rules: 3za's five and "two gates" (f by 3za's gate, the windows' k1, k2 when their D200 pool differs from
the held D200 by more than half its sd). Writes summary.json and staledist.png.
Run (from research/sensing-selfcal): python3 experiments/m3zb_staledist/analyse.py
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


m3y = _load("m3y_an", os.path.join(EXP, "m3y_pp_dist", "analyse.py"))
m3za = _load("m3za_an", os.path.join(EXP, "m3za_joint", "analyse.py"))
KS, MODELS, DELTAS, BAND = m3za.KS, m3za.MODELS, m3za.DELTAS, m3za.BAND
RULES = m3za.RULES + ("two_gates",)
GATE_C = m3za.GATE_C
REFS = ("board", "tum", "tf")
EPS = tuple(range(-50, 51, 5))                            # % scale of the board's k1, k2 (sweep)


def d200(m):
    return m3y.d200(m["f"], m["k1"], m["k2"], m.get("k3", 0.0))


def updated(rule, pool, held):
    """(f, k1, k2, k3) after the rule. pool: {f, sd, k1, k2, D, sdD}; held: {f, k1, k2, k3}."""
    if rule != "two_gates":
        return m3za.updated(rule, pool, held)
    out = dict(held)
    if abs(pool["f"] - held["f"]) > GATE_C * pool["sd"]:
        out["f"] = pool["f"]
    if pool.get("sdD") is not None and abs(pool["D"] - d200(held)) > GATE_C * pool["sdD"]:
        out.update(k1=pool["k1"], k2=pool["k2"], k3=0.0)
    return out


def blocks(seq_rows, unit_rows, model, k):
    """3za's blocks plus the windows' D200 pool (scatter-only floored, history floor on D200)."""
    out = []
    for b in m3za.blocks(seq_rows, unit_rows, model, k):
        out.append(b)
    # attach the D200 pool to each block, in the same order m3za builds them
    i_out = 0
    for i in range(len(seq_rows) - k + 1):
        bl = seq_rows[i:i + k]
        if any(model not in r for r in bl):
            continue
        hist = [r for r in unit_rows if r["rank"] < bl[0]["rank"]]
        if m3y.scatter_pool([r[model]["f"] for r in bl], m3y.tau_hist(hist, model, "f")) is None:
            continue
        pd = m3y.scatter_pool([m3y.value(r, model, "D200") for r in bl], m3y.tau_hist(hist, model, "D200"))
        out[i_out]["D"], out[i_out]["sdD"] = (pd if pd is not None else (None, None))
        i_out += 1
    assert i_out == len(out)
    return out


def score(bl, truth_u, held_dist_u, radii=BAND, rules=RULES):
    """3za's score with a held distortion taken from held_dist_u (per unit {k1, k2, k3})."""
    xr = {u: m3za.rays(R, radii) for u, R in truth_u.items()}
    curve = {r: [] for r in rules}
    fires = {"f": 0, "D": 0, "n": 0}
    for dl in DELTAS:
        acc = {r: [] for r in rules}
        for sgn in ((1,) if dl == 0 else (1, -1)):
            vals = {r: [] for r in rules}
            for b in bl:
                T, H = truth_u[b["unit"]], held_dist_u[b["unit"]]
                held = {"f": T["f"] * (1 + sgn * dl / 100), "k1": H["k1"], "k2": H["k2"], "k3": H.get("k3", 0.0)}
                for r in rules:
                    vals[r].append(m3za.rms_p(updated(r, b, held), xr[b["unit"]], radii))
                if dl == 0:
                    u2 = updated("two_gates", b, held)
                    fires["n"] += 1
                    fires["f"] += u2["f"] != held["f"]
                    fires["D"] += u2["k1"] != held["k1"] or u2["k2"] != held["k2"]
            for r in rules:
                acc[r].append(np.median(vals[r]))
        for r in rules:
            curve[r].append(float(np.mean(acc[r])))
    best = np.minimum(curve["never"], curve["joint_always"])
    out = {"n": len(bl), "rules": {}, "two_gate_fires_d0": fires}
    for r in rules:
        reg = np.array(curve[r]) - best
        out["rules"][r] = {"med": curve[r], "worst_regret": float(reg.max()), "mean_regret": float(reg.mean()),
                           "argworst_delta": DELTAS[int(reg.argmax())]}
    out["minimax"] = min(rules, key=lambda r: out["rules"][r]["worst_regret"])
    return out


def scaled(ref_u, eps):
    return {u: {"k1": v["k1"] * (1 + eps / 100), "k2": v["k2"] * (1 + eps / 100), "k3": v.get("k3", 0.0) * (1 + eps / 100)}
            for u, v in ref_u.items()}


def all_blocks(R, S, m, k):
    seqs = sorted({r["seq"] for r in S})
    by_seq = {}
    for s in seqs:
        rs = sorted([r for r in S if r["seq"] == s], key=lambda r: r["rank"])
        ur = sorted([r for r in R if r["unit"] == rs[0]["unit"]], key=lambda r: r["rank"])
        by_seq[s] = blocks(rs, ur, m, k)
    return by_seq


def analyse(R, S, refs):
    res = {}
    for m in MODELS:
        res[m] = {}
        for k in KS:
            by_seq = all_blocks(R, S, m, k)
            allb = [b for bl in by_seq.values() for b in bl]
            cell = {"pairs": {f"{t}|{h}": score(allb, refs[t], refs[h]) for t in REFS for h in REFS}}
            if m == "est_c" and k == 5:
                cell["sweep"] = {e: score(allb, refs["board"], scaled(refs["board"], e)) for e in EPS}
                cell["by_seq"] = {f"{t}|{h}": {s: score(bl, refs[t], refs[h]) for s, bl in by_seq.items() if bl}
                                  for t in REFS for h in REFS}
            res[m][k] = cell
    return res


def breakeven(sweep, sign):
    for e in sorted((e for e in sweep if e * sign > 0), key=abs):
        r = sweep[e]["rules"]
        if r["joint_gate0.5"]["worst_regret"] < r["f_gate0.5"]["worst_regret"]:
            return abs(e)
    return None


def hypotheses(res):
    c = res["est_c"][5]
    P = c["pairs"]
    w = lambda key, r: P[key]["rules"][r]["worst_regret"]
    cross = [f"{t}|{h}" for t in REFS for h in REFS if t != h]
    h = {}
    wins = {p: w(p, "joint_gate0.5") < w(p, "f_gate0.5") for p in cross}
    h["H280"] = {"joint_gate_beats_f_gate": wins, "count": sum(wins.values()), "holds": sum(wins.values()) >= 4}
    h["H281"] = {"f_gate_worst": w("board|tum", "f_gate0.5"), "holds": w("board|tum", "f_gate0.5") > 1.0}
    mx = {r: max(w(p, r) for p in P) for r in RULES}
    best = min(mx, key=mx.get)
    h["H282"] = {"max_worst_over_pairs": mx, "best": best, "holds": best == "two_gates"}
    h["H283"] = {"two_gates": w("board|board", "two_gates"), "f_gate": w("board|board", "f_gate0.5"),
                 "holds": w("board|board", "two_gates") <= w("board|board", "f_gate0.5") + 0.3}
    bp, bn = breakeven(c["sweep"], 1), breakeven(c["sweep"], -1)
    h["H284"] = {"breakeven_pos": bp, "breakeven_neg": bn,
                 "holds": bp is not None and bn is not None and bp <= 20 and bn <= 20}
    return h


def main():
    m3s = _load("m3s_an", os.path.join(EXP, "m3s_causal", "analyse.py"))
    R, _ = m3s.rows()
    S = [r for r in R if r["scored"]]
    refs = m3za.references()
    res = analyse(R, S, refs)
    hyp = hypotheses(res)
    out = {"rules": {"K": KS, "deltas": DELTAS, "band": BAND, "gate_c": GATE_C, "eps": EPS,
                     "windows": len(S), "counted": len(R)},
           "references": refs, "hypotheses": hyp, "scores": res}
    with open(os.path.join(HERE, "summary.json"), "w") as fh:
        json.dump(out, fh, indent=1)
    for k, v in hyp.items():
        print(k, json.dumps(v))
    for m in MODELS:
        for k in KS:
            for p, s in res[m][k]["pairs"].items():
                print(f"{m:6s} K={k} {p:11s} n={s['n']:2d} mm={s['minimax']:13s} fires={s['two_gate_fires_d0']} | "
                      + " ".join(f"{r}={v['worst_regret']:.2f}" for r, v in s["rules"].items()))
    c = res["est_c"][5]
    for e, s in c["sweep"].items():
        print(f"sweep eps={e:+d}% mm={s['minimax']:13s} " + " ".join(
            f"{r}={v['worst_regret']:.2f}" for r, v in s["rules"].items()))
    for p, d in c["by_seq"].items():
        print("by_seq d0", p, " ".join(f"{s}: f_alw={v['rules']['f_always']['med'][0]:.2f} "
                                        f"joint_alw={v['rules']['joint_always']['med'][0]:.2f} "
                                        f"two={v['rules']['two_gates']['med'][0]:.2f}" for s, v in d.items()))
    figure(res)


def figure(res):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        print("matplotlib missing: staledist.png not drawn")
        return
    c = res["est_c"][5]
    sty = {"never": ("k", ":"), "f_always": ("#d62728", "--"), "f_gate0.5": ("#d62728", "-"),
           "joint_always": ("#1f77b4", "--"), "joint_gate0.5": ("#1f77b4", "-"), "two_gates": ("#2ca02c", "-")}
    fig, axes = plt.subplots(1, 2, figsize=(11, 3.8))
    pairs = list(c["pairs"])
    x = np.arange(len(pairs))
    wd = 0.8 / len(RULES)
    for i, r in enumerate(RULES):
        vals = [min(c["pairs"][p]["rules"][r]["worst_regret"], 6.0) for p in pairs]
        axes[0].bar(x + (i - len(RULES) / 2 + 0.5) * wd, vals, wd, color=sty[r][0],
                    alpha=0.45 if "always" in r or r == "never" else 1.0, label=r.replace("_", " "))
    axes[0].set_xticks(x)
    axes[0].set_xticklabels([p.replace("|", "\nheld ") for p in pairs], fontsize=7)
    axes[0].set_ylabel("worst regret, rms P 50-250 px (px; capped at 6)")
    axes[0].set_title("truth vs held distortion source (five windows, causal prior)", fontsize=9)
    axes[0].legend(fontsize=6, ncol=2)
    eps = sorted(c["sweep"])
    for r in RULES:
        if r == "never":
            continue
        col, ls = sty[r]
        axes[1].plot(eps, [c["sweep"][e]["rules"][r]["worst_regret"] for e in eps], ls, color=col, label=r.replace("_", " "))
    axes[1].set_xlabel("held distortion: the board's k1, k2 scaled by (1 + eps), eps (%)")
    axes[1].set_ylabel("worst regret (px)")
    axes[1].set_title("truth = board", fontsize=9)
    axes[1].legend(fontsize=7)
    fig.tight_layout()
    fig.savefig(os.path.join(HERE, "staledist.png"), dpi=130)


if __name__ == "__main__":
    main()
