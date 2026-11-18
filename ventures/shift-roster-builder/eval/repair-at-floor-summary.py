"""Summarise the repair skipped at a proven floor (README "The repair reserve at 30-60 people").
   python3 eval/repair-at-floor-summary.py eval/repair-at-floor-small.jsonl eval/repair-reserve-small.jsonl eval/repair-at-floor-bench.jsonl > eval/repair-at-floor.out.txt"""
import json, sys
small = [json.loads(l) for l in open(sys.argv[1]) if l.startswith("{")]
keys = ("open", "openShifts", "score", "cost")
same = sum(all(r["skip"][k] == r["run"][k] for k in keys) for r in small)
sk = [r for r in small if r["skip"]["skipped"]]
print(f"Small seeded weeks (6-10 people, 22-40 shifts, no budget): {len(small)}")
print(f"  identical open hours, open shifts, score and pay with and without the skip: {same} of {len(small)}")
print(f"  repair skipped at the floor on {len(sk)}; repair ms those weeks spent before: {sum(r['run']['repairMs'] for r in sk)} in all")
before = {(r["P"], r["S"], r["week"], r["seed"]): r for r in (json.loads(l) for l in open(sys.argv[2]) if l.startswith("{")) if r["cfg"] == "flow"}
after = [json.loads(l) for l in open(sys.argv[3]) if l.startswith("{")]
print(f"\nBench builds on which the repair ran (20 s budget), before (repair runs) and after (skipped at the floor): {len(after)}")
print("build (P S week seed) | open before | open after | floor | repair ms before | after | build s before | after | skipped")
tb = ta = rb = 0; same = 0
for a in sorted(after, key=lambda r: (r["P"], r["week"], r["seed"])):
    b = before[(a["P"], a["S"], a["week"], a["seed"])]
    rbm = (b["timings"] or {}).get("coverRepair", 0); ram = (a["timings"] or {}).get("coverRepair", 0)
    tb += b["ms"]; ta += a["ms"]; rb += rbm; same += a["open"] == b["open"]
    print(f"({a['P']}, {a['S']}, {a['week']}, {a['seed']}) | {b['open']} | {a['open']} | {a['floor']} | {rbm} | {ram} | {b['ms'] / 1000:.1f} | {a['ms'] / 1000:.1f} | {bool((a['repair'] or {}).get('skippedAtFloor'))}")
print(f"same open hours on {same} of {len(after)}; build time {tb / 1000:.1f} s -> {ta / 1000:.1f} s in all ({(tb - ta) / max(1, len(after)) / 1000:.2f} s a build), repair time before {rb / 1000:.1f} s")
