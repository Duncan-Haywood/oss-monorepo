"""Write experiments/clz16_scripts.svg: clz16 cells*depth by ABC script for the reference, best sweep config and best proposer file.

    python experiments/figure.py

Numbers are parsed from the committed results.txt (the clz16 block), never retyped; re-run run.py first if the experiment changes.
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
FONT = 'font-family="sans-serif"'


def clz_rows():
    text = (HERE / "results.txt").read_text()
    block = text.split("== clz16")[1].split("== absd8")[0]
    lines = block.split("\n")
    head = next(i for i, l in enumerate(lines) if l.startswith("candidate"))
    scripts = lines[head].split()[1:]
    rows = {}
    for l in lines[head + 1:]:
        if not l.strip():
            break
        name = l.split()[0]
        rows[name] = [int(x) for x in re.findall(r"(\d+) \(\d+/\d+\)", l)]
    return scripts, rows


def main():
    scripts, rows = clz_rows()
    groups = [("reference", ["reference"], "#555555"),
              ("best sweep config", [n for n in rows if n.startswith("S:")], "#1f6fb2"),
              ("best proposer file", [n for n in rows if n.startswith("P:")], "#c0392b")]
    W, H, L, R, T, B = 640, 340, 56, 16, 40, 56
    hi = max(min(rows[n][i] for n in names) for _, names, _ in groups for i in range(len(scripts)))
    py = lambda v: T + (H - T - B) * (1 - v / hi)
    gw = (W - L - R) / len(scripts)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Bars: clz16 cells times depth by ABC script for the reference, the best sweep config and the best proposer file; lower is better">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="22" text-anchor="middle" {FONT} font-size="14">clz16 cells&#215;depth by ABC script (axis from 0; lower is better)</text>']
    for k in range(5):
        v = hi * k / 4
        o.append(f'<line x1="{L}" x2="{W-R}" y1="{py(v):.1f}" y2="{py(v):.1f}" stroke="#ddd"/>'
                 f'<text x="{L-6}" y="{py(v)+4:.1f}" text-anchor="end" {FONT} font-size="11">{v:.0f}</text>')
    bw = gw * 0.26
    for i, s in enumerate(scripts):
        o.append(f'<text x="{L+gw*(i+0.5):.1f}" y="{H-B+16}" text-anchor="middle" {FONT} font-size="11">{s}</text>')
        for j, (_, names, col) in enumerate(groups):
            v = min(rows[n][i] for n in names)
            x = L + gw * i + gw * 0.07 + j * bw
            o.append(f'<rect x="{x:.1f}" y="{py(v):.1f}" width="{bw*0.92:.1f}" height="{H-B-py(v):.1f}" fill="{col}"/>'
                     f'<text x="{x+bw*0.46:.1f}" y="{py(v)-3:.1f}" text-anchor="middle" {FONT} font-size="10">{v}</text>')
    for j, (label, _, col) in enumerate(groups):
        x = L + j * 170
        o.append(f'<rect x="{x}" y="{H-18}" width="10" height="10" fill="{col}"/><text x="{x+15}" y="{H-9}" {FONT} font-size="11">{label}</text>')
    o.append("</svg>")
    (HERE / "clz16_scripts.svg").write_text("\n".join(o) + "\n")


if __name__ == "__main__":
    main()
