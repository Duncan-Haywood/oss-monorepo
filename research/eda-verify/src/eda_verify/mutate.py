"""Source-level mutation operators for the generated Verilog (a small, fixed set, applied to the control and datapath
logic and, separately, to the weight/bias ROM tables)."""
import re

ARITH = [(" + ", " - "), (" * ", " + "), (">>>", ">>"), (" < ", " <= "), (" > ", " >= "), (" == ", " != "),
         (" <= ", " < ")]
LIT = re.compile(r"(?<![\w'\[:])\d+(?![\w\]:'])")
ROMLINE = re.compile(r"^(\s*\{1'd\d, 4'd\d+(, 3'd\d)?\}: [wb]rom = )(-?\d+);$")


def _logic_start(lines):
    return next(i for i, l in enumerate(lines) if "localparam IDLE" in l)


def sites(verilog):
    """Enumerate mutants as dicts {id, kind, line, text}; `text` is the full mutated source."""
    lines = verilog.split("\n")
    out = []

    def add(kind, i, new, note):
        m = lines[:]; m[i] = new
        out.append({"id": f"{kind}@{i + 1}:{note}", "kind": kind, "line": i + 1, "text": "\n".join(m)})

    start = _logic_start(lines)
    rom_ids = [i for i, l in enumerate(lines) if ROMLINE.match(l)]
    for i, l in enumerate(lines):
        if i in rom_ids:
            mm = ROMLINE.match(l)
            add("rom", i, f"{mm.group(1)}{int(mm.group(3)) + 1};", "+1")
            continue
        if i < 3 or (3 <= i < start and "QMAX" not in l):
            continue
        for a, b in ARITH:
            if a in l:
                add("op", i, l.replace(a, b, 1), f"{a.strip()}->{b.strip()}")
        if i >= start and not l.lstrip().startswith(("localparam", "reg", "integer", "//")):
            for m in LIT.finditer(l):
                for d in (+1, -1):
                    v = int(m.group()) + d
                    if v >= 0:
                        add("lit", i, l[:m.start()] + str(v) + l[m.end():], f"{m.group()}{d:+d}")
            s = l.strip()
            if s.endswith(";") and "<=" in s and s.count(";") == 1 and not s.startswith(("if", "else", "for", "IDLE", "RUN", "WBK")):
                add("del", i, "", "delete")
    # de-duplicate identical texts
    seen, uniq = set(), []
    for s in out:
        if s["text"] not in seen:
            seen.add(s["text"]); uniq.append(s)
    return uniq
