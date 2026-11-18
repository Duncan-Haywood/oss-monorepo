"""Milestone 145: is the clipped ladder's off-tt weakness a property of add-chain shift amounts? A blind test at SKY130 HD
ff_n40C_1v95 on 20 designs no table has run at that corner, 10 whose shift amount is a chain of multi-bit additions and 10 whose
amount is a compare, select or divide chain.

Why: milestone 144 found, post hoc, that at ff the ladder (SWC) lost to equal-cost random routing on all three carry-save adders
(csum) and all three dot products (dot) it analysed, and on one of the other 21 designs (rng8l); at ss (milestone 143) two of the
three csum designs lost and none of the dot ones. A pattern read off the table that suggested it is a hypothesis, not a finding, so
this milestone fixes the grouping before any point runs and tests it on fresh designs.

Groups (fixed here; the classification is by the RTL of the amount cone, not by any result):
  ADD: the amount is the sum of three or more multi-bit terms, written as a chain of adders: csumsh_w (ones'-complement sum),
       dotsh_w (sum of 3x3-bit products), wsumsh_w (K-term sum of OW-bit operands), avgsh_w (three-operand sum), sadsh_w (sum of
       absolute differences). Dials no ff table has run.
  CTRL: the amount is a compare/select, clamp or divide chain with no multi-operand sum: divsh_w, clampsh_w, rngsh_w,
       argminsh_w, maxsh_w, modsh_w. Dials no ff table has run.
  Left out as ambiguous (counters of one-bit terms): gtcntsh_w, eqcntsh_w, pcnsh_w; and satsh_w (saturating adds, a clamp in
  every add).
All designs are 128-bit (SW = 7); right shifters where the module has R. Clock: within each group, in the order listed, tight,
relaxed, tight, ... Clock target: each design's own ff baseline no-wire period (empty ABC sequence) times 1.0 or 1.5, the protocol
of milestones 24, 28, 143 and 144. Milestone 108's 120 fresh ABC sequences (seed 108). Run order: each group shuffled with seed
145, then interleaved ADD, CTRL, ADD, ...; if the flow stops for time, the analysed set is the longest prefix of ORDER whose
designs are all complete (`complete()`), a rule that depends on no result, and the interleave keeps a prefix balanced.

Tool versions: OpenROAD 26Q3 as in milestone 144; nixpkgs now ships Yosys 0.71 (milestone 144 had 0.70), recorded in meta.json.
Liberty: sky130_fd_sc_hd__ff_n40C_1v95.lib, the file milestone 144 pinned (same sha256).

Usage: python experiments/addchain_ff/run.py --openroad <bin> --lib /tmp/ff.lib [--pdk <sky130hd dir>] [--jobs 4] [--resume]
"""
import argparse
import hashlib
import importlib.util
import json
import random
import subprocess
import sys
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
sys.path.insert(0, str(EXP.parent / "src"))
from verified_dse import flow  # noqa: E402

SHA256 = "fb61d91c55a7f85b1989e8149d040b13ba5e7f5478f5bf0c3c16c5da30720139"
CORNER = "ff_n40C_1v95"

