"""Fill rates of prompts/runs/*.json. Prints results.txt. Run from anywhere."""
import glob, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from swe_fieldfill.fill import FIELDS, OPTIONAL_LISTS, rates, wilson, week, success_without_pr, filled

root = os.path.join(HERE, "..", "..", "..", "prompts", "runs")
runs = []
for f in sorted(glob.glob(os.path.join(root, "*.json"))):
    try:
        r = json.load(open(f))
    except ValueError:
        continue
    if isinstance(r, dict) and r.get("date"):
        runs.append(r)
print(f"records {len(runs)}   dates {min(r['date'] for r in runs)} to {max(r['date'] for r in runs)}")


def pct(k, n):
    lo, hi = wilson(k, n)
    return f"{100 * k / n:5.1f}% ({100 * lo:.0f}-{100 * hi:.0f})" if n else "n/a"


print("\n== A. fill rate by field, all records (k/n, Wilson 95%)")
for f, (k, n) in rates(runs, FIELDS)["all"].items():
    print(f"  {f:26s}{k:5d}/{n:<5d} {pct(k, n)}")

print("\n== B. non-empty share of lists that are legitimately empty on a clean run")
for f, (k, n) in rates(runs, OPTIONAL_LISTS)["all"].items():
    print(f"  {f:26s}{k:5d}/{n:<5d} {pct(k, n)}")

print("\n== C. fill rate of pr, cost_usd, merged by track")
bt = rates(runs, ["pr", "cost_usd", "merged"], key=lambda r: r.get("track") or "none")
print("  track      runs   pr%     cost_usd%   merged%")
for t, row in sorted(bt.items(), key=lambda kv: -kv[1]["pr"][1]):
    n = row["pr"][1]
    print(f"  {t:10s}{n:5d}  {100 * row['pr'][0] / n:5.1f}   {100 * row['cost_usd'][0] / n:7.1f}     {100 * row['merged'][0] / n:6.1f}")

print("\n== D. fill rate by date (pr, cost_usd, tokens_in, wall_minutes, merged)")
bw = rates(runs, ["pr", "cost_usd", "tokens_in", "wall_minutes", "merged"], key=lambda r: r["date"])
print("  date       runs   pr%   cost%  tokens%  wall%  merged%")
for w, row in sorted(bw.items()):
    n = row["pr"][1]
    print(f"  {w}  {n:5d}  " + "  ".join(f"{100 * row[f][0] / n:5.1f}" for f in ["pr", "cost_usd", "tokens_in", "wall_minutes", "merged"]))

k, n = success_without_pr(runs)
print(f"\n== E. outcome 'success' but no pull request named: {k}/{n} {pct(k, n)}")
bo = {}
for r in runs:
    if r.get("outcome") == "success":
        t = r.get("track") or "none"
        a = bo.setdefault(t, [0, 0]); a[1] += 1; a[0] += not filled(r.get("pr"))
for t, (k, n) in sorted(bo.items(), key=lambda kv: -kv[1][1]):
    print(f"  {t:10s}{k:5d}/{n:<5d} {pct(k, n)}")
