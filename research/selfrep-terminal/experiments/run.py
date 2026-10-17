import pathlib, sys
here = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(here / "src"))
sys.path.insert(0, str(here.parent / "selfrep-growth" / "src"))
from selfrep_growth.params import printer_copy
from selfrep_terminal.model import best_switch, closed_form, value
from selfrep_reinvest.model import Params, growth_rate

W, V, _, _ = printer_copy()
T, A, DT = 600.0, 1.0, 0.25
out = [f"assumed inputs: a={A} per machine-hour; W={W:.1f} h, V={V:.1f} per copy (selfrep-growth/selfrep-closure); horizon T={T:.0f} h; fleet starts at 1",
       f"fluid model, Euler step {DT} h, cash free; objective = goods + s x (machines at T); s is the assumed resale value per machine", ""]
for fail in (0.0, 0.2, 0.4):
    p = Params(work_h=W, vit_cost=V, fail=fail, a=A, cash_limited=False, horizon=T, dt=DT)
    k = growth_rate(p)
    out.append(f"== fail={fail}: 1/k = {1/k:.1f} h, never-switch threshold s* = a/k = {A/k:.1f}  ({100*A/k/V:.0f}% of V)")
    for frac in (0.0, 0.1, 0.25, 0.5, 1.0, 1.5):
        s = frac * A / k
        ts_c, j_c = closed_form(p, s)
        ts_n, j_n = best_switch(p, s)
        j_at = value(p, round(ts_c / DT) * DT, s)
        out.append(f"s={s:7.1f} ({frac:4.2f} s*): closed-form ts={ts_c:6.1f} (goods phase {T-ts_c:5.1f} h)  grid ts={ts_n:6.1f}  "
                   f"J_grid={j_n:12.1f}  J(closed ts)={j_at:12.1f}  Euler/analytic={j_n/j_c:6.3f}")
    out.append("")
# what a wrong terminal value costs: switch for s=0 when the fleet is worth s
p = Params(work_h=W, vit_cost=V, fail=0.0, a=A, cash_limited=False, horizon=T, dt=DT)
k = growth_rate(p)
out.append("== cost of ignoring the terminal value (fail=0): switch at the s=0 time while the fleet is worth s")
ts0, _ = best_switch(p, 0.0)
for frac in (0.25, 0.5, 1.0):
    s = frac * A / k
    _, jb = best_switch(p, s)
    out.append(f"s={s:6.1f}: J at s=0 switch ({ts0:.0f} h) = {value(p, ts0, s):12.1f} vs optimum {jb:12.1f}  ({100*value(p, ts0, s)/jb:5.1f}%)")
pathlib.Path(here / "experiments" / "results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
