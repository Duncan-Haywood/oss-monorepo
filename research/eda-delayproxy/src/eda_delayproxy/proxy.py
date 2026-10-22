"""Library-free delay proxies on a Yosys generic gate netlist (`write_json` of `abc -g ...`, so cells are $_AND_, $_NAND_ ...).

The netlist is a DAG between registers: sources are primary inputs and flip-flop outputs, sinks are flip-flop inputs and
primary outputs. A proxy gives each gate a delay and takes the longest path.

Logical-effort model (Sutherland, Sproull and Harris, *Logical Effort*, 1999, Table 1.1 and section 1.4): a stage costs
d = g*h + p, h = load capacitance / input capacitance. Here h = fan-out count (every gate input counts as one unit of
input capacitance; primary outputs and flip-flop D pins count as one load). Single-stage values: NAND2 g=4/3 p=2,
NOR2 g=5/3 p=2, 2-input XOR/XNOR g=4 p=4, 2-input multiplexer g=2 p=2, inverter g=1 p=1. AND and OR are a NAND/NOR stage
(driving an internal inverter, h=1) followed by an inverter that drives the fan-out. ANDNOT and ORNOT (one inverted
input) are modelled as AND and OR, ignoring the extra input inverter: an approximation.
"""
import json
from collections import defaultdict

# (g, p) of the first stage, and whether an output inverter stage follows
LE = {"$_NOT_": (1.0, 1.0, False), "$_NAND_": (4 / 3, 2.0, False), "$_NOR_": (5 / 3, 2.0, False),
      "$_AND_": (4 / 3, 2.0, True), "$_OR_": (5 / 3, 2.0, True),
      "$_ANDNOT_": (4 / 3, 2.0, True), "$_ORNOT_": (5 / 3, 2.0, True),
      "$_XOR_": (4.0, 4.0, False), "$_XNOR_": (4.0, 4.0, False), "$_MUX_": (2.0, 2.0, False)}


def load(json_text, top="accel"):
    """Return (gates, loads): gates is a list of (type, input bit ids, output bit id); loads counts reader pins per bit.
    Flip-flops are cut: their Q is a source and their D a sink (counts as a load, not a gate)."""
    mod = json.loads(json_text)["modules"][top]
    gates, loads = [], defaultdict(int)
    for c in mod["cells"].values():
        t, con, d = c["type"], c["connections"], c["port_directions"]
        if t.startswith("$_DFF") or t.startswith("$_SDFF") or t.startswith("$_DLATCH") or t.startswith("$_ADFF"):
            for port, bits in con.items():
                if d[port] == "input":
                    for b in bits:
                        if isinstance(b, int):
                            loads[b] += 1
            continue
        ins = [b for p, bits in con.items() if d[p] == "input" for b in bits if isinstance(b, int)]
        outs = [b for p, bits in con.items() if d[p] == "output" for b in bits if isinstance(b, int)]
        for b in ins:
            loads[b] += 1
        gates.append((t, ins, outs[0]))
    for name, p in mod["ports"].items():
        if p["direction"] == "output":
            for b in p["bits"]:
                if isinstance(b, int):
                    loads[b] += 1
    return gates, loads


def stage_delay(gtype, fanout, mode, scale=None):
    """Delay of one gate under a proxy. Modes: unit (1 per gate), type (logical-effort delay at fan-out 1),
    le (logical effort with the real fan-out), fanout (1 + 0.5 per extra load, a type-blind load model).
    `scale` (gate type -> factor) multiplies a gate's delay, for the weight sweep."""
    if mode == "unit":
        return 1.0
    g, p, two = LE[gtype]
    h = max(fanout, 1)
    if mode == "type":
        h = 1
    elif mode == "fanout":
        return 1.0 + 0.5 * (h - 1)
    k = scale.get(gtype, 1.0) if scale else 1.0
    if two:
        return k * (g * 1.0 + p + 1.0 + 1.0 * h)  # first stage drives the internal inverter (h=1), inverter drives the load
    return k * (g * h + p)


def critical_path(gates, loads, mode="unit", scale=None):
    """Longest source-to-sink delay. Gates are processed in topological order (Kahn)."""
    drv = {out: i for i, (_, _, out) in enumerate(gates)}
    indeg = [0] * len(gates)
    readers = defaultdict(list)
    for i, (_, ins, _) in enumerate(gates):
        for b in set(ins):
            if b in drv:
                indeg[i] += 1
                readers[b].append(i)
    arr = [0.0] * len(gates)
    stack = [i for i, d in enumerate(indeg) if d == 0]
    seen = 0
    best = 0.0
    while stack:
        i = stack.pop()
        seen += 1
        t, ins, out = gates[i]
        a = max([arr[drv[b]] for b in ins if b in drv] or [0.0])
        arr[i] = a + stage_delay(t, loads[out], mode, scale)
        best = max(best, arr[i])
        for j in readers[out]:
            indeg[j] -= 1
            if indeg[j] == 0:
                stack.append(j)
    if seen != len(gates):
        raise ValueError("combinational loop in netlist")
    return best


def max_fanout(loads):
    return max(loads.values() or [0])
