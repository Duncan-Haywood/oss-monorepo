"""Experiments for chip-rtl-probe. Writes experiments/results.txt (the only source of README numbers)."""
import json
import sys
import tempfile
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from chip_rtl_probe import check  # noqa: E402
from chip_rtl_probe.loop import Replay, RandomMutation, run_task  # noqa: E402
from chip_rtl_probe.mutate import mutants  # noqa: E402

out = []


def say(s=""):
    print(s)
    out.append(s)


say("tool versions:")
import subprocess  # noqa: E402
for c in (["yosys", "-V"], ["iverilog", "-V"], ["verilator", "--version"]):
    say("  " + subprocess.run(c, capture_output=True, text=True).stdout.splitlines()[0])

tasks = check.task_names()
# 1. session-agent proposer (replay of committed attempts)
say("\n== 1. session-written attempts, replayed through the checker ==")
for t in tasks:
    h = run_task(t, Replay())
    last = h[-1]
    say(f"{t:10s} rounds_used={len(h)} final={'PASS' if last['stage'] is None else 'FAIL@' + last['stage']}")
npass = sum(run_task(t, Replay())[-1]["stage"] is None for t in tasks)
say(f"passed {npass}/{len(tasks)} tasks, all at round 0 where passed")

# 2. checker probing with single-point mutants of the (all-passing) round-0 designs
say("\n== 2. single-point mutants of round-0 designs: first failing stage ==")
total = Counter()
by_task = {}
broken = {}
for t in tasks:
    src = (check.ROOT / "attempts" / t / "round0.v").read_text()
    c = Counter()
    with tempfile.TemporaryDirectory() as tmp:
        for i, (desc, m) in enumerate(mutants(src)):
            f = Path(tmp) / "m.v"
            f.write_text(m)
            r = check.evaluate(t, f)
            c[r["stage"] or "survived"] += 1
            if r["stage"] in ("sim", "formal") and t not in broken:
                broken[t] = (desc, m)
    by_task[t] = c
    total.update(c)
    say(f"{t:10s} mutants={sum(c.values()):3d} " + " ".join(f"{k}={c[k]}" for k in ("lint", "sim", "formal", "survived")))
n = sum(total.values())
say(f"TOTAL mutants={n} " + " ".join(f"{k}={total[k]}" for k in ("lint", "sim", "formal", "survived")))
caught = total["lint"] + total["sim"] + total["formal"]
say(f"sim-escapes (pass lint+sim, fail formal): {total['formal']} of {caught} non-surviving mutants")
say("survived = passes all three stages (equivalent mutant, or a difference no stage can see)")

# 3. non-LLM repair baseline
say("\n== 3. random-mutation repair baseline (one mutation of the broken design per round, feedback ignored) ==")
BUDGETS, SEEDS = (4, 16), range(3)
res = Counter()
for t, (desc, m) in broken.items():
    for b in BUDGETS:
        for s in SEEDS:
            h = run_task(t, RandomMutation(m, s), max_rounds=b + 1)
            res[b] += h[-1]["stage"] is None
runs = len(broken) * len(SEEDS)
say(f"starts: {len(broken)} tasks, one sim/formal-failing mutant each; {len(SEEDS)} seeds")
for b in BUDGETS:
    say(f"budget {b:2d} proposals after the broken start: repaired {res[b]}/{runs}")
(HERE / "results.txt").write_text("\n".join(out) + "\n")
