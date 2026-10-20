"""Write experiments/timestep_ladder.svg: where MuJoCo holds the cover against timestep, parsed from results.txt.

    python experiments/figure.py

Each row of the "timestep ladder" block is one (acceleration, solref) setting; a cell is green with the
MuJoCo/bound ratio when the part was held at that timestep and grey when it slipped. Numbers are parsed
from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
from pathlib import Path

HERE = Path(__file__).resolve().parent
LINES = (HERE / "results.txt").read_text().splitlines()


def ladder():
    i = next(k for k, l in enumerate(LINES) if l.startswith("timestep ladder"))
    dts = LINES[i].split("timestep ms")[1].split()
    rows = []
    for l in LINES[i + 1:]:
        if l.startswith(("a=", "a =")) and "|" in l:
            name, cells = l.split("|")
            rows.append((name.strip(), cells.split()))
        elif l.strip() and "effective" not in l:
            break
    return dts, rows


def main():
    dts, rows = ladder()
    W, L, T, cw, rh = 640, 150, 70, 56, 40
    H = T + rh * len(rows) + 60
    f = 'font-family="sans-serif"'
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Grid of timesteps against solref settings; MuJoCo holds the cover only in a window of timesteps, not at the smallest ones">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="22" text-anchor="middle" {f} font-size="14">Cover held by MuJoCo vs timestep (ratio to analytic bound)</text>',
         f'<text x="{W/2}" y="40" text-anchor="middle" {f} font-size="11">green = held, number = MuJoCo/bound; grey = not held</text>']
    for j, d in enumerate(dts):
        o.append(f'<text x="{L+j*cw+cw/2}" y="{T-8}" text-anchor="middle" {f} font-size="11">{d}</text>')
    o.append(f'<text x="{L+len(dts)*cw/2}" y="{H-14}" text-anchor="middle" {f} font-size="12">timestep (ms)</text>')
    for i, (name, cells) in enumerate(rows):
        y = T + i * rh
        o.append(f'<text x="{L-8}" y="{y+rh/2+4}" text-anchor="end" {f} font-size="11">{name}</text>')
        for j, c in enumerate(cells):
            held = c != "none"
            o.append(f'<rect x="{L+j*cw}" y="{y}" width="{cw-2}" height="{rh-2}" fill="{"#2e8b57" if held else "#e3e3e3"}"/>')
            if held:
                o.append(f'<text x="{L+j*cw+cw/2-1}" y="{y+rh/2+4}" text-anchor="middle" {f} font-size="11" fill="#fff">{c}</text>')
    o.append("</svg>")
    out = HERE / "timestep_ladder.svg"
    out.write_text("\n".join(o) + "\n")
    print("wrote", out)


if __name__ == "__main__":
    main()
