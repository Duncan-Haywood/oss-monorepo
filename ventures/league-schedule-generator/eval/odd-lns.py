#!/usr/bin/env python3
"""Odd leagues, three wait-free games a night, by large-neighbourhood search with SAT repairs.

The open case (README, "29 teams on 5 x 9"): 29 teams on 5 courts x 9 slots. The whole-season SAT
model is too big (one night alone took 575 s, because a night may use any of the 435 pairs), no
1-rotational round robin lays out, and no group of order k turns one night into the season
(proved in the README). This script never asks the solver for a whole night from all 435 pairs.

The state is a whole round robin: n rounds (perfect matchings of K_(n+1), team n the bye) in the
tool's night order (rounds 3t, 3t + 1, 3t + 2; the last night shorter, nightGroups in nights.mjs).
A night is "good" when its matches have a wait-free layout (each team's games in consecutive rows,
at most `courts` a row), a small SAT question about its own 42 matches.

One step frees m nights (at least one bad): the pairs they hold (U, 45 m pairs at 29 teams, bye
pairs included) are dealt again into the same number of rounds and nights, each pair once, each
team once a round, and every freed night gets a layout. A freed night may be bad (its back-to-back
clauses are switched off by its own indicator), but at least one more of them than before must be
good. The other nights keep their pairs, so the result is still a round robin. The model is small
because U is: a few thousand variables instead of the season's millions.

When no step improves within a budget the search takes a sideways step (as many good nights as
before, pairs re-dealt), so the bad nights see new pairs. It stops when every night is good, then
re-checks the season with odd-night-sat.check and prints the JSON odd-night-sat.py prints, so
eval/write-odd-designs.mjs stores it unchanged.

It only finds designs. Needs python-sat (pip install python-sat; MIT), for this eval script only.
  python3 eval/odd-lns.py 29 --courts 5 --times 9 [--seed 1] [--free 2] [--limit 3600]

Long sizes (41 teams and up) can outlast one session: --save FILE writes the current round robin
(and its good-night count) after every accepted step, and --resume FILE starts from such a file
instead of a fresh circle-method season, so a later run carries on where the last one stopped.
"""
import argparse
import importlib.util
import json
import os
import random
import sys
import multiprocessing as mp
import time

from pysat.card import CardEnc, EncType
from pysat.formula import CNF, IDPool
from pysat.solvers import Solver

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("ons", os.path.join(HERE, "odd-night-sat.py"))
ons = importlib.util.module_from_spec(_spec)
SOLVER = "cd19"
_spec.loader.exec_module(ons)


def key(a, b):
    return (a, b) if a < b else (b, a)


