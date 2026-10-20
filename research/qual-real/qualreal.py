"""The prediction-powered correction on real hand-coded text: GoEmotions (Demszky et al. 2020).

Stdlib only. Reuses the estimators of ../qual-correction/qualml.py. The corpus is not stored in the
repository; `load_examples` reads the CSV that `experiments/run.py` downloads.

Two automated coders stand in for an LLM, because the session has no API key (see README):
`NaiveBayes` (trained on a disjoint slice with human labels) and `lexicon_code` (a short word list,
zero-shot like a codebook). Neither is an LLM. Human truth is a majority of the raters.
"""
import csv
import math
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "qual-correction"))
import qualml as q  # noqa: E402

NEGATIVE = ("anger", "annoyance", "disappointment", "disapproval", "disgust", "sadness", "fear",
            "embarrassment", "grief", "remorse", "nervousness")
TOKEN = re.compile(r"[a-z']+")
LEXICON = {"hate", "hated", "terrible", "awful", "worst", "angry", "stupid", "annoying", "sad", "sorry",
           "disgusting", "horrible", "bad", "ugly", "wrong", "sucks", "shit", "fuck", "damn", "dumb",
           "afraid", "scared", "worried", "unfortunately", "disappointed", "annoyed", "idiot", "cringe",
           "tragic", "pathetic", "garbage", "trash", "nope", "lame", "shame", "mad", "upset", "miss"}


def tokens(text):
    return TOKEN.findall(text.lower())


def load_examples(path, min_raters=3):
    """Collapse rater rows to examples: (id, text, human_code, n_words). Code = a majority of raters
    marked any negative emotion. Examples flagged unclear by a rater, or with fewer raters, are dropped."""
    votes, texts, unclear = defaultdict(list), {}, set()
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            i = row["id"]
            texts[i] = row["text"]
            votes[i].append(any(row[e] == "1" for e in NEGATIVE))
            if row["example_very_unclear"] == "True":
                unclear.add(i)
    out = []
    for i, v in votes.items():
        if len(v) >= min_raters and i not in unclear:
            out.append((i, texts[i], int(sum(v) * 2 > len(v)), len(tokens(texts[i]))))
    out.sort()
    return out


def group_of(n_words, cut=10):
    return "short" if n_words <= cut else "long"


def lexicon_code(text):
    return int(any(t in LEXICON for t in tokens(text)))


class NaiveBayes:
    """Multinomial naive Bayes with add-one smoothing; code = log-odds above `bias`."""

    def __init__(self):
        self.c = {0: Counter(), 1: Counter()}
        self.n = {0: 0, 1: 0}
        self.bias = 0.0

    def fit(self, texts, labels):
        for t, y in zip(texts, labels):
            self.n[y] += 1
            self.c[y].update(set(tokens(t)))
        self.vocab = set(self.c[0]) | set(self.c[1])
        return self

    def score(self, text):
        s = math.log((self.n[1] + 1) / (self.n[0] + 1))
        for w in set(tokens(text)):
            if w in self.vocab:
                p1 = (self.c[1][w] + 1) / (self.n[1] + 2)
                p0 = (self.c[0][w] + 1) / (self.n[0] + 2)
                s += math.log(p1 / p0)
        return s

    def code(self, text):
        return int(self.score(text) > self.bias)


def confusion(llm, human):
    tp = sum(1 for a, b in zip(llm, human) if a and b)
    fn = sum(1 for a, b in zip(llm, human) if not a and b)
    tn = sum(1 for a, b in zip(llm, human) if not a and not b)
    fp = sum(1 for a, b in zip(llm, human) if a and not b)
    return {"sens": tp / max(tp + fn, 1), "spec": tn / max(tn + fp, 1), "acc": (tp + tn) / len(human)}


def estimates(llm, human, idx_gold, members):
    """Naive, human-only and PPI prevalence for the items in `members` (indices), with the hand-coded
    sample `idx_gold` (indices, random over the whole corpus) restricted to those members."""
    g = [i for i in idx_gold if i in members]
    out = {"naive": q.naive([llm[i] for i in members])}
    if len(g) >= 5:
        out["human"] = q.human_only([human[i] for i in g])
        out["ppi"] = q.ppi([llm[i] for i in members], [llm[i] for i in g], [human[i] for i in g])
    return out
