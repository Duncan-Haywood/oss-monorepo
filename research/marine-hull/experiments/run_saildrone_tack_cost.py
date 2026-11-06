"""Milestone 6w: what does a tack cost a fielded Saildrone? Upwind-sailing 10-minute blocks (true wind >= 4 m/s, 30 <= |rel| <= 80 deg,
rel = HDG - wind-from, wind-from = atan2(-u,-v)). Tack pair = two consecutive blocks of one drone, both upwind-sailing, rel of opposite
sign; steady pair = same sign. Windward VMG = SOG cos(COG - wind-from). Per wind bin, loss (s) = 1200 (1 - mean VMG tack / mean VMG steady).
Pooled = bin losses weighted by tack-pair counts. 95% interval: bootstrap over drone-days.
Run: PYTHONPATH=src python3 experiments/run_saildrone_tack_cost.py > experiments/results_saildrone_tack_cost.txt"""
import csv, gzip, math, random, collections
BINS = [(4, 6), (6, 8), (8, 10), (10, 14)]
rows = collections.defaultdict(list)
for r in csv.DictReader(gzip.open("experiments/data/saildrone_10min.csv.gz", "rt")):
    rows[(r["year"], r["drone"])].append(r)
pairs = []   # (day, kind, bin, vmg)
for (y, d), rs in rows.items():
    rs.sort(key=lambda r: r["block"])
    def info(r):
        u, v = float(r["u"]), float(r["v"]); w = math.hypot(u, v)
        wf = math.atan2(-u, -v)
        rel = (math.degrees(float(r["hdg"]) * 0 + math.radians(float(r["hdg"])) - wf) + 180) % 360 - 180
        vmg = float(r["sog"]) * math.cos(math.radians(float(r["cog"])) - wf)
        ok = w >= 4 and 30 <= abs(rel) <= 80 and int(r["n"]) >= 8
        return ok, rel, w, vmg
    inf = [info(r) for r in rs]
    def t(r):  # minutes index from block string yyyy-mm-ddThh:m (tens of minutes)
        b = r["block"]; return (b[:10], int(b[11:13]), int(b[14]))
    for i in range(len(rs) - 1):
        a, b = inf[i], inf[i + 1]
        (da, ha, ma), (db, hb, mb) = t(rs[i]), t(rs[i + 1])
        if da != db or (hb * 6 + mb) - (ha * 6 + ma) != 1: continue
        if not (a[0] and b[0]): continue
        w = (a[2] + b[2]) / 2
        bn = next((k for k, (lo, hi) in enumerate(BINS) if lo <= w < hi), None)
        if bn is None: continue
        kind = "tack" if a[1] * b[1] < 0 else "steady"
        pairs.append((y + d + da, kind, bn, (a[3] + b[3]) / 2, (abs(a[1]) + abs(b[1])) / 2))
ABINS = [(30, 45), (45, 60), (60, 80.1)]
def loss(P, matched=False):
    num = den = 0; per = []
    cells = [(k, a) for k in range(len(BINS)) for a in (range(len(ABINS)) if matched else [None])]
    for k, ai in cells:
        ok = lambda p: p[2] == k and (ai is None or ABINS[ai][0] <= p[4] < ABINS[ai][1])
        T = [p[3] for p in P if ok(p) and p[1] == "tack"]; S = [p[3] for p in P if ok(p) and p[1] == "steady"]
        if len(T) < 5 or len(S) < 20: per.append(None); continue
        per.append((len(T), len(S), 1200 * (1 - (sum(T) / len(T)) / (sum(S) / len(S)))))
        num += len(T) * per[-1][2]; den += len(T)
    return (num / den if den else float("nan")), per
est, per = loss(pairs)
print(f"pairs {len(pairs)}: tack {sum(p[1]=='tack' for p in pairs)}, steady {sum(p[1]=='steady' for p in pairs)}")
for (lo, hi), p in zip(BINS, per):
    print(f"wind {lo}-{hi} m/s: " + (f"tack pairs {p[0]}, steady {p[1]}, loss {p[2]:.0f} s" if p else "too few"))
print(f"pooled loss {est:.0f} s per tack")
mean = lambda x: sum(x) / len(x)
for kd in ("tack", "steady"):
    print(f"mean |rel| of {kd} pairs: {mean([p[4] for p in pairs if p[1]==kd]):.1f} deg")
est2, per2 = loss(pairs, True)
print(f"matched on |rel| (30-45, 45-60, 60-80) within each wind bin (cells with >= 5 tack and >= 20 steady pairs): pooled loss {est2:.0f} s per tack")
days = collections.defaultdict(list)
for p in pairs: days[p[0]].append(p)
keys = list(days); random.seed(1); bs = []
for _ in range(500):
    P = [q for k in random.choices(keys, k=len(keys)) for q in days[k]]
    e, _ = loss(P); e2, _ = loss(P, True)
    if e == e and e2 == e2: bs.append((e, e2))
for j, nm in enumerate(("unmatched", "matched on |rel|")):
    v = sorted(x[j] for x in bs); print(f"bootstrap over {len(keys)} drone-days, {nm}: 95% interval {v[int(.025*len(v))]:.0f} to {v[int(.975*len(v))]:.0f} s (n={len(v)})")
