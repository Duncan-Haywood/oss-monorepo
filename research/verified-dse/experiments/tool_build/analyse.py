"""Milestone 158: how much does the tool build move the ladder? Milestone 143's 27 ss designs under two builds of the same flow,
with the same liberty, clocks, utilisation and 120 sequences (replay, no flow run).

Usage: python3 analyse.py [out.txt]

Why: PAPER.md Section 6 and milestones 156 and 157's "Next". Milestone 156's control found that today's nixpkgs build (Yosys 0.71,
OpenROAD 26Q3 rebuilt) does not reproduce milestone 143's rows (Yosys 0.70, OpenROAD 26Q3), while milestone 157's control found a
fixed build reproduces itself bit for bit. So the two tables are a clean two-build experiment: same designs, same liberty (sha256
9b24f0db...), same clock targets, same 40% utilisation, same 120 sequences, same wire RC; only the tool build differs.
  build A = experiments/corner_ss_blind/results.jsonl (milestone 143), build B = experiments/rc_corner/results.jsonl at nominal RC
  (milestones 156 and 157), and, for scale, B's max-RC arm (R).
Milestone 156 compared the builds on its first 12 designs only and only as a side note (routed tau-b 0.66, d -2.92 against -4.42,
with different tie-break seeds); nobody has asked whether the ladder's edge, the paper's headline quantity, depends on the build.

Quantities, per design and build, cells from the usual builder (experiments/util65_blind/analyse.py, cells()) with ONE tie-break
seed for every build ("m158" + clock + design), so the random baseline's draws are the same and only the rows differ:
  d     = SWC(1.25) - equal-cost random regret, in points;
  tauD  = Kendall tau-b of mapped delay against routed delay (rc_corner/analyse.py, delay_stats);
  between builds, over sequences ok in both: tauR = tau-b of the routed score (area x delay), whether the routed-best sequence is
  the same, and whether the mapped netlist is the same (synth_netlist_area and synth_netlist_wns equal).

Predictions, written here and committed before this script first runs (D = the 27 designs; differences are B - A; design-bootstrap
95% intervals, 2,000 resamples, seed 158). Disclosed: milestone 156's 12-design side note above had been read; no per-design
statistic below had been computed on the other 15 designs for build A against build B.
 (1) PRIMARY: the edge does not depend on the build: the interval of mean d(B) - d(A) contains zero and |mean| < 1.5 points.
     Prior 60%.
 (2) per-design outcomes do not carry over well: Spearman of d(A) against d(B) over D is below 0.5. Prior 55%.
 (3) the build moves the routed ranking more than max-RC wires do: median tauR(A, B) < 0.75 (milestone 157: 0.867 for nom
     against max RC). Prior 80%.
 (4) the mapped netlist is the same on fewer than 25% of the points ok in both builds. Prior 75% (milestone 156: 212 of 1,236).
 (5) SWC beats random on at least 20 of 27 designs under each build. Prior 70%.
 (6) the build moves a design's edge more than max-RC wires do: mean over D of |d(B) - d(A)| - |d(R) - d(B)| is above zero with
     an interval entirely above zero. Prior 50%.
 (7) the interval of mean tauD(B) - tauD(A) contains zero. Prior 65%.
Reported, not predicted: the per-design table; mean regrets per build; the sign test per build; the same numbers with each
milestone's own tie-break seeds (m143ss, m156nom); transfer: the regret, under build B, of build A's routed-best sequence (and the
reverse), the price of choosing a sequence on one build and signing off on another.
"""
import importlib.util
import json
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
SEED = 158


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


RC = _load(EXP / "rc_corner" / "analyse.py", "verified_dse_m158_rc")
m141, swc, rand, sign, boot, lb = RC.m141, RC.swc, RC.rand, RC.sign, RC.boot, RC.lb
NOM, MAX = RC.NOM, RC.MAX
A_TABLE = EXP / "corner_ss_blind" / "results.jsonl"


def load(p):
    return [json.loads(l) for l in Path(p).read_text().splitlines()]


def tables():
    designs = list(RC.run.ORDER)
    a = [r for r in load(A_TABLE) if r["design"] in set(designs) and r["corner"] == NOM]
    rs = RC.rows()
    b = [r for r in rs if r["corner"] == NOM]
    m = [r for r in rs if r["corner"] == MAX]
    assert RC.run.complete(rs) == designs, "milestone 157's table is not complete on all 27 designs"
    return designs, {"A": a, "B": b, "R": m}


def per(rows, d):
    return [r for r in rows if r["design"] == d]


