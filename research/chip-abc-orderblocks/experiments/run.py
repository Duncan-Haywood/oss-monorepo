"""Random mixed per-chain operand orders of csel4: does the shared-block set predict the netlist? Writes results.txt."""
import collections
import os
import random
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from chip_abc_orderblocks import flow, orders, trace

REF = os.path.join(HERE, "..", "designs", "add16.v")
SCRIPTS = ["yosys_default", "dch_map", "resyn2_map"]
N = 400
SEED = 1


def write(path, text):
    with open(path, "w") as fh:
        fh.write(text)


def adds_after_opt(f):
    sig = trace.signatures(f, "add16")
    return sum(int(n) for t, n in sig[4][0] if t.startswith(("$add", "$alu")))


def run():
    rng = random.Random(SEED)
    perms = orders.orders()
    rows, unproved = [], 0
    with tempfile.TemporaryDirectory() as d:
        f = os.path.join(d, "v.v")
        for _ in range(N):
            co = {c: rng.choice(perms) for c in orders.CHAINS}
            write(f, orders.csel4_mixed(co))
            if not flow.equivalent(REF, "add16", f, "add16"):
                unproved += 1
            sc = {}
            for s in SCRIPTS:
                r = flow.score(f, "add16", s)
                sc[s] = r["cells"] * r["depth"]
            rows.append((orders.predicted_shared(co), adds_after_opt(f), sc, co))
    out = [f"csel4: {N} random mixed variants (seed {SEED}); each of the 7 chains gets its own operand order out of 6",
           "pred = blocks whose x and y chains both start with {a,b}; adds4 = $add/$alu cells after `opt -nodffe -nosdff` (10 - shared blocks predicted)",
           "scores are cells x depth: " + " / ".join(SCRIPTS), ""]
    bad = [r for r in rows if r[1] != 10 - len(r[0])]
    out.append(f"variants where adds4 != 10 - len(pred): {len(bad)} of {len(rows)}")
    groups = collections.defaultdict(list)
    for r in rows:
        groups[r[0]].append(r)
    out.append("pred-set  n  distinct scores per script (min..max)")
    for k in sorted(groups, key=lambda k: (len(k), k)):
        g = groups[k]
        cols = []
        for s in SCRIPTS:
            v = [r[2][s] for r in g]
            cols.append(f"{len(set(v))} ({min(v)}..{max(v)})")
        out.append(f"{str(k):<10} {len(g):<3} " + "  ".join(cols))
    out.append(f"variants not proved equivalent to add16.v: {unproved} of {len(rows)}")
    out.append("tool: " + subprocess.run(["yosys", "-V"], capture_output=True, text=True).stdout.strip())
    return "\n".join(out) + "\n"


if __name__ == "__main__":
    text = run()
    write(os.path.join(HERE, "results.txt"), text)
    print(text)
