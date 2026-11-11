"""Milestone 5s: the load-sensing margin at which LS and open-centre use the same energy, in closed form.

In this model a load-sensing pump delivers each phase's summed demand q at the highest load pressure
plus the margin m, and at idle a flow q_idle at p_idle + m plus a standby flow q_sb at m. So its
cycle energy is affine in m:

    LS(m) = A + B m,   A = sum q p_max T + q_idle p_idle t_idle,   B = sum q T + (q_idle + q_sb) t_idle

The open-centre energy OC does not depend on m (a fixed pump Q at p_max + d while moving, Q at p_n
at idle). Both share the pump efficiency, which cancels. Hence the exact break-even

    m* = (OC - A) / B = (S + D + I) / B
    S = sum (Q - q) p_max T          surplus flow dropped at load pressure while moving
    D = sum Q d T                    open-centre spool drop while moving
    I = Q p_n t_idle - q_idle p_idle t_idle   idle bleed net of the LS idle work

LS/OC is increasing in m for every cycle, so over a set of cycles the median LS/OC equals 1 exactly
at the median of the per-cycle m*, and LS uses more energy than OC in a cycle iff m > m*_c.
Units: bar, L/min, s; m* is in bar. Pure stdlib.
"""
from statistics import median


def breakeven_margin(phases, pump_flow, oc_pressures=None, oc_drop=0.0, p_neutral=0.0, t_idle=0.0,
                     q_idle=0.0, p_idle=0.0, q_standby=0.0):
    """Exact break-even LS margin (bar) for one cycle and its decomposition.

    phases: iterable of Phase (circuits.Phase). The open-centre pump pressure while a phase moves is
    oc_pressures[k] if given (any spool model), else max load pressure + oc_drop.
    Returns dict m, S, D, I, B (S, D, I in bar*L/min*s; m = (S + D + I) / B) and the slopes
    dm_ddrop = Q T_move / B and dm_dpn = Q t_idle / B."""
    phases = tuple(phases)
    S = D = V = T = 0.0
    for k, ph in enumerate(phases):
        q = sum(a.flow for a in ph.actuators)
        if q > pump_flow + 1e-9:
            raise ValueError(f"phase {ph.name}: demand {q} > pump {pump_flow} L/min")
        p_max = max(a.pressure for a in ph.actuators)
        p_oc = oc_pressures[k] if oc_pressures is not None else p_max + oc_drop
        if p_oc < p_max - 1e-9:
            raise ValueError(f"phase {ph.name}: open-centre pressure {p_oc} below load {p_max}")
        S += (pump_flow - q) * p_max * ph.seconds
        D += pump_flow * (p_oc - p_max) * ph.seconds
        V += q * ph.seconds
        T += ph.seconds
    I = (pump_flow * p_neutral - q_idle * p_idle) * t_idle
    B = V + (q_idle + q_standby) * t_idle
    if B <= 0:
        raise ValueError("load-sensing delivers no volume, so the margin has no effect")
    return {"m": (S + D + I) / B, "S": S, "D": D, "I": I, "B": B,
            "dm_ddrop": pump_flow * T / B, "dm_dpn": pump_flow * t_idle / B}


def median_breakeven(margins):
    """Margin at which the median LS/OC over cycles is 1: the median of the per-cycle m*."""
    return median(margins)


def share_ls_worse(margins, m):
    """Percent of cycles in which LS uses more energy than open-centre at margin m."""
    margins = list(margins)
    return 100.0 * sum(x < m for x in margins) / len(margins)
