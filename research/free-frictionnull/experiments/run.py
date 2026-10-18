"""Observed repeat counts against a permutation null. Reads the committed snapshot."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from free_frictionnull import nullmodel as m

here = os.path.dirname(__file__)
rows = m.load(os.path.join(here, "friction_snapshot.jsonl"))
items = m.classified(rows)
obs = m.repeats_by_day(items)
tot, per = m.permutation_null(items, n=2000, seed=0)
print(f"entries {len(rows)}; classified {len(items)}; distinct pairs {len(set(p for _, p in items))}; days {len(obs)}")
print("permutation null: shuffle pairs across entry slots, per-day sizes fixed, 2000 draws, seed 0")
print()
print("day         observed/entries   null median [2.5%, 97.5%]   p(null<=obs)")
for d in sorted(obs):
    k, n = obs[d]
    lo, md, hi = m.quantiles(per[d])
    print(f"{d}  {k:4d}/{n:<4d}         {md:5d}      [{lo}, {hi}]        {m.p_lower(per[d], k):.3f}")
lo, md, hi = m.quantiles(tot)
k = m.total(obs)
print()
print(f"all days    {k}/{len(items)}  null median {md} [{lo}, {hi}]  p(null<=obs) {m.p_lower(tot, k):.3f}")
