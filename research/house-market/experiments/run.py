"""Print every table in the README from data/facts.csv.  PYTHONPATH=src python experiments/run.py"""
from house_market import (TECHNIQUES, denver_house, load_facts, price_breakdown, reach, reconcile,
                          small_home, split_house, stage_breakdown)

f = load_facts()

print("A. Where the price of a new US home goes (NAHB 2024, 2,647 sq ft)")
print("component, USD, share of price %, USD per sq ft")
for name, usd, share, ppsf in price_breakdown(f):
    print(f"{name}, {usd:,.0f}, {100 * share:.1f}, {ppsf:.2f}")

print("\nB. Construction stages (NAHB 2024)")
print("stage, USD, share of construction %, share of price %, USD per sq ft")
for name, usd, sc, sp, ppsf in stage_breakdown(f):
    print(f"{name}, {usd:,.0f}, {100 * sc:.1f}, {100 * sp:.1f}, {ppsf:.2f}")
fees = f["fee_permit"] + f["fee_impact"] + f["fee_water_sewer"]
print(f"permit + impact + water/sewer fees inside site work, {fees:,.0f}, {100 * fees / f['nahb_construction']:.1f}, {100 * fees / f['nahb_price']:.1f}")

r = reconcile(f)
print("\nC. NAHB survey vs Census on one basis (price excluding lot, USD per sq ft)")
print(f"NAHB 2024 survey house, {r['nahb_ppsf_ex_lot']:.2f}")
print(f"NAHB 2024 construction cost only, {r['nahb_construction_ppsf']:.2f}")
print(f"Census 2025 average sold, {r['census_avg_ppsf_ex_lot']:.2f}")
print(f"Census 2025 median sold, {r['census_median_ppsf_ex_lot']:.2f}")
print(f"NAHB above Census average, {100 * r['nahb_over_census_avg']:.1f} %")
print(f"construction share of price ex lot, {100 * r['construction_share_ex_lot']:.1f} %")

print("\nD. Census median new home (2,194 sq ft at $154.79/sq ft) split on NAHB shares, USD")
h = split_house(f, f["census_median_ppsf_ex_lot"], f["census_median_sf_sold"])
for k in ["price_ex_lot", "construction", "profit", "overhead", "commission", "financing", "marketing"] + \
         ["stage_" + s for s in ["interior", "systems", "framing", "exterior", "foundations", "site_work", "final"]]:
    print(f"{k}, {h[k]:,.0f}")

print("\nE. Denver 2,000 sq ft new home, lot excluded (RSMeans index x NAHB cost + CSI fee stack)")
d = denver_house(f)
for k in ["hard", "fees", "delay", "construction", "soft", "price_ex_lot"]:
    print(f"{k}, {d[k]:,.0f}")
print(f"USD per sq ft ex lot, {d['ppsf_ex_lot']:.2f}")
print(f"fees + review delay share of price ex lot, {100 * d['fee_share']:.1f} %  (national NAHB: {100 * d['national_fee_share']:.1f} %)")
d0 = denver_house(f, include_review_delay=False)
print(f"without the review delay, {d0['price_ex_lot']:,.0f}")

print("\nF. How much of the price a structural-system saving can move (share of NAHB price)")
print("saving on foundations+framing+exterior %, price moved %, framing only %")
for s in (0.05, 0.10, 0.20, 0.30):
    print(f"{100 * s:.0f}, {100 * reach(f, s):.1f}, {100 * reach(f, s, ['framing']):.1f}")
print(f"structure stages share of construction, {100 * sum(f['stage_' + s] for s in ['foundations', 'framing', 'exterior']) / f['nahb_construction']:.1f} %")
print(f"systems + interior share of construction, {100 * (f['stage_systems'] + f['stage_interior']) / f['nahb_construction']:.1f} %")

print("\nG. Construction techniques: published cost relative to site-built wood frame")
print("technique, relative cost low, high, basis, source, US share")
for name, lo, hi, basis, src, share in TECHNIQUES:
    rel = "n/a, n/a" if lo is None else f"{lo:.2f}, {hi:.2f}"
    print(f"{name}, {rel}, {basis}, {src}, {share}")

print("\nH. A 1,200 sq ft home at each benchmark, lot excluded")
print("benchmark, USD per sq ft, USD")
for name, ppsf, usd in small_home(f):
    print(f"{name}, {ppsf:.2f}, {usd:,.0f}")
