"""Write level_leak.svg: median conflicts left (F / F_1) against the layer spacing h under the 400 ft column, with
altitude-keeping error charged, one line per (Z, sigma) at 16 operators, from level_leak_results.txt.

    python3 figure_leak.py

Numbers are parsed from the committed results file, never retyped."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402

TEXT = (HERE / "level_leak_results.txt").read_text().splitlines()


def curves(m):
    hs, out, on = None, [], False
    for ln in TEXT:
        if ln.startswith("## M = %d: median F(h)" % m):
            on = True
            continue
        if on and (ln.startswith("##") or ln.startswith("  11ah")):
            break
        if not on:
            continue
        s = ln.strip()
        if s.startswith("h:"):
            hs = [float(x) for x in s[2:].split()]
        elif s.startswith("main"):
            tok = s.split()
            z, sg = tok[1].split("=")[1], tok[2].split("=")[1]
            out.append(("Z %s m, sigma %s m" % (z, sg), hs, [float(v) for v in tok[3:]]))
    return out


def main():
    series = [c for c in curves(16) if c[0].split(",")[1].strip() in ("sigma 0.50 m", "sigma 1.00 m", "sigma 3.00 m")
              and c[0].startswith("Z 7.62")]
    series += [c for c in curves(16) if c[0] == "Z 4.57 m, sigma 1.00 m"]
    write_lines(HERE, "level_leak.svg", "Layer spacing with altitude-keeping error charged (16 operators)",
                "Line plot of the median conflicts left against the vertical spacing between drone layer levels "
                "under a 120 m column, one line per vertical separation Z and altitude error sigma; each curve has "
                "a minimum, the best spacing",
                "layer spacing h (m)", "losses of separation / single band", series)


if __name__ == "__main__":
    main()