ADD = {
    "csum5": ("csumsh_w", "csumsh_w", {"W": 128, "SW": 7, "K": 5}, ""),
    "csum10": ("csumsh_w", "csumsh_w", {"W": 128, "SW": 7, "K": 10}, ""),
    "dot5r": ("dotsh_w", "dotsh_w", {"W": 128, "SW": 7, "K": 5, "R": 1}, ""),
    "dot10r": ("dotsh_w", "dotsh_w", {"W": 128, "SW": 7, "K": 10, "R": 1}, ""),
    "wsum4": ("wsumsh_w", "wsumsh_w", {"W": 128, "SW": 7, "OW": 12, "K": 4}, ""),
    "wsum6": ("wsumsh_w", "wsumsh_w", {"W": 128, "SW": 7, "OW": 12, "K": 6}, ""),
    "avg12": ("avgsh_w", "avgsh_w", {"W": 128, "SW": 7, "NB": 12}, ""),
    "avg16": ("avgsh_w", "avgsh_w", {"W": 128, "SW": 7, "NB": 16}, ""),
    "sad3": ("sadsh_w", "sadsh_w", {"W": 128, "SW": 7, "K": 3}, ""),
    "sad5": ("sadsh_w", "sadsh_w", {"W": 128, "SW": 7, "K": 5}, ""),
}
CTRL = {
    "div9r": ("divsh_w", "divsh_w", {"W": 128, "SW": 7, "NA": 9, "NB": 4, "R": 1}, ""),
    "div11r": ("divsh_w", "divsh_w", {"W": 128, "SW": 7, "NA": 11, "NB": 4, "R": 1}, ""),
    "clamp5r": ("clampsh_w", "clampsh_w", {"W": 128, "SW": 7, "K": 5, "NB": 8, "R": 1}, ""),
    "clamp8r": ("clampsh_w", "clampsh_w", {"W": 128, "SW": 7, "K": 8, "NB": 8, "R": 1}, ""),
    "rng5r": ("rngsh_w", "rngsh_w", {"W": 128, "SW": 7, "N": 5, "NB": 8, "R": 1}, ""),
    "rng10r": ("rngsh_w", "rngsh_w", {"W": 128, "SW": 7, "N": 10, "NB": 8, "R": 1}, ""),
    "amin10": ("argminsh_w", "argminsh_w", {"W": 128, "SW": 7, "N": 10, "NB": 6}, ""),
    "max6": ("maxsh_w", "maxsh_w", {"W": 128, "SW": 7, "N": 6}, ""),
    "max10": ("maxsh_w", "maxsh_w", {"W": 128, "SW": 7, "N": 10}, ""),
    "mod14": ("modsh_w", "modsh_w", {"W": 128, "SW": 7, "NA": 14, "M": 97}, ""),
}
NEW = ADD | CTRL
GROUP = {d: "ADD" for d in ADD} | {d: "CTRL" for d in CTRL}
CLOCK = {d: ("tight", "relaxed")[i % 2] for g in (ADD, CTRL) for i, d in enumerate(g)}
FACTORS = {"tight": 1.0, "relaxed": 1.5}
_a, _c = list(ADD), list(CTRL)
random.Random(145).shuffle(_a)
random.Random(145).shuffle(_c)
ORDER = [d for pair in zip(_a, _c) for d in pair]
TABLE = HERE / "results.jsonl"
META = HERE / "meta.json"


def complete(rows, n=120):
    """The longest prefix of ORDER with n rows per design in rows (dicts with a "design" key)."""
    cnt = {}
    for r in rows:
        cnt[r["design"]] = cnt.get(r["design"], 0) + 1
    out = []
    for d in ORDER:
        if cnt.get(d, 0) < n:
            break
        out.append(d)
    return out


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def install():
    flow.DESIGNS.clear()
    flow.DESIGNS.update(NEW)


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


M144 = _load(EXP / "corner_ff_blind" / "run.py", "vdse_m145_r144")


def base_task(a):
    d, wd, lib, pdk, orb = a
    install()
    log = Path(wd) / "openroad.log"
    if log.exists() and M144.synth_period(log.read_text()) is not None:
        return d, M144.synth_period(log.read_text())
    try:
        return d, flow.run_point(d, (), 10.0, wd, lib, pdk, orb)["synth_netlist_period_ns"]
    except RuntimeError:
        return d, M144.synth_period(log.read_text()) if log.exists() else None


def tool_versions(orb):
    def first(cmd):
        try:
            return subprocess.run(cmd, capture_output=True, text=True, timeout=60).stdout.strip().splitlines()[0]
        except Exception as e:  # noqa: BLE001
            return f"unknown ({e})"
    return {"yosys": first(["yosys", "-V"]), "openroad": first([orb, "-version"])}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--openroad", required=True)
    ap.add_argument("--lib", required=True, help="sky130_fd_sc_hd__ff_n40C_1v95.lib")
    ap.add_argument("--pdk", default="/tmp/pdk/orfs/flow/platforms/sky130hd")
    ap.add_argument("--out", default="/tmp/verified-dse-addchain-ff")
    ap.add_argument("--n", type=int, default=120)
    ap.add_argument("--jobs", type=int, default=4)
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
    seqs = M144.M141.R138.fresh_sequences(a.n)
    if META.exists():
        base = json.loads(META.read_text())["base_period_ns"]
    else:
        with Pool(a.jobs) as pool:
            base = dict(pool.map(base_task, [(d, out / d / "base", lib, pdk, a.openroad) for d in ORDER]))
        META.write_text(json.dumps({"corner": CORNER, "util": 40, "liberty_sha256": SHA256, "tools": tool_versions(a.openroad),
                                    "base_period_ns": {d: base[d] for d in ORDER}, "n_sequences": len(seqs), "seed": 108,
                                    "order_seed": 145, "order": ORDER, "clock": CLOCK, "group": GROUP, "designs": NEW}, indent=1))
    tasks = [(d, s, CLOCK[d], round(base[d] * FACTORS[CLOCK[d]], 3), out / d / f"{CLOCK[d]}_{i}", lib, pdk, a.openroad)
             for d in ORDER for i, s in enumerate(seqs)]
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
