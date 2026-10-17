import math, pathlib, sys
here = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(here / "src"))
sys.path.insert(0, str(here.parent / "selfrep-satmarket" / "src"))
sys.path.insert(0, str(here.parent / "selfrep-growth" / "src"))
from selfrep_growth.params import printer_copy
from selfrep_satmarket import model as sm
from selfrep_singulararc import model as sa

W, _, _, _ = printer_copy()
T = 600.0
out = [f"assumed inputs: a=1; market capacity c swept; W={W:.1f} h per copy from selfrep-growth; horizon T={T:.0f} h; fleet starts at 1 unit",
       "closed form = Pontryagin candidate (see src/selfrep_singulararc/model.py); DP and Euler J use step 1 h as in selfrep-satmarket",
       "Jc = continuous-time value of the closed-form path; Je = same path in the Euler model; Jdp = simulated DP policy; Jbb = best bang-bang", ""]


def row(label, k, c):
    p = sm.Params(k=k, c=c, horizon=T)
    jc, sol = sa.value(1.0, k, c, T)
    pol, _ = sa.policy(k, c, T)
    je = sm.run(p, pol)[0]
    vdp, tab, grid = sm.dp_solve(p)
    jdp, _, path = sm.run(p, sm.dp_policy(p, tab, grid))
    tbb, jbb = sm.best_switch(p)
    # DP switch time: first step at which u falls below 0.5 / 0.98
    dp_down = next((i for i, u in enumerate(path) if u < 0.98), len(path))
    dp_stop = next((i for i, u in enumerate(path) if u < 0.02), len(path))
    arc = f"t1={sol['t1']:6.1f} te={sol['te']:6.1f}" if sol["singular"] else "no singular arc"
    out.append(f"{label:12} {arc} | DP leaves u=1 at {dp_down:4d}, reaches u=0 at {dp_stop:4d} | "
               f"Je/Jdp={je/jdp:7.4f}  Jc/Jdp={jc/jdp:7.4f}  Jbb/Jdp={jbb/jdp:7.4f}  Jdp={jdp:12.1f}")


k0 = 1 / W
out.append("table 1: market capacity c, no failures (k = %.4f /h, 1/k = %.0f h)" % (k0, W))
for c in (1e6, 1e5, 1e4, 3e3, 1e3, 3e2, 100.0):
    row(f"c={c:g}", k0, c)
out += ["", "table 2: failure share at c = 1000 (k = (1 - fail)/W)"]
for f in (0.0, 0.2, 0.4, 0.6):
    row(f"fail={f:.1f}", (1 - f) / W, 1000.0)
out += ["", "table 3: u(t) along the closed form and the DP policy, c = 1000, no failures"]
p = sm.Params(k=k0, c=1000.0, horizon=T)
sol = sa.solve(k0, 1000.0, T)
vdp, tab, grid = sm.dp_solve(p)
_, _, path = sm.run(p, sm.dp_policy(p, tab, grid))
for t in (300, 340, 350, 400, 450, 500, 540, 550, 560):
    n, u = sa.fleet_and_u(k0, 1000.0, T, t + 0.5, sol)
    out.append(f"t={t:4d} h  closed-form u={u:5.2f} (n={n:8.1f})  DP u={path[t]:5.2f}")
text = "\n".join(out)
print(text)
(here / "experiments" / "results.txt").write_text(text + "\n")
