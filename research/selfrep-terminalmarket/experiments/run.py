import math, pathlib, sys
here = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(here / "src"))
sys.path.insert(0, str(here.parent / "selfrep-growth" / "src"))
from selfrep_growth.params import printer_copy
from selfrep_terminalmarket.model import Params, bang_bang, best_switch, dp_policy, dp_solve, value

W, V, _, _ = printer_copy()
T, A = 600.0, 1.0
k = 1 / W
out = [f"assumed inputs: a={A} per machine-hour; W={W:.1f} h per copy (selfrep-growth); horizon T={T:.0f} h; fleet starts at 1; failure 0, k=1/W={k:.4f}/h; cash never binds",
       f"objective J = revenue + s x (machines at T); Euler step 1 h; s is an assumed resale value per machine; s* = a/k = {A/k:.1f} is the never-switch threshold when the market is unsaturated",
       "DP: 400 log-spaced fleet points, 21 control levels; percentages are of the DP policy's simulated J", ""]
for c in (math.inf, 1e5, 1e4, 1e3):
    out.append(f"== market capacity c = {'inf' if math.isinf(c) else format(c, 'g')}")
    p = Params(k=k, c=c, horizon=T)
    _, _, _, p0 = value(p, bang_bang(0), 0)  # unused path warm-up
    vdp0, pol0, grid0 = dp_solve(p, 0.0)
    pol_s0 = dp_policy(p, pol0, grid0)
    for frac in (0.0, 0.25, 0.5, 1.0):
        s = frac * A / k
        ts, jb = best_switch(p, s)
        vdp, pol, grid = dp_solve(p, s)
        jd, g, n, path = value(p, dp_policy(p, pol, grid), s)
        stop = next((i for i, u in enumerate(path) if u < 0.5), len(path))
        mid = sum(1 for u in path if 0.02 < u < 0.98)
        jig = value(p, pol_s0, s)[0]
        out.append(f"s={s:6.1f} ({frac:4.2f} s*): DP J={jd:13.1f} (table {vdp:13.1f}, N_T={n:10.1f}, u<0.5 from t={stop}, {mid} h interior) | "
                   f"bang-bang ts={ts:4.0f} {100*jb/jd:6.2f}% | DP policy for s=0 {100*jig/jd:6.2f}%")
    out.append("")
pathlib.Path(here / "experiments" / "results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
