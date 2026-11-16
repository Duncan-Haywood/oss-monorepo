"""Score the budget-spent pay floor try (eval/pay-floor-spent-prereg.md) from eval/pay-floor-spent.jsonl.
   python3 eval/pay-floor-spent-summary.py eval/pay-floor-spent.jsonl"""
import json, sys
from collections import Counter

rows = [json.loads(l) for l in open(sys.argv[1] if len(sys.argv) > 1 else "eval/pay-floor-spent.jsonl") if l.strip()]
weeks = {}
for r in rows:
    weeks.setdefault((r["seed"], r["P"], r["S"], r["week"]), {})[r["run"]] = r
pairs = {k: v for k, v in weeks.items() if "full" in v and "base" in v}
print(f"{len(pairs)} weeks with both builds")
for arm in ("full", "base"):
    c = Counter((v[arm]["skip"] or ("tried, spent" if v[arm]["tried"] and v[arm]["tried"]["spent"] else "ran")) for v in pairs.values())
    print(f"pay floor in '{arm}':", dict(sorted(c.items())))
spent = {k: v for k, v in pairs.items() if v["full"]["tried"] and v["full"]["tried"]["spent"]}
print(f"\nspent weeks (the 'full' build reached the pay floor with the budget spent): {len(spent)}")
for k, v in sorted(spent.items()):
    f, b = v["full"], v["base"]
    print(f"  seed {k[0]:2d} {k[1]}x{k[2]} wk{k[3]}: T {f['tried']['ms']:6d} ms  L {f['tried']['left']:6d} ms  base skip {b['skip']!s:8}  "
          f"open {f['open'] - b['open']:+d}  score {f['score'] - b['score']:+12.2f}  gap {b['gap']:12.2f} -> {f['gap']:12.2f}  ms full {f['ms']} base {b['ms']}")
print("\n| reserve | spent tries finished | open hours | score sum - base | gap sum | mean build s | largest build s |")
print("|---|---|---|---|---|---|---|")
base_ms = [v["base"]["ms"] for v in pairs.values()]
print(f"| off (today) | 0 of {len(spent)} | {sum(v['base']['open'] for v in pairs.values())} | +0.00 | "
      f"{sum(v['base']['gap'] for v in pairs.values()):,.2f} | {sum(base_ms) / len(base_ms) / 1000:.2f} | {max(base_ms) / 1000:.1f} |")
for R in (1000, 2000, 3000, 4000, 6000):
    fin, opn, dsc, gap, ms = 0, 0, 0.0, 0.0, []
    for k, v in pairs.items():
        b = v["base"]
        if k in spent:
            if v["full"]["tried"]["ms"] <= R:
                fin += 1; f = v["full"]
                opn += f["open"]; dsc += f["score"] - b["score"]; gap += f["gap"]; ms.append(f["ms"])
            else:
                opn += b["open"]; gap += b["gap"]; ms.append(b["ms"] + R)
        else:
            opn += b["open"]; gap += b["gap"]; ms.append(b["ms"])
    print(f"| {R / 1000:g} s | {fin} of {len(spent)} | {opn} | {dsc:+.2f} | {gap:,.2f} | {sum(ms) / len(ms) / 1000:.2f} | {max(ms) / 1000:.1f} |")
