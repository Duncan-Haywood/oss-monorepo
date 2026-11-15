"""Milestone 4k, step 2: milestone 4j's update test and twin references on the warm-started solves.

    python3 experiments/m4k_warm/analyse.py      # ~15 min, after run.py

Runs milestone 4j's analysis (imported, unchanged: splits, scenarios, statistics, per-split twin
references, 10,000 draws, seed 20261114) three times:
  W   the warm-started solves (run.py),
  WB  the same with the basin check: a solve with |f / F_PRIOR - 1| > BASIN counts as not converged
      (scored),
  CB  milestone 4j's cold solves with the same basin check (unscored: those solves were looked at).
Each arm's full milestone-4j summary goes to arms/<arm>/summary.json (its H63-H67 keys are milestone
4j's predictions re-evaluated on that arm, not this milestone's); this file scores H68-H72 (LOG.md,
2026-11-15, milestone 4k planned) and writes summary.json and power.png.
"""
import gzip, importlib.util, json, os, shutil
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
M4J = os.path.join(ROOT, "experiments", "m4j_tum")
_rspec = importlib.util.spec_from_file_location("m4k_run_for_analyse", os.path.join(HERE, "run.py"))
_run = importlib.util.module_from_spec(_rspec)
_rspec.loader.exec_module(_run)
F_PRIOR = _run.F_PRIOR

BASIN = 0.10
FAR = 0.05
ARMS = {"W": (os.path.join(HERE, "results.json.gz"), False),
        "WB": (os.path.join(HERE, "results.json.gz"), True),
        "CB": (os.path.join(M4J, "results.json.gz"), True)}
COLD = os.path.join(M4J, "summary.json")
CAMS = ("fr1", "fr3")


