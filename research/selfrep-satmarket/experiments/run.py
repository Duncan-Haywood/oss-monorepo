import math, pathlib, sys
here = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(here / "src"))
sys.path.insert(0, str(here.parent / "selfrep-growth" / "src"))
from selfrep_growth.params import printer_copy  # W (hours per copy) from selfrep-growth / selfrep-closure
from selfrep_satmarket.model import (Params, bang_bang, best_smooth, best_switch, constant, dp_policy, dp_solve,
                                     optimise_piecewise, run)

W, V, _, _ = printer_copy()
T = 600.0
out = [f"assumed inputs: unit goods value a=1; market capacity c (machine-hours per hour) is swept; W={W:.1f} h per copy from selfrep-growth",
       f"fluid model, cash never binds, Euler step 1 h, horizon T={T:.0f} h, fleet starts at 1 unit, k=(1-fail)/W; final fleet worth 0",
       "J values are Euler values, shared by all policies; percentages are of the DP policy's simulated J (the best found)", "",
       "table 1: market capacity c, failure 0 (k = %.4f /h; fleet reaches e^(kT) = %.0f units if it only copies)" % (1 / W, math.exp(T / W)), ""]


def study(label, p):
    ts, gb = best_switch(p)
    cs, gc = max(((u / 20, run(p, constant(u / 20))[0]) for u in range(21)), key=lambda x: x[1])
    sts, sw, gs = best_smooth(p)
    start = [1.0 if i / 20 * T < ts else 0.0 for i in range(20)]
    lv, gp = optimise_piecewise(p, start=start)
    vdp, pol, grid = dp_solve(p)
    gd, nfin, path = run(p, dp_policy(p, pol, grid))
    # the largest fleet when the DP policy stops copying, and the share of the horizon with 0<u<1
    stop = next((i for i, u in enumerate(path) if u < 0.5), len(path))
    mid = sum(1 for u in path if 0.02 < u < 0.98)
    best = max(gd, gb, gc, gs, gp)
    out.append(f"{label:16} DP table V0={vdp:12.1f} | DP policy J={gd:12.1f} (N_T={nfin:9.1f}, u<0.5 from t={stop}, {mid} h interior) | "
               f"bang-bang ts={ts:4.0f} {100*gb/gd:6.2f}% | const u={cs:.2f} {100*gc/gd:6.2f}% | smooth ts={sts},w={sw} {100*gs/gd:6.2f}% | "
               f"piecewise {100*gp/gd:6.2f}% | DP table vs policy {100*(vdp-gd)/gd:+.2f}%")
    return best, gd


p0 = Params(k=1 / W, horizon=T)
for c in (math.inf, 1e6, 1e5, 1e4, 3e3, 1e3, 3e2, 100.0):
    study("c=inf" if math.isinf(c) else f"c={c:g}", Params(k=p0.k, c=c, horizon=T))

out += ["", "table 2: failure rate sweep at c=1000"]
for f in (0.0, 0.2, 0.4, 0.6):
    study(f"fail={f:.1f}", Params(k=(1 - f) / W, c=1000.0, horizon=T))

out += ["", "table 3: DP resolution check at c=1000, failure 0 (policy J from the DP feedback rule)"]
p = Params(k=1 / W, c=1000.0, horizon=T)
for npt, ul in ((100, 11), (200, 21), (400, 21), (800, 41)):
    v, pol, grid = dp_solve(p, n_points=npt, u_levels=ul)
    g = run(p, dp_policy(p, pol, grid))[0]
    out.append(f"n_points={npt:4d} u_levels={ul:3d}: table V0={v:12.1f}  policy J={g:12.1f}")

out += ["", "table 4: time path at c=1000 (DP policy): fleet N and copy share u"]
v, pol, grid = dp_solve(p)
g, nf, path = run(p, dp_policy(p, pol, grid))
n = 1.0
for t in range(0, int(T), 1):
    if t % 50 == 0:
        out.append(f"t={t:4d} N={n:12.1f} u={path[t]:.2f}")
    n += p.k * path[t] * n
text = "\n".join(out)
print(text)
(here / "experiments" / "results.txt").write_text(text + "\n")
