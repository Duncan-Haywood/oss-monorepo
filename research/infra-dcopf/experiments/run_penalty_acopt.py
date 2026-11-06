"""One-shot penalty factors from the AC optimum vs the iterated ones; writes results_penalty_acopt.txt."""
from infra_dcopf import (CASES, load_case, scaled, solve_ac, solve_dc, ac_check_of_dispatch,
                         loss_adjusted_dc, penalty_adjusted_dc, ac_optimum_penalty_dc)

LOADS = [0.6, 0.8, 1.0, 1.1]

if __name__ == "__main__":
    out = open("experiments/results_penalty_acopt.txt", "w")
    print("case    load  AC_cost  plain%  uniform%  iterPF%  acoptPF%  (AC cost of the dispatch above AC optimum)  pf_min pf_max", file=out)
    for name in ["case30", "case39", "case118"]:
        net = load_case(name)
        for k in LOADS:
            n = scaled(net, k)
            ac = solve_ac(n)
            if ac is None:
                print(f"{name:7s} {k:4.2f} no AC solution", file=out, flush=True); continue
            dc = solve_dc(n); adj, _ = loss_adjusted_dc(n); it, _, _ = penalty_adjusted_dc(n)
            one, pf = ac_optimum_penalty_dc(n, ac)
            sols = [dc, adj, it, one]
            if None in sols:
                print(f"{name:7s} {k:4.2f} no solution", file=out, flush=True); continue
            cs = [ac_check_of_dispatch(n, s) for s in sols]
            if not all(c.get("converged") for c in cs):
                print(f"{name:7s} {k:4.2f} AC power flow did not converge", file=out, flush=True); continue
            e = [100 * (c["cost"] - ac.res_cost) / ac.res_cost for c in cs]
            print(f"{name:7s} {k:4.2f} {ac.res_cost:9.1f} {e[0]:7.3f} {e[1]:8.3f} {e[2]:8.3f} {e[3]:8.3f}  {pf.min():6.3f} {pf.max():6.3f}", file=out, flush=True)
