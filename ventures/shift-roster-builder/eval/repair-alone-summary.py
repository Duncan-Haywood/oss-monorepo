# Summarises eval/repair-alone.jsonl into eval/repair-alone.out.txt: open hours per start and repair, totals, paired sign counts.
import json, collections, math, sys
rows = [json.loads(l) for l in open(sys.argv[1] if len(sys.argv) > 1 else "eval/repair-alone.jsonl")]
d = collections.defaultdict(dict); ms = collections.defaultdict(list)
for r in rows:
    assert r["valid"], r
    k = (r["P"], r["S"], r["week"], r.get("startSeed", 1))
    d[k][r["repair"]] = r["open"]; d[k]["start"] = r["start"]; d[k]["floor"] = r["floor"]; ms[r["repair"]].append(r["ms"])
names = ["main k3", "new k3 unguided", "new k3 guided", "new k3 guided p1"]
print("week (P S week startSeed) | floor | start | " + " | ".join(names))
for k in sorted(d):
    print(k, "|", d[k]["floor"], "|", d[k]["start"], "|", " | ".join(str(d[k].get(n)) for n in names))
keys = [k for k in d if all(n in d[k] for n in names)]
print(f"\n{len(keys)} starts with every repair")
for n in names: print(f"{n}: total open {sum(d[k][n] for k in keys):.0f} h, cut from start {sum(d[k]['start'] - d[k][n] for k in keys):.0f} h, mean {sum(ms[n]) / len(ms[n]):.0f} ms")
def p2(w, l):
    n = w + l
    if n == 0: return 1.0
    t = sum(math.comb(n, i) for i in range(0, min(w, l) + 1)) / 2 ** n
    return min(1.0, 2 * t)
for a, b in [("new k3 guided", "new k3 unguided"), ("new k3 guided p1", "new k3 unguided"), ("new k3 unguided", "main k3"), ("new k3 guided", "main k3")]:
    w = sum(d[k][a] < d[k][b] for k in keys); l = sum(d[k][a] > d[k][b] for k in keys)
    print(f"{a} vs {b}: fewer open on {w}, more on {l}, tied {len(keys) - w - l}; two-sided sign test p = {p2(w, l):.3f}")