def m4j_module():
    """A fresh private copy of milestone 4j's analysis (and through it 4g's and 4i's)."""
    spec = importlib.util.spec_from_file_location("m4j_for_m4k", os.path.join(M4J, "analyse.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def raw(path):
    with gzip.open(path, "rt") as fh:
        res = json.load(fh)
    out = {cam: {} for cam in CAMS}
    for r in res["solutions"]:
        out[r["cam"]][tuple(r["views"])] = r["sol"]
    return out, res["cams"]


def basin(sols, width=BASIN):
    """Copy of the solves with every one further than `width` from F_PRIOR set to None."""
    out = {}
    for cam, d in sols.items():
        out[cam] = {v: (s if s is None or abs(s["f"] / F_PRIOR - 1) <= width else None) for v, s in d.items()}
    return out


def ok(s):
    return s is not None and s["status"] > 0 and np.isfinite(s["f"])


def far_counts(sols):
    """Per unit and size: converged solves more than FAR from that size's median f, the largest
    relative deviation, the converged count, and mean solver evaluations."""
    out = {}
    for cam in CAMS:
        out[cam] = {}
        for n in range(3, 8):
            f = np.array([s["f"] for v, s in sols[cam].items() if len(v) == n and ok(s)])
            nf = [s["nfev"] for v, s in sols[cam].items() if len(v) == n and s is not None]
            tot = sum(1 for v in sols[cam] if len(v) == n)
            med = np.median(f)
            dev = np.abs(f / med - 1)
            out[cam][n] = dict(far=int((dev > FAR).sum()), max_dev=float(dev.max()), converged=int(len(f)),
                               total=tot, median_f=float(med), mean_nfev=float(np.mean(nf)))
    return out


def run_arm(name):
    path, use_basin = ARMS[name]
    m = m4j_module()
    m4g = m.m4g
    orig = m4g.load
    m4g.load = (lambda p, _o=orig: basin(_o(p))) if use_basin else orig
    out = os.path.join(HERE, "arms", name)
    os.makedirs(out, exist_ok=True)
    m.HERE, m.RESULTS = out, path
    print("=== arm", name, flush=True)
    m.main()
    with open(os.path.join(out, "summary.json")) as fh:
        return json.load(fh)


def rate(S, scen, s_set, des, cams=CAMS, test="R_geom", model="resid"):
    n = det = 0
    for r in S["table"]:
        if r["model"] == model and r["design"] == des and r["scen"] == scen and r["s"] in s_set and r["test"] == test:
            for c in cams:
                n += r[f"n_{c}"]; det += r[c] * r[f"n_{c}"]
    return det / n if n else float("nan")


def rates(S):
    o = {}
    for k in (4, 5, 6):
        for c in CAMS:
            o[f"S0_k{k}_{c}"] = rate(S, "S0", (1.0,), f"7+{k}", (c,))
    o["pm2_k6"] = rate(S, "S1", (0.98, 1.02), "7+6")
    o["pm1_k6"] = rate(S, "S1", (0.99, 1.01), "7+6")
    o["pm4_k6"] = rate(S, "S1", (0.96, 1.04), "7+6")
    o["pm2_k5"] = rate(S, "S1", (0.98, 1.02), "7+5")
    for c in CAMS:
        o[f"pm2_k6_{c}"] = rate(S, "S1", (0.98, 1.02), "7+6", (c,))
        o[f"S3_k6_{c}"] = rate(S, "S3", (1.0,), "7+6", (c,))
    o["S0_k456_pooled"] = {c: float(np.mean([rate(S, "S0", (1.0,), f"7+{k}", (c,)) for k in (4, 5, 6)])) for c in CAMS}
    o["J_pm2_k6"] = rate(S, "S1", (0.98, 1.02), "7+6", test="J_geom")
    o["harmful_R_geom"] = S["harmful"]["resid/R_geom"]
    return o


def main():
    warm, _ = raw(ARMS["W"][0])
    cold, _ = raw(ARMS["CB"][0])
    far = {"W": far_counts(warm), "cold": far_counts(cold), "WB": far_counts(basin(warm)), "CB": far_counts(basin(cold))}
    f13 = {arm: {c: next(s["f"] for v, s in sols[c].items() if len(v) == 13) for c in CAMS}
           for arm, sols in (("W", warm), ("cold", cold))}
    S = {name: run_arm(name) for name in ARMS}
    with open(COLD) as fh:
        S["cold"] = json.load(fh)
    R = {name: rates(s) for name, s in S.items()}
    H = {}
    h = {c: far["W"][c][6]["far"] for c in CAMS}; h["holds"] = bool(all(h[c] <= 2 for c in CAMS)); H["H68"] = h
    h = {c: far["W"][c][3]["converged"] / far["W"][c][3]["total"] for c in CAMS}
    h["holds"] = bool(all(h[c] >= 0.97 for c in CAMS)); H["H69"] = h
    h = {c: R["WB"][f"S0_k4_{c}"] for c in CAMS}; h["holds"] = bool(all(h[c] <= 0.025 for c in CAMS)); H["H70"] = h
    h = {f"k{k}_{c}": R["WB"][f"S0_k{k}_{c}"] for k in (5, 6) for c in CAMS}
    h["holds"] = bool(all(v <= 0.015 for v in h.values())); H["H71"] = h
    h = dict(pm2_k6=R["WB"]["pm2_k6"]); h["holds"] = bool(h["pm2_k6"] >= 0.15); H["H72"] = h
    out = dict(f_prior=F_PRIOR, basin=BASIN, far_threshold=FAR, f13=f13, far=far, rates=R, hypotheses=H,
               usable_sets={k: S[k]["usable_sets"] for k in S}, anchor={k: S[k]["anchor"] for k in S})
    with open(os.path.join(HERE, "summary.json"), "w") as fh:
        json.dump(out, fh, indent=1)
    shutil.copy(os.path.join(HERE, "arms", "WB", "reference.png"), os.path.join(HERE, "reference_wb.png"))
    for name in ARMS:                      # one copy of milestone 4j's figure is enough
        os.remove(os.path.join(HERE, "arms", name, "reference.png"))
    print(json.dumps(dict(f13=f13, far={a: {c: {n: (x["far"], x["converged"], x["total"], round(x["mean_nfev"], 1))
                                                    for n, x in far[a][c].items()} for c in CAMS} for a in far}), indent=1))
    for name, r in R.items():
        print(name, json.dumps({k: (round(v, 4) if isinstance(v, float) else v) for k, v in r.items()}))
    for k, v in H.items():
        print(k, "holds" if v["holds"] else "REFUTED", json.dumps({a: b for a, b in v.items() if a != "holds"}))
    figure(R, far, os.path.join(HERE, "power.png"))


def figure(R, far, path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    arms = [("cold", "cold start (4j)", "#8a8a8a"), ("CB", "cold + basin check", "#c08a3e"),
            ("W", "warm start", "#4a6fa5"), ("WB", "warm + basin check", "#1b2f6b")]
    fig, axes = plt.subplots(1, 2, figsize=(10, 4.2))
    x = np.arange(6)
    labels = [f"{c} k={k}" for c in CAMS for k in (4, 5, 6)]
    w = 0.2
    for i, (a, lab, col) in enumerate(arms):
        axes[0].bar(x + (i - 1.5) * w, [100 * R[a][f"S0_k{k}_{c}"] for c in CAMS for k in (4, 5, 6)], w, color=col, label=lab)
    axes[0].axhline(1.0, color="grey", ls=":", lw=1)
    axes[0].set_xticks(x); axes[0].set_xticklabels(labels, fontsize=8)
    axes[0].set_ylabel("false alarms on unchanged updates (%)"); axes[0].legend(fontsize=7, frameon=False)
    axes[0].set_title("robust jackknife test, per-split twin reference, old 7 views", fontsize=9)
    keys = [("pm1_k6", "±1%"), ("pm2_k6", "±2%"), ("pm4_k6", "±4%")]
    x = np.arange(len(keys))
    for i, (a, lab, col) in enumerate(arms):
        axes[1].bar(x + (i - 1.5) * w, [100 * R[a][k] for k, _ in keys], w, color=col, label=lab)
    axes[1].set_xticks(x); axes[1].set_xticklabels([l for _, l in keys])
    axes[1].set_xlabel("focal change applied to 6 new views"); axes[1].set_ylabel("share of splits detected (%), both units")
    axes[1].set_title("power at 7 old + 6 new views", fontsize=9)
    fig.suptitle("Milestone 4k: warm-starting the subset solves on two TUM RGB-D cameras", fontsize=10)
    fig.tight_layout()
    fig.savefig(path, dpi=130)


if __name__ == "__main__":
    main()
