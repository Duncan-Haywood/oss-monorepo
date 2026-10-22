"""Rank each library-free delay proxy against SKY130-mapped critical-path delay. Reads proxies.json; writes results.txt, proxies.png.
Run: PYTHONPATH=../src:../../eda-sky130rung/src python analyze.py   (stdlib; matplotlib for the figure only)"""
import json, random
from pathlib import Path
from eda_sky130rung import rank as R

D = Path(__file__).resolve().parent
J = json.load(open(D / "proxies.json"))
rows = J["rows"]
y = [r["delay_ps"] for r in rows]
col = lambda k: [r[k] for r in rows]
rng = random.Random(0)


def boot(a, b, n=2000):
    """95% percentile bootstrap interval of Spearman, resampling designs."""
    vals = []
    for _ in range(n):
        idx = [rng.randrange(len(a)) for _ in a]
        s = R.spearman([a[i] for i in idx], [b[i] for i in idx])
        if s == s:
            vals.append(s)
    vals.sort()
    return vals[int(0.025 * len(vals))], vals[int(0.975 * len(vals)) - 1]


out = [f"# {J['yosys']}; generic gates {J['gates']}; delay = ABC stime on SKY130 HD (eda-sky130rung/experiments/mapped.json)",
       f"# {len(rows)} MAC-engine designs; bootstrap = 2000 resamples of designs, 95% percentile interval", "",
       "proxy                                         spearman   95% interval     kendall"]
proxies = [("generic depth (unit delay per gate)", "unit"), ("gate-type weights (logical effort, fan-out 1)", "type"),
           ("fan-out only (1 + 0.5 per extra load)", "fanout"), ("logical effort with real fan-out", "le"),
           ("gate count", "gates"), ("largest fan-out", "max_fanout")]
res = {}
for name, k in proxies:
    s = R.spearman(col(k), y)
    lo, hi = boot(col(k), y)
    res[k] = s
    out.append(f"{name:46s}{s:7.3f}   [{lo:6.3f},{hi:6.3f}]   {R.kendall(col(k), y):6.3f}")
out.append(f"check: unit proxy equals eda-harness ltp depth on {sum(r['unit'] == r['gen_depth'] for r in rows)} of {len(rows)} designs")

# does the answer depend on the weights? 200 random per-type scalings (log-uniform in [0.5, 2]) of the logical-effort delay
n = J["n_sweep"]
sw = [R.spearman([r["sweep"][k] for r in rows], y) for k in range(n)]
sw.sort()
beat = sum(1 for v in sw if v > res["unit"])
out += ["", f"weight sweep ({n} random per-gate-type scalings of the logical-effort delay, real fan-out):",
        f"  Spearman min {sw[0]:.3f}, median {sw[n // 2]:.3f}, max {sw[-1]:.3f}; {beat} of {n} beat unit depth ({res['unit']:.3f})"]

# leave-one-out regression of log delay on netlist features (numpy): does a fitted combination rank better?
import numpy as np
yl = np.log(np.array(y))
def loo(cols):
    X = np.column_stack([np.ones(len(rows))] + [np.log(np.array(col(c), float)) for c in cols])
    pred = []
    for i in range(len(rows)):
        m = np.arange(len(rows)) != i
        w, *_ = np.linalg.lstsq(X[m], yl[m], rcond=None)
        pred.append(float(X[i] @ w))
    return R.spearman(pred, y), float(np.median(np.abs(np.exp(np.array(pred) - yl) - 1)))
out += ["", "leave-one-out fit of log(delay) on log features (a fitted proxy, 40 points):  spearman  median |error|"]
for name, cols in [("depth", ["unit"]), ("logical effort", ["le"]), ("depth + largest fan-out", ["unit", "max_fanout"]),
                   ("logical effort + gates", ["le", "gates"]), ("depth + logical effort + fan-out + gates", ["unit", "le", "max_fanout", "gates"])]:
    s_, e_ = loo(cols)
    out.append(f"  {name:42s}{s_:7.3f}   {100 * e_:5.1f}%")

# what each proxy does to the decision that matters: the best area x latency design needs a delay, so rank by cycles x proxy
# is not defined here; instead report the top-5 overlap on delay itself
out += ["", "top-5 overlap with the five fastest mapped designs (lowest delay):"]
for name, k in proxies[:4]:
    out.append(f"  {name:46s}{R.top_k_overlap(col(k), y, 5):.2f}")
# the decision: latency = cycles x delay. Replace the mapped delay by each proxy, rank designs on cells x cycles x proxy
# (the generic objective with a clock-period term) and on the (cells, latency) front, against the SKY130 truth.
M = {(m["p"], m["wb"]): m for m in json.load(open(D.parents[1] / "eda-sky130rung/experiments/mapped.json"))["rows"]}
for r in rows:
    m = M[(r["p"], r["wb"])]
    r["cycles"], r["area"], r["gen_cells"] = m["cycles"], m["area_um2"], m["gen_cells"]
truth = [r["area"] * r["cycles"] * r["delay_ps"] for r in rows]
tf = set(R.pareto_idx([(r["area"], r["cycles"] * r["delay_ps"]) for r in rows]))
lab = lambda s: ", ".join(f"p{rows[i]['p']}w{rows[i]['wb']}" for i in sorted(s, key=lambda i: rows[i]["cycles"]))
out += ["", "decision check: area x cycles x delay, with the mapped delay replaced by a proxy (area from SKY130 mapping in every row)",
        "proxy as the clock-period term                 spearman  top-5  best design  front (area, latency) vs truth"]
out.append(f"{'SKY130 mapped delay (truth)':46s}  1.000  1.00  p{rows[min(range(len(rows)), key=lambda i: truth[i])]['p']}w{rows[min(range(len(rows)), key=lambda i: truth[i])]['wb']}        {lab(tf)}")
for name, k in proxies[:4] + [("gate count", "gates")] + [("no clock term (delay = 1)", None)]:
    obj = [r["area"] * r["cycles"] * (r[k] if k else 1.0) for r in rows]
    f = set(R.pareto_idx([(r["area"], r["cycles"] * (r[k] if k else 1.0)) for r in rows]))
    b = min(range(len(rows)), key=lambda i: obj[i])
    out.append(f"{name:46s}{R.spearman(obj, truth):7.3f}  {R.top_k_overlap(obj, truth, 5):.2f}  p{rows[b]['p']}w{rows[b]['wb']}   front {len(f & tf)} of {len(tf)}: {lab(f)}")
(D / "results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))

try:
    import matplotlib; matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(1, 3, figsize=(11, 3.4), sharey=True)
    for a, (name, k) in zip(ax, [("unit-delay depth", "unit"), ("gate-type weights", "type"), ("logical effort, real fan-out", "le")]):
        a.scatter(col(k), [v / 1000 for v in y], c=[r["p"] for r in rows], cmap="viridis", s=22)
        a.set_xlabel(f"{name} (rho {res[k]:.2f})")
    ax[0].set_ylabel("SKY130 critical path (ns)")
    fig.suptitle("40 MAC-engine designs; colour = lanes p", fontsize=9)
    fig.tight_layout(); fig.savefig(D / "proxies.png", dpi=110)
except ImportError:
    pass
