"""Milestone 4o, step 2: score H86-H91 from analyse.py's per-split predictions, k1 and k1 + k2.

    python3 experiments/m4o_k2wait/score.py      # under a minute, after analyse.py

Milestone 4l's `unit_stats` (7 + 6: AUC, level, top quarter) and milestone 4m's `design_stats` and
`pooled` (6 + 6: the old set fixed, choose the candidate with the highest pi) are imported unchanged.
The far-solve flag 4l's unit_stats reads (an old or new f more than 5% from its size's median) is
rebuilt here from the arm's stored solves. Writes summary.json and k2wait.png.
LOG.md, 2026-11-15, milestone 4o planned.
"""
import importlib.util, json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
TUM = ("fr1", "fr3")
PM2 = (0.98, 1.02)


def _module(name, rel):
    spec = importlib.util.spec_from_file_location(name, os.path.join(ROOT, "experiments", rel))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


l_score = _module("m4l_score_for_m4o", "m4l_predict/score.py")
m_score = _module("m4m_score_for_m4o", "m4m_wait/score.py")


def far_flags(nk, A):
    """Milestone 4l's far flag per 7 + 6 split: old or new f more than 5% from its size's median."""
    m4n = _module(f"m4n_far_{nk}", "m4n_k2/analyse.py")
    m4g = m4n.m4j_module(nk).m4g
    sols = m4g.load(m4n.RESULTS[nk])
    for u in TUM:
        f = m4g.per_set(sols[u])["f"]
        med = {n: float(np.nanmedian([f[m4g.mask(v)] for v in sols[u] if len(v) == n])) for n in (6, 7)}
        k = f"{u}_7+6"
        A[f"{k}_far"] = (np.abs(f[A[f"{k}_old"]] / med[7] - 1) > 0.05) | (np.abs(f[A[f"{k}_new"]] / med[6] - 1) > 0.05)


def load(nk):
    z = np.load(os.path.join(HERE, f"rig_k{nk}.npz"))
    A = {k: z[k] for k in z.files}
    far_flags(nk, A)
    with open(os.path.join(HERE, f"rig_k{nk}.json")) as fh:
        U = json.load(fh)["units"]
    return A, U


def top_quarter_pooled(A):
    num = den = allnum = allden = 0
    for u in TUM:
        _, pim, tq, fired, _ = l_score.unit_stats(A, u)
        for s in PM2:
            num += int(fired[s][tq].sum()); den += int(tq.sum())
            allnum += int(fired[s].sum()); allden += len(fired[s])
    return dict(top_quarter=num / den, all=allnum / allden, ratio=(num / den) / (allnum / allden))


def arm_stats(nk):
    A, U = load(nk)
    L = {u: {k: v for k, v in l_score.unit_stats(A, u)[0].items()} for u in TUM}
    M = {u: m_score.design_stats(A, u, "6+6") for u in TUM}
    S0_76 = {u: float(A[f"{u}_7+6_fired_S0_1.0"].mean()) for u in TUM}
    return dict(units=U, predict=L, wait=M, tq=top_quarter_pooled(A),
                wait_pooled=m_score.pooled({u: {"6+6": M[u]} for u in TUM}, TUM, "6+6"),
                wait_pooled_sd=m_score.pooled({u: {"6+6": M[u]} for u in TUM}, TUM, "6+6", rule="sd"),
                wait_pooled_pm4=m_score.pooled({u: {"6+6": M[u]} for u in TUM}, TUM, "6+6", p="pm4"),
                s0_7_6=S0_76)


