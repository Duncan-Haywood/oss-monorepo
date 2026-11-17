"""Scores the pre-registered rule of eval/polish-deadline-prereg.md from eval/polish-deadline-ab.jsonl.
   python3 eval/polish-deadline-summary.py [eval/polish-deadline-ab.jsonl]"""
import json, sys, statistics
rows = [json.loads(l) for l in open(sys.argv[1] if len(sys.argv) > 1 else "eval/polish-deadline-ab.jsonl")]
by = {}
for r in rows: by.setdefault((r["seed"], r["P"], r["week"]), {})[r["run"]] = r
pairs = [v for v in by.values() if "new" in v and "old" in v]
print(f"{len(pairs)} weeks with both builds")
def late(r): return r["atPayFloor"] is not None and r["atPayFloor"] > 20020
def pay(r): return r["score"] - 100000 * r["open"]
for run in ("old", "new"):
    rs = [p[run] for p in pairs]
    al = sorted(r["atPayFloor"] - 20000 for r in rs if late(r))
    st = {}
    for r in rs:
        if late(r): st[r["crossed"]["stage"] if r["crossed"] else "?"] = st.get(r["crossed"]["stage"] if r["crossed"] else "?", 0) + 1
    print(f"{run}: late >20 ms {len(al)} {al} by stage {st}; latest at the pay floor {max(r['atPayFloor'] or 0 for r in rs)} ms; open hours {sum(r['open'] for r in rs)}; "
          f"mean build {statistics.mean(r['ms'] for r in rs)/1000:.2f} s, slowest {max(r['ms'] for r in rs)/1000:.1f} s; proven {sum(r['status'] != 'bounded' for r in rs)}")
o = [p["old"] for p in pairs]; n = [p["new"] for p in pairs]
so, sn = sum(map(late, o)), sum(map(late, n))
do = sum(r["open"] for r in n) - sum(r["open"] for r in o)
same = [p for p in pairs if p["new"]["open"] == p["old"]["open"]]
po, pn = sum(pay(p["old"]) for p in same), sum(pay(p["new"]) for p in same)
dm = statistics.mean(r["ms"] for r in n) - statistics.mean(r["ms"] for r in o)
print(f"per week open hours new-old: {sorted(p['new']['open'] - p['old']['open'] for p in pairs if p['new']['open'] != p['old']['open'])}")
print(f"pay on {len(same)} weeks with equal open hours: old {po:.2f}, new {pn:.2f} ({(pn - po) / po * 100:+.3f}%); new lower on {sum(pay(p['new']) < pay(p['old']) - 1e-6 for p in same)}, higher on {sum(pay(p['new']) > pay(p['old']) + 1e-6 for p in same)}")
c1 = (sn <= so / 2) if so >= 4 else sn == 0
c2, c3, c4 = do <= 2, pn <= po * 1.001, dm <= 50
print(f"rule: (1) late >20 ms {so} -> {sn}: {'pass' if c1 else 'FAIL'}; (2) open hours {do:+d}: {'pass' if c2 else 'FAIL'}; (3) pay {(pn - po) / po * 100:+.3f}%: {'pass' if c3 else 'FAIL'}; (4) mean build {dm/1000:+.2f} s: {'pass' if c4 else 'FAIL'}")
print("KEEP ON" if c1 and c2 and c3 and c4 else "SHIP OFF")
