"""LMP and congestion comparison, DC vs AC OPF, on case118 with thermal limits scaled
until they bind; writes experiments/results_lmp.txt."""
import numpy as np
from infra_dcopf import load_case, scaled, tighten, solve_ac, solve_dc

FACTORS = [1.0, 0.1, 0.07, 0.05, 0.04, 0.03]

def lmp(n):
    return n.res_bus.lam_p.values

if __name__ == "__main__":
    out = open("experiments/results_lmp.txt", "w")
    print("case   f     AC_cost  DC_cost  nbind_dc  mean_AC_lmp  mean_DC_lmp  lmp_MAE  lmp_corr  spread_AC  spread_DC  rent_AC  rent_DC", file=out)
    net = load_case("case118")
    for f in FACTORS:
        n = tighten(scaled(net, 1.0), f)
        ac, dc = solve_ac(n), solve_dc(n)
        if ac is None or dc is None:
            print(f"case118 {f:4.2f} no solution (ac={ac is not None}, dc={dc is not None})", file=out, flush=True); continue
        a, d = lmp(ac), lmp(dc)
        nb = int((dc.res_line.loading_percent > 99.0).sum())
        # congestion rent proxy: sum over loads of (LMP - system-mean LMP) * load
        ld = n.load.groupby("bus").p_mw.sum()
        ra = float(((a[ld.index] - a.mean()) * ld.values).sum())
        rd = float(((d[ld.index] - d.mean()) * ld.values).sum())
        c = float(np.corrcoef(a, d)[0, 1]) if a.std() > 1e-9 and d.std() > 1e-9 else float("nan")
        print(f"case118 {f:4.2f} {ac.res_cost:9.1f} {dc.res_cost:9.1f} {nb:5d} {a.mean():10.3f} {d.mean():10.3f} {np.abs(a-d).mean():8.3f} {c:8.3f} {a.max()-a.min():9.3f} {d.max()-d.min():9.3f} {ra:9.1f} {rd:9.1f}", file=out, flush=True)
