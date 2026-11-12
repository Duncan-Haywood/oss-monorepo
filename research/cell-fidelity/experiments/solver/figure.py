"""Write experiments/solver/solver.svg: (top) share of SPMe's stopped and failed runs that reach 100 cycles under each
solver variant; (bottom) each design's first-discharge minimum salt ratio from the 1-cycle diagnostic.

    python experiments/solver/figure.py

Numbers come from the committed summary.json, census.json and diag.jsonl. Stdlib only.
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
S = json.loads((HERE / "summary.json").read_text())
C = json.loads((HERE / "census.json").read_text())
D = {(r["bench"], r["set"], r["j"]): r for r in map(json.loads, (HERE / "diag.jsonl").read_text().splitlines())}
COL = {"V0": "#8a8a8a", "V1": "#5b8fd1", "V2": "#d1883a", "V3": "#3aa37a", "V4": "#9b59b6"}
LAB = {"V0": "V0 defaults", "V1": "V1 tight tolerances", "V2": "V2 robust Newton", "V3": "V3 Casadi safe, tight",
       "V4": "V4 mesh doubled"}
GROUPS = (("stop", "Early stops", "Mohtat2020: 6 designs", "all rescued score within 0.3% of DFN"),
          ("fail", "Outright failures", "NCA_Kim2011 49, OKane2022 12", "none rescued with a usable score"))
SETCOL = {"Mohtat2020": "#3aa37a", "NCA_Kim2011": "#d1883a", "OKane2022": "#5b8fd1"}


def main():
    W, left, right, bar, gap = 760, 230, 170, 17, 22
    plot = W - left - right
    o = []
    y = 70
    for g, name, sub, note in GROUPS:
        e = S["groups"][g]
        o.append(f'<text x="12" y="{y + 1.6 * bar}">{name}</text><text class="s" x="12" y="{y + 1.6 * bar + 15}">{sub}</text>'
                 f'<text class="s" x="12" y="{y + 1.6 * bar + 30}">{note}</text>')
        for v in COL:
            ok = e["variants"][v]["ok"]
            share = ok / e["n"] if e["n"] else 0
            w = max(1.0, share * plot)
            o.append(f'<rect x="{left}" y="{y}" width="{w:.1f}" height="{bar - 2}" fill="{COL[v]}"/>'
                     f'<text class="s" x="{left + w + 4:.1f}" y="{y + bar - 3}">{ok} of {e["n"]}</text>')
            y += bar
        y += gap
    for t in (0, 0.5, 1.0):
        x = left + t * plot
        o.append(f'<line x1="{x:.1f}" y1="66" x2="{x:.1f}" y2="{y - gap + 2}" stroke="#ccc" stroke-dasharray="2,3"/>'
                 f'<text class="s" x="{x - 10:.1f}" y="{y + 6}">{t:.0%}</text>')
    o.append(f'<text class="s" x="{left}" y="{y + 22}">share reaching all 100 cycles</text>')
    # strip: first-discharge min c_e / c_e0
    y0 = y + 60
    lo, hi = -0.2, 1.0
    X = lambda v: left + (v - lo) / (hi - lo) * plot
    o.append(f'<text x="12" y="{y0 - 18}" style="font-weight:600">First discharge: SPMe\'s lowest salt concentration / initial</text>')
    rowy = {}
    for k, s in enumerate(SETCOL):
        rowy[s] = y0 + 10 + k * 22
        o.append(f'<text class="s" x="12" y="{rowy[s] + 4}">{s}</text>')
    for r in C["failing"]:
        d = D.get((r["bench"], r["set"], r["j"]), {})
        if d.get("ce1_min_ratio") is None:
            continue
        v = max(lo, min(hi, d["ce1_min_ratio"]))
        o.append(f'<circle cx="{X(v):.1f}" cy="{rowy[r["set"]] + ((r["j"] % 5) - 2) * 2:.1f}" r="3" fill="{SETCOL[r["set"]]}" fill-opacity="0.7"/>')
    yb = y0 + 10 + 3 * 22
    for t in (-0.2, 0, 0.5, 1.0):
        o.append(f'<line x1="{X(t):.1f}" y1="{y0}" x2="{X(t):.1f}" y2="{yb - 8}" stroke="{"#c33" if t == 0 else "#ccc"}" stroke-dasharray="2,3"/>'
                 f'<text class="s" x="{X(t) - 10:.1f}" y="{yb + 6}">{t:g}</text>')
    o.append(f'<text class="s" x="{X(0) + 4:.1f}" y="{y0 + 2}">zero: below it SPMe has left its domain</text>')
    H = yb + 24
    head = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" '
            f'aria-label="Bar chart of SPMe stopped and failed runs reaching 100 cycles under five solver variants, and a '
            f'strip of each design\'s first-discharge minimum salt ratio">',
            '<style>text{font:12px system-ui,sans-serif;fill:#222}.s{font-size:11px;fill:#555}'
            '@media (prefers-color-scheme:dark){text{fill:#ddd}.s{fill:#aaa}rect.bg{fill:#111}line{stroke:#555}}</style>',
            f'<rect class="bg" width="{W}" height="{H}" fill="#fff"/>',
            '<text x="12" y="22" style="font-weight:600">Re-solving SPMe\'s failed runs: which solver settings finish them?</text>']
    for i, v in enumerate(COL):
        x, yy = 12 + (i % 3) * 245, 40 + (i // 3) * 16
        head.append(f'<rect x="{x}" y="{yy - 9}" width="10" height="10" fill="{COL[v]}"/><text class="s" x="{x + 14}" y="{yy}">{LAB[v]}</text>')
    (HERE / "solver.svg").write_text("\n".join(head + o + ["</svg>"]) + "\n")
    print("wrote", HERE / "solver.svg")


if __name__ == "__main__":
    main()
