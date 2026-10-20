import os, sys, collections
here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(here, "..", "src"))
from swe_startslot import slot

RUNS = os.path.join(here, "..", "..", "..", "prompts", "runs")
rows = slot.load(RUNS)
times = [t for t, _ in rows]
print("runs with a parseable start time: %d (%s to %s)" % (len(rows), times[0].date(), times[-1].date()))

OUT = {
    "partial": lambda r: int(r.get("outcome") != "success"),
    "error recorded": lambda r: int(bool(r.get("errors"))),
}

for window in (5, 10, 30):
    nb = slot.neighbours(times, window)
    print("\n== window +-%d min ==" % window)
    dist = collections.Counter(min(x, 4) for x in nb)
    print("others started within window (capped at 4): " + ", ".join("%d:%d" % (k, dist[k]) for k in sorted(dist)))
    for k in (1, 2):
        flags = [x >= k for x in nb]
        nc = sum(flags)
        print("crowded = at least %d other(s): %d crowded, %d not" % (k, nc, len(flags) - nc))
        for name, fn in OUT.items():
            a = [fn(r) for (t, r), f in zip(rows, flags) if f]
            b = [fn(r) for (t, r), f in zip(rows, flags) if not f]
            lo1, hi1 = slot.wilson(sum(a), len(a)); lo2, hi2 = slot.wilson(sum(b), len(b))
            raw = sum(a) / len(a) - sum(b) / len(b)
            diff, p = slot.permutation_p(slot.by_day(rows, flags, fn), 4000, 7)
            print("  %-15s crowded %.3f (%.3f-%.3f)  not %.3f (%.3f-%.3f)  raw diff %+.3f  within-day diff %+.3f  p=%.3f"
                  % (name, sum(a) / len(a), lo1, hi1, sum(b) / len(b), lo2, hi2, raw, diff, p))

print("\n== UTC hour block ==")
for name, fn in OUT.items():
    print(name)
    for h in range(0, 24, 6):
        sel = [fn(r) for t, r in rows if h <= t.hour < h + 6]
        lo, hi = slot.wilson(sum(sel), len(sel))
        print("  %02d-%02d  n=%3d  rate %.3f (%.3f-%.3f)" % (h, h + 6, len(sel), sum(sel) / len(sel), lo, hi))

print("\n== by calendar day, October 2026 (day, error rate, mean others within 10 min, runs)")
nb = slot.neighbours(times, 10)
days = collections.defaultdict(list)
for (t, r), x in zip(rows, nb):
    days[t.date()].append((int(bool(r.get("errors"))), x))
for d in sorted(days):
    v = days[d]
    if len(v) >= 10:
        print("%d %.3f %.2f %d" % (d.day, sum(e for e, _ in v) / len(v), sum(x for _, x in v) / len(v), len(v)))
