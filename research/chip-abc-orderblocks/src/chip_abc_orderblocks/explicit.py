"""The `synth -flatten -noabc; abc` flow written out pass by pass, so one pass can be removed (an ablation).

`merge=True` is meant to reproduce `flow.score`; `merge=False` replaces every `opt` by the same optimisations
without the two `opt_merge` calls, which is the pass that shares identical cells."""
import os
import re
import subprocess
import tempfile

from .flow import GATES, SCRIPTS
from .trace import STAGES

NO_MERGE = "opt_expr; opt_muxtree; opt_reduce; opt_share; opt_clean; opt_expr"


def flow_script(file, top, abc_opt, merge=True):
    passes = [s if (merge or not s.startswith("opt")) else NO_MERGE for s in STAGES]
    return (f"read_verilog {file}; hierarchy -top {top}; " + "; ".join(passes) +
            f"; abc -g {GATES} {abc_opt}; opt_clean; tee -o /dev/stdout stat; tee -o /dev/stdout ltp -noff")


def score(file, top, script_name="yosys_default", merge=True):
    body = SCRIPTS[script_name]
    with tempfile.TemporaryDirectory() as d:
        opt = ""
        if body is not None:
            path = os.path.join(d, "s.abc")
            with open(path, "w") as f:
                f.write(body + "\n")
            opt = f"-script {path}"
        p = subprocess.run(["yosys", "-q", "-p", flow_script(file, top, opt, merge)], capture_output=True, text=True)
    if p.returncode:
        raise RuntimeError(p.stderr.strip() or p.stdout.strip())
    m = re.search(r"Number of cells:\s+(\d+)", p.stdout)
    d = re.search(r"Longest topological path in \S+ \(length=(\d+)\)", p.stdout)
    return {"cells": int(m.group(1)) if m else 0, "depth": int(d.group(1)) if d else 0}
