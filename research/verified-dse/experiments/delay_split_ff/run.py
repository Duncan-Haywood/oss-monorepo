"""Milestone 146: is the ladder's smaller fast-corner edge on add chains about the add-chain structure or about a short mapped
critical path? Milestone 145 found, blind, that at SKY130 HD ff_n40C_1v95 the clipped ladder's (SWC's) edge over equal-cost random
routing was 7.3 points smaller on add-chain shift amounts than on compare/select/divide amounts (permutation p = 0.026), but every
add-chain design there mapped to a shorter no-wire period (6.9 to 14.8 ns) than every control design (16.7 to 30.2 ns), so the two
readings could not be told apart. This milestone runs the two missing cells of the 2 x 2: add chains made slow and control chains
made fast, on designs no table has run at ff.

Groups (fixed here, before any point runs; the classification is by the RTL of the amount cone, as in milestone 145):
  ADDS (add chain, slow): candidates are long or wide add chains, csumsh_w (ones'-complement chain), sadsh_w (sum of absolute
       differences), wsumsh_w (K-term OW-bit sum) and dotsh_w (sum of 3x3-bit products).
  CTRLF (control, fast): candidates are short compare, select, clamp, divide or modulo chains, maxsh_w, rngsh_w, argminsh_w,
       clampsh_w, divsh_w and modsh_w.
Eligibility (fixed here; it depends on each design's ff baseline, the empty-ABC-sequence no-wire period that sets its clock, not on
any sequence result): an ADDS candidate is eligible when its base period is at least 16.7 ns (milestone 145's fastest control design)
and a CTRLF candidate when it is at most 14.8 ns (milestone 145's slowest add-chain design). Each pool is shuffled with seed 146; the
analysed designs of a group are the first 10 eligible candidates in that order (all of them if fewer than 10 are eligible).
Clock: within each group, in selected order, tight, relaxed, tight, ...; target = own ff baseline times 1.0 or 1.5. Run order: the
two selected lists interleaved ADDS, CTRLF, ADDS, ...; the analysed set is the longest prefix of the order whose designs are all
complete (`complete()`). Milestone 108's 120 fresh ABC sequences (seed 108). All designs 128-bit (SW = 7).

Tool versions: OpenROAD 26Q3 and Yosys 0.71 from the nixpkgs cache, as milestone 145. Liberty: sky130_fd_sc_hd__ff_n40C_1v95.lib,
the file milestones 144 and 145 pinned (same sha256), fetched with
  curl -sSL -o /tmp/ff.lib https://raw.githubusercontent.com/efabless/skywater-pdk-libs-sky130_fd_sc_hd/master/timing/sky130_fd_sc_hd__ff_n40C_1v95.lib

Usage: python experiments/delay_split_ff/run.py --openroad <bin> --lib /tmp/ff.lib [--pdk <sky130hd dir>] [--jobs 4] [--resume]
       (the first call runs the 28 baselines, writes meta.json with the selection, then runs the sequences)
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

CORNER = "ff_n40C_1v95"
SLOW_MIN, FAST_MAX, PER_GROUP = 16.7, 14.8, 10


def _w(m, **p):
    return (m, m, {"W": 128, "SW": 7} | p, "")


ADDS_POOL = {
    "csum14": _w("csumsh_w", K=14), "csum18": _w("csumsh_w", K=18), "csum24": _w("csumsh_w", K=24),
    "csum32": _w("csumsh_w", K=32), "csum40": _w("csumsh_w", K=40),
    "sad8": _w("sadsh_w", K=8), "sad12": _w("sadsh_w", K=12), "sad16": _w("sadsh_w", K=16), "sad20": _w("sadsh_w", K=20),
    "wsum10w16": _w("wsumsh_w", OW=16, K=10), "wsum14w20": _w("wsumsh_w", OW=20, K=14),
    "wsum20w24": _w("wsumsh_w", OW=24, K=20), "wsum8w32": _w("wsumsh_w", OW=32, K=8),
    "dot20r": _w("dotsh_w", K=20, R=1),
}
CTRLF_POOL = {
    "max2": _w("maxsh_w", N=2), "max3": _w("maxsh_w", N=3), "max4": _w("maxsh_w", N=4), "max5": _w("maxsh_w", N=5),
    "rng2r": _w("rngsh_w", N=2, NB=8, R=1), "rng3r": _w("rngsh_w", N=3, NB=8, R=1),
    "amin3": _w("argminsh_w", N=3, NB=6), "amin4": _w("argminsh_w", N=4, NB=6), "amin5": _w("argminsh_w", N=5, NB=6),
    "amin6": _w("argminsh_w", N=6, NB=6),
    "clamp1r": _w("clampsh_w", K=1, NB=8, R=1), "div4r": _w("divsh_w", NA=4, NB=4, R=1), "div5r": _w("divsh_w", NA=5, NB=4, R=1),
    "mod8": _w("modsh_w", NA=8, M=97),
}
POOL = ADDS_POOL | CTRLF_POOL
_a, _c = list(ADDS_POOL), list(CTRLF_POOL)
random.Random(146).shuffle(_a)
random.Random(146).shuffle(_c)
CANDIDATES = {"ADDS": _a, "CTRLF": _c}
FACTORS = {"tight": 1.0, "relaxed": 1.5}
TABLE = HERE / "results.jsonl"
META = HERE / "meta.json"


def select(base):
    """The fixed selection rule: per group, the first PER_GROUP eligible candidates in seed-146 order; then the run order and the
    clocks. base maps candidate -> ff base period (None when the baseline failed, which makes a candidate ineligible)."""
    ok = {"ADDS": lambda p: p is not None and p >= SLOW_MIN, "CTRLF": lambda p: p is not None and p <= FAST_MAX}
    sel = {g: [d for d in CANDIDATES[g] if ok[g](base.get(d))][:PER_GROUP] for g in CANDIDATES}
    order = [d for pair in zip(sel["ADDS"], sel["CTRLF"]) for d in pair]
    n = min(len(sel["ADDS"]), len(sel["CTRLF"]))
    order += sel["ADDS"][n:] + sel["CTRLF"][n:]
    clock = {d: ("tight", "relaxed")[i % 2] for g in sel for i, d in enumerate(sel[g])}
    group = {d: g for g in sel for d in sel[g]}
    return order, clock, group


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


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


M145 = _load(EXP / "addchain_ff" / "run.py", "vdse_m146_r145")


def install():
    flow.DESIGNS.clear()
    flow.DESIGNS.update(POOL)


def task(a):
    design, seq, tag, period, wd, lib, pdk, orb = a
    if design not in flow.DESIGNS:
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
    install()
    return M145.base_task(a)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--openroad", required=True)
    ap.add_argument("--lib", required=True, help="sky130_fd_sc_hd__ff_n40C_1v95.lib")
    ap.add_argument("--pdk", default="/tmp/pdk/orfs/flow/platforms/sky130hd")
    ap.add_argument("--out", default="/tmp/verified-dse-delay-split-ff")
    ap.add_argument("--n", type=int, default=120)
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--base-only", action="store_true", help="run the baselines, write meta.json and stop")
    ap.add_argument("--resume", action="store_true", help="skip points already in results.jsonl, append the rest")
    a = ap.parse_args()
    if flow.UTIL != 40:
        sys.exit(f"unset VDSE_UTIL (flow.UTIL is {flow.UTIL}; this milestone is at 40%)")
    if hashlib.sha256(Path(a.lib).read_bytes()).hexdigest() != M145.SHA256:
        sys.exit(f"{a.lib} is not the ff_n40C_1v95 liberty milestones 144 and 145 pinned")
    install()
    out, pdk = Path(a.out), Path(a.pdk)
    out.mkdir(parents=True, exist_ok=True)
    lib = out / "lib.lib"
    flow.filtered_liberty(Path(a.lib), lib)
    seqs = M145.M144.M141.R138.fresh_sequences(a.n)
    if META.exists():
        meta = json.loads(META.read_text())
    else:
        cands = _a + _c
        with Pool(a.jobs) as pool:
            base = dict(pool.map(base_task, [(d, out / d / "base", lib, pdk, a.openroad) for d in cands]))
        order, clock, group = select(base)
        meta = {"corner": CORNER, "util": 40, "liberty_sha256": M145.SHA256, "tools": M145.tool_versions(a.openroad),
                "candidate_base_period_ns": {d: base[d] for d in cands}, "order": order, "clock": clock, "group": group,
                "base_period_ns": {d: base[d] for d in order}, "n_sequences": len(seqs), "seed": 108, "select_seed": 146,
                "designs": {d: POOL[d] for d in order}}
        META.write_text(json.dumps(meta, indent=1))
    print(json.dumps({g: [d for d in meta["order"] if meta["group"][d] == g] for g in ("ADDS", "CTRLF")}), flush=True)
    if a.base_only:
        return
    base, clock = meta["base_period_ns"], meta["clock"]
    tasks = [(d, s, clock[d], round(base[d] * FACTORS[clock[d]], 3), out / d / f"{clock[d]}_{i}", lib, pdk, a.openroad)
             for d in meta["order"] for i, s in enumerate(seqs)]
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
