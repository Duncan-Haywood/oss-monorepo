"""Application: pricing a tail-drift bound in verifiable training.

Replica nodes recompute a training step; floating-point non-determinism gives
a benign per-step discrepancy `d >= 0`, heavy-tailed in practice. A verifier
attests a threshold `r` above which a discrepancy should be treated as a fault
(the true tau-quantile of benign drift). Paying the pinball loss against
audited discrepancies makes the honest, distribution-free tau-quantile the
strictly best report. A Gaussian-tail rule of thumb under-covers heavy tails
(more false alarms than tau promises); a padded threshold is safe against false
alarms but lets real faults hide inside the tolerated band."""
import math
import random
from .scores import pinball

Z = {0.9: 1.2816, 0.95: 1.6449, 0.99: 2.3263}


def sample_drift(rng, n, df=3.0, scale=1.0):
    """|Student-t(df)| * scale: heavy-tailed benign discrepancy."""
    out = []
    for _ in range(n):
        g = rng.gauss(0, 1)
        c = rng.gammavariate(df / 2, 2.0)
        out.append(abs(g / math.sqrt(c / df)) * scale)
    return out


def strategy_threshold(name, cal, tau):
    s = sorted(cal)
    n = len(s)
    if name == "empirical":  # honest: distribution-free quantile
        return s[min(n - 1, int(math.ceil(tau * n)) - 1)]
    if name == "gaussian":  # assumes light tails
        m = sum(s) / n
        sd = math.sqrt(sum((x - m) ** 2 for x in s) / (n - 1))
        return m + Z[tau] * sd
    if name == "median":  # lazy: reports typical value
        return s[n // 2]
    if name == "max_pad":  # overly conservative
        return 2.0 * s[-1]
    raise ValueError(name)


def run_drift_study(tau=0.99, df=3.0, n_cal=500, n_test=20000, seeds=20,
                    shift=8.0, strategies=("empirical", "gaussian", "median", "max_pad")):
    """Mean over seeds of: expected pinball loss, coverage (1 - false alarm),
    and detection rate for a faulty step with extra discrepancy `shift`."""
    res = {s: dict(loss=0.0, coverage=0.0, detect=0.0) for s in strategies}
    for seed in range(seeds):
        rng = random.Random(seed)
        cal = sample_drift(rng, n_cal, df)
        test = sample_drift(rng, n_test, df)
        faulty = [x + shift * abs(rng.gauss(1, 0.3)) for x in sample_drift(rng, n_test, df)]
        for s in strategies:
            r = strategy_threshold(s, cal, tau)
            res[s]["loss"] += sum(pinball(r, y, tau) for y in test) / n_test / seeds
            res[s]["coverage"] += sum(y <= r for y in test) / n_test / seeds
            res[s]["detect"] += sum(y > r for y in faulty) / n_test / seeds
    return res
