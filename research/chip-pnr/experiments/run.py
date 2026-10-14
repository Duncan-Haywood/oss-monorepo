"""Run every design through generic synthesis, SKY130 mapping and OpenROAD; write results.json / results.txt.

Usage: python experiments/run.py [--pdk pdk/orfs/flow/platforms/sky130hd] [--out work]
Environment: OPENROAD (default: openroad on PATH).
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from chip_pnr.parse import parse_log  # noqa: E402
from chip_pnr.synth import DESIGNS, filtered_liberty, generic, synth  # noqa: E402

UTIL = 40
# (name, top, params, clock port, period_ns)
RUNS = []
for w in (8, 16, 32):
    RUNS.append((f"adder_ripple_W{w}", "adder_ripple", {"W": w}, "", 5.0))
    RUNS.append((f"adder_op_W{w}", "adder_op", {"W": w}, "", 5.0))
for w in (4, 8):
    RUNS.append((f"mult_op_W{w}", "mult_op", {"W": w}, "", 5.0))
for aw in (2, 3):
    RUNS.append((f"fifo_W8_AW{aw}", "fifo", {"W": 8, "AW": aw}, "clk", 5.0))
# clock-period sweep on one design: how much does the ABC target move the result?
for p in (2.0, 3.0, 8.0):
    RUNS.append((f"adder_op_W16_T{p:g}", "adder_op", {"W": 16}, "", p))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdk", default=str(HERE.parent / "pdk/orfs/flow/platforms/sky130hd"))
    ap.add_argument("--out", default=str(HERE.parent / "work"))
    a = ap.parse_args()
    pdk, out = Path(a.pdk), Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    lib = out / "sky130_fd_sc_hd_filtered.lib"
    filtered_liberty(pdk / "lib/sky130_fd_sc_hd__tt_025C_1v80.lib", lib)
    orbin = os.environ.get("OPENROAD") or shutil.which("openroad")
    results = []
    for name, top, params, clk, period in RUNS:
        wd = out / name
        wd.mkdir(parents=True, exist_ok=True)
        vfile = DESIGNS / f"{top}.v"
        r = {"name": name, "top": top, "params": params, "period_ns": period, "util_pct": UTIL}
        r.update(generic(top, params, vfile, wd))
        r.update(synth(top, params, vfile, lib, period, wd))
        env = dict(os.environ, PLATFORM=str(pdk), LIBERTY=str(lib), NETLIST=r["netlist"], TOP=top,
                   PERIOD_NS=str(period), UTIL=str(UTIL), OUTDIR=str(wd), CLK_PORT=clk)
        log = subprocess.run([orbin, "-exit", str(HERE.parent / "src/chip_pnr/pnr.tcl")], env=env,
                             capture_output=True, text=True, check=True).stdout
        (wd / "openroad.log").write_text(log)
        r.update(parse_log(log, period))
        r.pop("netlist")
        results.append(r)
        print(name, r["gen_cells"], r["synth_area_um2"], r["final_area_notap"], r["synth_netlist_wns"], r["final_wns"], flush=True)
    ver = subprocess.run([orbin, "-version"], capture_output=True, text=True).stdout.strip()
    yv = subprocess.run(["yosys", "-V"], capture_output=True, text=True).stdout.strip()
    (HERE / "results.json").write_text(json.dumps({"openroad": ver, "yosys": yv, "runs": results}, indent=1))


if __name__ == "__main__":
    main()
