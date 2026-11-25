"""Milestone 166: are the shallow-amount shifters' wins and losses properties of the designs? Two more namings each (flow run)

Usage: python experiments/naming_shifters/run.py [--pdk <sky130hd dir>] [--jobs 4] [--minutes 110] [--resume]
       python experiments/naming_shifters/run.py --analyse   # results.txt from results.jsonl, no flow
       python experiments/naming_shifters/run.py --check-y   # arm Y only: reproduces milestone 165's d, no flow

Why: milestone 165's "Next". Under milestone 164's 4-point tie rule the gate-depth guard's blind evidence splits in two: at 32
gates or more the clipped ladder (SWC) wins 11 decided designs and loses 1, below 32 it wins 5 and loses 8 (sign p 0.58). Those
13 decided designs below the cut were read off one naming each (build A: Yosys 0.70, OpenROAD 26Q3, tt_025C_1v80, Yosys's own
net and instance names), and milestone 164 found one whole-table naming moves a design's edge by up to 3.8 points on the
ss-corner designs it measured. So whether the 5 wins and 8 losses below the cut are properties of the designs, or of one draw of
the placer's naming noise, is open; the paper's shifter section rests on the losses ("the ladder's large losses sit on shallow
amounts").

Design: the 13 decided designs with a shift-amount gate depth under 32 in milestone 165's designs.json, in its order (gate depth,
then design name as listed there): funnel128 (118), rotmask128 (119), xor8 (123), crc7s16 (133), bcd2 (133), gray0 (132),
lane4k1 (125), addsh128 (121), cmp16 (133), pmul3 (125), fpalign128 (121), avg5 (125), sad1b8 (124). Each design's own
milestone table is arm Y (its results.jsonl as committed: 120 sequences of milestone 108, two clocks "tight" = the design's
baseline no-wire period and "relaxed" = 1.5x, 40% utilisation, tt_025C_1v80 liberty from ORFS e5cc6e79). Per sequence whose arm-Y
row is ok at either clock, Yosys 0.70 (/nix/store/dzsihg5w..., the build A Yosys, milestone 160) maps the netlist again exactly
as flow.run_point, and two random renamings R2 and R3 (milestone 161's variant(): every internal net and instance renamed, order
kept; seeds "m166R2" / "m166R3" + design + sequence index) are placed and routed at both clocks by OpenROAD 26Q3 p9p47153 (whose
bin/.openroad-wrapped is byte-identical to build A's k3d2rlwj, milestone 160) with Yosys 0.70 on PATH. Every renaming is
checked to be the same circuit (milestone 160's name-free fingerprint) before it runs. Only outcomes change between arms: an R2
or R3 row is arm Y's row with milestone 162's OUTCOME fields replaced; rung costs stay arm Y's, so the ladder's branch and
budget are the same in every arm. A3 is milestone 162's three-naming average (per point and stage, geometric mean of area and
of delay over Y, R2, R3; a point any naming failed is failed in A3).
Cells and d: each source milestone's own blind cells (new_families nf.build over switch_guard rule.load_table, tie-break seed
"m<milestone>blind" + clock + design, exactly as that milestone's analyse.py), SWC = nf.swc (theta 3, alpha 1.25), random =
equal-cost random routing; a design's d = mean over its two clocks of SWC % - random %. Classes as milestone 165: tau = 4,
win d <= -4, loss d >= +4, tie otherwise.
Controls: (a) for sequence indices 0 to 2 of every design Yosys's own netlist is placed and routed again ("orig") and must
reproduce arm Y's row on every OUTCOME field; (b) rung 1 (r1_cells, r1_depth) equals arm Y's row on every point ok in both;
(c) arm Y's d reproduces milestone 165's designs.json d to 0.01 points on all 13 (checked before this commit, see below).
Order and stop: designs in the order above, all sequences of one before the next; the flow stops when it finishes or at
--minutes (resumable with --resume); the analysed set is the longest prefix of that order complete in R2 and R3 (a rule that
depends on no result).

Predictions, written here and committed before the flow first runs (D13 = the analysed designs; if fewer than 13 complete, the
counts below scale by len(D13)/13, rounded down). Disclosed: arm Y's d per design is known (milestone 165) and control (c) was
run before this commit (it reads only committed tables); the tools were fetched and smoke-tested on no design of D13; no R2 or R3
number exists.
 (1) PRIMARY: the decided designs below the cut keep their sign under averaging: sign(d(A3)) = sign(d(Y)) on at least 10 of 13.
     Prior 75%.
 (2) they stay decided: |d(A3)| >= 4 with the sign of d(Y) on at least 9 of 13. Prior 60%.
 (3) the losses are properties of the designs: of the 8 arm-Y losses, at least 6 have d(A3) >= 4. Prior 65%.
 (4) the wins are too: of the 5 arm-Y wins, at least 3 have d(A3) <= -4. Prior 55%.
 (5) one whole-table naming moves these shifters' edge about as much as milestone 164's designs: median over D13 and j in
     {R2, R3} of |d(Rj) - d(Y)| is at most 4 points. Prior 60%.
 (6) below the cut there is still no rule: a two-sided sign test of decided wins against decided losses under A3 has p > 0.05.
     Prior 75%.
 (7) the losses outweigh the wins in size: mean d(A3) over D13 > 0. Prior 65%.
Reported, not predicted: per-design table (d per arm, class per arm); mean |d(R2) - d(R3)|; per design the spread of d over the
three namings; the 31 to 33-gate pair (avg5 and sad1b8, both 31 gates, one win one loss) under A3; failures; the controls.
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
TAU = 4.0
NEW = ("R2", "R3")
ARMS = ("Y", "R2", "R3", "A3")
CONTROL_IDX = (0, 1, 2)
CLOCKS = ("tight", "relaxed")
# design: (milestone, experiment), milestone 165's order (designs.json, decided, gate depth < 32)
D13 = {"funnel128": (118, "new_families"), "rotmask128": (119, "struct_guard"), "xor8": (123, "amount_cut"),
       "crc7s16": (133, "ladder_blind"), "bcd2": (133, "ladder_blind"), "gray0": (132, "blind_probe"),
       "lane4k1": (125, "amount_lanes"), "addsh128": (121, "amount_depth"), "cmp16": (133, "ladder_blind"),
       "pmul3": (125, "amount_lanes"), "fpalign128": (121, "amount_depth"), "avg5": (125, "amount_lanes"),
       "sad1b8": (124, "amount_place")}
ORDER = list(D13)


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


NL = _load(EXP / "naming_ladder" / "run.py", "vdse_m166_nl")
M161, M160, OUTCOME = NL.M161, NL.M160, NL.OUTCOME
YOSYS = M160.YOSYS["0.70"]
ORB = M160.OPENROAD["p9p4"]


def designs():
    """flow.DESIGNS entries of D13, from each source milestone's run.py."""
    out = {}
    for e in sorted({e for _, e in D13.values()}):
        mod = _load(EXP / e / "run.py", f"vdse_m166_src_{e}")
        for d, (_, e2) in D13.items():
            if e2 == e:
                out[d] = mod.NEW[d]
    return out


