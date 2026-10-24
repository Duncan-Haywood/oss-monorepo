"""Fit accel-ttfit's keyword-spotting engine areas into Tiny Tapeout's real SKY130 tile sizes.
Inputs (copied, tests check they equal the originals): data/tile_sizes.yaml, data/ttfit_results.json (areas),
data/ttretrain_results.json (accuracy of the retrained models). Stdlib only. Writes results.json and results.txt."""
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE.parent / "data"
UTILS = (1.0, 0.7, 0.5)
ASSUMED_UM2 = 161 * 112   # accel-ttfit's tile, from a search snippet


def tiles():
    out = {}
    for line in (DATA / "tile_sizes.yaml").read_text().splitlines():
        m = re.match(r'(\d+x\d+): "0 0 ([\d.]+) ([\d.]+)"', line.strip())
        if m:
            out[m.group(1)] = (float(m.group(2)), float(m.group(3)), float(m.group(2)) * float(m.group(3)))
    return out


def load():
    area = {(r["inputs"], r["hidden"], r["wbits"]): r["area_um2"]
            for r in json.loads((DATA / "ttfit_results.json").read_text())["rows"]}
    acc = {}
    for r in json.loads((DATA / "ttretrain_results.json").read_text())["rows"]:
        a = [s["acc_tile"] for s in r["seeds"]]
        acc[(r["inputs"], r["hidden"], r["wbits"])] = sum(a) / len(a)
    return area, acc


def best_fit(area, acc, limit):
    ok = [(acc[k], k) for k in area if k in acc and area[k] <= limit]
    return max(ok) if ok else None


def main():
    T = tiles()
    area, acc = load()
    real1 = T["1x1"][2]
    out = [f"1x1 tile: real {T['1x1'][0]} x {T['1x1'][1]} = {real1:.1f} um2; accel-ttfit assumed {ASSUMED_UM2} "
           f"({100 * (ASSUMED_UM2 / real1 - 1):+.2f}%)", "",
           "== tile sizes (um2) and multiple of a 1x1"]
    for n, (w, h, a) in T.items():
        out.append(f"{n} {w}x{h} {a:.0f} {a / real1:.2f}")
    rows = []
    for u in UTILS:
        out += ["", f"== most accurate retrained model that fits each tile at {u:.0%} utilisation: tile, area limit, in, H, wb, area, acc"]
        for n, (w, h, a) in T.items():
            b = best_fit(area, acc, a * u)
            if b is None:
                out.append(f"{n} {a * u:.0f} none")
                rows.append({"tile": n, "util": u, "limit_um2": a * u, "fit": None})
                continue
            k = b[1]
            out.append(f"{n} {a * u:.0f} {k[0]} {k[1]} {k[2]} {area[k]:.0f} {b[0]:.3f}")
            rows.append({"tile": n, "util": u, "limit_um2": a * u, "fit": {"inputs": k[0], "hidden": k[1], "wbits": k[2], "area_um2": area[k], "acc": b[0]}})
    out += ["", "== smallest tile that holds each (in=120, wb) model, by utilisation: H wb area | u100 u70 u50"]
    for H in (8, 16, 32, 64):
        for wb in (2, 3, 4, 8):
            a = area[(120, H, wb)]
            cells = []
            for u in UTILS:
                ok = [n for n, t in T.items() if t[2] * u >= a]
                cells.append(min(ok, key=lambda n: T[n][2]) if ok else "none")
            out.append(f"{H} {wb} {a:.0f} | " + " ".join(cells))
    # does the real table change the accel-ttfit conclusions? (its 1-tile answers at 100/70/50 %)
    out += ["", "== one 1x1 tile, assumed area vs real area, best retrained accuracy"]
    for u in UTILS:
        o, n = best_fit(area, acc, ASSUMED_UM2 * u), best_fit(area, acc, real1 * u)
        out.append(f"u{u:.0%} assumed {o[1]} {o[0]:.3f} | real {n[1]} {n[0]:.3f} | same model: {o[1] == n[1]}")
    (HERE / "results.json").write_text(json.dumps({"rows": rows, "tiles": T}, indent=1))
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
