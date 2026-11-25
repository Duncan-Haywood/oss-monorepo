"""Milestone 164: do two more random namings resolve the near-zero designs, and does averaging namings shrink the noise as 1/sqrt(k)? (flow run)

Usage: python experiments/naming_more/run.py --lib /tmp/ss.lib [--pdk <sky130hd dir>] [--jobs 4] [--minutes 110] [--resume]
       python experiments/naming_more/run.py --analyse [--draws 200] [--jobs 4]   # results.txt from results.jsonl, no flow

Why: milestone 163's "Next". Per-point naming draws over milestone 162's three namings (Y = Yosys's, C = canonical, R = random)
gave each design's edge d = SWC(1.25) - equal-cost random regret a naming sd of about 1 point, and an extrapolation (k averaged
namings shrink that sd as 1/sqrt(k)) said one naming resolves the sign of d at 95% on 22 of 27 designs, while gtc12r and dot6r
would need 132 and 18. Both rest on three namings, two of them constructed. Here the six designs with |d(A3)| < 3 points get two
fresh random namings each, so (a) the noise model of milestone 163 meets namings it did not see, (b) those designs' d is
averaged over five namings, and (c) the 1/sqrt(k) law can be checked on k = 1 to 4.

Design: the six designs of milestone 162's table with |d(A3)| < 3 (gtc24r -0.42, dot6r -0.58, gtc12r -0.89, clamp2r +0.89,
dot4l -2.08, div12l -2.98), chosen by that rule before this commit. Per point (all 120 sequences of milestone 108), Yosys 0.71
(mlbh) maps the netlist again exactly as milestone 162, and two random renamings R2 and R3 (milestone 161's variant(), every
internal net and instance renamed, order kept; seeds "m164R2" / "m164R3" + design + sequence index) are placed and routed by
OpenROAD 26Q3 (p9p4) with the ss_100C_1v60 liberty (sha256 9b24f0db), 40% utilisation, each design's clock and period. Every
renaming is checked to be the same circuit (milestone 160's name-free fingerprint) before it runs. As in milestone 162 only
outcomes change between arms: a R2 or R3 row is build B's row with the OpenROAD outcome fields replaced, rung costs stay build
B's, the cells are experiments/util65_blind cells() (SWC, theta = 3, alpha = 1.25) with tie-break seed m162.
Arms: Y, C, R (milestone 162's), R2, R3, A3 (milestone 162's three-naming average), A5 (per point and stage, geometric mean of
area and of delay over the five namings; a point any naming failed stays failed in A5, as in A3).
Quantities (D6 = the six designs; s163_x = sd of d over milestone 163's 200 per-point draws, from naming_draws/draws.json):
  s5_x: sd of d over 200 per-point draws in which each point takes one ok naming of the five uniformly (seed "164-k").
  s(k)_x for k = 1..4: sd of d over 200 draws in which each point averages (A3's geometric mean) k of its ok namings drawn
      without replacement (seed "164k<k>-<j>"). With five namings sampled without replacement, independent per-point noise
      averaged linearly gives var(k) proportional to (5 - k) / (4 k), so s(1)/s(3) = sqrt(6) = 2.45 under the law.
Control: rung 1 and the mapped rung (r1_cells, r1_depth, synth_netlist_area, synth_netlist_wns) equal build B's row on every
point ok in both (milestone 162b found 2,774 of 2,777, the rest 0.01 ns printing differences in mapped WNS); and arm A3's d on
D6 reproduces milestone 162's to 0.01 points.
Stop: the flow runs the six designs in the order above, all 120 sequences of one before the next, until it finishes or at
--minutes; the analysed set is the longest complete prefix of that order (a rule that depends on no result).

Predictions, written here and committed before the flow first runs (disclosed: milestone 162's d under Y, C, R, A3 and milestone
163's per-design draws are known for these designs; no R2 or R3 run exists; the tools were fetched and the liberty hash checked,
no OpenROAD run was made for this milestone before this commit):
 (1) PRIMARY: milestone 163's noise model holds for fresh namings: of the fresh whole-table values d(R2), d(R3) on D6, at least
     10 of 12 lie within 2 s163_x of d(A3). Prior 60%.
 (2) the per-point noise is the same measured on five namings: median over D6 of s5_x / s163_x is between 0.67 and 1.5. Prior 70%.
 (3) these are ties: |d(A5)| < 3 points on all of D6. Prior 65%.
 (4) two more namings move the average little: mean over D6 of |d(A5) - d(A3)| < 1.0 point. Prior 60%.
 (5) averaging shrinks the noise about as the law says: median over D6 of s(1)_x / s(3)_x between 1.8 and 3.1 (law 2.45). Prior 50%.
Reported, not predicted: per-design table (d per arm, s5, s(k), flip share of the five-naming draws against the sign of d(A5));
namings needed for a 95% sign re-estimated from s5 and d(A5) with the law; mean |d(R2) - d(R3)|; tau-b R2 against R3; failures.
"""
import argparse
import hashlib
import importlib.util
import json
import math
import os
import random
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
SEED = 164
D6 = ["gtc24r", "dot6r", "gtc12r", "clamp2r", "dot4l", "div12l"]
NEW = ("R2", "R3")
FIVE = ("Y", "C", "R", "R2", "R3")
CTRL = ("r1_cells", "r1_depth", "synth_netlist_area", "synth_netlist_wns")


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


