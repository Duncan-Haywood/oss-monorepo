"""Circuit energy on a measured duty cycle (milestone 5n).

Works on per-sample traces of a load-sensing machine: valve P-port flows per
section, the inlet-chamber pressure of each section, work-pump outlet pressure
and shaft speed. Units: bar, L/min, rad/s, seconds; energy in J.
Hydraulic power (W) = p[bar] * Q[L/min] / 0.6, as in `circuits.py`.

Stdlib only so the tests run anywhere; the experiment script loads the
measured `.mat` file with scipy and passes plain sequences in.
"""
import math

W_PER_BAR_LPM = 1 / 0.6


def inlet_pressure(q_pa, q_pb, p_a, p_b):
    """Pressure of the chamber the pump is feeding, or None if neither is fed."""
    if q_pa > 0:
        return p_a
    if q_pb > 0:
        return p_b
    return None


def load_pressure(sections):
    """Highest inlet pressure among sections with flow; sections are (q, p_in)."""
    ps = [p for q, p in sections if q > 0 and p is not None]
    return max(ps) if ps else None


def energies(samples, dt, dp_ls, dp_m=5.0, dp_spool=10.0, p_neutral=10.0,
             vg_cc=63.0, leak_lpm=2.5, q_min=0.0):
    """Integrate four powers over the samples, J.

    samples: iterable of (pump_pressure, w_rad_s, ((q, p_in), ...)) per step.
      measured   : pump_pressure * total P-port flow (what the machine did)
      ls_model   : total flow * (load pressure + dp_ls), the `circuits.py` rung
      metered    : sum over sections of q * (p_in + dp_m)
      useful     : sum over sections of q * p_in
      open_centre: a fixed vg_cc pump at the measured shaft speed (minus a
                   constant leak) delivering all its flow at load pressure +
                   dp_spool while any section moves, at p_neutral otherwise.
                   Where demand exceeds the fixed pump, the demand is used and
                   counted in `oc_short_s` (the fixed pump could not deliver it).
                   A section counts as moving for open-centre only above q_min
                   L/min: below it the bypass is taken as open (a measured
                   trace always carries small filtered flows).
    """
    out = dict(measured=0.0, ls_model=0.0, metered=0.0, useful=0.0,
               open_centre=0.0, oc_short_s=0.0, moving_s=0.0)
    for p_pump, w, sections in samples:
        q_tot = sum(q for q, _ in sections if q > 0)
        out["measured"] += p_pump * q_tot * W_PER_BAR_LPM * dt
        q_fix = max(0.0, vg_cc * 1e-3 * w / (2 * math.pi) * 60 - leak_lpm)
        p_load = load_pressure(sections)
        if p_load is not None:
            out["moving_s"] += dt
            out["ls_model"] += q_tot * (p_load + dp_ls) * W_PER_BAR_LPM * dt
            for q, p in sections:
                if q > 0 and p is not None:
                    out["metered"] += q * (p + dp_m) * W_PER_BAR_LPM * dt
                    out["useful"] += q * p * W_PER_BAR_LPM * dt
        oc = [(q, p) for q, p in sections if q > q_min]
        p_oc = load_pressure(oc)
        if p_oc is None:
            out["open_centre"] += q_fix * p_neutral * W_PER_BAR_LPM * dt
            continue
        q_oc = sum(q for q, _ in oc)
        if q_oc > q_fix:
            out["oc_short_s"] += dt
        out["open_centre"] += max(q_fix, q_oc) * (p_oc + dp_spool) * W_PER_BAR_LPM * dt
    return out


def pump_torque(alpha, p_bar, w, vg=63e-6, p_max=420.0):
    """Shaft torque (N m) of a swashplate pump: ideal plus the loss model of the
    dataset documentation (Linjama 2024, eq. 2), as read: a constant 2% of the
    maximum torque, 2% of it scaled by pressure, and a small speed term."""
    t_max = vg * p_max * 1e5 / (2 * math.pi)
    n = w / (2 * math.pi)
    ideal = alpha * vg * p_bar * 1e5 / (2 * math.pi)
    loss = 0.02 * t_max + 0.02 * t_max * p_bar / p_max + alpha * (0.02 * n + 7e-7 * n * n)
    return ideal + loss


def linfit(xs, ys):
    """Least-squares (intercept, slope, r)."""
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    syy = sum((y - my) ** 2 for y in ys)
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    b = sxy / sxx
    return my - b * mx, b, sxy / math.sqrt(sxx * syy)


def cycle_starts(x, threshold):
    """Indices where x crosses `threshold` upwards (one per lift stroke)."""
    return [i for i in range(1, len(x)) if x[i - 1] < threshold <= x[i]]
