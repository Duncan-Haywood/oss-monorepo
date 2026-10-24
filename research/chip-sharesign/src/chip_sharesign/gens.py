"""Designs with a common sub-expression, written so Yosys's `opt_merge` shares it ("shared") or not ("unshared").

Sharing happens when two `$add`/`$mul` cells have the same operands (Yosys 0.33 `opt_merge` ignores operand
order on commutative cells: swapping `a + b` to `b + a` changes nothing, checked by the first version of this
project). So the unshared variant changes the *association* of every other copy: `(c + a) + b`, not `(a + b) + c`.
Both are the same function.
"""

def _decl(w, names, out_w, outs):
    ins = ", ".join(f"input [{w-1}:0] {n}" for n in names)
    o = ", ".join(f"output [{out_w-1}:0] {n}" for n in outs)
    return ins, o


def addconst(w, k, shared):
    """k outputs y_i = a + b + c_i (c_i = i, a constant), the carry-select pattern of chip-abc-orderpass."""
    ins, outs = _decl(w, ["a", "b"], w, [f"y{i}" for i in range(k)])
    lines = []
    for i in range(k):
        e = f"a + b + {w}'d{i}" if (shared or i % 2 == 0) else f"{w}'d{i} + a + b"
        lines.append(f"  assign y{i} = {e};")
    return f"module top({ins}, {outs});\n" + "\n".join(lines) + "\nendmodule\n"


def addvar(w, k, shared):
    """k outputs y_i = a + b + c_i with c_i an input: the common term a + b is a real sub-expression."""
    ins, outs = _decl(w, ["a", "b"] + [f"c{i}" for i in range(k)], w, [f"y{i}" for i in range(k)])
    lines = []
    for i in range(k):
        e = f"a + b + c{i}" if (shared or i % 2 == 0) else f"c{i} + a + b"
        lines.append(f"  assign y{i} = {e};")
    return f"module top({ins}, {outs});\n" + "\n".join(lines) + "\nendmodule\n"


def sumthree(w, k, shared):
    """k outputs y_i = a + b + c_i with (a + b) first for all: sum, then compare-free MUX of two sums."""
    ins, outs = _decl(w, ["a", "b", "s"] + [f"c{i}" for i in range(k)], w, [f"y{i}" for i in range(k)])
    lines = []
    for i in range(k):
        e = f"a + b + c{i}" if (shared or i % 2 == 0) else f"c{i} + a + b"
        lines.append(f"  assign y{i} = s ? ({e}) : (c{i} - a);")
    return f"module top({ins}, {outs});\n" + "\n".join(lines) + "\nendmodule\n"


FAMILIES = {"addconst": addconst, "addvar": addvar, "sumthree": sumthree}
