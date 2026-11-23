"""Milestone 3zc: a bias-corrected distortion gate (experiments/m3zc_biasgate).
Scores H285-H289 (LOG.md, milestone 3zc planned). Analysis only: milestone 3s's saved TUM solves, milestone
3zb's blocks, pools, references and P(r) score.

Milestone 3zb's two-gate rule fired its distortion gate in 30 of 31 blocks even when the held distortion was the
truth, because the windows' D200 is biased low (milestone 3y). Here the gate tests D200(pool) - beta against
D200(held), with beta from
  louo: median (window D200 - board D200) over the other camera's scored windows (fleet, leave one unit out);
  loso: the same over the other sequences' scored windows (fleet, leave one sequence out);
  comm: median over the unit's own history windows of (window D200 - D200 of the commissioning model), the
        commissioning model being the held distortion with the truth's f (a change detector).
On firing the windows' k1, k2 are adopted uncorrected and k3 dropped, as in 3zb.
Writes summary.json and biasgate.png.  Run (from research/sensing-selfcal): python3 experiments/m3zc_biasgate/analyse.py
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
m3zb = _load("m3zb_an", os.path.join(EXP, "m3zb_staledist", "analyse.py"))
KS, MODELS, DELTAS, BAND, GATE_C = m3za.KS, m3za.MODELS, m3za.DELTAS, m3za.BAND, m3za.GATE_C
REFS, EPS, d200 = m3zb.REFS, m3zb.EPS, m3zb.d200
CORR = ("louo", "loso", "comm")
PREREG = m3zb.RULES + tuple(f"two_gates_{c}" for c in CORR)
POSTHOC_C = 2.0                         # unscored, chosen after the first run: a 2-sd distortion bar
POSTHOC = ("two_gates_louo_c2", "two_gates_comm_c2")
RULES = PREREG + POSTHOC
GATED = ("two_gates",) + tuple(f"two_gates_{c}" for c in CORR) + POSTHOC


def beta_for(rule, pool, comm):
    """The bias subtracted from the pool's D200 before the gate; None means no gate."""
    if rule == "two_gates":
        return 0.0
    c = rule[len("two_gates_"):].replace("_c2", "")
    if c == "comm":
        return None if pool.get("histD") is None else pool["histD"] - d200(comm)
    return pool["beta"][c]


def updated(rule, pool, held, comm=None):
    """(f, k1, k2, k3) after the rule. comm: the commissioning model {f, k1, k2, k3} (for two_gates_comm)."""
    if rule not in GATED:
        return m3zb.updated(rule, pool, held)
    out = dict(held)
    if abs(pool["f"] - held["f"]) > GATE_C * pool["sd"]:
        out["f"] = pool["f"]
    b = beta_for(rule, pool, comm)
    cD = POSTHOC_C if rule.endswith("_c2") else GATE_C
    if b is not None and pool.get("sdD") is not None and abs(pool["D"] - b - d200(held)) > cD * pool["sdD"]:
        out.update(k1=pool["k1"], k2=pool["k2"], k3=0.0)
    return out


def blocks(seq_rows, unit_rows, model, k):
    """3zb's blocks (f pool, k1, k2 means, D200 pool) plus the median D200 of the unit's history windows."""
    out = m3zb.blocks(seq_rows, unit_rows, model, k)
    j = 0
    for i in range(len(seq_rows) - k + 1):
        bl = seq_rows[i:i + k]
        if any(model not in r for r in bl):
            continue
        hist = [r for r in unit_rows if r["rank"] < bl[0]["rank"]]
        if m3y.scatter_pool([r[model]["f"] for r in bl], m3y.tau_hist(hist, model, "f")) is None:
            continue
        hv = [v for v in (m3y.value(r, model, "D200") for r in hist) if v is not None]
        out[j]["histD"] = float(np.median(hv)) if len(hv) >= m3y.N_HIST else None
        j += 1
    assert j == len(out)
    return out


def fleet_betas(S, model, board):
    """beta per sequence: louo (other unit's windows) and loso (other sequences' windows), against the board."""
    res = {}
    dev = [(r["seq"], r["unit"], m3y.value(r, model, "D200") - d200(board[r["unit"]]))
           for r in S if m3y.value(r, model, "D200") is not None]
    for s in sorted({r["seq"] for r in S}):
        u = next(r["unit"] for r in S if r["seq"] == s)
        lo_u = [d for (q, v, d) in dev if v != u]
        lo_s = [d for (q, v, d) in dev if q != s]
        own = [d for (q, v, d) in dev if q == s]
        res[s] = {"louo": float(np.median(lo_u)) if lo_u else None,
                  "loso": float(np.median(lo_s)) if lo_s else None,
                  "own": float(np.median(own)) if own else None, "n_louo": len(lo_u), "n_loso": len(lo_s)}
    return res


