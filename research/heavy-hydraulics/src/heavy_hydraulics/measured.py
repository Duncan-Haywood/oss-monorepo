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


def central_speed(t, q):
    """Joint speed |dq/dt| by central differences on uneven timestamps (one-sided at the ends), 5y."""
    n = len(q)
    if n < 2 or len(t) != n:
        raise ValueError("need two or more samples and one timestamp per sample")
    out = []
    for i in range(n):
        a, b = max(0, i - 1), min(n - 1, i + 1)
        out.append(abs(q[b] - q[a]) / (t[b] - t[a]))
    return out


def highest_live(row, live):
    """Highest pressure over the live channels of one sample (the label-free p_q reading of 5y)."""
    vals = [row[i] for i in live]
    if not vals:
        raise ValueError("no live channel")
    return max(vals)


def cylinder_flow(omega, lever, bore, rod, extend_sign):
    """Flow (L/min) a cylinder draws for joint speed omega (rad/s), 5z.

    The rod speed is lever (m/rad) times |omega|; the cylinder extends when extend_sign * omega > 0,
    filling the cap side (bore area), and retracts otherwise, filling the annulus. Bore and rod are
    diameters in metres."""
    if lever < 0 or bore <= rod or rod < 0 or extend_sign not in (1, -1):
        raise ValueError("need lever >= 0, bore > rod >= 0 and extend_sign +1 or -1")
    cap = math.pi * bore * bore / 4.0
    area = cap if extend_sign * omega > 0 else cap - math.pi * rod * rod / 4.0
    return area * lever * abs(omega) * 60000.0


def pump_ratio(demand, q_pump):
    """Pump-to-demand volume ratio r for a fixed pump that slows the actuators when short (6a).

    With 5w's slowing rule a sample with demand q > q_pump lasts dt q / q_pump, so the pumped volume is
    sum max(q_pump, q) dt and r = sum max(q_pump, q) / sum q (equal dt). r rises monotonically from 1
    and is unchanged when demand and pump are scaled together."""
    if q_pump < 0:
        raise ValueError("need q_pump >= 0")
    tot = sum(demand)
    if tot <= 0:
        raise ValueError("need some demand")
    return sum(max(q_pump, q) for q in demand) / tot


def pump_for_ratio(demand, r_target, tol=1e-9):
    """The fixed pump flow at which pump_ratio equals r_target (>= 1), by bisection."""
    if r_target < 1:
        raise ValueError("r_target must be at least 1")
    lo, hi = 0.0, max(demand)
    if pump_ratio(demand, hi) < r_target:
        # above the peak demand r is linear in q_pump: r = q_pump n / sum q
        return r_target * sum(demand) / len(demand)
    while hi - lo > tol * max(1.0, hi):
        mid = 0.5 * (lo + hi)
        if pump_ratio(demand, mid) < r_target:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def time_ratio_from_r(r_p, q_p, r_ls, q_ls, mu, phi):
    """Open-centre over load-sensing record time from volume ratios alone (6b).

    Under the slowing rule a fixed pump of q_p runs flat out over the stretched moving time, so its
    pumped volume is q_p T_OC,moving = r_p V_d, and T_OC = T_still + r_p V_d / q_p. Load-sensing,
    capped at its own pump q_ls, is the same with r_ls. Divided by the moving time T_mv:
    tau = (phi + r_p mu / q_p) / (phi + r_ls mu / q_ls), with mu = V_d / T_mv (mean moving demand)
    and phi = T_still / T_mv."""
    if min(q_p, q_ls, mu) <= 0 or phi < 0:
        raise ValueError("need positive flows and phi >= 0")
    return (phi + r_p * mu / q_p) / (phi + r_ls * mu / q_ls)


def breakeven_rest_rate(m, m_star, q_ls_mean, tau, b, eta):
    """Rest-of-machine fuel rate (L/h) at which open-centre and load-sensing burn the same fuel (6b).

    Per hour of load-sensing work the difference is b (m* - m) Q / (600 eta) + f_t (tau - 1), with Q
    the mean demand over load-sensing time (L/min) and (m* - m) Q / 600 the pump power gap in kW.
    Returns the f_t that zeroes it, or None where open-centre saves no pump energy (m* >= m) or no
    time is lost (tau <= 1)."""
    if not 0 < eta <= 1:
        raise ValueError("eta must be in (0, 1]")
    if m_star >= m or tau <= 1:
        return None
    return b * (m - m_star) * q_ls_mean / (600.0 * eta * (tau - 1))


