"""Milestone 162: does the ladder's edge over random routing survive netlist naming noise? (flow run).

Usage: python experiments/naming_ladder/run.py --lib /tmp/ss.lib [--pdk <sky130hd dir>] [--jobs 4] [--minutes 125]
       python experiments/naming_ladder/run.py --analyse   # results.txt from results.jsonl, no flow

Why: milestone 161's "Next". With Yosys 0.71 (mlbh) and OpenROAD 26Q3 (p9p4) fixed, renaming a mapped netlist's internal nets and
instances moves the routed score on 90 of 90 points (median 2.1%, max 12.5%), and about one sequence pair in six in build B's table
is closer than that. The paper's headline quantity, d = SWC(1.25) - equal-cost random regret (milestone 158), was measured on one
naming per point, Yosys's. Each naming is one draw of the placer's noise, so the question is whether d is a property of the netlists
or of the draw.

Design: build B's nominal table (experiments/rc_corner, milestones 156 and 157: Yosys 0.71, OpenROAD p9p4, ss_100C_1v60 liberty,
sha256 9b24f0db..., 40% utilisation, the 120 sequences of milestone 108, each design's clock and period). For every point, Yosys
0.71 maps the netlist again (rung 1 and the mapped netlist, exactly as flow.run_point), and two renamings of that netlist are
placed and routed by the same OpenROAD executable:
  C  milestone 161's canonical form (colour refinement to a fixed point; a pure function of the circuit);
  R  every internal net and instance renamed to a random token, order kept (seed "m162R" + design + sequence index).
Arms analysed: Y (build B's rows as they are, Yosys's naming), C, R, and A3, the three-naming average: per point and per stage
(global place, detail place, routed) the geometric mean of area and the geometric mean of delay (period - WNS) over Y, C and R, so
that a rung's score (area x delay) is the geometric mean of the three draws' scores.
Only outcomes change between arms. A C or R row is build B's row with the OpenROAD outcome fields (areas, WNS, cells, buffers,
power) replaced; rung costs (t1, t2_yosys, t_pnr_*) stay build B's, so the ladder's branch (routed/r2 > theta) and its budget are
the same in every arm and only what each rung sees differs. Every C and R netlist is checked to be the same circuit as Yosys's
(milestone 160's name-free fingerprint) before it runs.
Controls: rung 1 (r1_cells, r1_depth) and the mapped rung (synth_netlist_area, synth_netlist_wns, which OpenSTA reports before
placement) must equal build B's row on every point ok in both; and for sequence indices 0 to 2 of every design Yosys's own netlist
is also placed and routed ("orig"), which must reproduce build B's row on every field (milestone 160 found 90 of 90).
Cells: experiments/util65_blind/analyse.py cells() (milestone 115's clipped ladder SWC and equal-cost random routing, theta = 3,
alpha = 1.25), tie-break seed "m162" + clock + design for every arm, so random's draws are the same and only outcomes differ.
Order and stop: milestone 143's 27-design ORDER (rc_corner/run.py), all 120 sequences of a design before the next; the flow stops
when it finishes or at --minutes of wall-clock (default 125); the analysed set is the longest prefix of ORDER complete in C and R,
a rule that depends on no result.

Predictions, written here and committed before the flow first runs (D = the analysed designs; differences are design-bootstrap
95% intervals, 2,000 resamples, seed 162). Disclosed: build B's d per design (milestone 158) is known; no C, R or A3 number is.
 Disclosed: before this commit the Yosys and canonicalisation steps were smoke-tested on gtc8r, sequence 0 (rung 1 matched build
 B's row; no OpenROAD run on any C, R or orig netlist), and arm Y's cells were checked to reproduce milestone 158's d for build B.
 (1) PRIMARY: the edge survives averaging over namings: mean d(A3) over D < 0 with its interval entirely below 0. Prior 75%.
 (2) averaging does not change the edge much: |mean d(A3) - mean d(Y)| < 1.5 points. Prior 65%.
 (3) SWC is better than random on at least two thirds of D under each of Y, C and R. Prior 65%.
 (4) one naming moves a design's edge: mean |d(C) - d(Y)| over D > 1.0 point (the tie-break seed alone moves it 0.38, milestone
     158). Prior 60%.
 (5) the routed-best sequence under C is the same as under Y on fewer than half of D. Prior 70%.
 (6) median over D of the Kendall tau-b of the routed score, Y against C, over sequences ok in both, is below 0.9. Prior 70%.
 (7) picking on one draw costs: the mean over D of the A3 regret of Y's routed-best sequence is above 1%. Prior 60%.
Reported, not predicted: per-design table; mean regrets per arm; sign tests; d(R) - d(C); tau-b Y against R and C against R;
mean |d| change between C and R; the controls.
"""
import argparse
import hashlib
import importlib.util
import json
import math
import os
import statistics
import sys
import time
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
sys.path.insert(0, str(EXP.parent / "src"))
from verified_dse import flow  # noqa: E402

