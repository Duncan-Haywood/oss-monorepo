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


def decompose(phases, pump_flow, oc_pressures=None, oc_drop=0.0, p_neutral=0.0, t_idle=0.0,
              q_idle=0.0, p_idle=0.0, q_standby=0.0):
    """Milestone 5u: m* as a volume ratio times a load pressure, exactly.

    With V = sum q T (load-sensing volume while moving), r = Q T_move / V (fixed-pump volume over it),
    p_Q = sum p_max T / T_move (pump-flow-weighted highest load pressure; time-weighted, since Q is
    fixed), p_q = sum q p_max T / V (demand-weighted) and d_bar = sum (p_oc - p_max) T / T_move:

        S = V (r p_Q - p_q),  D = V r d_bar,  so
        m* = beta [(r - 1) p_q + r (p_Q - p_q) + r d_bar] + I / B,   beta = V / B.

    Returns breakeven_margin's dict plus r, p_Q, p_q, d_bar, beta, the terms in bar of m*
    (main = beta (r - 1) p_q, cov = beta r (p_Q - p_q), drop = beta r d_bar, idle = I / B) and the
    two-number rule rule2 = (r - 1) p_q + r d_bar (moving only, no beta, no idle)."""
    phases = tuple(phases)
    out = breakeven_margin(phases, pump_flow, oc_pressures, oc_drop, p_neutral, t_idle, q_idle, p_idle,
                           q_standby)
    V = T = pt = pq = dd = 0.0
    for k, ph in enumerate(phases):
        q = sum(a.flow for a in ph.actuators)
        p_max = max(a.pressure for a in ph.actuators)
        p_oc = oc_pressures[k] if oc_pressures is not None else p_max + oc_drop
        V += q * ph.seconds
        T += ph.seconds
        pt += p_max * ph.seconds
        pq += q * p_max * ph.seconds
        dd += (p_oc - p_max) * ph.seconds
    if V <= 0:
        raise ValueError("no load-sensing volume while moving")
    r, p_Q, p_q, d_bar, beta = pump_flow * T / V, pt / T, pq / V, dd / T, V / out["B"]
    out.update(r=r, p_Q=p_Q, p_q=p_q, d_bar=d_bar, beta=beta, main=beta * (r - 1) * p_q,
               cov=beta * r * (p_Q - p_q), drop=beta * r * d_bar, idle=out["I"] / out["B"],
               rule2=(r - 1) * p_q + r * d_bar)
    return out


def median_breakeven(margins):
    """Margin at which the median LS/OC over cycles is 1: the median of the per-cycle m*."""
    return median(margins)


def share_ls_worse(margins, m):
    """Percent of cycles in which LS uses more energy than open-centre at margin m."""
    margins = list(margins)
    return 100.0 * sum(x < m for x in margins) / len(margins)


def trace_breakeven(samples, dt, p_neutral, q_standby=0.0):
    """Exact break-even LS margin (bar) on a sampled trace (milestone 5t).

    samples: iterable of (q_fix, sections); q_fix is the open-centre pump flow (L/min) at that
    sample and each section is (q, p, oc_on, drop): P-port flow (L/min), inlet pressure (bar, None
    if unknown), whether open-centre counts the section as moving, and its open-centre spool drop
    (bar) on top of p. Load-sensing delivers the summed positive demand at the highest known load
    pressure plus m on samples where some section has q > 0 and a known p, and q_standby at m
    elsewhere. Open-centre delivers max(q_fix, moving demand) at max(p + drop) over its moving
    sections, else q_fix at p_neutral. Energies are bar*L/min*s/600 = J (no pump efficiency).

    Returns dict with m, the open-centre energy OC = A + S + D + I + ... split as:
    A (LS energy at zero margin), S (open-centre flow at load pressure minus A: surplus flow),
    D (open-centre spool drop), I (open-centre neutral bleed), B (LS J per bar of margin),
    and the slopes dm_ddrop (constant extra spool drop) and dm_dpn (neutral pressure)."""
    k = dt / 0.6
    A = Bm = n_still = S_oc = D = I = q_mv = q_still = A_on = V_on = 0.0
    for q_fix, secs in samples:
        known = [(q, p) for q, p, _, _ in secs if q > 0 and p is not None]
        if known:
            A += sum(q for q, _, _, _ in secs if q > 0) * max(p for _, p in known) * k
            Bm += sum(q for q, _, _, _ in secs if q > 0) * k
        else:
            n_still += 1
        on = [(q, p, d) for q, p, o, d in secs if o and q > 0 and p is not None]
        if on:
            q_oc = max(q_fix, sum(q for q, _, _ in on))
            p_in = max(p for _, p, _ in on)
            p_oc = max(p + d for _, p, d in on)
            S_oc += q_oc * p_in * k
            D += q_oc * (p_oc - p_in) * k
            q_mv += q_oc * k
            V_on += sum(q for q, _, _, _ in secs if q > 0) * k
            A_on += sum(q for q, _, _, _ in secs if q > 0) * max(p for _, p in known) * k
        else:
            I += q_fix * p_neutral * k
            q_still += q_fix * k
    B = Bm + q_standby * n_still * k
    if B <= 0:
        raise ValueError("load-sensing delivers no volume, so the margin has no effect")
    S = S_oc - A
    out = {"m": (S + D + I) / B, "A": A, "S": S, "D": D, "I": I, "B": B, "OC": S_oc + D + I,
           "dm_ddrop": q_mv / B, "dm_dpn": q_still / B}
    if V_on > 0:
        # 5u: S = V_on (r p_Q - p_q) - A_off, so m* = beta [(r-1) p_q + r (p_Q - p_q) + r d_bar] + (I - A_off) / B
        r, p_Q, p_q, d_bar, beta = q_mv / V_on, S_oc / q_mv, A_on / V_on, D / q_mv, V_on / B
        out.update(r=r, p_Q=p_Q, p_q=p_q, d_bar=d_bar, beta=beta, A_off=A - A_on,
                   main=beta * (r - 1) * p_q, cov=beta * r * (p_Q - p_q), drop=beta * r * d_bar,
                   idle=(I - (A - A_on)) / B, rule2=(r - 1) * p_q + r * d_bar)
    return out
