"""Tests for regimes() and length_matched(), which produce the reported tables.

Synthetic suite with a hand-checkable answer. Every family uses two fixed sentences, one for human
text (H) and one for machine text (M), so each text's features are one of two vectors and every
AUROC is 0 or 1 exactly. Seven "normal" families have 30 human (H) and 30 machine (M) items. The
target family, wiki, is INVERTED: its humans write M and its machine writes H, 200 items each.

For target wiki (others: 7 x 30 = 210 H labelled human, 210 M labelled machine):
  universal / k=0   trains on the other families only, so it scores H as human and M as machine;
                    on wiki that ranks every human above every machine the wrong way: AUROC 0.
  per-family        trains on half of wiki itself, sees the inverted mapping: AUROC 1.
  k=10              5x weight on ~5 per class (~25) cannot outvote 210: still AUROC 0.
  k=160             ~80 per class x 5 = ~400 weight against 210 per sentence: the vector M is
                    now majority-human, H majority-machine, so wiki is ranked right: AUROC 1.
                    Without the 5x weight (~80 against 210) it would stay 0, and without the
                    target items it equals universal (0).
"""
import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import anyctx  # noqa: E402

H = "honestly lol we went home and the dog was fine"
M = "certainly here is a thoughtful overview of the topic"
TARGET = "wiki"


def suite():
    its = []
    for f in anyctx.FAMILIES:
        n, (hum_text, llm_text) = (200, (M, H)) if f == TARGET else (30, (H, M))
        for i in range(n):
            its.append({"family": f, "y": 0, "label": "human", "model": "human", "id": f"{f}h{i}", "text": hum_text})
            its.append({"family": f, "y": 1, "label": "llm", "model": "llama-chat", "id": f"{f}m{i}", "text": llm_text})
    return its


class Regimes(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        its = suite(); anyctx.prepare(its)
        cls.r = anyctx.regimes(its, seeds=2)[TARGET]

    def test_keys(self):
        self.assertEqual(set(self.r), {"universal", "per_family", *(f"adapted_k{k}" for k in anyctx.KS)})

    def test_universal_is_inverted(self):
        self.assertEqual(self.r["universal"], [0.0, 0.0])
        self.assertEqual(self.r["adapted_k0"], self.r["universal"])

    def test_per_family_is_perfect(self):
        self.assertEqual(self.r["per_family"], [1.0, 0.0])

    def test_small_k_is_outvoted(self):
        self.assertEqual(self.r["adapted_k10"], [0.0, 0.0])

    def test_k160_uses_weighted_target_items(self):
        self.assertEqual(self.r["adapted_k160"], [1.0, 0.0])


class NoTrainTestOverlap(unittest.TestCase):
    """Every detector regimes() fits is scored only on items it was not trained on, and the
    universal/k=0 detector never trains on the target family."""

    def test_disjoint(self):
        its = suite(); anyctx.prepare(its)
        key = lambda i: i["id"] + i["label"] + i["model"]
        calls, real_fit = [], anyctx.fit

        def spy(tr, y, w=None):
            score = real_fit(tr, y, w)
            def scored(te):
                calls.append(({key(i) for i in tr}, {key(i) for i in te}, {i["family"] for i in tr}, len(tr)))
                return score(te)
            return scored

        anyctx.fit = spy
        try:
            anyctx.regimes(its, seeds=1)
        finally:
            anyctx.fit = real_fit
        # per family: 2 per-family folds + one fit per k
        self.assertEqual(len(calls), len(anyctx.FAMILIES) * (2 + len(anyctx.KS)))
        for tr, te, fams, n in calls:
            self.assertFalse(tr & te)
        n_oth = len(its) - 400  # wiki has 400 items
        k0 = [fams for tr, te, fams, n in calls if n == n_oth]
        self.assertTrue(k0)
        for fams in k0:
            self.assertNotIn(TARGET, fams)


class LengthMatched(unittest.TestCase):
    """Universal detector inside the shared length band, plus raw-length AUROC.

    Target wiki: human lengths 10..19 (10 items), machine lengths 15..24. numpy's default (linear)
    percentiles: human p10 = 10.9, p90 = 18.1; machine p10 = 15.9, p90 = 23.1. Band = [15.9, 18.1],
    so lengths 16, 17, 18 of each class: 6 items. length_alone = P(machine longer, ties half): of
    100 pairs the machine text is shorter in 10 and tied in 5, so (85 + 2.5) / 100 = 0.875.
    """

    def test_band_and_length_alone(self):
        its = []
        for f in anyctx.FAMILIES:
            for i in range(10):
                hl, ml = (10 + i, 15 + i) if f == TARGET else (10, 30)
                its.append({"family": f, "y": 0, "label": "human", "model": "human", "id": f"{f}h{i}", "text": "a" * hl})
                its.append({"family": f, "y": 1, "label": "llm", "model": "llama-chat", "id": f"{f}m{i}", "text": "b" * ml})
        anyctx.prepare(its)
        r = anyctx.length_matched(its)[TARGET]
        self.assertAlmostEqual(r["band"][0], 15.9); self.assertAlmostEqual(r["band"][1], 18.1)
        self.assertEqual(r["n_in_band"], 6)
        # length_alone: pairs (human h in 10..19, machine m in 15..24) with m > h count 1, m == h half.
        wins = sum(1.0 if m > h else 0.5 if m == h else 0.0 for h in range(10, 20) for m in range(15, 25))
        self.assertEqual(wins, 87.5)  # 100 pairs; machine shorter in 10, tied in 5
        self.assertAlmostEqual(r["length_alone"], wins / 100)


if __name__ == "__main__":
    unittest.main()
