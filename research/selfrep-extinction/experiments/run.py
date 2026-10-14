import pathlib, sys
here = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(here.parent / "src"))
sys.path.insert(0, str(here.parents[1] / "selfrep-wearout" / "src"))
sys.path.insert(0, str(here.parents[1] / "selfrep-growth" / "src"))
from selfrep_extinction.chain import equilibrium, gillespie_extinction, mean_extinction_times
from selfrep_wearout.model import Params, simulate
from selfrep_growth.params import printer_copy

W, V, c, tot = printer_copy()
B, GRID, HOR, REPS = 4.0, 10.0, 40000.0, 150


def mle_mean(times, events):
    """Exponential MLE of the mean with right-censoring: total observed time / number of extinctions."""
    return sum(times) / events if events else float("inf")


def des_extinction(p, n0, cv, reps=REPS):
    p = Params(p.work_h, p.vit_cost, p.budget, p.life_h, cv=cv)
    times, ev = [], 0
    for s in range(reps):
        smp = simulate(p, n0, HOR, seed=1000 + s, grid=GRID)
        if 0 in smp:
            times.append(GRID * smp.index(0)); ev += 1
        else:
            times.append(HOR)
    return mle_mean(times, ev), ev


def chain_mc(n0, L, reps=REPS):
    times, ev = [], 0
    for s in range(reps):
        t = gillespie_extinction(n0, W, V, B, L, seed=s, horizon=HOR)
        times.append(t); ev += t < HOR
    return mle_mean(times, ev), ev


out = [f"inputs from selfrep-growth/selfrep-closure (assumed): W={W:.1f} h, V={V:.1f} units per copy; import budget B={B:g} units/h; no failures, no recycling",
       f"exact = solved mean extinction time of the birth-death chain; chain MC = {REPS} Gillespie paths of that chain; DES = {REPS} runs of selfrep-wearout.simulate (exponential life), fleet sampled every {GRID:g} h, horizon {HOR:.0f} h",
       "exact+int = the same chain with birth rates scaled by exp(-W/L), the chance a build outlives its machine; **added after seeing the DES die out faster than the plain chain, so a post-hoc fit checked on the same runs.** MC and DES means are exponential-MLE (total observed time / extinctions), so runs that did not die by the horizon are censored, not dropped; 'ext' = extinctions seen. All times in hours. The single-exponential MLE is unreliable when few extinctions are seen (rows with ext < 30) and when n0 is small and early die-out mixes with a rare late one.", ""]
out.append(f"{'L':>6} {'n0':>3} {'equil':>6} {'exact':>9} {'exact+int':>10} {'chain MC':>10} {'ext':>4} {'DES cv=0.2':>11} {'ext':>4} {'DES cv=1':>10} {'ext':>4}")
for L in (100, 200, 300, 500):
    ex = mean_extinction_times(W, V, B, L, nmax=400)
    exi = mean_extinction_times(W, V, B, L, nmax=400, interrupt=True)
    for n0 in (1, 4):
        mc, e1 = chain_mc(n0, L)
        d2, e2 = des_extinction(Params(W, V, B, L), n0, 0.2)
        d1, e3 = des_extinction(Params(W, V, B, L), n0, 1.0)
        out.append(f"{L:>6} {n0:>3} {equilibrium(W, V, B, L):6.1f} {ex[n0]:9.0f} {exi[n0]:10.0f} {mc:10.0f} {e1:4d} {d2:11.0f} {e2:4d} {d1:10.0f} {e3:4d}")
text = "\n".join(out)
print(text)
(here / "results.txt").write_text(text + "\n")
