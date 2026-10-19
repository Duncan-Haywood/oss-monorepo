"""Gate count Yosys/ABC reaches for a 4-input function, on the exact-synthesis gate set."""
import os
import re
import subprocess
import tempfile

GATES = "AND,NAND,OR,NOR,XOR,XNOR,ANDNOT,ORNOT"  # the 2-input gate types; no MUX, so counts compare with exact.py

RESYN2 = ("strash; balance; rewrite; refactor; balance; rewrite; rewrite -z; balance; "
          "refactor -z; rewrite -z; balance")
# name -> ABC options ("fast" is a Yosys flag), or an ABC script run before the generic-gate mapping
VARIANTS = {
    "default": None,
    "fast": "-fast",
    "strash_map": "strash; map",
    "dc2_map": "strash; dc2; map",
    "dch_map": "strash; dch; map",
    "resyn2_map": RESYN2 + "; map",
    "resyn2x3_dch_map": "; ".join([RESYN2] * 3) + "; dch; map",
}


def verilog(f):
    return (f"module t(input [3:0] x, output y);\n"
            f"  wire [15:0] tt = 16'h{f:04x};\n  assign y = tt[x];\nendmodule\n")


def count(f, variant="default", yosys="yosys"):
    """(gates excluding inverters, inverters) after Yosys `synth -noabc` and the ABC variant."""
    body = VARIANTS[variant]
    with tempfile.TemporaryDirectory() as d:
        src = os.path.join(d, "t.v")
        with open(src, "w") as fh:
            fh.write(verilog(f))
        opt = ""
        if body is not None and body.startswith("-"):
            opt = body
        elif body is not None:
            path = os.path.join(d, "s.abc")
            with open(path, "w") as fh:
                fh.write(body + "\n")
            opt = f"-script {path}"
        p = subprocess.run(
            [yosys, "-q", "-p", f"read_verilog {src}; synth -top t -flatten -noabc; abc -g {GATES} {opt}; "
             "opt_clean -purge; tee -o /dev/stdout stat"], capture_output=True, text=True)
    if p.returncode:
        raise RuntimeError(p.stderr.strip() or p.stdout.strip())
    cells = {m.group(1): int(m.group(2)) for m in re.finditer(r"^\s+(\$_\w+_)\s+(\d+)\s*$", p.stdout, re.M)}
    inv = cells.pop("$_NOT_", 0)
    return sum(cells.values()), inv
