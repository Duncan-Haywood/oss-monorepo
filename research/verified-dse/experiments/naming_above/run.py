"""Milestone 167: are the deep-amount shifters' wins properties of the designs? Two more namings each (flow run)

Usage: python experiments/naming_above/run.py [--pdk <sky130hd dir>] [--jobs 4] [--minutes 110] [--resume]
       python experiments/naming_above/run.py --analyse   # results.txt from results.jsonl, no flow
       python experiments/naming_above/run.py --check-y   # arm Y only: reproduces milestone 165's d, no flow

Why: milestone 166's "Next". Milestone 166 rerouted the 13 decided shifter designs below the 32-gate cut under two fresh
namings and found every win and loss keeps its sign and stays decided. The other side of the gate-depth guard SWG(32), the 12
decided designs at 32 gates or more (11 wins, 1 loss, sign p 0.0063 in milestone 165), still rests on one naming each (build A,
Yosys's own net and instance names). That side is the evidence for the guard itself ("above 32 gates the ladder wins"), and 11 of
its 12 designs have SWC regret exactly 0 under Yosys's naming (SWC picked the routed-best point, d = -random), which a fresh
naming can break: the routed-best point and random routing's regret are both naming-dependent.

Design: identical to milestone 166 (experiments/naming_shifters/run.py), only the designs and seeds change. The 12 decided
designs with a shift-amount gate depth of 32 or more in milestone 165's designs.json, ordered by gate depth, then name:
max3b5 (124, 33), sat1b9 (124, 35), max3b6 (124, 36), pmul4 (125, 36), cmp48 (133, 40), sat2b5 (124, 41), fib12 (133, 51),
fib14 (133, 58), lzcnorm128 (120, 98), chainsh8 (122, 104), mul2w (123, 159), mul3n (123, 166). Arm Y is each design's own
milestone table as committed (120 sequences, two clocks, 40% utilisation, tt_025C_1v80 from ORFS e5cc6e79). Per sequence ok in
arm Y, Yosys 0.70 (/nix/store/dzsihg5w..., build A's) maps the netlist again exactly as flow.run_point, and two random renamings
R2 and R3 (milestone 161's variant(); seeds "m167R2" / "m167R3" + design + sequence index) are placed and routed at both clocks
by OpenROAD 26Q3 p9p47153, each checked to be the same circuit first. Rung costs stay arm Y's, so the ladder's branch and budget
are the same in every arm; only milestone 162's OUTCOME fields change. A3 = per point and stage, geometric mean of area and of
delay over Y, R2, R3 (a point any naming failed is failed in A3).
Cells and d: each source milestone's own blind cells (new_families nf.build, tie-break seed "m<milestone>blind" + clock +
design), SWC = nf.swc (theta 3, alpha 1.25), random = equal-cost random routing; d = mean over the two clocks of SWC % -
random %. Classes: tau = 4, win d <= -4, loss d >= +4, tie otherwise.
Controls: (a) sequence indices 0 to 2: Yosys's own netlist re-placed ("orig") reproduces arm Y on every OUTCOME field; (b) rung 1
equals arm Y on every point ok in both; (c) arm Y's d reproduces milestone 165's designs.json d to 0.01 on all 12 (run before
this commit, on committed tables only).
Order and stop: as above, all sequences of one design before the next; stop at --minutes, resumable; the analysed set is the
longest prefix of the order complete in R2 and R3.

Predictions, written here and committed before the flow first runs (D12 = the analysed designs; with fewer than 12 complete,
the counts scale by len(D12)/12, rounded down, and (3) by the number of arm-Y wins analysed / 11). Disclosed: arm Y's d is known
(milestone 165), control (c) was run before this commit, milestone 166's results on the other side are known; the tools were
fetched by hash and no R2 or R3 number exists for any design of D12.
 (1) PRIMARY: the decided designs above the cut keep their sign under averaging: sign(d(A3)) = sign(d(Y)) on at least 10 of 12.
     Prior 80%.
 (2) they stay decided: |d(A3)| >= 4 with the sign of d(Y) on at least 8 of 12. Prior 60%.
 (3) the guard's wins are properties of the designs: of the 11 arm-Y wins, at least 8 have d(A3) <= -4. Prior 60%.
 (4) pmul4 stays a loss: d(A3) >= 4. Prior 80%.
 (5) one whole-table naming moves these designs' edge about as much as milestone 166's: median over D12 and j in {R2, R3} of
     |d(Rj) - d(Y)| at most 4 points. Prior 65%.
 (6) above the cut the rule survives: two-sided sign test of decided wins against decided losses under A3 has p < 0.05.
     Prior 60%.
 (7) SWC's zero regret is not a naming accident: over the 11 arm-Y wins, mean SWC % under A3 at most 2. Prior 55%.
Reported, not predicted: per-design table (d, SWC %, random % per arm, class per arm); mean |d(R2) - d(R3)|; spread of d;
failures; the controls; and, combined with milestone 166's designs.json (the 13 below the cut, A3), the 25 decided blind designs
under A3: wins and losses on each side of 32 and the number misplaced by each cut from 19 to 40.
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
# design: (milestone, experiment), milestone 165's decided designs with gate depth >= 32, by depth then name
D13 = {"max3b5": (124, "amount_place"), "sat1b9": (124, "amount_place"), "max3b6": (124, "amount_place"),
       "pmul4": (125, "amount_lanes"), "cmp48": (133, "ladder_blind"), "sat2b5": (124, "amount_place"),
       "fib12": (133, "ladder_blind"), "fib14": (133, "ladder_blind"), "lzcnorm128": (120, "shift_power"),
       "chainsh8": (122, "amount_threshold"), "mul2w": (123, "amount_cut"), "mul3n": (123, "amount_cut")}
ORDER = list(D13)


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


NL = _load(EXP / "naming_ladder" / "run.py", "vdse_m167_nl")
M161, M160, OUTCOME = NL.M161, NL.M160, NL.OUTCOME
YOSYS = M160.YOSYS["0.70"]
ORB = M160.OPENROAD["p9p4"]


def designs():
    """flow.DESIGNS entries of D13, from each source milestone's run.py."""
    out = {}
    for e in sorted({e for _, e in D13.values()}):
        mod = _load(EXP / e / "run.py", f"vdse_m167_src_{e}")
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
    texts = {v: M161.variant(text, "R", f"m167{v}{design}{i}") for v in NEW}
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
        NF = _load(EXP / "new_families" / "analyse.py", "vdse_m167_nf")
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


