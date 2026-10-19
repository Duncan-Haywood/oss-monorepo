"""Streaming KWS engine for a Tiny Tapeout tile: integer reference, host stream builder, Icarus run, Yosys/SKY130 synthesis."""
import os, re, subprocess, tempfile
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
RTL_DIR = os.path.join(HERE, "..", "..", "rtl")
OUT, ACCW, BIASW = 11, 20, 16
LIB_REL = os.path.join("orfs", "flow", "platforms", "sky130hd", "lib", "sky130_fd_sc_hd__tt_025C_1v80.lib")


def cycles(IN, H):
    """Cycles per inference, from the schedule documented in rtl/kws_tt.v (the last one is the FIN cycle)."""
    return H * (2 + IN) + OUT * (2 + H) + 1


def random_model(IN, H, wb, seed, s1=4):
    rng = np.random.default_rng(seed)
    q = (1 << (wb - 1)) - 1
    return dict(IN=IN, H=H, wb=wb, s1=s1,
                w1=rng.integers(-q, q + 1, (H, IN)), b1=rng.integers(-3000, 3001, H),
                w2=rng.integers(-q, q + 1, (OUT, H)), b2=rng.integers(-3000, 3001, OUT))


def reference(m, xq):
    """Integer contract of accel-kws (ReLU after >> s1, clip 0..255, first-maximum argmax). Returns (class, logits)."""
    a1 = xq @ m["w1"].T + m["b1"]
    assert np.abs(a1).max() < (1 << (ACCW - 1))
    h = np.clip(a1 >> m["s1"], 0, 255)
    a2 = h @ m["w2"].T + m["b2"]
    assert np.abs(a2).max() < (1 << (ACCW - 1))
    return np.argmax(a2, axis=1), a2


def stream(m, xq):
    """One {uio_in, ui_in} word per clock for each row of xq, with one idle word after each inference.
    Start is uio_in[7] on the first word. Returns list of 16-bit words."""
    wm = (1 << m["wb"]) - 1
    words = []
    for x in xq:
        first = True
        def put(ui, w):
            nonlocal first
            words.append((((int(w) & wm) | (0x80 if first else 0)) << 8) | (int(ui) & 255))
            first = False
        for j in range(m["H"]):
            b = int(m["b1"][j]) & 0xFFFF
            put(b & 255, 0); put(b >> 8, 0)
            for i in range(m["IN"]):
                put(x[i], m["w1"][j, i])
        for k in range(OUT):
            b = int(m["b2"][k]) & 0xFFFF
            put(b & 255, 0); put(b >> 8, 0)
            for j in range(m["H"]):
                put(0, m["w2"][k, j])
        words.append(0)
    return words


def simulate(m, xq):
    """Replay the stream in Icarus. Returns (classes, cycles per inference as the gap between dones)."""
    words = stream(m, xq)
    with tempfile.TemporaryDirectory() as d:
        open(os.path.join(d, "stream.hex"), "w").write("\n".join(f"{w:04x}" for w in words) + "\n")
        out = os.path.join(d, "sim.vvp")
        params = dict(IN=m["IN"], H=m["H"], OUT=OUT, WB=m["wb"], ACCW=ACCW, S1=m["s1"], NCYC=len(words))
        cmd = ["iverilog", "-g2012", "-o", out] + [f"-Ptb_kws_tt.{k}={v}" for k, v in params.items()] + [
            os.path.join(RTL_DIR, "tb_kws_tt.v"), os.path.join(RTL_DIR, "kws_tt.v")]
        subprocess.run(cmd, check=True, capture_output=True, text=True)
        res = subprocess.run(["vvp", out], cwd=d, check=True, capture_output=True, text=True).stdout
    ev = [l.split() for l in res.splitlines() if l.startswith("D ")]
    return np.array([int(e[2]) for e in ev]), [int(e[1]) for e in ev]


def parse_stat(out):
    out = out[out.rfind("Number of cells"):] if "Number of cells" in out else out
    cells = {m.group(1): int(m.group(2)) for m in re.finditer(r"^\s+(sky130_fd_sc_hd__\w+)\s+(\d+)", out, re.M)}
    area = float(re.search(r"Chip area for (?:top )?module '[^']*':\s*([\d.]+)", out).group(1))
    return cells, area


def synth(IN, H, wb, libdir, top="kws_tt", file="kws_tt.v", extra=""):
    """Yosys synth -flatten, dfflibmap, abc to SKY130 HD typical corner. Returns dict(cells, area_um2, flops, by_cell)."""
    lib = os.path.join(libdir, LIB_REL)
    p = dict(IN=IN, H=H, OUT=OUT, WB=wb, ACCW=ACCW, S1=4)
    sets = "; ".join(f"chparam -set {k} {v} {top}" for k, v in p.items())
    ys = (f"read_liberty -overwrite -setattr blackbox -lib {lib}; read_verilog {os.path.join(RTL_DIR, file)}; {sets}; "
          f"hierarchy -top {top}; synth -flatten -top {top}; dfflibmap -liberty {lib}; abc -liberty {lib}; "
          f"opt_clean -purge; tee -o /dev/stdout stat -liberty {lib}")
    out = subprocess.run(["yosys", "-q", "-p", ys], check=True, capture_output=True, text=True).stdout
    by, area = parse_stat(out)
    flops = sum(v for k, v in by.items() if re.search(r"__(df|edf)", k))
    return dict(cells=sum(by.values()), area_um2=area, flops=flops, by_cell=by)
