"""A lower bound on the open-centre spool drop from full-travel P-to-A flow (milestone 5p).

An uncompensated spool at travel x passes q = K(x) sqrt(p_pump - p_in), and
K(x) <= K(full travel). So while a section passes q, the pump pressure is at
least p_in + dp_floor(q), whatever the lever position or the bypass closing
law. K(full) comes from the PVG 32 manual's P-to-A flow at full travel at 10
and 20 bar margin (`experiments/data/pvg32_flow_full_travel.csv`, milestone 3j).

Units: bar, L/min. Stdlib only.
"""
import csv
import math

LAWS = ("orifice", "power")


def read_table(path, spools=("A", "B", "C", "D", "E")):
    """Rows of the digitised full-travel table as dicts with floats: spool,
    rated, q10, q20 (band middles) and n (exponent between 10 and 20 bar)."""
    out = []
    with open(path) as fh:
        for r in csv.DictReader(fh):
            if r["spool"] not in spools:
                continue
            q10 = (float(r["q10_low"]) + float(r["q10_high"])) / 2
            q20 = (float(r["q20_low"]) + float(r["q20_high"])) / 2
            out.append(dict(spool=r["spool"], rated=float(r["rated_lpm"]), q10=q10, q20=q20,
                            n=math.log(q20 / q10) / math.log(2)))
    return sorted(out, key=lambda r: r["rated"])


def size_spool(q_design, table, step_up=0):
    """Smallest spool whose rated flow covers q_design (3g's rule), moved up
    `step_up` sizes; the largest spool if none covers it."""
    i = next((k for k, r in enumerate(table) if r["rated"] >= q_design), len(table) - 1)
    return table[min(len(table) - 1, i + step_up)]


def floor_drop(q, row, law="orifice"):
    """Least pump-to-chamber drop (bar) at which the spool, fully open, passes q.

    orifice: q = q10 sqrt(dp / 10); power: q = q10 (dp / 10)^n, through the
    10 and 20 bar points of the manual (n from the two readings)."""
    if q <= 0:
        return 0.0
    if law == "orifice":
        return 10.0 * (q / row["q10"]) ** 2
    if law == "power":
        return 10.0 * (q / row["q10"]) ** (1.0 / row["n"])
    raise KeyError(law)


def oc_pressure(sections):
    """Open-centre pump pressure bound while moving: max over (p_in, dp) of
    p_in + dp; None when no section moves."""
    ps = [p + d for p, d in sections]
    return max(ps) if ps else None
