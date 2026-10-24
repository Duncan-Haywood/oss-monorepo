"""Verilog generators copied unchanged from chip-ppa-loop (MIT, same author): a few knobs per design."""

def add16_config_space():
    cfgs = [("plus", 0), ("ripple", 0)]
    cfgs += [("csel", b) for b in range(2, 9)]       # carry-select, blocks summed with `+`
    cfgs += [("cselrip", b) for b in range(2, 9)]    # carry-select, blocks are ripple chains
    return cfgs


def gen_add16(kind, b):
    hdr = "module add16(input [15:0] a, input [15:0] b, output [16:0] s);\n"
    if kind == "plus":
        return hdr + "  assign s = a + b;\nendmodule\n"
    if kind == "ripple":
        return hdr + _ripple("a", "b", 16, "0", "s", 16, "r") + "endmodule\n"
    blocks, lo = [], 0
    while lo < 16:
        blocks.append((lo, min(lo + b, 16)))
        lo += b
    out = hdr + "  wire cin0 = 1'b0;\n"
    for i, (lo, hi) in enumerate(blocks):
        w = hi - lo
        if i == 0:
            out += _block(kind, lo, hi, "1'b0", f"r{i}") + f"  wire c{i+1} = r{i}[{w}];\n"
            continue
        out += _block(kind, lo, hi, "1'b0", f"x{i}") + _block(kind, lo, hi, "1'b1", f"y{i}")
        out += f"  wire [{w}:0] r{i} = c{i} ? y{i} : x{i};\n  wire c{i+1} = r{i}[{w}];\n"
    for i, (lo, hi) in enumerate(blocks):
        out += f"  assign s[{hi-1}:{lo}] = r{i}[{hi-lo-1}:0];\n"
    out += f"  assign s[16] = c{len(blocks)};\nendmodule\n"
    return out


def _block(kind, lo, hi, cin, name):
    w = hi - lo
    if kind == "csel":
        return f"  wire [{w}:0] {name} = a[{hi-1}:{lo}] + b[{hi-1}:{lo}] + {w+1}'d{cin[-1]};\n"
    # ripple block
    out = f"  wire [{w}:0] {name}c; wire [{w}:0] {name};\n  assign {name}c[0] = {cin};\n"
    for k in range(w):
        i = lo + k
        out += (f"  assign {name}[{k}] = a[{i}] ^ b[{i}] ^ {name}c[{k}];\n"
                f"  assign {name}c[{k+1}] = (a[{i}] & b[{i}]) | ({name}c[{k}] & (a[{i}] ^ b[{i}]));\n")
    return out + f"  assign {name}[{w}] = {name}c[{w}];\n"


def _ripple(a, b, w, cin, s, sw, pre):
    out = f"  wire [{w}:0] {pre}c;\n  assign {pre}c[0] = 1'b{cin};\n"
    for i in range(w):
        out += (f"  assign {s}[{i}] = {a}[{i}] ^ {b}[{i}] ^ {pre}c[{i}];\n"
                f"  assign {pre}c[{i+1}] = ({a}[{i}] & {b}[{i}]) | ({pre}c[{i}] & ({a}[{i}] ^ {b}[{i}]));\n")
    return out + f"  assign {s}[{sw}] = {pre}c[{w}];\n"


def mul6_config_space():
    return [(s, o, m) for s in ("chain", "tree") for o in ("lsb", "msb") for m in ("mux", "and")]


def gen_mul6(summation, order, style):
    rows = []
    for i in range(6):
        sh = f"{{{11-5-i}'b0, a, {i}'b0}}" if i else "{6'b0, a}"
        if style == "mux":
            rows.append(f"b[{i}] ? {sh} : 12'b0")
        else:
            rows.append(f"({sh} & {{12{{b[{i}]}}}})")
    idx = list(range(6)) if order == "lsb" else list(range(5, -1, -1))
    out = "module mul6(input [5:0] a, input [5:0] b, output [11:0] p);\n"
    for k, i in enumerate(idx):
        out += f"  wire [11:0] r{k} = {rows[i]};\n"
    if summation == "chain":
        out += "  assign p = r0 + r1 + r2 + r3 + r4 + r5;\n"
    else:
        out += "  assign p = ((r0 + r1) + (r2 + r3)) + (r4 + r5);\n"
    return out + "endmodule\n"
