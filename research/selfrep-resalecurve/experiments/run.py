import math, pathlib, sys
here = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(here / "src"))
sys.path.insert(0, str(here.parent / "selfrep-growth" / "src"))
from selfrep_growth.params import printer_copy
from selfrep_resalecurve.model import Params, best_switch, dp_policy, dp_solve, resale, value

W, V, _, _ = printer_copy()
T, A = 600.0, 1.0
k = 1 / W
sstar = A / k
out = [f"assumed inputs: a={A} per machine-hour; W={W:.1f} h per copy (selfrep-growth); horizon T={T:.0f} h; fleet starts at 1; failure 0, k=1/W={k:.4f}/h; cash never binds",
       f"resale S(n) = s m (1 - exp(-n/m)); s = price of the first machine offered, m = used-machine market depth (machines), total proceeds capped at s m; s* = a/k = {sstar:.1f}",
       "bang-bang = best single switch (1 h grid); DP = 400 log-spaced fleet points, 21 control levels, policy simulated with the shared Euler integrator", ""]
S_FRAC = 0.5
for c in (math.inf, 1e4):
    out.append(f"== goods market capacity c = {'inf' if math.isinf(c) else format(c, 'g')}, first-machine price s = {S_FRAC} s* = {S_FRAC*sstar:.1f}")
    p = Params(k=k, c=c, horizon=T)
    s = S_FRAC * sstar
    for m in (math.inf, 1e6, 1e5, 1e4, 1e3):
        term = resale(s, m)
        ts, jb = best_switch(p, term)
        vdp, pol, grid = dp_solve(p, term)
        jd, g, n, path = value(p, dp_policy(p, pol, grid), term)
        stop = next((i for i, u in enumerate(path) if u < 0.5), len(path))
        out.append(f"m={'inf' if math.isinf(m) else format(m, 'g'):>4}: bang-bang ts={ts:4.0f} J={jb:13.1f} N_T={math.exp(k*ts):10.1f} | DP J={jd:13.1f} (table {vdp:13.1f}) N_T={n:10.1f} u<0.5 from t={stop}")
    out.append("")
out.append("== grid check: c=inf, m=1e4, s=0.5 s*; DP policy value by grid size")
p = Params(k=k, horizon=T)
term = resale(0.5 * sstar, 1e4)
for npts in (200, 400, 800):
    vdp, pol, grid = dp_solve(p, term, n_points=npts)
    jd = value(p, dp_policy(p, pol, grid), term)[0]
    out.append(f"n_points={npts}: DP J={jd:.1f} (table {vdp:.1f})")
pathlib.Path(here / "experiments" / "results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
