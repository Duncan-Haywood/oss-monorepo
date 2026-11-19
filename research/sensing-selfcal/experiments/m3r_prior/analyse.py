"""Milestone 3r: score H208-H214 (LOG.md, milestone 3r planned) on run.py's results.json.

`est` (no prior) comes from milestone 3p's results.json on milestone 3p's counting rule; the prior models
from this milestone's results.json. A prior solve that did not converge (status 0) is left out of that
model's figures; paired comparisons use windows where both converged. Writes summary.json and prior.png.
Run (from research/sensing-selfcal): python3 experiments/m3r_prior/analyse.py
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


m3q = _load("m3q_an", os.path.join(EXP, "m3q_residual", "analyse.py"))
mad_sd, counted, REFS, SEQS, boot_median = m3q.mad_sd, m3q.counted, m3q.REFS, m3q.SEQS, m3q.boot_median
MODELS = ("est", "est_p", "est_ph", "est_pk1", "est_px")


def wilcoxon(d):
    """Two-sided Wilcoxon signed-rank p (scipy if present)."""
    from scipy.stats import wilcoxon as w
    d = np.asarray(d, float)
    d = d[d != 0]
    return float(w(d).pvalue) if len(d) else float("nan")


def rows():
    r3p = json.load(open(os.path.join(EXP, "m3p_tumvel", "results.json")))
    r3r = {(w["seq"], w["window"]): w for w in json.load(open(os.path.join(HERE, "results.json")))["windows"]}
    out, check = [], []
    for w in r3p["windows"]:
        if not counted(w)[0]:
            continue
        r = {"seq": w["seq"], "unit": w["unit"], "window": w["window"]}
        sv = dict(w["solves"])
        q = r3r.get((w["seq"], w["window"]))
        if q is not None and q.get("status") == "ok":
            check.append(abs(q["nfba_f"] - w["nfba"]["intr"][0]) / w["nfba"]["intr"][0])
            sv.update({k: v for k, v in q["solves"].items() if k != "est"})
        for m in MODELS:
            s = sv.get(m)
            if s is None or s["status"] <= 0:
                continue
            f, cx, cy, k1, k2 = s["intr"]
            img = s.get("image_cost", s["cost"])
            r[m] = {"f": f, "cx": cx, "cy": cy, "k1": k1, "k2": k2, "sd_rel": s["sd_f"] / f,
                    "img_cost": img, "t_r": s["t_r"]}
        out.append(r)
    return out, check


def e(r, m, ref="board"):
    R = REFS[ref][r["unit"]]
    return (r[m]["f"] - R) / R


def med_abs(rs, m, ref="board"):
    return float(np.median([abs(e(r, m, ref)) for r in rs]) * 100)


def main():
    R, check = rows()
    per = {}
    for m in MODELS:
        for s in SEQS:
            rs = [r for r in R if r["seq"] == s and m in r]
            if not rs:
                continue
            f = np.array([r[m]["f"] for r in rs])
            d = {"n": len(rs), "med_f": float(np.median(f)), "med_f_ci95": boot_median(f),
                 "robust_sd_f": mad_sd(f), "med_sd_f_rel_pct": float(np.median([r[m]["sd_rel"] for r in rs]) * 100)}
            for p in ("k1", "cx", "cy"):
                v = [r[m][p] for r in rs]
                d[p] = {"med": float(np.median(v)), "robust_sd": mad_sd(v)}
            for ref in REFS:
                ee = np.array([e(r, m, ref) for r in rs]) * 100
                d[ref] = {"med_e_pct": float(np.median(ee)), "med_abs_e_pct": float(np.median(np.abs(ee))),
                          "robust_sd_e_pct": mad_sd(ee)}
            per[f"{m}/{s}"] = d

    hyp = {}
    # H208: robust sd of e for est_p <= 0.75 x est's, in >= 2 of 3 sequences
    h = {s: {"est": per[f"est/{s}"]["board"]["robust_sd_e_pct"], "est_p": per[f"est_p/{s}"]["board"]["robust_sd_e_pct"]}
         for s in SEQS}
    for v in h.values():
        v["ratio"] = v["est_p"] / v["est"]
    hyp["H208"] = {"per_seq": h, "held": sum(v["ratio"] <= 0.75 for v in h.values()) >= 2}
    # H209: pooled median |e| est_p <= 0.85 x est's; paired Wilcoxon p < 0.05 and lower in > half
    both = [r for r in R if "est" in r and "est_p" in r]
    d = np.array([abs(e(r, "est_p")) - abs(e(r, "est")) for r in both]) * 100
    a, b = med_abs(both, "est"), med_abs(both, "est_p")
    p = wilcoxon(d)
    hyp["H209"] = {"n": len(both), "est": a, "est_p": b, "ratio": b / a, "n_lower": int((d < 0).sum()),
                   "median_paired_change_pp": float(np.median(d)), "wilcoxon_p": p,
                   "held": b <= 0.85 * a and p < 0.05 and (d < 0).sum() > len(d) / 2}
    # H210: per sequence |median f(est_p) - median f(est)| / median f(est) <= 1%
    h = {s: abs(per[f"est_p/{s}"]["med_f"] - per[f"est/{s}"]["med_f"]) / per[f"est/{s}"]["med_f"] * 100 for s in SEQS}
    hyp["H210"] = {"shift_pct": h, "held": all(v <= 1.0 for v in h.values())}
    # H211: est_px median |e| <= 0.9 x est's on both fr1 sequences
    h = {}
    for s in ("fr1_desk", "fr1_xyz"):
        rs = [r for r in R if r["seq"] == s and "est" in r and "est_px" in r]
        h[s] = {"n": len(rs), "est": med_abs(rs, "est"), "est_px": med_abs(rs, "est_px")}
        h[s]["ratio"] = h[s]["est_px"] / h[s]["est"]
    hyp["H211"] = {"per_seq": h, "held": all(v["ratio"] <= 0.9 for v in h.values())}
    # H212: pooled median |e| est_ph <= est_p
    rs = [r for r in R if "est_p" in r and "est_ph" in r]
    hyp["H212"] = {"n": len(rs), "est_p": med_abs(rs, "est_p"), "est_ph": med_abs(rs, "est_ph"),
                   "held": med_abs(rs, "est_ph") <= med_abs(rs, "est_p")}
    # H213: pooled median |e| est_p <= 0.95 x est_pk1
    rs = [r for r in R if "est_p" in r and "est_pk1" in r]
    hyp["H213"] = {"n": len(rs), "est_p": med_abs(rs, "est_p"), "est_pk1": med_abs(rs, "est_pk1"),
                   "ratio": med_abs(rs, "est_p") / med_abs(rs, "est_pk1"),
                   "held": med_abs(rs, "est_p") <= 0.95 * med_abs(rs, "est_pk1")}
    # H214: pooled median rise in the image cost of est_p over est <= 1%
    rise = np.array([(r["est_p"]["img_cost"] - r["est"]["img_cost"]) / r["est"]["img_cost"] for r in both]) * 100
    hyp["H214"] = {"median_rise_pct": float(np.median(rise)), "max_rise_pct": float(rise.max()),
                   "n_lower_than_est": int((rise < 0).sum()), "held": float(np.median(rise)) <= 1.0}

    uns = {}
    for m in MODELS:
        a = [r for r in R if m in r]
        uns[m] = {"n": len(a), **{f"pooled_med_abs_e_pct/{ref}": med_abs(a, m, ref) for ref in REFS}}
        ae = np.array([abs(e(r, m)) for r in a]) * 100     # tail, added after scoring (unscored)
        uns[m].update({"n_abs_e_over_5pct": int((ae > 5).sum()), "n_abs_e_over_10pct": int((ae > 10).sum()),
                       "p90_abs_e_pct": float(np.percentile(ae, 90))})
        if m != "est":
            pair = [r for r in a if "est" in r]
            dd = np.array([abs(e(r, m)) - abs(e(r, "est")) for r in pair]) * 100
            uns[m].update({"n_paired": len(pair), "n_lower": int((dd < 0).sum()), "wilcoxon_p": wilcoxon(dd),
                           "median_paired_change_pp": float(np.median(dd)),
                           "pooled_med_abs_e_pct_est_same_windows": med_abs(pair, "est")})
    conv = {}
    r3r = json.load(open(os.path.join(HERE, "results.json")))["windows"]
    for m in MODELS[1:]:
        st = [w["solves"][m]["status"] for w in r3r if w.get("status") == "ok" and m in w["solves"]]
        conv[m] = {"n": len(st), "converged": int(sum(s > 0 for s in st)),
                   "med_iters": float(np.median([w["solves"][m]["iters"] for w in r3r
                                                 if w.get("status") == "ok" and m in w["solves"]]))}
    out = {"n": len(R), "check_nfba_f_rel": {"n": len(check), "max": float(max(check)) if check else None},
           "convergence": conv, "hypotheses": hyp, "per_sequence": per, "unscored": uns}
    json.dump(out, open(os.path.join(HERE, "summary.json"), "w"), indent=1,
              default=lambda o: bool(o) if isinstance(o, np.bool_) else float(o))
    print("check nfba f:", out["check_nfba_f_rel"], "convergence:", json.dumps(conv))
    for k, v in hyp.items():
        print(k, "held" if v["held"] else "refuted", json.dumps({x: y for x, y in v.items() if x != "held"}))
    for k, v in uns.items():
        print(k, json.dumps(v))
    for k, v in per.items():
        print(k, json.dumps(v))
    figure(R)


def figure(R):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        print("matplotlib missing: prior.png not drawn")
        return
    fig, ax = plt.subplots(1, 2, figsize=(10, 4))
    col = {"fr1_desk": "C0", "fr1_xyz": "C1", "fr3_stf": "C2"}
    ms = ("est", "est_p", "est_ph", "est_pk1", "est_px")
    for i, s in enumerate(SEQS):
        for k, m in enumerate(ms):
            rs = [r for r in R if r["seq"] == s and m in r]
            if not rs:
                continue
            x = i + (k - 2) * 0.16
            ee = [e(r, m) * 100 for r in rs]
            ax[0].scatter(np.full(len(ee), x) + np.random.default_rng(k).uniform(-0.04, 0.04, len(ee)), ee,
                          s=8, color=f"C{k}", label=m if i == 0 else None)
            ax[0].plot([x - 0.06, x + 0.06], [np.median(ee)] * 2, color="k", lw=1.5)
        rs = [r for r in R if r["seq"] == s and "est" in r and "est_p" in r]
        ax[1].scatter([abs(e(r, "est")) * 100 for r in rs], [abs(e(r, "est_p")) * 100 for r in rs], s=12,
                      color=col[s], label=s)
    ax[0].axhline(0, color="0.6", lw=0.8)
    ax[0].set_xticks(range(3), SEQS)
    ax[0].set_ylabel("focal error e against the board (%)")
    ax[0].set_title("per window, by model (black: median)", fontsize=9)
    ax[0].legend(fontsize=7, ncol=3)
    lim = max(max(abs(e(r, m)) for r in R for m in ("est", "est_p") if m in r) * 100, 1) * 1.05
    ax[1].plot([0, lim], [0, lim], color="0.6", lw=0.8)
    ax[1].set_xlim(0, lim); ax[1].set_ylim(0, lim)
    ax[1].set_xlabel("|e| without prior, est (%)")
    ax[1].set_ylabel("|e| with leave-one-out prior, est_p (%)")
    ax[1].legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(os.path.join(HERE, "prior.png"), dpi=120)


if __name__ == "__main__":
    main()