def score(K):
    k1, k2 = K[1], K[2]
    H = {}
    h = {u: k2["predict"][u]["auc_pm2"] for u in TUM}
    H["H86"] = dict(**h, holds=bool(all(v >= 0.70 for v in h.values())))
    r1, r2 = k1["predict"]["fr1"]["ratio"], k2["predict"]["fr1"]["ratio"]
    H["H87"] = dict(k1=r1, k2=r2, holds=bool(abs(np.log(r2)) < abs(np.log(r1))))
    H["H88"] = dict(**k2["tq"], holds=bool(k2["tq"]["ratio"] >= 1.5))
    H["H89"] = dict(**k2["wait_pooled"], holds=bool(k2["wait_pooled"]["ratio"] >= 1.2))
    c1, c2 = k1["wait_pooled"]["chosen"], k2["wait_pooled"]["chosen"]
    H["H90"] = dict(k1_chosen=c1, k2_chosen=c2, ratio=c2 / c1, holds=bool(c2 / c1 >= 1.3))
    fa = {f"{u}/7+6 top quarter": k2["predict"][u]["tq"]["fa"] for u in TUM}
    fa.update({f"{u}/6+6 chosen": k2["wait"][u]["pi"]["fa"] for u in TUM})
    H["H91"] = dict(**fa, holds=bool(all(v <= 0.025 for v in fa.values())))
    return H


def figure(K, path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    lab = {"fr1": "TUM fr1 (Kinect)", "fr3": "TUM fr3 (Xtion)"}
    fig, axes = plt.subplots(1, 2, figsize=(9.6, 3.9), sharey=True)
    for ax, u in zip(axes, TUM):
        x = np.arange(3)
        for j, (nk, col) in enumerate(((1, "#9aa5b1"), (2, "#2f6db3"))):
            w = K[nk]["wait"][u]
            v = [w["random_pm2"], w["pi"]["chosen_pm2"], w["ceiling_pm2"]]
            ax.bar(x + (j - 0.5) * 0.38, np.array(v) * 100, 0.38, color=col, label="k1" if nk == 1 else "k1 + k2")
            for xi, vi in zip(x, v):
                ax.text(xi + (j - 0.5) * 0.38, vi * 100 + 0.6, f"{100 * vi:.1f}", ha="center", fontsize=7)
        ax.set_xticks(x, ["blind pick", "twin's pick", "any candidate\n(ceiling)"], fontsize=8)
        ax.set_title(f"{lab[u]}, old 6 views fixed, 7 candidate new sets", fontsize=9)
        ax.grid(axis="y", alpha=0.3)
    axes[0].set_ylabel("2% focal change caught (%)")
    axes[0].legend(fontsize=8, frameon=False)
    fig.suptitle("Milestone 4o: fitting the lens the camera needs, then waiting for the best new views", fontsize=10)
    fig.tight_layout()
    fig.savefig(path, dpi=130)


def main():
    K = {nk: arm_stats(nk) for nk in (1, 2)}
    H = score(K)
    out = dict(hypotheses=H, **{f"k{nk}": K[nk] for nk in (1, 2)})
    for nk in (1, 2):
        for u in TUM:
            out[f"k{nk}"]["predict"][u].pop("bins", None)
    with open(os.path.join(HERE, "summary.json"), "w") as fh:
        json.dump(out, fh, indent=1, default=float)
    for k, v in H.items():
        print(k, "holds" if v["holds"] else "REFUTED", json.dumps({a: b for a, b in v.items() if a != "holds"}))
    for nk in (1, 2):
        print(f"k{nk}", "tq", json.dumps(K[nk]["tq"]), "wait", json.dumps(K[nk]["wait_pooled"]),
              "sd", json.dumps(K[nk]["wait_pooled_sd"]), "S0 7+6", json.dumps(K[nk]["s0_7_6"]))
        for u in TUM:
            p = K[nk]["predict"][u]
            print(f"  k{nk} {u} 7+6", json.dumps({k: p[k] for k in ("auc_pm2", "auc_pm1", "auc_pm4", "mean_pi_pm2", "real_pm2", "ratio", "fa_all", "tq", "far", "auc_pm2_by_sd")}))
            print(f"  k{nk} {u} 6+6", json.dumps(K[nk]["wait"][u]))
    figure(K, os.path.join(HERE, "k2wait.png"))


if __name__ == "__main__":
    main()
