"""Yosys gate-level netlists as a DAG, and their 4-feasible cuts with exact-cost headroom."""
import json
import os
import subprocess
import tempfile

from . import exact as E

GATES = "AND,NAND,OR,NOR,XOR,XNOR,ANDNOT,ORNOT"  # 2-input types only, as in chip-exact4 (inverters are $_NOT_)
RESYN2 = ("strash; balance; rewrite; refactor; balance; rewrite; rewrite -z; balance; "
          "refactor -z; rewrite -z; balance")
FLOWS = {"fast": "-fast", "strash_map": "strash; map", "default": None, "dch_map": "strash; dch; map", "resyn2_map": RESYN2 + "; map"}

# truth-table functions of the two inputs (a, b): bit (2a+b) of the constant is the output
_OPS = {
    "$_AND_": lambda a, b, m: a & b,
    "$_NAND_": lambda a, b, m: ~(a & b) & m,
    "$_OR_": lambda a, b, m: a | b,
    "$_NOR_": lambda a, b, m: ~(a | b) & m,
    "$_XOR_": lambda a, b, m: a ^ b,
    "$_XNOR_": lambda a, b, m: ~(a ^ b) & m,
    "$_ANDNOT_": lambda a, b, m: a & ~b & m,
    "$_ORNOT_": lambda a, b, m: (a | ~b) & m,
}


def synth(verilog, top, flow="default"):
    """Run Yosys `synth -noabc; abc -g ...` and return (inputs, outputs, gates) from write_json.

    inputs: list of bit ids; outputs: list of bit ids; gates: {out_bit: (type, [in bits])}.
    Bit ids are ints; the strings "0" and "1" are constants.
    """
    body = FLOWS[flow]
    with tempfile.TemporaryDirectory() as d:
        src, js = os.path.join(d, "d.v"), os.path.join(d, "d.json")
        with open(src, "w") as fh:
            fh.write(verilog)
        opt = ""
        if body is not None and body.startswith("-"):
            opt = body
        elif body is not None:
            path = os.path.join(d, "s.abc")
            with open(path, "w") as fh:
                fh.write(body + "\n")
            opt = f"-script {path}"
        p = subprocess.run(["yosys", "-q", "-p", f"read_verilog {src}; synth -top {top} -flatten -noabc; "
                            f"abc -g {GATES} {opt}; opt_clean -purge; write_json {js}"],
                           capture_output=True, text=True)
        if p.returncode:
            raise RuntimeError(p.stderr.strip() or p.stdout.strip())
        with open(js) as fh:
            mod = json.load(fh)["modules"][top]
    ins, outs, gates = [], [], {}
    for port in mod["ports"].values():
        (ins if port["direction"] == "input" else outs).extend(port["bits"])
    for c in mod["cells"].values():
        t = c["type"]
        con = c["connections"]
        if t == "$_NOT_":
            gates[con["Y"][0]] = (t, [con["A"][0]])
        elif t in _OPS:
            gates[con["Y"][0]] = (t, [con["A"][0], con["B"][0]])
        else:
            raise ValueError(f"unexpected cell {t}")
    return ins, outs, gates


def evaluate(ins, outs, gates, vec):
    """Evaluate on one input vector {bit: 0/1}; returns the output bits in order (for testing the parser)."""
    val = {"0": 0, "1": 1}
    val.update(vec)

    def get(b):
        if b in val:
            return val[b]
        t, fi = gates[b]
        if t == "$_NOT_":
            r = 1 - get(fi[0])
        else:
            r = _OPS[t](get(fi[0]), get(fi[1]), 1)
        val[b] = r
        return r
    return [get(b) for b in outs]


def gate_count(gates):
    return sum(1 for t, _ in gates.values() if t != "$_NOT_")


