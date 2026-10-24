"""Fleet sizing with a yield loss for late fields, on osrobot-deadlineloss's model (copied, so this project stands alone), with
prices and drone endurance made settable (configure()) so sourced figures can replace the assumed ones. s scouts fly
fields in turn; each mapped field goes to the next free ground treater (k of them). Compared with n inline robots.
Held fleets: every machine is charged for the whole makespan. Stdlib only, deterministic.

Per-field minutes and Wh are straight lines in hectares from osrobot-pairprice Sweep 2 (simulated there, not here).
Defaults are the ASSUMED round numbers of osrobot-deadlineloss; experiments/run.py sets sourced prices through configure().
"""
import heapq
import math

FLY = (0.57, 56.8)
GROUND = (-0.75, 91.2)
INLINE = (0.96, 227.6)
PAIR_WH = (-3.23, 665.7)
INLINE_WH = (-1.93, 985.6)

CAP_INLINE, CAP_SCOUT, CAP_TREATER = 5000.0, 2500.0, 3500.0   # ASSUMED USD (defaults)
ANNUAL, HOURS_YEAR, LABOUR, ELEC = 0.30, 500.0, 20.0, 0.15
SETUP_GROUND, SETUP_SCOUT, ENDURANCE, SWAP = 3.0, 8.0, 20.0, 3.0


def configure(inline=None, scout=None, treater=None, endurance=None):
    """Set purchase prices (USD) and drone endurance (min); None keeps the current value. Returns the old values."""
    global CAP_INLINE, CAP_SCOUT, CAP_TREATER, ENDURANCE
    old = (CAP_INLINE, CAP_SCOUT, CAP_TREATER, ENDURANCE)
    CAP_INLINE = old[0] if inline is None else float(inline)
    CAP_SCOUT = old[1] if scout is None else float(scout)
    CAP_TREATER = old[2] if treater is None else float(treater)
    ENDURANCE = old[3] if endurance is None else float(endurance)
    return old


def line(p, ha):
    return p[0] + p[1] * ha


def swaps(fly_min):
    return max(0, int(math.ceil(fly_min / ENDURANCE - 1e-9)) - 1)


def scout_busy(ha):
    f = line(FLY, ha)
    return SETUP_SCOUT + f + swaps(f) * SWAP


def treater_busy(ha):
    return SETUP_GROUND + line(GROUND, ha)


def inline_busy(ha):
    return SETUP_GROUND + line(INLINE, ha)


def pipeline_finishes(n_fields, ha, s, k):
    """Finish time (min) of each field: s scouts, k treaters, fields in fixed order, list scheduling."""
    scouts = [0.0] * s
    treaters = [0.0] * k
    heapq.heapify(scouts)
    heapq.heapify(treaters)
    out = []
    for _ in range(n_fields):
        ready = heapq.heappop(scouts) + scout_busy(ha)
        heapq.heappush(scouts, ready)
        fin = max(ready, heapq.heappop(treaters)) + treater_busy(ha)
        heapq.heappush(treaters, fin)
        out.append(fin)
    return out


def inline_finishes(n_fields, ha, n):
    free = [0.0] * n
    heapq.heapify(free)
    out = []
    for _ in range(n_fields):
        fin = heapq.heappop(free) + inline_busy(ha)
        heapq.heappush(free, fin)
        out.append(fin)
    return out


# Late-yield loss. LOSS_PER_STAGE = 0.02 of yield per leaf stage of delay past the critical time:
# Knezevic, Evans & Mainz 2003, Crop Management 2(1), doi:10.1094/CM-2003-0219-01-RS (corn and soybean, moderate to
# high weed density, valid up to canopy closure). Days per leaf stage, working hours per day and crop revenue are
# NOT sourced here: they are swept in experiments/run.py.
LOSS_PER_STAGE = 0.02
LOSS_CAP = 1.0


def late_loss_usd(finish_min, window_min, ha, revenue_per_ha, stage_days, day_hours):
    """USD lost on one field finished finish_min after the start when its window closes at window_min.
    Lateness counts in working days (day_hours of machine work per day), so stages of delay = late_days / stage_days."""
    late = max(0.0, finish_min - window_min)
    stages = late / 60.0 / day_hours / stage_days
    return min(LOSS_CAP, LOSS_PER_STAGE * stages) * revenue_per_ha * ha


def _capital(total_cap, makespan_min):
    return total_cap * ANNUAL * (makespan_min / 60.0) / HOURS_YEAR


def pipeline_total(n_fields, ha, s, k, window_min, revenue_per_ha, stage_days, day_hours):
    """(fleet USD, loss USD, makespan_min)."""
    fins = pipeline_finishes(n_fields, ha, s, k)
    ms = max(fins)
    people = LABOUR * n_fields * (SETUP_SCOUT + SETUP_GROUND + swaps(line(FLY, ha)) * SWAP) / 60.0
    energy = ELEC * n_fields * line(PAIR_WH, ha) / 1000.0
    fleet = _capital(s * CAP_SCOUT + k * CAP_TREATER, ms) + people + energy
    loss = sum(late_loss_usd(f, window_min, ha, revenue_per_ha, stage_days, day_hours) for f in fins)
    return fleet, loss, ms


def inline_total(n_fields, ha, n, window_min, revenue_per_ha, stage_days, day_hours):
    fins = inline_finishes(n_fields, ha, n)
    ms = max(fins)
    people = LABOUR * n_fields * SETUP_GROUND / 60.0
    energy = ELEC * n_fields * line(INLINE_WH, ha) / 1000.0
    fleet = _capital(n * CAP_INLINE, ms) + people + energy
    loss = sum(late_loss_usd(f, window_min, ha, revenue_per_ha, stage_days, day_hours) for f in fins)
    return fleet, loss, ms


def best_pipeline(n_fields, ha, max_scouts, kmax, *loss_args):
    """(total, fleet, loss, makespan, s, k) minimising fleet + loss; ties to fewer machines."""
    rows = []
    for s in range(1, max_scouts + 1):
        for k in range(1, kmax + 1):
            f, l, ms = pipeline_total(n_fields, ha, s, k, *loss_args)
            rows.append((f + l, f, l, ms, s, k))
    return min(rows, key=lambda r: (round(r[0], 6), r[4] + r[5]))


def best_inline(n_fields, ha, nmax, *loss_args):
    rows = []
    for n in range(1, nmax + 1):
        f, l, ms = inline_total(n_fields, ha, n, *loss_args)
        rows.append((f + l, f, l, ms, n))
    return min(rows, key=lambda r: (round(r[0], 6), r[4]))
