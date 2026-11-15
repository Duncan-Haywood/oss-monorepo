# Summarises eval/repair-guide.jsonl (end-to-end builds, default 20 s budget) into eval/repair-guide.out.txt.
import json, collections
rows = [json.loads(l) for l in open("eval/repair-guide.jsonl")]
d = collections.defaultdict(dict)
for r in rows: d[(r["P"], r["S"], r["week"], r["seed"])][r["cfg"]] = r
cfgs = ["main", "unguided", "default", "reserve500", "reserve500u"]
print("main = engine at b92b1c892; unguided = this change, repair unguided (now the default); default = repair guided (as measured);")
print("reserve500 / reserve500u = 500 ms kept back for the repair, guided / unguided. Cells: open h / proven floor, repair ms.")
for k in sorted(d):
    print(k, " | ".join(f"{c} {d[k][c]['open']:.0f}/{d[k][c]['floor']} {d[k][c]['timings'].get('coverRepair', 0)}ms" for c in cfgs))
for c in cfgs:
    print(f"{c}: total open {sum(d[k][c]['open'] for k in d):.0f} h, at the floor on {sum(d[k][c]['open'] <= d[k][c]['floor'] + 1e-9 for k in d)} of {len(d)}")
