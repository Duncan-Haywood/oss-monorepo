"""Loop-nest cost model and a schedule simulator for dataflows of a P-lane MAC array (stylised).

Layer: y[b][o] = sum_i W[o][i] x[b][i], O outputs, I inputs, batch B, P MAC lanes.
A dataflow is a schedule: for every cycle, the list of (lane, o, i, b) MACs. The *simulator* walks that schedule
and counts SRAM accesses with a one-cycle register: an operand is fetched only if it differs from what the
lane/bus held in the previous cycle; a partial sum leaves the register file when its (o, b) is not worked on
in the next cycle (written back), and is read back when a group returns. The *closed forms* give the same
counts from the loop bounds alone. Tests check that they agree and that the arithmetic equals NumPy.

Dataflows (loop order outer -> inner; lane mapping):
  OS : o_tile, i, b      lane j = output o_tile*P+j       (outputs stay in lanes)
  WS : o_tile, i, b with weights kept across b  -- same schedule as OS; the two differ in the b-order below
       Here: WS = (o_tile, i, b) and OS = (o_tile, b, i).  OS keeps psums in registers, WS keeps weights.
  IS : i_tile, o, b      lane j = input i_tile*P+j; adder tree across lanes; psums accumulate in SRAM across tiles
  RT : o, i_tile, b      same lane map as IS, outputs finish before moving on (psum in register across i_tiles)
"""
import math
from itertools import product

DATAFLOWS = ("OS", "WS", "IS", "RT")


def schedule(df, O, I, B, P):
    """Yield, per cycle, a list of (lane, o, i, b)."""
    ot, it = math.ceil(O / P), math.ceil(I / P)
    if df == "OS":
        for t, b, i in product(range(ot), range(B), range(I)):
            yield [(j, t * P + j, i, b) for j in range(P) if t * P + j < O]
    elif df == "WS":
        for t, i, b in product(range(ot), range(I), range(B)):
            yield [(j, t * P + j, i, b) for j in range(P) if t * P + j < O]
    elif df == "IS":
        for t, o, b in product(range(it), range(O), range(B)):
            yield [(j, o, t * P + j, b) for j in range(P) if t * P + j < I]
    elif df == "RT":
        for o, t, b in product(range(O), range(it), range(B)):
            yield [(j, o, t * P + j, b) for j in range(P) if t * P + j < I]
    else:
        raise ValueError(df)


def simulate(df, O, I, B, P, W=None, X=None):
    """Walk the schedule. Returns counts, and y if W (O x I) and X (B x I) are given."""
    c = dict(cycles=0, macs=0, adds=0, w_rd=0, x_rd=0, p_rd=0, p_wr=0, lane_cycles=0)
    y = {}
    wreg = {}                 # lane -> (o, i) weight held
    prev_x = set()            # (b, i) on the activation bus last cycle
    prev_g = set()            # (o, b) partial sums in registers last cycle
    seen = set()              # (o, b) groups that have a partial in SRAM or registers
    for ops in schedule(df, O, I, B, P):
        c["cycles"] += 1
        c["macs"] += len(ops)
        c["lane_cycles"] += P
        for lane, o, i, b in ops:
            if wreg.get(lane) != (o, i):
                c["w_rd"] += 1
                wreg[lane] = (o, i)
        xs = {(b, i) for _, _, i, b in ops}
        c["x_rd"] += len(xs - prev_x)
        prev_x = xs
        gs = {(o, b) for _, o, _, b in ops}
        c["adds"] += len(ops)          # one accumulate or tree add per product
        for g in gs - prev_g:
            if g in seen:
                c["p_rd"] += 1
        for g in prev_g - gs:
            c["p_wr"] += 1
        seen |= gs
        prev_g = gs
        if W is not None:
            for _, o, i, b in ops:
                y[(b, o)] = y.get((b, o), 0) + int(W[o][i]) * int(X[b][i])
    c["p_wr"] += len(prev_g)
    return c, y


def closed_form(df, O, I, B, P):
    """Same counts from loop bounds alone (valid for I > 1 and O * B > 1; the simulator covers the degenerate cases)."""
    ot, it = math.ceil(O / P), math.ceil(I / P)
    r = dict(macs=O * I * B, adds=O * I * B)
    if df == "OS":                 # (o_tile, b, i): psums in registers, weights re-read for every b
        r.update(cycles=ot * B * I, w_rd=O * I * B, x_rd=ot * B * I, p_rd=0, p_wr=O * B)
    elif df == "WS":               # (o_tile, i, b): weights held across b, psums leave when b>1
        if B > 1:
            r.update(cycles=ot * I * B, w_rd=O * I, x_rd=ot * I * B, p_rd=O * B * (I - 1), p_wr=O * I * B)
        else:
            r.update(cycles=ot * I, w_rd=O * I, x_rd=ot * I, p_rd=0, p_wr=O)
    elif df == "IS":               # (i_tile, o, b): inputs held across o, psums accumulate in SRAM across tiles
        r.update(cycles=it * O * B, w_rd=O * I, x_rd=(O * I * B if B > 1 else I),
                 p_rd=(it - 1) * O * B, p_wr=it * O * B)
    elif df == "RT":               # (o, i_tile, b): outputs finish one at a time
        if B > 1:
            r.update(cycles=O * it * B, w_rd=O * I, x_rd=O * I * B, p_rd=O * B * (it - 1), p_wr=O * it * B)
        else:
            r.update(cycles=O * it, w_rd=O * I, x_rd=(O * I if it > 1 else I), p_rd=0, p_wr=O)
    return r
