"""Milestone 137: a confirmatory blind test of the clipped ladder SWC against equal-cost random routing, at one clock per design.

Milestone 136 found SWC better than random on 13 of 21 blind designs and worse on 5 (design-level sign p = 0.096), and estimated
that about 95 designs would be needed for a normal 95% interval at that spread. Its "Next": spend the same core-hours on more
designs, not more clocks (the sign of SWC - random agreed across a design's two clocks on 16 of 18 ladder-branch designs), and use
milestone 133's cost probe so every design reaches the ladder branch. So this set is four 128-bit LEFT-shifter families no table has
run (designs/isqrtsh_w.v, argminsh_w.v, csumsh_w.v, eqcntsh_w.v), four dials each, 16 candidates; probe.py (milestone 133's rule,
unchanged: keep routed/r2 > 3.3) fixes KEEP before any ABC sequence is run.

Clock rule (fixed here before the probe ran): one clock per kept design. Kept designs in CAND order (family, then dial) alternate
tight, relaxed, tight, ... over the whole list, so each family gets both clocks where it keeps two or more designs and the
assignment does not depend on any flow result. Milestone 108's 120 fresh ABC pass sequences (seed 108); each design's clock target
is its own baseline no-wire period times 1.0 (tight) or 1.5 (relaxed), milestone 28's protocol. Writes results.jsonl, meta.json.
Same code as experiments/ladder_blind/run.py apart from the design list, the one-clock task list and this docstring.

Usage: python experiments/ladder_confirm/run.py --openroad <bin> [--pdk <sky130hd dir>] [--jobs 4] [--resume]
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

# name: (file stem, top, parameters, clock port); candidates for probe.py.
CAND = {
    "isq8": ("isqrtsh_w", "isqrtsh_w", {"W": 128, "SW": 7, "NA": 8}, ""),
    "isq10": ("isqrtsh_w", "isqrtsh_w", {"W": 128, "SW": 7, "NA": 10}, ""),
    "isq12": ("isqrtsh_w", "isqrtsh_w", {"W": 128, "SW": 7, "NA": 12}, ""),
    "isq14": ("isqrtsh_w", "isqrtsh_w", {"W": 128, "SW": 7, "NA": 14}, ""),
    "amin4": ("argminsh_w", "argminsh_w", {"W": 128, "SW": 7, "N": 4, "NB": 6}, ""),
    "amin6": ("argminsh_w", "argminsh_w", {"W": 128, "SW": 7, "N": 6, "NB": 6}, ""),
    "amin8": ("argminsh_w", "argminsh_w", {"W": 128, "SW": 7, "N": 8, "NB": 6}, ""),
    "amin12": ("argminsh_w", "argminsh_w", {"W": 128, "SW": 7, "N": 12, "NB": 6}, ""),
    "csum3": ("csumsh_w", "csumsh_w", {"W": 128, "SW": 7, "K": 3}, ""),
    "csum4": ("csumsh_w", "csumsh_w", {"W": 128, "SW": 7, "K": 4}, ""),
    "csum6": ("csumsh_w", "csumsh_w", {"W": 128, "SW": 7, "K": 6}, ""),
    "csum8": ("csumsh_w", "csumsh_w", {"W": 128, "SW": 7, "K": 8}, ""),
    "eqc6": ("eqcntsh_w", "eqcntsh_w", {"W": 128, "SW": 7, "K": 6}, ""),
    "eqc10": ("eqcntsh_w", "eqcntsh_w", {"W": 128, "SW": 7, "K": 10}, ""),
    "eqc16": ("eqcntsh_w", "eqcntsh_w", {"W": 128, "SW": 7, "K": 16}, ""),
    "eqc24": ("eqcntsh_w", "eqcntsh_w", {"W": 128, "SW": 7, "K": 24}, ""),
}
KEEP = []  # probe.txt: routed/r2 > 3.3, in CAND order; filled from probe.json before any sequence of this milestone is run
NEW = {k: CAND[k] for k in KEEP}
FACTORS = {"tight": 1.0, "relaxed": 1.5}
CLOCK = {d: ("tight", "relaxed")[i % 2] for i, d in enumerate(KEEP)}
ORDER = list(KEEP)


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def fresh_sequences(n=120):
    return _load(EXP / "fresh_pool" / "run.py", "vdse_ladder_confirm_fresh_run").fresh_sequences(n)


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
    ap.add_argument("--out", default="/tmp/verified-dse-ladder-confirm")
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
        meta.write_text(json.dumps({"base_period_ns": base, "n_sequences": len(seqs), "seed": 108, "designs": NEW, "clock": CLOCK}, indent=1))
    tasks = [(d, s, tag, round(base[d] * f, 3), out / d / f"{tag}_{i}", lib, pdk, a.openroad)
             for d in ORDER for tag, f in FACTORS.items() if tag == CLOCK[d] for i, s in enumerate(seqs)]
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
