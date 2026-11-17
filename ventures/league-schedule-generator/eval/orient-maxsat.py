#!/usr/bin/env python3
"""The fewest breaks a fixed timetable allows, proved by MaxSAT.

The question (README, "Squeezing a single round robin", "Not solved"): the lowest-carry-over seasons
(20 teams single 360 / 52, 19 teams home and away 1,311 / 87) sit above wide gaps in the frontier
that no squeeze closes. Is that the venue search failing, or the timetable itself? Carry-over does
not depend on who is at home, so if the timetable allowed far fewer breaks, a better home/away
alone would close the gap at the same carry-over. A heuristic cannot answer; MaxSAT can.

Model (the tool's rules, carryover.mjs teamBreaks and the squeeze's balance check):
  one variable per match (single round robin) or per pair (home and away: the pair keeps one host,
  at home in leg one and away in leg two); each team's home games in the balanced span (the whole
  single round robin, or leg one of a season) within one of its away games (sequential-counter
  cardinality); a break is two consecutive rounds a team plays at the same ground, and a bye
  round resets the run, as in teamBreaks. Each "no break" is a soft clause of weight 1, so the
  optimum cost is the least number of breaks. RC2 (python-sat) proves it optimal.

Input: the JSON of eval/orient-maxsat-dump.mjs. Output: one JSON line per try with the tool's
breaks and the proved least, and (with --out) the oriented rounds, re-checked in JS by
eval/orient-maxsat-check.mjs.

Needs python-sat (pip install python-sat; MIT), used by this eval script only, not by the tool.

  node eval/orient-maxsat-dump.mjs 20 1 > /tmp/t.json
  python3 eval/orient-maxsat.py /tmp/t.json --teams 20 [--double] [--tries 0,4] [--seconds 600] [--out o.json]
  python3 eval/orient-maxsat.py /tmp/t.json --teams 20 --tries 0 --rotate     (round rotations and reversals)
"""
import argparse
import json
import multiprocessing as mp
import time


def least_breaks(rounds, n, double):
    from pysat.card import CardEnc, EncType
    from pysat.examples.rc2 import RC2
    from pysat.formula import WCNF, IDPool

    pool, w = IDPool(), WCNF()
    R = len(rounds)
    L = R // 2 if double else R
    h = {}  # (round, team) -> literal "team is at home"
    for r, rd in enumerate(rounds):
        for a, b in rd["matches"]:
            if a >= n or b >= n:
                continue
            lo, hi = min(a, b), max(a, b)
            v = pool.id(("host", lo, hi, 0 if double else r))  # true: lo hosts (in leg one)
            lit = v if (not double or r < L) else -v
            h[r, lo], h[r, hi] = lit, -lit
    for t in range(n):
        lits = [h[r, t] for r in range(L) if (r, t) in h]
        g = len(lits)
        for cl in CardEnc.atmost(lits, bound=(g + 1) // 2, vpool=pool, encoding=EncType.seqcounter).clauses:
            w.append(cl)
        for cl in CardEnc.atleast(lits, bound=g // 2, vpool=pool, encoding=EncType.seqcounter).clauses:
            w.append(cl)
        for r in range(R - 1):
            if (r, t) in h and (r + 1, t) in h:
                x, y = h[r, t], h[r + 1, t]
                s = pool.id(("alt", t, r))  # s -> t changes ground between r and r + 1
                w.append([-s, x, y])
                w.append([-s, -x, -y])
                w.append([s], weight=1)
    with RC2(w, solver="g4") as rc2:
        model = rc2.compute()
        cost = rc2.cost
    true = set(l for l in model if l > 0)
    holds = lambda lit: (lit in true) if lit > 0 else (-lit not in true)
    out = []
    for r, rd in enumerate(rounds):
        ms = []
        for a, b in rd["matches"]:
            if a >= n or b >= n:
                ms.append([a, b])
            else:
                ms.append([a, b] if holds(h[r, a]) else [b, a])
        out.append({**rd, "matches": ms})
    return cost, out


def carry_over(rounds, n):
    """Non-cyclic carry-over value (sum of squared cells), as carryOverFromOpponents."""
    opp = [[] for _ in range(n)]
    for rd in rounds:
        for a, b in rd["matches"]:
            if a < n and b < n:
                opp[a].append(b)
                opp[b].append(a)
    cells = {}
    for seq in opp:
        for x, y in zip(seq, seq[1:]):
            cells[x, y] = cells.get((x, y), 0) + 1
    return sum(v * v for v in cells.values())


def rotations(rounds):
    """The round rotations and their reversals of a single round robin: every one keeps the
    timetable's pairs and rounds, so it is the same structure played in another order."""
    R = len(rounds)
    for k in range(R):
        rot = rounds[k:] + rounds[:k]
        yield f"rot{k}", rot
        yield f"rev{k}", rot[::-1]


def _run(args):
    rounds, n, double = args
    return least_breaks(rounds, n, double)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("file")
    ap.add_argument("--teams", type=int, required=True)
    ap.add_argument("--double", action="store_true")
    ap.add_argument("--tries", default=None, help="comma-separated try indices (default all)")
    ap.add_argument("--seconds", type=float, default=600, help="per-try limit; over it the try is reported unsolved")
    ap.add_argument("--out", default=None)
    ap.add_argument("--rotate", action="store_true", help="single round robin: every round rotation and reversal of each picked try")
    a = ap.parse_args()
    data = json.load(open(a.file))
    pick = [int(x) for x in a.tries.split(",")] if a.tries else [d["i"] for d in data]
    done = []
    if a.rotate:
        for d in data:
            if d["i"] not in pick:
                continue
            for name, rot in rotations(d["rounds"]):
                t0 = time.time()
                with mp.Pool(1) as p:
                    job = p.apply_async(_run, ((rot, a.teams, False),))
                    try:
                        cost = job.get(a.seconds)[0]
                    except mp.TimeoutError:
                        cost = None
                print(json.dumps({"teams": a.teams, "i": d["i"], "order": name, "coe": carry_over(rot, a.teams), "least": cost, "s": round(time.time() - t0, 1)}), flush=True)
        return
    for d in data:
        if d["i"] not in pick:
            continue
        t0 = time.time()
        with mp.Pool(1) as p:
            job = p.apply_async(_run, ((d["rounds"], a.teams, a.double),))
            try:
                cost, rounds = job.get(a.seconds)
            except mp.TimeoutError:
                print(json.dumps({"teams": a.teams, "double": a.double, "i": d["i"], "coe": d["coe"], "breaks": d["breaks"], "least": None, "s": round(time.time() - t0, 1)}), flush=True)
                continue
        print(json.dumps({"teams": a.teams, "double": a.double, "i": d["i"], "coe": d["coe"], "breaks": d["breaks"], "least": cost, "s": round(time.time() - t0, 1)}), flush=True)
        done.append({"i": d["i"], "least": cost, "rounds": rounds})
    if a.out:
        json.dump(done, open(a.out, "w"))


if __name__ == "__main__":
    main()
