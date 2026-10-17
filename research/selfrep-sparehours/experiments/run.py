import pathlib, sys
here = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(here.parents[0] / "src"))
from selfrep_sparehours.sparehours import BUSHING, bushing_rates, mean_repair_h
from selfrep_growth.params import printer_copy
from selfrep_repair.model import Params, summarise
from selfrep_spares.spares import mean_life_h, spare_cost_share

W, V, _, _ = printer_copy()
B, HOR, REPS, S, RH, RES = 4, 20000.0, 100, 0.9, 5.0, 1.0
BASE_C = spare_cost_share("printer", V)
out = [f"inputs (assumed) as selfrep-spares: W={W:.1f} h, V={V:.2f}; B={B}/h, s={S}, base downtime {RH} h, reserve {RES} V; DES {REPS} runs/row, horizon {HOR:.0f} h, seed 0",
       f"reference: stock LM8UU bearings, spares c={BASE_C:.4f}, L={mean_life_h():.1f} h, downtime {RH} h", ""]

def fleet(k, print_h, reps=REPS):
    rate, share = bushing_rates(k)
    c = spare_cost_share("printer", V, swap={BUSHING: (0.1, k)})
    p = Params(W, V, B, 1 / rate, repair_cost=c, repair_h=mean_repair_h(RH, print_h, share), repair_ok=S, reserve=RES)
    return summarise(p, 1, HOR, reps)

ref = summarise(Params(W, V, B, mean_life_h(), repair_cost=BASE_C, repair_h=RH, repair_ok=S, reserve=RES), 1, HOR, REPS)
out.append(f"stock bearings (reference): fleet {ref[1]:6.1f} [{ref[0]:6.1f}-{ref[2]:6.1f}] dead {ref[3]:4.2f}")
out += ["", "A. printed bushing, life k x LM8UU life, each bushing repair waits print_h extra hours (mean-downtime approximation)"]
for k in (1.0, 0.5):
    share = bushing_rates(k)[1]
    out.append(f"== A{int(k == 0.5) + 1}. k={k}: {share:.3f} of breakdowns need a printed bushing")
    for ph in (0, 10, 50, 100, 200, 500, 1000, 2000, 5000):
        lo, med, hi, dead = fleet(k, ph)
        lead = "none" if ph == 0 else f"{ph:4}"
        out.append(f"{lead:>4} h print  downtime {mean_repair_h(RH, ph, share):7.1f}  fleet {med:6.1f}  [{lo:6.1f}-{hi:6.1f}]  dead {dead:4.2f}  vs-stock {med - ref[1]:+6.1f}")
    out.append("")
txt = "\n".join(out)
(here / "results.txt").write_text(txt + "\n")
print(txt)
