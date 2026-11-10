"""Milestone 6c: do arrival bursts change the spare-pack inventory a cargo-VTOL hub needs?

Predictions (written before the first run):
 (1) Hub of 6b: 8 pads, 8 chargers, pack use 70% charged at 1C (42 min), swap+load 180 s; binding limit is
     chargers, 11.4 flights/h. At 70% of that limit (8.0 flights/h) with Poisson arrivals and 24 spares, p95 wait is under 60 s.
 (2) Same mean rate but batch arrivals (k orders at once, batches Poisson at rate lam/k) with k = 8 raise p95 wait
     at 24 spares by a factor of at least 3 over Poisson.
 (3) Holding p95 wait under 300 s at that load needs more spares for k = 8 than for Poisson: at least 8 more (one batch).
Inputs: as 6b (swap 60 s, load 120 s assumed, 1C charge 42 min for the 20-90% window; no charge taper).
Batch size k is swept, not measured: no delivery-demand burst data was sourced. Preliminary.
"""
import random

T_PAD, T_CHG, PADS, CH = 180.0, 0.7 * 3600, 8, 8   # s; 1C, 70% window = 2520 s

def sim(rate_per_h, k, spares, n_batches, seed):
    rng = random.Random(seed)
    lam_b = rate_per_h / k / 3600.0
    t = 0.0
    pad = [0.0] * PADS; chg = [0.0] * CH; pack = [0.0] * spares
    waits = []
    for _ in range(n_batches):
        t += rng.expovariate(lam_b)
        for _ in range(k):
            i = min(range(PADS), key=pad.__getitem__)
            j = min(range(spares), key=pack.__getitem__)
            start = max(t, pad[i], pack[j])
            end = start + T_PAD
            c = min(range(CH), key=chg.__getitem__)
            chg[c] = max(end, chg[c]) + T_CHG
            pack[j] = chg[c]
            pad[i] = end
            waits.append(start - t)
    w = waits[len(waits) // 5:]
    w.sort()
    return sum(w) / len(w), w[int(0.95 * len(w))]

def avg(rate, k, sp, seeds=5):
    n = int(40000 / k)
    r = [sim(rate, k, sp, n, s) for s in range(seeds)]
    return sum(x[0] for x in r) / seeds, sum(x[1] for x in r) / seeds

if __name__ == "__main__":
    lim = CH * 3600 / T_CHG
    print(f"Milestone 6c: arrival bursts at the 6b hub (8 pads, 8 chargers, charger limit {lim:.1f} flights/h)")
    for load in (0.7, 0.85):
        rate = load * lim
        print(f"\nLoad {load:.0%} of limit = {rate:.1f} flights/h. mean / p95 wait (s) by batch size k and spares")
        sps = (9, 12, 16, 24, 32, 40)
        print("k   | " + " | ".join(f"sp {s:3d}      " for s in sps))
        for k in (1, 2, 4, 8, 16):
            print(f"{k:3d} | " + " | ".join("%5.0f /%5.0f" % avg(rate, k, s) for s in sps))
        print("fewest spares (of those tried, +more) with p95 wait <= 300 s:")
        grid = (9, 12, 16, 20, 24, 28, 32, 40, 48, 64)
        for k in (1, 2, 4, 8, 16):
            ok = next((s for s in grid if avg(rate, k, s, 3)[1] <= 300), None)
            print(f"  k={k:2d}: {ok if ok else '>64'}")
