"""Milestone 5: SAT-miter equivalence proofs of ABC-rewritten netlists against the unoptimised netlist.

One row per (design, pass sequence): cheap features of the rewritten netlist and the proof outcome and wall time.
Usage: python3 proof_run.py [--timeout 10] [--jobs 4]  (writes results.jsonl next to this file)
"""
import argparse
import json
import re
import subprocess
import sys
import tempfile
import time
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from verified_dse import flow  # noqa: E402
import importlib.util  # noqa: E402

_spec = importlib.util.spec_from_file_location("rung_bias_run", HERE.parent / "rung_bias" / "run.py")
_m = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_m)
sequences = _m.sequences  # milestone 1's draw: the same 60 sequences

# sequential FIFO excluded: a one-step miter proves nothing. Milestone 5b adds multipliers of other widths (only the
# 8-bit one was ever hard); they are registered here so flow.py, shared with milestones 1 to 4, is untouched.
WIDTHS = (4, 5, 6, 7, 9, 10)
for _w in WIDTHS:
    flow.DESIGNS[f"mult{_w}"] = ("mult_op", "mult_op", {"W": _w}, "")
DESIGNS = [d for d in flow.DESIGNS if d != "fifo8x4"]


def _cells(txt):
    m = re.search(r"Number of cells:\s*(\d+)", txt) or re.search(r"^\s*(\d+)\s+cells\s*$", txt, flags=re.M)  # Yosys 0.33 / 0.70
    return int(m.group(1))


def point(a):
    design, seq, timeout = a
    top, front = flow._front(design, None)
    with tempfile.TemporaryDirectory() as wd:
        abc = Path(wd) / "x.abc"
        abc.write_text(flow.script_text(seq) + "\n")
        stat = Path(wd) / "stat.txt"
        # reference = the design after synth -noabc; implementation = the same after ABC with the sequence
        s = (front + f"design -save ref0; abc -g {flow.GATES} -script {abc}; opt_clean -purge; "
             f"tee -o {stat} stat; tee -a {stat} ltp -noff; design -stash impl; design -load ref0; "
             f"tee -o {wd}/ref.stat stat; write_json {wd}/ref.json; design -stash ref; "
             f"design -copy-from ref -as ref {top}; design -copy-from impl -as impl {top}; "
             f"miter -equiv -flatten -make_assert ref impl m; hierarchy -top m; ")
        t_pre = time.time()
        pre = subprocess.run(["yosys", "-q", "-p", s], capture_output=True, text=True)
        t_pre = time.time() - t_pre
        row = {"design": design, "seq": list(seq)}
        if pre.returncode:
            return {**row, "status": "fail", "error": (pre.stderr or pre.stdout)[-200:]}
        txt = stat.read_text()
        row["cells"] = _cells(txt)
        row["depth"] = int(re.search(r"Longest topological path in \S+ \(length=(\d+)\)", txt).group(1))
        row["ref_cells"] = _cells((Path(wd) / "ref.stat").read_text())
        mod = json.loads((Path(wd) / "ref.json").read_text())["modules"][top]
        row["input_bits"] = sum(len(v["bits"]) for v in mod["ports"].values() if v["direction"] == "input")
        t0 = time.time()
        p = subprocess.run(["yosys", "-p", s + f"sat -verify -prove-asserts -set-init-zero -timeout {timeout} m"],
                           capture_output=True, text=True)
        row["t_sat"] = max(time.time() - t0 - t_pre, 0.0)
        out = p.stdout
        row["proved"] = "SUCCESS!" in out
        row["cex"] = "FAIL!" in out
        row["timed_out"] = (not row["proved"]) and (not row["cex"])
        row["status"] = "ok"
        return row


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--timeout", type=int, default=10)
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--n", type=int, default=60)
    ap.add_argument("--only", default="", help="comma list of designs (default: all)")
    ap.add_argument("--out", default="results.jsonl")
    a = ap.parse_args()
    seqs = sequences(a.n)
    tasks = [(d, s, a.timeout) for d in DESIGNS if not a.only or d in a.only.split(",") for s in seqs]
    t0 = time.time()
    with Pool(a.jobs) as pool, open(HERE / a.out, "w") as f:
        for r in pool.imap_unordered(point, tasks):
            f.write(json.dumps(r) + "\n")
            f.flush()
    print(f"{len(tasks)} proofs in {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