def install():
    flow.DESIGNS.update(designs())


def y_rows(design):
    """Arm Y: the source milestone's rows of this design, in file order."""
    _, e = D13[design]
    return [r for r in map(json.loads, (EXP / e / "results.jsonl").read_text().splitlines()) if r["design"] == design]


# ---------------------------------------------------------------- flow
def task(a):
    i, design, seq, periods, wd, lib, pdk = a
    os.environ["PATH"] = YOSYS + ":" + os.environ["PATH"]
    install()
    wd = Path(wd)
    base = {"design": design, "seq": list(seq), "i": i}
    try:
        r1, text = NL.mapped(design, seq, wd, lib)
    except RuntimeError as e:
        return [dict(base, tag=t, variant=v, status="fail", error=str(e)[-200:]) for t in periods for v in NEW]
    texts = {v: M161.variant(text, "R", f"m166{v}{design}{i}") for v in NEW}
    if i in CONTROL_IDX:
        texts["orig"] = text
    out = []
    for v, t in texts.items():
        same = v == "orig" or M161.same_circuit(text, t)
        vd = wd / v
        vd.mkdir(parents=True, exist_ok=True)
        (vd / "mapped.v").write_text(t)
        for tag, per in periods.items():
            row = dict(base, tag=tag, variant=v, period_ns=per, **r1)
            if not same:
                out.append(dict(row, status="not same circuit"))
                continue
            try:
                res = M161.pnr(design, vd / "mapped.v", per, vd / tag, lib, pdk, ORB)
                out.append(dict(row, status="ok", sha=hashlib.sha256(t.encode()).hexdigest()[:16], **res))
            except RuntimeError as e:
                out.append(dict(row, status="fail", error=str(e)[-200:]))
    return out


