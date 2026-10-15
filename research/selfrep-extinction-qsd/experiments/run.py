import pathlib
import sys
import time

here = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(here.parent / "src"))
sys.path.insert(0, str(here.parents[1] / "selfrep-extinction-kits" / "src"))
sys.path.insert(0, str(here.parents[1] / "selfrep-growth" / "src"))
from selfrep_extinction_kits.chain import solve
from selfrep_extinction_qsd.qsd import mean_fleet, mean_times, qsd
from selfrep_growth.params import printer_copy

W, V, _, _ = printer_copy()
out = [f"inputs from selfrep-growth/selfrep-closure (assumed): W={W:.1f} h, V={V:.1f} units per copy; kit rate a = B/V; truncation nmax=30, kmax=12 unless stated",
       "T1 = exact mean hours to extinction from one new machine (empty stock); lam0 = slowest decay rate of the non-extinct sub-generator; 1/lam0 = QSD estimate.",
       "p6 = exact P(fleet hits 0 before reaching 6 machines) from one new machine (selfrep-extinction-kits.solve).", ""]
t0 = time.time()
rows = []
for L, B in [(75, 4), (100, 4), (200, 4), (300, 4), (500, 4), (200, 8), (300, 8)]:
    a = B / V
    lam, d, it = qsd(a, W, L)
    h = mean_times(a, W, L)
    p6 = solve(a, W, L, safe=6)["p_extinct_first"]
    rows.append((L, B, lam, d, h, p6, it))
out.append("== A. quasi-stationary estimate against the exact mean extinction time")
out.append(f"{'L':>5}{'B':>4}{'QSD fleet':>11}{'1/lam0':>11}{'T1':>11}{'T1*lam0':>9}{'p6':>7}{'(1-p6)/lam0':>13}{'T1/((1-p6)/lam0)':>19}")
for L, B, lam, d, h, p6, it in rows:
    T1 = h[(0, 1, 0)]
    out.append(f"{L:>5}{B:>4}{mean_fleet(d):>11.2f}{1/lam:>11.0f}{T1:>11.0f}{T1*lam:>9.3f}{p6:>7.3f}{(1-p6)/lam:>13.0f}{T1*lam/(1-p6):>19.3f}")
out.append("   (1-p6)/lam0 is the QSD estimate corrected for the chance the lone machine never reaches the QSD; the last column is how close it gets to T1 (1.000 = exact).")
out.append("")
out.append("== B. seed fleet n0 idle machines, empty stock: exact mean extinction hours, and n0-fold vs QSD")
out.append(f"{'L':>5}{'B':>4}" + "".join(f"{'n0='+str(n):>11}" for n in (1, 2, 4, 8)) + f"{'1/lam0':>11}")
for L, B, lam, d, h, p6, it in rows:
    out.append(f"{L:>5}{B:>4}" + "".join(f"{h[(0, n, 0)]:>11.0f}" for n in (1, 2, 4, 8)) + f"{1/lam:>11.0f}")
out.append("")
out.append("== C. truncation check (nmax=40, kmax=20): 1/lam0 and T1")
for L, B in [(200, 4), (300, 4), (300, 8)]:
    a = B / V
    lam, d, it = qsd(a, W, L, 40, 20)
    h = mean_times(a, W, L, 40, 20)
    out.append(f"L={L} B={B}: 1/lam0={1/lam:.0f} T1={h[(0,1,0)]:.0f}")
out.append(f"\nruntime {time.time()-t0:.0f} s")
text = "\n".join(out)
print(text)
(here / "results.txt").write_text(text + "\n")
