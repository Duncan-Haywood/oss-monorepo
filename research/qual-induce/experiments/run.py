"""Compare induced codebooks (NMF topics, k-means) with the human GoEmotions codebook. Writes results.txt.

    python3 experiments/run.py      # a few minutes after the shared ~14 MB download; needs numpy, scikit-learn
"""
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import qualinduce as qi  # noqa: E402

URL = "https://storage.googleapis.com/gresearch/goemotions/data/full_dataset/goemotions_1.csv"
CACHE = Path.home() / ".cache" / "qual-real" / "goemotions_1.csv"  # shared with qual-real


def fetch():
    if not CACHE.exists():
        import urllib.request
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(URL, CACHE)
    return CACHE


SEEDS, KS, METHODS = range(5), (5, 10, 27, 60), ("nmf", "kmeans")


def main():
    ex = qi.load(fetch())
    texts = [e[1] for e in ex]
    votes = np.array([e[2] for e in ex])
    H = qi.human_matrix(votes)
    prim = qi.primary_label(votes)
    lines = [f"qual-induce: {len(ex)} GoEmotions examples (>=3 raters), {int((prim >= 0).sum())} with a unique majority primary emotion; "
             f"{len(SEEDS)} random 50/50 splits"]
    res = {}
    for seed in SEEDS:
        rng = np.random.RandomState(seed)
        order = rng.permutation(len(ex))
        a, b = order[: len(ex) // 2], order[len(ex) // 2:]
        # a, b are the two halves; codebooks are induced on a (and on b, for stability) and applied to b
        tb = [texts[i] for i in b]
        for m in METHODS:
            for k in KS:
                cb = qi.Codebook(m, k, seed).fit([texts[i] for i in a])
                S_a, S_b = cb.scores([texts[i] for i in a]), cb.scores(tb)
                asg = cb.assign(tb)
                r = res.setdefault((m, k), defaultdict_list())
                r["nmi"].append(qi.nmi_vs_label(asg, prim[b]))
                r["nmi_chance"].append(qi.nmi_vs_label(qi.random_assignment(asg, rng), prim[b]))
                cov = qi.coverage(S_a, H[a], S_b, H[b])
                aucs = np.array(list(cov.values()))
                r["n_emotions"].append(len(aucs))
                r["auc_mean"].append(aucs.mean())
                r["cov60"].append((aucs >= 0.6).mean())
                r["cov70"].append((aucs >= 0.7).mean())
                r["red_mean"].append(qi.redundancy(S_b)[0])
                r["red_share"].append(qi.redundancy(S_b)[1])
                r["eff"].append(qi.effective_codes(asg))
                cb2 = qi.Codebook(m, k, seed + 100).fit(tb)  # induced on the other half, applied to the same items
                r["stab"].append(float(qi.normalized_mutual_info_score(asg, cb2.assign(tb))))
                if seed == 0 and k == 10:
                    lines.append(f"example codes {m} k=10 (seed 0): " + " | ".join(
                        f"{c}: " + " ".join(cb.top_words(c, 5)) for c in range(k)))
        # the human codebook on the same held-out items
        r = res.setdefault(("human", 27), defaultdict_list())
        r["red_mean"].append(qi.redundancy(H[b])[0])
        r["red_share"].append(qi.redundancy(H[b])[1])
        p = prim[b]
        r["eff"].append(qi.effective_codes(p))
        # per-emotion best-code AUCs of the best induced codebook are in the table; human gets AUC 1 by construction
    lines.append("")
    lines.append("== A. agreement with the human primary emotion, and chance (NMI on held-out items; mean over splits; nmi_sd is the sd over splits)")
    lines.append("method k nmi nmi_sd chance_nmi stability_nmi effective_codes")
    for (m, k), r in res.items():
        if m == "human":
            continue
        lines.append(f"{m} {k} {np.mean(r['nmi']):.3f} {np.std(r['nmi']):.3f} {np.mean(r['nmi_chance']):.3f} "
                     f"{np.mean(r['stab']):.3f} {np.mean(r['eff']):.1f}")
    lines.append("")
    lines.append("== B. coverage: best single induced code per emotion (chosen on training half, AUC on held-out half)")
    lines.append("method k emotions_evaluated mean_auc share_auc>=0.6 share_auc>=0.7")
    for (m, k), r in res.items():
        if m == "human":
            continue
        lines.append(f"{m} {k} {np.mean(r['n_emotions']):.0f} {np.mean(r['auc_mean']):.3f} "
                     f"{np.mean(r['cov60']):.2f} {np.mean(r['cov70']):.2f}")
    lines.append("")
    lines.append("== C. redundancy: mean |correlation| between code scores, share of code pairs above 0.3 (human: 0/1 labels)")
    lines.append("method k mean_abs_corr share_pairs_above_0.3")
    for (m, k), r in res.items():
        lines.append(f"{m} {k} {np.mean(r['red_mean']):.3f} {np.mean(r['red_share']):.3f}")
    (HERE / "results.txt").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))


def defaultdict_list():
    from collections import defaultdict
    return defaultdict(list)


main()
