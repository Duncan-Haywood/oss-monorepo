"""Milestone 153: should the clip's alpha move from 1.25 to 1? A blind flow run at SKY130 HD tt_025C_1v80 on milestone 152's designs.

Why: milestone 152 ran 15 fresh short add chains at ff and SWC(1) had the lowest mean regret there (5.57% against SWC(1.25)'s
7.18%), post hoc. Milestone 151 found 1.25 the in-sample tt best on 118 cells, with SWC(1) slightly worse (H52 0.97 against 0.77,
B24 1.78 against 1.60, B42 3.36 against 3.30). Whether the paper's alpha should move to 1 needs alpha = 1 scored blind on designs
no alpha was chosen on. These designs have never been run at tt, and running the same designs at the second corner gives a
paired cross-corner read of each design's alpha preference.

Fixed here, before any point (baselines included) runs:
  Designs: milestone 152's run order (experiments/addshort_ff/meta.json) without csum4 and avg6, the two that earlier tt tables
  hold (ladder_confirm and util65_rest have csum4, amount_lanes has avg6; tests/test_addshort_tt.py checks every other tt table).
  13 designs, the same parameters as milestone 152.
  Clock: each design keeps its milestone-152 clock tag (tight or relaxed), with the target its own tt baseline no-wire period
  (empty ABC sequence) x 1.0 or 1.5, so a design's two corners are paired at the same relative clock. No band filter.
  If the flow stops for time, the analysed set is the longest prefix of the order whose designs are complete.
  Milestone 108's 120 fresh ABC sequences (seed 108); the cell builder's tag is "m153tt".

Tool versions: OpenROAD 26Q3 and Yosys 0.71 from nixpkgs (recorded in meta.json). Liberty: the ORFS platform's
sky130_fd_sc_hd__tt_025C_1v80.lib, filtered as in every tt milestone (flow.filtered_liberty); its sha256 goes into meta.json.

Usage: python experiments/addshort_tt/run.py --openroad <bin> [--pdk <sky130hd dir>] [--jobs 4] [--resume]
"""
import argparse
import hashlib
import importlib.util
import json
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


M152 = _load(EXP / "addshort_ff" / "run.py", "vdse_m153_r152")
M145 = M152.M145
SEEN_AT_TT = ("csum4", "avg6")
M152_META = json.loads((EXP / "addshort_ff" / "meta.json").read_text())
ORDER = [d for d in M152_META["order"] if d not in SEEN_AT_TT]
CLOCK = {d: M152_META["clock"][d] for d in ORDER}
CANDIDATES = {d: M152.CANDIDATES[d] for d in ORDER}
FACTORS = M152.FACTORS
CORNER = "tt_025C_1v80"
TABLE = HERE / "results.jsonl"
META = HERE / "meta.json"


def complete(rows, order=ORDER, n=120):
    return M152.complete(rows, order, n)


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
    ap.add_argument("--pdk", default="/tmp/pdk/orfs/flow/platforms/sky130hd")
    ap.add_argument("--out", default="/tmp/verified-dse-addshort-tt")
    ap.add_argument("--n", type=int, default=120)
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--baselines-only", action="store_true")
    ap.add_argument("--resume", action="store_true", help="skip points already in results.jsonl, append the rest")
    a = ap.parse_args()
    if flow.UTIL != 40:
        sys.exit(f"unset VDSE_UTIL (flow.UTIL is {flow.UTIL}; this milestone is at 40%)")
    install()
    out, pdk = Path(a.out), Path(a.pdk)
    out.mkdir(parents=True, exist_ok=True)
    src = pdk / "lib/sky130_fd_sc_hd__tt_025C_1v80.lib"
    lib = out / "lib.lib"
    flow.filtered_liberty(src, lib)
    seqs = M145.M144.M141.R138.fresh_sequences(a.n)
    if META.exists():
        meta = json.loads(META.read_text())
    else:
        with Pool(a.jobs) as pool:
            base = dict(pool.map(base_task, [(d, out / d / "base", lib, pdk, a.openroad) for d in ORDER]))
        meta = {"corner": CORNER, "util": 40, "liberty_sha256": hashlib.sha256(src.read_bytes()).hexdigest(),
                "tools": M145.tool_versions(a.openroad), "base_period_ns": {d: base[d] for d in ORDER},
                "order": [d for d in ORDER if base[d] is not None], "clock": CLOCK, "n_sequences": len(seqs), "seed": 108,
                "designs": CANDIDATES}
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
