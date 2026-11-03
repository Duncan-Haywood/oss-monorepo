"""Milestone 73: the fanout_rich protocol on one design, the one-hot AND-OR mux, with the control fanout W swept (24, 48, 96, 192) and everything else fixed; write results.jsonl.

Usage: python experiments/fanout_rich/run.py --openroad <bin> [--pdk <sky130hd platform dir>] [--out work] [--n 60] [--jobs 4]
"""
import argparse
import json
import random
import sys
from itertools import product
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from verified_dse import flow  # noqa: E402

LARGE = {f"fanaow{w}": ("fanaow", "fanaow", {"W": w}, "") for w in (24, 48, 96, 192)}
flow.DESIGNS.clear()
flow.DESIGNS.update(LARGE)

FACTORS = {"tight": 1.0}


def sequences(n, seed=0):
    allseq = [s for k in range(4) for s in product(flow.PASSES, repeat=k)]
    rng = random.Random(seed)
    rest = [s for s in allseq if s]
    return [()] + rng.sample(rest, n - 1)


def task(a):
    design, seq, tag, period, wd, lib, pdk, orb = a
    try:
        r = flow.run_point(design, seq, period, wd, lib, pdk, orb)
        r["status"] = "ok"
    except RuntimeError as e:
        r = {"design": design, "seq": list(seq), "period_ns": period, "status": "fail", "error": str(e)[-200:]}
    r["tag"] = tag
    return r


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--openroad", required=True)
    ap.add_argument("--pdk", default="/tmp/pdk/orfs/flow/platforms/sky130hd")
    ap.add_argument("--out", default="/tmp/verified-dse-work")
    ap.add_argument("--n", type=int, default=60)
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--yosys-dir", required=True)
    ap.add_argument("--results", default="results.jsonl")  # milestone 74: a second table under another Yosys
    ap.add_argument("--meta", default="meta.json")
    a = ap.parse_args()
    import os
    os.environ["PATH"] = a.yosys_dir + os.pathsep + os.environ["PATH"]
    out, pdk = Path(a.out), Path(a.pdk)
    out.mkdir(parents=True, exist_ok=True)
    lib = out / "lib.lib"
    flow.filtered_liberty(pdk / "lib/sky130_fd_sc_hd__tt_025C_1v80.lib", lib)
    seqs = sequences(a.n)
    base = {}
    for d in flow.DESIGNS:  # the baseline's no-wire period sets each design's clock target
        r = flow.run_point(d, (), 10.0, out / d / "base", lib, pdk, a.openroad)
        base[d] = r["synth_netlist_period_ns"]
    tasks = []
    for d in flow.DESIGNS:
        for tag, f in FACTORS.items():
            period = round(base[d] * f, 3)
            for i, s in enumerate(seqs):
                tasks.append((d, s, tag, period, out / d / f"{tag}_{i}", lib, pdk, a.openroad))
    with Pool(a.jobs) as pool, open(HERE / a.results, "w") as fh:
        for i, r in enumerate(pool.imap_unordered(task, tasks, chunksize=2)):
            fh.write(json.dumps(r) + "\n")
            fh.flush()
            if i % 50 == 0:
                print(i, len(tasks), flush=True)
    (HERE / a.meta).write_text(json.dumps({"base_period_ns": base, "n_sequences": len(seqs)}, indent=1))


if __name__ == "__main__":
    main()