def score(bl, truth_u, held_dist_u, radii=BAND, rules=RULES):
    """3zb's score with the nine rules; distortion-gate firing counts at delta = 0 for every gated rule."""
    xr = {u: m3za.rays(R, radii) for u, R in truth_u.items()}
    curve = {r: [] for r in rules}
    fires = {r: 0 for r in rules if r in GATED}
    n0 = 0
    for dl in DELTAS:
        acc = {r: [] for r in rules}
        for sgn in ((1,) if dl == 0 else (1, -1)):
            vals = {r: [] for r in rules}
            for b in bl:
                T, H = truth_u[b["unit"]], held_dist_u[b["unit"]]
                dist = {"k1": H["k1"], "k2": H["k2"], "k3": H.get("k3", 0.0)}
                held = dict(f=T["f"] * (1 + sgn * dl / 100), **dist)
                comm = dict(f=T["f"], **dist)
                for r in rules:
                    u = updated(r, b, held, comm)
                    vals[r].append(m3za.rms_p(u, xr[b["unit"]], radii))
                    if dl == 0 and r in fires:
                        fires[r] += u["k1"] != held["k1"] or u["k2"] != held["k2"]
                n0 += dl == 0
            for r in rules:
                acc[r].append(np.median(vals[r]))
        for r in rules:
            curve[r].append(float(np.mean(acc[r])))
    best = np.minimum(curve["never"], curve["joint_always"])
    out = {"n": len(bl), "rules": {}, "dist_fires_d0": fires, "n_d0": n0}
    for r in rules:
        reg = np.array(curve[r]) - best
        out["rules"][r] = {"med": curve[r], "worst_regret": float(reg.max()), "mean_regret": float(reg.mean()),
                           "argworst_delta": DELTAS[int(reg.argmax())]}
    out["minimax"] = min((r for r in rules if r in PREREG), key=lambda r: out["rules"][r]["worst_regret"])
    return out


def analyse(R, S, refs):
    res, betas = {}, {}
    for m in MODELS:
        res[m], betas[m] = {}, fleet_betas(S, m, refs["board"])
        for k in KS:
            by_seq = _all_blocks(R, S, m, k)
            allb = []
            for s, bl in by_seq.items():
                for b in bl:
                    b["beta"] = betas[m][s]
                allb += bl
            cell = {"pairs": {f"{t}|{h}": score(allb, refs[t], refs[h]) for t in REFS for h in REFS}}
            if m == "est_c" and k == 5:
                cell["sweep"] = {e: score(allb, refs["board"], m3zb.scaled(refs["board"], e)) for e in EPS}
            res[m][k] = cell
    return res, betas


def _all_blocks(R, S, m, k):
    out = {}
    for s in sorted({r["seq"] for r in S}):
        rs = sorted([r for r in S if r["seq"] == s], key=lambda r: r["rank"])
        ur = sorted([r for r in R if r["unit"] == rs[0]["unit"]], key=lambda r: r["rank"])
        out[s] = blocks(rs, ur, m, k)
    return out


def diagnostics(R, S, refs, betas, model="est_c", k=5):
    """Unscored, post hoc: why the corrected gates still fire. z = |D200 test statistic| / sdD per block for the
    uncorrected, LOUO and commissioning tests at delta = 0 with T = H = board; the bar multiple at which each would
    fire in at most a third of the blocks; and the within-sequence spread of the block pools against their sdD."""
    by_seq = _all_blocks(R, S, model, k)
    z = {"two_gates": [], "two_gates_louo": [], "two_gates_comm": [], "own_seq_median": []}
    spread = {}
    for s, bl in by_seq.items():
        Ds = [b["D"] for b in bl if b.get("sdD") is not None]
        sds = [b["sdD"] for b in bl if b.get("sdD") is not None]
        if not Ds:
            continue
        spread[s] = {"n": len(Ds), "sd_of_block_D": float(np.std(Ds, ddof=1)) if len(Ds) > 1 else None,
                     "median_sdD": float(np.median(sds)), "range_D": [float(min(Ds)), float(max(Ds))]}
        med = float(np.median(Ds))
        for b in bl:
            if b.get("sdD") is None:
                continue
            hd = d200(refs["board"][b["unit"]])
            z["two_gates"].append(abs(b["D"] - hd) / b["sdD"])
            z["two_gates_louo"].append(abs(b["D"] - betas[model][s]["louo"] - hd) / b["sdD"])
            if b.get("histD") is not None:
                z["two_gates_comm"].append(abs(b["D"] - b["histD"]) / b["sdD"])
            z["own_seq_median"].append(abs(b["D"] - med) / b["sdD"])
    out = {"spread": spread, "z": {}}
    for q, v in z.items():
        v = np.sort(v)
        out["z"][q] = {"n": len(v), "median": float(np.median(v)), "c_for_third": float(np.quantile(v, 2 / 3)),
                       "max": float(v.max())}
    return out


