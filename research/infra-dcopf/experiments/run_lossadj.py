"""Loss-adjusted DC OPF against plain DC and AC OPF; writes experiments/results_lossadj.txt."""
from infra_dcopf import CASES, load_case, scaled, solve_ac, solve_dc, ac_check_of_dispatch, loss_adjusted_dc

LOADS = [0.6, 0.8, 1.0, 1.1]

if __name__ == "__main__":
    out = open("experiments/results_lossadj.txt", "w")
    print("case    load  AC_cost   plainDC_in_AC%  adjDC_in_AC%  recovered%  plainDC_model%  adjDC_model%  iters  Vviol_plain Vviol_adj", file=out)
    for name in CASES:
        net = load_case(name)
        for k in LOADS:
            n = scaled(net, k)
            ac, dc = solve_ac(n), solve_dc(n)
            adj, hist = loss_adjusted_dc(n)
            if ac is None or dc is None or adj is None:
                print(f"{name:7s} {k:4.2f} no solution", file=out, flush=True); continue
            cp, ca = ac_check_of_dispatch(n, dc), ac_check_of_dispatch(n, adj)
            if not (cp.get("converged") and ca.get("converged")):
                print(f"{name:7s} {k:4.2f} AC power flow did not converge", file=out, flush=True); continue
            e = lambda c: 100 * (c - ac.res_cost) / ac.res_cost
            ep, ea = e(cp["cost"]), e(ca["cost"])
            rec = 100 * (abs(ep) - abs(ea)) / abs(ep) if ep else float("nan")
            print(f"{name:7s} {k:4.2f} {ac.res_cost:9.1f} {ep:12.3f} {ea:12.3f} {rec:10.1f} {e(dc.res_cost):13.2f} {e(adj.res_cost):12.2f} {len(hist):5d} {cp['n_bus_v_viol']:8d} {ca['n_bus_v_viol']:8d}", file=out, flush=True)
