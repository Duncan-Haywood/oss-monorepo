import json, os, sys, unittest

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
import retrain  # noqa: E402

H = ["we went home and ate soup", "my cat is old and lazy", "ate soup at home today", "the old cat sat home"] * 6
M = ["moreover this comprehensive tapestry delves deeply", "furthermore the multifaceted landscape is rich", "moreover a comprehensive landscape delves in",
     "furthermore this rich tapestry is multifaceted"] * 6
ITEMS = [{"text": t, "y": 0, "family": "a"} for t in H] + [{"text": t, "y": 1, "family": "a"} for t in M]


class RetrainTests(unittest.TestCase):
    def test_attack_all_leaves_humans_alone(self):
        det = retrain.W.fit([i["text"] for i in ITEMS], [i["y"] for i in ITEMS])
        texts, used = retrain.attack_all(det, ITEMS, 10, 2, 0)
        self.assertEqual(texts[:len(H)], H)
        self.assertGreater(used, 0)

    def test_play_returns_one_row_per_round(self):
        rows = retrain.play(ITEMS, ITEMS, rounds=2, q=10, k=2)
        self.assertEqual([r["round"] for r in rows], [0, 1, 2])
        for r in rows:
            self.assertTrue(0 <= r["attacked"] <= 1)

    def test_round0_stale_equals_attacked(self):
        r0 = retrain.play(ITEMS, ITEMS, rounds=1, q=10, k=2)[0]
        self.assertEqual(r0["attacked"], r0["stale_round0_attack"])

    def test_committed_results(self):
        p = os.path.join(HERE, "results.json")
        if os.path.exists(p):
            r = json.load(open(p))
            self.assertEqual(len(r["rows"]), retrain.ROUNDS + 1)


if __name__ == "__main__":
    unittest.main()
