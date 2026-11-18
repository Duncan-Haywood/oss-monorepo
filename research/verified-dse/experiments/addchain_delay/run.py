"""Milestone 147: is the clipped ladder's fast-corner weakness about add-chain structure or about a short mapped critical path?
A blind 2 x 2 test at SKY130 HD ff_n40C_1v95 that crosses the amount's structure (ADD, CTRL) with its mapped delay (FAST, SLOW).
Planned and run as milestone 146; a sibling session landed its own milestone 146 on the same question (experiments/delay_split_ff/,
PR #17222) while this flow ran, so this is milestone 147. The seeds keep the 146 they were committed with.

Why: milestone 145 found, blind, that at ff the ladder's (SWC's) edge over equal-cost random routing is 7.3 points smaller on
add-chain shift amounts (permutation p = 0.026), but every ADD design there mapped to a shorter no-wire period (6.9 to 14.8 ns) than
every CTRL design (16.7 to 30.2 ns). That table cannot tell "add chain" from "short mapped path". This milestone makes add chains
slow (long chains, wide operands) and compare/select/divide chains fast (short chains, narrow fields) so the two are crossed.

Fixed here, before any point (baselines included) runs:
  Structure is by the RTL of the amount cone (milestone 145's rule): ADD = a sum of three or more multi-bit terms written as an
  adder chain (csumsh_w, dotsh_w, wsumsh_w, avgsh_w, sadsh_w); CTRL = a compare/select, clamp, divide or modulo chain with no
  multi-operand sum (divsh_w, clampsh_w, rngsh_w, argminsh_w, maxsh_w, modsh_w). The one-bit counters and saturating adds are left
  out as ambiguous, as in milestone 145. (avgsh_w is a three-operand sum, sadsh_w with K = 2 is a sum of two absolute differences,
  and csumsh_w with K = 2 adds two words plus an end-around carry: each sums three or more multi-bit terms.)
  Candidates: the dials below, all 128-bit, none run at ff by milestones 144 or 145 (tests/test_addchain_delay.py checks this).
  Delay band is by each candidate's own ff baseline no-wire period (empty ABC sequence), measured by this script before any
  sequence point: FAST if <= 15.0 ns, SLOW if >= 16.5 ns, and a candidate in neither band is dropped. The bands bracket milestone
  145's gap (ADD at most 14.79 ns, CTRL at least 16.72 ns). A candidate counts in the band it lands in, whatever it was written
  for.
  Cells: (structure, band). Candidates are shuffled with seed 146 within each structure; each cell keeps its first PER_CELL = 5 in
  that order (fewer if fewer land there, reported). Clock: within each cell, in that order, tight, relaxed, tight, ... (target =
  own baseline x 1.0 or 1.5, milestones 24, 28 and 143 to 145). Run order: the four cells interleaved, ADD-FAST, ADD-SLOW,
  CTRL-FAST, CTRL-SLOW, ADD-FAST, ...; if the flow stops for time the analysed set is the longest prefix of that order whose
  designs are all complete.
  Milestone 108's 120 fresh ABC sequences (seed 108). Random routing's tie-break seed "m146ffd".

Tool versions: OpenROAD 26Q3 and the Yosys nixpkgs ships (milestone 145: 0.71), recorded in meta.json. Liberty:
sky130_fd_sc_hd__ff_n40C_1v95.lib, the file milestone 144 pinned (same sha256).

Usage: python experiments/addchain_delay/run.py --openroad <bin> --lib /tmp/ff.lib [--pdk <sky130hd dir>] [--jobs 4] [--resume]
"""
import argparse
import hashlib
import importlib.util
import json
import random
import sys
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
sys.path.insert(0, str(EXP.parent / "src"))
from verified_dse import flow  # noqa: E402


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


M145 = _load(EXP / "addchain_ff" / "run.py", "vdse_m147_r145")
SHA256, CORNER = M145.SHA256, M145.CORNER
FAST_MAX, SLOW_MIN, PER_CELL = 15.0, 16.5, 5
B = {"W": 128, "SW": 7}

