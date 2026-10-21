"""Join the new H >= 96 areas (synth.json) with the existing H <= 64 areas and the tile table; find the smallest
Tiny Tapeout tile that holds each model at 100/70/50% utilisation, and the best accuracy per tile with H = 128 added.
H = 128 accuracy is accel-kws's (data/kws_h128.json, 3 seeds, reference contract); H = 96, 192, 256 have no accuracy.
Stdlib only. Writes results.json and results.txt."""
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE.parent / "data"
UTILS = (1.0, 0.7, 0.5)


def tiles():
    out = {}
    for line in (DATA / "tile_sizes.yaml").read_text().splitlines():
        m = re.match(r'(\d+x\d+): "0 0 ([\d.]+) ([\d.]+)"', line.strip())
        if m:
            out[m.group(1)] = float(m.group(2)) * float(m.group(3))
    return out


def areas():
    a = {}
    for r in json.loads((DATA / "ttfit_results.json").read_text())["rows"]:
        a[(r["inputs"], r["hidden"], r["wbits"], 20)] = r["area_um2"]
    for r in json.loads((HERE / "synth.json").read_text())["rows"]:
        a[(r["inputs"], r["hidden"], r["wbits"], r["accw"])] = r["area_um2"]
    return a


def accuracy():
    acc = {}
    for r in json.loads((DATA / "ttretrain_results.json").read_text())["rows"]:
        s = [x["acc_tile"] for x in r["seeds"]]
        acc[(r["inputs"], r["hidden"], r["wbits"])] = sum(s) / len(s)
    for r in json.loads((DATA / "kws_h128.json").read_text()):
        acc[(r["inputs"], r["hidden"], r["wbits"])] = r["test_mean"]
    return acc


def smallest_tile(T, area, u):
    ok = [n for n, t in T.items() if t * u >= area]
    return min(ok, key=lambda n: T[n]) if ok else "none"


def main():
    T, A, acc = tiles(), areas(), accuracy()
    out = ["tile areas (um2): " + ", ".join(f"{n} {t:.0f}" for n, t in T.items()), "",
           "== area added by a 24-bit instead of 20-bit accumulator (um2, %), H >= 96"]
    for k in sorted(k for k in A if k[3] == 20 and k[1] >= 96):
        b = A[(*k[:3], 24)]
        out.append(f"in{k[0]} H{k[1]} wb{k[2]}: {A[k]:.0f} -> {b:.0f} ({100 * (b / A[k] - 1):+.1f}%)")
    out += ["", "== smallest tile (20-bit acc) for in=120: H wb area acc | u100 u70 u50"]
    rows = []
    for H in (64, 96, 128, 192, 256):
        for wb in (2, 3, 4, 8):
            a = A[(120, H, wb, 20)]
            cells = [smallest_tile(T, a, u) for u in UTILS]
            ac = acc.get((120, H, wb))
            out.append(f"{H} {wb} {a:.0f} {'-' if ac is None else format(ac, '.3f')} | " + " ".join(cells))
            rows.append(dict(hidden=H, wbits=wb, area_um2=a, acc=ac, tiles=dict(zip(("u100", "u70", "u50"), cells))))
    out += ["", "== most accurate model (H <= 128, in=120, 20-bit acc) that fits each tile: tile, util, H, wb, area, acc"]
    best = []
    for n, t in T.items():
        for u in UTILS:
            fit = [(acc[k[:3]], k) for k in A if k[3] == 20 and k[0] == 120 and k[:3] in acc and A[k] <= t * u]
            if fit:
                b = max(fit)
                out.append(f"{n} {u:.0%} {b[1][1]} {b[1][2]} {A[b[1]]:.0f} {b[0]:.3f}")
                best.append(dict(tile=n, util=u, hidden=b[1][1], wbits=b[1][2], area_um2=A[b[1]], acc=b[0]))
            else:
                out.append(f"{n} {u:.0%} none")
    (HERE / "results.json").write_text(json.dumps(dict(models=rows, best=best), indent=1))
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
