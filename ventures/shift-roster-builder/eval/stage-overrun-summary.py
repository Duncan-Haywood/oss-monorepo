"""Scores the pre-registered rule of eval/stage-overrun-prereg.md from eval/stage-overrun-ab.jsonl.
   python3 eval/stage-overrun-summary.py [eval/stage-overrun-ab.jsonl]"""
import json, sys, statistics
rows = [json.loads(l) for l in open(sys.argv[1] if len(sys.argv) > 1 else "eval/stage-overrun-ab.jsonl")]
by = {}
for r in rows: by.setdefault((r["seed"], r["P"], r["week"]), {})[r["run"]] = r
pairs = [v for v in by.values() if "new" in v and "old" in v]
print(f"{len(pairs)} weeks with both builds")
def spent(r): return r["atPayFloor"] is not None and r["atPayFloor"] > 20050
for run in ("old", "new"):
    rs = [p[run] for p in pairs]
    sp = [r for r in rs if spent(r)]
    overs = sorted(r["atPayFloor"] - 20000 for r in sp)
    cross = {}
    for r in rs:
        c = r["crossed"]; k = c["stage"] if c else "none"; cross[k] = cross.get(k, 0) + 1
    print(f"{run}: reached the pay floor >50 ms past budget {len(sp)}; overruns ms {overs}; open hours {sum(r['open'] for r in rs)}; "
          f"mean build {statistics.mean(r['ms'] for r in rs)/1000:.2f} s, slowest {max(r['ms'] for r in rs)/1000:.1f} s; "
          f"proven {sum(r['status'] != 'bounded' for r in rs)}; first stage past budget {cross}")
o = [p["old"] for p in pairs]; n = [p["new"] for p in pairs]
so, sn = sum(map(spent, o)), sum(map(spent, n))
do = sum(r["open"] for r in n) - sum(r["open"] for r in o)
dm = statistics.mean(r["ms"] for r in n) - statistics.mean(r["ms"] for r in o)
print(f"per week open hours new-old: {sorted(p['new']['open'] - p['old']['open'] for p in pairs if p['new']['open'] != p['old']['open'])}")
gapd = [(p['old']['gap'], p['new']['gap']) for p in pairs if abs(p['new']['gap'] - p['old']['gap']) > 1]
print(f"weeks whose gap moved by more than $1: {len(gapd)}")
c1, c2, c3 = sn <= so / 2, do <= 2, dm <= 0
print(f"rule: (1) spent {so} -> {sn}: {'pass' if c1 else 'FAIL'}; (2) open hours {do:+d}: {'pass' if c2 else 'FAIL'}; (3) mean build {dm/1000:+.2f} s: {'pass' if c3 else 'FAIL'}")
print("KEEP ON" if c1 and c2 and c3 else "SHIP OFF")