def no_load_line(fuel_lph, rpm, power_kw, n_ref):
    """Willans line with an engine-speed term (milestone 6e).

    Least squares fuel = a + c (n - n_ref) + b P, with P the pump-side shaft power
    (kW). Returns (a, c, b): a is the fuel rate at zero pump load at n_ref (L/h),
    c its slope with speed (L/h per rpm), b the marginal fuel per shaft kWh (L/kWh)."""
    from heavy_hydraulics.screening import ols
    rows = [(n - n_ref, p) for n, p in zip(rpm, power_kw)]
    a, c, b = ols(rows, fuel_lph)
    return a, c, b


GAL_L = 3.785411784   # litres per US gallon
HP_KW = 0.745699872   # kW per mechanical horsepower


def asabe_fuel_lph(x, n_ratio, p_rated_kw, a=0.0434, b=0.019, c=0.45, d=0.877):
    """Tractor diesel fuel rate (L/h) from the ASABE D497.6 general model (milestone 6f).

    Grisso et al. 2010 (VCE 442-073), eqs. 2 and 3: Q_F = (a X + b) P_PTO gal/h at full
    throttle with P_PTO in hp, and Q_R = Q_F [1 - (N - 1)(c X - d)] at reduced throttle.
    x is the fraction of rated power in use, n_ratio the engine speed over the full-throttle
    speed at that load (1 at full throttle). The coefficients are per hp; dividing by
    HP_KW and multiplying by GAL_L gives L/h per rated kW, so p_rated_kw is in kW."""
    q_f = (a * x + b) * (p_rated_kw / HP_KW) * GAL_L
    return q_f * (1.0 - (n_ratio - 1.0) * (c * x - d))


def eta_table(rows, temp):
    """Total pump efficiency table from the digitised Kauranne (2022) Figure 13 rows (milestone 6g).

    rows: dicts with 'temperature_c', 'pressure_bar' and 'cap_<V>' columns (cm3/r, 45 the maximum).
    Returns (fractions, pressures, grid) with grid[i][j] the efficiency at pressures[i], fractions[j]."""
    sel = [r for r in rows if float(r["temperature_c"]) == float(temp)]
    if not sel:
        raise ValueError("no rows at that temperature")
    caps = sorted(float(k[4:]) for k in sel[0] if k.startswith("cap_"))
    fr = [c / max(caps) for c in caps]
    sel.sort(key=lambda r: float(r["pressure_bar"]))
    ps = [float(r["pressure_bar"]) for r in sel]
    grid = [[float(r[f"cap_{c:g}"]) for c in caps] for r in sel]
    return fr, ps, grid


def part_stroke_eta(table, x, p):
    """Efficiency at displacement fraction x and pressure p (bar), bilinear in the table (6g).

    Below the smallest measured fraction the value is held (this flatters a part-stroke pump, whose
    efficiency keeps falling towards zero stroke); x above 1 is taken as 1; p is clipped to the table."""
    fr, ps, grid = table

    def interp(xs, ys, v):
        if v <= xs[0]:
            return ys[0]
        if v >= xs[-1]:
            return ys[-1]
        for k in range(1, len(xs)):
            if v <= xs[k]:
                t = (v - xs[k - 1]) / (xs[k] - xs[k - 1])
                return ys[k - 1] + t * (ys[k] - ys[k - 1])

    by_p = [interp(fr, row, min(max(x, 0.0), 1.0)) for row in grid]
    return interp(ps, by_p, p)


def breakeven_rest_rate_two_eta(m, m_star, p, q_ls_mean, tau, b, eta_ls, eta_oc):
    """6b's break-even rest-of-machine fuel rate with each circuit's own pump efficiency (6g).

    Per hour of load-sensing work the fuel gap is (b / 600) Q [(p + m*) / eta_oc - (p + m) / eta_ls]
    + f_t (tau - 1): load-sensing delivers Q at p + m, the fixed pump the same work plus the
    volume-ratio loss, (p + m*). With eta_ls == eta_oc it equals breakeven_rest_rate. Returns None
    where open-centre burns no less pump fuel or loses no time."""
    for e in (eta_ls, eta_oc):
        if not 0 < e <= 1:
            raise ValueError("efficiencies must be in (0, 1]")
    gap = (p + m) / eta_ls - (p + m_star) / eta_oc
    if gap <= 0 or tau <= 1:
        return None
    return b * gap * q_ls_mean / (600.0 * (tau - 1))


