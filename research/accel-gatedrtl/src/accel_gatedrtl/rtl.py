"""Simulate the four gated_engine modes in Icarus Verilog and synthesise them with Yosys against the SKY130 HD liberty file."""
import os, re, subprocess, tempfile
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
RTL_DIR = os.path.join(HERE, "..", "..", "rtl")
WB, ACCW = 4, 24
MODES = {0: "OS", 1: "WS ungated", 2: "WS gate/acc", 3: "WS gate/set"}
LIB_REL = os.path.join("orfs", "flow", "platforms", "sky130hd", "lib", "sky130_fd_sc_hd__tt_025C_1v80.lib")


def _hex(vals, bits):
    mask, nd = (1 << bits) - 1, (bits + 3) // 4
    return "\n".join(format(int(v) & mask, f"0{nd}x") for v in vals) + "\n"


def random_problem(O, I, B, N, seed):
    rng = np.random.default_rng(seed)
    W = rng.integers(-(1 << (WB - 1)), 1 << (WB - 1), (O, I))
    X = rng.integers(-128, 128, (N, B, I))
    return W, X


def simulate(mode, O, I, B, P, W, X):
    """Returns per-problem [cycles, weight fetches, activation fetches, accumulator bits written] and y (N x B x O)."""
    N = len(X)
    with tempfile.TemporaryDirectory() as d:
        open(os.path.join(d, "x.hex"), "w").write(_hex(X.reshape(-1), 8))
        open(os.path.join(d, "w.hex"), "w").write(_hex(W.reshape(-1), WB))
        out = os.path.join(d, "sim.vvp")
        params = dict(O=O, I=I, B=B, P=P, WB=WB, ACCW=ACCW, N=N, MODE=mode)
        cmd = ["iverilog", "-g2012", "-o", out] + [f"-Ptb_gated.{k}={v}" for k, v in params.items()] + [
            os.path.join(RTL_DIR, f) for f in ("tb_gated.v", "gated_engine.v", "icg.v")]
        subprocess.run(cmd, check=True, capture_output=True, text=True)
        res = subprocess.run(["vvp", out], cwd=d, check=True, capture_output=True, text=True).stdout
    m, ys = [], []
    for line in res.splitlines():
        if line.startswith("R "):
            p = line.split()
            m.append([int(v) for v in p[2:6]]); ys.append(np.array([int(v) for v in p[6:]]).reshape(B, O))
    assert len(m) == N, res[-400:]
    return np.array(m), np.array(ys)


def parse_stat(out):
    """Cell counts and total area from Yosys `stat -liberty` output (last design block)."""
    out = out[out.rfind("Number of cells"):] if "Number of cells" in out else out
    cells = {m.group(1): int(m.group(2)) for m in re.finditer(r"^\s+(sky130_fd_sc_hd__\w+)\s+(\d+)", out, re.M)}
    area = float(re.search(r"Chip area for (?:top )?module '[^']*':\s*([\d.]+)", out).group(1))
    return cells, area


def synth(mode, O, I, B, P, libdir):
    """Yosys `synth -flatten`, dfflibmap and abc to SKY130 HD (typical corner); the ICG stays a library cell.
    Returns dict(cells, area_um2, flops, icgs, by_cell)."""
    lib = os.path.join(libdir, LIB_REL)
    p = dict(O=O, I=I, B=B, P=P, WB=WB, ACCW=ACCW, MODE=mode)
    sets = "; ".join(f"chparam -set {k} {v} gated_engine" for k, v in p.items())
    rd = " ".join(os.path.join(RTL_DIR, f) for f in ("gated_engine.v", "icg.v"))
    ys = (f"read_liberty -overwrite -setattr blackbox -lib {lib}; read_verilog -DSYNTH -DSKY130 {rd}; {sets}; "
          f"hierarchy -top gated_engine; synth -flatten -top gated_engine; dfflibmap -liberty {lib}; "
          f"abc -liberty {lib}; opt_clean -purge; tee -o /dev/stdout stat -liberty {lib}")
    out = subprocess.run(["yosys", "-q", "-p", ys], check=True, capture_output=True, text=True).stdout
    by, area = parse_stat(out)
    flops = sum(v for k, v in by.items() if re.search(r"__(df|edf|dl)", k) and "dlclkp" not in k)
    return dict(cells=sum(by.values()), area_um2=area, flops=flops,
                icgs=sum(v for k, v in by.items() if "dlclkp" in k), by_cell=by)
