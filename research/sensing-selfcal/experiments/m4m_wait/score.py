"""Milestone 4m, step 2: score H77-H81 from analyse.py's per-split predictions on both rigs.

    python3 experiments/m4m_wait/score.py      # seconds, after analyse.py --rig opencv and --rig tum

For each old set, its candidates are the splits that share it. "Choose" takes the candidate with the
highest predicted power pi = (pi_0.98 + pi_1.02) / 2 (ties to the lowest new-set mask); "random" is
the mean over the old set's candidates. Old sets with fewer than 2 usable candidates are left out.
Writes summary.json and wait.png. LOG.md, 2026-11-15, milestone 4m planned.
"""
import json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
S_ALL = (0.96, 0.98, 0.99, 1.01, 1.02, 1.04)
PAIRS = {"pm1": (0.99, 1.01), "pm2": (0.98, 1.02), "pm4": (0.96, 1.04)}
UNITS = ("left", "right", "fr1", "fr3")
TUM, OPENCV = ("fr1", "fr3"), ("left", "right")


def groups(old, min_size=2):
    """(group id per split, or -1 for an old set with fewer than min_size candidates; number of groups)."""
    uniq, inv, cnt = np.unique(old, return_inverse=True, return_counts=True)
    keep = cnt[inv] >= min_size
    rank = np.cumsum(cnt >= min_size) - 1
    g = np.where(keep, rank[inv], -1)
    return g, int((cnt >= min_size).sum())


def choose(g, n_groups, score, new):
    """Index of the chosen split of each group: highest score, ties to the lowest new mask."""
    idx = np.flatnonzero(g >= 0)
    order = idx[np.lexsort((new[idx], -score[idx], g[idx]))]
    first = np.r_[True, g[order][1:] != g[order][:-1]]
    ch = order[first]
    assert len(ch) == n_groups
    return ch


def group_mean(g, n_groups, x):
    sel = g >= 0
    return np.bincount(g[sel], weights=x[sel].astype(float), minlength=n_groups) / np.bincount(g[sel], minlength=n_groups)


def within_auc(g, score, label):
    """AUC over pairs of candidates of the same old set with different labels (ties one half)."""
    num = den = 0.0
    order = np.argsort(g, kind="stable")
    gs = g[order]
    bounds = np.flatnonzero(np.r_[True, gs[1:] != gs[:-1], True])
    for a, b in zip(bounds[:-1], bounds[1:]):
        if gs[a] < 0:
            continue
        sc, lb = score[order[a:b]], label[order[a:b]]
        pos, neg = sc[lb], sc[~lb]
        if len(pos) and len(neg):
            d = pos[:, None] - neg[None, :]
            num += (d > 0).sum() + 0.5 * (d == 0).sum()
            den += d.size
    return num / den if den else float("nan")


def load():
    A = {}
    for rig in ("opencv", "tum"):
        z = np.load(os.path.join(HERE, f"rig_{rig}.npz"))
        A.update({k: z[k] for k in z.files})
    return A


def design_stats(A, u, des):
    k = f"{u}_{des}"
    old, new = A[f"{k}_old"], A[f"{k}_new"]
    pi = {s: A[f"{k}_pi_{s}"] for s in S_ALL}
    fired = {s: A[f"{k}_fired_S1_{s}"] for s in S_ALL}
    fa = A[f"{k}_fired_S0_1.0"]
    g, ng = groups(old)
    out = dict(n_splits=int(len(old)), n_old_sets=ng, candidates_median=float(np.median(np.bincount(g[g >= 0]))))
    rules = {"pi": (pi[0.98] + pi[1.02]) / 2, "sd": -A[f"{k}_sd"]}
    for rname, sc in rules.items():
        ch = choose(g, ng, sc, new)
        r = dict(fa=float(fa[ch].mean()), fa_count=int(fa[ch].sum()))
        for pname, (lo, hi) in PAIRS.items():
            r[f"chosen_{pname}"] = float((fired[lo][ch].mean() + fired[hi][ch].mean()) / 2)
            r[f"chosen_{pname}_count"] = int(fired[lo][ch].sum() + fired[hi][ch].sum())
        out[rname] = r
        out[f"chosen_index_{rname}"] = ch
    out["same_choice"] = float(np.mean(out["chosen_index_pi"] == out["chosen_index_sd"]))
    ch = out["chosen_index_pi"]
    out["fa_random"] = float(group_mean(g, ng, fa).mean())
    for pname, (lo, hi) in PAIRS.items():
        rm = (group_mean(g, ng, fired[lo]) + group_mean(g, ng, fired[hi])) / 2
        out[f"random_{pname}"] = float(rm.mean())
        out[f"ceiling_{pname}"] = float((group_mean(g, ng, fired[lo]) > 0).mean() / 2 + (group_mean(g, ng, fired[hi]) > 0).mean() / 2)
        out[f"auc_within_{pname}"] = _auc_pooled(g, pi, fired, lo, hi)
        if pname == "pm2":
            chosen_hit = (fired[lo][ch].astype(float) + fired[hi][ch]) / 2
            out["chosen_fires_blind_below_half"] = float(np.mean((chosen_hit > 0) & (rm < 0.5)))
    pim = rules["pi"]
    out["pred_chosen_pm2"] = float(pim[ch].mean())
    out["pred_random_pm2"] = float(group_mean(g, ng, pim).mean())
    out["pred_gain_pm2"] = out["pred_chosen_pm2"] / out["pred_random_pm2"]
    out["real_gain_pm2"] = out["pi"]["chosen_pm2"] / out["random_pm2"]
    for key in ("chosen_index_pi", "chosen_index_sd"):
        out.pop(key)
    return out


