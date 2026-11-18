"""Session 73: Cohen's kappa for the description rules, from committed codes only (stdlib)."""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import desc_eval  # noqa: E402


def test_kappa_known_cases():
    assert desc_eval.kappa([("a", "a"), ("b", "b")]) == 1.0
    # perfect disagreement on a balanced two-class sample: po 0, pe 0.5 -> kappa -1
    assert desc_eval.kappa([("a", "b"), ("b", "a")]) == -1.0
    # textbook 2x2: 20 aa, 5 ab, 10 ba, 15 bb -> po 0.7, pe 0.5 -> 0.4
    pairs = [("a", "a")] * 20 + [("a", "b")] * 5 + [("b", "a")] * 10 + [("b", "b")] * 15
    assert abs(desc_eval.kappa(pairs) - 0.4) < 1e-12


def test_committed_kappa_values():
    res = json.load(open(os.path.join(HERE, "..", "results", "desc_rules_eval.json")))
    k = lambda city, v: desc_eval.kappa([(x[0], x[v]) for x in res["held_out"]["cities"][city]["rows"]])
    assert round(k("chicago", 2), 3) == 0.790 and round(k("seattle", 2), 3) == 0.901  # LOG session 73
    assert k("chicago", 1) < k("chicago", 2) and k("seattle", 1) < k("seattle", 2)
