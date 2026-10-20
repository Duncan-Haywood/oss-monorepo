"""Write experiments/fob_by_wage.svg: modelled FOB cost (with Monte Carlo 5-95% range) per coat and wage case.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
COLS = {"high-wage": "#c0392b", "mid-wage": "#1f6fb2", "low-wage": "#2e8b57"}


def parse(text):
    """[(coat, {wage: (fob, lo, hi)})] from the '## ' blocks that have FOB lines."""
    out = []
    for line in text.splitlines():
        if line.startswith("## "):
            out.append([line[3:].split(",")[0], {}])
        m = re.match(r"(\w+-wage) .*-> FOB (\d+) \(MC 5-95%: (\d+)-(\d+)\)", line)
        if m and out:
            out[-1][1][m[1]] = (int(m[2]), int(m[3]), int(m[4]))
    return [(c, d) for c, d in out if d]


def svg(data):
    W, H, L, T, B = 640, 380, 64, 56, 70
    top = max(hi for _, d in data for _, _, hi in d.values()) * 1.1
    ph = H - T - B
    y = lambda v: T + ph * (1 - v / top)
    gw = (W - L - 16) / len(data)
    bw = gw / 5
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Bar chart of modelled factory cost of two luxury coats at three assumed wage levels, with Monte Carlo 5 to 95 percent ranges">',
         '<rect width="100%" height="100%" fill="#fff"/>',
         f'<text x="{W/2}" y="24" text-anchor="middle" font-family="sans-serif" font-size="15">Modelled factory (FOB) cost per coat, by assumed wage</text>',
         f'<text x="16" y="{T+ph/2}" font-family="sans-serif" font-size="12" transform="rotate(-90 16 {T+ph/2})" text-anchor="middle">USD per coat</text>']
    for t in range(0, int(top), 100):
        o.append(f'<line x1="{L}" x2="{W-16}" y1="{y(t):.1f}" y2="{y(t):.1f}" stroke="#ddd"/><text x="{L-6}" y="{y(t)+4:.1f}" text-anchor="end" font-family="sans-serif" font-size="11">{t}</text>')
    for i, (coat, d) in enumerate(data):
        x0 = L + i * gw + gw / 2 - 1.5 * bw
        for j, (w, (v, lo, hi)) in enumerate(d.items()):
            x = x0 + j * bw
            cx = x + bw / 2
            o.append(f'<rect x="{x+2:.1f}" y="{y(v):.1f}" width="{bw-4:.1f}" height="{y(0)-y(v):.1f}" fill="{COLS[w]}"/>')
            o.append(f'<line x1="{cx:.1f}" x2="{cx:.1f}" y1="{y(lo):.1f}" y2="{y(hi):.1f}" stroke="#222"/>')
            o.append(f'<text x="{cx:.1f}" y="{y(hi)-4:.1f}" text-anchor="middle" font-family="sans-serif" font-size="11">{v}</text>')
        o.append(f'<text x="{L+i*gw+gw/2:.1f}" y="{H-B+18}" text-anchor="middle" font-family="sans-serif" font-size="12">{coat}</text>')
    for k, (w, c) in enumerate(COLS.items()):
        o.append(f'<rect x="{L+k*130}" y="{H-24}" width="12" height="12" fill="{c}"/><text x="{L+k*130+18}" y="{H-14}" font-family="sans-serif" font-size="12">{w}</text>')
    o.append("</svg>")
    return "\n".join(o)


def main():
    data = parse((HERE / "results.txt").read_text())
    (HERE / "fob_by_wage.svg").write_text(svg(data))


if __name__ == "__main__":
    main()
