"""Milestone 152: is csum2's area-only miss at ff rare? A blind flow run at SKY130 HD ff_n40C_1v95 on fresh short add chains.

Why: milestone 151 found that at ff the clip's alpha -> 0 limit (rank the mapped ladder by area alone, SWC(0)) beats the paper's
SWC(1.25) on 76 of milestones 144 to 147's 77 ff designs (1.85% against 3.02%), and loses only because of one design, csum2
(milestone 147), where it has 66.62% regret against 0.00%. Four folds cannot say how often that miss recurs. csum2 is a short
add chain (two 128-bit words and an end-around carry feeding a 7-bit shift amount) with a fast mapped path (8.65 ns at ff). This
milestone runs fresh designs of that kind and scores SWC(0) against SWC(1.25) on them, with the comparison fixed in analyse.py
before any point runs.

Fixed here, before any point (baselines included) runs:
  Candidates: 16 add chains (milestone 145's ADD rule: the amount cone sums three or more multi-bit terms written as an adder
  chain; sadsh_w at K = 2 and csumsh_w count, as in milestone 147), all W = 128, SW = 7, short chains (K <= 10), with no sequence
  point at ff in milestones 144 to 147 (tests/test_addshort_ff.py checks this against those tables). Six of them (csum7, dot3r,
  dot7r, sad2, wsum3, avg8) were candidates in milestone 147 whose ff baselines were measured but that were not
  drawn into a cell; their baseline periods were therefore seen, their sequence points never were.
  Band: a candidate is kept only if its own ff baseline no-wire period (empty ABC sequence) is FAST, <= 15.0 ns (milestone 147's
  band; csum2 was 8.65). Order: the kept candidates in a seed-152 shuffle of the list below; all are run (at most 16).
  Clock: in that order, tight, relaxed, tight, ... (target = own baseline x 1.0 or 1.5, milestones 24, 28 and 143 to 147).
  If the flow stops for time, the analysed set is the longest prefix of the order whose designs are complete.
  Milestone 108's 120 fresh ABC sequences (seed 108). Random routing's and the ladder's tie-break seeds come from the cell builder
  with the tag "m152ff".

Tool versions: OpenROAD 26Q3 and Yosys 0.71 from nixpkgs (recorded in meta.json). Liberty: sky130_fd_sc_hd__ff_n40C_1v95.lib, the
file milestone 144 pinned (same sha256).

Usage: python experiments/addshort_ff/run.py --openroad <bin> --lib /tmp/ff.lib [--pdk <sky130hd dir>] [--jobs 4] [--resume]
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


M147 = _load(EXP / "addchain_delay" / "run.py", "vdse_m152_r147")
M145 = M147.M145
SHA256, CORNER, FAST_MAX = M145.SHA256, M145.CORNER, M147.FAST_MAX
B = {"W": 128, "SW": 7}
CANDIDATES = {
    "csum4": ("csumsh_w", "csumsh_w", B | {"K": 4}, ""),
    "csum7": ("csumsh_w", "csumsh_w", B | {"K": 7}, ""),
    "csum9": ("csumsh_w", "csumsh_w", B | {"K": 9}, ""),
    "dot3r": ("dotsh_w", "dotsh_w", B | {"K": 3, "R": 1}, ""),
    "dot7r": ("dotsh_w", "dotsh_w", B | {"K": 7, "R": 1}, ""),
    "dot9r": ("dotsh_w", "dotsh_w", B | {"K": 9, "R": 1}, ""),
    "sad2": ("sadsh_w", "sadsh_w", B | {"K": 2}, ""),
    "sad6": ("sadsh_w", "sadsh_w", B | {"K": 6}, ""),
    "sad7": ("sadsh_w", "sadsh_w", B | {"K": 7}, ""),
    "wsum3": ("wsumsh_w", "wsumsh_w", B | {"OW": 12, "K": 3}, ""),
    "wsum5": ("wsumsh_w", "wsumsh_w", B | {"OW": 12, "K": 5}, ""),
    "wsum8": ("wsumsh_w", "wsumsh_w", B | {"OW": 12, "K": 8}, ""),
    "avg4": ("avgsh_w", "avgsh_w", B | {"NB": 4}, ""),
    "avg6": ("avgsh_w", "avgsh_w", B | {"NB": 6}, ""),
    "avg8": ("avgsh_w", "avgsh_w", B | {"NB": 8}, ""),
    "avg10": ("avgsh_w", "avgsh_w", B | {"NB": 10}, ""),
}
SEEN_BASELINE = ("csum7", "dot3r", "dot7r", "sad2", "wsum3", "avg8")
SHUFFLED = list(CANDIDATES)
random.Random(152).shuffle(SHUFFLED)
FACTORS = {"tight": 1.0, "relaxed": 1.5}
TABLE = HERE / "results.jsonl"
META = HERE / "meta.json"


def select(base):
    """Kept designs (FAST baseline) in SHUFFLED order and their alternating clocks. Depends on no sequence result."""
    order = [d for d in SHUFFLED if base.get(d) is not None and base[d] <= FAST_MAX]
    return order, {d: ("tight", "relaxed")[i % 2] for i, d in enumerate(order)}


def complete(rows, order, n=120):
    return M147.complete(rows, order, n)


def install():
    flow.DESIGNS.clear()
    flow.DESIGNS.update(CANDIDATES)


def task(a):
    design, seq, tag, period, wd, lib, pdk, orb = a
    if flow.DESIGNS.get(design) != CANDIDATES[design]:
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
    ap.add_argument("--out", default="/tmp/verified-dse-addshort-ff")
    ap.add_argument("--n", type=int, default=120)
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--baselines-only", action="store_true")
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
    else:
        with Pool(a.jobs) as pool:
            base = dict(pool.map(base_task, [(d, out / d / "base", lib, pdk, a.openroad) for d in CANDIDATES]))
        order, clock = select(base)
        meta = {"corner": CORNER, "util": 40, "liberty_sha256": SHA256, "tools": M145.tool_versions(a.openroad),
                "base_period_ns": {d: base[d] for d in CANDIDATES}, "order": order, "clock": clock,
                "n_sequences": len(seqs), "seed": 108, "order_seed": 152, "designs": {d: CANDIDATES[d] for d in order}}
        META.write_text(json.dumps(meta, indent=1))
    print(json.dumps({k: meta[k] for k in ("order", "base_period_ns")}, indent=1), flush=True)
    if a.baselines_only:
        return
    base, clock, order = meta["base_period_ns"], meta["clock"], meta["order"]
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
