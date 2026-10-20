"""16-bit adder as 4-bit blocks written in different, provably equivalent styles."""

STYLES = {
    "gen": "carry-select; x = a+b+0, y = a+b+1 (the chip-abc-order text)",
    "explicit": "carry-select; p = a+b written once, x = p, y = p+1 (hand common-subexpression)",
    "inc": "carry-select; x = a+b, y = x+1 (incrementer on the first sum)",
    "right": "carry-select; x = a+(b+0), y = a+(b+1) (constant attached to b first)",
    "cin": "carry-ripple over 4-bit blocks; each block is a+b+carry_in (one adder per block, no select)",
    "plus": "s = a + b in one line",
}


def gen_add16(style):
    if style == "plus":
        return "module add16(input [15:0] a, input [15:0] b, output [16:0] s);\n  assign s = a + b;\nendmodule\n"
    L = ["module add16(input [15:0] a, input [15:0] b, output [16:0] s);"]
    for k in range(4):
        A, B = f"a[{4*k+3}:{4*k}]", f"b[{4*k+3}:{4*k}]"
        if k == 0:
            L.append(f"  wire [4:0] r0 = {A} + {B} + 5'd0;")
            continue
        c = f"r{k-1}[4]"
        if style == "cin":
            L.append(f"  wire [4:0] r{k} = {A} + {B} + {c};")
            continue
        if style == "gen":
            L += [f"  wire [4:0] x{k} = {A} + {B} + 5'd0;", f"  wire [4:0] y{k} = {A} + {B} + 5'd1;"]
        elif style == "explicit":
            L += [f"  wire [4:0] p{k} = {A} + {B};", f"  wire [4:0] x{k} = p{k};", f"  wire [4:0] y{k} = p{k} + 5'd1;"]
        elif style == "inc":
            L += [f"  wire [4:0] x{k} = {A} + {B};", f"  wire [4:0] y{k} = x{k} + 5'd1;"]
        elif style == "right":
            L += [f"  wire [4:0] x{k} = {A} + ({B} + 5'd0);", f"  wire [4:0] y{k} = {A} + ({B} + 5'd1);"]
        else:
            raise ValueError(style)
        L.append(f"  wire [4:0] r{k} = {c} ? y{k} : x{k};")
    for k in range(4):
        L.append(f"  assign s[{4*k+3}:{4*k}] = r{k}[3:0];")
    L += ["  assign s[16] = r3[4];", "endmodule", ""]
    return "\n".join(L)
