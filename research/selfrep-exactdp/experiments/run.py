import pathlib, sys, time
here = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(here / "src"))
sys.path.insert(0, str(here.parent / "selfrep-growth" / "src"))
from selfrep_growth.params import printer_copy
from selfrep_exactdp.model import Params, best_switch, exact_dp, path_policy, switch_times, value

W, _, _, _ = printer_copy()
T, A = 600.0, 1.0
k = 1 / W
out = [f"assumed inputs: a={A}; W={W:.1f} h per copy (selfrep-growth); T={T:.0f} h; fleet starts at 1; failure 0; cash never binds; Euler step 1 h",
       "table = exact optimum over the control set u_j = (r^(j/m)-1)/(k dt), j=0..m (no interpolation); J = Euler value of that policy run through selfrep_satmarket.run",
       "bb = best bang-bang switch (1 h grid); table/J_bb >= 1 is the certified gain over bang-bang on this control set", ""]
cases = [(1e4, 50.0), (1e3, 12.5), (1e3, 50.0), (1e4, 0.0), (1e3, 0.0), (1e4, 12.5)]
for c, s in cases:
    p = Params(k=k, c=c, horizon=T)
    ts, jb = best_switch(p, s)
    out.append(f"== c={c:g}, s={s:g}: best bang-bang ts={ts:.0f}, J_bb={jb:.1f}")
    ms = (1, 2, 4, 8, 16) if (c, s) in ((1e4, 0.0), (1e3, 0.0), (1e4, 12.5)) else (1, 2, 4, 8)
    for m in ms:
        t0 = time.time()
        vt, pol, grid = exact_dp(p, s, m=m)
        j = value(p, path_policy(p, pol, grid, m), s)[0]
        idx = switch_times(p, pol, grid, m)
        full = sum(1 for x in idx if x == m)
        off = sum(1 for x in idx if x == 0)
        mid = len(idx) - full - off
        out.append(f"  m={m}: table={vt:13.1f} J={j:13.1f} |table-J|/J={abs(vt-j)/j:.1e}  table/J_bb={100*vt/jb:8.3f}%  steps full/mid/off={full}/{mid}/{off}  ({time.time()-t0:4.0f}s)")
    out.append("")
text = "\n".join(out)
print(text)
(here / "experiments" / "results.txt").write_text(text + "\n")
