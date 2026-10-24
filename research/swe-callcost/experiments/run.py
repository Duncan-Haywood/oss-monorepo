"""Cost against tool calls in prompts/runs/*.json. Prints results.txt. Run from anywhere."""
import glob, json, math, os, statistics, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from swe_callcost.cc import usable, loglog, fit, slope_ci, cv_errors, ratio_errors, quantile

root = os.path.join(HERE, "..", "..", "..", "prompts", "runs")
runs = []
for f in sorted(glob.glob(os.path.join(root, "*.json"))):
    try:
        r = json.load(open(f))
    except ValueError:
        continue
    if isinstance(r, dict) and r.get("date") and r.get("outcome"):
        runs.append(r)
u = [r for r in runs if usable(r)]
print(f"records {len(runs)}   with cost and tool calls {len(u)}   dates {min(r['date'] for r in u)} to {max(r['date'] for r in u)}")
cpc = [r["cost_usd"] / r["tool_calls"] for r in u]
print(f"cost per call: median ${statistics.median(cpc):.3f}  10th-90th pct ${quantile(cpc, .1):.3f} to ${quantile(cpc, .9):.3f}")
print(f"tool calls: median {statistics.median(r['tool_calls'] for r in u):.0f}  cost: median ${statistics.median(r['cost_usd'] for r in u):.2f}")

xs, ys = loglog(u)
a, b, r2 = fit(xs, ys)
lo, hi = slope_ci(xs, ys)
print("\n== A. pooled log-log fit: log cost = a + b log calls")
print(f"  a {a:.3f}  b {b:.3f}  (95% bootstrap {lo:.3f} to {hi:.3f})  R2 {r2:.3f}")
print("  b above 1 means cost per call grows with run length")

print("\n== B. held-out error (5-fold, absolute % error of predicted dollars)")
e1, e2 = cv_errors(xs, ys), ratio_errors(xs, ys)
print(f"  log-log fit      median {100 * statistics.median(e1):.0f}%  90th pct {100 * quantile(e1, .9):.0f}%")
print(f"  cost-per-call    median {100 * statistics.median(e2):.0f}%  90th pct {100 * quantile(e2, .9):.0f}%")

print("\n== C. slope by track")
for t in sorted({r["track"] for r in u}):
    s = [r for r in u if r["track"] == t]
    if len(s) < 20:
        continue
    x, y = loglog(s)
    a_, b_, r_ = fit(x, y)
    l, h = slope_ci(x, y, reps=1000)
    print(f"  {t:10s}n {len(s):4d}  b {b_:.3f} ({l:.3f} to {h:.3f})  R2 {r_:.3f}")

print("\n== D. slope by model (runs with a model id)")
for m in sorted({r.get("model") for r in u if r.get("model")}):
    s = [r for r in u if r.get("model") == m]
    if len(s) < 20:
        continue
    x, y = loglog(s)
    a_, b_, r_ = fit(x, y)
    l, h = slope_ci(x, y, reps=1000)
    print(f"  {m:28s}n {len(s):4d}  b {b_:.3f} ({l:.3f} to {h:.3f})  R2 {r_:.3f}  median ${statistics.median(r['cost_usd'] for r in s):.2f}")

print("\n== E. unpriced records that carry tool calls")
n0 = [r for r in runs if not usable(r)]
print(f"  {len(n0)} records lack cost or calls; {sum(1 for r in n0 if r.get('tool_calls'))} of them have tool calls")
