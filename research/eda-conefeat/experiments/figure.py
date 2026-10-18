"""Write experiments/abs_delta.svg: |cell-count delta| of each survivor, by whether Yosys proved it equivalent.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py and analyse.py first if the experiment changes.
Stdlib only.
"""
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
TEXT = (HERE / "results.txt").read_text().splitlines()
ROWS = [("equivalent", "equivalent |delta|:", "#2e8b57"), ("undecided", "undecided |delta|:", "#c0392b")]


def values(prefix):
    for l in TEXT:
        if l.startswith(prefix):
            return [float(v) for v in l[len(prefix):].split(",")]
    raise SystemExit("no line starting %r in results.txt" % prefix)


def main():
    W, H, L, R, T, B = 640, 260, 100, 20, 56, 56
    f = lambda v: math.log10(v + 1)  # |delta| = 0 is common; log10(v + 1) keeps it on the axis
    top = max(f(v) for _, p, _ in ROWS for v in values(p))
    px = lambda v: L + (W - L - R) * f(v) / top
    out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" role="img" aria-label="%s" font-family="sans-serif" font-size="12">'
           % (W, H, "Strip plot of the absolute cell-count change of each of the survivors by label; the nine undecided survivors cluster at 0 to 2 cells apart from one at 37, equivalent ones range from 0 to 178")]
    out.append('<title>Cell-count change of survivors, by Yosys verdict</title>')
    out.append('<text x="%d" y="22" font-size="14" font-weight="bold" fill="currentColor">Cell-count change of a survivor, by Yosys verdict</text>' % L)
    out.append('<text x="%d" y="40" fill="currentColor" opacity="0.7">each dot is one mutant that passed simulation (equivalent 16, undecided 9)</text>' % L)
    for t in [0, 1, 10, 100]:
        out.append('<line x1="%.1f" x2="%.1f" y1="%d" y2="%d" stroke="currentColor" opacity="0.2"/>' % (px(t), px(t), T, H - B))
        out.append('<text x="%.1f" y="%d" text-anchor="middle" fill="currentColor">%d</text>' % (px(t), H - B + 16, t))
    out.append('<text x="%d" y="%d" text-anchor="middle" fill="currentColor">|cells(mutant) &#8722; cells(golden)|, log10(x+1) scale</text>' % ((L + W - R) // 2, H - 12))
    for k, (name, prefix, col) in enumerate(ROWS):
        y = T + 40 + 80 * k
        out.append('<text x="%d" y="%d" text-anchor="end" fill="currentColor">%s</text>' % (L - 10, y + 4, name))
        seen = {}
        for v in sorted(values(prefix)):
            n = seen.get(v, 0)
            seen[v] = n + 1
            out.append('<circle cx="%.1f" cy="%d" r="5" fill="%s" fill-opacity="0.75"/>' % (px(v), y - 11 * n, col))
    out.append('</svg>')
    (HERE / "abs_delta.svg").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
