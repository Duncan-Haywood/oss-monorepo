"""Milestone 122: the blind threshold test of the amount-depth guard (experiments/amount_threshold/analyse.py). Six 128-bit shifters
from three families no table has run, two per family, one with a shallow amount (word-level depth 4 or 5, below the registered
k = 8) and one with a deep amount (16 to 23): chainsh2 and chainsh8 (designs/chainsh_w.v, s = a then K rounds of (s ^ b) + c),
pcnsh6 and pcnsh24 (designs/pcnsh_w.v, x << popcount of an M-bit mask), tzcsh4 and tzcsh8 (designs/tzcsh_w.v, x >> lanes given by
the first set bit of an N-bit request vector). Fixed, with analyse.py's guards and predictions, before any flow run of this
milestone. Milestone 108's 120 fresh ABC pass sequences (seed 108), both clocks; each design's clock target is its own baseline
no-wire period (milestone 28's protocol). Writes results.jsonl, meta.json. Same code as experiments/amount_depth/run.py with only the
design list and output directory changed.

Usage: python experiments/amount_threshold/run.py --openroad <bin> [--pdk <sky130hd dir>] [--jobs 4] [--resume]
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
    "chainsh2": ("chainsh_w", "chainsh_w", {"W": 128, "SW": 7, "K": 2}, ""),
    "chainsh8": ("chainsh_w", "chainsh_w", {"W": 128, "SW": 7, "K": 8}, ""),
    "pcnsh6": ("pcnsh_w", "pcnsh_w", {"W": 128, "M": 6, "CW": 3}, ""),
    "pcnsh24": ("pcnsh_w", "pcnsh_w", {"W": 128, "M": 24, "CW": 5}, ""),
    "tzcsh4": ("tzcsh_w", "tzcsh_w", {"W": 128, "N": 4, "ZW": 3, "LANE": 32}, ""),
    "tzcsh8": ("tzcsh_w", "tzcsh_w", {"W": 128, "N": 8, "ZW": 4, "LANE": 16}, ""),
}
FACTORS = {"tight": 1.0, "relaxed": 1.5}
ORDER = ["pcnsh24", "tzcsh8", "chainsh8", "pcnsh6", "tzcsh4", "chainsh2"]  # deep first (expected slower)


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def fresh_sequences(n=120):
    return _load(EXP / "fresh_pool" / "run.py", "vdse_amount_threshold_fresh_run").fresh_sequences(n)


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
    ap.add_argument("--out", default="/tmp/verified-dse-amount-threshold")
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
