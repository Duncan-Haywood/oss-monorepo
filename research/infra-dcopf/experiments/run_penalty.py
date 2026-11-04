"""Penalty-factor DC OPF vs plain / uniform-loss DC vs AC OPF; writes experiments/results_penalty.txt."""
import numpy as np
from infra_dcopf import (CASES, load_case, scaled, solve_ac, solve_dc, ac_check_of_dispatch,
                         loss_adjusted_dc, penalty_adjusted_dc)

LOADS = [0.6, 0.8, 1.0, 1.1]

if __name__ == "__main__":
    out = open("experiments/results_penalty.txt", "w")
    print("case    load  AC_cost   plain%  uniform%  penalty%   (AC cost of the dispatch above AC optimum)  pf_min pf_max", file=out)
    for name in CASES:
        net = load_case(name)
        for k in LOADS:
            n = scaled(net, k)
            ac, dc = solve_ac(n), solve_dc(n)
            adj, _ = loss_adjusted_dc(n)
            pen, hist, pf = penalty_adjusted_dc(n)
            if None in (ac, dc, adj, pen):
                print(f"{name:7s} {k:4.2f} no solution", file=out, flush=True); continue
            cs = [ac_check_of_dispatch(n, s) for s in (dc, adj, pen)]
            if not all(c.get("converged") for c in cs):
                print(f"{name:7s} {k:4.2f} AC power flow did not converge", file=out, flush=True); continue
            e = [100 * (c["cost"] - ac.res_cost) / ac.res_cost for c in cs]
            print(f"{name:7s} {k:4.2f} {ac.res_cost:9.1f} {e[0]:8.3f} {e[1]:8.3f} {e[2]:8.3f}  {pf.min():6.3f} {pf.max():6.3f}", file=out, flush=True)
