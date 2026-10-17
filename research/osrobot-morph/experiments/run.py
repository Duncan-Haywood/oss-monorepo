"""Fixed equal-link body vs body co-designed with its controller, at equal search budget.
Prints the tables in results.txt."""
import os, sys, statistics as st
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from osrobot_morph.model import *

BUDGET = 1980                 # controller evaluations per method per seed
SPLITS = [0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70]
SEEDS = [1, 2, 3]
train = sample_moves(40, 100)
test = sample_moves(200, 200)   # held out: never seen by the search
print(f"Task: {len(train)} training moves, {len(test)} held-out moves, tray x {TRAY[0]}..{TRAY[1]} m, y {TRAY[2]}..{TRAY[3]} m")
print(f"Reach l1+l2 = {TOTAL_REACH} m, torque limit {TAU_MAX} N m per joint, settle tolerance {TOL*1000:.0f} mm, horizon {HORIZON} s")
print(f"Search budget per method per seed: {BUDGET} controller evaluations (each = mean move time over the training moves)\n")

l1, l2 = split_to_links(0.5)
d = score(l1, l2, DEFAULT_GAINS, test)
print(f"A. fixed equal-link body, hand-set gains {DEFAULT_GAINS}: held-out mean move time {d:.3f} s, "
      f"settled {100*success_rate(l1, l2, DEFAULT_GAINS, test):.0f}% of moves\n")

rows = []
print(f"{'seed':>4} {'method':>34} {'split l1/(l1+l2)':>17} {'train s':>8} {'test s':>8} {'test settled':>13}")
sweeps = {}
for sd in SEEDS:
    g, s, _ = tune(l1, l2, train, BUDGET, sd)
    ts = score(l1, l2, g, test); ok = success_rate(l1, l2, g, test)
    print(f"{sd:>4} {'B. fixed body, tuned controller':>34} {0.5:>17.2f} {s:8.3f} {ts:8.3f} {100*ok:12.0f}%")
    rows.append(("B", sd, 0.5, s, ts))
    per = BUDGET // len(SPLITS)
    res = []
    for f in SPLITS:
        a, b = split_to_links(f)
        if not reachable(a, b):
            res.append((f, None, None, None)); continue
        g, s, _ = tune(a, b, train, per, sd)
        res.append((f, g, s, score(a, b, g, test)))
    sweeps[sd] = res
    feas = [r for r in res if r[1] is not None]
    f, g, s, ts = min(feas, key=lambda r: r[2])     # chosen on TRAINING score only
    a, b = split_to_links(f)
    ok = success_rate(a, b, g, test)
    print(f"{sd:>4} {'C. co-designed body + controller':>34} {f:>17.2f} {s:8.3f} {ts:8.3f} {100*ok:12.0f}%")
    rows.append(("C", sd, f, s, ts))

print("\nSplit sweep (inner tuning of per-split budget, held-out move time in s; '--' = tray not fully reachable)")
print(f"{'split':>6} " + " ".join(f"seed{sd:>2}" for sd in SEEDS))
for i, f in enumerate(SPLITS):
    cells = []
    for sd in SEEDS:
        r = sweeps[sd][i]
        cells.append("   -- " if r[1] is None else f"{r[3]:6.3f}")
    print(f"{f:6.2f} " + " ".join(cells))

print("\nSummary over seeds (held-out mean move time, s)")
for m, name in (("B", "fixed body, tuned controller"), ("C", "co-designed body + controller")):
    v = [r[4] for r in rows if r[0] == m]
    print(f"{m}. {name}: mean {st.mean(v):.3f}, min {min(v):.3f}, max {max(v):.3f}")
b = st.mean(r[4] for r in rows if r[0] == "B"); c = st.mean(r[4] for r in rows if r[0] == "C")
print(f"co-design vs tuned fixed body: {100*(b-c)/b:+.1f}% move time; vs hand-set gains: {100*(d-c)/d:+.1f}%")
