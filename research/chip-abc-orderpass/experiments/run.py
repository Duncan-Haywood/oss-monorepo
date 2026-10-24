"""Enumerate every operand order of csel4's `a + b + const` chains, localise the pass, ablate it; write results.txt."""
import os
import re
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from chip_abc_orderpass import explicit, flow, orders, trace

REF = os.path.join(HERE, "..", "designs", "add16.v")
SCRIPTS = ["yosys_default", "dch_map", "resyn2_map"]


def write(path, text):
    with open(path, "w") as fh:
        fh.write(text)


def add_count(sig_stage):
    return sum(int(n) for t, n in sig_stage[0] if t.startswith(("$add", "$alu")))


def run():
    out = []
    rows = []  # (label0, label1, adds after stage 4, first stage with different counts, {script: (merge, nomerge)})
    unproved = 0
    with tempfile.TemporaryDirectory() as d:
        f = os.path.join(d, "v.v")
        write(f, orders.csel4((0, 1, 2), (0, 1, 2)))
        ref_sig = trace.signatures(f, "add16")
        for o0 in orders.orders():
            for o1 in orders.orders():
                write(f, orders.csel4(o0, o1))
                if not flow.equivalent(REF, "add16", f, "add16"):
                    unproved += 1
                sig = trace.signatures(f, "add16")
                first = trace.first_difference(ref_sig, sig, 0)
                sc = {}
                for s in SCRIPTS:
                    r = [explicit.score(f, "add16", s, m) for m in (True, False)]
                    sc[s] = tuple(x["cells"] * x["depth"] for x in r)
                    base = flow.score(f, "add16", s)
                    assert base["cells"] * base["depth"] == sc[s][0], "explicit flow does not reproduce synth"
                rows.append((orders.label(o0), orders.label(o1), add_count(sig[4]), None if first is None else trace.STAGES[first], sc))
    out.append("csel4: every operand order (6 x 6 = 36 uniform variants) of the const-0 chains (order0) and const-1 chains (order1); k = the constant")
    out.append("adds4 = $add/$alu cells after `opt -nodffe -nosdff`; first-diff = first pass whose cell counts differ from abk/abk")
    out.append("scores are cells x depth: with opt_merge / without opt_merge")
    out.append("order0 order1 adds4 first-diff".ljust(34) + "".join(s.ljust(22) for s in SCRIPTS))
    for l0, l1, n, first, sc in rows:
        out.append(f"{l0}    {l1}    {n:<5} {str(first):<20} " + "".join(f"{sc[s][0]} / {sc[s][1]}".ljust(22) for s in SCRIPTS))
    out.append("")
    for s in SCRIPTS:
        for j, name in ((0, "with opt_merge"), (1, "without opt_merge")):
            v = [r[4][s][j] for r in rows]
            out.append(f"{s} {name}: min {min(v)} max {max(v)} ratio {max(v)/min(v):.3f} distinct {len(set(v))}")
    out.append(f"variants not proved equivalent to add16.v: {unproved} of {len(rows)}")
    out.append("tool: " + subprocess.run(["yosys", "-V"], capture_output=True, text=True).stdout.strip())
    return "\n".join(out) + "\n"


if __name__ == "__main__":
    text = run()
    write(os.path.join(HERE, "results.txt"), text)
    print(text)