TABLE = HERE / "results.jsonl"
SEED = 162
ARMS = ["Y", "C", "R", "A3"]
OUTCOME = ["synth_netlist_area", "synth_netlist_wns", "global_place_area", "global_place_wns", "detail_place_area",
           "detail_place_wns", "buffers_added", "final_area", "final_wns", "final_cells", "final_area_notap", "tap_area", "power_w",
           "synth_netlist_period_ns", "final_period_ns"]
CONTROL_IDX = (0, 1, 2)


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


M161 = _load(EXP / "netlist_noise" / "run.py", "vdse_m162_m161")
M160 = M161.M160
RCRUN = _load(EXP / "rc_corner" / "run.py", "vdse_m162_rcrun")
ORDER, CLOCK, BASE, FACTORS, M143 = RCRUN.ORDER, RCRUN.CLOCK, RCRUN.BASE, RCRUN.FACTORS, RCRUN.M143
NOM = "ss_100C_1v60"


def b_rows():
    """Build B's nominal rows keyed by (design, sequence), in the file's order (dicts keep insertion order)."""
    rs = [json.loads(l) for l in (EXP / "rc_corner" / "results.jsonl").read_text().splitlines()]
    return {(r["design"], tuple(r["seq"])): r for r in rs if r["corner"] == NOM}


def sequences():
    return M143.M141.R138.fresh_sequences(120)


def period(d):
    return round(BASE[d] * FACTORS[CLOCK[d]], 3)


# ---------------------------------------------------------------- flow
def mapped(design, seq, wd, lib):
    """Rung 1 and Yosys's mapped netlist, exactly as flow.run_point writes them."""
    wd = Path(wd)
    wd.mkdir(parents=True, exist_ok=True)
    r = flow.rung1(design, seq, wd)
    _, front = flow._front(design, None)
    abc = wd / "r2.abc"
    abc.write_text(flow.script_text(seq) + "\n")
    net = wd / "mapped.v"
    flow._yosys(front + f"dfflibmap -liberty {lib}; abc -liberty {lib} -script {abc}; "
                f"hilomap -singleton -hicell sky130_fd_sc_hd__conb_1 HI -locell sky130_fd_sc_hd__conb_1 LO; "
                f"opt_clean -purge; write_verilog -noattr -noexpr {net}", wd / "r2.log")
    net.write_text(net.read_text().replace(" signed [", " ["))
    return r, net.read_text()


def task(a):
    i, design, seq, per, wd, lib, pdk = a
    os.environ["PATH"] = M160.YOSYS["0.71"] + ":" + os.environ["PATH"]
    if design not in flow.DESIGNS:
        M143.M141.install()
    orb = M160.OPENROAD["p9p4"]
    wd = Path(wd)
    base = {"design": design, "seq": list(seq), "i": i, "period_ns": per}
    try:
        r1, text = mapped(design, seq, wd, lib)
    except RuntimeError as e:
        return [dict(base, variant=v, status="fail", error=str(e)[-200:]) for v in ("C", "R")]
    texts = {"C": M161.canonical(text)[0], "R": M161.variant(text, "R", f"m162R{design}{i}")}
    if i in CONTROL_IDX:
        texts["orig"] = text
    out = []
    for v, t in texts.items():
        row = dict(base, variant=v, **r1)
        if v != "orig" and not M161.same_circuit(text, t):
            out.append(dict(row, status="not same circuit"))
            continue
        vd = wd / v
        vd.mkdir(parents=True, exist_ok=True)
        (vd / "mapped.v").write_text(t)
        try:
            res = M161.pnr(design, vd / "mapped.v", per, vd, lib, pdk, orb)
            out.append(dict(row, status="ok", sha=hashlib.sha256(t.encode()).hexdigest()[:16], **res))
        except RuntimeError as e:
            out.append(dict(row, status="fail", error=str(e)[-200:]))
    return out


