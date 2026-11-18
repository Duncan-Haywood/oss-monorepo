"""Milestone 7at, post hoc (exploratory; decides nothing, written after reading `h7at_weak_admit.txt`): why does no
admission rule remove the weak-coder undercoverage? For the 7 cells where the shipped rule's admitted draws (30 or more)
cover under 88%, replay those draws (same seeds and scheme as `h7at_weak_admit.py`, shipped rule t10) and record, per
admitted draw: whether the interval covers, whether a miss is below or above the truth, the pilot's J_hat, the pilot's
coder misses (human positives the coder labelled 0), and the ratio of the coder-negative cell's audited variance to
that cell's true variance.

    python3 experiments/h7at_posthoc.py   # -> h7at_posthoc.txt (about a minute)
"""
import random
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE.parent))
from llmci import audit_design as A  # noqa: E402
A.RARE_FALLBACK = None  # pinned: replays as committed (LOG.md 7aw)
A.NEG_FLOOR = None  # pinned (LOG.md 7az): replays as committed
import h7at_weak_admit as W  # noqa: E402

BAD = [("1.5B disapproval", 1000), ("lr approval", 1000), ("lr caring", 1000), ("lr annoyance", 500),
       ("lr annoyance", 2000), ("lr realization", 1000), ("lr disgust", 1000)]  # from h7at_weak_admit.txt, t10
REPS = 1000


def var(xs):
    m = sum(xs) / len(xs)
    return sum((x - m) ** 2 for x in xs) / (len(xs) - 1)


def replay(c):
    h, f, n = c["h"], c["f"], c["n"]
    N, truth = len(h), sum(h) / len(h)
    neg = [i for i in range(N) if f[i] == 0]
    true_v = var([h[i] for i in neg])
    rr = random.Random(c["seed"] + 13)
    srs = [rr.sample(range(N), n) for _ in range(REPS)]
    k = round(W.SHARE * n)
    rows = []
    for d in range(REPS):
        full, sb = srs[d], random.Random(c["seed"] + 7 * d)
        pilot = full[:k]
        labels = {i: h[i] for i in pilot}
        plan = A.plan_audit(f, labels, n)
        if plan["design"] != "cells":
            continue
        y, fp = [h[i] for i in pilot], [f[i] for i in pilot]
        jh = A.informedness(y, fp)
        misses = sum(1 for a, b in zip(y, fp) if a and not b)
        for cell, t in zip(plan["cells"], plan["to_label"]):
            for i in sb.sample([i for i in cell if i not in labels], t):
                labels[i] = h[i]
        est, lo, hi = A.audit_interval(plan, f, labels)
        vneg = var([labels[i] for i in labels if f[i] == 0])
        rows.append(dict(cov=lo <= truth <= hi, below=hi < truth, above=lo > truth, j=jh, misses=misses,
                         vr=vneg / true_v if true_v else float("nan")))
    return rows, truth


def main():
    want = {k: None for k in BAD}
    out = ["cell | n | J | admitted | coverage % | misses below / above truth | mean J_hat (covered / missed) | "
           "mean pilot coder misses (covered / missed) | coder-negative variance over true (covered / missed)"]
    for c in W.cells():
        key = (c["label"], c["n"])
        if key not in want:
            continue
        rows, _ = replay(c)
        cv = [r for r in rows if r["cov"]]
        ms = [r for r in rows if not r["cov"]]

        def mean(rs, f):
            return f"{statistics.mean(r[f] for r in rs):.3f}" if rs else "nan"
        out.append(f"{c['label']} | {c['n']} | {c['J']:.3f} | {len(rows)} | {100 * len(cv) / len(rows):.1f} | "
                   f"{sum(r['below'] for r in rows)} / {sum(r['above'] for r in rows)} | "
                   f"{mean(cv, 'j')} / {mean(ms, 'j')} | {mean(cv, 'misses')} / {mean(ms, 'misses')} | "
                   f"{mean(cv, 'vr')} / {mean(ms, 'vr')}")
        print(out[-1], flush=True)
    (HERE / "h7at_posthoc.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
