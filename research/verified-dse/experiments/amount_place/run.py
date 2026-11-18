"""Milestone 124: placing the gate-depth threshold blind (experiments/amount_place/analyse.py). Seven shifters from three families no
table has run, chosen so that the amount's gate-level depth (experiments/amount_cut/gate_depth.py, Yosys 0.70 ABC AND mapping) falls
inside (30, 41], the interval milestone 123 could not split: sad1b8 (designs/sadsh_w.v, |a - b| of 8-bit operands, 31 gates),
max3b5 (designs/maxsh_w.v, the largest of three 5-bit fields, 33), sat1b9 (designs/satsh_w.v, one 9-bit saturating add, 35),
max3b6 (max of three 6-bit fields, 36) and its 64-bit twin max3b6n (the same amount cone in front of a 64-bit shifter, 36),
sad2b5 (|a0 - b0| + |a1 - b1| over 5-bit operands, 40) and sat2b5 (two chained 5-bit saturating adds, 41). Fixed, with
analyse.py's guards and predictions, before any flow run of this milestone. Milestone 108's 120 fresh ABC pass sequences (seed 108),
both clocks; each design's clock target is its own baseline no-wire period (milestone 28's protocol). Writes results.jsonl,
meta.json. Same code as experiments/amount_cut/run.py with only the design list and output directory changed.

Usage: python experiments/amount_place/run.py --openroad <bin> [--pdk <sky130hd dir>] [--jobs 4] [--resume]
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
    "sad1b8": ("sadsh_w", "sadsh_w", {"W": 128, "SW": 8, "K": 1}, ""),
    "max3b5": ("maxsh_w", "maxsh_w", {"W": 128, "SW": 5, "N": 3}, ""),
    "sat1b9": ("satsh_w", "satsh_w", {"W": 128, "SW": 9, "K": 1}, ""),
    "max3b6": ("maxsh_w", "maxsh_w", {"W": 128, "SW": 6, "N": 3}, ""),
    "max3b6n": ("maxsh_w", "maxsh_w", {"W": 64, "SW": 6, "N": 3}, ""),
    "sad2b5": ("sadsh_w", "sadsh_w", {"W": 128, "SW": 5, "K": 2}, ""),
    "sat2b5": ("satsh_w", "satsh_w", {"W": 128, "SW": 5, "K": 2}, ""),
}
FACTORS = {"tight": 1.0, "relaxed": 1.5}
ORDER = ["sad2b5", "sad1b8", "max3b6", "max3b5", "sat2b5", "sat1b9", "max3b6n"]  # widest amount cones first


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def fresh_sequences(n=120):
    return _load(EXP / "fresh_pool" / "run.py", "vdse_amount_place_fresh_run").fresh_sequences(n)


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
    ap.add_argument("--out", default="/tmp/verified-dse-amount-place")
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
