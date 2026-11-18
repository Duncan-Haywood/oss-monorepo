"""Milestone 133: the clipped ladder SWC, the gate-depth guard SWG(32), the pilot-probe guard SWP(32) and random routing tested
blind on a set probed so that every cell reaches the ladder branch (experiments/ladder_blind/analyse.py). Milestone 132 lost half
its cells to right shifters under the cost threshold; here every design is a 128-bit LEFT shifter and the candidate list was
probed for routed/r2 (one default-script flow point each, experiments/ladder_blind/probe.py) as well as gate depth before the
design list below was fixed. Four families no table has run: crc7sh_w (the CRC-7 of an NB-bit field), fibsh_w (a multiplicative
hash of an NA-bit key), bcdsh_w (D BCD digits to binary) and cmpsel_w (one of two amounts chosen by an NP-bit comparison).
Milestone 108's 120 fresh ABC pass sequences (seed 108), both clocks; each design's clock target is its own baseline no-wire
period (milestone 28's protocol). Writes results.jsonl, meta.json. Same code as experiments/blind_probe/run.py with only the
design list, order, output directory and this docstring changed.

Usage: python experiments/ladder_blind/run.py --openroad <bin> [--pdk <sky130hd dir>] [--jobs 4] [--resume]
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

# name: (file stem, top, parameters, clock port); candidates for probe.py. KEEP (below) is fixed from probe.txt before any
# sequence of this milestone is run.
CAND = {
    "crc7s16": ("crc7sh_w", "crc7sh_w", {"W": 128, "SW": 7, "NB": 16}, ""),
    "crc7s32": ("crc7sh_w", "crc7sh_w", {"W": 128, "SW": 7, "NB": 32}, ""),
    "fib10": ("fibsh_w", "fibsh_w", {"W": 128, "SW": 7, "NA": 10, "C": 633}, ""),
    "fib12": ("fibsh_w", "fibsh_w", {"W": 128, "SW": 7, "NA": 12, "C": 2531}, ""),
    "fib14": ("fibsh_w", "fibsh_w", {"W": 128, "SW": 7, "NA": 14, "C": 10127}, ""),
    "bcd2": ("bcdsh_w", "bcdsh_w", {"W": 128, "SW": 7, "D": 2}, ""),
    "bcd3": ("bcdsh_w", "bcdsh_w", {"W": 128, "SW": 7, "D": 3}, ""),
    "cmp16": ("cmpsel_w", "cmpsel_w", {"W": 128, "SW": 7, "NP": 16}, ""),
    "cmp48": ("cmpsel_w", "cmpsel_w", {"W": 128, "SW": 7, "NP": 48}, ""),
}
KEEP = ["fib14", "fib12", "cmp48", "bcd3", "cmp16", "crc7s16", "bcd2"]  # probe.txt: routed/r2 > 3.3; crc7s32 (3.05), fib10 (3.21) dropped; largest first
NEW = {k: CAND[k] for k in KEEP}
FACTORS = {"tight": 1.0, "relaxed": 1.5}
ORDER = list(KEEP)


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def fresh_sequences(n=120):
    return _load(EXP / "fresh_pool" / "run.py", "vdse_ladder_blind_fresh_run").fresh_sequences(n)


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
    ap.add_argument("--out", default="/tmp/verified-dse-ladder-blind")
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
