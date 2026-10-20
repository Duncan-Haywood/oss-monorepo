import pathlib, sys
here = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(here.parent / "src"))
sys.path.insert(0, str(here.parents[1] / "selfrep-growth" / "src"))
from selfrep_repairpay.model import Params, summarise
from selfrep_growth.params import printer_copy

W, V, c, tot = printer_copy()
HOR, REPS = 20000.0, 60
out = [f"inputs from selfrep-growth/selfrep-closure (assumed): W={W:.1f} h, V={V:.1f} units per copy",
       f"horizon {HOR:.0f} h, start from 1 new machine, {REPS} runs per row, seed 0; c=0.2 s=0.9 reserve=1.0; B=40 units/h, L=2000 h, h=50 h",
       "work = working fleet (tail-quarter mean, median over surviving runs); down = machines queued or on a bench; dead = share of runs extinct.",
       "join = spares bought on joining the queue (selfrep-repairlabour); service = bought when a bench frees up, machine retired if stock is short then.", ""]

def row(label, p):
    w, d, dead = summarise(p, 1, HOR, REPS)
    return f"{label:30} work {w:7.1f} down {d:7.1f} dead {dead:4.2f}"

out.append("== unbounded queue vs replace-only, by pay rule (B=40)")
for K in (1, 2, 4, 8, 16):
    for mode in ("join", "service"):
        out.append(row(f"K={K} {mode}", Params(W, V, 40, 2000, benches=K, pay_at=mode)))
    out.append(row(f"K={K} replace-only", Params(W, V, 40, 2000, benches=K, queue_cap=0)))
out += ["", "== queue-cap sweep (B=40, K=1 and K=4)"]
for K in (1, 4):
    for mode in ("join", "service"):
        for qc in (0, 1, 2, 3, 5, 8, 12, 20, 50, 200, None):
            out.append(row(f"K={K} {mode} cap={qc}", Params(W, V, 40, 2000, benches=K, queue_cap=qc, pay_at=mode)))
        out.append("")
out += ["== import-limited (B=4)"]
for K in (1, 2, 4):
    for mode in ("join", "service"):
        out.append(row(f"K={K} {mode}", Params(W, V, 4, 2000, benches=K, pay_at=mode)))
txt = "\n".join(out)
(here / "results.txt").write_text(txt + "\n")
print(txt)
