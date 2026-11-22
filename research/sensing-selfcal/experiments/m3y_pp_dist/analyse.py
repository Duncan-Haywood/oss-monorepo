"""Milestone 3y: does milestone 3w's update rule for the focal length carry over to the principal point
(cx, cy) and the lens distortion (D200, the radial displacement 200 px from the principal point)?
Scores H260-H266 (LOG.md, milestone 3y planned). Analysis only: milestone 3s's saved TUM solves (through
../m3s_causal/analyse.py), milestone 3w's eight rules; nothing is re-solved.

The saved solves carry a solver sd for f only, so the pool here takes its bar from scatter: block mean, with
sd = sqrt(max(s^2, tau_h^2) / K), s^2 the block's sample variance and tau_h the MAD sd of the same quantity
over the camera's earlier counted windows (at least N_HIST of them, else the block is dropped).
Writes summary.json and ppdist.png.
Run (from research/sensing-selfcal): python3 experiments/m3y_pp_dist/analyse.py
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


m3w = _load("m3w_an", os.path.join(EXP, "m3w_update", "analyse.py"))
RULES, update, shrink_weight = m3w.RULES, m3w.update, m3w.shrink_weight
KS = (1, 3, 5, 8)
MODELS = ("est", "est_c", "est_cr")
N_HIST = 5
R_PX = 200.0
QUANTS = ("f", "cx", "cy", "D200")
GRID = {"f": tuple(round(0.5 * i, 1) for i in range(21)),        # % of the reference
        "cx": tuple(round(0.5 * i, 1) for i in range(21)),       # px
        "cy": tuple(round(0.5 * i, 1) for i in range(21)),       # px
        "D200": tuple(round(0.1 * i, 1) for i in range(21))}     # px
UNITS = ("fr1", "fr3")


def mad_sd(x):
    x = np.asarray(x, float)
    return float(1.4826 * np.median(np.abs(x - np.median(x))))


def d200(f, k1, k2, k3=0.0):
    rho2 = (R_PX / f) ** 2
    return R_PX * (k1 * rho2 + k2 * rho2 ** 2 + k3 * rho2 ** 3)


def quantity(v, q):
    if q == "D200":
        return d200(v["f"], v["k1"], v["k2"], v.get("k3", 0.0))
    return v[q]


def references():
    """Three references per unit, each with f, cx, cy, k1, k2 (k3 for TUM fr1)."""
    board = json.load(open(os.path.join(EXP, "m3i_principal", "tum_summary.json")))["board_reference"]
    # TUM's published calibration (Sturm et al. 2012), as in m4j_tum/tumunit.py TUM_CALIB:
    # fx, fy, cx, cy, d0..d4 (k1, k2, p1, p2, k3); f taken as the mean of fx and fy.
    tum_calib = {"fr1": (517.3, 516.5, 318.6, 255.3, 0.2624, -0.9531, -0.0054, 0.0026, 1.1633),
                 "fr3": (535.4, 539.2, 320.1, 247.6, 0.0, 0.0, 0.0, 0.0, 0.0)}
    anchors = json.load(open(os.path.join(EXP, "m4n_k2", "summary.json")))["anchors"]["k2"]
    out = {"board": {}, "tum": {}, "tf": {}}
    for u in UNITS:
        b = board[u]
        out["board"][u] = {k: b[k] for k in ("f", "cx", "cy", "k1", "k2")}
        t = tum_calib[u]
        out["tum"][u] = {"f": (t[0] + t[1]) / 2, "cx": t[2], "cy": t[3], "k1": t[4], "k2": t[5], "k3": t[8]}
        a = anchors[u]["intr"]
        out["tf"][u] = {"f": a[0], "cx": a[1], "cy": a[2], "k1": a[3], "k2": a[4]}
    return {n: {u: {q: quantity(v, q) for q in QUANTS} for u, v in R.items()} for n, R in out.items()}


def value(r, model, q):
    v = r.get(model) or r.get("est")
    return None if v is None else quantity(v, q)


def tau_hist(history, model, q, n_hist=N_HIST):
    vals = [value(r, model, q) for r in history]
    vals = [v for v in vals if v is not None]
    return mad_sd(vals) if len(vals) >= n_hist else None


def scatter_pool(v, tau_h):
    """Block mean and its sd from max(sample variance, tau_h^2) / K; None when K = 1 and no floor."""
    v = np.asarray(v, float)
    k = len(v)
    s2 = float(np.var(v, ddof=1)) if k > 1 else None
    if tau_h is None:
        return None
    var = tau_h ** 2 if s2 is None else max(s2, tau_h ** 2)
    return float(v.mean()), float(np.sqrt(var / k))


def blocks(seq_rows, unit_rows, model, k, q, refs):
    out, dropped = [], 0
    for i in range(len(seq_rows) - k + 1):
        b = seq_rows[i:i + k]
        if any(model not in r for r in b):
            continue
        hist = [r for r in unit_rows if r["rank"] < b[0]["rank"]]
        p = scatter_pool([quantity(r[model], q) for r in b], tau_hist(hist, model, q))
        if p is None:
            dropped += 1
            continue
        out.append({"seq": b[0]["seq"], "ref": {n: R[b[0]["unit"]][q] for n, R in refs.items()}, "pool": p})
    return out, dropped


def score(bl, q, ref="board", rules=RULES):
    """Median |e| of every rule over q's staleness grid, regret against the better of always and never."""
    R = np.array([b["ref"][ref] for b in bl])
    x = np.array([b["pool"][0] for b in bl]); sd = np.array([b["pool"][1] for b in bl])
    scale = (R / 100) if q == "f" else np.ones_like(R)     # f in % of the reference, the rest in px
    curve = {r: [] for r in rules}
    p95 = {r: [] for r in rules}
    for dl in GRID[q]:
        acc = {r: ([], []) for r in rules}
        for sgn in ((1,) if dl == 0 else (1, -1)):
            held = R + sgn * dl * scale
            for r in rules:
                e = np.abs(update(r, x, sd, held) - R) / scale
                acc[r][0].append(np.median(e)); acc[r][1].append(np.percentile(e, 95))
        for r in rules:
            curve[r].append(float(np.mean(acc[r][0]))); p95[r].append(float(np.mean(acc[r][1])))
    best = np.minimum(curve["always"], curve["never"])
    out = {"n": len(bl), "rules": {}}
    for r in rules:
        reg = np.array(curve[r]) - best
        out["rules"][r] = {"med": curve[r], "worst_regret": float(reg.max()), "mean_regret": float(reg.mean()),
                           "argworst_delta": GRID[q][int(reg.argmax())], "worst_p95": float(max(p95[r]))}
    out["minimax"] = min(rules, key=lambda r: out["rules"][r]["worst_regret"])
    out["always_med0"] = curve["always"][0]
    out["med_sd"] = float(np.median(sd))
    return out


