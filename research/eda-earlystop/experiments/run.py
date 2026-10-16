import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from eda_earlystop import policy as P

rows = P.load()
out = []
p = out.append
p(f"mutants {len(rows)}; formal outcome in the eda-verify log: " + ", ".join(
    f"{k} {sum(r['formal']==k for r in rows)}" for k in ("killed", "equivalent", "undecided")))
for k in ("killed", "equivalent", "undecided"):
    t = sorted(r["formal_seconds"] for r in rows if r["formal"] == k)
    p(f"  logged formal seconds, {k}: min {t[0]:.0f}, median {t[len(t)//2]:.0f}, max {t[-1]:.0f}")
p("")
p("Sweep: random-N -> directed-16 -> formal capped at T s (mean over 20 seeds; T=inf is the uncapped cascade)")
p(f"{'N':>3s} {'T':>5s} {'cpu_s':>7s} {'killed':>7s} {'equiv':>6s} {'unres':>6s} {'saved_vs_uncapped':>18s}")
base = {}
for n in (4, 16, 64):
    base[n] = P.mean(rows, n, None)
    for cap in (None, 300, 230, 200, 170, 120, 60, 30, 0):
        m = base[n] if cap is None else P.mean(rows, n, cap)
        p(f"{n:3d} {('inf' if cap is None else cap):>5} {m['cpu_s']:7.0f} {m['killed']:7.1f} {m['equivalent']:6.1f} {m['unresolved']:6.1f} {100*(1-m['cpu_s']/base[n]['cpu_s']):17.0f}%")
p("")
p("Held-out check: cap = 1.1 x longest formal kill in the training half, scored on the other half (split by log index parity; cap 0 if no training formal kill)")
p(f"{'N/train':>11s} {'test':>5s} {'cap_s':>6s} {'cpu_s':>7s} {'uncapped':>9s} {'killed':>7s} {'uncapped':>9s} {'equiv':>6s} {'uncapped':>9s}")
even = [r for r in rows if r["i"] % 2 == 0]
odd = [r for r in rows if r["i"] % 2 == 1]
for N, tr, te, nm in [(n, *x) for n in (4, 16) for x in ((even, odd, "even"), (odd, even, "odd"))]:
    cap = P.train_cap(tr, N) or 0.0
    a, b = P.mean(te, N, cap), P.mean(te, N, None)
    p(f"N={N:<3d}{nm:>6s} {len(te):5d} {cap:6.0f} {a['cpu_s']:7.0f} {b['cpu_s']:9.0f} {a['killed']:7.1f} {b['killed']:9.1f} {a['equivalent']:6.1f} {b['equivalent']:9.1f}")
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))
