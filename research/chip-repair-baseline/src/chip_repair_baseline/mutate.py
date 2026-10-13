"""Baseline proposer with no model: random single-token mutations, hill climbing on the
number of simulation mismatches. Deterministic given the seed."""
import random
import re

from .check import check

OP_GROUPS = [["+", "-"], ["&", "|", "^"], ["&&", "||"], ["<", ">", "<=", ">="], ["==", "!="],
             ["<<", ">>"]]
TOKEN = re.compile(r"<=|>=|==|!=|&&|\|\||<<|>>|[+\-&|^<>]|\b\d+\b")


def _candidates(src):
    """Positions in the module body (after the port list) that can be mutated."""
    body_start = src.find(");") + 2
    out = []
    for m in TOKEN.finditer(src, body_start):
        tok = m.group()
        # skip non-blocking assignment arrows "<=" used as assignment is ambiguous: allowed
        out.append((m.start(), m.end(), tok))
    return out


def mutate(src, rng):
    cands = _candidates(src)
    if not cands:
        return src
    s, e, tok = rng.choice(cands)
    if tok.isdigit():
        v = int(tok)
        new = str(max(0, v + rng.choice([-1, 1])))
    else:
        group = next((g for g in OP_GROUPS if tok in g), None)
        if group is None:
            return src
        new = rng.choice([o for o in group if o != tok])
    return src[:s] + new + src[e:]


def _score(r):
    if r["stage"] in ("compile", "lint", None):
        return 10 ** 9
    return 0 if r["ok"] else (r["fail"] if r["fail"] is not None else 10 ** 8)


def mutation_search(task, start_src, budget, seed=0):
    """Hill-climb from `start_src` using at most `budget` checker evaluations.

    Returns (solved, evaluations_used, best_source).
    """
    rng = random.Random(seed)
    best, best_r = start_src, check(task, start_src)
    used = 1
    if best_r["ok"]:
        return True, used, best
    while used < budget:
        cand = mutate(best, rng)
        if cand == best:
            used += 1
            continue
        r = check(task, cand)
        used += 1
        if r["ok"]:
            return True, used, cand
        if _score(r) <= _score(best_r):
            best, best_r = cand, r
    return False, used, best
