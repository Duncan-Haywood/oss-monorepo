"""Random-weight kws_engine configurations, an Icarus check, and the Yosys + nextpnr (iCE40) flow."""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
RTL = os.path.join(HERE, "..", "..", "rtl")
KWS_RTL = os.path.join(HERE, "..", "..", "..", "accel-kws", "rtl", "kws_engine.v")
sys.path.insert(0, os.path.join(HERE, "..", "..", "..", "accel-kws", "src"))
from accel_kws import model  # noqa: E402  (the integer reference this project reuses)

OUT, ACCW = model.OUT, model.ACCW
DEVICES = {"up5k": {"LUTs": 5280, "EBR": 30, "args": ["--up5k", "--package", "sg48"]},
           "hx8k": {"LUTs": 7680, "EBR": 32, "args": ["--hx8k", "--package", "ct256"]}}


def tool(name):
    """A native binary if installed, else the YoWASP wheel of the same tool."""
    return [shutil.which(name)] if shutil.which(name) else [shutil.which("yowasp-" + name)]


def random_model(inputs, hidden, wbits, seed):
    """Random integer weights of the right shapes and widths. NOT trained: accuracy is meaningless."""
    r = np.random.default_rng(seed)
    lo, hi = -(1 << (wbits - 1)), (1 << (wbits - 1)) - 1
    return model.IntModel(w1=r.integers(lo, hi + 1, (hidden, inputs)), b1=r.integers(-500, 500, hidden),
                          w2=r.integers(lo, hi + 1, (OUT, hidden)), b2=r.integers(-500, 500, OUT),
                          s1=4 + wbits, wbits=wbits, mean=np.zeros(inputs), std=np.ones(inputs))


def _hex(vals, bits):
    mask, nd = (1 << bits) - 1, (bits + 3) // 4
    return "\n".join(format(int(v) & mask, f"0{nd}x") for v in vals) + "\n"


def write_hex(m, x, d):
    for name, vals, bits in (("x", x, 8), ("w1", m.w1.reshape(-1), m.wbits), ("b1", m.b1, ACCW),
                             ("w2", m.w2.reshape(-1), m.wbits), ("b2", m.b2, ACCW)):
        open(os.path.join(d, name + ".hex"), "w").write(_hex(vals, bits))


def params(m):
    return {"IN": m.inputs, "H": m.hidden, "OUT": OUT, "WB": m.wbits, "ACCW": ACCW, "S1": m.s1}


def sim_class(m, x, d):
    """Class the FPGA top's RTL outputs for input x (Icarus), run in directory d (holds the hex files)."""
    tb = os.path.join(d, "tb.v")
    open(tb, "w").write("""module tb; reg clk=0; wire done, dbg; wire [3:0] c; integer n=0;
  kws_top #(.IN(%(IN)d),.H(%(H)d),.OUT(%(OUT)d),.WB(%(WB)d),.ACCW(%(ACCW)d),.S1(%(S1)d)) t(clk,done,c,dbg);
  always #5 clk=~clk; always @(posedge clk) begin n<=n+1; if (done) begin $display("C %%0d", c); $finish; end
  if (n>2000000) $finish; end endmodule\n""" % params(m))
    cmd = ["iverilog", "-g2012", "-o", os.path.join(d, "s.vvp"), tb, os.path.join(RTL, "kws_top.v"), KWS_RTL]
    subprocess.run(cmd, check=True, capture_output=True, text=True)
    out = subprocess.run(["vvp", os.path.join(d, "s.vvp")], cwd=d, check=True, capture_output=True, text=True).stdout
    return int(re.search(r"^C (\d+)", out, re.M).group(1))


def reference_class(m, x):
    lg, _ = model.int_forward(m, np.asarray(x)[None, :])
    return int(np.argmax(lg[0]))      # first maximum, as the RTL


def synth_nextpnr(m, x, device, seeds=(1, 2, 3), freq_mhz=60, top="kws_top"):
    """Yosys synth_ice40 + nextpnr-ice40 on the top with ROMs. Returns resource and Fmax figures."""
    dev = DEVICES[device]
    with tempfile.TemporaryDirectory() as d:
        write_hex(m, x, d)
        sets = "; ".join(f"chparam -set {k} {v} {top}" for k, v in params(m).items())
        ys = (f"read_verilog {os.path.join(RTL, 'kws_top.v')}; read_verilog {KWS_RTL}; {sets}; "
              f"synth_ice40 -top {top} -json d.json; tee -o stat.txt stat")
        subprocess.run(tool("yosys") + ["-q", "-p", ys], cwd=d, check=True, capture_output=True, text=True)
        stat = open(os.path.join(d, "stat.txt")).read()
        cell = lambda n: sum(int(v) for v in re.findall(rf"^\s+{n}\s+(\d+)\s*$", stat, re.M))
        res = {"synth_lc": cell("SB_LUT4"), "synth_ff": sum(int(a) for a in re.findall(r"^\s+SB_DFF\w*\s+(\d+)\s*$", stat, re.M)),
               "synth_carry": cell("SB_CARRY"), "synth_ebr": cell("SB_RAM40_4K")}
        fm = []
        for s in seeds:
            p = subprocess.run(tool("nextpnr-ice40") + dev["args"] + ["--json", "d.json", "--freq", str(freq_mhz),
                               "--seed", str(s), "--placer", "heap", "--timing-allow-fail"],
                               cwd=d, capture_output=True, text=True)
            log = p.stdout + p.stderr
            if "ERROR" in log and "Max frequency" not in log:
                err = [l for l in log.splitlines() if "ERROR" in l][:1]
                return {**res, "fits": False, "why": err[0] if err else "nextpnr failed", "fmax": None}
            mf = re.findall(r"Max frequency for clock\s+'[^']*':\s+([\d.]+) MHz", log)
            fm.append(float(mf[-1]))
            lc = re.findall(r"ICESTORM_LC:\s+(\d+)/\s*(\d+)", log)[-1]
            res["pnr_lc"] = int(lc[0])
            ram = re.findall(r"ICESTORM_RAM:\s+(\d+)/", log)
            res["pnr_ebr"] = int(ram[-1]) if ram else 0
        res.update(fits=True, fmax=float(np.median(fm)), fmax_all=fm, device_lc=int(lc[1]))
        return res
