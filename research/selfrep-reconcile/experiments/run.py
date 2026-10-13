import pathlib
import sys

here = pathlib.Path(__file__).resolve().parent
for p in ("selfrep-reconcile", "selfrep-extinction", "selfrep-extinction-kits", "selfrep-growth"):
    sys.path.insert(0, str(here.parents[1] / p / "src"))
from selfrep_growth.params import printer_copy
from selfrep_extinction_kits.chain import solve
from selfrep_reconcile.chain import birth_min, birth_serial, mean_extinction

W, V, _, _ = printer_copy()
out = [f"W={W:.1f} h, V={V:.1f} units per copy (assumed, from selfrep-growth/selfrep-closure); kit rate a = B/V; hours",
       "min = selfrep-extinction chain from n=1; serial = b(n)=1/(W/n+1/a) from n=1; kits = selfrep-extinction-kits exact chain (nmax 30, kmax 12) from one idle machine, empty stock.",
       "ratio = chain / kits (1 means agreement).", "",
       f"{'case':14}{'min':>12}{'serial':>12}{'kits':>12}{'min/kits':>10}{'serial/kits':>13}"]
for L, B in ((75, 4), (100, 4), (200, 4), (300, 4), (200, 8), (200, 2), (100, 16)):
    a = B / V
    m = mean_extinction(birth_min, W, a, L)[1]
    s = mean_extinction(birth_serial, W, a, L)[1]
    k = solve(a, W, L, nmax=30, kmax=12)["mean_time"]
    out.append(f"L={L:<4}B={B:<5}{m:12.0f}{s:12.0f}{k:12.0f}{m/k:10.2f}{s/k:13.2f}")
text = "\n".join(out)
print(text)
(here / "results.txt").write_text(text + "\n")