NL = _load(EXP / "naming_ladder" / "run.py", "vdse_m164_nl")
M161, M160, OUTCOME = NL.M161, NL.M160, NL.OUTCOME


# ---------------------------------------------------------------- flow
def task(a):
    i, design, seq, per, wd, lib, pdk = a
    os.environ["PATH"] = M160.YOSYS["0.71"] + ":" + os.environ["PATH"]
    if design not in flow.DESIGNS:
        NL.M143.M141.install()
    orb = M160.OPENROAD["p9p4"]
    wd = Path(wd)
    base = {"design": design, "seq": list(seq), "i": i, "period_ns": per}
    try:
        r1, text = NL.mapped(design, seq, wd, lib)
    except RuntimeError as e:
        return [dict(base, variant=v, status="fail", error=str(e)[-200:]) for v in NEW]
    out = []
    for v in NEW:
        t = M161.variant(text, "R", f"m164{v}{design}{i}")
        row = dict(base, variant=v, **r1)
        if not M161.same_circuit(text, t):
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
    if hashlib.sha256(Path(a.lib).read_bytes()).hexdigest() != NL.M143.SHA256:
        sys.exit("not milestone 143's ss liberty")
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    lib = out / "lib.lib"
    flow.filtered_liberty(Path(a.lib), lib)
    seqs = NL.sequences()
    tasks = [(i, d, s, NL.period(d), out / d / str(i), lib, Path(a.pdk)) for d in D6 for i, s in enumerate(seqs)]
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
        have.setdefault((r["design"], r["variant"]), set()).add(r["i"])
    out = []
    for d in D6:
        if any(len(have.get((d, v), ())) < n for v in NEW):
            break
        out.append(d)
    return out


def tables(designs):
    """Arms Y, C, R, A3 from milestone 162; R2, R3 from this table; A5; all aligned on build B's row order."""
    B = NL.b_rows()
    T = NL.arm_tables(designs, B)
    idx = {tuple(s): i for i, s in enumerate(NL.sequences())}
    by = {(r["design"], r["i"], r["variant"]): r for r in rows()}
    for v in NEW:
        T[v] = []
    T["A5"] = []
    for j, y in enumerate(T["Y"]):
        if y["status"] != "ok":
            for v in NEW + ("A5",):
                T[v].append(y)
            continue
        i = idx[tuple(y["seq"])]
        for v in NEW:
            x = by.get((y["design"], i, v))
            T[v].append(dict(y, **{f: x[f] for f in OUTCOME}) if x is not None and x["status"] == "ok" else dict(y, status="fail"))
        five = [T[a][j] for a in FIVE]
        T["A5"].append(NL.average(five) if all(r["status"] == "ok" for r in five) else dict(y, status="fail"))
    return B, T


_S = {}


def _init(designs):
    _S["T"] = tables(designs)[1]
    _S["A158"] = _load(EXP / "tool_build" / "analyse.py", "vdse_m164_a158w")


def d_of(rows_, A158):
    cell = A158.m141.cells(rows_, "naming_ladder", "m162")
    return {x: A158.swc(c) - A158.rand(c) for x, c in cell.items()}