def loso(bl_by_seq, q, ref="board"):
    """Milestone 3x's leave-one-sequence-out: choose the minimax rule on two sequences, score on the third."""
    out = {}
    for s in bl_by_seq:
        train = [b for t, bl in bl_by_seq.items() if t != s for b in bl]
        chosen = score(train, q, ref)["minimax"]
        held = score(bl_by_seq[s], q, ref)
        out[s] = {"chosen": chosen, "held_out_worst_regret": held["rules"][chosen]["worst_regret"],
                  "always": held["rules"]["always"]["worst_regret"], "gate2.0": held["rules"]["gate2.0"]["worst_regret"]}
    return out


def offsets(bl_by_seq, refs):
    """Added after scoring (unscored): per-sequence median signed pool - reference, and rms z of the pool."""
    out = {}
    for ref in refs:
        d = {s: float(np.median([b["pool"][0] - b["ref"][ref] for b in bl])) for s, bl in bl_by_seq.items()}
        z = [(b["pool"][0] - b["ref"][ref]) / b["pool"][1] for bl in bl_by_seq.values() for b in bl]
        out[ref] = {"median_offset": d, "rms_z": float(np.sqrt(np.mean(np.square(z))))}
    return out


def analyse(R, S, refs):
    seqs = sorted({r["seq"] for r in S})
    res, extra = {}, {}
    for q in QUANTS:
        res[q] = {}
        for m in MODELS:
            res[q][m] = {}
            for k in KS:
                by_seq, drop = {}, 0
                for s in seqs:
                    rs = sorted([r for r in S if r["seq"] == s], key=lambda r: r["rank"])
                    ur = sorted([r for r in R if r["unit"] == rs[0]["unit"]], key=lambda r: r["rank"])
                    by_seq[s], d = blocks(rs, ur, m, k, q, refs)
                    drop += d
                allb = [b for bl in by_seq.values() for b in bl]
                res[q][m][k] = {ref: score(allb, q, ref) for ref in refs}
                res[q][m][k]["dropped"] = drop
                if m == "est_c" and k == 5:
                    extra[q] = loso(by_seq, q)
                    res[q][m][k]["offsets"] = offsets(by_seq, refs)
    return res, extra


