"""Do codebook codes help a predictive model at a small labelling budget? GoEmotions, stdlib only.

Four feature sets for one task (predict the human negative-emotion code), compared at equal numbers of
labelled training items:
  bow      binary word presence (vocabulary from unlabelled text)
  embed    64-dim signed hashed random projection of the bag of words: a dense-vector stand-in, NOT a
           learned sentence embedding (the session has no model download or API key)
  codes    12 codebook codes scored by word lists written before any result was seen, plus log length:
           a stand-in for LLM-scored dimensions (an LLM would read the codebook; these count words)
  bow+codes  both
Model: L2-regularised logistic regression fitted by Adagrad. Metric: AUC on held-out items.
"""
import hashlib
import math
import random
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "qual-real"))
import qualreal as r  # noqa: E402

TOKEN = re.compile(r"[a-z']+")

# Codebook, written before looking at results. Each code is "does the comment contain a word of this kind".
CODEBOOK = {
    "anger_insult": {"hate", "hated", "stupid", "idiot", "dumb", "angry", "mad", "furious", "asshole", "moron", "trash", "garbage"},
    "sadness_loss": {"sad", "sorry", "miss", "died", "dead", "cry", "crying", "lost", "lonely", "depressed", "grief", "tragic"},
    "fear_worry": {"afraid", "scared", "worried", "worry", "terrified", "nervous", "anxious", "fear", "scary", "panic"},
    "disapproval": {"wrong", "bad", "not", "no", "never", "disagree", "nope", "shouldn't", "don't", "isn't", "wasn't"},
    "disgust": {"disgusting", "gross", "ugly", "horrible", "awful", "terrible", "worst", "sick", "cringe", "pathetic"},
    "profanity": {"shit", "fuck", "fucking", "damn", "crap", "hell", "ass", "bullshit"},
    "regret": {"unfortunately", "regret", "shame", "embarrassing", "oops", "mistake", "apologize", "ashamed"},
    "annoyance": {"annoying", "annoyed", "ugh", "seriously", "why", "stop", "boring", "lame", "sucks"},
    "praise": {"love", "great", "amazing", "awesome", "beautiful", "best", "good", "nice", "wonderful", "perfect"},
    "gratitude": {"thanks", "thank", "appreciate", "grateful", "congrats", "congratulations"},
    "humour": {"lol", "haha", "funny", "lmao", "hilarious", "xd"},
    "question": {"what", "how", "who", "where", "when", "which", "?"},
}
CODES = list(CODEBOOK)


def toks(text):
    return TOKEN.findall(text.lower()) + (["?"] if "?" in text else [])


def code_vector(text):
    t = toks(text)
    s = set(t)
    v = [float(bool(s & CODEBOOK[c])) for c in CODES]
    v.append(math.log1p(len([w for w in t if w != "?"])))
    return v


def build_vocab(texts, min_df=3):
    df = Counter()
    for t in texts:
        df.update(set(toks(t)))
    return {w: i for i, w in enumerate(sorted(w for w, c in df.items() if c >= min_df))}


def _hash(w, k):
    h = int(hashlib.md5(w.encode()).hexdigest(), 16)
    return h % k, 1.0 if (h >> 64) & 1 else -1.0


def embed_vector(text, dim=64):
    v = [0.0] * dim
    for w in set(toks(text)):
        j, s = _hash(w, dim)
        v[j] += s
    n = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / n for x in v]


class Featurizer:
    """Maps text to a sparse dict {index: value} for one feature set. Dense blocks are standardised with
    statistics from the unlabelled texts passed to `fit` (no labels)."""

    def __init__(self, kind, vocab, unlabelled):
        self.kind, self.vocab = kind, vocab
        self.nv = len(vocab)
        self.mean = self.sd = None
        if kind in ("codes", "bow+codes"):
            vs = [code_vector(t) for t in unlabelled]
            m = len(vs[0])
            self.mean = [sum(v[i] for v in vs) / len(vs) for i in range(m)]
            self.sd = [(sum((v[i] - self.mean[i]) ** 2 for v in vs) / len(vs)) ** 0.5 or 1.0 for i in range(m)]

    def __call__(self, text):
        x = {0: 1.0}  # intercept
        off = 1
        if self.kind in ("bow", "bow+codes"):
            for w in set(toks(text)):
                j = self.vocab.get(w)
                if j is not None:
                    x[off + j] = 1.0
            off += self.nv
        if self.kind == "embed":
            for i, a in enumerate(embed_vector(text)):
                x[off + i] = a * 8.0  # unit-norm vector scaled so a step moves the loss comparably
        if self.kind in ("codes", "bow+codes"):
            for i, a in enumerate(code_vector(text)):
                x[off + i] = (a - self.mean[i]) / self.sd[i]
        return x


def fit_logistic(xs, ys, l2=1.0, epochs=40, seed=0):
    """Logistic regression, L2 on every weight but the intercept, Adagrad, sparse rows. Returns dict weights."""
    rng = random.Random(seed)
    w, g2 = {}, {}
    idx = list(range(len(xs)))
    n = len(xs)
    for _ in range(epochs):
        rng.shuffle(idx)
        for i in idx:
            x, y = xs[i], ys[i]
            z = sum(w.get(j, 0.0) * a for j, a in x.items())
            p = 1 / (1 + math.exp(-max(-30, min(30, z))))
            e = p - y
            for j, a in x.items():
                g = e * a + (l2 / n * w.get(j, 0.0) if j else 0.0)
                g2[j] = g2.get(j, 0.0) + g * g
                w[j] = w.get(j, 0.0) - 0.5 * g / (math.sqrt(g2[j]) + 1e-8)
    return w


def predict(w, x):
    return sum(w.get(j, 0.0) * a for j, a in x.items())


def auc(scores, ys):
    """Rank-sum AUC with ties at mid-rank."""
    order = sorted(range(len(scores)), key=lambda i: scores[i])
    ranks = [0.0] * len(scores)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and scores[order[j + 1]] == scores[order[i]]:
            j += 1
        for k in range(i, j + 1):
            ranks[order[k]] = (i + j) / 2 + 1
        i = j + 1
    pos = [k for k in range(len(ys)) if ys[k]]
    npos, nneg = len(pos), len(ys) - len(pos)
    if not npos or not nneg:
        return float("nan")
    return (sum(ranks[k] for k in pos) - npos * (npos + 1) / 2) / (npos * nneg)


L2_GRID = (1.0, 10.0, 100.0)


def fit_tuned(xs, ys, seed=0, grid=L2_GRID):
    """Pick the L2 strength on a 25% validation slice of the labelled items only (AUC), then refit on all of
    them. Falls back to the middle value when the slice has one class. Returns (weights, chosen l2)."""
    n = len(xs)
    cut = n - max(n // 4, 1)
    if n < 8:
        return fit_logistic(xs, ys, l2=grid[1], seed=seed), grid[1]
    best, best_a = grid[1], -1.0
    for l2 in grid:
        w = fit_logistic(xs[:cut], ys[:cut], l2=l2, seed=seed)
        a = auc([predict(w, x) for x in xs[cut:]], ys[cut:])
        if a == a and a > best_a:
            best, best_a = l2, a
    return fit_logistic(xs, ys, l2=best, seed=seed), best
