import pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_alufreq import freq
from selfrep_rodmodes import modes as m

out = [f"carriage mass {m.M_CARRIAGE} kg, longest rod {freq.L*1000:.0f} mm, holder limit {freq.alu.b.D_MAX_STD*1000:.0f} mm (assumptions)",
       "== rod diameter for a first-mode target; all seven redesign substitutions, printer+router+laser shop",
       "target Hz  material     d mm  fits  mass-closure  stock-to-import g  vitamin g"]
for f in (10, 20, 30, 40, 60):
    for mat in ("hardwood", "aluminium"):
        r = freq.row(mat, f)
        out.append(f"{f:7.0f}   {mat:10} {1000*r['d']:6.1f}  {'yes' if r['fits'] else 'NO ':3}  {100*r['mass_closure']:8.1f}%     "
                   f"{r['stock_g']:10.0f}      {r['vitamin_g']:7.0f}")
out += ["", "== highest first-mode frequency reachable within the holder limit, by carriage mass (Hz)",
        "M kg   steel  aluminium  hardwood"]
for M in (0.1, 0.3, 0.6, 1.0):
    fs = [m.frequency(mat, freq.alu.b.D_MAX_STD, freq.L, M) for mat in ("steel", "aluminium", "hardwood")]
    out.append(f"{M:4.1f}  " + "  ".join(f"{x:8.1f}" for x in fs))
out += ["", "== aluminium vs steel 8 mm at equal frequency",
        f"steel 8 mm: {m.frequency('steel', .008, freq.L):.1f} Hz; aluminium needs d = {1000*freq.diameter('aluminium', m.frequency('steel', .008, freq.L)):.1f} mm"]
text = "\n".join(out)
print(text)
(pathlib.Path(__file__).parent / "results.txt").write_text(text + "\n")
