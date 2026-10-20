"""Collision experiments. All timing constants are assumptions; see README.  python experiments/run.py > results.txt"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from swe_schedule import sim

T = 40000
POOL = 11


def row(label, mu, se):
    return f"  {label:<28} {100*mu:5.1f}% runs redundant (se {100*se:.2f})"


def main():
    print(f"trials per cell: {T}; pool = {POOL} tracks unless stated; read=2 min, jitter=0.5 min (assumed)\n")
    print("1. blind simultaneous starts, closed form vs simulation (latency = infinity)")
    for n in (2, 4, 6, 8):
        mu, se = sim.waste(T, 10 + n, n=n, pool=POOL, policy="uniform", latency=1e9, latency_exp=False)
        cf = 1 - sim.birthday_distinct(n, POOL) / n
        print(row(f"n={n} sim", mu, se) + f"   closed form {100*cf:5.1f}%   P(any duplicate pair) {100*sim.p_any_collision(n, POOL):4.1f}%")

    print("\n2. n=4 simultaneous starts, claims visible after Exp(mean L) minutes")
    for L in (1, 3, 10, 30):
        print(row(f"L={L} min", *sim.waste(T, 20 + L, n=4, pool=POOL, policy="uniform", latency=float(L))))

    print("\n3. n=4, pool size (blind picks, L=3)")
    for pool in (5, 11, 22, 44):
        print(row(f"pool={pool}", *sim.waste(T, 30 + pool, n=4, pool=pool, policy="uniform", latency=3.0)))

    print("\n4. n=4, stagger gap g minutes between starts; batch finishes starting after 3g minutes")
    for L in (3, 10):
        print(f" claim latency mean {L} min")
        for g in (0, 1, 2, 5, 10, 20):
            print(row(f"g={g}", *sim.waste(T, 40 + g + L, n=4, pool=POOL, policy="stagger", gap=float(g), latency=float(L))))

    print("\n5. scheduler-assigned slots (no look-up, no claim latency)")
    for n in (4, 8, 11, 14):
        print(row(f"n={n}", *sim.waste(T, 50 + n, n=n, pool=POOL, policy="slots")))

    print("\n6. runs shipped per batch of 4 (4 x (1 - redundant)), and start spread 3g minutes")
    base = sim.waste(T, 60, n=4, pool=POOL, policy="uniform", latency=3.0)[0]
    st = sim.waste(T, 61, n=4, pool=POOL, policy="stagger", gap=5.0, latency=3.0)[0]
    print(f"  uniform {4*(1-base):.2f}   stagger g=5 {4*(1-st):.2f}   slots 4.00")


if __name__ == "__main__":
    main()