def circle(n, rng):
    """A random-looking 1-factorization of K_(n+1): the circle method, teams renamed, rounds shuffled."""
    N = n + 1
    rounds = []
    for r in range(n):
        m = [key(r, n)]
        for i in range(1, N // 2):
            m.append(key((r + i) % n, (r - i) % n))
        rounds.append(m)
    real = list(range(n))
    rng.shuffle(real)
    name = real + [n]  # the bye stays the bye
    rounds = [[key(name[a], name[b]) for a, b in r] for r in rounds]
    rng.shuffle(rounds)
    return rounds


def solve(clauses, seconds, phases=()):
    """Solve in a child process that is killed at the time limit (CaDiCaL in python-sat cannot be
    interrupted): (True, model as a set), (False, None) or (None, None) when the limit hit."""
    ctx = mp.get_context("fork")
    rd, wr = ctx.Pipe(False)

    def run():
        with Solver(name=SOLVER, bootstrap_with=clauses) as s:
            if phases:
                try:
                    s.set_phases(list(phases))
                except NotImplementedError:
                    pass
            ok = s.solve()
            wr.send((ok, s.get_model() if ok else None))

    proc = ctx.Process(target=run)
    proc.start()
    if rd.poll(seconds):
        ok, model = rd.recv()
        proc.join()
        return ok, (set(v for v in model if v > 0) if ok else None)
    proc.kill()
    proc.join()
    return None, None


class Model:
    def __init__(self):
        self.pool = IDPool()
        self.cnf = CNF()

    def v(self, *name):
        return self.pool.id(name)

    def card(self, lits, bound, kind, extra=()):
        if kind == "le" and len(lits) <= bound:
            return
        enc = {"eq": CardEnc.equals, "le": CardEnc.atmost, "ge": CardEnc.atleast}[kind]
        for cl in enc(lits=lits, bound=bound, vpool=self.pool, encoding=EncType.seqcounter).clauses:
            self.cnf.append(cl + list(extra))

    def layout(self, t, n, courts, times, edge_lit, cand, ok_lit, bye_lit, g=3):
        """Rows for night t of g rounds: every real pair e in cand with edge_lit(e) true gets one
        row. When ok_lit holds, each team's rows are one window: a start row st and g rows, or
        g - 1 when bye_lit(v) (the team sits out a round tonight)."""
        p = {}
        inc = {v: [] for v in range(n)}
        for e in cand:
            if e[1] >= n:
                continue
            ps = [self.v("p", t, e, h) for h in range(times)]
            lit = edge_lit(e)
            for h, pv in enumerate(ps):
                p[e, h] = pv
                if lit is not True:
                    self.cnf.append([-pv, lit])
            self.cnf.append(([] if lit is True else [-lit]) + ps)
            self.card(ps, 1, "le")
            inc[e[0]].append(e)
            inc[e[1]].append(e)
        for h in range(times):
            self.card([p[e, h] for e in cand if e[1] < n], courts, "le")
        extra = [] if ok_lit is True else [-ok_lit]
        for v in range(n):
            q = []
            for h in range(times):
                lits = [p[e, h] for e in inc[v]]
                qv = self.v("q", t, v, h)
                q.append(qv)
                for l in lits:
                    self.cnf.append([-l, qv])
                self.cnf.append([-qv] + lits)
                self.card(lits, 1, "le")
            two = bye_lit(v)  # True, False or a literal
            s1 = g - 1  # the short window; a full one is one row longer
            st = [self.v("st", t, v, a) for a in range(times - s1 + 1)]
            self.card(st, 1, "eq", extra)
            for a, sv in enumerate(st):
                for h in range(a, a + s1):
                    self.cnf.append(extra + [-sv, q[h]])
                if a + s1 < times:
                    if two is False:
                        self.cnf.append(extra + [-sv, q[a + s1]])
                    elif two is not True:
                        self.cnf.append(extra + [-sv, two, q[a + s1]])
                else:
                    if two is False:
                        self.cnf.append(extra + [-sv])
                    elif two is not True:
                        self.cnf.append(extra + [-sv, two])
            for h in range(times):
                near = [st[a] for a in range(h - s1 + 1, h + 1) if 0 <= a < len(st)]
                if h - s1 >= 0 and two is not True:
                    self.cnf.append(extra + [-q[h]] + near + [st[h - s1]])
                    if two is not False:
                        self.cnf.append(extra + [-q[h]] + near + [-two])
                else:
                    self.cnf.append(extra + [-q[h]] + near)
        return p


def night_rows(n, courts, times, matches, g, seconds=20):
    """A wait-free layout of one night's matches (a dict pair -> row), or None."""
    m = Model()
    real = [e for e in matches if e[1] < n]
    sits = {e[0] for e in matches if e[1] == n}
    p = m.layout(0, n, courts, times, lambda e: True, real, True, lambda v: v in sits, g)
    ok, model = solve(m.cnf.clauses, seconds)
    if not ok:
        return None
    return {e: h for e in real for h in range(times) if p[e, h] in model}


def repair(n, courts, times, rounds, nights, freed, need, seconds, rng):
    """Re-deal the pairs of the freed nights; at least `need` of them wait-free. New rounds or None."""
    N = n + 1
    rs = [r for t in freed for r in nights[t]]
    U = sorted({e for r in rs for e in rounds[r]})
    m = Model()
    x = {(r, e): m.v("x", r, e) for r in rs for e in U}
    inc = {v: [e for e in U if v in e] for v in range(N)}
    for e in U:
        m.card([x[r, e] for r in rs], 1, "eq")
    for r in rs:
        for v in range(N):
            m.card([x[r, e] for e in inc[v]], 1, "eq")
    oks = []
    lay = {}
    for t in freed:
        ok = m.v("ok", t)
        oks.append(ok)
        ys = {}
        for e in U:
            y = m.v("y", t, e)  # the pair meets on night t
            ys[e] = y
            lits = [x[r, e] for r in nights[t]]
            for l in lits:
                m.cnf.append([-l, y])
            m.cnf.append([-y] + lits)
        p = m.layout(t, n, courts, times, lambda e, ys=ys: ys[e], U, ok, lambda v, ys=ys: ys.get((v, n), False), len(nights[t]))
        lay[t] = (ok, ys, p)
    m.card(oks, need, "ge")
    # random phases so sideways steps wander instead of returning the same deal
    phases = [(1 if rng.random() < 0.5 else -1) * x[k] for k in rng.sample(list(x), len(x) // 3)]
    res, model = solve(m.cnf.clauses, seconds, phases)
    if not res:
        return None
    out = [list(r) for r in rounds]
    for r in rs:
        out[r] = sorted(e for e in U if x[r, e] in model)
    # the layouts the solver found for the nights it marked good: no second solve needed (a second
    # solve under night_rows' short limit could time out and reject a good repair)
    rows = {}
    for t, (ok, ys, p) in lay.items():
        if ok in model:
            rows[t] = {e: h for e in U if e[1] < n and ys[e] in model for h in range(times) if p[e, h] in model}
    return out, rows


def check_round_robin(n, rounds):
    """Raise unless rounds are n perfect matchings of K_(n+1) using every pair once."""
    N = n + 1
    assert len(rounds) == n, "need n rounds"
    seen = set()
    for r in rounds:
        teams = [v for e in r for v in e]
        assert sorted(teams) == list(range(N)), "a round must hold every team once"
        for e in r:
            assert e not in seen, f"pair {e} twice"
            seen.add(e)
    assert len(seen) == N * (N - 1) // 2


def night_ok(n, courts, times, matches, rows, g):
    """True when rows (pair -> row) lay this night's matches out wait-free: every real match one row,
    at most `courts` a row, each team's rows one unbroken window of g rows (g - 1 when it sits out)."""
    real = [e for e in matches if e[1] < n]
    sits = {e[0] for e in matches if e[1] == n}
    if set(rows) != set(real) or any(not 0 <= rows[e] < times for e in real):
        return False
    per = {}
    for e in real:
        per[rows[e]] = per.get(rows[e], 0) + 1
    if any(c > courts for c in per.values()):
        return False
    for v in {x for e in matches for x in e if x < n}:
        hs = sorted(rows[e] for e in real if v in e)
        want = g - 1 if v in sits else g
        if len(hs) != want or hs != list(range(hs[0], hs[0] + want)):
            return False
    return True


def save_state(path, n, courts, times, seed, rounds, good, total, layouts=None):
    """layouts: night index -> {pair: row} for the good nights, so a resume need not re-solve them
    (a re-solve under night_rows' 20 s limit lost 1 to 2 good nights of 11 at 41 teams)."""
    tmp = path + ".tmp"
    lay = {str(t): [[a, b, h] for (a, b), h in sorted(r.items())] for t, r in (layouts or {}).items()}
    with open(tmp, "w") as f:
        json.dump({"n": n, "courts": courts, "times": times, "seed": seed, "good": good, "nights": total,
                   "rounds": [[list(e) for e in r] for r in rounds], "layouts": lay}, f, separators=(",", ":"))
    os.replace(tmp, path)


def load_state(path, n, courts, times):
    """(rounds, layouts): the round robin and the stored layouts of its good nights (unchecked)."""
    with open(path) as f:
        st = json.load(f)
    assert (st["n"], st["courts"], st["times"]) == (n, courts, times), "state is for another league"
    rounds = [sorted(key(a, b) for a, b in r) for r in st["rounds"]]
    check_round_robin(n, rounds)
    lay = {int(t): {key(a, b): h for a, b, h in r} for t, r in st.get("layouts", {}).items()}
    return rounds, lay


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("n", type=int)
    ap.add_argument("--courts", type=int, required=True)
    ap.add_argument("--times", type=int, default=9)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--free", type=int, default=2, help="nights freed a step")
    ap.add_argument("--step", type=float, default=60, help="seconds a repair may take")
    ap.add_argument("--limit", type=float, default=3600, help="seconds in all")
    ap.add_argument("--save", help="write the state here after every accepted step")
    ap.add_argument("--resume", help="start from a state file written by --save")
    ap.add_argument("--resume-check", type=float, default=180, help="seconds to re-check a resumed night with no stored layout")
    args = ap.parse_args()
    n, courts, times = args.n, args.courts, args.times
    assert n % 2 == 1
    rng = random.Random(args.seed)
    t0 = time.time()
    rounds = circle(n, rng)
    nights = [list(range(s, min(s + 3, n))) for s in range(0, n, 3)]
    cache = {}
    if args.resume:
        rounds, stored = load_state(args.resume, n, courts, times)
        for t, r in stored.items():
            k = frozenset(e for rr in nights[t] for e in rounds[rr])
            if night_ok(n, courts, times, k, r, len(nights[t])):
                cache[k] = r

    def good(t, seconds=20):
        k = frozenset(e for r in nights[t] for e in rounds[r])
        if k not in cache:
            cache[k] = night_rows(n, courts, times, k, len(nights[t]), seconds)
        return cache[k] is not None

    # a resumed night with no stored layout gets a longer first check (--resume-check seconds)
    status = [good(t, args.resume_check if args.resume else 20) for t in range(len(nights))]
    steps = fails = 0
    log = lambda *a: print(f"[{time.time() - t0:7.1f}s]", *a, file=sys.stderr, flush=True)
    log("start", sum(status), "of", len(nights), "nights good")
    while not all(status) and time.time() - t0 < args.limit:
        steps += 1
        bad = [t for t in range(len(nights)) if not status[t]]
        goodn = [t for t in range(len(nights)) if status[t]]
        m = min(args.free, len(nights))
        freed = [rng.choice(bad)]
        rest = [t for t in range(len(nights)) if t != freed[0]]
        freed += rng.sample(rest, m - 1)
        cur = sum(status[t] for t in freed)
        sideways = fails >= 6
        need = cur if sideways else cur + 1
        new = repair(n, courts, times, rounds, nights, freed, need, args.step, rng)
        if new is None:
            fails += 1
            continue
        old_rounds = rounds
        rounds, laid = new
        for t, r in laid.items():
            cache[frozenset(e for rr in nights[t] for e in rounds[rr])] = r
        st = [good(t) if t in freed else status[t] for t in range(len(nights))]
        if sum(st) < sum(status):  # a layout the night check could not confirm in its time
            rounds = old_rounds
            fails += 1
            continue
        status = st
        fails = 0 if not sideways else 0
        if args.save:
            lay = {t: cache[frozenset(e for r in nights[t] for e in rounds[r])] for t in range(len(nights)) if status[t]}
            save_state(args.save, n, courts, times, args.seed, rounds, sum(status), len(nights), lay)
        log(f"step {steps}: freed {freed}, {'sideways' if sideways else 'better'}: {sum(status)} of {len(nights)} good")
    head = {"n": n, "courts": courts, "times": times, "method": "lns", "seed": args.seed, "free": args.free, "steps": steps}
    head["seconds"] = round(time.time() - t0, 1)
    if not all(status):
        head["sat"] = None
        head["good"] = sum(status)
        print(json.dumps(head))
        return
    rows = [cache[frozenset(e for r in nights[t] for e in rounds[r])] for t in range(len(nights))]
    ons.check(n, rounds, nights, rows, courts, times)
    head["sat"] = True
    head["rounds"] = [[list(m) for m in r] for r in rounds]
    head["rows"] = [[[i, j, h] for (i, j), h in sorted(r.items())] for r in rows]
    print(json.dumps(head))


if __name__ == "__main__":
    main()