def main_run(a):
    if flow.UTIL != 40:
        sys.exit("unset VDSE_UTIL")
    if hashlib.sha256(Path(a.lib).read_bytes()).hexdigest() != M143.SHA256:
        sys.exit("not milestone 143's ss liberty")
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    lib = out / "lib.lib"
    flow.filtered_liberty(Path(a.lib), lib)
    seqs = sequences()
    tasks = [(i, d, s, period(d), out / d / str(i), lib, Path(a.pdk)) for d in ORDER for i, s in enumerate(seqs)]
    done = set()
    if a.resume and TABLE.exists():
        done = {(r["design"], r["i"]) for r in map(json.loads, TABLE.read_text().splitlines())}
        tasks = [t for t in tasks if (t[1], t[0]) not in done]
    t0 = time.time()
    print(f"{len(tasks)} points to run", flush=True)
    pool = Pool(a.jobs)
    with open(TABLE, "a" if a.resume else "w") as fh:
        for n, rs in enumerate(pool.imap(task, tasks, chunksize=1)):
            for r in rs:
                fh.write(json.dumps(r) + "\n")
            fh.flush()
            if n % 20 == 0:
                print(n, rs[0]["design"], round((time.time() - t0) / 60, 1), "min", flush=True)
            if time.time() - t0 > 60 * a.minutes:
                print("STOP: wall-clock budget reached", flush=True)
                pool.terminate()
                break
    pool.close()
    print("DONE", flush=True)


# ---------------------------------------------------------------- analysis
def rows():
    return [json.loads(l) for l in TABLE.read_text().splitlines()] if TABLE.exists() else []


def complete(rs, n=120):
    have = {}
    for r in rs:
        if r["variant"] in ("C", "R"):
            have.setdefault((r["design"], r["variant"]), set()).add(r["i"])
    out = []
    for d in ORDER:
        if len(have.get((d, "C"), ())) < n or len(have.get((d, "R"), ())) < n:
            break
        out.append(d)
    return out


def _gm(xs):
    return math.exp(statistics.mean(math.log(x) for x in xs))


def average(rows_):
    """A3 row: per stage, geometric mean of area and of delay (period - WNS) over the given rows."""
    r = dict(rows_[0])
    p = r["period_ns"]
    for area, wns in (("global_place_area", "global_place_wns"), ("detail_place_area", "detail_place_wns"),
                      ("final_area_notap", "final_wns")):
        r[area] = _gm([x[area] for x in rows_])
        r[wns] = p - _gm([p - x[wns] for x in rows_])
    return r


def arm_tables(designs, B):
    """Per arm, rows in build B's format for the analysed designs (B's failures stay failures in every arm)."""
    idx = {tuple(s): i for i, s in enumerate(sequences())}
    by = {(r["design"], r["i"], r["variant"]): r for r in rows()}
    T = {a: [] for a in ARMS}
    keep = set(designs)
    for b in B.values():  # build B's file order, so that arm Y's cells are milestone 158's exactly
        if b["design"] in keep:
            d, i = b["design"], idx[tuple(b["seq"])]
            if b["status"] != "ok":
                for a in ARMS:
                    T[a].append(b)
                continue
            got = {}
            for v in ("C", "R"):
                x = by.get((d, i, v))
                if x is None or x["status"] != "ok":
                    got[v] = dict(b, status="fail")
                else:
                    got[v] = dict(b, **{f: x[f] for f in OUTCOME})
            T["Y"].append(b)
            T["C"].append(got["C"])
            T["R"].append(got["R"])
            T["A3"].append(average([b, got["C"], got["R"]]) if all(g["status"] == "ok" for g in got.values())
                           else dict(b, status="fail"))
    return T


