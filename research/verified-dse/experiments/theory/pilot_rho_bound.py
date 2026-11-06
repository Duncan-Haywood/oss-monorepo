"""A theorem for the pilot's rank-displacement certificate (milestone 90). Runs no flow.
Writes pilot_rho_bound_results.txt. Usage: python3 pilot_rho_bound.py

Setup of milestone 84: ratio(i) = max_j rho_j(i)/k_j, where rho_j(i) counts the rivals rung j scores at or ahead of i
(ties count as ahead) and k_j is the number kept at cut j. Certificate: the pilot's best routed point p has ratio(p) < 1.
Let G = {i : ratio(i) < 1}.
Lemma 1: |G| <= k_last. i in G has rho_last(i) < k_last, so at most k_last candidates have that (rank by the last rung, ties
         counted ahead, is at most rho+1 <= k_last, and at most k_last candidates have rank <= k_last).
Lemma 2: a false certificate (ratio(x*) >= 1, T < 1) needs the pilot to contain a point of G, and x* is not in G.
Proposition: P(false certificate) <= 1 - C(n-g, m)/C(n, m) <= m*g/n with g = |G| <= k_last (pilot = m distinct points
         drawn uniformly). It is distribution-free in y: it uses only the rung scores.
Checks: (a) |G| <= k_last in every cell; (b) the empirical false-certificate share of milestone 84 (recomputed here with the
same seeds and pilots) is at most the bound in every cell; (c) how tight it is. Also reports the exact probability that the
pilot's best routed point is in G given the pilot hits G, since T < 1 needs that too."""
import json
import random
import statistics
import sys
from collections import defaultdict
from math import comb
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from verified_dse import flow  # noqa: E402
from pilot_rho import ratio, ETA, PILOTS  # noqa: E402

if __name__ == "__main__":
    rows = [json.loads(l) for l in (HERE.parent / "rung_bias" / "results.jsonl").read_text().splitlines()]
    by = defaultdict(list)
    for r in rows:
        if r["status"] == "ok":
            by[(r["tag"], r["design"])].append(flow.scores(r))
    out = ["m | cells | cells |G|<=k_last | cells ratio(x*)>=1 | violations emp<=bound | cells g>0 | median g | median bound (false cert) | median empirical | median emp/bound | max emp/bound"]
    for m in (8, 16, 24):
        n_cells = lemma = viol = 0
        gs, bs, es, rs_ = [], [], [], []
        for tag in ("tight", "relaxed"):
            for d in flow.DESIGNS:
                sc = by[(tag, d)]
                n = len(sc)
                y = [s["r4"] for s in sc]
                star = min(range(n), key=lambda i: y[i])
                s = {g: [p[g] for p in sc] for g in ("r1", "r2", "r3")}
                keep = [max(1, n // ETA), max(1, n // ETA ** 2), max(1, n // ETA ** 3)]
                for rungs, kp in ((("r1", "r2", "r3"), keep), (("r2", "r3"), keep[:2])):
                    rs = [ratio(s, rungs, kp, i, n) for i in range(n)]
                    G = [i for i in range(n) if rs[i] < 1]
                    n_cells += 1
                    lemma += len(G) <= kp[-1]
                    if rs[star] < 1:
                        continue          # guaranteed cell: no false certificates by definition
                    g = len(G)
                    bound = 1 - comb(n - g, m) / comb(n, m)
                    rng = random.Random(f"prho{tag}{d}{m}{len(rungs)}")
                    false = 0
                    for _ in range(PILOTS):
                        pil = sorted(rng.sample(range(n), m), key=lambda i: y[i])
                        false += rs[pil[0]] < 1
                    emp = false / PILOTS
                    viol += emp > bound + 1e-12
                    gs.append(g); bs.append(bound); es.append(emp)
                    rs_.append(emp / bound if bound > 0 else float("nan"))
        ok = [x for x in rs_ if x == x]
        out.append(f"{m} | {n_cells} | {lemma} | {len(gs)} | {viol} | {sum(g > 0 for g in gs)} | {statistics.median(gs):.1f} | {statistics.median(bs):.3f} | "
                   f"{statistics.median(es):.3f} | {statistics.median(ok):.3f} | {max(ok):.3f}")
    (HERE / "pilot_rho_bound_results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))
