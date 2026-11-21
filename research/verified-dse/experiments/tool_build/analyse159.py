"""Milestone 159: how much of the build drift is OpenROAD's? Splitting milestone 158's two-build drift at the mapped netlist
(replay, no flow run).

Correction (milestone 160, experiments/yosys_swap/): the two OpenROAD builds run a byte-identical executable, and S is not
"same netlist": the Yosys builds wrote different netlists on all 60 sampled S points, so the S drift below is Yosys's, not the
rebuild's. The numbers here are unchanged; their reading as an OpenROAD share is withdrawn.

Usage: python3 analyse159.py [out.txt]

Why: milestone 158's "Next". Builds A (milestone 143: Yosys 0.70, OpenROAD 26Q3) and B (milestones 156 and 157: Yosys 0.71,
OpenROAD 26Q3 rebuilt by nixpkgs) differ in both tools, and a third build to separate them could not be fetched here. But the
tables already hold a natural experiment: on the points where both builds' Yosys produced the same mapped netlist (S, 374 of
2,781 points ok in both, milestone 158 prediction 4), the netlist that enters OpenROAD is the same, so any difference in
placement or routing is the OpenROAD build's alone (milestone 157's control showed a fixed build is deterministic, so it is
not run-to-run noise). On the other points (N) both tools differ. Comparing drift on S with drift on N, within each design,
splits the drift without a third build.
Disclosed: milestone 156's 11-point control found routed numbers differ on all 11 points, 4 of them with the same mapped
netlist, which hints that the rebuild alone moves routing; nothing below had been computed on the 27-design tables.

"Same mapped netlist" is milestone 158's test (synth_netlist_area and synth_netlist_wns equal): a proxy, not a netlist hash
(no netlists were kept). synth_netlist_wns is OpenSTA's reading of the mapped netlist inside OpenROAD, so it also checks that
the two OpenROAD builds time the same netlist the same way.

Quantities, over sequences ok in both builds (seq is the key):
  lr       = |ln(r4(B) / r4(A))|, the routed-score drift of one point (r4 = routed area x routed period, the ladder's score);
  per design x with at least 5 points in S and 5 in N ("matched designs" M):
  rho(x)   = mean lr over S / mean lr over N, the share of the drift that remains when only OpenROAD differs;
  stage identity on S: whether global_place_wns, detail_place_wns, buffers_added and the final numbers (final_area_notap and
  final_wns) are equal between builds, which says where in the OpenROAD flow the rebuild's divergence enters;
  tauS(x)  = tau-b of r4 between builds over S, for designs with at least 10 points in S.

Predictions, written here and committed before this script first runs (design-bootstrap 95% intervals over M, 2,000 resamples,
seed 159):
 (1) PRIMARY: the OpenROAD rebuild carries a real share of the drift but not all of it: mean rho over M is at least 0.25 and
     its interval lies entirely below 1. Prior 45%.
 (2) the final routed numbers differ on more than 90% of the points in S. Prior 70%.
 (3) global_place_wns is equal on fewer than half of the points in S (the divergence enters at or before global placement).
     Prior 50%.
 (4) buffers_added is equal on fewer than half of the points in S. Prior 50%.
 (5) median tauS over designs with at least 10 points in S is below 0.8. Prior 55%.
 (6) mean lr over S is below mean lr over N on at least 75% of the matched designs. Prior 70%.
 (7) median lr over all points in S is above 0.01 (the rebuild alone typically moves a point's routed score by more than 1%).
     Prior 60%.
Reported, not predicted: the per-design table; pooled mean and median lr on S and N; the signed mean ln-ratio on S and N (a
systematic shift?); equality shares at every stage on N for comparison; whether the routed-best sequence within S is the same
under both builds, and the regret under B of A's routed-best within S.
"""
import importlib.util
import math
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SEED = 159


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


M158 = _load(HERE / "analyse.py", "verified_dse_m159_m158")
m141, boot = M158.m141, M158.boot


def same_mapped(a, b):
    return a["synth_netlist_area"] == b["synth_netlist_area"] and a["synth_netlist_wns"] == b["synth_netlist_wns"]


STAGES = {
    "global_place_wns": lambda a, b: a["global_place_wns"] == b["global_place_wns"],
    "detail_place_wns": lambda a, b: a["detail_place_wns"] == b["detail_place_wns"],
    "buffers_added": lambda a, b: a["buffers_added"] == b["buffers_added"],
    "final": lambda a, b: a["final_area_notap"] == b["final_area_notap"] and a["final_wns"] == b["final_wns"],
}


def pairs(a, b):
    x = {tuple(r["seq"]): r for r in a if r["status"] == "ok"}
    y = {tuple(r["seq"]): r for r in b if r["status"] == "ok"}
    return [(s, x[s], y[s]) for s in sorted(set(x) & set(y))]


def lnr(a, b):
    return math.log(m141.r4(b) / m141.r4(a))


