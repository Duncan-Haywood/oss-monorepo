"""Milestone 3za: when a robot adopts its self-calibrated focal length, should it adopt the windows' distortion
with it? Scores H274-H279 (LOG.md, milestone 3za planned). Analysis only: milestone 3s's saved TUM solves,
milestone 3y's blocks and scatter-only floored f bar, milestone 3z's projected-radius error P(r).

The held model is the reference with f shifted by delta % and the reference's distortion. Five rules:
never, f-only always / gate(0.5) (pool f, held k1, k2), joint always / gate(0.5) (pool f, k1, k2; the gate is
on f). Score: per block the rms of P(r) over r in BAND px, median over blocks, regret against the better of
never and joint always at each delta. Writes summary.json and joint.png.
Run (from research/sensing-selfcal): python3 experiments/m3za_joint/analyse.py
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
m3z = _load("m3z_an", os.path.join(EXP, "m3z_radial", "analyse.py"))
KS, MODELS = m3y.KS, m3y.MODELS
DELTAS = tuple(round(0.5 * i, 1) for i in range(21))      # % of the reference f
BAND = tuple(range(50, 251, 25))                          # the radii scored (3z: the windows are accurate here)
WIDE = tuple(range(50, 351, 25))                          # reported; the board fr1 model folds at 381 px
RULES = ("never", "f_always", "f_gate0.5", "joint_always", "joint_gate0.5")
GATE_C = 0.5


def updated(rule, pool, held):
    """The (f, k1, k2) the robot holds after the rule. pool: {f, sd, k1, k2}; held: {f, k1, k2}."""
    if rule == "never":
        return dict(held)
    fire = rule.endswith("always") or abs(pool["f"] - held["f"]) > GATE_C * pool["sd"]
    if not fire:
        return dict(held)
    if rule.startswith("f_"):
        return {"f": pool["f"], "k1": held["k1"], "k2": held["k2"], "k3": held.get("k3", 0.0)}
    if rule.startswith("joint_"):
        return {"f": pool["f"], "k1": pool["k1"], "k2": pool["k2"], "k3": 0.0}
    raise ValueError(rule)


def rays(ref, radii):
    return np.array([m3z.ray_at(r, ref) for r in radii])


def rms_p(model, ref_x, radii):
    """rms over the radii of P(r) = model's image radius of the reference's ray at r, minus r."""
    p = m3z.radial_map(ref_x, model["f"], model["k1"], model["k2"], model.get("k3", 0.0)) - np.asarray(radii, float)
    return float(np.sqrt(np.mean(p * p)))


def blocks(seq_rows, unit_rows, model, k):
    """Milestone 3y's blocks: K consecutive scored windows, f pool with the scatter-only floored sd."""
    out = []
    for i in range(len(seq_rows) - k + 1):
        b = seq_rows[i:i + k]
        if any(model not in r for r in b):
            continue
        hist = [r for r in unit_rows if r["rank"] < b[0]["rank"]]
        p = m3y.scatter_pool([r[model]["f"] for r in b], m3y.tau_hist(hist, model, "f"))
        if p is None:
            continue
        out.append({"seq": b[0]["seq"], "unit": b[0]["unit"], "f": p[0], "sd": p[1],
                    "k1": float(np.mean([r[model]["k1"] for r in b])),
                    "k2": float(np.mean([r[model]["k2"] for r in b]))})
    return out


def score(bl, refs_u, radii=BAND, rules=RULES):
    """Median rms P of every rule over the delta grid (averaged over the sign), and regret."""
    xr = {u: rays(R, radii) for u, R in refs_u.items()}
    curve = {r: [] for r in rules}
    for dl in DELTAS:
        acc = {r: [] for r in rules}
        for sgn in ((1,) if dl == 0 else (1, -1)):
            vals = {r: [] for r in rules}
            for b in bl:
                R = refs_u[b["unit"]]
                held = {"f": R["f"] * (1 + sgn * dl / 100), "k1": R["k1"], "k2": R["k2"], "k3": R.get("k3", 0.0)}
                for r in rules:
                    vals[r].append(rms_p(updated(r, b, held), xr[b["unit"]], radii))
            for r in rules:
                acc[r].append(np.median(vals[r]))
        for r in rules:
            curve[r].append(float(np.mean(acc[r])))
    best = np.minimum(curve["never"], curve["joint_always"])
    out = {"n": len(bl), "rules": {}}
    for r in rules:
        reg = np.array(curve[r]) - best
        out["rules"][r] = {"med": curve[r], "worst_regret": float(reg.max()), "mean_regret": float(reg.mean()),
                           "argworst_delta": DELTAS[int(reg.argmax())]}
    out["minimax"] = min(rules, key=lambda r: out["rules"][r]["worst_regret"])
    ja, nv = np.array(curve["joint_always"]), np.array(curve["never"])
    be = [d for d, a, n in zip(DELTAS, ja, nv) if a <= n]
    out["breakeven_delta"] = be[0] if be else None
    return out


def references():
    """m3z's {ref: {unit: {f, k1, k2, k3}}}."""
    return m3z.references()


