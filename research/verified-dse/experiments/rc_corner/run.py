"""Milestone 156: the ss corner with its own wire RC. Milestone 143's 27 analysed designs, rerun at SKY130 HD ss_100C_1v60 with the
ORFS setRC.tcl replaced by the PDK's max-RC corner (derive_rc.py: per-unit-length R x 1.28 to 1.36, C x 1.04 to 1.14, so RC x 1.41 to
1.46 per layer), the usual signoff setup corner (slow cells, worst-case wires). Everything else is milestone 143's: liberty (same
sha256), 40% utilisation, the 120 sequences of milestone 108, each design's clock tag and its target (milestone 143's ss baseline
no-wire period x 1.0 or 1.5; the no-wire period is measured before placement, so it does not depend on RC and is reused, not
re-measured).

Two arms, same tools: "nom" (the ORFS platform as it is, milestone 143's setting) and "rcmax". The control (--control: the first
design, its first 12 sequences, nominal RC) found that today's tools (Yosys 0.71, OpenROAD 26Q3 as built by nixpkgs today) do not
reproduce milestone 143's rows: the mapped netlist differs on 6 of 11 ok points and the routed numbers on all 11 (control.jsonl). So
milestone 143's table cannot be the nominal arm; this flow reruns it with the same tools as the rcmax arm, and the pair differs in
wire RC only. The nominal arm doubles as a tool-version replication of milestone 143 (reported, not predicted).

Order: milestone 141's seed-141 ORDER restricted to milestone 143's 27 complete designs (its prefix), each design's nom points then
its rcmax points. The flow is stopped when it finishes or at 110 minutes of wall-clock, whichever is first; the analysed set is the
longest prefix of that order whose designs are complete in both arms, a rule that depends on no result.

Usage: python run.py --openroad <bin> --lib /tmp/ss.lib --rules <open_pdks>/sky130/librelane [--pdk <sky130hd>] [--jobs 4] [--resume]
       python run.py ... --control
"""
import argparse
import hashlib
import importlib.util
import json
import os
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


M143 = _load(EXP / "corner_ss_blind" / "run.py", "vdse_m156_r143")
DRC = _load(HERE / "derive_rc.py", "vdse_m156_drc")
M143_META = json.loads((EXP / "corner_ss_blind" / "meta.json").read_text())
M143_ROWS = [json.loads(l) for l in (EXP / "corner_ss_blind" / "results.jsonl").read_text().splitlines()]
ORDER = M143.complete(M143_ROWS)  # milestone 143's 27 analysed designs, in its order
assert len(ORDER) == 27, len(ORDER)
CLOCK = {d: M143.CLOCK[d] for d in ORDER}
BASE = {d: M143_META["base_period_ns"][d] for d in ORDER}
FACTORS = M143.FACTORS
CORNER = "ss_100C_1v60+rcmax"
TABLE = HERE / "results.jsonl"
CONTROL = HERE / "control.jsonl"
META = HERE / "meta.json"


def complete(rows, n=120):
    """The longest prefix of ORDER with n rows per design in both arms."""
    cnt = {}
    for r in rows:
        cnt[(r["design"], r["corner"])] = cnt.get((r["design"], r["corner"]), 0) + 1
    out = []
    for d in ORDER:
        if cnt.get((d, CORNER), 0) < n or cnt.get((d, "ss_100C_1v60"), 0) < n:
            break
        out.append(d)
    return out


def task(a):
    r = M143.task(a)
    r["corner"] = CORNER if "rcmax" in str(a[6]) else "ss_100C_1v60"
    return r


def rc_platform(pdk, rules, out):
    """A copy of the platform directory (symlinks) whose setRC.tcl is the max-RC one."""
    plat = out / "sky130hd_rcmax"
    plat.mkdir(parents=True, exist_ok=True)
    for f in Path(pdk).iterdir():
        if f.name != "setRC.tcl" and not (plat / f.name).exists():
            os.symlink(f, plat / f.name)
    txt = DRC.scaled_setrc((Path(pdk) / "setRC.tcl").read_text(), DRC.ratios(rules, "max"))
    (plat / "setRC.tcl").write_text(txt)
    return plat, hashlib.sha256(txt.encode()).hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--openroad", required=True)
    ap.add_argument("--lib", required=True)
    ap.add_argument("--rules", required=True, help="open_pdks sky130/librelane directory")
    ap.add_argument("--pdk", default="/tmp/pdk/orfs/flow/platforms/sky130hd")
    ap.add_argument("--out", default="/tmp/verified-dse-rc-corner")
    ap.add_argument("--n", type=int, default=120)
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--resume", action="store_true")
    ap.add_argument("--control", action="store_true")
    a = ap.parse_args()
    if flow.UTIL != 40:
        sys.exit("unset VDSE_UTIL")
    if hashlib.sha256(Path(a.lib).read_bytes()).hexdigest() != M143.SHA256:
        sys.exit("not milestone 143's ss liberty")
    M143.M141.install()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    lib = out / "lib.lib"
    flow.filtered_liberty(Path(a.lib), lib)
    seqs = M143.M141.R138.fresh_sequences(a.n)
    if a.control:
        d = ORDER[0]
        tasks = [(d, s, CLOCK[d], round(BASE[d] * FACTORS[CLOCK[d]], 3), out / "control" / f"{CLOCK[d]}_{i}", lib, Path(a.pdk), a.openroad)
                 for i, s in enumerate(seqs[:12])]
        with Pool(a.jobs) as pool:
            rows = pool.map(task, tasks)
        CONTROL.write_text("".join(json.dumps(r) + "\n" for r in rows))
        return
    plat, sha = rc_platform(a.pdk, a.rules, out)
    META.write_text(json.dumps({"corner": CORNER, "util": 40, "liberty_sha256": M143.SHA256, "setrc_sha256": sha,
                                "open_pdks_commit": DRC.OPEN_PDKS_COMMIT, "rcx_sha256": DRC.SHA256,
                                "rc_ratios_max_over_nom": {k: [round(v[0], 4), round(v[1], 4)] for k, v in DRC.ratios(a.rules, "max").items()},
                                "base_period_ns": BASE, "order": ORDER, "clock": CLOCK, "n_sequences": len(seqs), "seed": 108,
                                "tools": {"yosys": flow.yosys_version() if hasattr(flow, "yosys_version") else os.popen("yosys -V").read().strip(),
                                          "openroad": os.popen(f"{a.openroad} -version").read().strip()}}, indent=1))
    arms = [("nom", Path(a.pdk)), ("rcmax", plat)]
    tasks = [(d, s, CLOCK[d], round(BASE[d] * FACTORS[CLOCK[d]], 3), out / arm / d / f"{CLOCK[d]}_{i}", lib, pp, a.openroad)
             for d in ORDER for arm, pp in arms for i, s in enumerate(seqs)]

    def key(t):
        return (t[0], CORNER if "rcmax" in str(t[6]) else "ss_100C_1v60", tuple(t[1]))
    if a.resume and TABLE.exists():
        done = {(r["design"], r["corner"], tuple(r["seq"])) for r in map(json.loads, TABLE.read_text().splitlines())}
        tasks = [t for t in tasks if key(t) not in done]
    print(f"{len(tasks)} points to run", flush=True)
    with Pool(a.jobs) as pool, open(TABLE, "a" if a.resume else "w") as fh:
        for i, r in enumerate(pool.imap_unordered(task, tasks, chunksize=1)):
            fh.write(json.dumps(r) + "\n")
            fh.flush()
            if i % 50 == 0:
                print(i, len(tasks), flush=True)


if __name__ == "__main__":
    main()