def main_run(a):
    if flow.UTIL != 40:
        sys.exit("unset VDSE_UTIL")
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    lib = out / "lib.lib"
    flow.filtered_liberty(Path(a.pdk) / "lib/sky130_fd_sc_hd__tt_025C_1v80.lib", lib)
    seqs = NL.sequences()
    idx = {tuple(s): i for i, s in enumerate(seqs)}
    tasks = []
    for d in ORDER:
        ok = {}
        for r in y_rows(d):
            if r["status"] == "ok":
                ok.setdefault(idx[tuple(r["seq"])], {})[r["tag"]] = r["period_ns"]
        tasks += [(i, d, seqs[i], ok[i], out / d / str(i), lib, Path(a.pdk)) for i in sorted(ok)]
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
NF = None


def nf():
    global NF
    if NF is None:
        NF = _load(EXP / "new_families" / "analyse.py", "vdse_m166_nf")
    return NF


def rows():
    return [json.loads(l) for l in TABLE.read_text().splitlines()] if TABLE.exists() else []


def complete(rs):
    seqs = NL.sequences()
    idx = {tuple(s): i for i, s in enumerate(seqs)}
    have = {}
    for r in rs:
        if r["variant"] in NEW:
            have.setdefault(r["design"], set()).add((r["i"], r["tag"], r["variant"]))
    out = []
    for d in ORDER:
        need = {(idx[tuple(r["seq"])], r["tag"], v) for r in y_rows(d) if r["status"] == "ok" for v in NEW}
        if not need <= have.get(d, set()):
            break
        out.append(d)
    return out


def arm_rows(design, by):
    """Per arm, the design's rows in arm Y's file order (Y's failures stay failures; a new failure fails that arm)."""
    idx = {tuple(s): i for i, s in enumerate(NL.sequences())}
    T = {a: [] for a in ARMS}
    for y in y_rows(design):
        if y["status"] != "ok":
            for a in ARMS:
                T[a].append(y)
            continue
        i = idx[tuple(y["seq"])]
        T["Y"].append(y)
        for v in NEW:
            x = by.get((design, i, y["tag"], v))
            T[v].append(dict(y, **{f: x[f] for f in OUTCOME if f in x}) if x is not None and x["status"] == "ok"
                        else dict(y, status="fail"))
        three = [T[a][-1] for a in ("Y",) + NEW]
        T["A3"].append(NL.average(three) if all(r["status"] == "ok" for r in three) else dict(y, status="fail"))
    return T


def d_of(design, rs):
    """Milestone <m>'s blind cells of this design on rows rs; d = mean over clocks of SWC - random (points)."""
    m, e = D13[design]
    raw = {}
    for r in rs:
        if r["status"] == "ok":
            raw.setdefault((r["tag"], r["design"], e), []).append(r)
    cells = nf().build(raw, lambda k: f"m{m}blind{k[0]}{k[1]}")
    return statistics.mean(nf().swc(c) - c["rand"] for c in cells), len(cells)


def cls(d):
    return "win" if d <= -TAU else "loss" if d >= TAU else "tie"


