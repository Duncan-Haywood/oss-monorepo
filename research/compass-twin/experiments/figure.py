"""Write experiments/hard_iron.svg.

    python experiments/figure.py

Parsed from the committed results.txt (never retyped).
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
COLS = ["#c0392b", "#1f6fb2", "#2e8b57", "#8e6bbf"]
F = 'font-family="sans-serif"'


def lines_text():
    return (HERE / "results.txt").read_text().splitlines()


def chart(title, xlabels, series, ylabel, kind="line", errs=None, logx=False):
    """series: {name: [y per x]}; kind line or bar; errs: {name: [std]} optional whiskers."""
    W, H, L, R, T, B = 600, 360, 70, 16, 40, 70
    lo = min(0.0, min(v for s in series.values() for v in s))
    allv = [v + (errs[n][i] if errs else 0) for n, s in series.items() for i, v in enumerate(s)]
    hi = max(allv) * 1.12 if max(allv) > 0 else 1.0
    py = lambda v: T + (1 - (v - lo) / (hi - lo)) * (H - T - B)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="{title}">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="22" text-anchor="middle" {F} font-size="14">{title}</text>',
         f'<text x="14" y="{(T+H-B)/2}" text-anchor="middle" {F} font-size="11" transform="rotate(-90 14 {(T+H-B)/2})">{ylabel}</text>']
    for k in range(5):
        v = lo + (hi - lo) * k / 4
        o.append(f'<line x1="{L}" x2="{W-R}" y1="{py(v):.1f}" y2="{py(v):.1f}" stroke="#ddd"/>'
                 f'<text x="{L-6}" y="{py(v)+4:.1f}" text-anchor="end" {F} font-size="11">{v:.3g}</text>')
    n, names = len(xlabels), list(series)
    gw = (W - L - R) / n
    for i, xl in enumerate(xlabels):
        o.append(f'<text x="{L+(i+0.5)*gw:.1f}" y="{H-B+16}" text-anchor="middle" {F} font-size="11">{xl}</text>')
    for j, name in enumerate(names):
        c = COLS[j % 4]
        if kind == "bar":
            bw = gw * 0.8 / len(names)
            for i, v in enumerate(series[name]):
                x = L + i * gw + gw * 0.1 + bw * j
                y0, y1 = sorted((py(0), py(v)))
                o.append(f'<rect x="{x:.1f}" y="{y0:.1f}" width="{bw*0.92:.1f}" height="{y1-y0:.1f}" fill="{c}"/>')
                if errs:
                    e = errs[name][i]
                    xm = x + bw * 0.46
                    o.append(f'<line x1="{xm:.1f}" x2="{xm:.1f}" y1="{py(v-e):.1f}" y2="{py(v+e):.1f}" stroke="#222"/>')
        else:
            pts = " ".join(f"{L+(i+0.5)*gw:.1f},{py(v):.1f}" for i, v in enumerate(series[name]))
            o.append(f'<polyline points="{pts}" fill="none" stroke="{c}" stroke-width="2"/>')
            for i, v in enumerate(series[name]):
                o.append(f'<circle cx="{L+(i+0.5)*gw:.1f}" cy="{py(v):.1f}" r="3" fill="{c}"/>')
        lx = L + 10 + 130 * j
        o.append(f'<rect x="{lx}" y="{H-18}" width="10" height="10" fill="{c}"/>'
                 f'<text x="{lx+15}" y="{H-9}" {F} font-size="11">{name}</text>')
    o.append("</svg>")
    return "\n".join(o) + "\n"

def main():
    xs, num, rms = [], [], []
    sec = False
    for line in lines_text():
        if line.startswith("== 1."):
            sec = True
            continue
        if line.startswith("== 2."):
            break
        m = re.match(r"\s*([\d.]+)\s+([\d.]+)\s+[\d.]+\s+[\d.]+\s+([\d.]+)\s*$", line)
        if sec and m:
            xs.append(m[1]); num.append(float(m[2])); rms.append(float(m[3]))
    assert xs, "no rows parsed"
    (HERE / "hard_iron.svg").write_text(chart("Compass twin: hard-iron heading error vs offset beta/B", xs,
        {"peak (deg)": num, "rms (deg)": rms}, "heading error (deg)", "bar"))


if __name__ == "__main__":
    main()