def hypotheses(res):
    g = lambda q, ref="board": res[q]["est_c"][5][ref]
    w = lambda q, rule, ref="board": g(q, ref)["rules"][rule]["worst_regret"]
    h = {}
    h["H260"] = {"minimax": g("f")["minimax"], "gate0.5": w("f", "gate0.5"),
                 "holds": g("f")["minimax"] == "gate0.5" and w("f", "gate0.5") <= 0.84}
    for name, q in (("H261", "cx"), ("H263", "D200")):
        mm = g(q)["minimax"]
        h[name] = {"minimax": mm, "minimax_worst": w(q, mm), "always": w(q, "always"), "gate2.0": w(q, "gate2.0"),
                   "holds": w(q, mm) < w(q, "always") and w(q, mm) < w(q, "gate2.0")}
    mm = g("cy")["minimax"]
    h["H262"] = {"minimax": mm, "minimax_worst": w("cy", mm),
                 "holds": mm == "never" or (mm.startswith("gate") and float(mm[4:]) >= 1.0)}
    gaps = {q: w(q, "gate0.5") - w(q, g(q)["minimax"]) for q in ("cx", "cy", "D200")}
    h["H264"] = {"gap_gate0.5_to_minimax": gaps,
                 "holds": gaps["cx"] <= 0.5 and gaps["cy"] <= 0.5 and gaps["D200"] <= 0.2}
    worse = {q: w(q, "gate2.0") > w(q, "always") for q in ("cx", "cy", "D200")}
    h["H265"] = {"gate2_worse_than_always": worse, "holds": sum(worse.values()) >= 2}
    mms = {ref: g("D200", ref)["minimax"] for ref in ("board", "tum", "tf")}
    h["H266"] = {"minimax_by_ref": mms, "holds": len(set(mms.values())) == 1}
    return h


def main():
    m3s = _load("m3s_an", os.path.join(EXP, "m3s_causal", "analyse.py"))
    R, _ = m3s.rows()
    S = [r for r in R if r["scored"]]
    refs = references()
    res, lo = analyse(R, S, refs)
    hyp = hypotheses(res)
    out = {"rules": {"K": KS, "grid": GRID, "r_px": R_PX, "n_hist": N_HIST, "windows": len(S), "counted": len(R)},
           "references": refs, "hypotheses": hyp, "loso_est_c_K5_board": lo, "scores": res}
    with open(os.path.join(HERE, "summary.json"), "w") as fh:
        json.dump(out, fh, indent=1)
    print("references", json.dumps(refs))
    for k, v in hyp.items():
        print(k, json.dumps(v))
    print("loso", json.dumps(lo))
    for q in QUANTS:
        print("offsets", q, json.dumps(res[q]["est_c"][5]["offsets"]))
    for q in QUANTS:
        for m in MODELS:
            for k in KS:
                for ref in refs:
                    s = res[q][m][k][ref]
                    print(f"{q:4s} {m:6s} K={k} {ref:5s} n={s['n']:2d} drop={res[q][m][k]['dropped']} "
                          f"minimax={s['minimax']:8s} a0={s['always_med0']:.2f} sd={s['med_sd']:.2f} | " + " ".join(
                              f"{rr} {v['worst_regret']:.2f}@{v['argworst_delta']}/{v['mean_regret']:.2f}"
                              for rr, v in s["rules"].items()))
    figure(res)


def figure(res):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        print("matplotlib missing: ppdist.png not drawn")
        return
    fig, axes = plt.subplots(1, 3, figsize=(12, 3.6))
    sty = {"never": ("k", ":"), "always": ("#7f7f7f", "--"), "gate2.0": ("#d62728", "-"),
           "gate0.5": ("#2ca02c", "-"), "shrink": ("#1f77b4", "-")}
    for ax, q in zip(axes, ("cx", "cy", "D200")):
        s = res[q]["est_c"][5]["board"]["rules"]
        for rr, (col, ls) in sty.items():
            ax.plot(GRID[q], s[rr]["med"], ls, color=col, label=rr)
        ax.set_xlabel(f"staleness of the held {q}, |delta| (px)")
        ax.set_ylabel("median |error| after the update (px)")
        ax.set_title(f"{q}: causal prior (est_c), five windows", fontsize=9)
        ax.legend(fontsize=7)
    fig.tight_layout()
    fig.savefig(os.path.join(HERE, "ppdist.png"), dpi=130)


if __name__ == "__main__":
    main()
