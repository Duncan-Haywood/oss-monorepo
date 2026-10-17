"""Three-stage checker for a candidate RTL file against a task's reference.

Stages, in order (a later stage runs only if the earlier ones pass):
  lint    Icarus Verilog compile of the candidate alone, then Verilator --lint-only
          (default warnings except the WIDTH family and UNOPTFLAT, which the reference designs trip).
  sim     Icarus Verilog run of tasks/<name>/tb.v: random vectors, candidate vs reference.
  formal  Yosys miter against the reference. Combinational tasks: SAT proof over all inputs.
          Sequential tasks: bounded proof from the all-zero state over SEQ_DEPTH cycles.
"""
import re
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TASKS = ROOT / "tasks"
SEQ_DEPTH = 10
STAGES = ("lint", "sim", "formal")


def task_names():
    return sorted(p.name for p in TASKS.iterdir() if (p / "spec.md").exists())


def is_sequential(task):
    return "input clk" in (TASKS / task / "spec.md").read_text()


def _run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, timeout=120, **kw)


def lint(task, cand, tmp):
    vvp = Path(tmp) / "lint.vvp"
    p = _run(["iverilog", "-g2012", "-s", task, "-o", str(vvp), str(cand)])
    if p.returncode:
        return False, "iverilog: " + (p.stderr or p.stdout).strip()[:600]
    p = _run(["verilator", "--lint-only", "-Wno-WIDTH", "-Wno-UNOPTFLAT", "--top-module", task, str(cand)])
    if p.returncode:
        return False, "verilator: " + p.stderr.strip()[:600]
    return True, ""


def sim(task, cand, tmp):
    vvp = Path(tmp) / "sim.vvp"
    d = TASKS / task
    p = _run(["iverilog", "-g2012", "-s", "tb", "-o", str(vvp), str(cand), str(d / "ref.v"), str(d / "tb.v")])
    if p.returncode:
        return False, "iverilog: " + (p.stderr or p.stdout).strip()[:600]
    out = _run(["vvp", str(vvp)]).stdout
    m = re.search(r"MISMATCHES (\d+)", out)
    if not m:
        return False, "testbench did not finish: " + out[-300:]
    n = int(m.group(1))
    if n:
        first = [l for l in out.splitlines() if l.startswith("MISMATCH ")][:3]
        return False, f"{n} mismatching vectors of 4000. First: " + " | ".join(first)
    return True, ""


def formal(task, cand, tmp):
    d = TASKS / task
    seq = is_sequential(task)
    sat = (f"sat -verify -prove trigger 0 -seq {SEQ_DEPTH} -set-init-zero -show-inputs -show-outputs miter"
           if seq else "sat -verify -prove trigger 0 -show-inputs -show-outputs miter")
    script = (f"read_verilog {cand}; read_verilog {d / 'ref.v'}; proc; flatten; memory_map; "
              f"miter -equiv -flatten -make_outputs {task} {task}_ref miter; hierarchy -top miter; {sat}")
    p = _run(["yosys", "-p", script])
    if p.returncode == 0:
        return True, ""
    log = p.stdout + p.stderr
    err = [l for l in log.splitlines() if "ERROR" in l]
    rows = [l.strip() for l in log.splitlines() if re.match(r"\s*\\?\w+\s+\d+\s+\S+\s+\S+", l)]
    if rows:
        return False, "SAT counterexample (signal, width, hex, value): " + " ; ".join(rows[:12])
    return False, "yosys: " + (err[0] if err else log[-300:])


def evaluate(task, cand):
    """Return {"stage": first failing stage or None, "passed": [...], "feedback": str}."""
    passed = []
    with tempfile.TemporaryDirectory() as tmp:
        for name, fn in zip(STAGES, (lint, sim, formal)):
            ok, msg = fn(task, cand, tmp)
            if not ok:
                return {"stage": name, "passed": passed, "feedback": msg}
            passed.append(name)
    return {"stage": None, "passed": passed, "feedback": ""}
