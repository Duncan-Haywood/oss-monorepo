#!/usr/bin/env python3
"""Is a saved LNS state's bad night impossible, or only slow? Solve it alone, with a long limit.

  python3 eval/lns-bad-night.py eval/lns-states/41-7x9.json [--seconds 7200]

Loads a state written by odd-lns.py --save, finds the nights with no stored layout, and asks the
same one-night model odd-lns.py uses (night_rows) for a wait-free layout of each, under one long
limit instead of the search's 20 to 180 s. Prints SAT (with the layout, and writes it into the
state with --write), UNSAT (no wait-free layout exists: only a re-deal can fix that night), or
UNKNOWN at the limit. Needs python-sat, for this eval script only.
"""
import argparse
import importlib.util
import json
import os
import time

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("lns", os.path.join(HERE, "odd-lns.py"))
lns = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(lns)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("state")
    ap.add_argument("--seconds", type=float, default=7200)
    ap.add_argument("--write", action="store_true", help="store a found layout in the state file")
    a = ap.parse_args()
    st = json.load(open(a.state))
    n, courts, times = st["n"], st["courts"], st["times"]
    rounds, lay = lns.load_state(a.state, n, courts, times)
    nights = [list(range(s, min(s + 3, n))) for s in range(0, n, 3)]
    for t in range(len(nights)):
        if t in lay:
            continue
        k = [e for r in nights[t] for e in rounds[r]]
        m = lns.Model()
        real = [e for e in k if e[1] < n]
        sits = {e[0] for e in k if e[1] == n}
        p = m.layout(0, n, courts, times, lambda e: True, real, True, lambda v: v in sits, len(nights[t]))
        t0 = time.time()
        ok, model = lns.solve(m.cnf.clauses, a.seconds)
        dt = round(time.time() - t0, 1)
        verdict = {True: "SAT", False: "UNSAT", None: "UNKNOWN"}[ok]
        print(json.dumps({"night": t, "matches": len(real), "vars": m.pool.top if hasattr(m, "pool") else None,
                          "clauses": len(m.cnf.clauses), "verdict": verdict, "seconds": dt}), flush=True)
        if ok:
            rows = {e: h for e in real for h in range(times) if p[e, h] in model}
            assert lns.night_ok(n, courts, times, k, rows, len(nights[t]))
            if a.write:
                lay[t] = rows
                good = len(lay)
                lns.save_state(a.state, n, courts, times, st.get("seed"), rounds, good, len(nights), lay)


if __name__ == "__main__":
    main()