def fit_pump_loss(table, min_fraction=0.0, max_fraction=1.0):
    """Least-squares fit of a stroke-linear loss model to an efficiency table (milestone 6h).

    table: (fractions, pressures, grid) as from eta_table. The loss in bar of full-stroke flow,
    L = x p (1/eta - 1), is fitted as L = k0 + kp p + kl p^2 + kc x p on the cells with
    min_fraction <= x <= max_fraction. Returns (k0, kp, kl, kc)."""
    fr, ps, grid = table
    rows, ys = [], []
    for i, p in enumerate(ps):
        for j, x in enumerate(fr):
            if x + 1e-12 < min_fraction or x - 1e-12 > max_fraction:
                continue
            e = grid[i][j]
            rows.append((1.0, p, p * p, x * p))
            ys.append(x * p * (1.0 / e - 1.0))
    n = 4
    ata = [[sum(r[a] * r[b] for r in rows) for b in range(n)] for a in range(n)]
    aty = [sum(r[a] * y for r, y in zip(rows, ys)) for a in range(n)]
    # Gaussian elimination with partial pivoting
    m = [ata[a][:] + [aty[a]] for a in range(n)]
    for c in range(n):
        piv = max(range(c, n), key=lambda r: abs(m[r][c]))
        m[c], m[piv] = m[piv], m[c]
        for r in range(n):
            if r != c:
                f = m[r][c] / m[c][c]
                m[r] = [m[r][k] - f * m[c][k] for k in range(n + 1)]
    return tuple(m[a][n] / m[a][a] for a in range(n))


def loss_model_eta(coef, x, p):
    """Total efficiency x p / (x p + L) under fit_pump_loss coefficients; 0 at x <= 0 (6h)."""
    k0, kp, kl, kc = coef
    if x <= 0:
        return 0.0
    loss = k0 + kp * p + kl * p * p + kc * x * p
    return x * p / (x * p + loss)


def flat_hold_shortfall(coef, p, q_max, b, g, tau):
    """Rise in the break-even rest-of-machine fuel rate f_t* (L/h) that holding efficiency flat below
    the smallest measured stroke hides (6h). With L = A + B x, the flat hold charges x L(x0)/x0 below x0,
    short by A (1 - x/x0); g = E[(1 - x/x0)+] over the moving samples. Per hour of load-sensing work the
    uncharged fuel is (b / 600) q_max A g, and f_t* rises by that over (tau - 1)."""
    if tau <= 1:
        raise ValueError("tau must exceed 1")
    k0, kp, kl, _ = coef
    a = k0 + kp * p + kl * p * p
    return b * q_max * a * g / (600.0 * (tau - 1.0))


def continued_loss(table, kc, x, p, mode="anchored", coef=None):
    """Pump loss in bar of full-stroke flow, L = x p (1/eta - 1), with a rule below the smallest
    measured stroke x0 (milestone 6i). At and above x0 it is the table's (6g). Below x0:

    'flat': L = x L(x0)/x0, i.e. 6g's flat efficiency hold (loss shrinks with flow);
    'anchored': L = L(x0) - kc p (x0 - x), the measured loss at x0 less the fitted stroke-proportional
        term, so a pump at zero stroke still pays L(x0) - kc p x0;
    'model': the fit_pump_loss model L = k0 + kp p + kl p^2 + kc x p (coef required)."""
    fr = table[0]
    x0 = fr[0]
    x = min(max(x, 0.0), 1.0)
    if x >= x0:
        return x * p * (1.0 / part_stroke_eta(table, x, p) - 1.0)
    l0 = x0 * p * (1.0 / part_stroke_eta(table, x0, p) - 1.0)
    if mode == "flat":
        return x * l0 / x0
    if mode == "anchored":
        return l0 - kc * p * (x0 - x)
    if mode == "model":
        k0, kp, kl, kc_ = coef
        return k0 + kp * p + kl * p * p + kc_ * x * p
    raise ValueError("mode must be flat, anchored or model")


def stroke_shortfall(x, w, x0):
    """g = E_w[(1 - x/x0)+] and s = P_w(x < x0) over samples x with weights w (6h's g, 6i)."""
    tw = sum(w)
    if tw <= 0:
        raise ValueError("weights must sum to a positive number")
    g = sum(wi * max(0.0, 1.0 - xi / x0) for xi, wi in zip(x, w)) / tw
    s = sum(wi for xi, wi in zip(x, w) if xi < x0) / tw
    return g, s


