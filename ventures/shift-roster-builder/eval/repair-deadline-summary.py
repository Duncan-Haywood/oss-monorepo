"""Scores the pre-registered rule of eval/repair-deadline-prereg.md from eval/repair-deadline-ab.jsonl.
   python3 eval/repair-deadline-summary.py [eval/repair-deadline-ab.jsonl]"""
import json, sys, statistics
rows = [json.loads(l) for l in open(sys.argv[1] if len(sys.argv) > 1 else "eval/repair-deadline-ab.jsonl")]
by = {}
for r in rows: by.setdefault((r["seed"], r["P"], r["week"]), {})[r["run"]] = r
pairs = [v for v in by.values() if "new" in v and "old" in v]
print(f"{len(pairs)} weeks with both builds")
def late(r): return r["atPayFloor"] is not None and r["atPayFloor"] > 20050
def repair_late(r): return late(r) and r["crossed"] and r["crossed"]["stage"] == "coverRepair"
for run in ("old", "new"):
    rs = [p[run] for p in pairs]
    rl = sorted(r["atPayFloor"] - 20000 for r in rs if repair_late(r))
    al = sorted(r["atPayFloor"] - 20000 for r in rs if late(r))
    ran = [r for r in rs if r["coverRepair"] and not r["coverRepair"].get("skippedAtFloor")]
    print(f"{run}: late >50 ms by the repair {len(rl)} {rl}; late by any stage {len(al)} {al}; repair ran {len(ran)}, gains {sum(r['coverRepair'].get('gains', 0) for r in ran)}, "
          f"stopped at deadline {sum(1 for r in ran if r['coverRepair'].get('stoppedAtDeadline'))}; open hours {sum(r['open'] for r in rs)}; "
          f"mean build {statistics.mean(r['ms'] for r in rs)/1000:.2f} s, slowest {max(r['ms'] for r in rs)/1000:.1f} s; proven {sum(r['status'] != 'bounded' for r in rs)}")
o = [p["old"] for p in pairs]; n = [p["new"] for p in pairs]
so, sn = sum(map(repair_late, o)), sum(map(repair_late, n))
do = sum(r["open"] for r in n) - sum(r["open"] for r in o)
dm = statistics.mean(r["ms"] for r in n) - statistics.mean(r["ms"] for r in o)
print(f"per week open hours new-old: {sorted(p['new']['open'] - p['old']['open'] for p in pairs if p['new']['open'] != p['old']['open'])}")
c1 = (sn <= so / 2) if so >= 4 else sn == 0
c2, c3 = do <= 2, dm <= 50
print(f"rule: (1) late by the repair {so} -> {sn}: {'pass' if c1 else 'FAIL'}; (2) open hours {do:+d}: {'pass' if c2 else 'FAIL'}; (3) mean build {dm/1000:+.2f} s: {'pass' if c3 else 'FAIL'}")
print("KEEP ON" if c1 and c2 and c3 else "SHIP OFF")
