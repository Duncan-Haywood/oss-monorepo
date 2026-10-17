import math, pathlib, sys, time
here = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(here / "src"))
sys.path.insert(0, str(here.parent / "selfrep-growth" / "src"))
from selfrep_growth.params import printer_copy
from selfrep_dpgrid.model import Params, best_switch, dp_policy, dp_solve, value

W, _, _, _ = printer_copy()
T, A = 600.0, 1.0
k = 1 / W
out = [f"assumed inputs: a={A}; W={W:.1f} h per copy (selfrep-growth); T={T:.0f} h; fleet starts at 1; failure 0; cash never binds; Euler step 1 h",
       "table = DP value at the start; J = Euler value of the DP's own feedback policy; bb = best bang-bang switch (1 h grid)",
       "gap = (table - J)/J; rows sorted by grid size; 21 control levels unless stated", ""]
cases = [(1e4, 50.0), (1e3, 12.5), (1e3, 50.0)]
for c, s in cases:
    p = Params(k=k, c=c, horizon=T)
    ts, jb = best_switch(p, s)
    out.append(f"== c={c:g}, s={s:g}: best bang-bang ts={ts:.0f}, J_bb={jb:.1f}")
    tabs = {}
    for interp in ("index", "n"):
        for npts in (100, 200, 400, 800, 1600):
            t0 = time.time()
            vt, pol, grid = dp_solve(p, s, n_points=npts, interp=interp)
            j = value(p, dp_policy(p, pol, grid), s)[0]
            tabs[interp, npts] = vt
            out.append(f"  interp={interp:5s} n_points={npts:5d}: table={vt:13.1f} J={j:13.1f} gap={100*(vt-j)/j:+7.2f}%  J/J_bb={100*j/jb:7.2f}%  ({time.time()-t0:4.0f}s)")
    for interp in ("index", "n"):
        r = 2 * tabs[interp, 1600] - tabs[interp, 800]
        out.append(f"  Richardson (first-order) extrapolation of the table, interp={interp}: {r:13.1f} = {100*r/jb:7.2f}% of J_bb")
    vt, pol, grid = dp_solve(p, s, n_points=400, u_levels=81, interp="n")
    j = value(p, dp_policy(p, pol, grid), s)[0]
    out.append(f"  interp=n     n_points=  400, u_levels=81: table={vt:13.1f} J={j:13.1f} gap={100*(vt-j)/j:+7.2f}%  J/J_bb={100*j/jb:7.2f}%")
    out.append("")
# pure terminal-value check: no goods revenue matters, u = 1 throughout is feasible, so the exact optimum is at least s (1 + k dt)^steps
p = Params(k=k, horizon=T)
ex = 50.0 * (1 + k) ** 600
out.append(f"== linear market, s=50: exact all-copy value {ex:.1f}")
for interp in ("index", "n"):
    for npts in (100, 400, 1600):
        vt = dp_solve(p, 50.0, n_points=npts, interp=interp)[0]
        out.append(f"  interp={interp:5s} n_points={npts:5d}: table={vt:13.1f} ({100*(vt/ex-1):+6.2f}% of all-copy value)")
text = "\n".join(out)
print(text)
(here / "experiments" / "results.txt").write_text(text + "\n")
