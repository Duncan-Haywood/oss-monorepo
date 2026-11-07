"""Exact power of the pilot rank-displacement certificate (milestone 92). Runs no flow.
Writes pilot_rho_power_results.txt. Usage: python3 pilot_rho_power.py

Milestone 90 bounded false certificates and left power open. T is the ratio of the pilot's lowest-y point, so T < 1 needs
that point in G = {i : ratio(i) < 1}; hence P(T<1) <= P(pilot hits G) = 1 - C(n-g,m)/C(n,m), with equality when every point of G
beats the rest of the pool on y.
Predictions written before running: (1) the hit probability is an upper bound on the empirical share of T<1 in every guaranteed
cell (3-sigma binomial slack); (2) the median gap (hit prob minus empirical) at m = 8 exceeds 0.1.
Also reports the m needed for the hit probability to reach 0.9 (a pilot size that makes a certificate likely if one exists)."""
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


def hit_prob(n, g, m):
    return 1 - comb(n - g, m) / comb(n, m)


def m_for(n, g, target=0.9):
    return next((m for m in range(1, n + 1) if hit_prob(n, g, m) >= target), None)


if __name__ == "__main__":
    rows = [json.loads(l) for l in (HERE.parent / "rung_bias" / "results.jsonl").read_text().splitlines()]
    by = defaultdict(list)
    for r in rows:
        if r["status"] == "ok":
            by[(r["tag"], r["design"])].append(flow.scores(r))
    out = ["m | guaranteed cells | violations emp>hit | median emp P(T<1) | median hit prob | median gap | max gap | median |G| | median m for hit>=0.9"]
    for m in (8, 16, 24):
        viol = 0
        emps, hits, gaps, gs, ms = [], [], [], [], []
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
                    if rs[star] >= 1:
                        continue
                    g = sum(r < 1 for r in rs)
                    rng = random.Random(f"ppow{tag}{d}{m}{len(rungs)}")
                    cert = 0
                    for _ in range(PILOTS):
                        pil = sorted(rng.sample(range(n), m), key=lambda i: y[i])
                        cert += rs[pil[0]] < 1
                    emp, hp = cert / PILOTS, hit_prob(n, g, m)
                    viol += emp > hp + 3 * (hp * (1 - hp) / PILOTS) ** 0.5 + 1e-12
                    emps.append(emp); hits.append(hp); gaps.append(hp - emp); gs.append(g); ms.append(m_for(n, g))
        out.append(f"{m} | {len(emps)} | {viol} | {statistics.median(emps):.3f} | {statistics.median(hits):.3f} | "
                   f"{statistics.median(gaps):.3f} | {max(gaps):.3f} | {statistics.median(gs):.1f} | {statistics.median(ms):.1f}")
    (HERE / "pilot_rho_power_results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))