def draw(T, kind, k, j):
    """kind 'one': each point takes one ok naming of the five; kind 'avg': each point averages k of its ok namings."""
    rng = random.Random(f"{SEED}-{j}" if kind == "one" else f"{SEED}k{k}-{j}")
    out = []
    for n in range(len(T["Y"])):
        ok = [a for a in FIVE if T[a][n]["status"] == "ok"]
        if not ok:
            out.append(T["Y"][n])
        elif kind == "one":
            out.append(T[rng.choice(ok)][n])
        else:
            pick = rng.sample(ok, min(k, len(ok)))
            out.append(NL.average([T[a][n] for a in pick]))
    return out


def _work(arg):
    kind, k, j = arg
    return arg, d_of(draw(_S["T"], kind, k, j), _S["A158"])


def analyse(dst, n_draws=200, jobs=4, quiet=False):
    A158 = _load(EXP / "tool_build" / "analyse.py", "vdse_m164_a158")
    designs = complete(rows())
    if not designs:
        sys.exit("no complete design yet")
    B, T = tables(designs)
    fixed = {a: d_of(T[a], A158) for a in FIVE + ("A3", "A5")}
    # controls
    seqs = NL.sequences()
    c1 = c1n = 0
    for r in rows():
        if r["design"] in designs and r["status"] == "ok":
            b = B[(r["design"], tuple(seqs[r["i"]]))]
            if b["status"] == "ok":
                c1n += 1
                c1 += all(r[f] == b[f] for f in CTRL)
    m162 = json.loads((EXP / "naming_draws" / "draws.json").read_text())
    a3_ok = all(abs(fixed["A3"][x] - m162["fixed"]["A3"][x]) < 0.01 for x in designs)
    s163 = {x: statistics.stdev([dr[x] for dr in m162["draws"]]) for x in designs}
    jobs_ = [("one", 1, j) for j in range(n_draws)] + [("avg", k, j) for k in (1, 2, 3, 4) for j in range(n_draws)]
    with Pool(jobs, initializer=_init, initargs=(designs,)) as p:
        got = dict(p.map(_work, jobs_))
    one = [got[("one", 1, j)] for j in range(n_draws)]
    sk = {k: {x: statistics.stdev([got[("avg", k, j)][x] for j in range(n_draws)]) for x in designs} for k in (1, 2, 3, 4)}
    s5 = {x: statistics.stdev([dr[x] for dr in one]) for x in designs}
    sgn = lambda v: (v > 0) - (v < 0)  # noqa: E731
    flip = {x: sum(sgn(dr[x]) != sgn(fixed["A5"][x]) for dr in one) / n_draws for x in designs}
    med, mean = statistics.median, statistics.mean
    band = [(x, v, abs(fixed[v][x] - fixed["A3"][x]) <= 2 * s163[x]) for x in designs for v in NEW]
    nb = sum(b for _, _, b in band)
    r5 = med(s5[x] / s163[x] for x in designs)
    mv = mean(abs(fixed["A5"][x] - fixed["A3"][x]) for x in designs)
    r13 = med(sk[1][x] / sk[3][x] for x in designs)
    held = [nb >= 10 * len(band) / 12, 0.67 <= r5 <= 1.5, all(abs(fixed["A5"][x]) < 3 for x in designs), mv < 1.0,
            1.8 <= r13 <= 3.1]
    hv = lambda i: "held" if held[i] else "refuted"  # noqa: E731

    def need_k(m, s, z=1.96):
        return math.inf if m == 0 else max(1, math.ceil((z * s / abs(m)) ** 2))

    L = ["# Milestone 164: two more random namings on the six near-zero designs (flow run)", "",
         "Yosys 0.71 (mlbh), OpenROAD 26Q3 (p9p4), ss_100C_1v60, 40% utilisation; Y, C, R, A3 = milestone 162's arms; R2, R3 = "
         "fresh random renamings; A5 = geometric mean of the five; tie-break seed m162",
         f"analysed designs (longest complete prefix of the order): {len(designs)} of {len(D6)}: {', '.join(designs)}",
         f"control 1 (rung 1 and mapped rung equal build B's row): {c1} of {c1n} R2/R3 runs",
         f"control 2 (arm A3's d reproduces milestone 162's to 0.01): {a3_ok}", "",
         "design | d Y | d C | d R | d R2 | d R3 | d A3 | d A5 | s163 | s5 | s(1) | s(2) | s(3) | s(4) | flip share vs A5 | "
         "namings for 95% sign (s5, d A5)"]
    for x in designs:
        f = fixed
        L.append(f"{x} | {f['Y'][x]:+.2f} | {f['C'][x]:+.2f} | {f['R'][x]:+.2f} | {f['R2'][x]:+.2f} | {f['R3'][x]:+.2f} | "
                 f"{f['A3'][x]:+.2f} | {f['A5'][x]:+.2f} | {s163[x]:.2f} | {s5[x]:.2f} | {sk[1][x]:.2f} | {sk[2][x]:.2f} | "
                 f"{sk[3][x]:.2f} | {sk[4][x]:.2f} | {flip[x]:.3f} | {need_k(fixed['A5'][x], s5[x])}")
    L += ["", "## Predictions", "",
          f"(1) PRIMARY: fresh d(R2), d(R3) within 2 s163 of d(A3): {nb} of {len(band)} (needed >= {10 * len(band) / 12:.1f}; "
          f"outside: {', '.join(f'{x} {v}' for x, v, b in band if not b) or 'none'}): {hv(0)}",
          f"(2) median s5 / s163 {r5:.2f} (needed 0.67 to 1.5): {hv(1)}",
          f"(3) |d(A5)| < 3 on all: max |d(A5)| {max(abs(fixed['A5'][x]) for x in designs):.2f}: {hv(2)}",
          f"(4) mean |d(A5) - d(A3)| {mv:.2f} (needed < 1.0): {hv(3)}",
          f"(5) median s(1)/s(3) {r13:.2f} (law 2.45; needed 1.8 to 3.1): {hv(4)}",
          "", "## Reported, not predicted", ""]
    for k in (2, 3, 4):
        law = math.sqrt((4 / 4) / ((5 - k) / (4 * k)))
        L.append(f"median s(1)/s({k}) {med(sk[1][x] / sk[k][x] for x in designs):.2f} (law {law:.2f})")
    L.append(f"mean |d(R2) - d(R3)| {mean(abs(fixed['R2'][x] - fixed['R3'][x]) for x in designs):.2f}; mean |d(R2) - d(R)| "
             f"{mean(abs(fixed['R2'][x] - fixed['R'][x]) for x in designs):.2f}")
    tau = {x: A158.m141.compare(x, [r for r in T["R2"] if r["design"] == x], [r for r in T["R3"] if r["design"] == x])[0]
           for x in designs}
    L.append(f"median tau-b R2 against R3 {med(tau.values()):.3f} (range {min(tau.values()):.3f} to {max(tau.values()):.3f})")
    L.append(f"sign of d(A5) equals sign of d(A3) on {sum(sgn(fixed['A5'][x]) == sgn(fixed['A3'][x]) for x in designs)} "
             f"of {len(designs)}")
    fails = sum(r["status"] != "ok" for r in rows() if r["design"] in designs
                and B[(r["design"], tuple(seqs[r["i"]]))]["status"] == "ok")
    L.append(f"R2 or R3 runs failed where build B's row is ok: {fails}")
    Path(dst).write_text("\n".join(L) + "\n")
    (HERE / "draws.json").write_text(json.dumps({"fixed": fixed, "s163": s163, "s5": s5,
                                                 "sk": {str(k): v for k, v in sk.items()}, "flip": flip}, sort_keys=True) + "\n")
    if not quiet:
        print("\n".join(L))
    return {"held": held, "designs": designs, "fixed": fixed, "c1": (c1, c1n), "a3_ok": a3_ok}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--lib")
    ap.add_argument("--pdk", default="/tmp/pdk/orfs/flow/platforms/sky130hd")
    ap.add_argument("--out", default="/tmp/vdse-m164")
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--minutes", type=float, default=110)
    ap.add_argument("--resume", action="store_true")
    ap.add_argument("--analyse", action="store_true")
    ap.add_argument("--draws", type=int, default=200)
    a = ap.parse_args()
    if a.analyse:
        analyse(HERE / "results.txt", a.draws, a.jobs)
    else:
        main_run(a)
