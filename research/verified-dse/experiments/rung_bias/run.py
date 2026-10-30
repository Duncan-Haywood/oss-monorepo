"""Milestone 1: run every (design, ABC pass sequence) point through the four rungs; write results.jsonl.

Usage: python experiments/rung_bias/run.py --openroad <bin> [--pdk <sky130hd platform dir>] [--out work] [--n 60] [--jobs 4]
                                  [--lib <liberty, default tt_025C_1v80 in the platform>] [--results <jsonl>]
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

FACTORS = {"tight": 1.0, "relaxed": 1.5}


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
    ap.add_argument("--lib", default=None, help="liberty for another corner (milestone 24: ss_100C_1v60)")
    ap.add_argument("--results", default=None, help="results.jsonl path (default: next to this script)")
    ap.add_argument("--meta", default=None)
    a = ap.parse_args()
    out, pdk = Path(a.out), Path(a.pdk)
    out.mkdir(parents=True, exist_ok=True)
    lib = out / "lib.lib"
    flow.filtered_liberty(Path(a.lib) if a.lib else pdk / "lib/sky130_fd_sc_hd__tt_025C_1v80.lib", lib)
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
    with Pool(a.jobs) as pool, open(a.results or HERE / "results.jsonl", "w") as fh:
        for i, r in enumerate(pool.imap_unordered(task, tasks, chunksize=2)):
            fh.write(json.dumps(r) + "\n")
            fh.flush()
            if i % 50 == 0:
                print(i, len(tasks), flush=True)
    Path(a.meta or HERE / "meta.json").write_text(json.dumps({"base_period_ns": base, "n_sequences": len(seqs)}, indent=1))


if __name__ == "__main__":
    main()
