"""Milestone 108: a fresh, larger pool. Run 120 ABC pass sequences that milestone 1 never ran (disjoint from its 60) through the
four rungs on the ten small designs, both clocks, with milestone 1's clock targets (rung_bias/meta.json). Writes results.jsonl.

Usage: python experiments/fresh_pool/run.py --openroad <bin> [--pdk <sky130hd dir>] [--n 120] [--jobs 4]
"""
import argparse
import importlib.util
import json
import random
import sys
from itertools import product
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from verified_dse import flow  # noqa: E402

_spec = importlib.util.spec_from_file_location("rung_bias_run", HERE.parent / "rung_bias" / "run.py")
_rb = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_rb)
FACTORS, sequences = _rb.FACTORS, _rb.sequences


def task(a):
    return _rb.task(a)  # defined here so worker processes can unpickle it


def fresh_sequences(n, seed=108):
    """n non-empty sequences of up to three passes, none of them in milestone 1's 60 (seed 0)."""
    old = set(sequences(60))
    allseq = [s for k in range(1, 4) for s in product(flow.PASSES, repeat=k) if s not in old]
    return random.Random(seed).sample(allseq, n)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--openroad", required=True)
    ap.add_argument("--pdk", default="/tmp/pdk/orfs/flow/platforms/sky130hd")
    ap.add_argument("--out", default="/tmp/verified-dse-fresh")
    ap.add_argument("--n", type=int, default=120)
    ap.add_argument("--jobs", type=int, default=4)
    a = ap.parse_args()
    out, pdk = Path(a.out), Path(a.pdk)
    out.mkdir(parents=True, exist_ok=True)
    lib = out / "lib.lib"
    flow.filtered_liberty(pdk / "lib/sky130_fd_sc_hd__tt_025C_1v80.lib", lib)
    base = json.loads((HERE.parent / "rung_bias" / "meta.json").read_text())["base_period_ns"]
    seqs = fresh_sequences(a.n)
    tasks = [(d, s, tag, round(base[d] * f, 3), out / d / f"{tag}_{i}", lib, pdk, a.openroad)
             for d in flow.DESIGNS for tag, f in FACTORS.items() for i, s in enumerate(seqs)]
    with Pool(a.jobs) as pool, open(HERE / "results.jsonl", "w") as fh:
        for i, r in enumerate(pool.imap_unordered(task, tasks, chunksize=2)):
            fh.write(json.dumps(r) + "\n")
            fh.flush()
            if i % 100 == 0:
                print(i, len(tasks), flush=True)
    (HERE / "meta.json").write_text(json.dumps({"base_period_ns": base, "n_sequences": len(seqs), "seed": 108}, indent=1))


if __name__ == "__main__":
    main()
