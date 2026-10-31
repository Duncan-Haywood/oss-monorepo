"""Milestone 3j analysis: what the manual's P -> A flow figures say about the pressure drop at which each
spool's rated flow applies, and whether the orifice law q ~ dp^0.5 holds between the 10 and 20 bar margins.

    python3 experiments/pvg_flow_rating.py > experiments/pvg_flow_rating_results.txt
"""
import csv, math, os, statistics
here = os.path.dirname(os.path.abspath(__file__))
rows = list(csv.DictReader(open(os.path.join(here, 'data', 'pvg32_flow_full_travel.csv'))))
dp_wt = {r['spool']: float(r['dp_1.0']) for r in csv.DictReader(open(os.path.join(here, 'data', 'pvg32_dp_at_rated.csv')))}
print('spool  rated  Q@10bar(mid)  Q10/rated  n(10->20)  dp_rated(P->A, orifice)  work-port-to-tank dp (3h)')
dps, ns, rs = [], [], []
for r in rows:
    q10 = (float(r['q10_low']) + float(r['q10_high'])) / 2
    q20 = (float(r['q20_low']) + float(r['q20_high'])) / 2
    rated = float(r['rated_lpm'])
    n = math.log(q20 / q10) / math.log(2)
    dp = 10 * (rated / q10) ** 2
    dps.append(dp); ns.append(n); rs.append(q10 / rated)
    print(f"{r['spool']:>4} {rated:6.0f} {q10:12.1f} {q10 / rated:10.2f} {n:10.2f} {dp:24.1f} {dp_wt.get(r['spool'], float('nan')):>26}")
print(f"median Q10/rated {statistics.median(rs):.2f}; median exponent {statistics.median(ns):.2f} (range {min(ns):.2f} to {max(ns):.2f}; orifice 0.50)")
print(f"median implied rated drop {statistics.median(dps):.1f} bar (range {min(dps):.1f} to {max(dps):.1f}); spools A to E only: {statistics.median(dps[1:]):.1f}")
print(f"median work-port-to-tank drop from 3h (A to E): {statistics.median(dp_wt.values()):.1f} bar")
