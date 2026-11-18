"""Milestone 6: which resource binds first at a delivery-drone hub, landing pads, chargers or spare packs?

Predictions (written before the first run):
 (1) charge-in-place (pad held while charging) saturates at pads/T_charge, far below swap, whose pad limit is
     pads/(T_swap+T_load): with 4 pads, 32 min charge, 60 s swap, 2 min load, swap carries >= 8x more flights/h.
 (2) in swap mode the binding resource moves from pads to chargers as pad time shrinks: with chargers = pads
     the chargers bind (flights/h <= chargers/T_charge) unless charge time per pack is under pads-time * chargers/pads.
 (3) the simulated mean wait of a single pad group matches the Erlang C formula within 5% (validation).

Sourced inputs (vendor figures, not independent tests):
 T_swap 60 s: Matternet Landing Station page, "under 60 seconds" battery swap and package insert (matternet.com/our-system-landing-station, read 2026-11-09).
 T_charge 32 min for 20% to 90% charge: DJI Dock 2 support page (enterprise.dji.com/dock-2/specs, read 2026-11-09);
   scaled linearly with the share of the pack used (assumption; real charge curves taper).
Assumed and swept: T_load (1 to 5 min), pads, chargers, spare packs, arrival process (Poisson).
Not a safety case, not a flown system; a queueing model of an abstract hub.
"""
import math
import random
import heapq

def erlang_c_wait(lam, mu, c):
    """Mean wait in queue of an M/M/c system (Erlang C)."""
    a = lam / mu
    rho = a / c
    s = sum(a ** k / math.factorial(k) for k in range(c))
    top = a ** c / (math.factorial(c) * (1 - rho))
    pw = top / (s + top)
    return pw / (c * mu - lam)

def simulate(lam, pads, T_pad_fn, mode, chargers=0, spares=0, T_charge=0.0, n=40000, seed=1):
    """Event simulation, times in seconds. lam = arrivals/s. mode 'pad_only' (single resource),
    'charge' (pad held for charge), 'swap' (pad held for swap, depleted pack queues for a charger)."""
    rng = random.Random(seed)
    t = 0.0
    pad_free = [0.0] * pads                  # time each pad becomes free
    charger_free = [0.0] * max(chargers, 1)
    pack_ready = [0.0] * spares              # times spare packs are charged
    waits, done_times = [], []
    for _ in range(n):
        t += rng.expovariate(lam)
        i = min(range(pads), key=lambda k: pad_free[k])
        start = max(t, pad_free[i])
        if mode == "swap":
            if not pack_ready:
                raise ValueError("swap needs spares")
            j = min(range(len(pack_ready)), key=lambda k: pack_ready[k])
            start = max(start, pack_ready[j])   # wait for a charged pack
            end = start + T_pad_fn(rng)
            # depleted pack goes to the earliest free charger, becomes the new spare
            c = min(range(len(charger_free)), key=lambda k: charger_free[k])
            cs = max(end, charger_free[c])
            charger_free[c] = cs + T_charge
            pack_ready[j] = charger_free[c]
        elif mode == "charge":
            end = start + T_pad_fn(rng) + T_charge
        else:
            end = start + T_pad_fn(rng)
        pad_free[i] = end
        waits.append(start - t)
        done_times.append(end)
    waits = waits[n // 5:]                  # drop warm-up
    return sum(waits) / len(waits), sorted(waits)[int(0.95 * len(waits))], n / (max(done_times) - 0.0)

def main():
    print("Milestone 6: delivery-drone hub throughput (pads, chargers, spare packs)")
    print("\nA. Validation: single pad group, exponential service 180 s, 4 pads, mean wait vs Erlang C")
    mu = 1 / 180.0
    for rho in (0.5, 0.7, 0.85):
        lam = rho * 4 * mu
        sim = [simulate(lam, 4, lambda r: r.expovariate(mu), "pad_only", n=200000, seed=s)[0] for s in range(5)]
        m = sum(sim) / len(sim)
        e = erlang_c_wait(lam, mu, 4)
        print(f"rho {rho:.2f}: simulated {m:7.1f} s, Erlang C {e:7.1f} s, error {100 * (m - e) / e:+.1f}%")

    T_SWAP, T_CHG_FULL = 60.0, 32 * 60.0      # sourced (vendor figures)
    use = 0.7                                  # share of pack used per flight, 20% to 90% window
    print(f"\nB. Saturation throughput (flights/h), load time 120 s, pack share used {use:.0%}: analytic limit and simulated at 150% offered load")
    print("pads chargers spares | charge-in-place limit | swap pad limit | swap charger limit | simulated swap (binding)")
    for pads, ch, sp in ((4, 4, 8), (4, 8, 12), (8, 8, 16), (8, 16, 24), (8, 4, 16)):
        Tl = 120.0
        lim_cip = pads * 3600 / (Tl + T_CHG_FULL * use)
        lim_pad = pads * 3600 / (T_SWAP + Tl)
        lim_ch = ch * 3600 / (T_CHG_FULL * use)
        lim = min(lim_pad, lim_ch)
        lam = 1.5 * lim / 3600
        # saturated: measure completed throughput in the second half
        rng_fn = lambda r: T_SWAP + Tl
        _, _, thr = simulate(lam, pads, rng_fn, "swap", chargers=ch, spares=sp, T_charge=T_CHG_FULL * use, n=30000)
        bind = "pads" if lim_pad < lim_ch else "chargers"
        print(f"{pads:4d} {ch:8d} {sp:6d} | {lim_cip:21.1f} | {lim_pad:14.1f} | {lim_ch:18.1f} | {thr * 3600:8.1f} ({bind})")

    print("\nC. Spare packs: 8 pads, 8 chargers, offered load 90% of the binding limit; mean and p95 wait (s) vs spares")
    pads, ch, Tl = 8, 8, 120.0
    Tc = T_CHG_FULL * use
    lim = min(pads * 3600 / (T_SWAP + Tl), ch * 3600 / Tc)
    for sp in (9, 10, 12, 16, 24, 32):
        w = [simulate(0.9 * lim / 3600, pads, lambda r: T_SWAP + Tl, "swap", chargers=ch, spares=sp, T_charge=Tc, n=30000, seed=s)
             for s in range(3)]
        print(f"spares {sp:3d}: mean wait {sum(x[0] for x in w) / 3:8.1f} s, p95 {sum(x[1] for x in w) / 3:8.1f} s")

    print("\nD. Load time sweep (8 pads, 16 chargers, 24 spares): swap pad limit and charger limit flights/h")
    for Tl in (60, 120, 300):
        print(f"T_load {Tl:4d} s: pad limit {8 * 3600 / (T_SWAP + Tl):6.1f}, charger limit {16 * 3600 / Tc:6.1f} -> binds: {'pads' if 8 * 3600 / (T_SWAP + Tl) < 16 * 3600 / Tc else 'chargers'}")

if __name__ == "__main__":
    main()