def main(dst):
    designs, T = M158.tables()
    rows, S, N = {}, [], []
    for x in designs:
        P = pairs(M158.per(T["A"], x), M158.per(T["B"], x))
        s = [p for p in P if same_mapped(p[1], p[2])]
        n = [p for p in P if not same_mapped(p[1], p[2])]
        S += s
        N += n
        rows[x] = (s, n)
    M = [x for x in designs if len(rows[x][0]) >= 5 and len(rows[x][1]) >= 5]
    mS = {x: statistics.mean(abs(lnr(a, b)) for _, a, b in rows[x][0]) for x in M}
    mN = {x: statistics.mean(abs(lnr(a, b)) for _, a, b in rows[x][1]) for x in M}
    rho = {x: mS[x] / mN[x] if mN[x] else float("nan") for x in M}
    big = [x for x in designs if len(rows[x][0]) >= 10]
    tauS = {x: m141.tau_b([m141.r4(a) for _, a, _ in rows[x][0]], [m141.r4(b) for _, _, b in rows[x][0]]) for x in big}

    def share(P, f):
        return sum(f(a, b) for _, a, b in P), len(P)

    out = ["# Milestone 159: splitting milestone 158's build drift at the mapped netlist (replay, no flow run)", "",
           "S = points ok in both builds with the same mapped netlist (only OpenROAD differs); N = the rest (both tools differ)",
           "lr = |ln(routed score B / routed score A)|; rho = mean lr on S / mean lr on N, per design", "",
           "design | n S | n N | mean lr S | mean lr N | rho | tauS | final same on S"]
    for x in designs:
        s, n = rows[x]
        fs = share(s, STAGES["final"])
        out.append(f"{x} | {len(s)} | {len(n)} | "
                   + (f"{statistics.mean(abs(lnr(a, b)) for _, a, b in s):.4f}" if s else "-") + " | "
                   + (f"{statistics.mean(abs(lnr(a, b)) for _, a, b in n):.4f}" if n else "-") + " | "
                   + (f"{rho[x]:.3f}" if x in rho else "-") + " | " + (f"{tauS[x]:.3f}" if x in tauS else "-")
                   + f" | {fs[0]}/{fs[1]}")
    rv = [rho[x] for x in M]
    lo1, hi1 = boot(rv, seed=SEED)
    st = {k: share(S, f) for k, f in STAGES.items()}
    stN = {k: share(N, f) for k, f in STAGES.items()}
    mt = statistics.median(tauS.values()) if tauS else float("nan")
    below = sum(mS[x] < mN[x] for x in M)
    lrS = [abs(lnr(a, b)) for _, a, b in S]
    lrN = [abs(lnr(a, b)) for _, a, b in N]
    res = [
        (f"(1) PRIMARY: mean rho over {len(M)} matched designs {statistics.mean(rv):.3f} (median {statistics.median(rv):.3f}), "
         f"interval {lo1:.3f} to {hi1:.3f}", statistics.mean(rv) >= 0.25 and hi1 < 1),
        (f"(2) final routed numbers differ on {st['final'][1] - st['final'][0]} of {st['final'][1]} points in S "
         f"({100 * (1 - st['final'][0] / st['final'][1]):.1f}%)", st["final"][1] - st["final"][0] > 0.9 * st["final"][1]),
        (f"(3) global_place_wns equal on {st['global_place_wns'][0]} of {len(S)} points in S",
         st["global_place_wns"][0] < 0.5 * len(S)),
        (f"(4) buffers_added equal on {st['buffers_added'][0]} of {len(S)} points in S", st["buffers_added"][0] < 0.5 * len(S)),
        (f"(5) median tauS over {len(tauS)} designs with at least 10 points in S {mt:.3f} (range "
         f"{min(tauS.values()):.3f} to {max(tauS.values()):.3f})", mt < 0.8),
        (f"(6) mean lr on S below mean lr on N on {below} of {len(M)} matched designs", below >= 0.75 * len(M)),
        (f"(7) median lr over S {statistics.median(lrS):.4f}", statistics.median(lrS) > 0.01),
    ]
    out += ["", "## Predictions", ""] + [f"{t}: {'held' if h else 'refuted'}" for t, h in res]
    rep = ["", "## Reported, not predicted", "",
           f"points: S {len(S)}, N {len(N)}; matched designs {len(M)}: {', '.join(M)}",
           f"pooled lr: S mean {statistics.mean(lrS):.4f} median {statistics.median(lrS):.4f}; "
           f"N mean {statistics.mean(lrN):.4f} median {statistics.median(lrN):.4f}; pooled ratio {statistics.mean(lrS) / statistics.mean(lrN):.3f}",
           f"signed mean ln(B/A): S {statistics.mean(lnr(a, b) for _, a, b in S):+.4f}, N {statistics.mean(lnr(a, b) for _, a, b in N):+.4f}",
           "stage equality, S against N: " + "; ".join(f"{k} {st[k][0]}/{st[k][1]} against {stN[k][0]}/{stN[k][1]}" for k in STAGES),
           f"lr = 0 exactly on S: {sum(v == 0 for v in lrS)} of {len(S)}"]
    tr = []
    for x in big:
        s = rows[x][0]
        ia = min(range(len(s)), key=lambda i: (m141.r4(s[i][1]), s[i][0]))
        ib = min(range(len(s)), key=lambda i: (m141.r4(s[i][2]), s[i][0]))
        tr.append((x, ia == ib, 100 * (m141.r4(s[ia][2]) / m141.r4(s[ib][2]) - 1)))
    rep.append(f"within S (designs with at least 10 points in S): routed-best the same on {sum(t[1] for t in tr)} of {len(tr)}; "
               f"A's best within S under B, mean regret {statistics.mean(t[2] for t in tr):.2f}% (max "
               f"{max(t[2] for t in tr):.2f}%, {max(tr, key=lambda t: t[2])[0]})")
    out += rep
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))
    return {"M": M, "rho": rho, "held": [h for _, h in res], "nS": len(S), "nN": len(N), "stage": st, "tauS": tauS}


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results159.txt")
