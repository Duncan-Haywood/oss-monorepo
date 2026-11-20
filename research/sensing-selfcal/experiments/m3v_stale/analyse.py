"""Milestone 3v: does milestone 3u's floored random-effects pool tell a robot that the focal length it holds
is stale? Scores H239-H246 (LOG.md, milestone 3v planned). The held value is the board calibration shifted
by delta; the windows are milestone 3s's real TUM solves (read through ../m3s_causal/analyse.py), so nothing
is re-solved and nothing about the solver's response to a changed lens is assumed.
Also tests tf_p, a history floor from prior-steadied windows only.
Writes summary.json and stale.png.
Run (from research/sensing-selfcal): python3 experiments/m3v_stale/analyse.py
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


m3u = _load("m3u_an", os.path.join(EXP, "m3u_taufloor", "analyse.py"))
dl_pool, floored_pool, mad_sd = m3u.dl_pool, m3u.floored_pool, m3u.mad_sd
KS = m3u.KS
MODELS = m3u.MODELS
N_HIST = m3u.N_HIST
POOLS = ("re", "tf", "q1", "tfp")
DELTAS = tuple(round(0.5 * i, 1) for i in range(21))      # |delta| in %, 0 .. 10
Z_GATE = 2.0
POWER = 0.8


def tau2_own(history, model, n_hist=N_HIST):
    """Floor from earlier windows that carry the model's own estimate only (no `est` fallback)."""
    vals = [(r[model]["f"], r[model]["sd_rel"] * r[model]["f"]) for r in history if r.get(model)]
    if len(vals) < n_hist:
        return None
    f = np.array([v[0] for v in vals]); sd = np.array([v[1] for v in vals])
    return max(0.0, mad_sd(f) ** 2 - float(np.median(sd ** 2)))


def blocks(seq_rows, unit_rows, model, k, refs):
    out = []
    for i in range(len(seq_rows) - k + 1):
        b = seq_rows[i:i + k]
        if any(model not in r for r in b):
            continue
        f = [r[model]["f"] for r in b]
        sd = [r[model]["sd_rel"] * r[model]["f"] for r in b]
        hist = [r for r in unit_rows if r["rank"] < b[0]["rank"]]
        mr, sr, _ = dl_pool(f, sd)
        mt, st, _, _ = floored_pool(f, sd, m3u.tau2_hist(hist, model))
        to = tau2_own(hist, model)
        mp, sp, _, _ = floored_pool(f, sd, to)
        out.append({"ref": {n: R[b[0]["unit"]] for n, R in refs.items()},
                    "re": (mr, sr), "tf": (mt, st), "q1": (mr, float(np.hypot(sr, m3u.Q1 * mr))),
                    "tfp": (mp, sp), "tfp_floor": to is not None})
    return out


def gate(bl, pool, ref="board"):
    """Power, decision errors and honesty of one pool over the delta grid."""
    R = np.array([b["ref"][ref] for b in bl])
    x = np.array([b[pool][0] for b in bl]); sd = np.array([b[pool][1] for b in bl])
    e_adopt = np.abs(x - R) / R * 100
    z = (x - R) / sd
    out = {"n": len(bl), "rms_z": float(np.sqrt(np.mean(z ** 2))),
           "always_adopt": {"med": float(np.median(e_adopt)), "p95": float(np.percentile(e_adopt, 95))},
           "curve": {}}
    for d in DELTAS:
        pw, med, p95 = [], [], []
        for sgn in ((1,) if d == 0 else (1, -1)):
            held = R * (1 + sgn * d / 100)
            flag = np.abs(x - held) > Z_GATE * sd
            e = np.where(flag, e_adopt, np.abs(held - R) / R * 100)
            pw.append(flag.mean()); med.append(np.median(e)); p95.append(np.percentile(e, 95))
        out["curve"][str(d)] = {"power": float(np.mean(pw)), "med_e": float(np.mean(med)), "p95_e": float(np.mean(p95))}
    ok = [d for d in DELTAS if d > 0 and out["curve"][str(d)]["power"] >= POWER]
    out["false_alarm"] = out["curve"]["0.0"]["power"]
    out["mds"] = min(ok) if ok else None
    out["worst_med_e"] = max(c["med_e"] for c in out["curve"].values())
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
                allb += blocks(rs, ur, m, k, refs)
            res[m][k] = {ref: {p: gate(allb, p, ref) for p in POOLS} for ref in refs}
            res[m][k]["n_tfp_floor"] = int(sum(b["tfp_floor"] for b in allb))
    return res


