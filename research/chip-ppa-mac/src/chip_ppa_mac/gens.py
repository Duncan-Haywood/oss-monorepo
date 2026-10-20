"""Parameter sweep for the 4x4 MAC: how the five rows (four partial products and c) are summed."""


def mac4_config_space():
    # summation: chain / tree / csa (carry-save, one final adder); c_pos: first / last; style: mux / and
    return [(s, p, m) for s in ("chain", "tree", "csa") for p in ("first", "last") for m in ("mux", "and")]


def gen_mac4(summation, c_pos, style):
    rows = []
    for i in range(4):
        sh = f"{{{5-i}'b0, a, {i}'b0}}" if i else "{5'b0, a}"
        rows.append(f"b[{i}] ? {sh} : 9'b0" if style == "mux" else f"({sh} & {{9{{b[{i}]}}}})")
    rows = ["{1'b0, c}"] + rows if c_pos == "first" else rows + ["{1'b0, c}"]
    out = "module mac4(input [3:0] a, input [3:0] b, input [7:0] c, output [8:0] y);\n"
    for k, r in enumerate(rows):
        out += f"  wire [8:0] r{k} = {r};\n"
    if summation == "chain":
        out += "  assign y = " + " + ".join(f"r{k}" for k in range(5)) + ";\n"
    elif summation == "tree":
        out += "  assign y = ((r0 + r1) + (r2 + r3)) + r4;\n"
    else:
        out += "  wire [8:0] s1 = r0 ^ r1 ^ r2;\n  wire [8:0] k1 = ((r0 & r1) | (r0 & r2) | (r1 & r2)) << 1;\n"
        ps, pk = "s1", "k1"
        for k in (3, 4):
            out += (f"  wire [8:0] s{k-1} = {ps} ^ r{k} ^ {pk};\n"
                    f"  wire [8:0] k{k-1} = (({ps} & r{k}) | ({ps} & {pk}) | (r{k} & {pk})) << 1;\n")
            ps, pk = f"s{k-1}", f"k{k-1}"
        out += f"  assign y = {ps} + {pk};\n"
    return out + "endmodule\n"
