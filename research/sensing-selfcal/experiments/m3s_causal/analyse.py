"""Milestone 3s: score H215-H222 (LOG.md, milestone 3s planned) on run.py's results.json.

`est` comes from milestone 3p's results.json, est_p from milestone 3r's, est_c and est_cr from this
milestone's. Scored windows are those with a causal prior (N_MIN earlier counted windows of the camera). A
solve that did not converge (status <= 0) is left out of that model's figures; paired comparisons use
windows where both converged. Writes summary.json and causal.png.
Run (from research/sensing-selfcal): python3 experiments/m3s_causal/analyse.py
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


m3r = _load("m3r_an", os.path.join(EXP, "m3r_prior", "analyse.py"))
mad_sd, REFS, SEQS, wilcoxon, e, med_abs = m3r.mad_sd, m3r.REFS, m3r.SEQS, m3r.wilcoxon, m3r.e, m3r.med_abs
MODELS = ("est", "est_p", "est_c", "est_cr")


def _row(s):
    f, cx, cy, k1, k2 = s["intr"]
    return {"f": f, "cx": cx, "cy": cy, "k1": k1, "k2": k2, "sd_rel": s["sd_f"] / f,
            "img_cost": s.get("image_cost", s["cost"])}


def rows():
    base = {(r["seq"], r["window"]): r for r in m3r.rows()[0]}      # est, est_p, ... per counted window
    res = json.load(open(os.path.join(HERE, "results.json")))
    out = []
    for w in res["windows"]:
        b = base[(w["seq"], w["window"])]
        r = {"seq": w["seq"], "unit": w["unit"], "window": w["window"], "rank": w["rank"],
             "scored": w["solves"]["est_c"] is not None, "est": b["est"]}
        if "est_p" in b:
            r["est_p"] = b["est_p"]
        r["prior"] = {}
        for m in ("est_c", "est_cr"):
            s = w["solves"][m]
            if s is None:
                continue
            r["prior"][m] = s["prior"]
            if s["status"] > 0:
                r[m] = _row(s)
        out.append(r)
    return out, res["n_min"]


def main():
    R, n_min = rows()
    S = [r for r in R if r["scored"]]
    per = {}
    for m in MODELS:
        for s in SEQS:
            rs = [r for r in S if r["seq"] == s and m in r]
            if not rs:
                continue
            f = np.array([r[m]["f"] for r in rs])
            d = {"n": len(rs), "med_f": float(np.median(f)), "robust_sd_f": mad_sd(f),
                 "med_sd_f_rel_pct": float(np.median([r[m]["sd_rel"] for r in rs]) * 100)}
            for p in ("k1", "cx", "cy"):
                v = [r[m][p] for r in rs]
                d[p] = {"med": float(np.median(v)), "robust_sd": mad_sd(v)}
            for ref in REFS:
                ee = np.array([e(r, m, ref) for r in rs]) * 100
                d[ref] = {"med_e_pct": float(np.median(ee)), "med_abs_e_pct": float(np.median(np.abs(ee))),
                          "robust_sd_e_pct": mad_sd(ee)}
            per[f"{m}/{s}"] = d

    hyp = {}
    both = [r for r in S if "est_c" in r]
    d = np.array([abs(e(r, "est_c")) - abs(e(r, "est")) for r in both]) * 100
    a, b = med_abs(both, "est"), med_abs(both, "est_c")
    p = wilcoxon(d)
    hyp["H215"] = {"n": len(both), "est": a, "est_c": b, "ratio": b / a, "n_lower": int((d < 0).sum()),
                   "median_paired_change_pp": float(np.median(d)), "wilcoxon_p": p,
                   "held": b <= 0.85 * a and p < 0.05 and (d < 0).sum() > len(d) / 2}
    rs = [r for r in S if "est_c" in r and "est_p" in r]
    hyp["H216"] = {"n": len(rs), "est_p": med_abs(rs, "est_p"), "est_c": med_abs(rs, "est_c"),
                   "ratio": med_abs(rs, "est_c") / med_abs(rs, "est_p"),
                   "held": med_abs(rs, "est_c") <= 1.15 * med_abs(rs, "est_p")}
    h = {s: {"est": per[f"est/{s}"]["board"]["robust_sd_e_pct"], "est_c": per[f"est_c/{s}"]["board"]["robust_sd_e_pct"]}
         for s in SEQS}
    for v in h.values():
        v["ratio"] = v["est_c"] / v["est"]
    hyp["H217"] = {"per_seq": h, "held": sum(v["ratio"] <= 0.8 for v in h.values()) >= 2}
    h = {s: abs(per[f"est_c/{s}"]["med_f"] - per[f"est/{s}"]["med_f"]) / per[f"est/{s}"]["med_f"] * 100 for s in SEQS}
    hyp["H218"] = {"shift_pct": h, "held": all(v <= 1.0 for v in h.values())}
    h = {}
    for u in ("fr1", "fr3"):
        last = max((r for r in S if r["unit"] == u), key=lambda r: r["rank"])
        sc = {m: dict((j, s) for j, _, s in last["prior"][m])[3] for m in ("est_c", "est_cr")}
        h[u] = {"rank": last["rank"], "k1_width_est_c": sc["est_c"], "k1_width_est_cr": sc["est_cr"],
                "ratio": sc["est_cr"] / sc["est_c"]}
    hyp["H219"] = {"per_camera": h, "held": all(v["ratio"] <= 0.7 for v in h.values())}
    rs = [r for r in S if "est_c" in r and "est_cr" in r]
    hyp["H220"] = {"n": len(rs), "est_c": med_abs(rs, "est_c"), "est_cr": med_abs(rs, "est_cr"),
                   "ratio": med_abs(rs, "est_cr") / med_abs(rs, "est_c"),
                   "held": med_abs(rs, "est_cr") <= 1.05 * med_abs(rs, "est_c")}
    h = {}
    for lab, lo, hi in (("5-9", 5, 9), ("10+", 10, 10 ** 6)):
        rs = [r for r in both if lo <= r["rank"] <= hi]      # rank = number of earlier counted windows
        dd = np.array([abs(e(r, "est_c")) - abs(e(r, "est")) for r in rs]) * 100
        h[lab] = {"n": len(rs), "median_paired_change_pp": float(np.median(dd)), "n_lower": int((dd < 0).sum())}
    hyp["H221"] = {"bins": h, "held": all(v["median_paired_change_pp"] < 0 for v in h.values())}
    rise = np.array([(r["est_c"]["img_cost"] - r["est"]["img_cost"]) / r["est"]["img_cost"] for r in both]) * 100
    hyp["H222"] = {"median_rise_pct": float(np.median(rise)), "max_rise_pct": float(rise.max()),
                   "n_lower_than_est": int((rise < 0).sum()), "held": float(np.median(rise)) <= 1.0}

    uns = {}
    for m in MODELS:
        a = [r for r in S if m in r]
        ae = np.array([abs(e(r, m)) for r in a]) * 100
        uns[m] = {"n": len(a), **{f"pooled_med_abs_e_pct/{ref}": med_abs(a, m, ref) for ref in REFS},
                  "n_abs_e_over_10pct": int((ae > 10).sum()), "p90_abs_e_pct": float(np.percentile(ae, 90))}
        if m != "est":
            pair = [r for r in a if "est" in r]
            dd = np.array([abs(e(r, m)) - abs(e(r, "est")) for r in pair]) * 100
            uns[m].update({"n_lower": int((dd < 0).sum()), "wilcoxon_p": wilcoxon(dd),
                           "median_paired_change_pp": float(np.median(dd))})
    desk = [r for r in both if r["seq"] == "fr1_desk"]
    uns["fr1_desk_est_c"] = {"n": len(desk), "est": med_abs(desk, "est"), "est_c": med_abs(desk, "est_c"),
                             "med_e_est_c_pct": float(np.median([e(r, "est_c") for r in desk]) * 100),
                             "med_e_est_pct": float(np.median([e(r, "est") for r in desk]) * 100)}
    tr = {}
    for u in ("fr1", "fr3"):
        tr[u] = [{"rank": r["rank"], **{m: {n: [mu, s] for (j, mu, s), n in zip(r["prior"][m], ("cx", "cy", "k1"))}
                                       for m in r["prior"]}} for r in sorted(S, key=lambda r: r["rank"]) if r["unit"] == u]
    conv = {m: {"n": sum(1 for r in S if m in r["prior"]), "converged": sum(1 for r in S if m in r)}
            for m in ("est_c", "est_cr")}
    out = {"n_min": n_min, "n_windows": len(R), "n_scored": len(S), "convergence": conv, "hypotheses": hyp,
           "per_sequence": per, "unscored": uns, "prior_trajectory": tr}
    json.dump(out, open(os.path.join(HERE, "summary.json"), "w"), indent=1,
              default=lambda o: bool(o) if isinstance(o, np.bool_) else float(o))
    print("scored", len(S), "of", len(R), "convergence:", json.dumps(conv))
    for k, v in hyp.items():
        print(k, "held" if v["held"] else "refuted", json.dumps({x: y for x, y in v.items() if x != "held"}))
    for k, v in uns.items():
        print(k, json.dumps(v))
    for k, v in per.items():
        print(k, json.dumps(v))
    figure(S, tr)


def figure(S, tr):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        print("matplotlib missing: causal.png not drawn")
        return
    fig, ax = plt.subplots(1, 2, figsize=(10, 4))
    for k, m in enumerate(("est", "est_p", "est_c", "est_cr")):
        for i, u in enumerate(("fr1", "fr3")):
            rs = sorted((r for r in S if r["unit"] == u and m in r), key=lambda r: r["rank"])
            ax[0].plot([r["rank"] for r in rs], [abs(e(r, m)) * 100 for r in rs], "o-" if i == 0 else "s--",
                       ms=3, lw=0.8, color=f"C{k}", label=f"{m} ({u})")
    ax[0].set_xlabel("window rank in recording order (earlier counted windows)")
    ax[0].set_ylabel("|e| against the board (%)")
    ax[0].set_title("per window: no prior, leave-one-out, causal, recursive", fontsize=9)
    ax[0].legend(fontsize=6, ncol=2)
    for i, u in enumerate(("fr1", "fr3")):
        for k, m in ((2, "est_c"), (3, "est_cr")):
            x = [t["rank"] for t in tr[u] if m in t]
            mu = np.array([t[m]["k1"][0] for t in tr[u] if m in t])
            s = np.array([t[m]["k1"][1] for t in tr[u] if m in t])
            ls = "-" if i == 0 else "--"
            ax[1].plot(x, mu, ls, color=f"C{k}", label=f"{m} {u}")
            ax[1].fill_between(x, mu - s, mu + s, color=f"C{k}", alpha=0.15)
    ax[1].set_xlabel("window rank")
    ax[1].set_ylabel("k1 prior: median ± robust sd")
    ax[1].legend(fontsize=7)
    fig.tight_layout()
    fig.savefig(os.path.join(HERE, "causal.png"), dpi=120)


if __name__ == "__main__":
    main()
