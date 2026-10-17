import pathlib, random, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_alusearch import search as s

nm = lambda others: ", ".join(s.rd.SUBS[i].name for i in others) or "-"
BUDGETS = (0.0, 0.5, 1.0, 1.5, 2.0, 3.0, 4.0)
out = [f"{len(s.ROD_OPTIONS)} rod options x 2^{len(s.OTHER)} other-substitution subsets = {len(list(s.all_designs()))} designs; "
       f"rod penalty = min(1, K*log2(1+sag/sag_steel8)), K = {s.K} (assumed); sag_steel8 = {1000*s.SAG_STEEL:.3f} mm at 5 N, 420 mm",
       "rod penalties: " + ", ".join(f"{s.rod_name(o)} {s.rod_penalty(*o):.2f}" for o in s.ROD_OPTIONS), ""]
for metric in ("mass", "cost", "lines"):
    out.append(f"== objective: {metric} closure, printer+router+laser shop")
    out.append("budget  joint-search  | old redesign (wood 0.9)  | joint choice")
    for bud in BUDGETS:
        rod, others, v, pen = s.exhaustive(bud, metric)
        _, vo = s.old_redesign(bud, metric)
        out.append(f"{bud:5.1f}   {100*v:6.1f}%      | {100*vo:6.1f}%                  | {s.rod_name(rod)}; {nm(others)}")
    out.append("")
# random-search baseline on the joint space, 8 evaluations
designs = list(s.all_designs())
out.append("== random search on the joint space, mass closure, 8 evaluations (mean of 200) vs exhaustive")
for bud in (1.0, 2.0, 3.0):
    ex = s.exhaustive(bud, "mass")[2]
    vals = []
    for seed in range(200):
        rng = random.Random(seed); best = s.rd.closure_of(s.design_of(s.ROD_OPTIONS[0], ()), s.PROCS, "mass")
        for _ in range(8):
            rod, others = rng.choice(designs)
            if s.total_penalty(rod, others) <= bud:
                best = max(best, s.rd.closure_of(s.design_of(rod, others), s.PROCS, "mass"))
        vals.append(best)
    out.append(f"budget {bud:.1f}: random {100*sum(vals)/len(vals):.1f}%  exhaustive {100*ex:.1f}%")
# sensitivity of the rod choice to the penalty scale K
out += ["", "== which rod does the mass-closure optimum use as the rod penalty scale K varies (K assumed 0.25)"]
for bud in (1.0, 2.0, 3.0):
    row = []
    for k in (0.05, 0.1, 0.25, 0.5, 1.0):
        rod, others, v, pen = s.exhaustive(bud, "mass", k=k)
        row.append(f"K={k}: {s.rod_name(rod)} {100*v:.1f}%")
    out.append(f"budget {bud:.1f}: " + " | ".join(row))
text = "\n".join(out)
print(text)
(pathlib.Path(__file__).parent / "results.txt").write_text(text + "\n")
