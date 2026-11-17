#!/usr/bin/env python3
"""Odd leagues, three wait-free games a night, as a graph packing: one night relabelled.

The whole-season model (eval/odd-night-sat.py) and the cyclic one (eval/odd-cyclic.py) both
failed on fully booked nights: 19 teams on 3 courts x 9 slots, 25 on 4 x 9 (eval/odd-cyclic.txt).
This script asks a different question.

Take one wait-free night T (three rounds and their rows) of n odd teams, team n the bye; one
night alone is quick to find (odd-night-sat.py --nights 1, 19 on 3 x 9 in about 30 s). Its
matches, bye matches included, form a cubic graph H on N = n + 1 vertices: every team, the bye
team too, meets three others. Any relabelling of the real teams carries T to another wait-free
night (the same rows, teams renamed). So look for permutations s_0 = id, s_1, ..., s_{k-1} of the
real teams (team n fixed) whose images of H are edge-disjoint in K_N. Then:

  - nights 0 .. k - 1 are T relabelled by s_t, each wait-free by construction;
  - every vertex has degree 3k in their union, so what is left of K_N is (n - 3k)-regular. With
    n = 3k + 1 (19 = 3 x 6 + 1, 25 = 3 x 8 + 1) the rest is one perfect matching: the last round,
    a night of one game per team, which no row order can make wait.
  - with n = 3k + 2 (29 = 3 x 9 + 2) the rest is 2-regular on N vertices, an even union of
    cycles that must split into two matchings laid out as a two-round night; the script
    asks for that too (every cycle even, then a 2-round layout check).

The packing is a SAT model: s[t, a, u] (template team a plays as team u on night t), a permutation
matrix each night; c[t, u, v] is forced true when night t's image uses the pair {u, v}, and every
pair is used at most once. Several templates (--templates K) can be offered; each night then
picks one with a selector. The decoded season is re-checked by odd-night-sat.check and printed
as the JSON odd-night-sat.py prints, so eval/write-odd-designs.mjs stores it unchanged.

It only finds designs (a template that does not pack proves nothing).
Needs python-sat (pip install python-sat; MIT), for this eval script only.
  python3 eval/odd-pack.py 19 --courts 3 --times 9 [--templates 1] [--seed 1]
"""
import argparse
import importlib.util
import json
import os
import random
import sys
import time

from pysat.card import CardEnc, EncType
from pysat.formula import CNF, IDPool
from pysat.solvers import Solver

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("ons", os.path.join(HERE, "odd-night-sat.py"))
ons = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ons)


def one_night(n, courts, times, seed, solver="cd15", avoid=()):
    """One wait-free night of three rounds (rounds, rows) from odd-night-sat's model, first night only.
    `seed` shuffles the clause order so repeated calls give different nights; `avoid` lists earlier
    nights' match sets, each blocked so the next template differs."""
    cnf, x, p, pairs, real, nights = ons.build(n, courts, times, only=1, shape=True)
    clauses = list(cnf.clauses)
    random.Random(seed).shuffle(clauses)
    for prev in avoid:
        clauses.append([-x[r, i, j] for r, i, j in prev])
    with Solver(name=solver, bootstrap_with=clauses) as s:
        if not s.solve():
            return None
        model = set(v for v in s.get_model() if v > 0)
    rounds = [[(i, j) for (i, j) in pairs if x[r, i, j] in model] for r in range(3)]
    rows = {(i, j): h for (i, j) in real for h in range(times) if p[0, i, j, h] in model}
    return rounds, rows


def pack(n, templates, k, solver="cd15", budget=None):
    """Permutations s_t and a template choice per night so the k nights' graphs are edge-disjoint."""
    N = n + 1
    pool = IDPool()
    cnf = CNF()

    def card(lits, bound, kind, extra=()):
        enc = {"eq": CardEnc.equals, "le": CardEnc.atmost}[kind]
        for cl in enc(lits=lits, bound=bound, vpool=pool, encoding=EncType.seqcounter).clauses:
            cnf.append(cl + list(extra))

    s = {(t, a, u): pool.id(("s", t, a, u)) for t in range(k) for a in range(n) for u in range(n)}
    for t in range(k):
        for a in range(n):
            card([s[t, a, u] for u in range(n)], 1, "eq")
        for u in range(n):
            card([s[t, a, u] for a in range(n)], 1, "eq")
    for a in range(n):  # night 0 is the template itself
        cnf.append([s[0, a, a]])
    z = {(t, m): pool.id(("z", t, m)) for t in range(k) for m in range(len(templates))}
    for t in range(k):
        card([z[t, m] for m in range(len(templates))], 1, "eq")
    cnf.append([z[0, 0]])
    c = {(t, u, v): pool.id(("c", t, u, v)) for t in range(k) for u in range(N) for v in range(u + 1, N)}

    def sv(t, a, u):
        return None if (a == n) != (u == n) else (s[t, a, u] if a < n else 0)

    for t in range(k):
        for m, (rounds, _) in enumerate(templates):
            for r in rounds:
                for a, b in r:
                    for u in range(N):
                        for v in range(N):
                            if u == v:
                                continue
                            la, lb = sv(t, a, u), sv(t, b, v)
                            if la is None or lb is None:
                                continue
                            cl = [-z[t, m], c[t, min(u, v), max(u, v)]]
                            if la:
                                cl.append(-la)
                            if lb:
                                cl.append(-lb)
                            cnf.append(cl)
    for u in range(N):
        for v in range(u + 1, N):
            card([c[t, u, v] for t in range(k)], 1, "le")
    # symmetry: nights 1 .. k - 1 are interchangeable; order them by the team template team 0 plays as
    for t in range(1, k - 1):
        for u in range(n):
            for w in range(u):
                cnf.append([-s[t, 0, u], -s[t + 1, 0, w]])
    t0 = time.time()
    with Solver(name=solver, bootstrap_with=cnf.clauses) as so:
        ok = so.solve()
        model = set(v for v in so.get_model() if v > 0) if ok else None
    dt = time.time() - t0
    if not ok:
        return None, dt
    perm = [[next(u for u in range(n) if s[t, a, u] in model) for a in range(n)] + [n] for t in range(k)]
    pick = [next(m for m in range(len(templates)) if z[t, m] in model) for t in range(k)]
    return (perm, pick), dt


