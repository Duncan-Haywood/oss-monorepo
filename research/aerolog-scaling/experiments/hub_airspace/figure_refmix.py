"""Write ref_mix.svg: median F over the one-reference (mandate) optimum against the reference mismatch sigma_m, for the
aware, naive and cautious planners (Z = 25 ft, sigma = 1 m, half the operators on each reference, 16 operators), from
ref_mix_results.txt.

    python3 figure_refmix.py

Numbers are parsed from the committed results file, never retyped."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402

TEXT = (HERE / "ref_mix_results.txt").read_text().splitlines()


def rows(m, sigma=1.0, q=0.5, Z=7.62):
    on, out = False, []
    for ln in TEXT:
        if ln.startswith("## M = %d " % m):
            on = True
            continue
        if on and (ln.startswith("##") or ln.startswith("P0")):
            break
        tok = ln.split()
        if on and len(tok) >= 17 and tok[0][0].isdigit():
            z, s, qq, sm = map(float, tok[:4])
            if abs(z - Z) < 1e-6 and s == sigma and qq == q:
                out.append((sm, float(tok[9]), float(tok[15]), float(tok[16])))
    return out


def main():
    R = rows(16)
    xs = [r[0] for r in R]
    series = [("aware of each operator's reference", xs, [r[1] for r in R]),
              ("naive (as if one reference)", xs, [r[2] for r in R]),
              ("cautious (every pair at the mixed error)", xs, [r[3] for r in R])]
    write_lines(HERE, "ref_mix.svg", "Mixed altitude references: cost over a one-reference airspace (16 operators)",
                "Line plot of the median losses of separation relative to an airspace where every drone uses one "
                "altitude reference, against the sd of the mismatch between barometric and GNSS references, for three "
                "planners; half the operators on each reference, 25 ft separation, 1 m error per drone",
                "reference mismatch sigma_m (m)", "losses of separation / one-reference optimum", series, hline=1.0)


if __name__ == "__main__":
    main()