def hypotheses(res):
    g = lambda m, k, p: res[m][k]["board"][p]
    c = lambda m, k, p, d: g(m, k, p)["curve"][str(d)]
    h = {}
    fa = g("est_c", 5, "tf")["false_alarm"]
    h["H239"] = {"tf": fa, "re": g("est_c", 5, "re")["false_alarm"], "holds": fa <= 0.10}
    p5 = c("est_c", 3, "tf", 5.0)["power"]
    h["H240"] = {"tf": p5, "re": c("est_c", 3, "re", 5.0)["power"], "holds": p5 >= 0.8}
    p1 = c("est_c", 3, "tf", 1.0)["power"]
    h["H241"] = {"tf": p1, "re": c("est_c", 3, "re", 1.0)["power"], "holds": p1 <= 0.3}
    mds = [g("est_c", k, "tf")["mds"] for k in KS]
    big = [99 if v is None else v for v in mds]
    h["H242"] = {"mds_by_K": dict(zip(map(str, KS), mds)),
                 "holds": all(a >= b for a, b in zip(big, big[1:])) and big[KS.index(5)] <= 5}
    w = g("est_c", 5, "tf")["worst_med_e"]
    h["H243"] = {"worst_med_e": w, "always_adopt_med": g("est_c", 5, "tf")["always_adopt"]["med"], "holds": w <= 3}
    a, b = c("est_c", 5, "tf", 1.0)["p95_e"], g("est_c", 5, "tf")["always_adopt"]["p95"]
    h["H244"] = {"gate_p95": a, "always_adopt_p95": b, "holds": a <= b}
    z3, z5, z5t = g("est_c", 3, "tfp")["rms_z"], g("est_c", 5, "tfp")["rms_z"], g("est_c", 5, "tf")["rms_z"]
    h["H245"] = {"K3": z3, "K5": z5, "tf_K5": z5t, "holds": 0.8 <= z3 <= 1.3 and abs(z5 - 1) < abs(z5t - 1)}
    m = g("est_cr", 5, "tf")["mds"]
    h["H246"] = {"mds": m, "holds": m is not None and m <= 5}
    return h


def main():
    m3s = _load("m3s_an", os.path.join(EXP, "m3s_causal", "analyse.py"))
    R, n_min = m3s.rows()
    S = [r for r in R if r["scored"]]
    res = analyse(R, S, m3s.REFS)
    hyp = hypotheses(res)
    out = {"rules": {"K": KS, "deltas_pct": DELTAS, "z_gate": Z_GATE, "power": POWER, "n_hist": N_HIST,
                     "windows": len(S), "counted": len(R)}, "hypotheses": hyp, "gates": res}
    with open(os.path.join(HERE, "summary.json"), "w") as fh:
        json.dump(out, fh, indent=1)
    for k, v in hyp.items():
        print(k, json.dumps(v))
    for m in MODELS:
        for k in KS:
            print(f"{m:6s} K={k} n={res[m][k]['board']['tf']['n']:2d} tfp_floor={res[m][k]['n_tfp_floor']} | " + " | ".join(
                f"{p} rmsz {q['rms_z']:.2f} FA {q['false_alarm']:.2f} MDS {q['mds']} pw1 {q['curve']['1.0']['power']:.2f} "
                f"pw2 {q['curve']['2.0']['power']:.2f} pw5 {q['curve']['5.0']['power']:.2f} worst {q['worst_med_e']:.2f}% "
                f"adopt {q['always_adopt']['med']:.2f}/{q['always_adopt']['p95']:.2f}"
                for p, q in res[m][k]["board"].items()))
            print("        tf MDS by ref: " + ", ".join(f"{r} {res[m][k][r]['tf']['mds']} FA {res[m][k][r]['tf']['false_alarm']:.2f}"
                                               for r in m3s.REFS))
    figure(res)


def figure(res):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        print("matplotlib missing: stale.png not drawn")
        return
    fig, axes = plt.subplots(1, 2, figsize=(10, 3.8))
    cols = {1: "#999999", 3: "#1f77b4", 5: "#2ca02c", 8: "#d62728"}
    for k in KS:
        for p, ls in (("tf", "-"), ("re", ":")):
            q = res["est_c"][k]["board"][p]
            axes[0].plot(DELTAS, [q["curve"][str(d)]["power"] for d in DELTAS], ls, color=cols[k],
                         label=f"K={k}, {'history floor' if p == 'tf' else 'DL'}")
        q = res["est_c"][k]["board"]["tf"]
        axes[1].plot(DELTAS, [q["curve"][str(d)]["med_e"] for d in DELTAS], "-", color=cols[k], label=f"gate, K={k}")
        axes[1].axhline(q["always_adopt"]["med"], color=cols[k], lw=0.8, ls="--")
    axes[1].plot(DELTAS, DELTAS, "k:", label="never adopt")
    axes[0].axhline(POWER, color="k", lw=0.8); axes[0].axhline(0.05, color="k", lw=0.8, ls="--")
    axes[0].set_xlabel("staleness of the held f, |delta| (%)"); axes[0].set_ylabel("share of blocks flagged")
    axes[1].set_xlabel("staleness of the held f, |delta| (%)"); axes[1].set_ylabel("median |e| after the decision (%)")
    axes[0].legend(fontsize=6, ncol=2); axes[1].legend(fontsize=6)
    axes[0].set_title("causal prior (est_c): power of the 2-sd gate", fontsize=9)
    axes[1].set_title("error kept: gate vs always adopt (dashed)", fontsize=9)
    fig.tight_layout()
    fig.savefig(os.path.join(HERE, "stale.png"), dpi=130)


if __name__ == "__main__":
    main()