# Candidates written to land slow (long chains, wide operands) and fast (short chains, narrow fields); the band is measured.
ADD = {
    "csum14": ("csumsh_w", "csumsh_w", B | {"K": 14}, ""),
    "csum18": ("csumsh_w", "csumsh_w", B | {"K": 18}, ""),
    "wsum6w32": ("wsumsh_w", "wsumsh_w", B | {"OW": 32, "K": 6}, ""),
    "wsum10w32": ("wsumsh_w", "wsumsh_w", B | {"OW": 32, "K": 10}, ""),
    "sad8": ("sadsh_w", "sadsh_w", B | {"K": 8}, ""),
    "sad12": ("sadsh_w", "sadsh_w", B | {"K": 12}, ""),
    "avg32": ("avgsh_w", "avgsh_w", B | {"NB": 32}, ""),
    "dot24r": ("dotsh_w", "dotsh_w", B | {"K": 24, "R": 1}, ""),
    "csum2": ("csumsh_w", "csumsh_w", B | {"K": 2}, ""),
    "csum7": ("csumsh_w", "csumsh_w", B | {"K": 7}, ""),
    "wsum3": ("wsumsh_w", "wsumsh_w", B | {"OW": 12, "K": 3}, ""),
    "sad2": ("sadsh_w", "sadsh_w", B | {"K": 2}, ""),
    "sad4": ("sadsh_w", "sadsh_w", B | {"K": 4}, ""),
    "avg8": ("avgsh_w", "avgsh_w", B | {"NB": 8}, ""),
    "dot3r": ("dotsh_w", "dotsh_w", B | {"K": 3, "R": 1}, ""),
    "dot7r": ("dotsh_w", "dotsh_w", B | {"K": 7, "R": 1}, ""),
}
CTRL = {
    "div13r": ("divsh_w", "divsh_w", B | {"NA": 13, "NB": 4, "R": 1}, ""),
    "clamp7r": ("clampsh_w", "clampsh_w", B | {"K": 7, "NB": 8, "R": 1}, ""),
    "clamp10r": ("clampsh_w", "clampsh_w", B | {"K": 10, "NB": 8, "R": 1}, ""),
    "rng14r": ("rngsh_w", "rngsh_w", B | {"N": 14, "NB": 8, "R": 1}, ""),
    "max8": ("maxsh_w", "maxsh_w", B | {"N": 8}, ""),
    "max14": ("maxsh_w", "maxsh_w", B | {"N": 14}, ""),
    "amin14": ("argminsh_w", "argminsh_w", B | {"N": 14, "NB": 6}, ""),
    "mod12": ("modsh_w", "modsh_w", B | {"NA": 12, "M": 97}, ""),
    "rng2r": ("rngsh_w", "rngsh_w", B | {"N": 2, "NB": 8, "R": 1}, ""),
    "rng3r": ("rngsh_w", "rngsh_w", B | {"N": 3, "NB": 8, "R": 1}, ""),
    "max2": ("maxsh_w", "maxsh_w", B | {"N": 2}, ""),
    "max3": ("maxsh_w", "maxsh_w", B | {"N": 3}, ""),
    "max4": ("maxsh_w", "maxsh_w", B | {"N": 4}, ""),
    "amin3": ("argminsh_w", "argminsh_w", B | {"N": 3, "NB": 6}, ""),
    "clamp1r": ("clampsh_w", "clampsh_w", B | {"K": 1, "NB": 8, "R": 1}, ""),
    "div5r": ("divsh_w", "divsh_w", B | {"NA": 5, "NB": 4, "R": 1}, ""),
    "mod8": ("modsh_w", "modsh_w", B | {"NA": 8, "M": 97}, ""),
}
# Batch 2, fixed after the baselines above and before any sequence point had a result (commit after 9ca6ae294): the rule left
# ADD-SLOW with 2 designs and CTRL-FAST with 4, because wide-operand sums map fast (only the top SW bits of the sum reach the
# shifter, so ABC prunes the low carries). Batch 2 candidates are measured and banded by the same rule and fill only those two cells
# to PER_CELL, in a seed-1462 shuffle; they are run after batch 1 and analysed as a labelled secondary (the primary stays batch 1).
ADD2 = {f"csum{k}": ("csumsh_w", "csumsh_w", B | {"K": k}, "") for k in (12, 16, 20, 24)} | {
    "sad16": ("sadsh_w", "sadsh_w", B | {"K": 16}, ""),
    "sad20": ("sadsh_w", "sadsh_w", B | {"K": 20}, ""),
}
CTRL2 = {
    "amin2": ("argminsh_w", "argminsh_w", B | {"N": 2, "NB": 6}, ""),
    "amin4": ("argminsh_w", "argminsh_w", B | {"N": 4, "NB": 6}, ""),
    "rng2n4": ("rngsh_w", "rngsh_w", B | {"N": 2, "NB": 4, "R": 1}, ""),
}
CANDIDATES = ADD | CTRL | ADD2 | CTRL2
STRUCT = {d: "ADD" for d in ADD | ADD2} | {d: "CTRL" for d in CTRL | CTRL2}
_a, _c = list(ADD), list(CTRL)
random.Random(146).shuffle(_a)
random.Random(146).shuffle(_c)
SHUFFLED = {"ADD": _a, "CTRL": _c}
CELLS = [("ADD", "FAST"), ("ADD", "SLOW"), ("CTRL", "FAST"), ("CTRL", "SLOW")]
FACTORS = {"tight": 1.0, "relaxed": 1.5}
TABLE = HERE / "results.jsonl"
META = HERE / "meta.json"


