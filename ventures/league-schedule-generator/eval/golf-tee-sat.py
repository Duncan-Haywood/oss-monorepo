"""For each season in eval/golf-tee-grid.json where the page's search left a team off its
floor/ceil tee-time share, ask a SAT solver whether any tee-time deal of that same round robin
gives every team its share. Prints one line per season and writes eval/golf-tee-sat.json
(the deals it finds, for the page to carry). Needs python-sat. Run:
python3 eval/golf-tee-sat.py [timeout_s]"""
import json, sys, threading
from pathlib import Path
from pysat.card import CardEnc, EncType
from pysat.formula import IDPool
from pysat.solvers import Cadical153

here = Path(__file__).parent
rows = json.loads((here / "golf-tee-grid.json").read_text())
limit = float(sys.argv[1]) if len(sys.argv) > 1 else 120.0
out = {}
for r in rows:
    n, S, plan = r["n"], r["slots"], r["plan"]
    if r["searchAtBound"] == n:
        continue
    pool = IDPool()
    x = lambda w, g, s: pool.id(("x", w, g, s))
    cls = []
    def card(lits, lo, hi):
        if hi < len(lits):
            cls.extend(CardEnc.atmost(lits, bound=hi, vpool=pool, encoding=EncType.seqcounter).clauses)
        if lo > 0:
            cls.extend(CardEnc.atleast(lits, bound=lo, vpool=pool, encoding=EncType.seqcounter).clauses)
    for w, pairs in enumerate(plan):
        for g in range(len(pairs)):
            card([x(w, g, s) for s in range(S)], 1, 1)
        for s in range(S):
            card([x(w, g, s) for g in range(len(pairs))], 0, 1)
    for t in range(n):
        total = sum(1 for pairs in plan for p in pairs if t in p)
        lo, hi = total // S, -(-total // S)
        for s in range(S):
            lits = [x(w, g, s) for w, pairs in enumerate(plan) for g, p in enumerate(pairs) if t in p]
            card(lits, lo, hi)
    with Cadical153(bootstrap_with=cls) as solver:
        timer = threading.Timer(limit, solver.interrupt)
        timer.start()
        res = solver.solve_limited(expect_interrupt=True)
        timer.cancel()
        verdict = "SAT" if res else ("UNSAT" if res is False else "UNKNOWN")
        if res:
            model = set(l for l in solver.get_model() if l > 0)
            out[f"{n},{r['w']}"] = [[next(s for s in range(S) if x(w, g, s) in model) for g in range(len(pairs))] for w, pairs in enumerate(plan)]
    print(f"{n} teams, {r['w']} weeks, {S} slots: search {r['searchAtBound']}/{n} at share; solver {verdict}", flush=True)
(here / "golf-tee-sat.json").write_text(json.dumps(out))
