"""Milestone 120: a blind test with more power of milestone 119's structural shifter guard SWS(64) (experiments/shift_power/analyse.py),
and of its disclosed blind spot. Six designs, fixed (with analyse.py's guards and predictions) before any flow run of this milestone:
lzcnorm96, lzcnorm128 (wider leading-zero normalisers than milestone 119's, designs/lzcnorm_w.v; flagged), alignsh64, alignsh128 (a
floating-point alignment shifter with sticky bit, designs/alignsh_w.v, a family no table has run; flagged), muxshl64, muxshl128 (a
logarithmic left/right shifter written as explicit mux stages with no shift operator, designs/muxshl_w.v, a family no table has run;
the same function as barrel_w but not flagged by shift_width). Milestone 108's 120 fresh ABC pass sequences (seed 108), both clocks;
each design's clock target is its own baseline no-wire period (milestone 28's protocol). Writes results.jsonl, meta.json. Same code
as experiments/struct_guard/run.py with only the design list and output directory changed.

Usage: python experiments/shift_power/run.py --openroad <bin> [--pdk <sky130hd dir>] [--jobs 4] [--resume]
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
    "lzcnorm96": ("lzcnorm_w", "lzcnorm_w", {"W": 96, "LW": 7}, ""),
    "lzcnorm128": ("lzcnorm_w", "lzcnorm_w", {"W": 128, "LW": 8}, ""),
    "alignsh64": ("alignsh_w", "alignsh_w", {"W": 64, "DW": 6}, ""),
    "alignsh128": ("alignsh_w", "alignsh_w", {"W": 128, "DW": 7}, ""),
    "muxshl64": ("muxshl_w", "muxshl_w", {"W": 64, "SW": 6}, ""),
    "muxshl128": ("muxshl_w", "muxshl_w", {"W": 128, "SW": 7}, ""),
}
FACTORS = {"tight": 1.0, "relaxed": 1.5}
ORDER = ["lzcnorm128", "muxshl128", "alignsh128", "lzcnorm96", "muxshl64", "alignsh64"]  # largest first (expected)


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def fresh_sequences(n=120):
    return _load(EXP / "fresh_pool" / "run.py", "vdse_shift_power_fresh_run").fresh_sequences(n)


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
    ap.add_argument("--out", default="/tmp/verified-dse-shift-power")
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
