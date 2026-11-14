"""Prices osrobot-scoutpair's two architectures. One inline robot (camera + treatment tool on one ground platform)
against a scout (camera drone) plus a camera-less ground treater. Cost per field = machine capital charged by the
hour the machine is occupied, plus a person's time for set-up and battery swaps, plus the remote pilot's time for
the scout's flight (14 CFR 107.31: the remote pilot must keep the aircraft in sight, so its flight minutes are a
person's minutes; quality audit 2026-11-13), plus electricity.

Every constant marked ASSUMED is a round number, not a quote for any product. Stdlib only.
"""
import math

# ---- assumed prices and duty (ASSUMED: round numbers, not quotes) ----
CAP_INLINE = 5000.0    # USD: ground platform + camera + compute + treatment tool
CAP_SCOUT = 2500.0     # USD: camera multirotor
CAP_TREATER = 3500.0   # USD: ground platform + treatment tool + positioning, no camera
ANNUAL = 0.30          # share of capital charged per year (depreciation, upkeep, cost of money)
HOURS_YEAR = 500.0     # occupied machine-hours per year a machine is spread over
LABOUR = 20.0          # USD per hour of a person's time (set-up, battery swaps, and the scout pilot's flight time)
PILOT_ATTENDED = True  # charge the scout's flight minutes as a person's time (FAA Part 107 visual line of sight)
SETUP_GROUND_MIN = 3.0   # min per field to place a ground robot
SETUP_SCOUT_MIN = 8.0    # min per field to place, check and launch the scout
ENDURANCE_MIN = 20.0     # min of flight per battery
SWAP_MIN = 3.0           # min of a person's time per battery swap (the scout is down while it happens)
ELEC = 0.15              # USD per kWh


def swaps(fly_min, endurance=ENDURANCE_MIN):
    """Battery swaps needed for fly_min of flight: one fewer than the number of batteries."""
    return max(0, int(math.ceil(fly_min / endurance - 1e-9)) - 1)


def inline_cost(ground_min, energy_wh, cap=CAP_INLINE, hours=HOURS_YEAR, annual=ANNUAL, labour=LABOUR,
                setup=SETUP_GROUND_MIN, elec=ELEC, attend=False):
    """USD for one field with one inline robot. attend=True also charges a person for every ground minute (a site
    that will not let a ground robot run unwatched)."""
    person_min = setup + (ground_min if attend else 0.0)
    return (cap * annual * (ground_min / 60.0) / hours + labour * person_min / 60.0 + elec * energy_wh / 1000.0)


def pair_cost(fly_min, ground_min, energy_wh, cap_scout=CAP_SCOUT, cap_treater=CAP_TREATER, hours=HOURS_YEAR,
              annual=ANNUAL, labour=LABOUR, setup_g=SETUP_GROUND_MIN, setup_s=SETUP_SCOUT_MIN, endurance=ENDURANCE_MIN,
              swap=SWAP_MIN, elec=ELEC, held=False, pilot=PILOT_ATTENDED, pilot_rate=None, attend=False):
    """USD for one field with a scout and a treater. The scout is occupied for its flight plus its swaps. With
    held=False each machine is charged only for the minutes it works (a fleet shared across many fields); with
    held=True both are charged for the whole job (a dedicated pair that waits on each other). With pilot=True a
    person's time is also charged for every flight minute, at pilot_rate USD/h (default: labour); the swaps and
    set-up are already charged, so they are not counted twice. attend=True also charges a person for the treater's
    ground minutes, the like-for-like case to inline_cost(attend=True); the stages run one after the other, so one
    person covers both and the minutes add. Holding the machines changes what they are charged, not a person's time."""
    n = swaps(fly_min, endurance)
    treat_min = ground_min
    scout_min = fly_min + n * swap
    if held:
        scout_min = ground_min = scout_min + ground_min
    cap = (cap_scout * annual * (scout_min / 60.0) + cap_treater * annual * (ground_min / 60.0)) / hours
    people = labour * (setup_s + setup_g + n * swap) / 60.0
    if pilot:
        people += (labour if pilot_rate is None else pilot_rate) * fly_min / 60.0
    if attend:
        people += labour * treat_min / 60.0
    return cap + people + elec * energy_wh / 1000.0


def interp(xs, ys, x):
    """Linear interpolation of ys over ascending xs; None outside the range (no extrapolation)."""
    for (x0, y0), (x1, y1) in zip(zip(xs, ys), zip(xs[1:], ys[1:])):
        if x0 <= x <= x1:
            return y0 if x1 == x0 else y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    return None


def fit_line(a, y):
    """Least squares y = c + m*a and R^2."""
    n = len(a); ma, my = sum(a) / n, sum(y) / n
    sxx = sum((x - ma) ** 2 for x in a)
    m = sum((x - ma) * (v - my) for x, v in zip(a, y)) / sxx
    c = my - m * ma
    ss = sum((v - my) ** 2 for v in y)
    r2 = 1.0 - sum((v - (c + m * x)) ** 2 for x, v in zip(a, y)) / ss if ss else 1.0
    return c, m, r2


def crossings(f, lo, hi, n=4000):
    """Every sign change of f on [lo, hi], each refined by bisection, scanning a log-spaced grid of n points. A sign
    change is either a root or a step (a battery swap added) across which the cheaper option flips; both count.
    Battery swaps make a cost difference a sawtooth, so it can cross zero several times; one bisection over the
    whole range returns an arbitrary one of them (quality audit 2026-11-13)."""
    xs = [lo * (hi / lo) ** (k / (n - 1)) for k in range(n)]
    out, prev_x, prev_f = [], xs[0], f(xs[0])
    if prev_f == 0:
        out.append(prev_x)
    for x in xs[1:]:
        fx = f(x)
        if fx == 0:
            out.append(x)
        elif prev_f != 0 and prev_f * fx < 0:
            out.append(bisect(f, prev_x, x))
        prev_x, prev_f = x, fx
    return out


def cost_model(fits, a, cap=CAP_INLINE, **kw):
    """(inline USD, pair USD unheld, pair USD held) for a field of a hectares, from straight-line fits
    {name: (c, m, r2)} of fly_min, ground_min, inline_min, pair_wh and inline_wh against hectares. Keyword
    arguments go to pair_cost; hours, annual, labour, setup_g and elec also reach inline_cost."""
    f = lambda n: max(0.0, fits[n][0] + fits[n][1] * a)
    ik = {k: kw[k] for k in ("hours", "annual", "labour", "elec", "attend") if k in kw}
    if "setup_g" in kw:
        ik["setup"] = kw["setup_g"]
    i = inline_cost(f("inline_min"), f("inline_wh"), cap=cap, **ik)
    p = pair_cost(f("fly_min"), f("ground_min"), f("pair_wh"), **kw)
    h = pair_cost(f("fly_min"), f("ground_min"), f("pair_wh"), held=True, **kw)
    return i, p, h


def bisect(f, lo, hi, it=60):
    """Root of f on [lo, hi] if f changes sign there, else None."""
    flo, fhi = f(lo), f(hi)
    if flo == 0:
        return lo
    if flo * fhi > 0:
        return None
    for _ in range(it):
        mid = (lo + hi) / 2
        fm = f(mid)
        if flo * fm <= 0:
            hi = mid
        else:
            lo, flo = mid, fm
    return (lo + hi) / 2
