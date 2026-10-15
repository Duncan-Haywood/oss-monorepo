"""Three automated checkers for a mutant of the `accel` module, each returning (killed, seconds)."""
import os
import re
import subprocess
import tempfile
import time

import numpy as np

from chip_accel import gen, model
from chip_accel.model import NIN, NOUT

MAXCYC = 200


def _tb(wb, xs):
    body = "\n".join(f"    run({NIN*wb}'d{sum((int(v) & ((1 << wb) - 1)) << (j * wb) for j, v in enumerate(x))});" for x in xs)
    return f"""module tb;
  reg clk = 0, rst = 1, start = 0; reg [{NIN*wb}-1:0] x; wire done; wire [{NOUT*wb}-1:0] y;
  integer cyc;
  accel dut(clk, rst, start, x, done, y);
  always #5 clk = ~clk;
  task run(input [{NIN*wb}-1:0] xin);
    begin
      @(negedge clk); x = xin; start = 1; @(negedge clk); start = 0; cyc = 1;
      while (!done && cyc < {MAXCYC}) begin @(negedge clk); cyc = cyc + 1; end
      $display("OUT %0d %0d %0d", cyc, done, y);
    end
  endtask
  initial begin
    repeat (2) @(negedge clk); rst = 0;
{body}
    $finish;
  end
endmodule
"""


def sim_first_mismatch(q, p, verilog, xs):
    """Run the vectors in order against the integer reference and the expected cycle count; return the index of the
    first vector whose output or latency differs, or None. A compile failure raises RuntimeError."""
    wb = q["wb"]
    ref = model.int_forward(q, xs)
    with tempfile.TemporaryDirectory() as d:
        open(f"{d}/a.v", "w").write(verilog); open(f"{d}/tb.v", "w").write(_tb(wb, xs))
        r = subprocess.run(["iverilog", "-g2012", "-o", f"{d}/s", f"{d}/a.v", f"{d}/tb.v"], capture_output=True, text=True)
        if r.returncode:
            raise RuntimeError(r.stderr)
        out = subprocess.run(["vvp", f"{d}/s"], capture_output=True, text=True, timeout=300).stdout
    rows = re.findall(r"OUT (\d+) (\d) (\d+)", out)
    if len(rows) < len(xs):
        return len(rows)
    for i, (c, dn, v) in enumerate(rows):
        v = int(v)
        ys = [(v >> (k * wb)) & ((1 << wb) - 1) for k in range(NOUT)]
        ys = [t - (1 << wb) if t >= 1 << (wb - 1) else t for t in ys]
        if dn != "1" or int(c) != gen.cycles(p) or ys != list(ref[i]):
            return i
    return None


def coverage_points(q, x):
    """Coverage points hit by one input, computed from the integer reference: for each hidden neuron, ReLU-zero and
    saturated-high; for each output, clipped-high and clipped-low; for each hidden neuron a negative pre-activation."""
    x = np.asarray(x)[None]
    qmax = 2 ** (q["wb"] - 1) - 1
    a0 = x @ q["W0"] + q["B0"]
    h = np.clip(np.maximum(a0, 0) >> q["s0"], 0, qmax)
    a1 = (h @ q["W1"] + q["B1"]) >> q["s1"]
    pts = set()
    for n in range(a0.shape[1]):
        if a0[0, n] <= 0: pts.add(("relu0", n))
        if (a0[0, n] >> q["s0"]) > qmax: pts.add(("sat0", n))
    for n in range(a1.shape[1]):
        if a1[0, n] > qmax: pts.add(("hi", n))
        if a1[0, n] < -qmax - 1: pts.add(("lo", n))
    return pts


def directed_vectors(q, n, seed=0, pool=4000):
    """Coverage-directed selection: draw a pool of random + corner-biased inputs, then greedily keep the vector that
    adds the most uncovered coverage points (ties by pool order), and fill the rest with the most extreme inputs."""
    rng = np.random.default_rng(seed)
    wb = q["wb"]; lo, hi = -(1 << (wb - 1)), (1 << (wb - 1)) - 1
    uni = rng.integers(lo, hi + 1, (pool // 2, NIN))
    corner = rng.choice([lo, hi, 0, lo + 1, hi - 1], (pool - pool // 2, NIN))
    cand = np.vstack([uni, corner])
    covs = [coverage_points(q, c) for c in cand]
    chosen, seen = [], set()
    for _ in range(n):
        gains = [len(c - seen) for c in covs]
        j = int(np.argmax(gains))
        if gains[j] == 0:
            break
        chosen.append(j); seen |= covs[j]
    rest = [j for j in np.argsort([-np.abs(c).sum() for c in cand]) if j not in chosen]
    chosen += rest[: n - len(chosen)]
    return cand[chosen], seen


def _yosys(script, timeout):
    t = time.perf_counter()
    try:
        r = subprocess.run(["yosys", "-q", "-p", script], capture_output=True, text=True, timeout=timeout)
        return r, time.perf_counter() - t, False
    except subprocess.TimeoutExpired:
        return None, time.perf_counter() - t, True


PREP = "read_verilog {g}; read_verilog {m}; proc; flatten; memory_map; opt;"


def formal(gold, mut, seq, d, sat_timeout=150, induct_timeout=240):
    """Bounded and unbounded comparison of `mut` against `gold` with Yosys (no SymbiYosys/solver install needed).
    1. `sat -seq K` on a miter from the all-zero state: a counterexample means the mutant is killed within K cycles.
    2. If that does not find one (proof or timeout), `equiv_make; equiv_simple; equiv_induct` tries to prove the two
       designs equivalent for all time (register-matched induction). Returns (verdict, seconds) with verdict one of
       'killed', 'equivalent', 'undecided'."""
    g, m = f"{d}/g.v", f"{d}/m.v"
    open(g, "w").write(gold.replace("module accel", "module gold"))
    open(m, "w").write(mut.replace("module accel", "module mut"))
    prep = PREP.format(g=g, m=m)
    t0 = time.perf_counter()
    r, _, to = _yosys(prep + f"miter -equiv -flatten -make_outputs -ignore_gold_x gold mut mit; hierarchy -top mit; opt; "
                      f"sat -verify -seq {seq} -set-init-zero -prove trigger 0 -timeout {sat_timeout} mit", sat_timeout + 60)
    if r is not None and r.returncode and "proof did fail" in (r.stderr + r.stdout):
        return "killed", time.perf_counter() - t0
    r, _, to = _yosys(prep + f"equiv_make gold mut eq; hierarchy -top eq; equiv_simple -seq {seq}; equiv_induct -seq {seq}; "
                      f"equiv_status -assert", induct_timeout)
    if r is not None and r.returncode == 0:
        return "equivalent", time.perf_counter() - t0
    return "undecided", time.perf_counter() - t0
