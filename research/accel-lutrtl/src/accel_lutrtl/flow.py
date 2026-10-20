"""Generate a random shared-weight layer, run both engines in Icarus Verilog, compare with an
integer NumPy reference, and synthesise both with Yosys (generic gates, no technology library).

The layer is synthetic: random codebook and indices, random 4-bit activations. It exercises the
datapaths, not a trained model's accuracy (that is accel-lut's job)."""
import os, re, subprocess, tempfile
import numpy as np

RTL = os.path.join(os.path.dirname(__file__), "..", "..", "rtl")
FIN = 64

# Assumed gate-equivalent weights (NAND2 = 1). Rough textbook ratios, NOT from a cell library.
GE = {"$_NOT_": 0.5, "$_AND_": 1.5, "$_NAND_": 1.0, "$_OR_": 1.5, "$_NOR_": 1.0, "$_XOR_": 2.5,
      "$_XNOR_": 2.5, "$_ANDNOT_": 1.5, "$_ORNOT_": 1.5, "$_MUX_": 2.5, "$_AOI3_": 1.5,
      "$_OAI3_": 1.5, "$_AOI4_": 2.0, "$_OAI4_": 2.0, "$_NMUX_": 2.5}
DFF_GE = 5.0


def make_layer(n, k, seed):
    rng = np.random.default_rng(seed)
    cb = np.sort(rng.integers(-127, 128, k)).astype(np.int64)
    idx = rng.integers(0, k, (FIN, n))              # idx[i][o]
    a = rng.integers(0, 16, FIN).astype(np.int64)
    w = cb[idx]                                     # w[i][o]
    y = a @ w                                       # exact integer reference
    return cb, idx, a, y


def _hex(vals, bits):
    m = (1 << bits) - 1
    return "\n".join(format(int(v) & m, "x") for v in vals) + "\n"


def write_inputs(d, cb, idx, a, n):
    w_oi = cb[idx].T.reshape(-1)                    # address o*FIN+i
    open(f"{d}/w.hex", "w").write(_hex(w_oi, 8))
    open(f"{d}/idx.hex", "w").write(_hex(idx.reshape(-1), 4 if len(cb) <= 16 else 8))  # i*N+o
    open(f"{d}/cb.hex", "w").write(_hex(cb, 8))
    abits = 0
    for i, v in enumerate(a):
        abits |= int(v) << (4 * i)
    open(f"{d}/a.hex", "w").write(format(abits, "x") + "\n")


def tb(engine, n, k, d):
    inst = (f"mac_engine #(.N({n}), .FIN({FIN}), .FILE(\"{d}/w.hex\")) dut"
            if engine == "mac" else
            f"table_engine #(.N({n}), .FIN({FIN}), .K({k}), .IDXFILE(\"{d}/idx.hex\"), "
            f".CBFILE(\"{d}/cb.hex\")) dut")
    return f"""module tb;
  reg clk = 0, rst = 1, start = 0; reg [{FIN*4-1}:0] a_mem [0:0];
  wire y_valid, done; wire [15:0] y_idx; wire signed [19:0] y;
  integer cyc = 0, t0 = 0;
  {inst} (.clk(clk), .rst(rst), .start(start), .a_flat(a_mem[0]),
          .y_valid(y_valid), .y_idx(y_idx), .y(y), .done(done));
  always #5 clk = ~clk;
  always @(posedge clk) begin cyc <= cyc + 1; if (y_valid) $display("Y %0d %0d", y_idx, y);
    if (done) begin $display("CYCLES %0d", cyc - t0); $finish; end end
  initial begin $readmemh("{d}/a.hex", a_mem); #22 rst = 0; #10 start = 1; t0 = cyc + 1; #10 start = 0;
    #50000000 $display("TIMEOUT"); $finish; end
endmodule
"""


def simulate(engine, n, k, cb, idx, a, y_ref):
    with tempfile.TemporaryDirectory() as d:
        write_inputs(d, cb, idx, a, n)
        open(f"{d}/tb.v", "w").write(tb(engine, n, k, d))
        src = "mac_engine.v" if engine == "mac" else "table_engine.v"
        subprocess.run(["iverilog", "-g2012", "-o", f"{d}/sim", f"{d}/tb.v", f"{RTL}/{src}"], check=True)
        out = subprocess.run(["vvp", f"{d}/sim"], capture_output=True, text=True, check=True).stdout
    ys = {int(m[0]): int(m[1]) for m in re.findall(r"^Y (\d+) (-?\d+)$", out, re.M)}
    cyc = int(re.search(r"CYCLES (\d+)", out).group(1))
    ok = len(ys) == n and all(ys[o] == int(y_ref[o]) for o in range(n))
    return ok, cyc


def synth(engine, n, k, cb, idx, a):
    """Yosys `synth -flatten=off` then `abc` to generic gates; returns per-module-class stats."""
    with tempfile.TemporaryDirectory() as d:
        write_inputs(d, cb, idx, a, n)
        src = "mac_engine.v" if engine == "mac" else "table_engine.v"
        top = "mac_engine" if engine == "mac" else "table_engine"
        par = f"chparam -set N {n} {top}; "
        if engine == "table":
            par += f"chparam -set K {k} {top}; "
        # the ROM contents must be elaborated from the hex files in cwd
        script = (f"read_verilog -sv {RTL}/{src}; {par}hierarchy -top {top}; "
                  f"synth -top {top}; abc -g AND,NAND,OR,NOR,XOR,XNOR,ANDNOT,ORNOT,MUX; opt_clean; "
                  f"tee -o {d}/stat.json stat -json")
        env = dict(os.environ)
        res = subprocess.run(["yosys", "-q", "-p", script], capture_output=True, text=True, cwd=d)
        if res.returncode:
            raise RuntimeError(res.stdout[-2000:] + res.stderr[-2000:])
        import json
        st = json.load(open(f"{d}/stat.json"))
    return st


def summarise(st):
    """Split cells into ROM logic (modules named *rom*) and datapath (everything else)."""
    mods = st["modules"]
    out = {"rom_ge": 0.0, "dp_ge": 0.0, "dp_ff": 0, "dp_ge_logic": 0.0}
    for name, m in mods.items():
        ge = sum(GE.get(c, 0.0) * v for c, v in m["num_cells_by_type"].items())
        ff = sum(v for c, v in m["num_cells_by_type"].items() if "DFF" in c)
        if "rom" in name:
            out["rom_ge"] += ge
        else:
            out["dp_ge_logic"] += ge
            out["dp_ff"] += ff
    out["dp_ge"] = out["dp_ge_logic"] + DFF_GE * out["dp_ff"]
    return out
