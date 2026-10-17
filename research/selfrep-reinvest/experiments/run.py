import math, pathlib, sys
here = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(here / "src"))
sys.path.insert(0, str(here.parent / "selfrep-growth" / "src"))
from selfrep_growth.params import printer_copy  # imported from selfrep-growth, which imports selfrep-closure
from selfrep_reinvest.model import (Params, analytic_unconstrained, bang_bang, best_smooth, best_switch, constant,
                                    growth_rate, optimise_piecewise, piecewise, run, smooth)

W, V, _, _ = printer_copy()
T = 600.0
A = 1.0  # ASSUMED value of goods per machine-hour
out = [f"assumed inputs: goods worth a={A} currency units per machine-hour; W={W:.1f} h and V={V:.1f} per copy from selfrep-growth/selfrep-closure",
       f"fluid model, Euler step 1 h, horizon T={T:.0f} h, fleet starts at 1 unit; objective = total value of goods made, final fleet worth 0",
       "piecewise = 20-segment coordinate ascent started from the best bang-bang (a local search: a lower bound on the optimum)", ""]


def study(label, p):
    ts, gb = best_switch(p)
    cs, gc = max(((u / 20, run(p, constant(u / 20))[0]) for u in range(21)), key=lambda x: x[1])
    sts, sw, gs = best_smooth(p)
    start = [1.0 if i / 20 * T < ts else 0.0 for i in range(20)]
    lv, gp = optimise_piecewise(p, k=20, start=start)
    nfin = run(p, bang_bang(ts))[1]
    out.append(f"{label:34} bang-bang ts={ts:5.0f} J={gb:11.1f} (N_T={nfin:9.1f}) | const u={cs:.2f} J={gc:11.1f} ({100*gc/gb:5.1f}%) | "
               f"smooth ts={sts},w={sw} {100*gs/gb:6.1f}% | piecewise {100*gp/gb:6.1f}%")
    return lv


out.append("== A. cash never binds (vitamins free), no failures: numeric vs closed form")
p = Params(work_h=W, vit_cost=V, a=A, cash_limited=False, horizon=T)
ts_a, J_a = analytic_unconstrained(p)
ts_n, J_n = best_switch(p)
out.append(f"closed form: ts = T - 1/k = {ts_a:.1f} h, J = a e^(kT-1)/k = {J_a:.1f};  numeric: ts = {ts_n:.0f} h, J = {J_n:.1f} ({100*J_n/J_a:.2f}% of closed form; Euler error)")
for dt in (1.0, 0.25, 0.05):
    pd = Params(work_h=W, vit_cost=V, a=A, cash_limited=False, horizon=T, dt=dt)
    j = run(pd, bang_bang(ts_a))[0]
    out.append(f"  Euler step {dt:4} h: J at the closed-form switch = {j:.1f} ({100*j/J_a:.2f}% of closed form)")
lv = study("A  free cash", p)
out.append("")
out.append("== B. failure rate (cash free)")
for f in (0.0, 0.2, 0.4, 0.6):
    p = Params(work_h=W, vit_cost=V, fail=f, a=A, cash_limited=False, horizon=T)
    out.append(f"fail={f:.1f}: closed-form ts={analytic_unconstrained(p)[0]:.0f} h  (1/k={1/growth_rate(p):.0f} h)")
    study(f"B  fail={f}", p)
out.append("")
out.append("== C. outside import budget pays for vitamins; goods are not sold (resale=0); cash0 = one copy's vitamins")
for B in (0.25, 1, 4, 16, 64):
    p = Params(work_h=W, vit_cost=V, a=A, budget=B, cash0=V, horizon=T)
    study(f"C  budget={B}/h", p)
out.append("")
out.append("== D. no outside budget; goods are sold and the cash buys vitamins (cash0 = one copy's vitamins)")
for a in (0.5, 1, 2, 4):
    for rs in (1.0, 0.5):
        p = Params(work_h=W, vit_cost=V, a=a, resale=rs, cash0=V, horizon=T)
        study(f"D  a={a}, resale={rs}", p)
out.append("")
out.append("== E. horizon sensitivity (cash free, no failures): ts and the share of the horizon spent copying")
for H in (100, 200, 400, 800, 1600):
    p = Params(work_h=W, vit_cost=V, a=A, cash_limited=False, horizon=float(H), dt=1.0)
    ts, g = best_switch(p, step=2.0)
    out.append(f"T={H:5}: ts={ts:6.0f} h ({100*ts/H:5.1f}% of T)  closed form {analytic_unconstrained(p)[0]:7.1f}")
txt = "\n".join(out)
(here / "experiments" / "results.txt").write_text(txt + "\n")
print(txt)