def band(period):
    if period is None:
        return None
    return "FAST" if period <= FAST_MAX else "SLOW" if period >= SLOW_MIN else None


def select(base):
    """From candidate baselines (design -> ns or None): cell members, clocks and the interleaved run order. Depends on no result."""
    cells = {c: [d for d in SHUFFLED[c[0]] if band(base.get(d)) == c[1]][:PER_CELL] for c in CELLS}
    clock = {d: ("tight", "relaxed")[i % 2] for c in CELLS for i, d in enumerate(cells[c])}
    order = [cells[c][i] for i in range(PER_CELL) for c in CELLS if i < len(cells[c])]
    return cells, clock, order


_a2, _c2 = list(ADD2), list(CTRL2)
random.Random(1462).shuffle(_a2)
random.Random(1462).shuffle(_c2)
SHUFFLED2 = {"ADD": _a2, "CTRL": _c2}


def select2(cells, base2):
    """Batch 2: top up each batch-1 cell short of PER_CELL with batch-2 candidates that land in its band, in SHUFFLED2 order;
    clocks continue each cell's alternation. Returns the added designs per cell, their clocks and their interleaved order."""
    add = {}
    for c in CELLS:
        room = PER_CELL - len(cells[c])
        add[c] = [d for d in SHUFFLED2[c[0]] if band(base2.get(d)) == c[1]][:room]
    clock = {d: ("tight", "relaxed")[(len(cells[c]) + i) % 2] for c in CELLS for i, d in enumerate(add[c])}
    order = [add[c][i] for i in range(PER_CELL) for c in CELLS if i < len(add[c])]
    return add, clock, order


def complete(rows, order, n=120):
    cnt = {}
    for r in rows:
        cnt[r["design"]] = cnt.get(r["design"], 0) + 1
    out = []
    for d in order:
        if cnt.get(d, 0) < n:
            break
        out.append(d)
    return out


def install():
    flow.DESIGNS.clear()
    flow.DESIGNS.update(CANDIDATES)


def task(a):
    """milestone 145's task, with this milestone's design table (its own install() would swap in milestone 145's)."""
    design, seq, tag, period, wd, lib, pdk, orb = a
    if design not in CANDIDATES or flow.DESIGNS.get(design) != CANDIDATES[design]:
        install()
    try:
        r = flow.run_point(design, seq, period, wd, lib, pdk, orb)
        r["status"] = "ok"
    except RuntimeError as e:
        r = {"design": design, "seq": list(seq), "period_ns": period, "status": "fail", "error": str(e)[-200:]}
    r["tag"] = tag
    r["corner"] = CORNER
    return r


