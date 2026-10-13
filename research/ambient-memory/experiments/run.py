"""Experiments for ambient-memory. Prints everything; redirect to results.txt."""
import time

import numpy as np

from ambient_memory.sim import (BM25, World, baseline_summary, hit_at_k, make_corpus, retain,
                                summarise)

SEEDS = 10


def ms(x):
    x = np.asarray(x, float)
    return f"{x.mean():.3f}+-{x.std():.3f}"


def exp1():
    print("1. Retrieval: hit@k of the planted fact, one 1500-utterance day, unique key words")
    print("   query_share  BM25@1  BM25@5  recency@5  random@5")
    for share in (0.34, 0.67, 1.0):
        h1, h5, rec, rnd = [], [], [], []
        for s in range(SEEDS):
            rng = np.random.default_rng(s)
            w = World(n_days=1, facts_per_day=6, query_share=share)
            utts, qs = make_corpus(w, rng)
            ix = BM25(utts)
            h1.append(np.mean([hit_at_k(ix, q, f, 1) for f, d, q in qs]))
            h5.append(np.mean([hit_at_k(ix, q, f, 5) for f, d, q in qs]))
            last5 = [u.fact for u in utts[-5:]]
            rec.append(np.mean([f in last5 for f, d, q in qs]))
            rnd.append(np.mean([f in [utts[i].fact for i in rng.choice(len(utts), 5, replace=False)] for f, d, q in qs]))
        print(f"   {share:<11}  {ms(h1)}  {ms(h5)}  {ms(rec)}  {ms(rnd)}")
    print()


def exp2():
    print("2. Retrieval with ambiguous key words (key_mode=tail: facts use rare-half filler words), hit@5")
    print("   query_share  BM25@5")
    for share in (0.34, 0.67, 1.0):
        h = []
        for s in range(SEEDS):
            rng = np.random.default_rng(s)
            w = World(n_days=1, facts_per_day=6, query_share=share, key_mode="tail")
            utts, qs = make_corpus(w, rng)
            ix = BM25(utts)
            h.append(np.mean([hit_at_k(ix, q, f, 5) for f, d, q in qs]))
        print(f"   {share:<11}  {ms(h)}")
    print()


def exp3():
    print("3. Summaries: fraction of the day's facts present in an extractive summary of a")
    print("   given size (fraction of the day's utterances). Importance = mean IDF within the day.")
    for mode in ("unique", "tail"):
        print(f"   key_mode={mode}")
        print("   size   importance  first-k  random-k")
        for frac in (0.01, 0.02, 0.05, 0.10, 0.20):
            r = {"imp": [], "first": [], "rand": []}
            for s in range(SEEDS):
                rng = np.random.default_rng(100 + s)
                w = World(n_days=1, facts_per_day=6, key_mode=mode)
                utts, _ = make_corpus(w, rng)
                b = max(1, int(frac * len(utts)))
                total = sum(u.fact >= 0 for u in utts)
                for name, summ in (("imp", summarise(utts, b)),
                                   ("first", baseline_summary(utts, b, rng, "first")),
                                   ("rand", baseline_summary(utts, b, rng, "random"))):
                    r[name].append(sum(u.fact >= 0 for u in summ) / total)
            print(f"   {frac:<5}  {ms(r['imp'])}  {ms(r['first'])}  {ms(r['rand'])}")
    print()


def run_retention(policy, frac, mode, seed, now_day=6):
    rng = np.random.default_rng(200 + seed)
    w = World(n_days=now_day + 1, key_mode=mode)
    utts, qs = make_corpus(w, rng)
    budget = int(frac * sum(u.nbytes for u in utts))
    kept = retain(utts, now_day, policy, budget, rng)
    ix = BM25(kept)
    return [(now_day - d, hit_at_k(ix, q, f, 5)) for f, d, q in qs], len(kept) / len(utts)


def exp4():
    print("4. Retention: after 7 days, ask about every planted fact (42) from a store limited to a")
    print("   fraction of the total bytes. hit@5 averaged over facts. Policies: fifo, random,")
    print("   importance (keep highest within-day IDF), summarise (today in full, older days top 10%).")
    for mode in ("unique", "tail"):
        print(f"   key_mode={mode}")
        print("   budget  fifo          random        importance    summarise")
        for frac in (0.05, 0.10, 0.25, 0.50, 1.0):
            row = []
            for pol in ("fifo", "random", "importance", "summarise"):
                row.append(ms([np.mean([h for _, h in run_retention(pol, frac, mode, s)[0]]) for s in range(SEEDS)]))
            print(f"   {frac:<6}  " + "  ".join(row))
    print()
    print("   Same, by age of the fact (days old: 0 = today), budget 0.10, key_mode=unique")
    print("   age  fifo   random importance summarise")
    res = {p: [run_retention(p, 0.10, "unique", s)[0] for s in range(SEEDS)] for p in ("fifo", "random", "importance", "summarise")}
    for age in range(7):
        cells = []
        for p in res:
            cells.append(f"{np.mean([np.mean([h for a, h in run if a == age]) for run in res[p]]):.2f}")
        print(f"   {age:<3}  " + "    ".join(cells))
    print()


def exp5():
    print("5. Cost: index build time and per-query time of the pure-Python BM25, 7 days (10500 utterances)")
    rng = np.random.default_rng(0)
    utts, qs = make_corpus(World(n_days=7), rng)
    t = time.perf_counter(); ix = BM25(utts); tb = time.perf_counter() - t
    t = time.perf_counter()
    for f, d, q in qs:
        ix.top(q, 5)
    tq = (time.perf_counter() - t) / len(qs)
    nbytes = sum(u.nbytes for u in utts)
    print(f"   text {nbytes/1e3:.0f} kB; build {tb:.2f} s; query {tq*1e3:.1f} ms (this CPU, one run, not a phone)")
    print()


if __name__ == "__main__":
    exp1(); exp2(); exp3(); exp4(); exp5()
