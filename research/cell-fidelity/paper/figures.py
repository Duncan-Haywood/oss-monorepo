"""Figures for the paper's results and discussion sections (milestone 7j). Stdlib only.

    python3 research/cell-fidelity/paper/tables.py     # first, if the experiments changed
    python3 research/cell-fidelity/paper/cost.py
    python3 research/cell-fidelity/paper/figures.py    # writes paper/fig1_insample.svg, fig2_outofbatch.svg, fig3_time.svg

Figure 1 draws Table 1 (in-sample DFN-cycle saving of each 7e rule, per set), Figure 2 draws Table 2
(hit rate with its Wilson 95% interval against DFN cycles per design, every out-of-batch look), and
Figure 3 draws `cost.json` (the saving in wall time when a flagged run is continued or restarted).
Every number comes from `tables.json` or `cost.json`; nothing is typed in.
"""
import json
from pathlib import Path
from xml.sax.saxutils import escape

HERE = Path(__file__).resolve().parent
STYLE = """<style>
svg{--fg:#1d1d1f;--mute:#6e6e73;--grid:#d2d2d7;--bg:#ffffff;--c0:#2a6fdb;--c1:#d9622b;--c2:#2e9d6a;--c3:#8a5cc2}
@media (prefers-color-scheme: dark){svg{--fg:#f5f5f7;--mute:#a1a1a6;--grid:#424245;--bg:#1d1d1f;--c0:#6ea8ff;--c1:#ff9a62;--c2:#5fd39b;--c3:#c39bf0}}
text{fill:var(--fg);font:12px system-ui,sans-serif} .m{fill:var(--mute)} .g{stroke:var(--grid)}
.t{font-size:14px;font-weight:600}
</style>"""
COLORS = ["var(--c0)", "var(--c1)", "var(--c2)", "var(--c3)"]


def svg(w, h, body, title):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" '
            f'role="img" aria-label="{escape(title)}">{STYLE}<rect width="{w}" height="{h}" fill="var(--bg)"/>'
            f'<text class="t" x="16" y="22">{escape(title)}</text>{"".join(body)}</svg>\n')


def fig1(tab):
    rows = tab["in_sample"]
    rules = [("uniform", "best uniform length"), ("random", "random flags"), ("S_C", "S_C triage"),
             ("oracle", "oracle")]
    W, H, L, R, T, B = 640, 340, 56, 16, 60, 48
    pw, ph = W - L - R, H - T - B
    ymax = 0.8
    body = []
    for v in (0, 0.2, 0.4, 0.6, 0.8):
        y = T + ph * (1 - v / ymax)
        body.append(f'<line class="g" x1="{L}" x2="{W - R}" y1="{y:.1f}" y2="{y:.1f}"/>'
                    f'<text class="m" x="{L - 6}" y="{y + 4:.1f}" text-anchor="end">{v:.0%}</text>')
    gw = pw / len(rows)
    bw = gw * 0.8 / len(rules)
    for i, r in enumerate(rows):
        x0 = L + i * gw + gw * 0.1
        for j, (key, _) in enumerate(rules):
            v = r["saved7e"][key]
            y = T + ph * (1 - v / ymax)
            body.append(f'<rect x="{x0 + j * bw:.1f}" y="{y:.1f}" width="{bw - 2:.1f}" height="{T + ph - y:.1f}" '
                        f'fill="{COLORS[j]}"><title>{escape(r["set"])} {key}: {v:.0%}</title></rect>')
        body.append(f'<text x="{L + i * gw + gw / 2:.1f}" y="{H - B + 18}" text-anchor="middle">{escape(r["set"])}</text>')
    for j, (_, label) in enumerate(rules):
        x = L + j * 140
        body.append(f'<rect x="{x}" y="34" width="10" height="10" fill="{COLORS[j]}"/>'
                    f'<text x="{x + 14}" y="43">{escape(label)}</text>')
    body.append(f'<text class="m" x="{L}" y="{H - 8}">DFN cycles saved against all designs to cycle 50, mean of 21 '
                f'targets (in sample, hindsight; Table 1)</text>')
    return svg(W, H, body, "Figure 1. In-sample saving of each triage rule (7e)")