def d_of(design, rs, parts=False):
    """Milestone <m>'s blind cells of this design on rows rs; d = mean over clocks of SWC - random (points)."""
    m, e = D13[design]
    raw = {}
    for r in rs:
        if r["status"] == "ok":
            raw.setdefault((r["tag"], r["design"], e), []).append(r)
    cells = nf().build(raw, lambda k: f"m{m}blind{k[0]}{k[1]}")
    d = statistics.mean(nf().swc(c) - c["rand"] for c in cells)
    if parts:
        return d, statistics.mean(nf().swc(c) for c in cells), statistics.mean(c["rand"] for c in cells)
    return d, len(cells)


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
    idx = {tuple(s): i for i, s in enumerate(NL.sequences())}
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
    dd, sw, ra = {}, {}, {}
    for d in D:
        T = arm_rows(d, by)
        dd[d], sw[d], ra[d] = {}, {}, {}
        for a in ARMS:
            dd[d][a], sw[d][a], ra[d][a] = d_of(d, T[a], parts=True)
    cy = all(abs(dd[x]["Y"] - ref[x]["d"]) < 0.01 for x in D)
    sc = len(D) / 12
    sgn = lambda v: (v > 0) - (v < 0)  # noqa: E731
    keep = sum(sgn(dd[x]["A3"]) == sgn(dd[x]["Y"]) for x in D)
    dec = sum(abs(dd[x]["A3"]) >= TAU and sgn(dd[x]["A3"]) == sgn(dd[x]["Y"]) for x in D)
    W_ = [x for x in D if cls(dd[x]["Y"]) == "win"]
    wk = sum(dd[x]["A3"] <= -TAU for x in W_)
    p4 = dd["pmul4"]["A3"] >= TAU if "pmul4" in dd else None
    mv = [abs(dd[x][v] - dd[x]["Y"]) for x in D for v in NEW]
    wa = sum(cls(dd[x]["A3"]) == "win" for x in D)
    la = sum(cls(dd[x]["A3"]) == "loss" for x in D)
    p6 = sign_p(wa, la)
    s7 = statistics.mean(sw[x]["A3"] for x in W_) if W_ else float("nan")
    held = [keep >= math.floor(10 * sc), dec >= math.floor(8 * sc), wk >= math.floor(8 * len(W_) / 11),
            p4, statistics.median(mv) <= 4, p6 < 0.05, s7 <= 2]
    hv = lambda i: "not reached" if held[i] is None else "held" if held[i] else "refuted"  # noqa: E731
    L = ["# Milestone 167: two more namings of the 12 decided shifter designs at 32 gates or more (flow run)", "",
         "Yosys 0.70 (dzsihg5w), OpenROAD 26Q3 (p9p4), tt_025C_1v80, 40% utilisation; Y = each design's own milestone table; "
         "R2, R3 = fresh random renamings; A3 = geometric mean of the three; cells and tie-break seeds as each source milestone",
         f"analysed designs (longest complete prefix of the order): {len(D)} of 12: {', '.join(D)}",
         f"control (a) (orig netlist re-placed reproduces arm Y on every OUTCOME field): {ca} of {can}",
         f"control (b) (rung 1 equals arm Y): {cb} of {cbn} runs",
         f"control (c) (arm Y's d reproduces milestone 165 to 0.01): {cy}", "",
         "design | milestone | gate depth | d Y | d R2 | d R3 | d A3 | SWC % Y R2 R3 A3 | random % Y R2 R3 A3 | class Y R2 R3 A3 | spread of d"]
    for x in D:
        f = dd[x]
        sp = max(f[a] for a in ("Y",) + NEW) - min(f[a] for a in ("Y",) + NEW)
        L.append(f"{x} | {D13[x][0]} | {ref[x]['depth']} | {f['Y']:+.2f} | {f['R2']:+.2f} | {f['R3']:+.2f} | {f['A3']:+.2f} | "
                 + " ".join(f"{sw[x][a]:.2f}" for a in ARMS) + " | " + " ".join(f"{ra[x][a]:.2f}" for a in ARMS) + " | "
                 + " ".join(cls(f[a]) for a in ARMS) + f" | {sp:.2f}")
    L += ["", "## Predictions", "",
          f"(1) PRIMARY: sign(d(A3)) = sign(d(Y)) on {keep} of {len(D)} (needed >= {math.floor(10 * sc)}): {hv(0)}",
          f"(2) |d(A3)| >= 4 with Y's sign on {dec} of {len(D)} (needed >= {math.floor(8 * sc)}): {hv(1)}",
          f"(3) arm-Y wins with d(A3) <= -4: {wk} of {len(W_)} (needed >= {math.floor(8 * len(W_) / 11)}; "
          f"{', '.join(x for x in W_ if dd[x]['A3'] > -TAU) or 'none'} not): {hv(2)}",
          f"(4) pmul4 d(A3) {dd['pmul4']['A3']:+.2f} (needed >= 4): {hv(3)}" if "pmul4" in dd else "(4) pmul4 not analysed",
          f"(5) median |d(Rj) - d(Y)| {statistics.median(mv):.2f} points (needed <= 4; max {max(mv):.2f}): {hv(4)}",
          f"(6) A3 decided wins / losses {wa} / {la}, sign p = {p6:.4f} (needed < 0.05): {hv(5)}",
          f"(7) mean SWC % under A3 over the {len(W_)} arm-Y wins {s7:.2f} (needed <= 2): {hv(6)}",
          "", "## Reported, not predicted", ""]
    L.append(f"mean |d(R2) - d(R3)| {statistics.mean(abs(dd[x]['R2'] - dd[x]['R3']) for x in D):.2f}; "
             f"mean |d(Rj) - d(Y)| {statistics.mean(mv):.2f}")
    for a in ARMS:
        w = sum(cls(dd[x][a]) == "win" for x in D)
        lo = sum(cls(dd[x][a]) == "loss" for x in D)
        L.append(f"arm {a}: wins {w}, losses {lo}, ties {len(D) - w - lo}, mean d {statistics.mean(dd[x][a] for x in D):+.2f}, "
                 f"sign p {sign_p(w, lo):.4f}, SWC % exactly 0 on {sum(sw[x][a] == 0 for x in D)}")
    fails = sum(r["status"] != "ok" for r in rs if r["design"] in D and r["variant"] in NEW)
    L.append(f"R2 or R3 runs not ok: {fails}")
    # both sides under A3 (milestone 166's designs.json holds the 13 below the cut)
    below = json.loads((EXP / "naming_shifters" / "designs.json").read_text())
    both = {x: (ref[x]["depth"], v["A3"]) for x, v in below.items()}
    both.update({x: (ref[x]["depth"], dd[x]["A3"]) for x in D})
    L += ["", f"## Both sides under A3 ({len(both)} decided blind designs: milestone 166's {len(below)} below 32, these {len(D)})", ""]
    for side, f in (("below 32", lambda g: g < 32), ("32 or more", lambda g: g >= 32)):
        xs = [v for g, v in both.values() if f(g)]
        w = sum(cls(v) == "win" for v in xs)
        lo = sum(cls(v) == "loss" for v in xs)
        L.append(f"{side}: wins {w}, losses {lo}, ties {len(xs) - w - lo}, sign p {sign_p(w, lo):.4f}, mean d {statistics.mean(xs):+.2f}")
    dec_ = [(g, cls(v)) for g, v in both.values() if cls(v) != "tie"]
    mis = {t: sum((c == "win") != (g >= t) for g, c in dec_) for t in range(19, 41)}
    L.append("misplaced decided designs by cut t (wins expected at >= t, losses below): "
             + ", ".join(f"{t}:{m}" for t, m in mis.items()))
    L.append(f"best cuts: {[t for t, m in mis.items() if m == min(mis.values())]} ({min(mis.values())} misplaced of {len(dec_)})")
    Path(dst).write_text("\n".join(L) + "\n")
    (HERE / "designs.json").write_text(json.dumps({x: {"d": dd[x], "swc": sw[x], "random": ra[x]} for x in D}, indent=1,
                                                  sort_keys=True) + "\n")
    print("\n".join(L))
    return {"held": held, "designs": D, "d": dd}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdk", default="/tmp/pdk/orfs/flow/platforms/sky130hd")
    ap.add_argument("--out", default="/tmp/vdse-m167")
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
