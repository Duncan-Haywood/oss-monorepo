"""Milestone 142: the 32 designs milestone 141 planned at 65% placement utilisation but did not run (its flow stopped at the session's
time limit after 20 of 52 designs), run now with milestone 141's flow, designs, clocks, sequences and seed-141 order, unchanged.

The new rows go to this directory's results.jsonl, so milestone 141's table and tests stay as they are. Points already in
experiments/util65_blind/results.jsonl (rng12r's 68 rows from the partial run) are skipped and joined by analyse.py.

Usage: VDSE_UTIL=65 python experiments/util65_rest/run.py --openroad <bin> [--pdk <sky130hd dir>] [--jobs 4]
(always resumes: points already in either table are skipped)
"""
import argparse
import importlib.util
import json
import os
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


M141 = _load(EXP / "util65_blind" / "run.py", "vdse_m142_r141")
OLD = EXP / "util65_blind" / "results.jsonl"
TABLE = HERE / "results.jsonl"
DONE141 = M141.complete([json.loads(l) for l in OLD.read_text().splitlines()])
REST = [d for d in M141.ORDER if d not in set(DONE141)]


def task(a):
    """Milestone 141's task, wrapped here so the pool can pickle it (the loaded module is not importable by name)."""
    return M141.task(a)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--openroad", required=True)
    ap.add_argument("--pdk", default="/tmp/pdk/orfs/flow/platforms/sky130hd")
    ap.add_argument("--out", default="/tmp/verified-dse-util65-rest")
    ap.add_argument("--n", type=int, default=120)
    ap.add_argument("--jobs", type=int, default=4)
    a = ap.parse_args()
    if flow.UTIL != M141.UTIL or os.environ.get("VDSE_UTIL") != str(M141.UTIL):
        sys.exit(f"set VDSE_UTIL={M141.UTIL} (flow.UTIL is {flow.UTIL})")
    M141.install()
    out, pdk = Path(a.out), Path(a.pdk)
    out.mkdir(parents=True, exist_ok=True)
    lib = out / "lib.lib"
    flow.filtered_liberty(pdk / "lib/sky130_fd_sc_hd__tt_025C_1v80.lib", lib)
    seqs = M141.R138.fresh_sequences(a.n)
    tasks = [(d, s, M141.CLOCK[d], round(M141.BASE[d] * M141.FACTORS[M141.CLOCK[d]], 3), out / d / f"{M141.CLOCK[d]}_{i}", lib,
              pdk, a.openroad) for d in REST for i, s in enumerate(seqs)]
    done = set()
    for p in (OLD, TABLE):
        if p.exists():
            done |= {(r["design"], r["tag"], tuple(r["seq"])) for r in map(json.loads, p.read_text().splitlines())}
    tasks = [t for t in tasks if (t[0], t[2], tuple(t[1])) not in done]
    print(f"{len(REST)} designs, {len(tasks)} points to run", flush=True)
    with Pool(a.jobs) as pool, open(TABLE, "a") as fh:
        for i, r in enumerate(pool.imap_unordered(task, tasks, chunksize=1)):
            fh.write(json.dumps(r) + "\n")
            fh.flush()
            if i % 50 == 0:
                print(i, len(tasks), flush=True)


if __name__ == "__main__":
    main()
