"""One (design, ABC pass sequence) point through the four fidelity rungs of the verified-dse benchmark.

Rung 1  generic gates: Yosys + ABC `-g` gate count and logic depth (no technology).
Rung 2  liberty mapping: the SKY130 HD netlist's area and its no-wire OpenSTA period.
Rung 3  placement: area and period after global placement, CTS (FIFO), repair_design, detailed placement.
Rung 4  global route + repair_timing -setup (parasitics from the global route); the reference ("routed").
Rungs 2 to 4 come out of one OpenROAD run; stage wall times are stamped inside it. The OpenROAD script and log
parser are chip-pnr's, imported by path; only timestamps are injected.
"""
import os
import re
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parents[2]
PNR = HERE.parent / "chip-pnr"
sys.path.insert(0, str(PNR / "src"))
from chip_pnr.parse import parse_log  # noqa: E402
from chip_pnr.synth import filtered_liberty  # noqa: E402

DESIGNS_DIR = HERE / "designs"
GATES = "AND,NAND,OR,NOR,XOR,XNOR,ANDNOT,ORNOT,MUX"
PASSES = ["balance", "rewrite", "rewrite -z", "refactor", "refactor -z", "dc2", "dch"]
UTIL = int(os.environ.get("VDSE_UTIL", 40))  # placement utilisation %; 40 is the default corner of every earlier milestone
# name: (file stem, top, parameters, clock port)
DESIGNS = {
    "adder_op16": ("adder_op", "adder_op", {"W": 16}, ""),
    "adder_ripple16": ("adder_ripple", "adder_ripple", {"W": 16}, ""),
    "mult8": ("mult_op", "mult_op", {"W": 8}, ""),
    "mac4": ("mac4", "mac4", {}, ""),
    "alu8": ("alu8", "alu8", {}, ""),
    "popcount16": ("popcount16", "popcount16", {}, ""),
    "barrel16": ("barrel16", "barrel16", {}, ""),
    "crc16": ("crc16", "crc16", {}, ""),
    "cmp_sat12": ("cmp_sat", "cmp_sat", {}, ""),
    "fifo8x4": ("fifo", "fifo", {"W": 8, "AW": 2}, "clk"),
}


def script_text(seq):
    return "; ".join(["strash"] + list(seq) + ["map"])


def _yosys(script, log):
    p = subprocess.run(["yosys", "-q", "-l", str(log), "-p", script], capture_output=True, text=True)
    if p.returncode:
        raise RuntimeError((p.stderr.strip() or p.stdout)[-300:])


def _front(design, sets):
    stem, top, params, _ = DESIGNS[design]
    chp = f"chparam {' '.join(f'-set {k} {v}' for k, v in params.items())} {top}; " if params else ""
    return top, f"read_verilog -sv {DESIGNS_DIR / (stem + '.v')}; {chp}hierarchy -top {top}; synth -flatten -top {top} -noabc; "


def rung1(design, seq, wd):
    top, front = _front(design, None)
    abc = Path(wd) / "r1.abc"
    abc.write_text(script_text(seq) + "\n")
    t0 = time.time()
    st = Path(wd) / "r1.stat"
    _yosys(front + f"abc -g {GATES} -script {abc}; opt_clean -purge; tee -o {st} stat; tee -a {st} ltp -noff", Path(wd) / "r1.log")
    txt = st.read_text()
    cells = int(re.search(r"Number of cells:\s*(\d+)", txt).group(1))
    depth = int(re.search(r"Longest topological path in \S+ \(length=(\d+)\)", txt).group(1))
    return {"r1_cells": cells, "r1_depth": depth, "t1": time.time() - t0}


def run_point(design, seq, period, wd, lib, pdk, openroad):
    """Return all rung numbers for one point; raises RuntimeError if ABC rejects the sequence."""
    wd = Path(wd)
    wd.mkdir(parents=True, exist_ok=True)
    stem, top, params, clk = DESIGNS[design]
    r = {"design": design, "seq": list(seq), "period_ns": period}
    r.update(rung1(design, seq, wd))
    t0 = time.time()
    _, front = _front(design, None)
    abc = wd / "r2.abc"
    abc.write_text(script_text(seq) + "\n")
    net = wd / "mapped.v"
    _yosys(front + f"dfflibmap -liberty {lib}; abc -liberty {lib} -script {abc}; "
           f"hilomap -singleton -hicell sky130_fd_sc_hd__conb_1 HI -locell sky130_fd_sc_hd__conb_1 LO; "
           f"opt_clean -purge; write_verilog -noattr -noexpr {net}", wd / "r2.log")
    r["t2_yosys"] = time.time() - t0
    tcl = (PNR / "src/chip_pnr/pnr.tcl").read_text()
    tcl = re.sub(r'^(puts "STAGE (\w+)")$', r'\1\nputs "TIME \2 [clock milliseconds]"', tcl, flags=re.M)
    tcl = 'puts "TIME start [clock milliseconds]"\n' + tcl
    (wd / "pnr.tcl").write_text(tcl)
    env = dict(os.environ, PLATFORM=str(pdk), LIBERTY=str(lib), NETLIST=str(net), TOP=top, PERIOD_NS=str(period),
               UTIL=str(UTIL), OUTDIR=str(wd), CLK_PORT=clk, OMP_NUM_THREADS="1")
    p = subprocess.run([openroad, "-threads", "1", "-exit", str(wd / "pnr.tcl")], env=env, capture_output=True, text=True)
    (wd / "openroad.log").write_text(p.stdout)
    if p.returncode:
        raise RuntimeError("openroad: " + p.stdout[-300:])
    r.update({k: v for k, v in parse_log(p.stdout, period).items() if k != "cell_usage"})
    t = {m.group(1): int(m.group(2)) / 1000 for m in re.finditer(r"^TIME (\w+) (\d+)$", p.stdout, flags=re.M)}
    r["t_pnr_to_synth_netlist"] = t["synth_netlist"] - t["start"]
    r["t_pnr_to_detail_place"] = t["detail_place"] - t["start"]
    r["t_pnr_total"] = t["usage"] - t["start"]
    return r


def scores(r):
    """Area-delay product (um^2 * ns) at each rung; lower is better."""
    p = r["period_ns"]
    return {
        "r1": r["r1_cells"] * r["r1_depth"],
        "r2": r["synth_netlist_area"] * (p - r["synth_netlist_wns"]),
        "r3": r["detail_place_area"] * (p - r["detail_place_wns"]),
        "r4": r["final_area_notap"] * (p - r["final_wns"]),
    }
