"""Penalty factors across a line outage (next step 2 of the README: outage stress test).

case118 at load k. Factors and loss share are taken at the AC optimum of the intact network
(what an operator holds just before a trip) and applied to the DC OPF of the network with one
line out of service; the DC model itself is updated to the new topology, only the factors are
stale. Compared with plain DC and with factors from the post-outage AC optimum (oracle).

Outages: the N_TOP lines with the largest |P| at the intact AC optimum, plus N_RAND others
drawn at random (seed 0), keeping only trips that leave every bus supplied.
Metric: AC cost of the dispatch above the post-outage AC optimum (%), plus the largest change
in any generator's penalty factor across the trip.
Writes experiments/results_outage.txt."""
import copy
import random
import statistics as st
import sys

import numpy as np
import pandapower.topology as top

from infra_dcopf import (load_case, scaled, solve_ac, solve_dc, ac_check_of_dispatch,
                         ac_optimum_penalty_dc, previous_interval_penalty_dc)

K = float(sys.argv[1]) if len(sys.argv) > 1 else 1.0
N_TOP, N_RAND, SEED = 20, 20, 0


def excess(nc, s, ac):
    c = ac_check_of_dispatch(nc, s) if s is not None else {}
    return 100 * (c["cost"] - ac.res_cost) / ac.res_cost if c.get("converged") else float("nan")


def tripped(net, li):
    n = copy.deepcopy(net)
    n.line.loc[li, "in_service"] = False
    return n


def connected(n):
    return len(top.unsupplied_buses(n)) == 0


if __name__ == "__main__":
    net = scaled(load_case("case118"), K)
    ac0 = solve_ac(net)
    assert ac0 is not None, "intact AC OPF failed"
    flow = ac0.res_line.p_from_mw.abs().sort_values(ascending=False)
    ok = [li for li in flow.index if connected(tripped(net, li))]
    top_lines = ok[:N_TOP]
    rest = [li for li in ok if li not in top_lines]
    rand_lines = random.Random(SEED).sample(rest, N_RAND)
    _, pf_pre = ac_optimum_penalty_dc(net, ac0)

    out = open(f"experiments/results_outage{'' if K == 1.0 else f'_k{K}'}.txt", "w")
    print(f"case118 at load k={K}; {len(flow) - len(ok)} of {len(flow)} line trips island a bus and are skipped", file=out)
    print("excess AC cost over the post-outage AC optimum (%); dpf = max |pf_post - pf_pre| over generators", file=out)
    print("set  line  from-to  |P|MW  plain%  stale%  oracle%  dpf", file=out, flush=True)
    rows = {"top": [], "random": []}
    for tag, lines in (("top", top_lines), ("random", rand_lines)):
        for li in lines:
            nc = tripped(net, li)
            fb, tb = int(net.line.from_bus[li]), int(net.line.to_bus[li])
            ac = solve_ac(nc)
            if ac is None:
                print(f"{tag} {li} {fb}-{tb} {flow[li]:.1f} no AC solution", file=out, flush=True); continue
            dc = solve_dc(nc)
            orc, pf_post = ac_optimum_penalty_dc(nc, ac)
            sv, _ = previous_interval_penalty_dc(nc, ac0, net)
            e = [excess(nc, s, ac) for s in (dc, sv, orc)]
            dpf = float(np.max(np.abs(pf_post - pf_pre))) if pf_post is not None else float("nan")
            print(f"{tag} {li} {fb}-{tb} {flow[li]:.1f} {e[0]:7.3f} {e[1]:7.3f} {e[2]:7.3f} {dpf:.4f}", file=out, flush=True)
            rows[tag].append((flow[li], dpf, *e))

    print("\nsummary over converged outages: mean plain, stale, oracle (%); stale < plain count; worst stale - oracle", file=out)
    allr = []
    for tag, rs in rows.items():
        good = [r for r in rs if all(x == x for x in r[2:])]
        allr += good
        if not good:
            continue
        m = [st.mean(r[j] for r in good) for j in (2, 3, 4)]
        wins = sum(r[3] < r[2] for r in good)
        worst = max(r[3] - r[4] for r in good)
        keep = [(r[2] - r[3]) / (r[2] - r[4]) for r in good if r[2] - r[4] > 1e-6]
        print(f"{tag}: n={len(good)} mean {m[0]:.3f} {m[1]:.3f} {m[2]:.3f}; stale beats plain {wins}/{len(good)}; "
              f"worst stale-oracle {worst:.3f} pt; median share of oracle gain kept {st.median(keep):.2f}", file=out)
    if len(allr) > 3:
        f = np.array([r[0] for r in allr]); d = np.array([r[1] for r in allr])
        gap = np.array([r[3] - r[4] for r in allr])
        rank = lambda x: np.argsort(np.argsort(x))
        print(f"Spearman(|P| tripped, stale-oracle gap) = {np.corrcoef(rank(f), rank(gap))[0, 1]:.2f}; "
              f"Spearman(dpf, gap) = {np.corrcoef(rank(d), rank(gap))[0, 1]:.2f}; n={len(allr)}", file=out)
    out.close()
