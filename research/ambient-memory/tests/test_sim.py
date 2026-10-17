import numpy as np
import pytest

from ambient_memory.sim import BM25, World, Utt, hit_at_k, importance, make_corpus, retain, summarise


def small(**kw):
    w = World(n_days=3, utts_per_day=200, facts_per_day=4, **kw)
    return w, *make_corpus(w, np.random.default_rng(0))


def test_corpus_counts_and_fact_ids():
    w, utts, queries = small()
    assert len(utts) == 600 and len(queries) == 12
    assert sorted(u.fact for u in utts if u.fact >= 0) == list(range(12))


def test_bm25_finds_unique_fact_with_full_query():
    w, utts, queries = small(query_share=1.0, query_noise=0)
    ix = BM25(utts)
    assert all(hit_at_k(ix, q, f, 1) for f, d, q in queries)


def test_bm25_scores_zero_for_unseen_words():
    _, utts, _ = small()
    assert BM25(utts).top(["nonexistent"], 5) == []


def test_bm25_prefers_rarer_term():
    utts = [Utt(0, 0, ["a", "b"]), Utt(0, 1, ["a", "c"]), Utt(0, 2, ["a", "a"]), Utt(0, 3, ["x", "y"])]
    ix = BM25(utts)
    assert ix.top(["a", "c"], 1) == [1]


def test_importance_ranks_rare_words_higher():
    utts = [Utt(0, i, ["common", "common2"]) for i in range(20)] + [Utt(0, 20, ["rare1", "rare2"])]
    imp = importance(utts)
    assert imp.argmax() == 20


def test_summary_budget_and_order():
    _, utts, _ = small()
    day = [u for u in utts if u.day == 0]
    s = summarise(day, 20)
    assert len(s) == 20 and [u.t for u in s] == sorted(u.t for u in s)
    # unique-key fact utterances are among the rarest, so a 40-slot summary of 200 holds them all
    assert {u.fact for u in day if u.fact >= 0} <= {u.fact for u in summarise(day, 40)}


@pytest.mark.parametrize("policy", ["fifo", "random", "importance", "summarise"])
def test_retain_respects_budget_and_time(policy):
    _, utts, _ = small()
    budget = sum(u.nbytes for u in utts) // 4
    kept = retain(utts, 1, policy, budget, np.random.default_rng(1))
    assert sum(u.nbytes for u in kept) <= budget
    assert all(u.day <= 1 for u in kept)


def test_fifo_keeps_newest():
    _, utts, _ = small()
    kept = retain(utts, 2, "fifo", sum(u.nbytes for u in utts) // 4, np.random.default_rng(1))
    assert min(u.day for u in kept) >= 1 and sum(u.day == 2 for u in kept) > sum(u.day == 1 for u in kept)


def test_unknown_policy_raises():
    _, utts, _ = small()
    with pytest.raises(ValueError):
        retain(utts, 1, "nope", 100, np.random.default_rng(0))
