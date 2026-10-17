"""Record tool versions, synthesis area/depth, equivalence and simulation checks."""
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from chip_toolchain import tool_versions, synth_stats, simulate, lint, equivalent, DESIGNS as D

print("Tool versions")
for k, v in tool_versions().items():
    print(f"  {k}: {v}")

print("\nSynthesis to a generic gate library (synth; abc -g AND,NAND,OR,NOR,XOR,XNOR,ANDNOT,ORNOT,MUX)")
print("design               params   cells  depth  flops")
rows = [("adder_ripple", "adder_ripple", {"W": w}) for w in (4, 8, 16, 32)]
rows += [("adder_op", "adder_op", {"W": w}) for w in (4, 8, 16, 32)]
rows += [("mult_op", "mult_op", {"W": w}) for w in (4, 8)]
rows += [("fifo", "fifo", {"W": 8, "AW": 2}), ("fifo", "fifo", {"W": 8, "AW": 3})]
for f, top, p in rows:
    s = synth_stats(D / f"{f}.v", top, p)
    flops = sum(n for t, n in s["by_type"].items() if "DFF" in t)
    ps = ",".join(f"{k}={v}" for k, v in p.items())
    print(f"{top:<20} {ps:<8} {s['cells']:>5}  {s['depth']:>5}  {flops:>5}")

print("\nEquivalence (Yosys miter + SAT)")
for w in (4, 8, 12):
    ok = equivalent(D / "adder_ripple.v", "adder_ripple", D / "adder_op.v", "adder_op", {"W": w})
    print(f"  adder_ripple == adder_op, W={w}: {ok}")
bad = equivalent(D / "adder_ripple.v", "adder_ripple", D / "adder_bug.v", "adder_bug", {"W": 8})
print(f"  adder_ripple == adder_bug (negative control), W=8: {bad}")

print("\nVerilator lint")
for f, top in [("adder_ripple", "adder_ripple"), ("adder_op", "adder_op"),
               ("mult_op", "mult_op"), ("fifo", "fifo")]:
    ok, msg = lint(D / f"{f}.v", top)
    kinds = sorted({w.split(":")[0].split("-")[-1] for w in msg.splitlines() if w.startswith("%Warning")})
    print(f"  {top}: {'clean' if ok else 'not clean: ' + ', '.join(kinds)}")

print("\nSimulation (Icarus Verilog)")
with tempfile.TemporaryDirectory() as t:
    lines = simulate("tb_adder", [D / "adder_ripple.v", D / "adder_op.v", D / "tb_adder.v"], t)
    vecs = [tuple(map(int, l.split())) for l in lines if l[:1].isdigit()]
    lines = vecs
    bad = [v for v in vecs if not (v[2] == v[3] == v[0] + v[1])]
    print(f"  tb_adder: {len(lines)} vectors, {len(bad)} mismatches against Python a+b")
