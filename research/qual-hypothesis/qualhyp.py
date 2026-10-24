"""Do hypotheses mined from a small discovery sample about what separates two sets of documents replicate on
held-out documents, and how many merely restate the label?

Stdlib only. A hypothesis is a human-readable predicate ("the comment contains the word 'sorry'"); its effect
is the difference in rate between the two sets. Reuses the corpus loader and word list of ../qual-real.
The proposer here is a counting baseline, not an LLM.
"""
import math
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "qual-real"))
import qualreal as r  # noqa: E402

Z95 = 1.959963984540054


def features(text):
    """The set of word predicates a document satisfies (each is 'contains the word w')."""
    return set(r.tokens(text))


def counts(docs, labels):
    """Per word: [documents in set 1 containing it, documents in set 0 containing it], plus set sizes."""
    c = {}
    n1 = sum(labels)
    for feats, y in zip(docs, labels):
        for w in feats:
            row = c.setdefault(w, [0, 0])
            row[0 if y else 1] += 1
    return c, n1, len(labels) - n1


def effect(a, n1, b, n0):
    """Rate in set 1 minus rate in set 0, and the pooled two-proportion z statistic."""
    d = a / n1 - b / n0
    p = (a + b) / (n1 + n0)
    se = math.sqrt(p * (1 - p) * (1 / n1 + 1 / n0))
    return d, (0.0 if se == 0 else d / se)


def p_two_sided(z):
    return math.erfc(abs(z) / math.sqrt(2))


def propose(docs, labels, k, min_count=5):
    """The k words with the largest |z| in the discovery sample, ties broken alphabetically."""
    c, n1, n0 = counts(docs, labels)
    scored = []
    for w, (a, b) in c.items():
        if a + b >= min_count:
            d, z = effect(a, n1, b, n0)
            scored.append((-abs(z), w, d))
    scored.sort()
    return [(w, d) for _, w, d in scored[:k]]


def benjamini_hochberg(pvals, alpha=0.05):
    """Indices of hypotheses rejected by the BH procedure at false-discovery rate alpha."""
    order = sorted(range(len(pvals)), key=lambda i: pvals[i])
    cut = -1
    for rank, i in enumerate(order, 1):
        if pvals[i] <= alpha * rank / len(pvals):
            cut = rank
    return {order[j] for j in range(cut)}


def test_hypotheses(hyps, docs, labels, alpha=0.05):
    """Held-out check. Returns per hypothesis (word, discovery effect, held-out effect, p, replicated) where
    replicated = BH-significant at `alpha` over the tested family and the same sign as in discovery."""
    c, n1, n0 = counts(docs, labels)
    rows = []
    for w, d0 in hyps:
        a, b = c.get(w, [0, 0])
        d, z = effect(a, n1, b, n0)
        rows.append((w, d0, d, p_two_sided(z)))
    keep = benjamini_hochberg([x[3] for x in rows], alpha)
    return [(w, d0, d, p, i in keep and d * d0 > 0) for i, (w, d0, d, p) in enumerate(rows)]


def restates_label(word):
    """True when the word is one of the label's own vocabulary: a negative-emotion word, or an emotion name."""
    return word in r.LEXICON or word in set(r.NEGATIVE)


def split(examples, n_discovery, n_heldout, rng):
    idx = list(range(len(examples)))
    rng.shuffle(idx)
    pick = lambda ix: ([features(examples[i][1]) for i in ix], [examples[i][2] for i in ix])
    return pick(idx[:n_discovery]), pick(idx[n_discovery:n_discovery + n_heldout])