def base_task(a):
    """milestone 145's baseline (empty sequence, no-wire period), with this milestone's design table."""
    d, wd, lib, pdk, orb = a
    install()
    log = Path(wd) / "openroad.log"
    sp = M145.M144.synth_period
    if log.exists() and sp(log.read_text()) is not None:
        return d, sp(log.read_text())
    try:
        return d, flow.run_point(d, (), 10.0, wd, lib, pdk, orb)["synth_netlist_period_ns"]
    except RuntimeError:
        return d, sp(log.read_text()) if log.exists() else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--openroad", required=True)
    ap.add_argument("--lib", required=True, help="sky130_fd_sc_hd__ff_n40C_1v95.lib")
    ap.add_argument("--pdk", default="/tmp/pdk/orfs/flow/platforms/sky130hd")
    ap.add_argument("--out", default="/tmp/verified-dse-addchain-delay")
    ap.add_argument("--n", type=int, default=120)
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--baselines-only", action="store_true")
    ap.add_argument("--batch2", action="store_true", help="measure batch 2, top up the short cells, run their points")
    ap.add_argument("--resume", action="store_true", help="skip points already in results.jsonl, append the rest")
    a = ap.parse_args()
    if flow.UTIL != 40:
        sys.exit(f"unset VDSE_UTIL (flow.UTIL is {flow.UTIL}; this milestone is at 40%)")
    if hashlib.sha256(Path(a.lib).read_bytes()).hexdigest() != SHA256:
        sys.exit(f"{a.lib} is not the ff_n40C_1v95 liberty milestone 144 pinned")
    install()
    out, pdk = Path(a.out), Path(a.pdk)
    out.mkdir(parents=True, exist_ok=True)
    lib = out / "lib.lib"
    flow.filtered_liberty(Path(a.lib), lib)
    seqs = M145.M144.M141.R138.fresh_sequences(a.n)
    if META.exists():
        meta = json.loads(META.read_text())
        base = meta["base_period_ns"]
    else:
        with Pool(a.jobs) as pool:
            base = dict(pool.map(base_task, [(d, out / d / "base", lib, pdk, a.openroad) for d in CANDIDATES]))
        cells, clock, order = select(base)
        meta = {"corner": CORNER, "util": 40, "liberty_sha256": SHA256, "tools": M145.tool_versions(a.openroad),
                "base_period_ns": {d: base[d] for d in CANDIDATES}, "band": {d: band(base[d]) for d in CANDIDATES},
                "cells": {f"{s}-{b}": cells[(s, b)] for s, b in CELLS}, "clock": clock, "order": order,
                "struct": {d: STRUCT[d] for d in order}, "n_sequences": len(seqs), "seed": 108, "order_seed": 146,
                "designs": {d: CANDIDATES[d] for d in order}}
        META.write_text(json.dumps(meta, indent=1))
    print(json.dumps({k: meta[k] for k in ("cells", "base_period_ns")}, indent=1), flush=True)
    if a.baselines_only:
        return
    clock, order = meta["clock"], meta["order"]
    if a.batch2:
        if "batch2" not in meta:
            with Pool(a.jobs) as pool:
                base2 = dict(pool.map(base_task, [(d, out / d / "base", lib, pdk, a.openroad) for d in ADD2 | CTRL2]))
            cells = {c: meta["cells"][f"{c[0]}-{c[1]}"] for c in CELLS}
            add, clock2, order2 = select2(cells, base2)
            meta["batch2"] = {"base_period_ns": base2, "band": {d: band(base2[d]) for d in base2},
                              "cells": {f"{s}-{b}": add[(s, b)] for s, b in CELLS}, "clock": clock2, "order": order2,
                              "designs": {d: CANDIDATES[d] for d in order2}}
            META.write_text(json.dumps(meta, indent=1))
        print(json.dumps(meta["batch2"], indent=1), flush=True)
        base = base | meta["batch2"]["base_period_ns"]
        clock, order = meta["batch2"]["clock"], meta["batch2"]["order"]
        a.resume = True
    tasks = [(d, s, clock[d], round(base[d] * FACTORS[clock[d]], 3), out / d / f"{clock[d]}_{i}", lib, pdk, a.openroad)
             for d in order for i, s in enumerate(seqs)]
    if a.resume and TABLE.exists():
        done = {(r["design"], r["tag"], tuple(r["seq"])) for r in map(json.loads, TABLE.read_text().splitlines())}
        tasks = [t for t in tasks if (t[0], t[2], tuple(t[1])) not in done]
    print(f"{len(tasks)} points to run", flush=True)
    with Pool(a.jobs) as pool, open(TABLE, "a" if a.resume else "w") as fh:
        for i, r in enumerate(pool.imap_unordered(task, tasks, chunksize=1)):
            fh.write(json.dumps(r) + "\n")
            fh.flush()
            if i % 50 == 0:
                print(i, len(tasks), flush=True)


if __name__ == "__main__":
    main()
