"""Knob-driven Verilog generators: the no-model baseline. Every config is a legal design for the same spec."""


def pop16_config_space():
    return [("flat",), ("pair",), ("csa",), ("group", 2), ("group", 4), ("group", 8), ("lut4",)]


def gen_pop16(kind, g=None):
    if kind == "flat":
        body = "assign c = " + " + ".join(f"a[{i}]" for i in range(16)) + ";"
    elif kind == "pair":
        body = "assign c = " + " + ".join(f"(a[{2*i}] + a[{2*i+1}])" for i in range(8)) + ";"
    elif kind == "csa":
        body = ("wire [1:0] s0 = a[0]+a[1]+a[2], s1 = a[3]+a[4]+a[5], s2 = a[6]+a[7]+a[8], s3 = a[9]+a[10]+a[11], "
                "s4 = a[12]+a[13]+a[14];\n  wire [1:0] t0 = s0[0]+s1[0]+s2[0], t1 = s3[0]+s4[0]+a[15];\n"
                "  wire [1:0] u = t0[0]+t1[0];\n"
                "  assign c = u[0] + 2*(s0[1]+s1[1]+s2[1]+s3[1]+s4[1]+t0[1]+t1[1]+u[1]);")
    elif kind == "group":
        n = 16 // g
        wid = max(1, g.bit_length())
        decl = "\n  ".join(f"wire [{wid-1}:0] g{i} = " + " + ".join(f"a[{i*g+j}]" for j in range(g)) + ";" for i in range(n))
        body = decl + "\n  assign c = " + " + ".join(f"g{i}" for i in range(n)) + ";"
    elif kind == "lut4":
        rows = "\n".join(f"      4'd{x}: p4 = {bin(x).count('1')};" for x in range(16))
        body = (f"function [2:0] p4(input [3:0] x);\n    case (x)\n{rows}\n    endcase\n  endfunction\n"
                "  assign c = p4(a[3:0]) + p4(a[7:4]) + p4(a[11:8]) + p4(a[15:12]);")
    return f"module pop16(input [15:0] a, output [4:0] c);\n  {body}\nendmodule\n"


def clz16_config_space():
    return [("loop_up",), ("loop_down",), ("chain",), ("tree", 8), ("tree", 4), ("nibble",)]


def gen_clz16(kind, g=None):
    if kind == "loop_up":  # last assignment wins: highest set bit
        body = ("integer i;\n  always @* begin n = 16; for (i = 0; i < 16; i = i + 1) if (a[i]) n = 15 - i; end")
        return f"module clz16(input [15:0] a, output reg [4:0] n);\n  {body}\nendmodule\n"
    if kind == "loop_down":
        body = ("integer i;\n  always @* begin n = 16; for (i = 15; i >= 0; i = i - 1) if (a[i] && n == 16) n = 15 - i; end")
        return f"module clz16(input [15:0] a, output reg [4:0] n);\n  {body}\nendmodule\n"
    if kind == "chain":
        expr = "a[15] ? 5'd0" + "".join(f" : a[{15-i}] ? 5'd{i}" for i in range(1, 16)) + " : 5'd16"
        return f"module clz16(input [15:0] a, output [4:0] n);\n  assign n = {expr};\nendmodule\n"
    if kind == "tree":
        # g = size of the top split: a priority tree over g-bit leaves, leaf count by chain
        leaves = 16 // g
        lines = [f"wire [{g-1}:0] l{i} = a[{16-g*(i+1)+g-1}:{16-g*(i+1)}];" for i in range(leaves)]
        lines += [f"wire v{i} = |l{i};" for i in range(leaves)]
        lc = []
        for i in range(leaves):
            e = f"5'd{g}"
            for j in range(g):
                e = f"l{i}[{j}] ? 5'd{g-1-j} : {e}"
            lc.append(f"wire [4:0] k{i} = {e};")
        sel = "5'd16"
        for i in reversed(range(leaves)):
            sel = f"v{i} ? (5'd{i*g} + k{i}) : {sel}"
        return "module clz16(input [15:0] a, output [4:0] n);\n  " + "\n  ".join(lines + lc) + f"\n  assign n = {sel};\nendmodule\n"
    if kind == "nibble":
        return (
            "module clz16(input [15:0] a, output [4:0] n);\n"
            "  function [2:0] c4(input [3:0] x); c4 = x[3] ? 0 : x[2] ? 1 : x[1] ? 2 : x[0] ? 3 : 4; endfunction\n"
            "  wire [2:0] k3 = c4(a[15:12]), k2 = c4(a[11:8]), k1 = c4(a[7:4]), k0 = c4(a[3:0]);\n"
            "  assign n = (k3 != 4) ? k3 : (k2 != 4) ? 5'd4 + k2 : (k1 != 4) ? 5'd8 + k1 : 5'd12 + k0;\n"
            "endmodule\n")


def absd8_config_space():
    return [(m,) for m in ("cmp_mux", "cmp_mux_lt", "sub_neg", "sub_xor", "two_sub", "minmax")]


def gen_absd8(kind):
    head = "module absd8(input [7:0] a, input [7:0] b, output [7:0] d);\n  "
    body = {
        "cmp_mux": "assign d = (a > b) ? (a - b) : (b - a);",
        "cmp_mux_lt": "assign d = (a < b) ? (b - a) : (a - b);",
        "sub_neg": "wire [8:0] t = {1'b0,a} - {1'b0,b};\n  assign d = t[8] ? (~t[7:0] + 8'd1) : t[7:0];",
        "sub_xor": "wire [8:0] t = {1'b0,a} - {1'b0,b};\n  assign d = (t[7:0] ^ {8{t[8]}}) + {7'b0, t[8]};",
        "two_sub": "wire [7:0] ab = a - b, ba = b - a;\n  assign d = (a < b) ? ba : ab;",
        "minmax": "wire g = a > b;\n  assign d = (g ? a : b) - (g ? b : a);",
    }[kind]
    return head + body + "\nendmodule\n"