def two_round_rest(n, used, courts, times, solver):
    """When n = 3k + 2: the 2-regular rest split into two matchings and laid out as one night."""
    N = n + 1
    rest = [(u, v) for u in range(N) for v in range(u + 1, N) if (u, v) not in used]
    adj = {v: [] for v in range(N)}
    for u, v in rest:
        adj[u].append(v)
        adj[v].append(u)
    assert all(len(a) == 2 for a in adj.values())
    seen, r1, r2 = set(), [], []
    for v0 in range(N):
        if v0 in seen:
            continue
        cyc, prev, cur = [v0], None, v0
        while True:
            seen.add(cur)
            nxt = adj[cur][0] if adj[cur][0] != prev else adj[cur][1]
            if nxt == v0:
                break
            cyc.append(nxt)
            prev, cur = cur, nxt
        if len(cyc) % 2:
            return None
        for i in range(len(cyc)):
            e = (min(cyc[i], cyc[(i + 1) % len(cyc)]), max(cyc[i], cyc[(i + 1) % len(cyc)]))
            (r1 if i % 2 == 0 else r2).append(e)
    # each cycle can be split two ways; try the layout on the first split only (the night of two
    # rounds lays out easily when it has spare rows; a failure here is reported, not hidden)
    return [r1, r2]


def lay_rounds(n, rounds, courts, times, solver):
    """Rows for a night of these rounds (each team back to back), or None (odd-cyclic's layout)."""
    _spec2 = importlib.util.spec_from_file_location("oc", os.path.join(HERE, "odd-cyclic.py"))
    oc = importlib.util.module_from_spec(_spec2)
    _spec2.loader.exec_module(oc)
    oc.round_pairs = lambda nn, r: rounds[r]
    return oc.lay_night(n, list(range(len(rounds))), courts, times, solver)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("n", type=int)
    ap.add_argument("--courts", type=int, required=True)
    ap.add_argument("--times", type=int, default=9)
    ap.add_argument("--templates", type=int, default=1, help="one-night templates to offer each night")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--solver", default="cd15")
    ap.add_argument("--template-file", default=None, help="a JSON of earlier templates to reuse")
    args = ap.parse_args()
    n, courts, times = args.n, args.courts, args.times
    assert n % 2 == 1 and n % 3 in (1, 2)
    k = n // 3
    t_all = time.time()
    templates = []
    for i in range(args.templates):
        tpl = one_night(n, courts, times, args.seed * 1000 + i, args.solver, avoid=[
            [(r, i_, j_) for r, rr in enumerate(tp[0]) for (i_, j_) in rr] for tp in templates])
        assert tpl is not None, "no wait-free night at all"
        templates.append(tpl)
        print(f"# template {i} found ({time.time() - t_all:.1f} s)", file=sys.stderr)
    t_tpl = time.time() - t_all
    res, dt = pack(n, templates, k, args.solver)
    head = {"n": n, "courts": courts, "times": times, "method": "pack", "templates": args.templates,
            "seed": args.seed, "seconds_templates": round(t_tpl, 1), "seconds_pack": round(dt, 1)}
    if res is None:
        head["sat"] = False
        print(json.dumps(head))
        return
    perm, pick = res
    rounds, rows, nights, used = [], [], [], set()
    for t in range(k):
        trounds, trows = templates[pick[t]]
        P = perm[t]
        idx = []
        for r in trounds:
            rr = sorted((min(P[a], P[b]), max(P[a], P[b])) for a, b in r)
            used.update(rr)
            idx.append(len(rounds))
            rounds.append(rr)
        nights.append(idx)
        rows.append({(min(P[a], P[b]), max(P[a], P[b])): h for (a, b), h in trows.items()})
    N = n + 1
    if n % 3 == 1:
        last = [[(u, v) for u in range(N) for v in range(u + 1, N) if (u, v) not in used]]
    else:
        last = two_round_rest(n, used, courts, times, args.solver)
        if last is None:
            head["sat"] = False
            head["note"] = "packing found, but the rest has an odd cycle"
            print(json.dumps(head))
            return
    lay = lay_rounds(n, last, courts, times, args.solver)
    if lay is None:
        head["sat"] = False
        head["note"] = "packing found, but the short last night does not lay out"
        print(json.dumps(head))
        return
    nights.append(list(range(len(rounds), len(rounds) + len(last))))
    rounds.extend(last)
    rows.append(lay)
    ons.check(n, rounds, nights, rows, courts, times)
    head["sat"] = True
    head["seconds"] = round(time.time() - t_all, 1)
    head["rounds"] = [[list(m) for m in r] for r in rounds]
    head["rows"] = [[[i, j, h] for (i, j), h in sorted(r.items())] for r in rows]
    print(json.dumps(head))


if __name__ == "__main__":
    main()
