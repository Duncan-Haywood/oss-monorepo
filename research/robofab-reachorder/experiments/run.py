"""Minimum arm over all valid assembly orders, for several clearances and shoulder heights."""
import statistics
from collections import Counter
from robofab_reachorder.assembly import Model
from robofab_reachorder.reachorder import valid_orders, order_targets, min_link

m = Model(arm="side")
orders = valid_orders(m)
print(f"# robofab-reachorder: {len(orders)} valid orders (side arm, jaw 30 mm); min l1 (mm, l2=l1) per order")
print("# l1 grid 10 mm, base grid 20 mm, wrist point only; tray gap 120 mm\n")
for H in (100, 200):
    for clear in (0, 10, 30, 60):
        cache = {}
        vals = []
        for o in orders:
            t = order_targets(m, o, clear)
            if t not in cache:
                cache[t] = min_link(t, H)
            vals.append(cache[t])
        c = Counter(vals)
        print(f"H={H:3d} clear={clear:2d}  best={min(vals)} worst={max(vals)} median={statistics.median(vals)} "
              f"distinct_target_sets={len(cache)}  histogram={dict(sorted(c.items()))}")
        if min(vals) != max(vals):
            b = orders[vals.index(min(vals))]; w = orders[vals.index(max(vals))]
            print("   best order :", [m.names[p] for p in b])
            print("   worst order:", [m.names[p] for p in w])

print("\n## Tray gap x clearance (H=100): does order ever change the answer?")
for gap in (0, 40, 120):
    for clear in (30, 120, 250):
        cache, vals = {}, []
        for o in orders:
            t = order_targets(m, o, clear, gap)
            if t not in cache:
                cache[t] = min_link(t, 100)
            vals.append(cache[t])
        print(f"gap={gap:3d} clear={clear:3d}  best={min(vals)} worst={max(vals)} distinct_target_sets={len(cache)}")