def class_costs(costs_path=None):
    """(rep, cost): rep[f] is f's NPN class representative; cost[rep] the exact minimum gate count."""
    path = costs_path or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "experiments",
                                      "exact_costs.json")
    with open(path) as fh:
        cost = {int(k): v for k, v in json.load(fh).items()}
    rep, _ = E.npn_classes()
    return rep, cost


def analyse(ins, outs, gates, rep, cost, k=4):
    """Per-root best cut, then a disjoint greedy selection.

    For a gate g and a cut (<=k leaves) the cone is every node between g and the leaves; its MFFC S is the
    set of cone nodes whose every fanout lies in S (g included) and that are not primary outputs. Replacing
    S by a circuit of exact size cost(f) over the leaves removes |S gates| - cost(f) gates, if positive.
    Returns a dict of counts.
    """
    fanout = {}
    for g, (_, fi) in gates.items():
        for b in fi:
            fanout.setdefault(b, set()).add(g)
    po = set(outs)
    order = []
    seen = set()

    def visit(b):
        if b in seen or b not in gates:
            return
        seen.add(b)
        for x in gates[b][1]:
            visit(x)
        order.append(b)
    for b in list(outs) + list(gates):
        visit(b)

    full = E.FULL
    cuts = {}  # node -> list of frozenset leaves
    for b in ins:
        cuts[b] = [frozenset([b])]
    cuts["0"] = [frozenset()]
    cuts["1"] = [frozenset()]
    for g in order:
        t, fi = gates[g]
        if t == "$_NOT_":
            merged = {c for c in cuts[fi[0]]}
        else:
            merged = set()
            for c1 in cuts[fi[0]]:
                for c2 in cuts[fi[1]]:
                    u = c1 | c2
                    if len(u) <= k:
                        merged.add(u)
        merged.add(frozenset([g]))
        cuts[g] = list(merged)

    def table(root, leaves):
        lv = {b: E.VAR[i] for i, b in enumerate(sorted(leaves, key=str))}
        memo = {"0": 0, "1": full}
        memo.update(lv)

        def go(b):
            if b in memo:
                return memo[b]
            t, fi = gates[b]
            r = (~go(fi[0]) & full) if t == "$_NOT_" else _OPS[t](go(fi[0]), go(fi[1]), full)
            memo[b] = r
            return r
        return go(root)

    def cone(root, leaves):
        out, stack = set(), [root]
        while stack:
            b = stack.pop()
            if b in out or b in leaves or b not in gates:
                continue
            out.add(b)
            stack.extend(gates[b][1])
        return out

    best, biggest = {}, {}
    n_cuts = 0
    for g in order:
        if gates[g][0] == "$_NOT_":
            continue
        top = None
        big = 0
        for leaves in cuts[g]:
            if g in leaves:
                continue
            cn = cone(g, leaves)
            s = {g}
            changed = True
            while changed:
                changed = False
                for m in cn - s:
                    if m not in po and fanout.get(m) and fanout[m] <= s:
                        s.add(m)
                        changed = True
            size = sum(1 for m in s if gates[m][0] != "$_NOT_")
            saving = size - cost[rep[table(g, leaves)]]
            n_cuts += 1
            big = max(big, size)
            cand = (saving, -size, sorted(map(str, leaves)))
            if top is None or cand[:2] > top[:2]:
                top = (saving, -size, s)
        best[g] = top
        biggest[g] = big
    total = gate_count(gates)
    with_headroom = sum(1 for v in best.values() if v and v[0] > 0)
    claimed, removed = set(), 0
    for g, v in sorted(best.items(), key=lambda kv: (-kv[1][0], str(kv[0]))):
        if v[0] <= 0 or v[2] & claimed:
            continue
        claimed |= v[2]
        removed += v[0]
    nontrivial = sum(1 for g, v in best.items() if biggest[g] >= 3 and v[0] <= 0)
    return {"gates": total, "cuts": n_cuts, "roots_with_cone3_all_exact": nontrivial, "roots_with_headroom": with_headroom,
            "roots": len(best), "removable_disjoint": removed}