def _auc_pooled(g, pi, fired, lo, hi):
    """Within-old-set AUC of pi_s for the real detection at s, pooled over s in {lo, hi}: groups are
    (old set, s), so pairs never mix signs."""
    ng = g.max() + 1
    g2 = np.r_[g, np.where(g >= 0, g + ng, -1)]
    return within_auc(g2, np.r_[pi[lo], pi[hi]], np.r_[fired[lo], fired[hi]])


def pooled(S, units, des, rule="pi", p="pm2"):
    """Chosen and random rates pooled over units (each old set and sign once) and their ratio."""
    n = sum(S[u][des]["n_old_sets"] for u in units)
    c = sum(S[u][des][rule][f"chosen_{p}"] * S[u][des]["n_old_sets"] for u in units) / n
    r = sum(S[u][des][f"random_{p}"] * S[u][des]["n_old_sets"] for u in units) / n
    return dict(chosen=c, random=r, ratio=c / r if r > 0 else float("inf"))


def score(S):
    H = {}
    t66, o66, t56 = pooled(S, TUM, "6+6"), pooled(S, OPENCV, "6+6"), pooled(S, TUM, "5+6")
    sd66 = pooled(S, TUM, "6+6", rule="sd")
    H["H77"] = dict(**t66, holds=bool(t66["ratio"] >= 1.5))
    H["H78"] = dict(**o66, holds=bool(o66["ratio"] >= 1.2))
    fa = {f"{u}/{d}": S[u][d]["pi"]["fa"] for u in UNITS for d in ("6+6", "5+6")}
    H["H79"] = dict(**fa, holds=bool(all(v <= 0.025 for v in fa.values())))
    H["H80"] = dict(ratio_5_6=t56["ratio"], ratio_6_6=t66["ratio"], holds=bool(t56["ratio"] > t66["ratio"]))
    rel = sd66["chosen"] / t66["chosen"] - 1
    H["H81"] = dict(sd_chosen=sd66["chosen"], pi_chosen=t66["chosen"], relative=rel, holds=bool(abs(rel) <= 0.10))
    return H


def figure(S, path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, axes = plt.subplots(1, 2, figsize=(9, 3.6), sharey=True)
    for ax, des in zip(axes, ("6+6", "5+6")):
        x = np.arange(len(UNITS))
        for j, (lab, key, col) in enumerate([("blind pick", "random_pm2", "#9aa5b1"),
                                             ("twin's pick", None, "#2f6db3"),
                                             ("any candidate (ceiling)", "ceiling_pm2", "#d9a441")]):
            v = [S[u][des]["pi"]["chosen_pm2"] if key is None else S[u][des][key] for u in UNITS]
            ax.bar(x + (j - 1) * 0.27, np.array(v) * 100, 0.27, label=lab, color=col)
        ax.set_xticks(x, ["OpenCV L", "OpenCV R", "TUM fr1", "TUM fr3"])
        n_c = int(S[UNITS[0]][des]["candidates_median"])
        ax.set_title(f"{des}: old set fixed, ~{n_c} candidate new sets")
        ax.grid(axis="y", alpha=0.3)
    axes[0].set_ylabel("2% focal change caught (%)")
    axes[0].legend(fontsize=8, frameon=False)
    fig.tight_layout()
    fig.savefig(path, dpi=150)


def main():
    A = load()
    designs = ("6+6", "5+6", "7+5", "7+4")
    S = {u: {d: design_stats(A, u, d) for d in designs} for u in UNITS}
    H = score(S)
    extra = {f"{rig}/{d}": pooled(S, us, d) for rig, us in (("tum", TUM), ("opencv", OPENCV)) for d in designs}
    extra.update({f"{rig}/{d}/sd": pooled(S, us, d, rule="sd") for rig, us in (("tum", TUM), ("opencv", OPENCV)) for d in designs})
    with open(os.path.join(HERE, "summary.json"), "w") as fh:
        json.dump(dict(hypotheses=H, pooled=extra, units=S), fh, indent=1)
    for k, v in H.items():
        print(k, "holds" if v["holds"] else "REFUTED", json.dumps({a: b for a, b in v.items() if a != "holds"}))
    for k, v in extra.items():
        print(k, json.dumps(v))
    for u in UNITS:
        for d in designs:
            print(u, d, json.dumps(S[u][d]))
    figure(S, os.path.join(HERE, "wait.png"))


if __name__ == "__main__":
    main()
