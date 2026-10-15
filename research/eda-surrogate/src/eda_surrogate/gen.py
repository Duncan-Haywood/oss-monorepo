"""Four small parametric Verilog generator families. All original code.

Each generator returns (verilog, cycles) where cycles is the analytic number of clock cycles the design needs for a fixed
workload (so cells x cycles is a meaningful area-time objective). The top module is always named `top`.
"""
import math

WORK = 64  # multiply-accumulates per workload for the mac and fir families


def mac(p, w):
    """p parallel w x w multipliers summed by an adder tree into a registered accumulator."""
    aw = 2 * w + math.ceil(math.log2(max(2, WORK))) + 1
    prods = "\n".join(f"  wire [{2*w-1}:0] m{i} = a[{(i+1)*w-1}:{i*w}] * b[{(i+1)*w-1}:{i*w}];" for i in range(p))
    s = " + ".join(f"m{i}" for i in range(p))
    v = f"""module top(input clk, input [{p*w-1}:0] a, input [{p*w-1}:0] b, output reg [{aw-1}:0] acc);
{prods}
  always @(posedge clk) acc <= acc + {s};
endmodule
"""
    return v, math.ceil(WORK / p)


def fir(taps, lanes, w):
    """A `taps`-tap FIR over w-bit samples with coefficients on ports, time-multiplexed over `lanes` multipliers."""
    aw = 2 * w + math.ceil(math.log2(max(2, taps))) + 1
    ph = math.ceil(taps / lanes)
    pb = max(1, math.ceil(math.log2(ph + 1)))
    sh = "\n".join(f"  always @(posedge clk) x{i} <= {'din' if i == 0 else f'x{i-1}'};" for i in range(taps))
    decl = "\n".join(f"  reg [{w-1}:0] x{i};" for i in range(taps))
    # lane l at phase q handles tap q*lanes + l (zero when out of range)
    lane_terms = []
    for l in range(lanes):
        cases = []
        for q in range(ph):
            t = q * lanes + l
            if t < taps:
                cases.append(f"      {pb}'d{q}: begin xs{l} = x{t}; cs{l} = c[{(t+1)*w-1}:{t*w}]; end")
        lane_terms.append(
            f"  reg [{w-1}:0] xs{l}; reg [{w-1}:0] cs{l};\n  always @* begin xs{l} = 0; cs{l} = 0;\n    case (ph)\n"
            + "\n".join(cases) + f"\n      default: ;\n    endcase\n  end\n  wire [{2*w-1}:0] p{l} = xs{l} * cs{l};")
    s = " + ".join(f"p{l}" for l in range(lanes))
    v = f"""module top(input clk, input [{w-1}:0] din, input [{taps*w-1}:0] c, output reg [{aw-1}:0] acc);
{decl}
  reg [{pb-1}:0] ph;
{sh}
  always @(posedge clk) ph <= (ph == {ph-1}) ? 0 : ph + 1;
{chr(10).join(lane_terms)}
  always @(posedge clk) acc <= (ph == 0 ? 0 : acc) + {s};
endmodule
"""
    return v, ph


def alu(w, nops):
    """A w-bit ALU with `nops` (2..8) operations out of add, sub, and, or, xor, shift-left, shift-right, less-than."""
    ops = ["a + b", "a - b", "a & b", "a | b", "a ^ b", "a << b[4:0]", "a >> b[4:0]", "{{{}'d0}}, a < b}}".format(w - 1)]
    ops[7] = f"{{{w-1}'d0, a < b}}"
    sel = max(1, math.ceil(math.log2(nops)))
    cases = "\n".join(f"      {sel}'d{i}: y = {ops[i]};" for i in range(nops))
    v = f"""module top(input clk, input [{w-1}:0] a, input [{w-1}:0] b, input [{sel-1}:0] op, output reg [{w-1}:0] q);
  reg [{w-1}:0] y;
  always @* begin
    case (op)
{cases}
      default: y = 0;
    endcase
  end
  always @(posedge clk) q <= y;
endmodule
"""
    return v, 1


def sorter(n, w):
    """An odd-even transposition sorting network over n w-bit values, one stage per clock (registered at the end)."""
    lines, cur = [], [f"v{i}" for i in range(n)]
    ins = "\n".join(f"  wire [{w-1}:0] v{i} = d[{(i+1)*w-1}:{i*w}];" for i in range(n))
    for s in range(n):
        nxt = list(cur)
        for i in range(s % 2, n - 1, 2):
            lo, hi = f"s{s}_{i}l", f"s{s}_{i}h"
            lines.append(f"  wire [{w-1}:0] {lo} = ({cur[i]} < {cur[i+1]}) ? {cur[i]} : {cur[i+1]};")
            lines.append(f"  wire [{w-1}:0] {hi} = ({cur[i]} < {cur[i+1]}) ? {cur[i+1]} : {cur[i]};")
            nxt[i], nxt[i + 1] = lo, hi
        cur = nxt
    outs = ", ".join(reversed(cur))
    v = f"""module top(input clk, input [{n*w-1}:0] d, output reg [{n*w-1}:0] q);
{ins}
{chr(10).join(lines)}
  always @(posedge clk) q <= {{{outs}}};
endmodule
"""
    return v, 1


def spaces():
    """Every design in the study: {family: [(params dict, verilog, cycles)]}."""
    out = {"mac": [], "fir": [], "alu": [], "sorter": []}
    for p in (1, 2, 3, 4, 6, 8):
        for w in (3, 4, 5, 6, 8, 10):
            v, c = mac(p, w)
            out["mac"].append(({"p": p, "w": w}, v, c))
    for taps in (4, 6, 8, 12):
        for lanes in (1, 2, 4):
            if lanes > taps:
                continue
            for w in (4, 6, 8):
                v, c = fir(taps, lanes, w)
                out["fir"].append(({"taps": taps, "lanes": lanes, "w": w}, v, c))
    for w in (4, 8, 12, 16, 24, 32):
        for nops in (2, 3, 4, 5, 6, 8):
            v, c = alu(w, nops)
            out["alu"].append(({"w": w, "nops": nops}, v, c))
    for n in (3, 4, 5, 6, 8):
        for w in (3, 4, 6, 8, 12):
            v, c = sorter(n, w)
            out["sorter"].append(({"n": n, "w": w}, v, c))
    return out