def same_mapped(a, b):
    x = {tuple(r["seq"]): r for r in a if r["status"] == "ok"}
    y = {tuple(r["seq"]): r for r in b if r["status"] == "ok"}
    common = set(x) & set(y)
    n = sum(x[s]["synth_netlist_area"] == y[s]["synth_netlist_area"] and x[s]["synth_netlist_wns"] == y[s]["synth_netlist_wns"]
            for s in common)
    return n, len(common)


def transfer(a, b):
    """Regret (%) under b of a's routed-best sequence, over sequences ok in both."""
    x = {tuple(r["seq"]): m141.r4(r) for r in a if r["status"] == "ok"}
    y = {tuple(r["seq"]): m141.r4(r) for r in b if r["status"] == "ok"}
    common = set(x) & set(y)
    pick = min(common, key=lambda s: (x[s], s))
    return 100 * (y[pick] / min(y[s] for s in common) - 1)


def main(dst):
    designs, T = tables()
    cell = {k: m141.cells([r for r in T[k] if r["design"] in set(designs)], "tool_build", "m158") for k in T}
    own = {"A": m141.cells(T["A"], "corner_ss_blind", "m143ss"), "B": m141.cells(T["B"], "rc_corner", "m156nom")}
    d = {k: {x: swc(cell[k][x]) - rand(cell[k][x]) for x in designs} for k in T}
    do = {k: {x: swc(own[k][x]) - rand(own[k][x]) for x in designs} for k in own}
    tD = {k: {x: RC.delay_stats(per(T[k], x))[0] for x in designs} for k in T}
    tauR, same, ncom, mapped, tAB, tBA = {}, {}, {}, {}, {}, {}
    for x in designs:
        a, b = per(T["A"], x), per(T["B"], x)
        tauR[x], same[x], ncom[x] = m141.compare(x, a, b)
        mapped[x] = same_mapped(a, b)
        tAB[x], tBA[x] = transfer(a, b), transfer(b, a)
    out = ["# Milestone 158: milestone 143's 27 ss designs under two tool builds (replay, no flow run)", "",
           "build A: experiments/corner_ss_blind (milestone 143; Yosys 0.70, OpenROAD 26Q3 from the nixpkgs cache of 2026-11-17)",
           f"build B: experiments/rc_corner at nominal RC (milestones 156, 157; {RC.run.json.loads((EXP / 'rc_corner' / 'meta.json').read_text())['tools']})",
           f"R: build B at SKY130's max-RC corner; tie-break seed 'm158' for every build; theta = {RC.score.THETA}", "",
           "design | clock | ratio A | ratio B | tauR A-B | same best | mapped same | tauD A | tauD B | random A | SWC A | "
           "random B | SWC B | d A | d B | d R | A's best under B | B's best under A"]
    for x in sorted(designs, key=lambda x: (d["B"][x] - d["A"][x], x)):
        a, b = cell["A"][x], cell["B"][x]
        out.append(f"{x} | {b['clock']} | {a['ratio']:.2f} | {b['ratio']:.2f} | {tauR[x]:.3f} | {same[x]} | "
                   f"{mapped[x][0]}/{mapped[x][1]} | {tD['A'][x]:.3f} | {tD['B'][x]:.3f} | {rand(a):.2f} | {swc(a):.2f} | "
                   f"{rand(b):.2f} | {swc(b):.2f} | {d['A'][x]:+.2f} | {d['B'][x]:+.2f} | {d['R'][x]:+.2f} | "
                   f"{tAB[x]:.2f} | {tBA[x]:.2f}")
    n = len(designs)
    dd = [d["B"][x] - d["A"][x] for x in designs]
    lo1, hi1 = boot(dd, seed=SEED)
    rho = RC.spearman([d["A"][x] for x in designs], [d["B"][x] for x in designs])
    mt = statistics.median(tauR.values())
    nm, nc = sum(v[0] for v in mapped.values()), sum(v[1] for v in mapped.values())
    sA, sB = sign(d["A"]), sign(d["B"])
    gap = [abs(d["B"][x] - d["A"][x]) - abs(d["R"][x] - d["B"][x]) for x in designs]
    lo6, hi6 = boot(gap, seed=SEED + 1)
    dt = [tD["B"][x] - tD["A"][x] for x in designs]
    lo7, hi7 = boot(dt, seed=SEED + 2)
    res = [
        (f"(1) PRIMARY: mean d(B) - d(A) {statistics.mean(dd):+.2f} points, interval {lo1:+.2f} to {hi1:+.2f}; higher under B on "
         f"{sum(v > 0 for v in dd)} of {n}, lower on {sum(v < 0 for v in dd)}", lo1 <= 0 <= hi1 and abs(statistics.mean(dd)) < 1.5),
        (f"(2) Spearman of d(A) against d(B) {rho:+.3f}", rho < 0.5),
        (f"(3) median tauR(A, B) {mt:.3f} (range {min(tauR.values()):.3f} to {max(tauR.values()):.3f}); same routed-best on "
         f"{sum(same.values())} of {n}", mt < 0.75),
        (f"(4) mapped netlist the same on {nm} of {nc} points ok in both ({100 * nm / nc:.1f}%)", nm < 0.25 * nc),
        (f"(5) SWC better than random under A on {sA[0]}, worse on {sA[1]}, tied on {sA[2]} (sign p = {sA[3]:.6f}); under B on "
         f"{sB[0]}, worse on {sB[1]}, tied on {sB[2]} (sign p = {sB[3]:.6f})", sA[0] >= 20 and sB[0] >= 20),
        (f"(6) mean |d(B) - d(A)| {statistics.mean(abs(v) for v in dd):.2f} against mean |d(R) - d(B)| "
         f"{statistics.mean(abs(d['R'][x] - d['B'][x]) for x in designs):.2f}; difference {statistics.mean(gap):+.2f}, interval "
         f"{lo6:+.2f} to {hi6:+.2f}", lo6 > 0),
        (f"(7) mean tauD(B) - tauD(A) {statistics.mean(dt):+.3f} ({statistics.mean(tD['A'].values()):.3f} to "
         f"{statistics.mean(tD['B'].values()):.3f}), interval {lo7:+.3f} to {hi7:+.3f}", lo7 <= 0 <= hi7),
    ]
    out += ["", "## Predictions", ""] + [f"{t}: {'held' if h else 'refuted'}" for t, h in res]
    LA, LB, LR = ([cell[k][x] for x in designs] for k in ("A", "B", "R"))
    ddo = [do["B"][x] - do["A"][x] for x in designs]
    loo, hio = boot(ddo, seed=SEED + 3)
    out += ["", "## Reported, not predicted", "",
            f"mean regret, seed m158: A SWC {lb.mean(LA, swc):.2f}% / random {lb.mean(LA, rand):.2f}%; "
            f"B SWC {lb.mean(LB, swc):.2f}% / random {lb.mean(LB, rand):.2f}%; R SWC {lb.mean(LR, swc):.2f}% / random "
            f"{lb.mean(LR, rand):.2f}%",
            f"mean d, seed m158: A {statistics.mean(d['A'].values()):+.2f}, B {statistics.mean(d['B'].values()):+.2f}, "
            f"R {statistics.mean(d['R'].values()):+.2f}",
            f"own seeds (m143ss, m156nom): mean d A {statistics.mean(do['A'].values()):+.2f}, B {statistics.mean(do['B'].values()):+.2f}; "
            f"change {statistics.mean(ddo):+.2f}, interval {loo:+.2f} to {hio:+.2f}; SWC better/worse/tied A {sign(do['A'])[:3]}, "
            f"B {sign(do['B'])[:3]}",
            f"seed effect alone (B under m156nom against m158): mean |d| change "
            f"{statistics.mean(abs(do['B'][x] - d['B'][x]) for x in designs):.2f} points",
            f"sign of d agrees between builds on {sum((d['A'][x] < 0) == (d['B'][x] < 0) for x in designs if d['A'][x] and d['B'][x])}"
            f" of {sum(1 for x in designs if d['A'][x] and d['B'][x])} designs untied under both",
            f"transfer: A's routed-best under B, mean regret {statistics.mean(tAB.values()):.2f}% (median "
            f"{statistics.median(tAB.values()):.2f}%, max {max(tAB.values()):.2f}%); B's under A {statistics.mean(tBA.values()):.2f}% "
            f"(median {statistics.median(tBA.values()):.2f}%, max {max(tBA.values()):.2f}%)",
            f"sequences ok in both builds per design: {min(ncom.values())} to {max(ncom.values())}",
            f"Spearman of tauR against |d(B) - d(A)|: "
            f"{RC.spearman([tauR[x] for x in designs], [abs(d['B'][x] - d['A'][x]) for x in designs]):+.3f}"]
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))
    return {"designs": designs, "d": d, "do": do, "tauR": tauR, "mapped": mapped, "held": [h for _, h in res], "tAB": tAB}


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results.txt")
