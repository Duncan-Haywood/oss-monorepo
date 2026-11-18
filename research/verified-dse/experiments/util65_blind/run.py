"""Milestone 141: the one-clock blind designs of milestones 137, 138 and 140 rerun at 65% placement utilisation (VDSE_UTIL=65),
a second operating point for the blind evaluation.

Every blind result so far (73 designs, milestones 136 to 140) is at one corner: tt 25C 1.8 V, 40% placement utilisation. A tighter
placement makes routing dearer and changes which mapped netlist routes best, so the question is whether the clipped ladder SWC's edge
over equal-cost random routing is a property of the rule or of the 40% operating point.

Designs: the 52 one-clock blind designs (milestone 137's 12 kept, milestone 138's 40), each at the clock milestone 137 or 138 fixed for
it and at the same clock target (the baseline no-wire period read from their meta.json: the mapped netlist and its period do not
depend on utilisation). Milestone 108's 120 fresh ABC pass sequences (seed 108). Run order: a seed-141 shuffle of the 52, fixed here
before any point runs; if the flow stops for time, the analysed set is the longest prefix of ORDER whose designs are all complete
(`complete()`), a rule that depends on no result. Milestone 136's 21 two-clock designs are left out (two cells per design at a
different protocol; their tables are older).

Usage: VDSE_UTIL=65 python experiments/util65_blind/run.py --openroad <bin> [--pdk <sky130hd dir>] [--jobs 4] [--resume]
"""
import argparse
import importlib.util
import json
import os
import random
import sys
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
sys.path.insert(0, str(EXP.parent / "src"))
from verified_dse import flow  # noqa: E402

UTIL = 65


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


R137 = _load(EXP / "ladder_confirm" / "run.py", "vdse_m141_r137")
R138 = _load(EXP / "ladder_confirm2" / "run.py", "vdse_m141_r138")
SRC = {d: "ladder_confirm" for d in R137.KEEP} | {d: "ladder_confirm2" for d in R138.KEEP}
NEW = {d: R137.CAND[d] for d in R137.KEEP} | {d: R138.CAND[d] for d in R138.KEEP}
CLOCK = {d: R137.CLOCK[d] for d in R137.KEEP} | {d: R138.CLOCK[d] for d in R138.KEEP}
FACTORS = {"tight": 1.0, "relaxed": 1.5}
BASE = {}
for _src in ("ladder_confirm", "ladder_confirm2"):
    BASE.update(json.loads((EXP / _src / "meta.json").read_text())["base_period_ns"])
ORDER = sorted(NEW)
random.Random(141).shuffle(ORDER)


def complete(rows, n=120):
    """The longest prefix of ORDER with n rows per design in rows (dicts with a "design" key)."""
    cnt = {}
    for r in rows:
        cnt[r["design"]] = cnt.get(r["design"], 0) + 1
    out = []
    for d in ORDER:
        if cnt.get(d, 0) < n:
            break
        out.append(d)
    return out


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
    r["util"] = flow.UTIL
    return r


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--openroad", required=True)
    ap.add_argument("--pdk", default="/tmp/pdk/orfs/flow/platforms/sky130hd")
    ap.add_argument("--out", default="/tmp/verified-dse-util65-blind")
    ap.add_argument("--n", type=int, default=120)
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--resume", action="store_true", help="skip points already in results.jsonl, append the rest")
    a = ap.parse_args()
    if flow.UTIL != UTIL or os.environ.get("VDSE_UTIL") != str(UTIL):
        sys.exit(f"set VDSE_UTIL={UTIL} (flow.UTIL is {flow.UTIL})")
    install()
    out, pdk = Path(a.out), Path(a.pdk)
    out.mkdir(parents=True, exist_ok=True)
    lib = out / "lib.lib"
    flow.filtered_liberty(pdk / "lib/sky130_fd_sc_hd__tt_025C_1v80.lib", lib)
    seqs = R138.fresh_sequences(a.n)
    meta = HERE / "meta.json"
    if not meta.exists():
        meta.write_text(json.dumps({"util": UTIL, "base_period_ns": {d: BASE[d] for d in ORDER}, "n_sequences": len(seqs),
                                    "seed": 108, "order_seed": 141, "order": ORDER, "clock": CLOCK, "source": SRC}, indent=1))
    tasks = [(d, s, CLOCK[d], round(BASE[d] * FACTORS[CLOCK[d]], 3), out / d / f"{CLOCK[d]}_{i}", lib, pdk, a.openroad)
             for d in ORDER for i, s in enumerate(seqs)]
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
