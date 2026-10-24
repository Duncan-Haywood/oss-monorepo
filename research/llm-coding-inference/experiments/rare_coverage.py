"""Coverage of the stratified (coder-label) interval vs prevalence, over 40 simulated
corpora x 500 audit draws per cell. Coder: sens 0.6, spec 0.97 (a weak-ish coder).
Audit: 60 coder-positives + 140 coder-negatives. Simulated data, not a real corpus."""
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from llmci import estimators as E  # noqa: E402


def corpus(n, p, sens, spec, rng):
    h = [int(rng.random() < p) for _ in range(n)]
    f = [int(rng.random() < (sens if x else 1 - spec)) for x in h]
    return h, f


N = 4000
print("prevalence  coverage(mean over corpora)  min  max")
for p in (0.01, 0.02, 0.03, 0.05, 0.10, 0.20):
    covs = []
    for c in range(40):
        rng = random.Random(1000 * c + int(p * 1000))
        h, f = corpus(N, p, 0.6, 0.97, rng)
        t = sum(h) / N
        pos = [i for i in range(N) if f[i]]
        neg = [i for i in range(N) if not f[i]]
        if len(pos) < 60:
            continue
        hit = 0
        for _ in range(500):
            a1, a0 = rng.sample(pos, 60), rng.sample(neg, 140)
            strata = [(len(idx), [f[i] for i in idx], [h[i] for i in a], [f[i] for i in a])
                      for idx, a in ((pos, a1), (neg, a0))]
            hit += E.covers(E.stratified_ppi(strata), t)
        covs.append(hit / 500)
    print(f"{p:<11} {sum(covs)/len(covs):.3f} (corpora {len(covs)})  {min(covs):.3f}  {max(covs):.3f}")
