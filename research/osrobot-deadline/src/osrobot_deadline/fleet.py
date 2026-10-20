"""Deadline-constrained fleet sizing on osrobot-pipeline's model (copied, so this project stands alone). s scouts fly
fields in turn; each mapped field goes to the next free ground treater (k of them). Compared with n inline robots.
Held fleets: every machine is charged for the whole makespan. Stdlib only, deterministic.

Per-field minutes and Wh are straight lines in hectares from osrobot-pairprice Sweep 2 (simulated there, not here).
Prices and duty are ASSUMED round numbers, as in osrobot-pairprice/econ.py and osrobot-pipeline.
"""
import heapq
import math

FLY = (0.57, 56.8)
GROUND = (-0.75, 91.2)
INLINE = (0.96, 227.6)
PAIR_WH = (-3.23, 665.7)
INLINE_WH = (-1.93, 985.6)

CAP_INLINE, CAP_SCOUT, CAP_TREATER = 5000.0, 2500.0, 3500.0   # ASSUMED USD
ANNUAL, HOURS_YEAR, LABOUR, ELEC = 0.30, 500.0, 20.0, 0.15
SETUP_GROUND, SETUP_SCOUT, ENDURANCE, SWAP = 3.0, 8.0, 20.0, 3.0


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


def pipeline_makespan(n_fields, ha, s, k):
    """Minutes until the last field is treated: s scouts, k treaters, fields in fixed order, list scheduling."""
    scouts = [0.0] * s
    treaters = [0.0] * k
    heapq.heapify(scouts)
    heapq.heapify(treaters)
    end = 0.0
    for _ in range(n_fields):
        ready = heapq.heappop(scouts) + scout_busy(ha)
        heapq.heappush(scouts, ready)
        fin = max(ready, heapq.heappop(treaters)) + treater_busy(ha)
        heapq.heappush(treaters, fin)
        end = max(end, fin)
    return end


def inline_makespan(n_fields, ha, n):
    free = [0.0] * n
    heapq.heapify(free)
    end = 0.0
    for _ in range(n_fields):
        fin = heapq.heappop(free) + inline_busy(ha)
        heapq.heappush(free, fin)
        end = max(end, fin)
    return end


def _capital(total_cap, makespan_min):
    return total_cap * ANNUAL * (makespan_min / 60.0) / HOURS_YEAR


def pipeline_cost(n_fields, ha, s, k):
    """(USD, makespan_min) for the whole job."""
    ms = pipeline_makespan(n_fields, ha, s, k)
    people = LABOUR * n_fields * (SETUP_SCOUT + SETUP_GROUND + swaps(line(FLY, ha)) * SWAP) / 60.0
    energy = ELEC * n_fields * line(PAIR_WH, ha) / 1000.0
    return _capital(s * CAP_SCOUT + k * CAP_TREATER, ms) + people + energy, ms


def inline_cost(n_fields, ha, n):
    ms = inline_makespan(n_fields, ha, n)
    people = LABOUR * n_fields * SETUP_GROUND / 60.0
    energy = ELEC * n_fields * line(INLINE_WH, ha) / 1000.0
    return _capital(n * CAP_INLINE, ms) + people + energy, ms


def cheapest_pipeline(n_fields, ha, deadline_min, max_scouts=1, kmax=16):
    """(usd, makespan, s, k) of the cheapest fleet meeting the deadline, or None. Ties go to fewer machines."""
    rows = []
    for s in range(1, max_scouts + 1):
        for k in range(1, kmax + 1):
            usd, ms = pipeline_cost(n_fields, ha, s, k)
            if ms <= deadline_min + 1e-9:
                rows.append((usd, ms, s, k))
    return min(rows, key=lambda r: (round(r[0], 6), r[2] + r[3])) if rows else None


def cheapest_inline(n_fields, ha, deadline_min, nmax=32):
    rows = []
    for n in range(1, nmax + 1):
        usd, ms = inline_cost(n_fields, ha, n)
        if ms <= deadline_min + 1e-9:
            rows.append((usd, ms, n))
    return min(rows, key=lambda r: (round(r[0], 6), r[2])) if rows else None


def floor_minutes(n_fields, ha, s=1):
    """Shortest possible pipeline makespan with s scouts and unlimited treaters."""
    return pipeline_makespan(n_fields, ha, s, n_fields)
