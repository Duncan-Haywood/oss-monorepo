"""Run Yosys `synth -noabc` one pass at a time and record a netlist signature after each pass."""
import re
import subprocess
import tempfile

# the `coarse` and `fine` steps of `synth -flatten -noabc` in Yosys 0.33 (`help synth`), in order
STAGES = ["proc", "flatten", "opt_expr", "opt_clean", "opt -nodffe -nosdff", "fsm", "opt", "wreduce",
          "peepopt", "opt_clean", "alumacc", "share", "opt", "memory -nomap", "opt_clean",
          "opt -fast -full", "memory_map", "opt -full", "techmap", "opt -fast"]
_CELL = re.compile(r"^\s+(\$\S+)\s+(\d+)$", re.M)


def signatures(file, top):
    """Per stage: (cell-type counts from `stat -width`, a name-free hash-able text of the netlist)."""
    with tempfile.TemporaryDirectory() as d:
        cmds = f"read_verilog {file}; hierarchy -top {top};"
        for i, st in enumerate(STAGES):
            cmds += f" {st}; tee -q -o {d}/s{i}.txt stat -width; write_rtlil {d}/n{i}.il;"
        p = subprocess.run(["yosys", "-q", "-p", cmds], capture_output=True, text=True)
        if p.returncode:
            raise RuntimeError(p.stderr.strip() or p.stdout.strip())
        out = []
        for i in range(len(STAGES)):
            with open(f"{d}/s{i}.txt") as fs, open(f"{d}/n{i}.il") as fn:
                out.append((tuple(_CELL.findall(fs.read())), canonical(fn.read())))
        return out


def canonical(rtlil):
    """Netlist text with every cell and wire name replaced by its order of first appearance."""
    names = {}
    def sub(m):
        return names.setdefault(m.group(0), f"n{len(names)}")
    body = [l for l in rtlil.split("\n") if not l.lstrip().startswith(("module", "autoidx", "attribute"))]
    return re.sub(r"[\\$][\w$.:/\\\[\]-]+", sub, "\n".join(body))


def first_difference(sig_a, sig_b, key):
    """Index of the first stage whose `key` (0 counts, 1 canonical text) differs; None if never."""
    for i, (a, b) in enumerate(zip(sig_a, sig_b)):
        if a[key] != b[key]:
            return i
    return None
