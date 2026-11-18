#!/usr/bin/env python3
"""eval/odd-orbit.py with one more symmetry: the night is also fixed by turning the three cycles.

odd-orbit.py (n = 3k + 1, k even) turns one wait-free night H by g, three k-cycles A, B, C on the
first 3k teams, team f = 3k and the bye fixed, and asks a SAT solver for H: three rounds, exactly
one pair of every full <g>-orbit, laid out wait-free on `courts` x `times`. It found 19 to 43 teams
on 3 to 7 courts x 9 slots; 43 on 7 x 9 took 9,849 s and 49 on 8 x 9 was estimated at ~11 h.

Here the night's pair set must also be fixed by h, the permutation that sends the i-th team of A to
the i-th of B, B to C and C to A (f and the bye fixed). h commutes with g, so h permutes the full
<g>-orbits; it moves every one of them (an orbit of pairs inside A goes to one inside B, A-B pairs
go to B-C pairs, f-A pairs to f-B pairs), so the 3N/2 full orbits fall into N/2 classes of three,
and choosing H's pair in one orbit of a class chooses it in the other two. f's three opponents and
the bye's three 2-game teams are then one team from each cycle, at the same position.

Result (eval/odd-orbit-sym.txt): every fully booked size tried is UNSAT under this symmetry (13 on
3 x 6 in 0.5 s, 19 on 3 x 9 in 82 s; 25 on 4 x 9 no answer in 10 min against 141 s without it), while
the same sizes with one spare court are SAT (13 and 19 on 4 x 9) and the pair constraints alone are SAT
at 19. Turn-fixing only some kinds of orbit (--only) was UNSAT at 13 or no faster at 19. So it is
no route to 49 on 8 x 9, which is fully booked.

Only the pair set is constrained: the rounds and the night's layout (rows) stay free, so this asks
less of the solver's search, not of the schedule. It is a restriction: UNSAT rules out this
symmetric family only, not the size and not odd-orbit.py's family.

Decoded seasons go through odd-orbit.py's own decoding and odd-night-sat.check, and print the same
JSON (method "orbit-sym"), so eval/write-odd-designs.mjs can store them unchanged.

Needs python-sat (pip install python-sat; MIT), for this eval script only.
  python3 eval/odd-orbit-sym.py 49 --courts 8 --times 9 [--solver cd19] [--no-sym]
"""
import argparse
import importlib.util
import json
import os
import time

from pysat.solvers import Solver

HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name, file):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, file))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


oo = _load("oo", "odd-orbit.py")
ons = oo.ons


def turn(n, twist=0):
    """h as a list: A -> B -> C at the same position, C -> A moved on by `twist` (so h^3 = g^twist);
    f = 3k and the bye fixed. Only twist 0 can work: with h^3 = g^t (t != 0) a turn-fixed H holding e
    also holds g^t e, a second pair of e's orbit (the pair-only model agrees: UNSAT at 19, twist 1)."""
    k = (n - 1) // 3
    h = list(range(n + 1))
    for c in range(3):
        for i in range(k):
            h[c * k + i] = ((c + 1) % 3) * k + (i + (twist if c == 2 else 0)) % k
    return h


def add_turn_symmetry(cnf, x, full, n, twist=0, g3=3, only=None):
    """y[e] = (e is played tonight in some round); y[e] -> y[h e] for every pair of a full orbit."""
    h = turn(n, twist)
    pool_top = cnf.nv
    y = {}
    for orb in full:
        for e in orb:
            pool_top += 1
            y[e] = pool_top
            rs = [x[(r,) + e] for r in range(g3)]
            cnf.append([-y[e]] + rs)
            for v in rs:
                cnf.append([-v, y[e]])
    k = (n - 1) // 3
    kind = lambda e: "cross" if e[1] < 3 * k and e[0] // k != e[1] // k else ("within" if e[1] < 3 * k else "fixed")
    for e, ye in y.items():
        if only and kind(e) not in only:
            continue
        a, b = h[e[0]], h[e[1]]
        he = (min(a, b), max(a, b))
        cnf.append([-ye, y[he]])
    return len(y)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("n", type=int)
    ap.add_argument("--courts", type=int, required=True)
    ap.add_argument("--times", type=int, default=9)
    ap.add_argument("--solver", default="cd19")
    ap.add_argument("--twist", type=int, default=0, help="C -> A shift, so h^3 = g^twist")
    ap.add_argument("--only", default="", help="comma list of cross, within, fixed: turn-fix only these orbit kinds")
    ap.add_argument("--no-sym", action="store_true", help="odd-orbit.py's model, for timing")
    args = ap.parse_args()
    n, courts, times = args.n, args.courts, args.times
    assert n % 6 == 1, "n = 3k + 1 with k even"
    t0 = time.time()
    g, k = oo.perm(n)
    full, short = oo.orbits(n)
    built = oo.night_model(n, courts, times, full, short)
    head = {"n": n, "courts": courts, "times": times, "method": "orbit" if args.no_sym else "orbit-sym", "k": k}
    if built is None:
        head["sat"] = False
        head["note"] = "no window shape fits"
        print(json.dumps(head))
        return
    cnf, x, p, pairs, real = built
    if not args.no_sym:
        add_turn_symmetry(cnf, x, full, n, args.twist, only=set(filter(None, args.only.split(','))))
        head["only"] = args.only or "all"
        head["twist"] = args.twist
    head["vars"], head["clauses"] = cnf.nv, len(cnf.clauses)
    with Solver(name=args.solver, bootstrap_with=cnf.clauses) as s:
        ok = s.solve()
        model = set(v for v in s.get_model() if v > 0) if ok else None
    head["sat"] = ok
    head["seconds"] = round(time.time() - t0, 1)
    if not ok:
        print(json.dumps(head))
        return
    H = [[(i, j) for (i, j) in pairs if x[r, i, j] in model] for r in range(3)]
    lay = {(i, j): hh for (i, j) in real for hh in range(times) if p[i, j, hh] in model}
    if not args.no_sym:
        hp = turn(n, args.twist)
        got = {e for r in H for e in r}
        k3 = 3 * k
        kind = lambda e: "cross" if e[1] < k3 and e[0] // k != e[1] // k else ("within" if e[1] < k3 else "fixed")
        only = set(filter(None, args.only.split(",")))
        assert all((min(hp[a], hp[b]), max(hp[a], hp[b])) in got for (a, b) in got
                   if (a, b) not in short and (not only or kind((a, b)) in only)), "pair set not turn-fixed"

    def img(e, t):
        a, b = e
        for _ in range(t):
            a, b = g[a], g[b]
        return (min(a, b), max(a, b))

    rounds, rows, nights = [], [], []
    for t in range(k):
        nights.append(list(range(len(rounds), len(rounds) + 3)))
        for r in H:
            rounds.append(sorted(img(e, t) for e in r))
        rows.append({img(e, t): hh for e, hh in lay.items()})
    nights.append([len(rounds)])
    rounds.append(sorted(short))
    rows.append({e: i // courts for i, e in enumerate(m for m in sorted(short) if m[1] < n)})
    ons.check(n, rounds, nights, rows, courts, times)
    head["rounds"] = [[list(m) for m in r] for r in rounds]
    head["rows"] = [[[i, j, hh] for (i, j), hh in sorted(r.items())] for r in rows]
    print(json.dumps(head))


if __name__ == "__main__":
    main()
