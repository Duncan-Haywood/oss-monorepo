"""Milestone 4l, step 2: score H73-H76 from analyse.py's per-split predictions on both rigs.

    python3 experiments/m4l_predict/score.py      # seconds, after analyse.py --rig opencv and --rig tum

Writes summary.json and power.png. LOG.md, 2026-11-15, milestone 4l planned.
"""
import json, os
import numpy as np
from scipy.stats import rankdata

HERE = os.path.dirname(os.path.abspath(__file__))
PM2 = (0.98, 1.02)
TUM = ("fr1", "fr3")


def auc(score, label):
    """Mann-Whitney AUC (ties count one half); nan when a class is empty."""
    score, label = np.asarray(score, float), np.asarray(label, bool)
    npos, nneg = int(label.sum()), int((~label).sum())
    if npos == 0 or nneg == 0:
        return float("nan")
    r = rankdata(score)
    return float((r[label].sum() - npos * (npos + 1) / 2) / (npos * nneg))


def top_quartile(pi):
    """Boolean mask of the top quarter of splits by pi (ceil(n / 4) splits, ties broken by order)."""
    k = int(np.ceil(len(pi) / 4))
    sel = np.zeros(len(pi), bool)
    sel[np.argsort(-pi, kind="stable")[:k]] = True
    return sel


def load():
    A, U = {}, {}
    for rig in ("opencv", "tum"):
        z = np.load(os.path.join(HERE, f"rig_{rig}.npz"))
        A.update({k: z[k] for k in z.files})
        with open(os.path.join(HERE, f"rig_{rig}.json")) as fh:
            U.update(json.load(fh)["units"])
    return A, U


def unit_stats(A, u, des="7+6", pred="pi"):
    k = f"{u}_{des}"
    pi = {s: A[f"{k}_{pred}_{s}"] for s in (0.96, 0.98, 0.99, 1.01, 1.02, 1.04)}
    fired = {s: A[f"{k}_fired_S1_{s}"] for s in pi}
    fa = A[f"{k}_fired_S0_1.0"]
    pim = (pi[0.98] + pi[1.02]) / 2
    real2 = (fired[0.98].mean() + fired[1.02].mean()) / 2
    tq = top_quartile(pim)
    out = dict(n=int(len(pim)),
               auc_pm2=auc(np.concatenate([pi[0.98], pi[1.02]]), np.concatenate([fired[0.98], fired[1.02]])),
               auc_pm1=auc(np.concatenate([pi[0.99], pi[1.01]]), np.concatenate([fired[0.99], fired[1.01]])),
               auc_pm4=auc(np.concatenate([pi[0.96], pi[1.04]]), np.concatenate([fired[0.96], fired[1.04]])),
               mean_pi_pm2=float(pim.mean()), real_pm2=float(real2), ratio=float(pim.mean() / real2),
               real_pm4=float((fired[0.96].mean() + fired[1.04].mean()) / 2),
               mean_pi_pm4=float(((pi[0.96] + pi[1.04]) / 2).mean()),
               real_pm1=float((fired[0.99].mean() + fired[1.01].mean()) / 2),
               mean_pi_pm1=float(((pi[0.99] + pi[1.01]) / 2).mean()),
               fa_all=float(fa.mean()),
               tq=dict(n=int(tq.sum()), real_pm2=float((fired[0.98][tq].mean() + fired[1.02][tq].mean()) / 2),
                       mean_pi_pm2=float(pim[tq].mean()), fa=float(fa[tq].mean()), fa_count=int(fa[tq].sum())),
               bq=dict(real_pm2=float((fired[0.98][~tq].mean() + fired[1.02][~tq].mean()) / 2)))
    gates = {}
    for g in (0.3, 0.5):
        sel = pim >= g
        gates[str(g)] = dict(share=float(sel.mean()),
                             real_pm2=float((fired[0.98][sel].mean() + fired[1.02][sel].mean()) / 2) if sel.any() else None,
                             fa=float(fa[sel].mean()) if sel.any() else None)
    out["gates"] = gates
    sd = A[f"{k}_sd"]
    out["auc_pm2_by_sd"] = auc(-np.concatenate([sd, sd]), np.concatenate([fired[0.98], fired[1.02]]))
    out["spearman_pi_sd"] = float(np.corrcoef(rankdata(pim), rankdata(-sd))[0, 1])
    far = A[f"{k}_far"]
    bottom = np.zeros(len(pim), bool); bottom[np.argsort(pim, kind="stable")[:int(np.ceil(len(pim) / 4))]] = True
    out["far"] = dict(n=int(far.sum()), in_bottom_quartile=int((far & bottom).sum()))
    # calibration bins (deciles of pi)
    edges = np.quantile(pim, np.linspace(0, 1, 11))
    b = np.clip(np.searchsorted(edges, pim, side="right") - 1, 0, 9)
    out["bins"] = [dict(pi=float(pim[b == i].mean()), real=float((fired[0.98][b == i].mean() + fired[1.02][b == i].mean()) / 2),
                        n=int((b == i).sum())) for i in range(10) if (b == i).any()]
    return out, pim, tq, fired, fa


