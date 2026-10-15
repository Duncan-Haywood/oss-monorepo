"""Checks a candidate Verilog module against a task: lint, compile, lockstep simulation, formal."""
import json
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TASKS = ROOT / "tasks"
CYCLES = 4000
STAGES = ("lint", "compile", "sim", "formal")


def _run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


def load_task(name):
    meta = json.loads((TASKS / name / "meta.json").read_text())
    meta["name"] = name
    meta["spec"] = (TASKS / name / "spec.md").read_text()
    meta["ref"] = TASKS / name / "ref.v"
    return meta


def testbench(meta, seed=1):
    """Lockstep testbench: DUT and `<top>_ref` get the same random stimulus; outputs compared with !==."""
    top, seq = meta["top"], meta["kind"] == "seq"
    ins, outs = meta["inputs"], meta["outputs"]
    decl = "".join(f"  reg [{w-1}:0] {n};\n" for n, w in ins)
    decl += "".join(f"  wire [{w-1}:0] d_{n}, r_{n};\n" for n, w in outs)
    if seq:
        decl += "  reg clk = 0; reg rst = 1;\n"
    conn = lambda p: ", ".join([".clk(clk)", ".rst(rst)"] * seq + [f".{n}({n})" for n, _ in ins]
                               + [f".{n}({p}{n})" for n, _ in outs])
    cmp_ = " || ".join(f"(d_{n} !== r_{n})" for n, _ in outs)
    show = " ".join(f"{n}=%0d" for n, _ in ins)
    showv = ", ".join(n for n, _ in ins)
    got = " ".join(f"{n}: got %0d want %0d;" for n, _ in outs)
    gotv = ", ".join(f"d_{n}, r_{n}" for n, _ in outs)
    rnd = "".join(f"      {n} = $urandom;\n" for n, _ in ins)
    body = f"""
  integer errs = 0, i, seed = {seed};
  task check(input integer phase);
    if ({cmp_}) begin
      errs = errs + 1;
      if (errs <= 3) $display("MISMATCH cycle %0d phase %0d inputs {show} -> {got}", i, phase, {showv}, {gotv});
    end
  endtask
"""
    if seq:
        loop = f"""
  initial begin
    i = $urandom(seed);
    for (i = 0; i < {CYCLES}; i = i + 1) begin
{rnd}      rst = (i < 2) ? 1 : (($urandom % 40) == 0);
      #1 if (i > 0) check(0);
      clk = 1; #1 check(1);
      clk = 0; #3;
    end
    $display("RESULT errors=%0d", errs); $finish;
  end
"""
    else:
        loop = f"""
  initial begin
    i = $urandom(seed);
    for (i = 0; i < {CYCLES}; i = i + 1) begin
{rnd}      #1 check(0);
    end
    $display("RESULT errors=%0d", errs); $finish;
  end
"""
    return (f"module tb;\n{decl}  {top} dut({conn('d_')});\n  {top}_ref golden({conn('r_')});\n"
            f"{body}{loop}endmodule\n")


def check(meta, cand, workdir=None):
    """Run all stages on candidate file `cand`. Returns {stage: (ok, message)} for stages reached."""
    top, cand = meta["top"], Path(cand)
    res = {}
    wd = Path(workdir or tempfile.mkdtemp())
    p = _run(["verilator", "--lint-only", "-Wall", "-Wno-fatal", "-Wno-EOFNEWLINE", "-Wno-DECLFILENAME",
              "--top-module", top, str(cand)])
    errs = [l for l in p.stderr.splitlines() if l.startswith("%Error")]
    warns = [l for l in p.stderr.splitlines() if l.startswith("%Warning")]
    res["lint"] = (p.returncode == 0, "\n".join(errs or warns))
    if p.returncode != 0:
        return res, len(warns)
    tb = wd / "tb.v"
    tb.write_text(testbench(meta))
    vvp = wd / "sim.vvp"
    p = _run(["iverilog", "-g2012", "-s", "tb", "-o", str(vvp), str(cand), str(meta["ref"]), str(tb)])
    res["compile"] = (p.returncode == 0, p.stderr.strip())
    if p.returncode != 0:
        return res, len(warns)
    out = _run(["vvp", str(vvp)], timeout=120).stdout
    ok = "RESULT errors=0" in out
    res["sim"] = (ok, "\n".join(l for l in out.splitlines() if l.startswith(("MISMATCH", "RESULT"))))
    if not ok:
        return res, len(warns)
    if meta["kind"] == "comb":
        script = (f"read_verilog {cand}; read_verilog {meta['ref']}; proc; flatten; "
                  f"miter -equiv -flatten -make_outputs {top} {top}_ref miter; "
                  f"hierarchy -top miter; sat -verify -prove trigger 0 miter")
        p = _run(["yosys", "-q", "-p", script])
        res["formal"] = (p.returncode == 0, "" if p.returncode == 0 else "SAT miter found a differing input")
    else:
        res["formal"] = (True, "skipped (sequential task: simulation only)")
    return res, len(warns)


def passed(res):
    return all(res.get(s, (False,))[0] for s in STAGES)


def first_failure(res):
    for s in STAGES:
        if s not in res or not res[s][0]:
            return s
    return None