def analyse(dst, quiet=False):
    A158 = _load(EXP / "tool_build" / "analyse.py", "vdse_m162_m158")
    m141, swc, rand, sign, boot, lb = A158.m141, A158.swc, A158.rand, A158.sign, A158.boot, A158.lb
    B = b_rows()
    rs = rows()
    designs = complete(rs)
    if not designs:
        sys.exit("no complete design yet")
    T = arm_tables(designs, B)
    cell = {a: m141.cells(T[a], "naming_ladder", "m162") for a in ARMS}
    d = {a: {x: swc(cell[a][x]) - rand(cell[a][x]) for x in designs} for a in ARMS}
    n = len(designs)
    # controls
    seqs = sequences()
    c1 = c1n = 0
    for r in rs:
        if r["design"] in designs and r["variant"] == "C" and r["status"] == "ok":
            b = B[(r["design"], tuple(seqs[r["i"]]))]
            if b["status"] == "ok":
                c1n += 1
                c1 += all(r[f] == b[f] for f in ("r1_cells", "r1_depth", "synth_netlist_area", "synth_netlist_wns"))
    ctl = [r for r in rs if r["design"] in designs and r["variant"] == "orig" and r["status"] == "ok"]
    c2 = sum(M160.equal(r, B[(r["design"], tuple(r["seq"]))]) for r in ctl)

    def per(a, x):
        return [r for r in T[a] if r["design"] == x]

    def r4map(a, x):
        return {tuple(r["seq"]): m141.r4(r) for r in per(a, x) if r["status"] == "ok"}

    tau, same, regY = {}, {}, {}
    for x in designs:
        tau[x], same[x], _ = m141.compare(x, per("Y", x), per("C", x))
        y, a3 = r4map("Y", x), r4map("A3", x)
        common = set(y) & set(a3)
        pick = min(common, key=lambda s: (y[s], s))
        regY[x] = 100 * (a3[pick] / min(a3[s] for s in common) - 1)
    mean = statistics.mean
    dA3 = [d["A3"][x] for x in designs]
    lo1, hi1 = boot(dA3, seed=SEED)
    diff2 = [d["A3"][x] - d["Y"][x] for x in designs]
    lo2, hi2 = boot(diff2, seed=SEED + 1)
    ab4 = [abs(d["C"][x] - d["Y"][x]) for x in designs]
    lo4, hi4 = boot(ab4, seed=SEED + 2)
    sg = {a: sign(d[a]) for a in ARMS}
    held = [hi1 < 0, abs(mean(diff2)) < 1.5, all(sg[a][0] >= 2 * n / 3 for a in ("Y", "C", "R")), mean(ab4) > 1.0,
            sum(same.values()) < n / 2, statistics.median(tau.values()) < 0.9, mean(regY.values()) > 1.0]
    hv = lambda i: "held" if held[i] else "refuted"  # noqa: E731
    L = ["# Milestone 162: the ladder's edge under three namings of the same mapped netlists (flow run)", "",
         "Yosys 0.71 (mlbh), OpenROAD 26Q3 (p9p4), ss_100C_1v60, 40% utilisation; Y = build B's rows (rc_corner nominal), "
         "C = canonical renaming, R = random renaming, A3 = geometric mean of the three; tie-break seed m162; theta = "
         f"{A158.RC.score.THETA}",
         f"analysed designs (longest complete prefix of ORDER): {n} of {len(ORDER)}: {', '.join(designs)}",
         f"control 1 (rung 1 and mapped rung equal build B's row): {c1} of {c1n} points",
         f"control 2 (Yosys's own netlist re-run reproduces build B's row, all fields): {c2} of {len(ctl)} points", "",
         "design | clock | ratio | random Y | SWC Y | d Y | d C | d R | d A3 | tau-b Y-C | same best Y-C | A3 regret of Y's best"]
    for x in designs:
        c = cell["Y"][x]
        L.append(f"{x} | {c['clock']} | {c['ratio']:.2f} | {rand(c):.2f} | {swc(c):.2f} | {d['Y'][x]:+.2f} | {d['C'][x]:+.2f} | "
                 f"{d['R'][x]:+.2f} | {d['A3'][x]:+.2f} | {tau[x]:.3f} | {same[x]} | {regY[x]:.2f}")
    L += ["", "## Predictions", "",
          f"(1) PRIMARY: mean d(A3) {mean(dA3):+.2f} points, interval {lo1:+.2f} to {hi1:+.2f}: {hv(0)}",
          f"(2) mean d(A3) - d(Y) {mean(diff2):+.2f}, interval {lo2:+.2f} to {hi2:+.2f} (needed |mean| < 1.5): {hv(1)}",
          f"(3) SWC better than random on: Y {sg['Y'][0]}, C {sg['C'][0]}, R {sg['R'][0]} of {n} (needed >= {2 * n / 3:.1f} each): "
          f"{hv(2)}",
          f"(4) mean |d(C) - d(Y)| {mean(ab4):.2f} points, interval {lo4:.2f} to {hi4:.2f} (needed > 1.0): {hv(3)}",
          f"(5) routed-best the same under C and Y on {sum(same.values())} of {n} (needed < {n / 2:.1f}): {hv(4)}",
          f"(6) median tau-b Y against C {statistics.median(tau.values()):.3f} (range {min(tau.values()):.3f} to "
          f"{max(tau.values()):.3f}; needed < 0.9): {hv(5)}",
          f"(7) mean A3 regret of Y's routed-best {mean(regY.values()):.2f}% (median {statistics.median(regY.values()):.2f}%, "
          f"max {max(regY.values()):.2f}%; needed > 1%): {hv(6)}",
          "", "## Reported, not predicted", ""]
    for a in ARMS:
        L.append(f"{a}: mean regret SWC {lb.mean([cell[a][x] for x in designs], swc):.2f}% / random "
                 f"{lb.mean([cell[a][x] for x in designs], rand):.2f}%; mean d {mean(d[a].values()):+.2f}; "
                 f"SWC better/worse/tied {sg[a][:3]}, sign p = {sg[a][3]:.6f}")
    tYR = {x: m141.compare(x, per("Y", x), per("R", x))[0] for x in designs}
    tCR = {x: m141.compare(x, per("C", x), per("R", x))[0] for x in designs}
    L.append(f"median tau-b Y-R {statistics.median(tYR.values()):.3f}, C-R {statistics.median(tCR.values()):.3f}")
    L.append(f"mean |d(R) - d(C)| {mean(abs(d['R'][x] - d['C'][x]) for x in designs):.2f}; mean |d(R) - d(Y)| "
             f"{mean(abs(d['R'][x] - d['Y'][x]) for x in designs):.2f}; mean d(R) - d(C) "
             f"{mean(d['R'][x] - d['C'][x] for x in designs):+.2f}")
    spread = []
    for x in designs:
        y, c, r = r4map("Y", x), r4map("C", x), r4map("R", x)
        for s in set(y) & set(c) & set(r):
            v = [y[s], c[s], r[s]]
            spread.append(math.log(max(v) / min(v)))
    L.append(f"per-point routed spread over three namings, ln(max/min): median {statistics.median(spread):.4f}, "
             f"mean {mean(spread):.4f}, max {max(spread):.4f} (n {len(spread)})")
    fails = sum(r["status"] != "ok" for r in rs if r["design"] in designs and r["variant"] in ("C", "R")
                and B[(r["design"], tuple(r["seq"]))]["status"] == "ok")
    L.append(f"C or R runs failed where build B's row is ok: {fails}")
    Path(dst).write_text("\n".join(L) + "\n")
    if not quiet:
        print("\n".join(L))
    return {"held": held, "designs": designs, "d": d, "c1": (c1, c1n), "c2": (c2, len(ctl))}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--lib")
    ap.add_argument("--pdk", default="/tmp/pdk/orfs/flow/platforms/sky130hd")
    ap.add_argument("--out", default="/tmp/vdse-m162")
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--minutes", type=float, default=125)
    ap.add_argument("--resume", action="store_true")
    ap.add_argument("--analyse", action="store_true")
    a = ap.parse_args()
    if a.analyse:
        analyse(HERE / "results.txt")
    else:
        main_run(a)
