"""Read results.json (run.py) and data/accuracy.json (copied from accel-kws); write fit.txt: area by hidden width,
and the most accurate model that fits a budget of N tile-equivalents at 100, 70 and 50 % utilisation."""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
TILE_UM2 = 161 * 112          # one 1x1 SKY130 tile, from the Tiny Tapeout guide (see README); not checked against tile_sizes.yaml
UTILS = (1.0, 0.7, 0.5)
TILES = (1, 2, 3, 4, 6, 8)
FLOP_UM2 = 20.02              # sky130_fd_sc_hd__dfxtp_1 area in the liberty file used by run.py


def main():
    res = json.loads((HERE / "results.json").read_text())["rows"]
    acc = {(r["inputs"], r["hidden"], r["wbits"]): r for r in json.loads((HERE.parent / "data" / "accuracy.json").read_text())["rows"]}
    area = {(r["inputs"], r["hidden"], r["wbits"]): r for r in res}
    out = [f"1x1 tile = {TILE_UM2} um2 ({161}x{112}); flop = {FLOP_UM2} um2", "",
           "== area by hidden width, inputs=70 (um2)", "H wb2 wb3 wb4 wb8"]
    for H in (8, 16, 32, 64):
        out.append(f"{H} " + " ".join(f"{area[(70, H, wb)]['area_um2']:.0f}" for wb in (2, 3, 4, 8)))
    out += ["", "== flops share of area, inputs=70, wb=4 (%)", "H share"]
    for H in (8, 16, 32, 64):
        r = area[(70, H, 4)]
        out.append(f"{H} {100 * r['flops'] * FLOP_UM2 / r['area_um2']:.1f}")
    out += ["", "== tile-equivalents needed (area / (tile x utilisation)), inputs=70, wb=4", "H u100 u70 u50"]
    for H in (8, 16, 32, 64):
        a = area[(70, H, 4)]["area_um2"]
        out.append(f"{H} " + " ".join(f"{a / (TILE_UM2 * u):.2f}" for u in UTILS))
    for u in UTILS:
        out += ["", f"== most accurate fit at utilisation {u:.0%}: tiles, inputs, H, wb, area um2, test acc", ]
        for n in TILES:
            ok = [(acc[k]["test_mean"], k) for k in area if k in acc and area[k]["area_um2"] <= n * TILE_UM2 * u]
            if not ok:
                out.append(f"{n} none")
                continue
            a, k = max(ok)
            out.append(f"{n} {k[0]} {k[1]} {k[2]} {area[k]['area_um2']:.0f} {a:.3f} (sd {acc[k]['test_std']:.3f})")
    (HERE / "fit.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