def main():
    A, U = load()
    units = ("left", "right", "fr1", "fr3")
    S = {u: unit_stats(A, u)[0] for u in units}
    Sunc = {u: unit_stats(A, u, pred="piunc")[0] for u in units}
    other = {f"{u}/{d}": {k: v for k, v in unit_stats(A, u, des=d)[0].items() if k != "bins"}
             for u in units for d in ("7+4", "7+5")}
    # H75 pooled over the two TUM units and both signs
    num = den = 0
    for u in TUM:
        _, pim, tq, fired, _ = unit_stats(A, u)
        for s in PM2:
            num += int(fired[s][tq].sum()); den += int(tq.sum())
    allnum = sum(int(unit_stats(A, u)[3][s].sum()) for u in TUM for s in PM2)
    allden = sum(2 * S[u]["n"] for u in TUM)
    H = {}
    H["H73"] = dict(**{u: S[u]["auc_pm2"] for u in units}); H["H73"]["holds"] = bool(all(S[u]["auc_pm2"] >= 0.70 for u in units))
    H["H74"] = dict(**{u: S[u]["ratio"] for u in units}); H["H74"]["holds"] = bool(all(0.5 <= S[u]["ratio"] <= 2 for u in units))
    H["H75"] = dict(tum_top_quartile=num / den, tum_all=allnum / allden); H["H75"]["holds"] = bool(num / den >= 0.20)
    H["H76"] = dict(**{u: S[u]["tq"]["fa"] for u in units}); H["H76"]["holds"] = bool(all(S[u]["tq"]["fa"] <= 0.025 for u in units))
    out = dict(units=U, hypotheses=H, k6=S, k6_uncorrected_sigma={u: {k: v for k, v in Sunc[u].items() if k != "bins"} for u in units},
               other_designs=other)
    with open(os.path.join(HERE, "summary.json"), "w") as fh:
        json.dump(out, fh, indent=1)
    for k, v in H.items():
        print(k, "holds" if v["holds"] else "REFUTED", json.dumps({a: b for a, b in v.items() if a != "holds"}))
    for u in units:
        s = S[u]
        print(u, json.dumps({k: v for k, v in s.items() if k != "bins"}))
    for u in units:
        print("uncorrected", u, Sunc[u]["ratio"], Sunc[u]["auc_pm2"])
    for k, v in other.items():
        print(k, round(v["auc_pm2"], 3), round(v["ratio"], 3), v["tq"])
    figure(S, os.path.join(HERE, "power.png"))


def figure(S, path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    col = {"left": "#1b2f6b", "right": "#5b7bd5", "fr1": "#c0392b", "fr3": "#e08a3e"}
    lab = {"left": "OpenCV left", "right": "OpenCV right", "fr1": "TUM fr1 (Kinect)", "fr3": "TUM fr3 (Xtion)"}
    fig, axes = plt.subplots(1, 2, figsize=(10, 4.2))
    for u, s in S.items():
        axes[0].plot([b["pi"] for b in s["bins"]], [b["real"] for b in s["bins"]], "o-", color=col[u], ms=3,
                     label=f"{lab[u]} (AUC {s['auc_pm2']:.2f})")
    axes[0].plot([0, 1], [0, 1], color="grey", lw=0.8, ls=":")
    axes[0].set_xlabel("twin's predicted power of the split, ±2% (decile mean)")
    axes[0].set_ylabel("real share detected"); axes[0].legend(fontsize=7, frameon=False)
    axes[0].set_title("does the twin know which splits can see a 2% change?", fontsize=9)
    x = np.arange(len(S)); w = 0.38
    axes[1].bar(x - w / 2, [s["real_pm2"] for s in S.values()], w, color="#bbbbbb", label="all splits")
    axes[1].bar(x + w / 2, [s["tq"]["real_pm2"] for s in S.values()], w, color=[col[u] for u in S], label="top quarter by twin power")
    for i, s in enumerate(S.values()):
        axes[1].text(i + w / 2, s["tq"]["real_pm2"] + 0.01, f"FA {100 * s['tq']['fa']:.1f}%", ha="center", fontsize=7)
    axes[1].set_xticks(x, [lab[u] for u in S], fontsize=7); axes[1].set_ylabel("real ±2% detection rate, old 7 + new 6")
    axes[1].legend(fontsize=7, frameon=False); axes[1].set_ylim(0, 1)
    axes[1].set_title("testing only the updates the twin rates highest", fontsize=9)
    fig.suptitle("Milestone 4l: the twin's predicted power against the real detections", fontsize=10)
    fig.tight_layout()
    fig.savefig(path, dpi=130)


if __name__ == "__main__":
    main()
