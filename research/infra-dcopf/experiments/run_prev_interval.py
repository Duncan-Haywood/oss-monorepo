"""Penalty factors from the AC optimum of a neighbouring load level (a previous interval)
vs at the current optimum; writes results_prev_interval.txt."""
from infra_dcopf import (load_case, scaled, solve_ac, solve_dc, ac_check_of_dispatch,
                         ac_optimum_penalty_dc, previous_interval_penalty_dc)

PAIRS = [(0.5, 0.6), (0.7, 0.8), (0.9, 1.0), (1.0, 1.1), (0.8, 1.0), (1.0, 0.8)]  # (previous, current)

if __name__ == "__main__":
    out = open("experiments/results_prev_interval.txt", "w")
    print("case118; AC cost of the dispatch above the AC optimum at the current load (%)", file=out)
    print("prev  cur  plain%  prevPF%  curPF%", file=out)
    net = load_case("case118")
    for kp, kc in PAIRS:
        nc, npv = scaled(net, kc), scaled(net, kp)
        ac, acp = solve_ac(nc), solve_ac(npv)
        if ac is None or acp is None:
            print(f"{kp:4.2f} {kc:4.2f} no AC solution", file=out, flush=True); continue
        dc = solve_dc(nc); pv, _ = previous_interval_penalty_dc(nc, acp, npv); cur, _ = ac_optimum_penalty_dc(nc, ac)
        if None in (dc, pv, cur):
            print(f"{kp:4.2f} {kc:4.2f} no solution", file=out, flush=True); continue
        cs = [ac_check_of_dispatch(nc, s) for s in (dc, pv, cur)]
        if not all(c.get("converged") for c in cs):
            print(f"{kp:4.2f} {kc:4.2f} AC flow did not converge", file=out, flush=True); continue
        e = [100 * (c["cost"] - ac.res_cost) / ac.res_cost for c in cs]
        print(f"{kp:4.2f} {kc:4.2f} {e[0]:7.3f} {e[1]:8.3f} {e[2]:7.3f}", file=out, flush=True)
