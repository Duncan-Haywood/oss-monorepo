"""How much of a shift can a battery-powered humanoid work? Hot-swap and charger queue model, fed into buildbot-cost.

A robot works from a charged pack at `power_w` until the usable energy is gone, swaps (`swap_min`), and the spent pack goes
on one of `chargers` chargers (first come, first served, constant power). If no charged pack is ready the robot waits.
Pack and charger figures are vendor listings (README "Inputs"); the average draw, charger efficiency and swap time are swept.
"""
import heapq

PACK_WH = 421.2        # Unitree G1 pack: 9000 mAh x 46.8 V nominal (retailer listing of the official spec)
CHARGER_W = 54.0 * 5.0  # 54 V x 5 A charger (Unitree G1 page); a 5.5 A charger is also listed
VENDOR_RUNTIME_H = 2.0  # "about 2 hours" (Unitree G1 page); activity not stated
PACK_USD = 699.99      # one US retailer listing (Maverick Drone), not a quote


def implied_power_w(pack_wh=PACK_WH, runtime_h=VENDOR_RUNTIME_H):
    """Average draw the vendor's 2 h implies."""
    return pack_wh / runtime_h


def worked_hours(shift_h, packs, chargers=1, power_w=implied_power_w(), usable=0.9, charge_eff=0.9,
                 swap_min=5.0, pack_wh=PACK_WH, charger_w=CHARGER_W):
    """Hours the robot spends working in a `shift_h` shift that starts with every pack full."""
    run_h = pack_wh * usable / power_w
    charge_h = pack_wh * usable / (charger_w * charge_eff)
    swap_h = swap_min / 60.0
    free = [0.0] * chargers          # time each charger becomes free
    heapq.heapify(free)
    ready = [0.0] * (packs - 1)      # times the other packs become charged (all full at 0)
    t, worked = 0.0, 0.0
    while t < shift_h:
        end = min(t + run_h, shift_h)
        worked += end - t
        t = end
        if t >= shift_h:
            break
        # spent pack goes on the earliest free charger once swapped out
        t += swap_h
        c = max(heapq.heappop(free), t)
        heapq.heappush(free, c + charge_h)
        if ready:
            ready.sort()
            nxt = ready.pop(0)
            ready.append(c + charge_h)
            t = max(t, nxt)
        else:
            t = c + charge_h        # single pack: wait for its own charge
    return worked


def pack_rate(price, cycles, run_h, usable_frac=1.0):
    """Dollars per working hour for pack wear: price over cycles x hours per cycle."""
    return price / (cycles * run_h * usable_frac)