def analyse(R, S, refs):
    seqs = sorted({r["seq"] for r in S})
    res = {}
    for m in MODELS:
        res[m] = {}
        for k in KS:
            by_seq = {}
            for s in seqs:
                rs = sorted([r for r in S if r["seq"] == s], key=lambda r: r["rank"])
                ur = sorted([r for r in R if r["unit"] == rs[0]["unit"]], key=lambda r: r["rank"])
                by_seq[s] = blocks(rs, ur, m, k)
            allb = [b for bl in by_seq.values() for b in bl]
            cell = {rn: score(allb, refs[rn]) for rn in refs}
            cell["wide_board"] = score(allb, refs["board"], radii=WIDE)
            cell["by_seq_board"] = {s: score(bl, refs["board"]) for s, bl in by_seq.items() if bl}
            res[m][k] = cell
    return res


def hypotheses(res):
    c = res["est_c"][5]
    b = c["board"]["rules"]
    w = lambda cell, r: cell["rules"][r]["worst_regret"]
    h = {}
    h["H274"] = {"joint_always_d0": b["joint_always"]["med"][0], "f_always_d0": b["f_always"]["med"][0],
                 "holds": b["joint_always"]["med"][0] < b["f_always"]["med"][0]}
    mm = c["board"]["minimax"]
    h["H275"] = {"minimax": mm, "worst": {r: v["worst_regret"] for r, v in b.items()},
                 "holds": mm.startswith("joint_")}
    h["H276"] = {"joint_gate": w(c["board"], "joint_gate0.5"), "f_gate": w(c["board"], "f_gate0.5"),
                 "holds": w(c["board"], "joint_gate0.5") < w(c["board"], "f_gate0.5")}
    bs = c["by_seq_board"]
    diff = {s: v["rules"]["f_always"]["med"][0] - v["rules"]["joint_always"]["med"][0] for s, v in bs.items()}
    fr3 = [s for s in diff if s.startswith("fr3")]; fr1 = [s for s in diff if s.startswith("fr1")]
    h["H277"] = {"f_minus_joint_d0": diff,
                 "holds": all(abs(diff[s]) < 0.5 for s in fr3) and all(diff[s] >= 0.5 for s in fr1)}
    mms = {rn: c[rn]["minimax"] for rn in ("tum", "tf")}
    h["H278"] = {"minimax": mms, "holds": all(v.startswith("joint_") for v in mms.values())}
    be = c["board"]["breakeven_delta"]
    h["H279"] = {"breakeven_delta": be, "holds": be is not None and be <= 3.0}
    return h


def main():
    m3s = _load("m3s_an", os.path.join(EXP, "m3s_causal", "analyse.py"))
    R, _ = m3s.rows()
    S = [r for r in R if r["scored"]]
    refs = references()
    res = analyse(R, S, refs)
    hyp = hypotheses(res)
    out = {"rules": {"K": KS, "deltas": DELTAS, "band": BAND, "wide": WIDE, "gate_c": GATE_C,
                     "windows": len(S), "counted": len(R)},
           "references": refs, "hypotheses": hyp, "scores": res}
    with open(os.path.join(HERE, "summary.json"), "w") as fh:
        json.dump(out, fh, indent=1)
    for k, v in hyp.items():
        print(k, json.dumps(v))
    for m in MODELS:
        for k in KS:
            for rn in ("board", "tum", "tf", "wide_board"):
                s = res[m][k][rn]
                print(f"{m:6s} K={k} {rn:10s} n={s['n']:2d} minimax={s['minimax']:13s} be={s['breakeven_delta']} | "
                      + " ".join(f"{r} d0={v['med'][0]:.2f} wr={v['worst_regret']:.2f}@{v['argworst_delta']}"
                                 for r, v in s["rules"].items()))
    for s, v in res["est_c"][5]["by_seq_board"].items():
        print("est_c K=5 board", s, f"n={v['n']}", " ".join(
            f"{r} d0={x['med'][0]:.2f} wr={x['worst_regret']:.2f}" for r, x in v["rules"].items()))
    figure(res)


def figure(res):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        print("matplotlib missing: joint.png not drawn")
        return
    fig, axes = plt.subplots(1, 3, figsize=(12, 3.6), sharey=True)
    sty = {"never": ("k", ":"), "f_always": ("#d62728", "--"), "f_gate0.5": ("#d62728", "-"),
           "joint_always": ("#1f77b4", "--"), "joint_gate0.5": ("#1f77b4", "-")}
    for ax, s in zip(axes, sorted(res["est_c"][5]["by_seq_board"])):
        rr = res["est_c"][5]["by_seq_board"][s]["rules"]
        for r, (col, ls) in sty.items():
            ax.plot(DELTAS, rr[r]["med"], ls, color=col, label=r.replace("_", " "))
        ax.set_title(f"{s.replace('_', '/')}: five windows, causal prior, vs the board", fontsize=9)
        ax.set_xlabel("staleness of the held focal length, |delta| (%)")
    axes[0].set_ylabel("median rms P(r), 50-250 px (px)")
    axes[0].legend(fontsize=7)
    fig.tight_layout()
    fig.savefig(os.path.join(HERE, "joint.png"), dpi=130)


if __name__ == "__main__":
    main()