def sign_p(w, l):
    n = w + l
    if n == 0:
        return 1.0
    k = min(w, l)
    return min(1.0, 2 * sum(math.comb(n, j) for j in range(k + 1)) / 2 ** n)


def check_y():
    ref = json.loads((EXP / "tie_rule" / "designs.json").read_text())
    ok = True
    for d in ORDER:
        dy, n = d_of(d, y_rows(d))
        good = abs(dy - ref[d]["d"]) < 0.01 and n == ref[d]["cells"]
        ok &= good
        print(f"{d}: d(Y) {dy:+.3f}, milestone 165 {ref[d]['d']:+.3f}, cells {n}: {'ok' if good else 'MISMATCH'}")
    print("control (c):", ok)
    return ok


def analyse(dst):
    rs = rows()
    D = complete(rs)
    if not D:
        sys.exit("no complete design yet")
    by = {(r["design"], r["i"], r["tag"], r["variant"]): r for r in rs}
    seqs = NL.sequences()
    idx = {tuple(s): i for i, s in enumerate(seqs)}
    # controls
    ca = can = cb = cbn = 0
    for d in D:
        Y = {(idx[tuple(r["seq"])], r["tag"]): r for r in y_rows(d) if r["status"] == "ok"}
        for r in rs:
            if r["design"] != d or r["status"] != "ok" or (r["i"], r["tag"]) not in Y:
                continue
            y = Y[(r["i"], r["tag"])]
            cbn += 1
            cb += r["r1_cells"] == y["r1_cells"] and r["r1_depth"] == y["r1_depth"]
            if r["variant"] == "orig":
                can += 1
                ca += all(r.get(f) == y.get(f) for f in OUTCOME)
    ref = json.loads((EXP / "tie_rule" / "designs.json").read_text())
    dd = {}
    for d in D:
        T = arm_rows(d, by)
        dd[d] = {a: d_of(d, T[a])[0] for a in ARMS}
    cy = all(abs(dd[x]["Y"] - ref[x]["d"]) < 0.01 for x in D)
    sc = len(D) / 13
    sgn = lambda v: (v > 0) - (v < 0)  # noqa: E731
    keep = sum(sgn(dd[x]["A3"]) == sgn(dd[x]["Y"]) for x in D)
    dec = sum(abs(dd[x]["A3"]) >= TAU and sgn(dd[x]["A3"]) == sgn(dd[x]["Y"]) for x in D)
    L_ = [x for x in D if cls(dd[x]["Y"]) == "loss"]
    W_ = [x for x in D if cls(dd[x]["Y"]) == "win"]
    lk = sum(dd[x]["A3"] >= TAU for x in L_)
    wk = sum(dd[x]["A3"] <= -TAU for x in W_)
    mv = [abs(dd[x][v] - dd[x]["Y"]) for x in D for v in NEW]
    wa = sum(cls(dd[x]["A3"]) == "win" for x in D)
    la = sum(cls(dd[x]["A3"]) == "loss" for x in D)
    p6 = sign_p(wa, la)
    m7 = statistics.mean(dd[x]["A3"] for x in D)
    held = [keep >= math.floor(10 * sc), dec >= math.floor(9 * sc), lk >= math.floor(6 * len(L_) / 8),
            wk >= math.floor(3 * len(W_) / 5), statistics.median(mv) <= 4, p6 > 0.05, m7 > 0]
    hv = lambda i: "held" if held[i] else "refuted"  # noqa: E731
    L = ["# Milestone 166: two more namings of the 13 decided shifter designs below 32 gates (flow run)", "",
         "Yosys 0.70 (dzsihg5w), OpenROAD 26Q3 (p9p4), tt_025C_1v80, 40% utilisation; Y = each design's own milestone table; "
         "R2, R3 = fresh random renamings; A3 = geometric mean of the three; cells and tie-break seeds as each source milestone",
         f"analysed designs (longest complete prefix of the order): {len(D)} of 13: {', '.join(D)}",
         f"control (a) (orig netlist re-placed reproduces arm Y on every OUTCOME field): {ca} of {can}",
         f"control (b) (rung 1 equals arm Y): {cb} of {cbn} runs",
         f"control (c) (arm Y's d reproduces milestone 165 to 0.01): {cy}", "",
         "design | milestone | gate depth | d Y | d R2 | d R3 | d A3 | class Y | class R2 | class R3 | class A3 | spread of d (max - min, Y R2 R3)"]
    for x in D:
        f = dd[x]
        sp = max(f[a] for a in ("Y",) + NEW) - min(f[a] for a in ("Y",) + NEW)
        L.append(f"{x} | {D13[x][0]} | {ref[x]['depth']} | {f['Y']:+.2f} | {f['R2']:+.2f} | {f['R3']:+.2f} | {f['A3']:+.2f} | "
                 f"{cls(f['Y'])} | {cls(f['R2'])} | {cls(f['R3'])} | {cls(f['A3'])} | {sp:.2f}")
    L += ["", "## Predictions", "",
          f"(1) PRIMARY: sign(d(A3)) = sign(d(Y)) on {keep} of {len(D)} (needed >= {math.floor(10 * sc)}): {hv(0)}",
          f"(2) |d(A3)| >= 4 with Y's sign on {dec} of {len(D)} (needed >= {math.floor(9 * sc)}): {hv(1)}",
          f"(3) arm-Y losses with d(A3) >= 4: {lk} of {len(L_)} (needed >= {math.floor(6 * len(L_) / 8)}; "
          f"{', '.join(x for x in L_ if dd[x]['A3'] < TAU) or 'none'} not): {hv(2)}",
          f"(4) arm-Y wins with d(A3) <= -4: {wk} of {len(W_)} (needed >= {math.floor(3 * len(W_) / 5)}; "
          f"{', '.join(x for x in W_ if dd[x]['A3'] > -TAU) or 'none'} not): {hv(3)}",
          f"(5) median |d(Rj) - d(Y)| {statistics.median(mv):.2f} points (needed <= 4; max {max(mv):.2f}): {hv(4)}",
          f"(6) A3 decided wins / losses {wa} / {la}, sign p = {p6:.4f} (needed > 0.05): {hv(5)}",
          f"(7) mean d(A3) {m7:+.2f} (needed > 0): {hv(6)}",
          "", "## Reported, not predicted", ""]
    L.append(f"mean |d(R2) - d(R3)| {statistics.mean(abs(dd[x]['R2'] - dd[x]['R3']) for x in D):.2f}; "
             f"mean |d(Rj) - d(Y)| {statistics.mean(mv):.2f}")
    for a in ARMS:
        w = sum(cls(dd[x][a]) == "win" for x in D)
        lo = sum(cls(dd[x][a]) == "loss" for x in D)
        L.append(f"arm {a}: wins {w}, losses {lo}, ties {len(D) - w - lo}, mean d {statistics.mean(dd[x][a] for x in D):+.2f}, "
                 f"sign p {sign_p(w, lo):.4f}")
    for x in ("avg5", "sad1b8"):
        if x in dd:
            L.append(f"31-gate pair: {x} d(A3) {dd[x]['A3']:+.2f} ({cls(dd[x]['A3'])})")
    fails = sum(r["status"] != "ok" for r in rs if r["design"] in D and r["variant"] in NEW)
    L.append(f"R2 or R3 runs not ok: {fails}")
    Path(dst).write_text("\n".join(L) + "\n")
    (HERE / "designs.json").write_text(json.dumps(dd, indent=1, sort_keys=True) + "\n")
    print("\n".join(L))
    return {"held": held, "designs": D, "d": dd}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdk", default="/tmp/pdk/orfs/flow/platforms/sky130hd")
    ap.add_argument("--out", default="/tmp/vdse-m166")
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--minutes", type=float, default=110)
    ap.add_argument("--resume", action="store_true")
    ap.add_argument("--analyse", action="store_true")
    ap.add_argument("--check-y", action="store_true")
    a = ap.parse_args()
    if a.analyse:
        analyse(HERE / "results.txt")
    elif a.check_y:
        check_y()
    else:
        main_run(a)
