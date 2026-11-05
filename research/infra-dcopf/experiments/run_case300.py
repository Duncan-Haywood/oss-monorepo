"""MATPOWER case300 (pandapower): DC vs AC OPF cost and bus prices over load and limit scaling.
Writes experiments/results_case300.txt. AC OPF is tried from the default, then 'flat', start."""
import numpy as np
from infra_dcopf import load_case, scaled, tighten, solve_ac, solve_dc, ac_check_of_dispatch

LOADS = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
LIMITS = [1.0, 0.5, 0.3]

if __name__ == "__main__":
    out = open("experiments/results_case300.txt", "w")
    print("load lim  AC_cost    DC_cost   DC-AC%  nbind_dc  AC_lmp_min AC_lmp_max  DC_lmp_min DC_lmp_max  AC_lmp_mean DC_lmp_mean  excess%", file=out)
    net = load_case("case300")
    for k in LOADS:
        for f in LIMITS:
            n = tighten(scaled(net, k), f)
            ac, dc = solve_ac(n, inits=(None, "flat")), solve_dc(n)
            if ac is None or dc is None:
                print(f"{k:4.2f} {f:4.2f} no solution (ac={ac is not None}, dc={dc is not None})", file=out, flush=True); continue
            a, d = ac.res_bus.lam_p.values, dc.res_bus.lam_p.values
            nb = int((dc.res_line.loading_percent > 99.0).sum())
            chk = ac_check_of_dispatch(n, dc)
            ex = (chk["cost"] / ac.res_cost - 1) * 100 if isinstance(chk, dict) and chk.get("cost") else float("nan")
            print(f"{k:4.2f} {f:4.2f} {ac.res_cost:9.0f} {dc.res_cost:9.0f} {(dc.res_cost/ac.res_cost-1)*100:7.2f} {nb:5d} {a.min():10.2f} {a.max():10.2f} {d.min():10.2f} {d.max():10.2f} {a.mean():10.2f} {d.mean():10.2f} {ex:8.2f}", file=out, flush=True)
