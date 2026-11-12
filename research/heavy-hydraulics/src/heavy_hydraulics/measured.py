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
                   trace always carries small filtered flows). q_min may be
                   one number or one per section (milestone 5o).
    """
    n_sec = None
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
        if n_sec is None:
            n_sec = len(sections)
            qm = tuple(q_min) if isinstance(q_min, (tuple, list)) else (q_min,) * n_sec
        oc = [(q, p) for (q, p), m in zip(sections, qm) if q > m]
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


def stationary_samples(x, win, max_range):
    """Indices of samples inside non-overlapping windows of `win` samples whose
    position range (max - min) is below `max_range` (milestone 5o)."""
    out = []
    for i0 in range(0, len(x) - win + 1, win):
        seg = x[i0:i0 + win]
        if max(seg) - min(seg) < max_range:
            out.extend(range(i0, i0 + win))
    return out


def percentile(vals, pct):
    """Linear-interpolated percentile of a non-empty sequence (numpy's default)."""
    v = sorted(vals)
    k = (len(v) - 1) * pct / 100.0
    lo = int(math.floor(k))
    hi = min(lo + 1, len(v) - 1)
    return v[lo] + (v[hi] - v[lo]) * (k - lo)


def moving_by_position(x, half, d_min):
    """True where the piston travels more than d_min over the centred window
    x[i - half] .. x[i + half] (window clipped at the ends)."""
    n = len(x)
    return [abs(x[min(n - 1, i + half)] - x[max(0, i - half)]) > d_min for i in range(n)]


def slowed_time(samples, dt):
    """Record time when a pump cannot supply the demand (5w).

    samples: iterable of (q_demand, q_pump), L/min. Where demand exceeds the pump, the actuators slow
    so the pump delivers the demanded volume: that sample lasts dt * q_demand / q_pump. Returns
    (time, shortfall share of samples with demand > 0)."""
    t, short, moving = 0.0, 0, 0
    for q_dem, q_pump in samples:
        if q_dem > 0:
            moving += 1
            if q_pump <= 0:
                raise ValueError("demand with no pump flow")
            if q_dem > q_pump:
                short += 1
                t += dt * q_dem / q_pump
                continue
        t += dt
    return t, (short / moving if moving else 0.0)


def extra_fuel(e_oc, e_ls, t_oc, t_ls, b, eta, f_t):
    """Open-centre fuel minus load-sensing fuel for the same motion, L (5x).

    e_oc, e_ls: hydraulic energy of each circuit, J; t_oc, t_ls: time each needs, s;
    b: marginal fuel per shaft energy, L/kWh (the Willans slope); eta: pump hydraulic-to-shaft
    efficiency; f_t: fuel rate of the rest of the machine over the extra time, L/h.
    Returns (hydraulic part, time part)."""
    if not 0 < eta <= 1:
        raise ValueError("eta must be in (0, 1]")
    return b * (e_oc - e_ls) / eta / 3.6e6, f_t * (t_oc - t_ls) / 3600.0
