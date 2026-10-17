"""Simulated days of transcripts, BM25 retrieval, extractive summaries and retention policies.

Everything is synthetic and stylised. A day is a list of utterances; a few of them state a
planted *fact* (an appointment, a number, a name) and the rest are filler chatter drawn from a
Zipf-like vocabulary. Queries ask about a fact later, sharing only some of its words.
"""
import math
from collections import Counter
from dataclasses import dataclass

import numpy as np

K1, B = 1.2, 0.75  # BM25 constants, the common defaults (Robertson & Zaragoza 2009)


@dataclass
class Utt:
    day: int
    t: int            # utterance index within the day
    words: list
    fact: int = -1    # fact id if this utterance states one, else -1

    @property
    def nbytes(self):
        return sum(len(w) + 1 for w in self.words)


@dataclass
class World:
    n_days: int = 7
    utts_per_day: int = 1500
    facts_per_day: int = 6
    vocab: int = 3000
    zipf_a: float = 1.1
    utt_len: int = 9
    fact_len: int = 6          # words in a fact utterance
    fact_key_words: int = 3    # rare words unique to the fact
    query_share: float = 0.5   # fraction of the key words repeated in the query
    query_noise: int = 1       # extra common (filler) words in the query
    key_mode: str = "unique"   # "unique": key words appear nowhere else; "tail": drawn from the rare half of the filler vocabulary


def zipf_probs(n, a):
    p = 1.0 / np.arange(1, n + 1) ** a
    return p / p.sum()


def make_corpus(world, rng):
    """Return (utterances, queries). Key words come from a reserved rare range, one set per fact."""
    p = zipf_probs(world.vocab, world.zipf_a)
    utts, queries, fid = [], [], 0
    key_base = world.vocab  # key words live above the filler vocabulary
    for d in range(world.n_days):
        fact_slots = set(rng.choice(world.utts_per_day, world.facts_per_day, replace=False).tolist())
        for t in range(world.utts_per_day):
            if t in fact_slots:
                if world.key_mode == "unique":
                    keys = [f"k{fid}_{j}" for j in range(world.fact_key_words)]
                else:
                    keys = [f"w{x}" for x in rng.integers(world.vocab // 2, world.vocab, world.fact_key_words)]
                filler = [f"w{x}" for x in rng.choice(world.vocab, world.fact_len - len(keys), p=p)]
                utts.append(Utt(d, t, keys + filler, fid))
                nq = max(1, round(world.query_share * len(keys)))
                qk = [keys[j] for j in rng.choice(len(keys), nq, replace=False)]
                qn = [f"w{x}" for x in rng.choice(world.vocab, world.query_noise, p=p)]
                queries.append((fid, d, qk + qn))
                fid += 1
            else:
                utts.append(Utt(d, t, [f"w{x}" for x in rng.choice(world.vocab, world.utt_len, p=p)]))
    return utts, queries


class BM25:
    def __init__(self, utts):
        self.utts = utts
        self.tf = [Counter(u.words) for u in utts]
        self.len = np.array([len(u.words) for u in utts], float)
        self.avg = self.len.mean() if len(utts) else 1.0
        df = Counter()
        for c in self.tf:
            df.update(c.keys())
        n = len(utts)
        self.idf = {w: math.log(1 + (n - f + 0.5) / (f + 0.5)) for w, f in df.items()}
        self.inv = {}
        for i, c in enumerate(self.tf):
            for w in c:
                self.inv.setdefault(w, []).append(i)

    def scores(self, q):
        s = np.zeros(len(self.utts))
        for w in set(q):
            if w not in self.idf:
                continue
            for i in self.inv[w]:
                f = self.tf[i][w]
                s[i] += self.idf[w] * f * (K1 + 1) / (f + K1 * (1 - B + B * self.len[i] / self.avg))
        return s

    def top(self, q, k):
        s = self.scores(q)
        idx = np.argsort(-s, kind="stable")[:k]
        return [i for i in idx if s[i] > 0]


def hit_at_k(index, q, fact, k):
    return any(index.utts[i].fact == fact for i in index.top(q, k))


def importance(utts):
    """Mean inverse-document-frequency of an utterance's words over the given corpus (rarer = more
    informative). A cheap on-device proxy for 'worth keeping'."""
    df = Counter()
    for u in utts:
        df.update(set(u.words))
    n = len(utts)
    return np.array([np.mean([math.log((n + 1) / (df[w] + 0.5)) for w in u.words]) for u in utts])


def summarise(day_utts, budget):
    """Extractive summary: keep the `budget` utterances with the highest importance, in order."""
    if budget >= len(day_utts):
        return list(day_utts)
    imp = importance(day_utts)
    keep = sorted(np.argsort(-imp, kind="stable")[:budget].tolist())
    return [day_utts[i] for i in keep]


def baseline_summary(day_utts, budget, rng, kind):
    if budget >= len(day_utts):
        return list(day_utts)
    if kind == "first":
        return list(day_utts[:budget])
    keep = sorted(rng.choice(len(day_utts), budget, replace=False).tolist())
    return [day_utts[i] for i in keep]


def retain(utts, now_day, policy, byte_budget, rng, summary_frac=0.1):
    """Return the utterances kept on the device at the end of day `now_day` under `policy`.

    fifo: drop oldest until under budget. random: drop uniformly random utterances.
    importance: drop lowest-importance (scored within its own day) first.
    summarise: utterances of the last day stay in full; older days are cut to the top
    `summary_frac` by importance, then FIFO if still over budget.
    """
    avail = [u for u in utts if u.day <= now_day]
    if policy == "fifo":
        order = sorted(range(len(avail)), key=lambda i: (avail[i].day, avail[i].t), reverse=True)
    elif policy == "random":
        order = rng.permutation(len(avail)).tolist()
    elif policy in ("importance", "summarise"):
        by_day = {}
        for i, u in enumerate(avail):
            by_day.setdefault(u.day, []).append(i)
        score = np.zeros(len(avail))
        rank = np.zeros(len(avail))
        for d, ids in by_day.items():
            imp = importance([avail[i] for i in ids])
            r = np.empty(len(ids))
            r[np.argsort(-imp, kind="stable")] = np.arange(len(ids)) / max(1, len(ids))
            score[ids] = imp
            rank[ids] = r
        if policy == "importance":
            order = np.argsort(-score, kind="stable").tolist()
        else:
            # today in full first, then older days by within-day rank, then by recency
            def key(i):
                u = avail[i]
                if u.day == now_day:
                    return (0, 0.0)
                return (1, rank[i] if rank[i] <= summary_frac else 1.0 + (now_day - u.day))
            order = sorted(range(len(avail)), key=key)
    else:
        raise ValueError(policy)
    kept, used = [], 0
    for i in order:
        if used + avail[i].nbytes > byte_budget:
            continue
        kept.append(avail[i])
        used += avail[i].nbytes
    return kept
