"""Milestone 121: the blind test of the amount-source guard (experiments/amount_depth/analyse.py). Six designs from three families no
table has run, fixed (with analyse.py's guards and predictions) before any flow run of this milestone: addsh64, addsh128 (a right
barrel whose amount is the sum of two inputs, designs/addsh_w.v), fpalign64, fpalign128 (a floating-point alignment shifter whose
amount is |ea - eb|, designs/fpalign_w.v), pcsh64, pcsh128 (a left shifter whose amount is the popcount of a W-bit mask,
designs/pcsh_w.v). Milestone 108's 120 fresh ABC pass sequences (seed 108), both clocks; each design's clock target is its own
baseline no-wire period (milestone 28's protocol). Writes results.jsonl, meta.json. Same code as experiments/shift_power/run.py
with only the design list and output directory changed.

Usage: python experiments/amount_depth/run.py --openroad <bin> [--pdk <sky130hd dir>] [--jobs 4] [--resume]
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
    "addsh64": ("addsh_w", "addsh_w", {"W": 64, "SW": 6}, ""),
    "addsh128": ("addsh_w", "addsh_w", {"W": 128, "SW": 7}, ""),
    "fpalign64": ("fpalign_w", "fpalign_w", {"W": 64, "EW": 8}, ""),
    "fpalign128": ("fpalign_w", "fpalign_w", {"W": 128, "EW": 8}, ""),
    "pcsh64": ("pcsh_w", "pcsh_w", {"W": 64, "CW": 7}, ""),
    "pcsh128": ("pcsh_w", "pcsh_w", {"W": 128, "CW": 8}, ""),
}
FACTORS = {"tight": 1.0, "relaxed": 1.5}
ORDER = ["pcsh128", "fpalign128", "addsh128", "pcsh64", "fpalign64", "addsh64"]  # largest first (expected)


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def fresh_sequences(n=120):
    return _load(EXP / "fresh_pool" / "run.py", "vdse_amount_depth_fresh_run").fresh_sequences(n)


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
    ap.add_argument("--out", default="/tmp/verified-dse-amount-depth")
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
