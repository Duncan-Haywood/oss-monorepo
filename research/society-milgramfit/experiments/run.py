"""society-milgramfit results.   python3 experiments/run.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from society_milgramfit import contagion_any, hazard_exponent, independent_two, min_enforcers, p_star, per_viewer  # noqa: E402

out = ["society-milgramfit results. Model of society-enforcers (M=9, k=1, eps=0.02; enforcers L=10, q=0.5 unless stated).",
       "Milgram et al. 1986 inputs are from a secondary summary (spring.org.uk, 2008): ~0.5 any reaction to one intruder,",
       "0.10 physically ejected, 0.91 with two intruders, 0.05 behind a buffer. Not checked against the paper.", ""]
out.append("== A. least lone-cut stopping chance p* at which people alone keep a norm (rho=0, e=0), by memory M")
for m in (3, 5, 9, 15, 25):
    out.append(f"M={m:2d} p*={p_star(m):.3f}")
out.append("")
out.append("== B. enforcers needed (L=10,q=0.5) against rho cutter robots, by lone-cut stop chance p0 (nan = none can)")
out.append("p0    rho0.00 rho0.10 rho0.20 rho0.30")
for p in (0.1, 0.3, 0.5, 0.7, 0.9):
    out.append(f"{p:.1f}   " + "  ".join(f"{min_enforcers(r, 9, p):.3f}  " for r in (0.0, 0.1, 0.2, 0.3)))
out.append("")
out.append("== C. enforcers needed with no cutters (rho=0) at p0=0.5, by memory M")
for m in (3, 5, 9, 15):
    out.append(f"M={m:2d} e_min={min_enforcers(0.0, m, 0.5):.3f}")
out.append("")
out.append("== D. independence check: one intruder objected to 0.5 -> two intruders if independent vs reported 0.91")
out.append(f"independent={independent_two(0.5):.3f} reported=0.91")
out.append("per-viewer reaction r for 'any reaction'=0.5 by people in view L: " +
           ", ".join(f"L={v}:{per_viewer(0.5, v):.3f}" for v in (2, 5, 10, 20)))
out.append("")
out.append("== E. can viewer influence explain 0.91? (step 2 of Next steps)")
out.append("P(any of 10 viewers reacts), per-viewer r0=0.067, by contagion boost c per earlier reaction: " +
           ", ".join(f"c={c}:{contagion_any(0.067, 10, c):.3f}" for c in (0.0, 0.1, 0.5, 1.0)))
a = hazard_exponent(0.5, 0.91)
out.append(f"so contagion cannot lift the any-reaction rate. Hazard growing as n**a with a={a:.2f} reproduces 0.5 -> 0.91 "
           f"(a=1 is independence, 0.75). One free parameter fit to one reported number: description, not test.")
Path(__file__).with_name("results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
