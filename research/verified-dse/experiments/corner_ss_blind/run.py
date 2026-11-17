"""Milestone 143: the one-clock blind designs of milestones 137, 138 and 140 rerun at a second library corner, SKY130 HD
ss_100C_1v60 (slow-slow, 100 C, 1.60 V), at the default 40% placement utilisation: a third operating point for the blind evaluation.

Milestones 141 and 142 moved placement density (65%); this moves cell timing. Only the liberty changes (as milestone 24 did on the seen
designs): the ORFS platform's LEF, tech LEF and RC settings stay, so wire parasitics are unchanged. Because the slow cells make every
path longer, each design's clock target is re-derived from its own baseline at the new corner (the empty-sequence mapped netlist's
no-wire period under ss, times 1.0 at the tight clock or 1.5 at the relaxed one), the protocol of milestones 24 and 28: keeping the tt
targets would turn every point into a timing-repair run, which is a different question.

Designs, clocks and sequences: milestone 141's (the 52 one-clock blind designs, each at the clock milestone 137 or 138 fixed for it;
milestone 108's 120 fresh ABC pass sequences, seed 108). Run order: milestone 141's seed-141 ORDER, unchanged, so a stopped flow's
prefix is the set already run at 40% and (for its first 46) at 65%. If the flow stops for time, the analysed set is the longest prefix
of ORDER whose designs are all complete (`complete()`), a rule that depends on no result.

Liberty: sky130_fd_sc_hd__ss_100C_1v60.lib from the efabless mirror of the SkyWater PDK libraries (Apache-2.0), fetched with
  curl -sSL -o /tmp/ss.lib https://raw.githubusercontent.com/efabless/skywater-pdk-libs-sky130_fd_sc_hd/master/timing/sky130_fd_sc_hd__ss_100C_1v60.lib
(12,845,260 bytes, sha256 9b24f0db3967ac67b4cae1f74bb480fd47922d18d0ed577e3c121739b412c361, checked by this script).

Usage: python experiments/corner_ss_blind/run.py --openroad <bin> --lib /tmp/ss.lib [--pdk <sky130hd dir>] [--jobs 4] [--resume]
(VDSE_UTIL unset or 40)
"""
import argparse
import hashlib
import importlib.util
import json
import sys
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
sys.path.insert(0, str(EXP.parent / "src"))
from verified_dse import flow  # noqa: E402

SHA256 = "9b24f0db3967ac67b4cae1f74bb480fd47922d18d0ed577e3c121739b412c361"
CORNER = "ss_100C_1v60"


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


M141 = _load(EXP / "util65_blind" / "run.py", "vdse_m143_r141")
ORDER, CLOCK, FACTORS, SRC = M141.ORDER, M141.CLOCK, M141.FACTORS, M141.SRC
complete = M141.complete
TABLE = HERE / "results.jsonl"
META = HERE / "meta.json"


def task(a):
    r = M141.task(a)
    r["corner"] = CORNER
    return r


def base_task(a):
    d, wd, lib, pdk, orb = a
    M141.install()
    return d, flow.run_point(d, (), 10.0, wd, lib, pdk, orb)["synth_netlist_period_ns"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--openroad", required=True)
    ap.add_argument("--lib", required=True, help="sky130_fd_sc_hd__ss_100C_1v60.lib")
    ap.add_argument("--pdk", default="/tmp/pdk/orfs/flow/platforms/sky130hd")
    ap.add_argument("--out", default="/tmp/verified-dse-corner-ss-blind")
    ap.add_argument("--n", type=int, default=120)
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--resume", action="store_true", help="skip points already in results.jsonl, append the rest")
    a = ap.parse_args()
    if flow.UTIL != 40:
        sys.exit(f"unset VDSE_UTIL (flow.UTIL is {flow.UTIL}; this milestone is at 40%)")
    if hashlib.sha256(Path(a.lib).read_bytes()).hexdigest() != SHA256:
        sys.exit(f"{a.lib} is not the ss_100C_1v60 liberty this milestone pinned")
    M141.install()
    out, pdk = Path(a.out), Path(a.pdk)
    out.mkdir(parents=True, exist_ok=True)
    lib = out / "lib.lib"
    flow.filtered_liberty(Path(a.lib), lib)
    seqs = M141.R138.fresh_sequences(a.n)
    if META.exists():
        base = json.loads(META.read_text())["base_period_ns"]
    else:  # each design's own no-wire baseline period at the new corner sets its clock target
        with Pool(a.jobs) as pool:
            base = dict(pool.map(base_task, [(d, out / d / "base", lib, pdk, a.openroad) for d in ORDER]))
        META.write_text(json.dumps({"corner": CORNER, "util": 40, "liberty_sha256": SHA256, "base_period_ns": {d: base[d] for d in ORDER},
                                    "tt_base_period_ns": {d: M141.BASE[d] for d in ORDER}, "n_sequences": len(seqs), "seed": 108,
                                    "order_seed": 141, "order": ORDER, "clock": CLOCK, "source": SRC}, indent=1))
    tasks = [(d, s, CLOCK[d], round(base[d] * FACTORS[CLOCK[d]], 3), out / d / f"{CLOCK[d]}_{i}", lib, pdk, a.openroad)
             for d in ORDER for i, s in enumerate(seqs)]
    if a.resume and TABLE.exists():
        done = {(r["design"], r["tag"], tuple(r["seq"])) for r in map(json.loads, TABLE.read_text().splitlines())}
        tasks = [t for t in tasks if (t[0], t[2], tuple(t[1])) not in done]
    print(f"{len(tasks)} points to run", flush=True)
    with Pool(a.jobs) as pool, open(TABLE, "a" if a.resume else "w") as fh:
        for i, r in enumerate(pool.imap_unordered(task, tasks, chunksize=1)):
            fh.write(json.dumps(r) + "\n")
            fh.flush()
            if i % 50 == 0:
                print(i, len(tasks), flush=True)


if __name__ == "__main__":
    main()
