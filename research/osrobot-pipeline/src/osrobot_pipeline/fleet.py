"""Pipelined fleet model on top of osrobot-pairprice's fitted per-field minutes. One scout flies fields in turn; each
mapped field is then treated by the next free ground treater. Compared with n inline robots working the same fields.
Both fleets are 'held': every machine is charged for the whole makespan, idle or not. Stdlib only, deterministic.

Per-field minutes and Wh are straight lines in hectares, copied from osrobot-pairprice Sweep 2 (simulated there, not
here). Prices and duty are the same ASSUMED round numbers as osrobot-pairprice/econ.py.
"""
import heapq
import math

# osrobot-pairprice Sweep 2: quantity = c + m * hectares
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
    """Minutes the scout is tied up per field: set-up, flight and battery swaps."""
    f = line(FLY, ha)
    return SETUP_SCOUT + f + swaps(f) * SWAP


def treater_busy(ha):
    return SETUP_GROUND + line(GROUND, ha)


def inline_busy(ha):
    return SETUP_GROUND + line(INLINE, ha)


def pipeline_makespan(n_fields, ha, k):
    """Minutes until the last of n_fields is treated, one scout and k treaters (list scheduling, scout never waits)."""
    free = [0.0] * k
    heapq.heapify(free)
    ready, end = 0.0, 0.0
    for _ in range(n_fields):
        ready += scout_busy(ha)
        start = max(ready, heapq.heappop(free))
        fin = start + treater_busy(ha)
        heapq.heappush(free, fin)
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


def pipeline_cost(n_fields, ha, k):
    """USD for the whole job; returns (usd, makespan_min)."""
    ms = pipeline_makespan(n_fields, ha, k)
    people = LABOUR * n_fields * (SETUP_SCOUT + SETUP_GROUND + swaps(line(FLY, ha)) * SWAP) / 60.0
    energy = ELEC * n_fields * line(PAIR_WH, ha) / 1000.0
    return _capital(CAP_SCOUT + k * CAP_TREATER, ms) + people + energy, ms


def inline_cost(n_fields, ha, n):
    ms = inline_makespan(n_fields, ha, n)
    people = LABOUR * n_fields * SETUP_GROUND / 60.0
    energy = ELEC * n_fields * line(INLINE_WH, ha) / 1000.0
    return _capital(n * CAP_INLINE, ms) + people + energy, ms


def saturation_k(ha):
    """Treaters one scout can keep busy: treater minutes per field over scout minutes per field."""
    return treater_busy(ha) / scout_busy(ha)


def best(cost_fn, n_fields, ha, kmax=8):
    """(usd, makespan, size) of the cheapest fleet size 1..kmax; ties go to the shorter makespan."""
    rows = [(*cost_fn(n_fields, ha, k), k) for k in range(1, kmax + 1)]
    return min(rows, key=lambda r: (round(r[0], 6), r[1], r[2]))
