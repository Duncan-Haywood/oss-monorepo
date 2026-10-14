"""Scripted checks for one candidate: compile, lint, simulate, and prove equivalence.

The checker never calls a model. Feedback strings are what a proposer sees between rounds.
"""
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

TASKS = Path(__file__).resolve().parents[2] / "tasks"
SEQUENTIAL = {"satcnt4", "rr_arb4"}  # no combinational miter; simulation only
# bcd_add2: the spec leaves non-BCD digits undefined, so an unconstrained miter would reject
# correct designs; its testbench is exhaustive over the specified (BCD) domain instead.
NO_FORMAL = SEQUENTIAL | {"bcd_add2"}


def task_names():
    return sorted(p.name for p in TASKS.iterdir() if p.is_dir())


def spec(task):
    return (TASKS / task / "spec.md").read_text().strip()


def have_tools():
    return all(shutil.which(t) for t in ("yosys", "iverilog", "vvp", "verilator"))


def _run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


def check(task, source):
    """Score Verilog `source` (a string defining module `task`) against the task.

    Returns a dict: ok, stage (first failing stage or "pass"), fail/total (simulation
    mismatches), lint_warnings, formal (True/False/None when not applicable), feedback.
    """
    res = {"ok": False, "stage": None, "fail": None, "total": None,
           "lint_warnings": 0, "formal": None, "feedback": ""}
    t = TASKS / task
    with tempfile.TemporaryDirectory() as d:
        cand = Path(d) / "cand.v"
        cand.write_text(source)
        # 1. compile (Icarus) together with the reference and testbench
        vvp = Path(d) / "sim.vvp"
        p = _run(["iverilog", "-g2012", "-s", "tb", "-o", str(vvp), str(cand),
                  str(t / "golden.v"), str(t / "tb.v")])
        if p.returncode != 0:
            res.update(stage="compile", feedback="iverilog: " + p.stderr.strip()[:600])
            return res
        # 2. lint (Verilator): errors fail, warnings are reported
        lp = _run(["verilator", "--lint-only", "-Wall", "-Wno-fatal", "--top-module", task, str(cand)])
        if "%Error" in lp.stderr:
            msg = "\n".join(l for l in lp.stderr.splitlines() if l.startswith("%Error"))
            res.update(stage="lint", feedback="verilator: " + msg[:600])
            return res
        warns = [l for l in lp.stderr.splitlines() if l.startswith("%Warning")]
        res["lint_warnings"] = len(warns)
        # 3. simulation against the reference
        try:
            out = _run(["vvp", str(vvp)], timeout=20).stdout
        except subprocess.TimeoutExpired:  # e.g. a mutated loop bound that never ends
            res.update(stage="sim", feedback="simulation timed out after 20 s")
            return res
        m = re.search(r"RESULT fail=(\d+) total=(\d+)", out)
        if not m:
            res.update(stage="sim", feedback="simulation printed no RESULT line")
            return res
        res["fail"], res["total"] = int(m.group(1)), int(m.group(2))
        if res["fail"]:
            res.update(stage="sim", feedback=f"simulation: {res['fail']} of {res['total']} vectors differ from the reference")
            return res
        # 4. formal (combinational tasks): SAT miter against the reference
        if task not in NO_FORMAL:
            script = (f"read_verilog {cand}; read_verilog {t / 'golden.v'}; proc; flatten; "
                      f"miter -equiv -flatten -make_outputs {task} {task}_ref miter; "
                      f"hierarchy -top miter; sat -verify -prove trigger 0 miter")
            res["formal"] = _run(["yosys", "-q", "-p", script]).returncode == 0
            if not res["formal"]:
                res.update(stage="formal", feedback="yosys miter: not equivalent to the reference")
                return res
    res.update(ok=True, stage="pass", feedback="all checks pass" +
               (f" ({len(warns)} lint warnings)" if warns else ""))
    return res
