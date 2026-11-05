"""One big survey boat or a fleet at equal cost?  PYTHONPATH=src:../marine-hull/src python3 experiments/run.py [fixed_speed_m_s]

For each case the budget is one boat of mass M_BIG. A fleet of boats of mass M_BIG/k is
affordable in number floor(1/cost); pick the k whose fleet finishes soonest.
"""
import itertools
import statistics as st
import sys
from marine_fleet.fleet import affordable, best_time

TRACK_KM = [100.0, 400.0, 1600.0]
AXES = dict(m_big=[200.0, 400.0, 800.0], payload=[0.0, 0.1, 0.3, 0.5], beta=[0.6, 0.8, 1.0],
            hotel_exp=[0.0, 0.5, 1.0], swap_h=[0.5, 2.0, 6.0], base_km=[1.0, 10.0, 30.0])
SPEEDS = [float(sys.argv[1])] if len(sys.argv) > 1 else None   # fixed survey speed, m/s
rows = []
for tk in TRACK_KM:
    for m_big, pay, beta, he, sw, bk in itertools.product(*AXES.values()):
        big = best_time(tk, 1, m_big, he, sw, bk, SPEEDS)
        if big is None:
            continue
        best = (big[0], 1, 1.0, big[1])
        for k in range(2, 33):
            m = m_big / k
            n = affordable(m, m_big, pay, beta)
            if n < 2:
                continue
            r = best_time(tk, n, m, he, sw, bk, SPEEDS)
            if r and r[0] < best[0]:
                best = (r[0], n, m, r[1])
        rows.append((tk, m_big, pay, beta, he, sw, bk, big[0], big[1], best))
print(f"cases {len(rows)}")
for tk in TRACK_KM:
    sub = [r for r in rows if r[0] == tk]
    fl = [r for r in sub if r[9][1] > 1]
    ratio = [r[9][0] / r[7] for r in sub]
    print(f"track {tk:6.0f} km: fleet wins {len(fl)}/{len(sub)}; time ratio best/single median {st.median(ratio):.2f} "
          f"min {min(ratio):.3f}; median fleet size where fleet wins {st.median([r[9][1] for r in fl]) if fl else 0}")
print("by payload cost share (all tracks):")
for p in AXES["payload"]:
    sub = [r for r in rows if r[2] == p]
    fl = [r for r in sub if r[9][1] > 1]
    print(f"  payload {p:.1f}: fleet wins {len(fl)}/{len(sub)} ({100*len(fl)/len(sub):.0f}%); median n {st.median([r[9][1] for r in fl]) if fl else 0}; "
          f"median energy ratio {st.median([r[9][3]/r[8] for r in sub]):.2f}")
print("by hotel-load exponent:")
for h in AXES["hotel_exp"]:
    sub = [r for r in rows if r[4] == h]
    fl = [r for r in sub if r[9][1] > 1]
    print(f"  hotel_exp {h}: fleet wins {len(fl)}/{len(sub)} ({100*len(fl)/len(sub):.0f}%)")
print("by base distance:")
for b in AXES["base_km"]:
    sub = [r for r in rows if r[6] == b]
    fl = [r for r in sub if r[9][1] > 1]
    print(f"  base {b:4.0f} km: fleet wins {len(fl)}/{len(sub)} ({100*len(fl)/len(sub):.0f}%)")
aff = [r for r in rows if r[9][1] > 1]
print(f"fleet affordable and winning: {len(aff)}/{len(rows)}; median time ratio among them "
      f"{st.median([r[9][0]/r[7] for r in aff]):.2f}; median energy ratio {st.median([r[9][3]/r[8] for r in aff]):.2f}; "
      f"fleet slower: {sum(1 for r in rows if r[9][1] > 1 and r[9][0] > r[7])}")
