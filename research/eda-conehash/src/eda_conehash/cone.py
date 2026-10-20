"""Fan-in cone features of a mutant, from a Yosys gate-level netlist (no ABC, so structure stays local to the edit).

Both designs go through `proc; flatten; memory_map; opt; techmap; opt_clean -purge; write_json`. Flip-flop outputs and
ports keep their source names (`acc[3]`), so a sink (a flip-flop's D/E/R inputs, or an output port bit) can be compared
between golden and mutant by a Merkle hash of its combinational fan-in cone whose leaves are named bits. Sinks whose
hash differs are the *changed* sinks; the features describe their cones.
"""
import json
import subprocess
import sys
import tempfile
from collections import deque

sys.setrecursionlimit(100000)
SEQ = "DFF"
FLOW = "read_verilog {f}; proc; flatten; memory_map; opt; techmap; opt_clean -purge; write_json {j}"


def netlist(verilog, top="accel"):
    with tempfile.TemporaryDirectory() as d:
        f, j = f"{d}/a.v", f"{d}/a.json"
        open(f, "w").write(verilog)
        r = subprocess.run(["yosys", "-q", "-p", FLOW.format(f=f, j=j)], capture_output=True, text=True, timeout=180)
        if r.returncode:
            raise RuntimeError(r.stderr[-300:])
        return json.load(open(j))["modules"][top]


def analyse(mod):
    """Per-sink Merkle hashes plus, per sink, its cone size, depth and the named leaves it reads."""
    name = {}
    for n, v in mod["netnames"].items():
        if n.startswith("$"):
            continue
        for k, b in enumerate(v["bits"]):
            if isinstance(b, int):
                name.setdefault(b, f"{n}[{k}]")
    driver = {}
    for cn, c in mod["cells"].items():
        for p, bits in c["connections"].items():
            if c["port_directions"][p] == "output":
                for b in bits:
                    driver[b] = (cn, c)
    memo = {}

    def cone(b):
        """(hash, gates frozenset, depth, leaves frozenset) of the combinational cone driving bit b."""
        if not isinstance(b, int):
            return (str(b), frozenset(), 0, frozenset())
        if b in memo:
            return memo[b]
        d = driver.get(b)
        if d is None or SEQ in d[1]["type"] :
            res = (name.get(b, f"?{b}"), frozenset(), 0, frozenset([name.get(b, f"?{b}")]))
        else:
            cn, c = d
            ins = [cone(x) for p in sorted(c["connections"]) if c["port_directions"][p] == "input"
                   for x in c["connections"][p]]
            gates = frozenset().union(*[i[1] for i in ins]) | {cn} if ins else frozenset([cn])
            res = (hash((c["type"], tuple(sorted(c["parameters"].items())), tuple(i[0] for i in ins))), gates, 1 + max((i[2] for i in ins), default=0),
                   frozenset().union(*[i[3] for i in ins]) if ins else frozenset())
        memo[b] = res
        return res

    sinks = {}
    for cn, c in mod["cells"].items():
        if SEQ in c["type"]:
            q = name.get(c["connections"]["Q"][0], cn)
            parts = [cone(x) for p in ("D", "E", "R") if p in c["connections"] for x in c["connections"][p]]
            sinks[q] = ((c["type"],) + tuple(p[0] for p in parts), frozenset().union(*[p[1] for p in parts]),
                        max(p[2] for p in parts), frozenset().union(*[p[3] for p in parts]))
    for pn, p in mod["ports"].items():
        if p["direction"] == "output":
            for k, b in enumerate(p["bits"]):
                s = cone(b)
                sinks[f"{pn}[{k}]"] = ((s[0],), s[1], s[2], s[3])
    return sinks


def features(gold_sinks, mut_sinks):
    """Cone features of the sinks whose fan-in hash differs. All zero if nothing differs structurally."""
    changed = [k for k in set(gold_sinks) | set(mut_sinks)
               if gold_sinks.get(k, (None,))[0] != mut_sinks.get(k, (None,))[0]]
    gates = set()
    for k in changed:
        gates |= mut_sinks[k][1] if k in mut_sinks else set()
    # register-level read graph of the mutant: sink -> named leaves it reads (a leaf that is a sink is a register)
    base = lambda s: s.split("[")[0]
    regs_of = {}
    for k in mut_sinks:
        regs_of.setdefault(base(k), set())
    readers = {}
    for k, v in mut_sinks.items():
        for leaf in v[3]:
            readers.setdefault(leaf, set()).add(k)
    seen, q = set(changed), deque(changed)
    while q:                       # forward: every sink whose cone reads a changed sink's output, transitively
        for r in readers.get(q.popleft(), ()):
            if r not in seen:
                seen.add(r)
                q.append(r)
    outs = {"done", "y"}
    return {"n_changed": len(changed),
            "cone_gates": len(gates),
            "cone_depth": max((mut_sinks[k][2] for k in changed if k in mut_sinks), default=0),
            "cone_leaves": len(set().union(*[mut_sinks[k][3] for k in changed if k in mut_sinks]) if changed else ()),
            "fwd_sinks": len(seen),
            "reaches_out": int(any(base(s) in outs for s in seen))}


NAMES = ("n_changed", "cone_gates", "cone_depth", "cone_leaves", "fwd_sinks", "reaches_out")
