"""Milestone 138: a second confirmatory blind test of the clipped ladder SWC against equal-cost random routing, one clock per design,
on shifters other than the 128-bit left shifter every blind set so far has used.

Milestone 137 pooled 33 blind designs (SWC better on 21, worse on 9, sign p = 0.043) but the design-level mean's interval still crossed
zero, and every one of the 33 was a wide LEFT shifter (mostly 128-bit). Its "Next": about 40 more designs, one clock each, with the
shifter varied so the claim covers more than 128-bit left shifters. So this set is five amount-cone families no table has run
(designs/divsh_w.v, restoring division; clampsh_w.v, a chain of saturating clamps; rngsh_w.v, max - min of N fields; dotsh_w.v, a
dot product of 3-bit vectors; gtcntsh_w.v, a count of fields above a threshold), four dials each, each dial at two shifters: a
128-bit logical RIGHT shifter (SW = 7, R = 1) and a 256-bit LEFT shifter (SW = 8, R = 0). 40 candidates; probe.py (milestone 133's
rule, unchanged: keep routed/r2 > 3.3) fixes KEEP before any ABC sequence is run.

Clock rule (fixed here before the probe ran): one clock per kept design. Kept designs in CAND order (family, then shifter, then dial)
alternate tight, relaxed, tight, ... over the whole list. Milestone 108's 120 fresh ABC pass sequences (seed 108); each design's clock
target is its own baseline no-wire period times 1.0 (tight) or 1.5 (relaxed), milestone 28's protocol. Writes results.jsonl, meta.json.
Same code as experiments/ladder_confirm/run.py apart from the design list and this docstring.

Usage: python experiments/ladder_confirm2/run.py --openroad <bin> [--pdk <sky130hd dir>] [--jobs 4] [--resume]
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

# name: (file stem, top, parameters, clock port); candidates for probe.py. Order: family, shifter (r = 128-bit right,
# l = 256-bit left), dial.
CAND = {
    "div8r": ("divsh_w", "divsh_w", {"W": 128, "SW": 7, "NA": 8, "NB": 4, "R": 1}, ""),
    "div10r": ("divsh_w", "divsh_w", {"W": 128, "SW": 7, "NA": 10, "NB": 4, "R": 1}, ""),
    "div12r": ("divsh_w", "divsh_w", {"W": 128, "SW": 7, "NA": 12, "NB": 4, "R": 1}, ""),
    "div14r": ("divsh_w", "divsh_w", {"W": 128, "SW": 7, "NA": 14, "NB": 4, "R": 1}, ""),
    "div8l": ("divsh_w", "divsh_w", {"W": 256, "SW": 8, "NA": 8, "NB": 4, "R": 0}, ""),
    "div10l": ("divsh_w", "divsh_w", {"W": 256, "SW": 8, "NA": 10, "NB": 4, "R": 0}, ""),
    "div12l": ("divsh_w", "divsh_w", {"W": 256, "SW": 8, "NA": 12, "NB": 4, "R": 0}, ""),
    "div14l": ("divsh_w", "divsh_w", {"W": 256, "SW": 8, "NA": 14, "NB": 4, "R": 0}, ""),
    "clamp2r": ("clampsh_w", "clampsh_w", {"W": 128, "SW": 7, "K": 2, "NB": 8, "R": 1}, ""),
    "clamp3r": ("clampsh_w", "clampsh_w", {"W": 128, "SW": 7, "K": 3, "NB": 8, "R": 1}, ""),
    "clamp4r": ("clampsh_w", "clampsh_w", {"W": 128, "SW": 7, "K": 4, "NB": 8, "R": 1}, ""),
    "clamp6r": ("clampsh_w", "clampsh_w", {"W": 128, "SW": 7, "K": 6, "NB": 8, "R": 1}, ""),
    "clamp2l": ("clampsh_w", "clampsh_w", {"W": 256, "SW": 8, "K": 2, "NB": 8, "R": 0}, ""),
    "clamp3l": ("clampsh_w", "clampsh_w", {"W": 256, "SW": 8, "K": 3, "NB": 8, "R": 0}, ""),
    "clamp4l": ("clampsh_w", "clampsh_w", {"W": 256, "SW": 8, "K": 4, "NB": 8, "R": 0}, ""),
    "clamp6l": ("clampsh_w", "clampsh_w", {"W": 256, "SW": 8, "K": 6, "NB": 8, "R": 0}, ""),
    "rng4r": ("rngsh_w", "rngsh_w", {"W": 128, "SW": 7, "N": 4, "NB": 8, "R": 1}, ""),
    "rng6r": ("rngsh_w", "rngsh_w", {"W": 128, "SW": 7, "N": 6, "NB": 8, "R": 1}, ""),
    "rng8r": ("rngsh_w", "rngsh_w", {"W": 128, "SW": 7, "N": 8, "NB": 8, "R": 1}, ""),
    "rng12r": ("rngsh_w", "rngsh_w", {"W": 128, "SW": 7, "N": 12, "NB": 8, "R": 1}, ""),
    "rng4l": ("rngsh_w", "rngsh_w", {"W": 256, "SW": 8, "N": 4, "NB": 8, "R": 0}, ""),
    "rng6l": ("rngsh_w", "rngsh_w", {"W": 256, "SW": 8, "N": 6, "NB": 8, "R": 0}, ""),
    "rng8l": ("rngsh_w", "rngsh_w", {"W": 256, "SW": 8, "N": 8, "NB": 8, "R": 0}, ""),
    "rng12l": ("rngsh_w", "rngsh_w", {"W": 256, "SW": 8, "N": 12, "NB": 8, "R": 0}, ""),
    "dot4r": ("dotsh_w", "dotsh_w", {"W": 128, "SW": 7, "K": 4, "R": 1}, ""),
    "dot6r": ("dotsh_w", "dotsh_w", {"W": 128, "SW": 7, "K": 6, "R": 1}, ""),
    "dot8r": ("dotsh_w", "dotsh_w", {"W": 128, "SW": 7, "K": 8, "R": 1}, ""),
    "dot12r": ("dotsh_w", "dotsh_w", {"W": 128, "SW": 7, "K": 12, "R": 1}, ""),
    "dot4l": ("dotsh_w", "dotsh_w", {"W": 256, "SW": 8, "K": 4, "R": 0}, ""),
    "dot6l": ("dotsh_w", "dotsh_w", {"W": 256, "SW": 8, "K": 6, "R": 0}, ""),
    "dot8l": ("dotsh_w", "dotsh_w", {"W": 256, "SW": 8, "K": 8, "R": 0}, ""),
    "dot12l": ("dotsh_w", "dotsh_w", {"W": 256, "SW": 8, "K": 12, "R": 0}, ""),
    "gtc8r": ("gtcntsh_w", "gtcntsh_w", {"W": 128, "SW": 7, "N": 8, "NB": 6, "R": 1}, ""),
    "gtc12r": ("gtcntsh_w", "gtcntsh_w", {"W": 128, "SW": 7, "N": 12, "NB": 6, "R": 1}, ""),
    "gtc16r": ("gtcntsh_w", "gtcntsh_w", {"W": 128, "SW": 7, "N": 16, "NB": 6, "R": 1}, ""),
    "gtc24r": ("gtcntsh_w", "gtcntsh_w", {"W": 128, "SW": 7, "N": 24, "NB": 6, "R": 1}, ""),
    "gtc8l": ("gtcntsh_w", "gtcntsh_w", {"W": 256, "SW": 8, "N": 8, "NB": 6, "R": 0}, ""),
    "gtc12l": ("gtcntsh_w", "gtcntsh_w", {"W": 256, "SW": 8, "N": 12, "NB": 6, "R": 0}, ""),
    "gtc16l": ("gtcntsh_w", "gtcntsh_w", {"W": 256, "SW": 8, "N": 16, "NB": 6, "R": 0}, ""),
    "gtc24l": ("gtcntsh_w", "gtcntsh_w", {"W": 256, "SW": 8, "N": 24, "NB": 6, "R": 0}, ""),
}
KEEP = []  # set from probe.txt (routed/r2 > 3.3, in CAND order) before any ABC sequence runs
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
    return _load(EXP / "fresh_pool" / "run.py", "vdse_ladder_confirm2_fresh_run").fresh_sequences(n)


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
    ap.add_argument("--out", default="/tmp/verified-dse-ladder-confirm2")
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
