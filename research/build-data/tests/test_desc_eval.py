"""Session 72: the per-class audit of the description rules, from committed codes only (stdlib)."""
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


def test_audit_matches_committed_accuracy():
    res = json.load(open(os.path.join(HERE, "..", "results", "desc_rules_eval.json")))
    au = desc_eval.audit(res)
    for split in ("dev", "held_out"):
        for city, r in res[split]["cities"].items():
            for k in ("v1", "v2"):
                a = au[split][city][k]
                assert abs(a["accuracy"] - r[k]["accuracy"]) < 1e-12
                assert sum(a["confusions"].values()) == round(a["n"] * (1 - a["accuracy"]))
                for c, p in a["per_class"].items():
                    assert p["precision"] is None or 0 <= p["precision"] <= 1
    # the committed headline of the audit (results/desc_rules_audit.md)
    assert round(au["held_out"]["chicago"]["v2"]["kappa"], 3) == 0.790
    assert round(au["held_out"]["seattle"]["v2"]["kappa"], 3) == 0.901
    assert round(au["held_out"]["chicago"]["v2"]["per_class"]["plumbing"]["precision"], 2) == 0.20
