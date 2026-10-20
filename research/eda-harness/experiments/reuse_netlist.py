"""Does reusing the synthesis netlist change any result, and how much wall time does it save?
Runs the 40-design grid twice on empty caches, once with the original two Yosys runs per design (reuse_netlist=False)
and once with one run feeding both the gate-level check and the score (True). Compares every metric and the wall time.
Run: PYTHONPATH=src:../chip-accel/src python experiments/reuse_netlist.py   (writes reuse_results.txt, reuse_log_*.jsonl)"""
import os, shutil
from eda_harness import harness as H

D = os.path.dirname(os.path.abspath(__file__))
prob = H.Problem(n_vec=24)
runs = {}
for name, flag in (("two_runs", False), ("one_run", True)):
    log, cache = os.path.join(D, f"reuse_log_{name}.jsonl"), os.path.join(D, f".cache_{name}")
    if os.path.exists(log): os.remove(log)
    shutil.rmtree(cache, ignore_errors=True)
    runs[name] = H.run_loop(H.Harness(prob, log, cache, reuse_netlist=flag), H.GridProposer(prob.space), 40)
    shutil.rmtree(cache, ignore_errors=True)
KEYS = ("passed", "rtl_match", "cycles", "cycles_ok", "gate_match", "cells", "ff", "depth", "cells_x_cycles")
a, b = runs["two_runs"], runs["one_run"]
diff = [(x["cand"], k, x.get(k), y.get(k)) for x, y in zip(a, b) for k in KEYS if x.get(k) != y.get(k)]
tot = {n: sum(r["wall_seconds"] for r in rs) for n, rs in runs.items()}
st = {n: {k: sum(r["stage_seconds"].get(k, 0) for r in rs) for k in H.STAGES} for n, rs in runs.items()}
per = [(x["wall_seconds"], y["wall_seconds"]) for x, y in zip(a, b)]
out = [f"# {a[0]['versions']['yosys']}; designs {len(a)}; metrics compared: {', '.join(KEYS)}", "",
       f"metric differences between the two modes: {len(diff)}"] + [f"  {d}" for d in diff] + [
       "", "total wall seconds over 40 uncached designs:",
       f"  two Yosys runs per design: {tot['two_runs']:.1f}", f"  one Yosys run per design:  {tot['one_run']:.1f}",
       f"  saving: {100*(1-tot['one_run']/tot['two_runs']):.1f}%", "", "seconds by stage:"]
for n in st: out.append("  %-9s " % n + "  ".join(f"{k}={v:.1f}" for k, v in st[n].items()))
out += ["", "designs where one run was faster: %d of %d" % (sum(y < x for x, y in per), len(per))]
open(os.path.join(D, "reuse_results.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))