def idle_pump_power(coef, q_fixed, p_neutral, q_max, p_standby, q_standby=0.0, speed_ratio=1.0):
    """Pump shaft power (kW) of each circuit while no function moves (milestone 6j).

    coef: fit_pump_loss coefficients (k0, kp, kl, kc), loss in bar of full-stroke flow.
    Open-centre: the fixed pump at full stroke circulates q_fixed through the valve's neutral passage
    at p_neutral and pays its own loss L(1, p_neutral) on its displacement.
    Load-sensing: the variable pump destrokes to its standby pressure and pays its zero-stroke loss
    L(0, p_standby) on its full displacement q_max, plus the standby flow q_standby at p_standby.
    speed_ratio scales both pumps' flows (idle pump speed over working speed); the loss in bar of
    full-stroke flow is held, so drag power scales with speed (an assumption). p_neutral is taken at
    the flow actually circulated (the caller evaluates it at q_fixed * speed_ratio).
    Returns (P_open_centre, P_load_sensing)."""
    k0, kp, kl, kc = coef
    if min(q_fixed, q_max, speed_ratio) <= 0 or min(p_neutral, p_standby, q_standby) < 0:
        raise ValueError("flows and speed must be positive, pressures non-negative")
    l_oc = k0 + kp * p_neutral + kl * p_neutral ** 2 + kc * p_neutral
    l_ls = k0 + kp * p_standby + kl * p_standby ** 2
    p_oc = q_fixed * speed_ratio * (p_neutral + l_oc) / 600.0
    p_ls = (q_max * speed_ratio * l_ls + q_standby * p_standby) / 600.0
    return p_oc, p_ls


def idle_hours_per_work_hour(share, s0):
    """No-function hours per hour of load-sensing record (6j). share: no-function hours over all
    machine hours, the record's own still time included; s0: the record's still share t_still / t_ls.
    share == s0 returns s0 (the record alone); share must lie in [s0, 1)."""
    if not 0 <= s0 <= share < 1:
        raise ValueError("need 0 <= s0 <= share < 1")
    return share * (1.0 - s0) / (1.0 - share)


def breakeven_rest_rate_idle(saving_moving, tau, b, p_ls_idle, p_oc_idle, idle_hours):
    """6g/6i's break-even rest-of-machine fuel rate with idle pump power charged (6j).

    saving_moving: the fixed pump's pump-fuel saving per hour of load-sensing record while moving
    (L/h), (b / 600) Q [(p + m) / eta_LS - (p + m*) / eta_OC]; idle powers in kW; idle_hours from
    idle_hours_per_work_hour. f_t* = [saving_moving + b (P_LS - P_OC) idle_hours] / (tau - 1);
    None where the fixed pump saves no pump fuel overall or loses no time."""
    s = saving_moving + b * (p_ls_idle - p_oc_idle) * idle_hours
    if s <= 0 or tau <= 1:
        return None
    return s / (tau - 1.0)


def gear_pump_point(rows, size, speed):
    """One catalogue gear pump at one speed (6k), from rows of data/casappa_kp30_curves.csv
    (size, kind, pressure_bar, speed_rpm, value; strings or numbers).

    Returns (flow, power): flow(p) in L/min, linear in p between the two drawn flow lines (20 bar and
    the size's maximum), so leakage is proportional to pressure; power(p) in kW, piecewise linear in p
    through the drawn power curves and continued as the line through the two nearest curves outside
    them (so power(0) is the zero-pressure drag). Values at `speed` are linear between the 100 r/min
    samples on either side (flow lines, drawn straight, are extended linearly outside their span;
    power curves are not)."""
    def at(kind, pr):
        pts = sorted((float(r[3]), float(r[4])) for r in rows
                     if int(r[0]) == size and r[1] == kind and int(float(r[2])) == pr)
        for (n0, v0), (n1, v1) in zip(pts, pts[1:]):
            if n0 <= speed <= n1:
                return v0 + (v1 - v0) * (speed - n0) / (n1 - n0) if n1 > n0 else v0
        if kind == "flow" and len(pts) >= 2:          # flow lines are drawn straight: extend them
            (n0, v0), (n1, v1) = pts[0], pts[-1]
            return v0 + (v1 - v0) * (speed - n0) / (n1 - n0)
        raise ValueError(f"speed {speed} outside the drawn {kind} curve of size {size} at {pr} bar")
    press = sorted({int(float(r[2])) for r in rows if int(r[0]) == size and r[1] == "power"})
    fl = sorted({int(float(r[2])) for r in rows if int(r[0]) == size and r[1] == "flow"})
    if len(press) < 2 or len(fl) != 2:
        raise ValueError(f"size {size}: need two flow lines and at least two power curves")
    (pa, pb), (qa, qb) = fl, (at("flow", fl[0]), at("flow", fl[1]))
    pw = [(p, at("power", p)) for p in press]

    def flow(p):
        return qa + (qb - qa) * (p - pa) / (pb - pa)

    def power(p):
        k = 0 if p <= pw[0][0] else len(pw) - 2 if p >= pw[-1][0] else \
            next(i for i in range(len(pw) - 1) if pw[i][0] <= p <= pw[i + 1][0])
        (p0, w0), (p1, w1) = pw[k], pw[k + 1]
        return w0 + (w1 - w0) * (p - p0) / (p1 - p0)
    return flow, power
