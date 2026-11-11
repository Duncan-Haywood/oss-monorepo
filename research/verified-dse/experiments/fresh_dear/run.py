"""Milestone 112: a fresh pool where routing is dear. Run milestone 108's 120 fresh ABC pass sequences (seed 108, disjoint from
milestone 1's 60) through the four rungs on six held-out designs whose routed point cost more than 3x an r2 score in milestone 110
(mult16, mult24, xbar16, gf2mat48, barrel128, bcastadd64), both clocks, each design's own clock targets from its milestone 9/26/27/30
meta.json. Writes results.jsonl.

Usage: python experiments/fresh_dear/run.py --openroad <bin> [--pdk <sky130hd dir>] [--jobs 4]
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


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# design -> (experiment whose run.py defines it and whose meta.json holds its base period)
SOURCES = {"mult16": "large", "mult24": "large", "xbar16": "hostile", "gf2mat48": "hostile",
           "barrel128": "nonarith", "bcastadd64": "fanout_rich"}
FACTORS = {"tight": 1.0, "relaxed": 1.5}


def designs_and_bases(install=False):
    """Design definitions and base periods; flow.DESIGNS is restored afterwards unless install (main() installs them before
    forking, so workers inherit them; importing this module leaves flow.DESIGNS as it was)."""
    saved = dict(flow.DESIGNS)
    defs, base = {}, {}
    for d, src in SOURCES.items():
        mod = _load(EXP / src / "run.py", f"vdse_{src}_run")  # each run.py clears flow.DESIGNS and installs its own
        defs[d] = dict(flow.DESIGNS)[d]
        base[d] = json.loads((EXP / src / "meta.json").read_text())["base_period_ns"][d]
    flow.DESIGNS.clear()
    flow.DESIGNS.update(defs if install else saved)
    return defs, base


def fresh_sequences(n=120):
    return _load(EXP / "fresh_pool" / "run.py", "vdse_fresh_run").fresh_sequences(n)


def task(a):
    design, seq, tag, period, wd, lib, pdk, orb = a
    if design not in flow.DESIGNS:  # a spawned or forkserver worker did not inherit main()'s table
        designs_and_bases(install=True)
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
    ap.add_argument("--out", default="/tmp/verified-dse-fresh-dear")
    ap.add_argument("--n", type=int, default=120)
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--resume", action="store_true", help="skip points already in results.jsonl and append the rest")
    a = ap.parse_args()
    _, BASE = designs_and_bases(install=True)
    out, pdk = Path(a.out), Path(a.pdk)
    out.mkdir(parents=True, exist_ok=True)
    lib = out / "lib.lib"
    flow.filtered_liberty(pdk / "lib/sky130_fd_sc_hd__tt_025C_1v80.lib", lib)
    seqs = fresh_sequences(a.n)
    # dearest designs first so the pool drains evenly
    order = ["mult24", "gf2mat48", "xbar16", "barrel128", "mult16", "bcastadd64"]
    tasks = [(d, s, tag, round(BASE[d] * f, 3), out / d / f"{tag}_{i}", lib, pdk, a.openroad)
             for d in order for tag, f in FACTORS.items() for i, s in enumerate(seqs)]
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
    (HERE / "meta.json").write_text(json.dumps({"base_period_ns": BASE, "n_sequences": len(seqs), "seed": 108,
                                                "sources": SOURCES}, indent=1))


if __name__ == "__main__":
    main()
