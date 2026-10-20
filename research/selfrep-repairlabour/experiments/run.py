import pathlib, sys
here = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(here.parent / "src"))
sys.path.insert(0, str(here.parents[1] / "selfrep-growth" / "src"))
from selfrep_repairlabour.model import Params, import_limit, labour_cap, summarise
from selfrep_growth.params import printer_copy

W, V, c, tot = printer_copy()
HOR, REPS = 20000.0, 60
out = [f"inputs from selfrep-growth/selfrep-closure (assumed): W={W:.1f} h, V={V:.1f} units per copy",
       f"horizon {HOR:.0f} h, start from 1 new machine, {REPS} runs per row, seed 0; c=0.2 s=0.9 reserve=1.0; breakdowns exponential mean L; repair time exponential mean h per bench",
       "work = working fleet (tail-quarter mean, median over surviving runs); down = machines queued or on a bench; dead = share of runs extinct.",
       "import = selfrep-repair balance B L / (V (c+1-s)); labour = benches L / h (see model.labour_cap). Pre-run prediction work ~ min(import, labour); the rows show it fails when labour binds (work exceeds the cap).", ""]

def row(label, p):
    w, d, dead = summarise(p, 1, HOR, REPS)
    return f"{label:34} work {w:7.1f} down {d:7.1f} dead {dead:4.2f}  import {import_limit(p):7.1f} labour {labour_cap(p):8.1f}"

for B, tag in ((4, "import-limited (B=4)"), (40, "machine-limited (B=40)")):
    out.append(f"== {tag}: benches K, L=2000 h, h=50 h")
    for K in (1, 2, 4, 8, 16, None):
        out.append(row(f"K={K}", Params(W, V, B, 2000, benches=K)))
    out.append("")
out.append("== repair time h (B=40, K=2, L=2000 h)")
for h in (5, 25, 50, 100, 200):
    out.append(row(f"h={h}", Params(W, V, 40, 2000, repair_h=h, benches=2)))
out += ["", "== short life L=300 h (B=40, K=1, h=50): labour cap 6"]
out.append(row("K=1", Params(W, V, 40, 300, benches=1)))
out.append(row("K=None", Params(W, V, 40, 300)))
out += ["", "== queue cap: retire a breakdown if this many already wait (B=40, h=50 h, L=2000 h)"]
for K in (1, 4):
    for qc in (0, 1, 5, 20, None):
        out.append(row(f"K={K} queue_cap={qc}", Params(W, V, 40, 2000, benches=K, queue_cap=qc)))
txt = "\n".join(out)
(here / "results.txt").write_text(txt + "\n")
print(txt)
