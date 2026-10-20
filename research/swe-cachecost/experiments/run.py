"""Where run cost goes, in prompts/runs/*.json. Prints results.txt. Run from anywhere."""
import glob, json, math, os, statistics, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from swe_cachecost.cc import usable, totals, cost_shares, loglog, fit, slope_ci, quantile

root = os.path.join(HERE, "..", "..", "..", "prompts")
prices = json.load(open(os.path.join(root, "pricing.json")))["models"]
runs = []
for f in sorted(glob.glob(os.path.join(root, "runs", "*.json"))):
    try:
        r = json.load(open(f))
    except ValueError:
        continue
    if isinstance(r, dict) and r.get("date") and r.get("outcome"):
        runs.append(r)
u = [r for r in runs if usable(r) and cost_shares(r, prices)]
print(f"records {len(runs)}   with per-component usage, cost and tool calls {len(u)}   dates {min(r['date'] for r in u)} to {max(r['date'] for r in u)}")
T = lambda r: totals(r)

print("\n== A. share of API-equivalent cost by token kind (median and 10th-90th pct across runs)")
for c in ("cache_read", "cache_write_1h", "cache_write_5m", "output", "input"):
    v = [cost_shares(r, prices)[c] for r in u]
    print(f"  {c:15s} median {100 * statistics.median(v):5.1f}%  10th-90th {100 * quantile(v, .1):5.1f}% to {100 * quantile(v, .9):5.1f}%")
ch = [T(r)["cache_read"] / (T(r)["cache_read"] + T(r)["input"] + T(r)["cache_write_5m"] + T(r)["cache_write_1h"]) for r in u]
print(f"  token-level cache-hit share (reads / all input-side tokens): median {100 * statistics.median(ch):.1f}%")

def row(label, rs, xf, yf):
    x, y = loglog(rs, xf, yf)
    a, b, r2 = fit(x, y)
    lo, hi = slope_ci(x, y, reps=1000)
    print(f"  {label:44s}b {b:.3f} ({lo:.3f} to {hi:.3f})  R2 {r2:.3f}")

print("\n== B. log-log slopes against API requests (n = %d)" % len(u))
req = lambda r: T(r)["requests"]
row("cost vs requests", u, req, lambda r: r["cost_usd"])
row("cache-read tokens vs requests", u, req, lambda r: T(r)["cache_read"])
row("output tokens vs requests", u, req, lambda r: T(r)["output"])
row("cache-write tokens (5m+1h) vs requests", u, req, lambda r: T(r)["cache_write_5m"] + T(r)["cache_write_1h"])
row("tool calls vs requests", u, req, lambda r: r["tool_calls"])
print("  b = 2 for cache reads would mean the context grows linearly with each request and is re-read every time")

print("\n== C. does the slope above 1 survive when cost is split? slope of each component's dollars vs tool calls")
calls = lambda r: r["tool_calls"]
for c in ("cache_read", "output", "cache_write_1h"):
    def dollars(r, c=c):
        return T(r)[c] * prices[r["usage"]["primary_model"]][c] / 1e6
    row(f"{c} dollars vs tool calls", u, calls, dollars)
row("total cost vs tool calls", u, calls, lambda r: r["cost_usd"])

print("\n== D. per-request quantities against run length (requests)")
for lo_, hi_ in ((1, 10), (11, 25), (26, 60), (61, 10**9)):
    s = [r for r in u if lo_ <= req(r) <= hi_]
    if len(s) < 5:
        continue
    pr = [T(r)["cache_read"] / req(r) for r in s]
    co = [r["cost_usd"] / req(r) for r in s]
    print(f"  requests {lo_:3d}-{hi_ if hi_ < 10**9 else 'up':>3}  n {len(s):4d}  cache-read tokens per request median {statistics.median(pr):9,.0f}   cost per request median ${statistics.median(co):.3f}")

print("\n== E. tool calls per API request")
v = [r["tool_calls"] / req(r) for r in u]
print(f"  median {statistics.median(v):.2f}  10th-90th {quantile(v, .1):.2f} to {quantile(v, .9):.2f}")
print("  (a request can emit several calls in parallel, and a final reply makes none)")

print("\n== F. context model: cache-read tokens per request = C0 + (g/2) x requests")
print("  C0 = context a run starts with, g = tokens the context grows per request (linear growth, every request re-reads it)")
import random
xs = [req(r) for r in u]
ys = [T(r)["cache_read"] / req(r) for r in u]
a, b, r2 = fit(xs, ys)
rnd = random.Random(1)
bs = []
for _ in range(1000):
    i = [rnd.randrange(len(xs)) for _ in xs]
    if max(xs[k] for k in i) == min(xs[k] for k in i):
        continue
    bs.append(fit([xs[k] for k in i], [ys[k] for k in i])[:2])
bs.sort(key=lambda p: p[1])
print(f"  C0 {a:,.0f} tokens   g {2 * b:,.0f} tokens per request   R2 {r2:.3f}")
print(f"  bootstrap 95% interval for g: {2 * bs[25][1]:,.0f} to {2 * bs[974][1]:,.0f}")
print(f"  at the median run ({statistics.median(xs):.0f} requests) the starting context is {100 * a / (a + b * statistics.median(xs)):.0f}% of the average re-read")
