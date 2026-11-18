"""Milestone 125: SWG(32), registered from milestone 124's post hoc sweep, tested blind (experiments/amount_lanes/analyse.py). Eight
shifters from four families no table has run. Five 128-bit shifters whose amount's gate-level depth
(experiments/amount_cut/gate_depth.py, Yosys 0.70 ABC AND mapping) falls in 28 to 36: pmul3 (designs/pmulsh_w.v, low 7 bits of a
3-bit by 7-bit product, 28 gates), avg5 (designs/avgsh_w.v, top 7 bits of a sum of three 5-bit operands, 31), sel64
(designs/selsh_w.v, a 64-bit magnitude compare picks one of two 7-bit amounts, 33), avg6 (6-bit operands, 35), pmul4 (a 4-bit by
7-bit product, 36). Three 64-bit multi-lane shifters (designs/lanesh_w.v, L lanes sharing one 6-bit saturating-add amount) to test
whether the cut moves with width once a 64-bit shift is dear enough to reach the ladder branch: lane2k2 (2 lanes, 2 adds, 48),
lane4k2 (4 lanes, 48) and lane4k1 (4 lanes, 1 add, 25). Parameters chosen by probing gate depth only (no flow). Fixed, with
analyse.py's guards and predictions, before any flow run of this milestone. Milestone 108's 120 fresh ABC pass sequences (seed 108),
both clocks; each design's clock target is its own baseline no-wire period (milestone 28's protocol). Writes results.jsonl,
meta.json. Same code as experiments/amount_place/run.py with only the design list and output directory changed.

Usage: python experiments/amount_lanes/run.py --openroad <bin> [--pdk <sky130hd dir>] [--jobs 4] [--resume]
"""
import argparse
import importlib.util
import json
import sys
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
sys.path.insert(0, str(EXP.parent / "src"))
from verified_dse import flow  # noqa: E402

# name: (file stem, top, parameters, clock port); fixed before any flow run of this milestone
NEW = {
    "pmul3": ("pmulsh_w", "pmulsh_w", {"W": 128, "SW": 7, "NA": 3}, ""),
    "avg5": ("avgsh_w", "avgsh_w", {"W": 128, "SW": 7, "NB": 5}, ""),
    "sel64": ("selsh_w", "selsh_w", {"W": 128, "SW": 7, "NP": 64}, ""),
    "avg6": ("avgsh_w", "avgsh_w", {"W": 128, "SW": 7, "NB": 6}, ""),
    "pmul4": ("pmulsh_w", "pmulsh_w", {"W": 128, "SW": 7, "NA": 4}, ""),
    "lane2k2": ("lanesh_w", "lanesh_w", {"W": 64, "SW": 6, "K": 2, "L": 2}, ""),
    "lane4k2": ("lanesh_w", "lanesh_w", {"W": 64, "SW": 6, "K": 2, "L": 4}, ""),
    "lane4k1": ("lanesh_w", "lanesh_w", {"W": 64, "SW": 6, "K": 1, "L": 4}, ""),
}
FACTORS = {"tight": 1.0, "relaxed": 1.5}
ORDER = ["lane4k2", "lane4k1", "sel64", "lane2k2", "pmul4", "pmul3", "avg6", "avg5"]  # largest designs first


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def fresh_sequences(n=120):
    return _load(EXP / "fresh_pool" / "run.py", "vdse_amount_lanes_fresh_run").fresh_sequences(n)


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
    return r


def base_task(a):
    d, wd, lib, pdk, orb = a
    install()
    return d, flow.run_point(d, (), 10.0, wd, lib, pdk, orb)["synth_netlist_period_ns"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--openroad", required=True)
    ap.add_argument("--pdk", default="/tmp/pdk/orfs/flow/platforms/sky130hd")
    ap.add_argument("--out", default="/tmp/verified-dse-amount-lanes")
    ap.add_argument("--n", type=int, default=120)
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--resume", action="store_true", help="reuse meta.json, skip points already in results.jsonl, append the rest")
    a = ap.parse_args()
    install()
    out, pdk = Path(a.out), Path(a.pdk)
    out.mkdir(parents=True, exist_ok=True)
    lib = out / "lib.lib"
    flow.filtered_liberty(pdk / "lib/sky130_fd_sc_hd__tt_025C_1v80.lib", lib)
    seqs = fresh_sequences(a.n)
    meta = HERE / "meta.json"
    if a.resume and meta.exists():
        base = json.loads(meta.read_text())["base_period_ns"]
    else:  # the baseline's no-wire period sets each design's clock target
        with Pool(a.jobs) as pool:
            base = dict(pool.map(base_task, [(d, out / d / "base", lib, pdk, a.openroad) for d in ORDER]))
        meta.write_text(json.dumps({"base_period_ns": base, "n_sequences": len(seqs), "seed": 108, "designs": NEW}, indent=1))
    tasks = [(d, s, tag, round(base[d] * f, 3), out / d / f"{tag}_{i}", lib, pdk, a.openroad)
             for d in ORDER for tag, f in FACTORS.items() for i, s in enumerate(seqs)]
    res = HERE / "results.jsonl"
    if a.resume and res.exists():
        done = {(r["design"], r["tag"], tuple(r["seq"])) for r in map(json.loads, res.read_text().splitlines())}
        tasks = [t for t in tasks if (t[0], t[2], tuple(t[1])) not in done]
    with Pool(a.jobs) as pool, open(res, "a" if a.resume else "w") as fh:
        for i, r in enumerate(pool.imap_unordered(task, tasks, chunksize=1)):
            fh.write(json.dumps(r) + "\n")
            fh.flush()
            if i % 50 == 0:
                print(i, len(tasks), flush=True)


if __name__ == "__main__":
    main()
