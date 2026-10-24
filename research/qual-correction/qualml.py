"""Statistics for machine learning on qualitative data coded by an LLM. Stdlib only.

An LLM turns free text (interviews, open survey answers, reviews, tickets) into codes:
"does this answer mention cost as a barrier?". Those codes are then counted, compared
across groups and fed into models, the way numbers are. This module holds the parts
that decide whether the counts can be trusted:

- agreement between an LLM coder and a human coder on the same items
  (`percent_agreement`, `cohen_kappa`, `krippendorff_alpha_nominal`);
- three estimators of a code's prevalence: `naive` (trust the LLM's codes),
  `human_only` (use only the hand-coded sample) and `ppi` (prediction-powered
  inference, Angelopoulos et al. 2023: the LLM's codes on everything, corrected by
  the LLM-vs-human error measured on a random hand-coded sample);
- `simulate_corpus`, a coder with known sensitivity and specificity per group, so
  the estimators can be scored against a known truth.

Every estimator returns (estimate, standard error). Intervals are normal: est +/- z*se.
"""
import math
import random
from collections import Counter

Z95 = 1.959963984540054


def mean(xs):
    return sum(xs) / len(xs)


def var(xs):
    """Sample variance (n - 1). 0 for fewer than two values."""
    n = len(xs)
    if n < 2:
        return 0.0
    m = mean(xs)
    return sum((x - m) ** 2 for x in xs) / (n - 1)


# ---- agreement -------------------------------------------------------------

def percent_agreement(a, b):
    if len(a) != len(b) or not a:
        raise ValueError("need two equal-length, non-empty label lists")
    return sum(x == y for x, y in zip(a, b)) / len(a)


def cohen_kappa(a, b):
    """Cohen's kappa for two coders on nominal labels. 1 = perfect, 0 = chance."""
    po = percent_agreement(a, b)
    n = len(a)
    ca, cb = Counter(a), Counter(b)
    pe = sum(ca[k] * cb[k] for k in set(ca) | set(cb)) / (n * n)
    if pe == 1.0:
        return 1.0 if po == 1.0 else 0.0
    return (po - pe) / (1 - pe)


def krippendorff_alpha_nominal(units):
    """Krippendorff's alpha, nominal metric. `units` is a list of per-item label lists;
    None marks a missing rating. Items with fewer than two ratings are ignored."""
    pairs = Counter()
    for labels in units:
        vals = [v for v in labels if v is not None]
        m = len(vals)
        if m < 2:
            continue
        c = Counter(vals)
        for k1 in c:
            for k2 in c:
                pairs[(k1, k2)] += c[k1] * (c[k2] - (k1 == k2)) / (m - 1)
    n = sum(pairs.values())
    if n == 0:
        raise ValueError("no item has two ratings")
    marg = Counter()
    for (k1, _), w in pairs.items():
        marg[k1] += w
    d_obs = sum(w for (k1, k2), w in pairs.items() if k1 != k2) / n
    d_exp = sum(marg[k1] * marg[k2] for k1 in marg for k2 in marg if k1 != k2) / (n * (n - 1))
    if d_exp == 0:
        return 1.0
    return 1 - d_obs / d_exp


# ---- prevalence estimators ------------------------------------------------

def naive(llm_all):
    """Share coded 1 by the LLM over the whole corpus. Its se ignores coder error."""
    p = mean(llm_all)
    return p, math.sqrt(var(llm_all) / len(llm_all))


def human_only(human_gold):
    """Share coded 1 by humans on the hand-coded random sample."""
    return mean(human_gold), math.sqrt(var(human_gold) / len(human_gold))


def ppi(llm_all, llm_gold, human_gold):
    """Prediction-powered mean: LLM mean over the corpus plus the mean human-minus-LLM
    correction ("rectifier") on the hand-coded sample, which must be a random draw."""
    if len(llm_gold) != len(human_gold) or len(human_gold) < 2:
        raise ValueError("need at least two hand-coded items with LLM codes")
    rect = [h - f for h, f in zip(human_gold, llm_gold)]
    est = mean(llm_all) + mean(rect)
    se = math.sqrt(var(llm_all) / len(llm_all) + var(rect) / len(rect))
    return est, se


def gap(est_a, est_b):
    """Difference of two independent estimates (a - b) with its se."""
    return est_a[0] - est_b[0], math.hypot(est_a[1], est_b[1])


def covers(est, truth, z=Z95):
    return abs(est[0] - truth) <= z * est[1]


def effective_n(se_ppi, se_human, n_gold):
    """Hand-coded items a human-only study would need for the PPI standard error."""
    if se_ppi <= 0:
        return math.inf
    return n_gold * (se_human / se_ppi) ** 2


# ---- simulation ------------------------------------------------------------

def simulate_corpus(n, prevalence, sens, spec, rng):
    """(truth, llm) label lists for n items: truth ~ Bernoulli(prevalence); the LLM
    codes a true 1 as 1 with prob `sens` and a true 0 as 0 with prob `spec`."""
    truth = [1 if rng.random() < prevalence else 0 for _ in range(n)]
    llm = [(1 if rng.random() < sens else 0) if t else (0 if rng.random() < spec else 1) for t in truth]
    return truth, llm


def gold_sample(n_total, n_gold, rng):
    """Indices of a simple random sample to hand-code."""
    return rng.sample(range(n_total), n_gold)


def run_once(n, prevalence, sens, spec, n_gold, rng):
    """One study: returns dict of estimator -> (est, se), plus the true corpus share."""
    truth, llm = simulate_corpus(n, prevalence, sens, spec, rng)
    idx = gold_sample(n, n_gold, rng)
    hg = [truth[i] for i in idx]
    lg = [llm[i] for i in idx]
    return {"truth": mean(truth), "naive": naive(llm), "human": human_only(hg), "ppi": ppi(llm, lg, hg)}


def seeded(seed):
    return random.Random(seed)
