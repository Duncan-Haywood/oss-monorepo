"""Behavioural Verilog for seven width-parameterised blocks, as strings (original, MIT)."""

BLOCKS = ["add", "cmp_lt", "eq", "shift", "popcount", "mul", "mux4"]


def verilog(kind, w):
    """Return (source, top) for block `kind` at width w."""
    top = f"{kind}{w}"
    m = f"module {top}"
    if kind == "add":
        s = f"{m}(input [{w-1}:0] a, b, output [{w}:0] y); assign y = a + b; endmodule"
    elif kind == "cmp_lt":
        s = f"{m}(input [{w-1}:0] a, b, output y); assign y = a < b; endmodule"
    elif kind == "eq":
        s = f"{m}(input [{w-1}:0] a, b, output y); assign y = a == b; endmodule"
    elif kind == "shift":  # logical right barrel shifter, shift amount ceil(log2 w) bits
        k = max(1, (w - 1).bit_length())
        s = f"{m}(input [{w-1}:0] a, input [{k-1}:0] n, output [{w-1}:0] y); assign y = a >> n; endmodule"
    elif kind == "popcount":
        k = w.bit_length()
        s = (f"{m}(input [{w-1}:0] a, output reg [{k-1}:0] y); integer i; "
             f"always @* begin y = 0; for (i = 0; i < {w}; i = i + 1) y = y + a[i]; end endmodule")
    elif kind == "mul":
        s = f"{m}(input [{w-1}:0] a, b, output [{2*w-1}:0] y); assign y = a * b; endmodule"
    elif kind == "mux4":
        s = f"{m}(input [{w-1}:0] a, b, c, d, input [1:0] s, output [{w-1}:0] y); assign y = s[1] ? (s[0] ? d : c) : (s[0] ? b : a); endmodule"
    else:
        raise ValueError(kind)
    return s + "\n", top
