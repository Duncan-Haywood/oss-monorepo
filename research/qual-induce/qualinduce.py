"""Inductive coding without an LLM: induce a codebook from text, apply it, and compare it with a human codebook.

Induced codebooks here are NMF topics on tf-idf and k-means on LSA (the cheap stand-ins for TopicGPT / LLooM
style induction, which need a model). The human codebook is the 27 GoEmotions emotions (Demszky et al. 2020).
Four measures: agreement with the human primary label (NMI), coverage (best single induced code per emotion, chosen
on training items, scored on held-out AUC), redundancy (pairwise correlation of code scores) and stability
(NMI between two codebooks induced on disjoint halves, both applied to the same held-out items).
"""
import csv
import re
from collections import defaultdict

import numpy as np
from sklearn.cluster import KMeans
from sklearn.decomposition import NMF, TruncatedSVD
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import normalized_mutual_info_score, roc_auc_score

EMOTIONS = ("admiration amusement anger annoyance approval caring confusion curiosity desire disappointment "
            "disapproval disgust embarrassment excitement fear gratitude grief joy love nervousness optimism pride "
            "realization relief remorse sadness surprise").split()


def load(path, min_raters=3):
    """Examples as (id, text, votes) where votes[e] = share of raters marking emotion e (27 emotions, neutral
    excluded from the codebook). Examples with fewer raters or flagged very unclear by any rater are dropped."""
    rows, texts, unclear = defaultdict(list), {}, set()
    with open(path, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            i = r["id"]
            texts[i] = r["text"]
            rows[i].append([int(r[e]) for e in EMOTIONS])
            if r["example_very_unclear"] == "True":
                unclear.add(i)
    out = []
    for i in sorted(rows):
        if len(rows[i]) >= min_raters and i not in unclear:
            out.append((i, texts[i], np.mean(rows[i], axis=0)))
    return out


def human_matrix(votes):
    """0/1 label per emotion: a majority of the raters marked it."""
    return (np.asarray(votes) > 0.5).astype(int)


def primary_label(votes):
    """Index of the emotion most raters marked, -1 if none reached a majority or two tie at the top."""
    out = []
    for v in np.asarray(votes):
        top = v.max()
        out.append(int(v.argmax()) if top > 0.5 and (v == top).sum() == 1 else -1)
    return np.array(out)


class Codebook:
    """An induced codebook: fit on texts, then `scores(texts)` gives an (items x K) nonnegative code-score matrix
    and `assign(texts)` the hard code per item (-1 when every score is zero)."""

    def __init__(self, method, k, seed=0):
        self.method, self.k, self.seed = method, k, seed

    def fit(self, texts):
        self.vec = TfidfVectorizer(min_df=3, max_df=0.5, stop_words="english", sublinear_tf=True)
        X = self.vec.fit_transform(texts)
        if self.method == "nmf":
            self.model = NMF(self.k, init="nndsvda", random_state=self.seed, max_iter=400).fit(X)
            self.words = self.model.components_
        else:
            self.svd = TruncatedSVD(min(100, X.shape[1] - 1), random_state=self.seed).fit(X)
            Z = self._z(X)
            self.model = KMeans(self.k, n_init=3, random_state=self.seed).fit(Z)
            self.words = np.vstack([np.asarray(X[self.model.labels_ == c].mean(axis=0)).ravel()
                                    if (self.model.labels_ == c).any() else np.zeros(X.shape[1])
                                    for c in range(self.k)])
        return self

    def _z(self, X):
        Z = self.svd.transform(X)
        return Z / np.maximum(np.linalg.norm(Z, axis=1, keepdims=True), 1e-9)

    def scores(self, texts):
        X = self.vec.transform(texts)
        if self.method == "nmf":
            return self.model.transform(X)
        d = self.model.transform(self._z(X))          # distance to each centroid
        return np.maximum(d.max(axis=1, keepdims=True) - d, 0.0)

    def assign(self, texts):
        S = self.scores(texts)
        a = S.argmax(axis=1)
        a[S.max(axis=1) <= 0] = -1
        return a

    def top_words(self, c, n=6):
        vocab = np.array(self.vec.get_feature_names_out())
        return list(vocab[np.argsort(-self.words[c])[:n]])


def nmi_vs_label(assign, label):
    """NMI between a hard assignment and the human primary label, on items with a defined primary label."""
    keep = label >= 0
    return float(normalized_mutual_info_score(label[keep], assign[keep]))


def coverage(S_train, H_train, S_test, H_test, min_pos=30):
    """For each emotion with at least `min_pos` positives in both halves: pick the code whose score has the
    highest AUC on the training items, report that code's AUC on the held-out items. Returns {emotion: auc}."""
    out = {}
    for j, e in enumerate(EMOTIONS):
        if H_train[:, j].sum() < min_pos or H_test[:, j].sum() < min_pos:
            continue
        tr = [roc_auc_score(H_train[:, j], S_train[:, c]) if S_train[:, c].std() > 0 else 0.5 for c in range(S_train.shape[1])]
        best = int(np.argmax(tr))
        out[e] = float(roc_auc_score(H_test[:, j], S_test[:, best]))
    return out


def redundancy(M, thresh=0.3):
    """Mean absolute pairwise Pearson correlation between the columns of M (items x codes), and the share of
    code pairs above `thresh`. Constant columns are dropped."""
    M = np.asarray(M, float)
    M = M[:, M.std(axis=0) > 0]
    C = np.abs(np.corrcoef(M, rowvar=False))
    iu = np.triu_indices(C.shape[0], 1)
    v = C[iu]
    return float(v.mean()), float((v > thresh).mean())


def effective_codes(assign):
    """exp(entropy) of the hard-assignment shares: how many equally used codes the codebook behaves like."""
    a = assign[assign >= 0]
    p = np.bincount(a) / len(a)
    p = p[p > 0]
    return float(np.exp(-(p * np.log(p)).sum()))


def random_assignment(assign, rng):
    """Same code sizes, random items: the chance floor for any agreement score."""
    return rng.permutation(assign)
