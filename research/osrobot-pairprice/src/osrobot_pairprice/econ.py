"""Prices osrobot-scoutpair's two architectures. One inline robot (camera + treatment tool on one ground platform)
against a scout (camera drone) plus a camera-less ground treater. Cost per field = machine capital charged by the
hour the machine is occupied, plus a person's time for set-up and battery swaps, plus electricity.

Every constant marked ASSUMED is a round number, not a quote for any product. Stdlib only.
"""
import math

# ---- assumed prices and duty (ASSUMED: round numbers, not quotes) ----
CAP_INLINE = 5000.0    # USD: ground platform + camera + compute + treatment tool
CAP_SCOUT = 2500.0     # USD: camera multirotor
CAP_TREATER = 3500.0   # USD: ground platform + treatment tool + positioning, no camera
ANNUAL = 0.30          # share of capital charged per year (depreciation, upkeep, cost of money)
HOURS_YEAR = 500.0     # occupied machine-hours per year a machine is spread over
LABOUR = 20.0          # USD per hour of a person's hands-on time (set-up, battery swaps); supervision is not charged
SETUP_GROUND_MIN = 3.0   # min per field to place a ground robot
SETUP_SCOUT_MIN = 8.0    # min per field to place, check and launch the scout
ENDURANCE_MIN = 20.0     # min of flight per battery
SWAP_MIN = 3.0           # min of a person's time per battery swap (the scout is down while it happens)
ELEC = 0.15              # USD per kWh


def swaps(fly_min, endurance=ENDURANCE_MIN):
    """Battery swaps needed for fly_min of flight: one fewer than the number of batteries."""
    return max(0, int(math.ceil(fly_min / endurance - 1e-9)) - 1)


def inline_cost(ground_min, energy_wh, cap=CAP_INLINE, hours=HOURS_YEAR, annual=ANNUAL, labour=LABOUR,
                setup=SETUP_GROUND_MIN, elec=ELEC):
    """USD for one field with one inline robot."""
    return (cap * annual * (ground_min / 60.0) / hours + labour * setup / 60.0 + elec * energy_wh / 1000.0)


def pair_cost(fly_min, ground_min, energy_wh, cap_scout=CAP_SCOUT, cap_treater=CAP_TREATER, hours=HOURS_YEAR,
              annual=ANNUAL, labour=LABOUR, setup_g=SETUP_GROUND_MIN, setup_s=SETUP_SCOUT_MIN, endurance=ENDURANCE_MIN,
              swap=SWAP_MIN, elec=ELEC, held=False):
    """USD for one field with a scout and a treater. The scout is occupied for its flight plus its swaps. With
    held=False each machine is charged only for the minutes it works (a fleet shared across many fields); with
    held=True both are charged for the whole job (a dedicated pair that waits on each other)."""
    n = swaps(fly_min, endurance)
    scout_min = fly_min + n * swap
    if held:
        scout_min = ground_min = scout_min + ground_min
    cap = (cap_scout * annual * (scout_min / 60.0) + cap_treater * annual * (ground_min / 60.0)) / hours
    people = labour * (setup_s + setup_g + n * swap) / 60.0
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
