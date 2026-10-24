"""Does an automated coder's error differ across languages, and how much does that move group comparisons?

Stdlib only. Corpus: NaijaSenti (Muhammad et al. 2022), tweets in Hausa, Igbo, Nigerian Pidgin and
Yoruba labelled positive/neutral/negative by native-speaker annotators. The code is "negative".
Reuses the estimators of ../qual-correction and the helpers of ../qual-real. The tweets are read from a
cache that `experiments/run.py` fills; none is committed.

Three automated coders stand in for an LLM (the session has no API key; none of them is an LLM):
`lexicon_code` (a short English word list, a zero-shot English codebook), `NB` trained on English
GoEmotions comments (a model that only ever saw English), and `NB` trained on a slice of the Nigerian
corpus itself (an in-language control).
"""
import csv
import math
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "qual-real"))
import qualreal as r  # noqa: E402

q = r.q
LANGS = ("hau", "ibo", "pcm", "yor")
TOKEN = re.compile(r"\w+", re.UNICODE)
STRIP = re.compile(r"@\w+|https?://\S+")


def tokens(text):
    return TOKEN.findall(STRIP.sub(" ", text.lower()))


def load_language(paths, lang):
    """Rows of (lang, text, negative) from tsv files with a `tweet` and a `label` column."""
    out = []
    for p in paths:
        with open(p, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f, delimiter="\t", quoting=csv.QUOTE_NONE):
                if row.get("tweet") and row.get("label") in ("positive", "neutral", "negative"):
                    out.append((lang, row["tweet"], int(row["label"] == "negative")))
    return out


def lexicon_code(text):
    return int(any(t in r.LEXICON for t in tokens(text)))


class NB:
    """Multinomial naive Bayes on word presence, add-one smoothing; code = log-odds above `bias`."""

    def fit(self, texts, labels):
        self.c = {0: Counter(), 1: Counter()}
        self.n = {0: 0, 1: 0}
        for t, y in zip(texts, labels):
            self.n[y] += 1
            self.c[y].update(set(tokens(t)))
        self.vocab = set(self.c[0]) | set(self.c[1])
        self.bias = 0.0
        return self

    def score(self, text):
        s = math.log((self.n[1] + 1) / (self.n[0] + 1))
        for w in set(tokens(text)):
            if w in self.vocab:
                s += math.log(((self.c[1][w] + 1) / (self.n[1] + 2)) / ((self.c[0][w] + 1) / (self.n[0] + 2)))
        return s

    def match_rate(self, texts, labels):
        """Set the threshold so the coder's positive rate on these texts equals their human positive share."""
        scores = sorted(self.score(t) for t in texts)
        share = sum(labels) / len(labels)
        self.bias = scores[max(int((1 - share) * len(scores)) - 1, 0)]
        return self

    def code(self, text):
        return int(self.score(text) > self.bias)


def by_language(rows):
    return {lang: {i for i, row in enumerate(rows) if row[0] == lang} for lang in LANGS}


class Stats:
    """Mean, variance and size of a coder's codes over a member set, computed once."""

    def __init__(self, codes):
        self.n, self.mean, self.var = len(codes), q.mean(codes), q.var(codes)


def ppi_fast(stats, llm_gold, human_gold):
    """Same value as `q.ppi(llm_all, llm_gold, human_gold)` with the corpus statistics precomputed."""
    rect = [h - f for h, f in zip(human_gold, llm_gold)]
    return stats.mean + q.mean(rect), math.sqrt(stats.var / stats.n + q.var(rect) / len(rect))
