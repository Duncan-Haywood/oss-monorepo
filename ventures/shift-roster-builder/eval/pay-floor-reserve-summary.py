"""Score reserves for the pay floor's warm try from eval/pay-floor-reserve.jsonl (pre-registered: eval/pay-floor-reserve-prereg.md).

For each week, "full" ran the try to the end (its time T, the time left L at its start); "off" is the path of a try that runs out.
For a reserve R the try finishes iff T <= max(0, L) + R: the build is then "full", otherwise "off" plus max(0, L) + R of waiting.
    python3 eval/pay-floor-reserve-summary.py eval/pay-floor-reserve.jsonl
"""
import json, sys

rows = {}
for line in open(sys.argv[1] if len(sys.argv) > 1 else "eval/pay-floor-reserve.jsonl"):
    d = json.loads(line)
    rows.setdefault((d["seed"], d["P"], d["S"], d["week"]), {})[d["run"]] = d
weeks = sorted(k for k, v in rows.items() if "full" in v and "off" in v)
print(f"{len(weeks)} weeks with both builds")
reached = [k for k in weeks if rows[k]["full"]["tried"]]
print(f"pay floor tried on {len(reached)}; the rest never reach it (proven earlier, no clique LP or no basis) and are equal under every R")
print("\nper week: T = full warm time, L = time left at its start, then what finishing changes (open, score, gap; full minus off)")
for k in reached:
    f, o = rows[k]["full"], rows[k]["off"]
    t = f["tried"]
    print(f"  seed {k[0]:>2} {k[1]}x{k[2]} wk{k[3]}: T {t['ms']:>6} ms  L {t['left']:>6} ms  need R >= {max(0, t['ms'] - max(0, t['left'])):>6} ms"
          f"  open {f['open'] - o['open']:+d}  score {f['score'] - o['score']:+12.2f}  gap {o['gap']:>12.2f} -> {f['gap']:>10.2f}"
          f"  proven {o['proven']}->{f['proven']}  ms full {f['ms']} off {o['ms']}")

def build(k, R):
    f, o = rows[k]["full"], rows[k]["off"]
    t = f["tried"]
    if not t:
        return o, o["ms"], False
    if t["ms"] <= max(0, t["left"]) + R:
        return f, f["ms"], True
    return o, o["ms"] + max(0, t["left"]) + R, False

print("\n| reserve | tries finished | open hours | score sum - base | gap sum | proven | mean build s | largest build s |")
print("|---|---|---|---|---|---|---|---|")
base = None
for R in [500, 1000, 1500, 2000, 3000, 4000, 6000, 8000]:
    res = [build(k, R) for k in weeks]
    fin = sum(r[2] for r in res)
    open_ = sum(r[0]["open"] for r in res)
    score = sum(r[0]["score"] for r in res)
    gap = sum(r[0]["gap"] for r in res)
    prov = sum(r[0]["proven"] for r in res)
    ms = [r[1] for r in res]
    base = score if base is None else base
    print(f"| {R / 1000:g} s | {fin} | {open_} | {score - base:+.2f} | {gap:,.2f} | {prov} | {sum(ms) / len(ms) / 1000:.2f} | {max(ms) / 1000:.1f} |")
