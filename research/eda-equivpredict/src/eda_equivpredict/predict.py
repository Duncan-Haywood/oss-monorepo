"""Predict, before formal runs, which simulation survivors formal can prove equivalent.

Everything is replayed from the eda-verify per-mutant log; no tool is run. Survivors are the
mutants the deterministic 16-vector directed set does not kill. Features are those known before
formal starts and that describe the mutation, not the run: the operator or literal kind, the
mutated source line, and the replacement text parsed from the mutant id (`kind@line:note`).
Timing fields (`random_seconds`, `directed_seconds`) are NOT features: they depend on machine load
when the log was written, not on the mutation.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", "eda-checkorder", "src"))
from eda_checkorder import cascade as C  # noqa: E402

load = C.load


def survivors(rows):
    return [r for r in rows if r["directed_first"] is None]


def features(r):
    kind, rest = r["id"].split("@", 1)
    line, note = rest.split(":", 1)
    return {"kind": kind, "line": int(line), "note": note}


def label(r):
    return r["formal"] == "equivalent"


def predict_line_knn(train, x, k=1):
    """Majority label of the k training mutants nearest in source line (ties: nearest first)."""
    d = sorted(train, key=lambda t: (abs(features(t)["line"] - x["line"]), t["i"]))[:k]
    return sum(label(t) for t in d) * 2 > len(d)


def predict_kind(train, x):
    """Majority label among training mutants of the same kind (lit / op / ...)."""
    same = [t for t in train if features(t)["kind"] == x["kind"]]
    if not same:
        same = train
    return sum(label(t) for t in same) * 2 > len(same)


def predict_line_threshold(train, x):
    """One-split rule on line: pick the cut with fewest training errors, then apply it."""
    lines = sorted({features(t)["line"] for t in train})
    best = None
    for cut in lines:
        for hi_equiv in (True, False):
            err = sum(
                      ((features(t)["line"] >= cut) == hi_equiv) != label(t) for t in train)
            if best is None or err < best[0]:
                best = (err, cut, hi_equiv)
    _, cut, hi_equiv = best
    return (x["line"] >= cut) == hi_equiv


def loo(rows, predictor):
    """Leave-one-out predictions over `rows` (a list of survivors)."""
    out = []
    for j, r in enumerate(rows):
        train = rows[:j] + rows[j + 1:]
        out.append(predictor(train, features(r)))
    return out


def loo_by_line(rows, predictor):
    """Leave-one-line-out: all mutants on the held-out mutant's source line leave the training set.

    Several mutants share a line (six on line 123, eight on line 151), so plain leave-one-out lets a
    near-duplicate vote for its twin. This is the fairer score for a line-based predictor.
    """
    out = []
    for r in rows:
        ln = features(r)["line"]
        train = [t for t in rows if features(t)["line"] != ln]
        out.append(predictor(train, features(r)))
    return out


def formal_policy_cost(rows, preds):
    """Formal stage over survivors: run formal only where preds is True.

    Returns dict(cpu_s, equiv_found, equiv_total, formal_runs, kills_lost). A mutant whose formal run is
    skipped contributes no CPU and no result.
    """
    cpu = 0.0
    eq = runs = kills_lost = 0
    for r, p in zip(rows, preds):
        if p:
            cpu += r["formal_seconds"]
            runs += 1
            eq += r["formal"] == "equivalent"
        elif r["formal"] == "killed":
            kills_lost += 1
    return {"cpu_s": cpu, "equiv_found": eq, "formal_runs": runs, "kills_lost": kills_lost,
            "equiv_total": sum(label(r) for r in rows)}
