import pathlib, random, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_nextmachine.select import MACHINES, exhaustive, greedy, printer_value, random_instance

out = []
budgets = [0, 300, 600, 800, 900, 1100, 1400, 1700]
for variant in ("lm8uu", "brass"):
    for metric in ("lines", "mass", "cost"):
        v = printer_value(variant, metric)
        out.append(f"== real instance: bearings={variant}, objective={metric} closure (assumed masses/costs, assumed machine prices)")
        out.append("budget  exhaustive                                  greedy-per-price                  closure(ex)  closure(greedy)")
        for b in budgets:
            e, g = exhaustive(MACHINES, b, v), greedy(MACHINES, b, v)
            ve = v({"fdm"} | {MACHINES[n][0] for n in e}); vg = v({"fdm"} | {MACHINES[n][0] for n in g})
            out.append(f"{b:6}  {', '.join(e) or '-':42}  {', '.join(g) or '-':32}  {100*ve:6.1f}%     {100*vg:6.1f}%")
        out.append("")

out.append("== synthetic instances: 8 machines, 40 parts, 6 processes, 500 instances, seed 0")
out.append("budget  greedy=optimal  mean greedy/optimal  worst greedy/optimal")
rng = random.Random(0)
insts = [random_instance(rng) for _ in range(500)]
for b in (1000, 2000, 3000):
    ratios, same = [], 0
    for ms, v in insts:
        e, g = exhaustive(ms, b, v), greedy(ms, b, v)
        ve = v({"fdm"} | {ms[n][0] for n in e}); vg = v({"fdm"} | {ms[n][0] for n in g})
        base = v({"fdm"})
        if ve - base > 1e-12:
            ratios.append((vg - base) / (ve - base)); same += abs(vg - ve) < 1e-12
    out.append(f"{b:6}  {same}/{len(ratios)} ({100*same/len(ratios):.0f}%)    {sum(ratios)/len(ratios):.3f}                {min(ratios):.3f}")
out.append("(ratios are of closure GAIN over the printer-only shop, counted over instances where some machine helps)")
text = "\n".join(out)
print(text)
(pathlib.Path(__file__).parent / "results.txt").write_text(text + "\n")