def fig2(tab):
    rows = tab["out_of_batch"]
    shapes = {"theta": 0, "F": 1, "U": 2, "R50": 3}
    names = {"theta": "threshold on S_C", "F": "flag fraction", "U": "uniform length", "R50": "batch-relative"}
    W, H, L, R, T, B = 640, 380, 56, 16, 60, 52
    pw, ph = W - L - R, H - T - B
    xlo, xhi, ylo, yhi = 36.0, 51.0, 0.4, 1.0

    def X(c):
        return L + pw * (c - xlo) / (xhi - xlo)

    def Y(p):
        return T + ph * (1 - (p - ylo) / (yhi - ylo))

    body = []
    for v in (0.4, 0.6, 0.8, 1.0):
        body.append(f'<line class="g" x1="{L}" x2="{W - R}" y1="{Y(v):.1f}" y2="{Y(v):.1f}"/>'
                    f'<text class="m" x="{L - 6}" y="{Y(v) + 4:.1f}" text-anchor="end">{v:.0%}</text>')
    for c in (36, 39, 42, 45, 48, 51):
        body.append(f'<line class="g" x1="{X(c):.1f}" x2="{X(c):.1f}" y1="{T}" y2="{T + ph}"/>'
                    f'<text class="m" x="{X(c):.1f}" y="{T + ph + 16}" text-anchor="middle">{c}</text>')
    body.append(f'<line x1="{X(50):.1f}" x2="{X(50):.1f}" y1="{T}" y2="{T + ph}" stroke="var(--mute)" '
                f'stroke-dasharray="4 3"/><text class="m" x="{X(50) - 4:.1f}" y="{T + 12}" text-anchor="end">U50</text>')
    for k, r in enumerate(rows):
        j = shapes[r["rule"]]
        lo, hi = r["wilson"]
        x = X(r["cycles"]) + (k % 3 - 1) * 3  # nudge overlapping looks apart
        p = r["met"] / r["n"]
        col = COLORS[j]
        body.append(f'<line x1="{x:.1f}" x2="{x:.1f}" y1="{Y(max(lo, ylo)):.1f}" y2="{Y(hi):.1f}" stroke="{col}" '
                    f'stroke-width="1.5" opacity="0.7"/>')
        tip = f'{r["look"]}, {r["rule"]}: {r["met"]}/{r["n"]} met at {r["cycles"]:.1f} cycles'
        body.append(f'<circle cx="{x:.1f}" cy="{Y(p):.1f}" r="4.5" fill="{col}"><title>{escape(tip)}</title></circle>')
    for j, key in enumerate(shapes):
        x = L + j * 140
        body.append(f'<circle cx="{x + 5}" cy="39" r="5" fill="{COLORS[j]}"/>'
                    f'<text x="{x + 14}" y="43">{escape(names[key])}</text>')
    body.append(f'<text class="m" x="{L}" y="{H - 24}">x: DFN cycles per design; y: share of held-out pools meeting '
                f'the tail target, Wilson 95% (Table 2)</text>')
    body.append(f'<text class="m" x="{L}" y="{H - 8}">Up and left is better: the threshold rule meets about as often '
                f'as a uniform length at fewer cycles.</text>')
    return svg(W, H, body, "Figure 2. Out-of-batch hit rate against DFN cost (7f to 7h)")


def fig3(cost):
    rows = [r for r in cost["looks"] if r["rule"] != "U"]
    W, L, R, T, B = 640, 210, 24, 60, 40
    rh = 22
    H = T + B + rh * len(rows)
    lo, hi = -0.15, 0.25
    pw = W - L - R

    def X(v):
        return L + pw * (v - lo) / (hi - lo)

    body = []
    for v in (-0.1, 0, 0.1, 0.2):
        body.append(f'<line class="g" x1="{X(v):.1f}" x2="{X(v):.1f}" y1="{T - 4}" y2="{H - B}"/>'
                    f'<text class="m" x="{X(v):.1f}" y="{H - B + 16}" text-anchor="middle">{v:+.0%}</text>')
    for i, r in enumerate(rows):
        y = T + i * rh + rh / 2
        body.append(f'<text x="{L - 8}" y="{y + 4:.1f}" text-anchor="end">{escape(r["look"])} {escape(r["rule"])}</text>')
        for v, col, name in ((r["time_saved_continue"], COLORS[0], "continue"),
                             (r["time_saved_restart"], COLORS[1], "restart")):
            x0, x1 = sorted((X(0), X(v)))
            dy = -5 if name == "continue" else 3
            body.append(f'<rect x="{x0:.1f}" y="{y + dy - 1:.1f}" width="{x1 - x0:.1f}" height="7" fill="{col}">'
                        f'<title>{name}: {v:+.1%}</title></rect>')
    body.append(f'<rect x="{L}" y="34" width="10" height="10" fill="{COLORS[0]}"/>'
                f'<text x="{L + 14}" y="43">continue the cycle-10 run</text>'
                f'<rect x="{L + 200}" y="34" width="10" height="10" fill="{COLORS[1]}"/>'
                f'<text x="{L + 214}" y="43">restart flagged designs from cycle 0</text>')
    body.append(f'<text class="m" x="16" y="{H - 8}">Wall-time saving against all designs to cycle 50; fixed cost '
                f'{cost["fixed_cost_cycles"]["median"]:.2f} cycle equivalents per run (paper/cost.py)</text>')
    return svg(W, H, body, "Figure 3. The saving in wall time depends on continuing runs")


def main():
    tab = json.loads((HERE / "tables.json").read_text())
    cost = json.loads((HERE / "cost.json").read_text())
    out = {"fig1_insample.svg": fig1(tab), "fig2_outofbatch.svg": fig2(tab), "fig3_time.svg": fig3(cost)}
    for name, text in out.items():
        (HERE / name).write_text(text)
        print("wrote", name)
    return out


if __name__ == "__main__":
    main()
