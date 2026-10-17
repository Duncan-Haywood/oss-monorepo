import pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_stockmass import stock as t

s = t.s
nm = lambda others: ", ".join(s.rd.SUBS[i].name for i in others) or "-"
BUDGETS = (0.0, 0.5, 1.0, 2.0, 3.0, 4.0)
base = s.design_of(s.ROD_OPTIONS[0], ())
vg, sg, vc, sc = t.imports(base)
out = [f"baseline (steel rods, no substitutions), yield {t.YIELD}, stock cost fraction {t.STOCK_COST_FRAC} (both assumed):",
       f"  vitamin mass {vg:.0f} g, stock mass {sg:.0f} g, import mass {vg+sg:.0f} g; vitamin cost {vc:.1f}, stock cost {sc:.1f}, import cost {vc+sc:.1f} (BOM units)", ""]
for label, obj in (("import mass (g)", t.import_mass), ("import cost (BOM units)", t.import_cost)):
    out.append(f"== objective: minimise {label}; printer+router+laser shop")
    out.append("budget  best import | mass-closure pick (selfrep-alusearch) -> its import | minimiser's choice")
    for bud in BUDGETS:
        rod, others, v, pen = t.best(bud, obj)
        crod, cothers, cv, _ = s.exhaustive(bud, "mass")
        cimp = obj(s.design_of(crod, cothers))
        out.append(f"{bud:5.1f}  {v:9.1f}  | {s.rod_name(crod)}, {len(cothers)} subs -> {cimp:9.1f}  | {s.rod_name(rod)}; {nm(others)}")
    out.append("")
out.append("== rod picked by the import-mass minimiser as yield varies (budget 2.0 / 4.0)")
for y in (0.3, 0.5, 0.8, 1.0):
    row = []
    for bud in (2.0, 4.0):
        rod, others, v, _ = t.best(bud, lambda p, y=y: t.import_mass(p, y))
        row.append(f"budget {bud}: {s.rod_name(rod)}, {len(others)} subs, {v:.0f} g")
    out.append(f"yield {y}: " + " | ".join(row))
out.append("")
out.append("== rod picked by the import-cost minimiser as stock cost fraction varies (budget 2.0 / 4.0), yield 0.8")
for f in (0.1, 0.3, 0.6, 1.0):
    row = []
    for bud in (2.0, 4.0):
        rod, others, v, _ = t.best(bud, lambda p, f=f: t.import_cost(p, frac=f))
        row.append(f"budget {bud}: {s.rod_name(rod)}, {len(others)} subs, {v:.1f}")
    out.append(f"frac {f}: " + " | ".join(row))
text = "\n".join(out)
print(text)
(pathlib.Path(__file__).parent / "results.txt").write_text(text + "\n")
