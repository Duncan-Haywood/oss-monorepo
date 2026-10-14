import pathlib, sys
here = pathlib.Path(__file__).resolve().parent
for d in ("selfrep-spares", "selfrep-repair", "selfrep-growth"):
    sys.path.insert(0, str(here.parents[1] / d / "src"))
from selfrep_growth.params import printer_copy
from selfrep_repair.model import Params, fixed_point, summarise
from selfrep_spares.spares import breakdown_rate, mean_life_h, spare_cost_share, spare_cost_split

W, V, _, _ = printer_copy()
B, HOR, REPS, S, RH, RES = 4, 20000.0, 100, 0.9, 5.0, 1.0
L0 = mean_life_h()
out = [f"inputs from selfrep-growth/selfrep-closure (assumed): W={W:.1f} h, V={V:.2f} units per copy; import budget B={B} units/h",
       f"wear-part lives are ASSUMED (spares.LIFE_H); machine mean life from them L={L0:.1f} h (rate {breakdown_rate():.5f}/h)",
       f"repair: success s={S}, downtime {RH} h, reserve {RES} V; DES {REPS} runs/row, horizon {HOR:.0f} h, seed 0 (median [5-95 pct] of surviving runs; dead = share with no working machine)", ""]

def row(label, p):
    lo, med, hi, dead = summarise(p, 1, HOR, REPS)
    return f"{label:44} c={p.repair_cost:7.4f} L={p.life_h:7.1f}  DES {med:7.1f} [{lo:7.1f}-{hi:7.1f}] dead {dead:4.2f}  formula {fixed_point(p):7.1f}"

out.append("== A. wear parts: share of breakdowns, unit cost (assumed currency), makeable by the printer alone / with router+laser")
split_p = spare_cost_split("printer", V)
split_c = {n: m for n, _, _, m in spare_cost_split("printer+cnc+laser", V)}
for n, sh, c, m in split_p:
    out.append(f"{n:44} share {sh:5.3f}  unit cost {c:5.1f}  printer {'yes' if m else 'no':3}  +cnc/laser {'yes' if split_c[n] else 'no'}")
out += ["", "== B. spare-cost share c derived per seed shop; repair vs replace-only (break-even is c = s)"]
base = Params(W, V, B, L0)
out.append(row("replace only", base))
for shop in ("printer", "printer+cnc+laser", "printer+cnc+laser+casting"):
    c = spare_cost_share(shop, V)
    out.append(row(f"repair, spares from shop: {shop}", Params(W, V, B, L0, repair_cost=c, repair_h=RH, repair_ok=S, reserve=RES)))
out += ["", "== C. design change: LM8UU bearings replaced by printed bushings (printed in-house, so no vitamin cost; ASSUMED life = k x LM8UU life)"]
for k in (1.0, 0.5, 0.25, 0.1):
    c = spare_cost_share("printer", V, swap={"LM8UU linear bearing": (0.1, k)})
    L = mean_life_h()  # lives of the other parts unchanged; recompute with swapped bearing life
    from selfrep_spares.spares import wear_parts
    rate = sum(p.qty / (life * (k if p.name == "LM8UU linear bearing" else 1.0)) for p, life in wear_parts())
    out.append(row(f"printed bushing life x{k}", Params(W, V, B, 1 / rate, repair_cost=c, repair_h=RH, repair_ok=S, reserve=RES)))
out += ["", "== D. sensitivity: all wear-part lives scaled (printer-alone spares)"]
for sc in (0.25, 0.5, 1.0, 2.0, 4.0):
    L = mean_life_h(life_scale=sc)
    c = spare_cost_share("printer", V)
    out.append(row(f"lives x{sc}: replace only", Params(W, V, B, L)))
    out.append(row(f"lives x{sc}: repair", Params(W, V, B, L, repair_cost=c, repair_h=RH, repair_ok=S, reserve=RES)))
txt = "\n".join(out)
(here / "results.txt").write_text(txt + "\n")
print(txt)