def hypotheses(res):
    c = res["est_c"][5]
    P = c["pairs"]
    w = lambda key, r: P[key]["rules"][r]["worst_regret"]
    h = {}
    ctl = P["board|board"]
    f_l = ctl["dist_fires_d0"]["two_gates_louo"]
    h["H285"] = {"fires": f_l, "n": ctl["n"], "uncorrected_fires": ctl["dist_fires_d0"]["two_gates"], "holds": f_l <= 10}
    h["H286"] = {"two_gates_louo": w("board|board", "two_gates_louo"), "f_gate": w("board|board", "f_gate0.5"),
                 "holds": w("board|board", "two_gates_louo") <= w("board|board", "f_gate0.5") + 0.3}
    mx = {r: max(w(p, r) for p in P) for r in PREREG}
    best = min(mx, key=mx.get)
    h["H287"] = {"max_worst_over_pairs": mx, "best": best, "holds": best == "two_gates_louo"}
    cf = {p: P[p]["dist_fires_d0"]["two_gates_comm"] for p in P}
    h["H288"] = {"fires": cf, "n": ctl["n"], "holds": max(cf.values()) <= 5}
    sw = c["sweep"]
    fe = {e: sw[e]["dist_fires_d0"]["two_gates_louo"] for e in (-50, 50)}
    h["H289"] = {"fires": fe, "n": sw[50]["n"], "holds": all(v >= 2 * sw[50]["n"] / 3 for v in fe.values())}
    return h


def main():
    m3s = _load("m3s_an", os.path.join(EXP, "m3s_causal", "analyse.py"))
    R, _ = m3s.rows()
    S = [r for r in R if r["scored"]]
    refs = m3za.references()
    res, betas = analyse(R, S, refs)
    hyp = hypotheses(res)
    diag = diagnostics(R, S, refs, betas)
    out = {"diagnostics": diag, "rules": {"K": KS, "deltas": DELTAS, "band": BAND, "gate_c": GATE_C, "eps": EPS,
                     "windows": len(S), "counted": len(R), "rules": RULES},
           "betas": betas, "hypotheses": hyp, "scores": res}
    with open(os.path.join(HERE, "summary.json"), "w") as fh:
        json.dump(out, fh, indent=1)
    for k, v in hyp.items():
        print(k, json.dumps(v))
    print("diagnostics", json.dumps(diag))
    for m in MODELS:
        print("betas", m, json.dumps({s: {q: (round(x, 3) if isinstance(x, float) else x) for q, x in v.items()}
                                      for s, v in betas[m].items()}))
    for m in MODELS:
        for k in KS:
            for p, s in res[m][k]["pairs"].items():
                print(f"{m:6s} K={k} {p:11s} n={s['n']:2d} mm={s['minimax']:16s} fires={s['dist_fires_d0']} | "
                      + " ".join(f"{r}={v['worst_regret']:.2f}" for r, v in s["rules"].items()))
    c = res["est_c"][5]
    for e, s in c["sweep"].items():
        print(f"sweep eps={e:+d}% mm={s['minimax']:16s} fires={s['dist_fires_d0']} " + " ".join(
            f"{r}={v['worst_regret']:.2f}" for r, v in s["rules"].items() if r in GATED + ("f_gate0.5", "joint_gate0.5")))
    figure(res)


def figure(res):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        print("matplotlib missing: biasgate.png not drawn")
        return
    c = res["est_c"][5]
    show = ("f_gate0.5", "joint_gate0.5", "two_gates", "two_gates_louo", "two_gates_loso", "two_gates_comm")
    col = {"f_gate0.5": "#d62728", "joint_gate0.5": "#1f77b4", "two_gates": "#2ca02c",
           "two_gates_louo": "#9467bd", "two_gates_loso": "#8c564b", "two_gates_comm": "#ff7f0e"}
    fig, axes = plt.subplots(1, 2, figsize=(11, 3.8))
    pairs = list(c["pairs"])
    x = np.arange(len(pairs))
    wd = 0.8 / len(show)
    for i, r in enumerate(show):
        axes[0].bar(x + (i - len(show) / 2 + 0.5) * wd, [c["pairs"][p]["rules"][r]["worst_regret"] for p in pairs],
                    wd, color=col[r], label=r.replace("_", " "))
    axes[0].set_xticks(x)
    axes[0].set_xticklabels([p.replace("|", "\nheld ") for p in pairs], fontsize=7)
    axes[0].set_ylabel("worst regret, rms P 50-250 px (px)")
    axes[0].set_title("truth vs held distortion source (five windows, causal prior)", fontsize=9)
    axes[0].legend(fontsize=6, ncol=2)
    eps = sorted(c["sweep"])
    for r in show:
        axes[1].plot(eps, [c["sweep"][e]["rules"][r]["worst_regret"] for e in eps], color=col[r], label=r.replace("_", " "))
    axes[1].set_xlabel("held distortion: the board's k1, k2 scaled by (1 + eps), eps (%)")
    axes[1].set_ylabel("worst regret (px)")
    axes[1].set_title("truth = board", fontsize=9)
    axes[1].legend(fontsize=7)
    fig.tight_layout()
    fig.savefig(os.path.join(HERE, "biasgate.png"), dpi=130)


if __name__ == "__main__":
    main()
