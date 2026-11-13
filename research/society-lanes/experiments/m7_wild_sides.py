"""Milestone 7: passing side in head-on encounters, in the wild and in the lab.

Scenes: ETH and Hotel (Zurich, Pellegrini et al. 2009), Zara01 and Zara02
(Nicosia, Lerner et al. 2007), and the 24 HERMES 2D corridor runs (Juelich,
2009) as a method check. Files come from the OpenTraj mirror (Amirian et al.
2020) at a pinned commit; they are cached in data_cache/ (gitignored) and not
redistributed. Writes m7_wild_sides_results.txt and m7_wild_sides.svg.
Stdlib only, about a minute.

    python3 research/society-lanes/experiments/m7_wild_sides.py
"""
from __future__ import annotations

import hashlib
import math
import os
import random
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import encounters as E  # noqa: E402

COMMIT = "97ec1d5e1b579f26febeaa9083705952deac338a"
RAW = f"https://raw.githubusercontent.com/crowdbotp/OpenTraj/{COMMIT}/datasets/"
CACHE = os.environ.get("SOCIETY_LANES_CACHE", os.path.join(HERE, "data_cache"))
SEED = 20261113
N_BOOT = 2000
BLOCK_S = 60.0

# scene -> (city, dir, homography file, seconds per video frame, image rows, cols)
# Frame rates from each sequence's info.txt (annotation every 0.4 s: every 6th
# frame in seq_eth, every 10th in the others). Zara02's obsmat matches its
# H-old.txt, not H.txt (checked by projecting tracks onto video frames).
WILD = {
    "ETH": ("Zurich", "ETH/seq_eth", "H.txt", 0.4 / 6, 480, 640),
    "Hotel": ("Zurich", "ETH/seq_hotel", "H.txt", 0.4 / 10, 576, 720),
    "Zara01": ("Nicosia", "UCY/zara01", "H.txt", 0.4 / 10, 576, 720),
    "Zara02": ("Nicosia", "UCY/zara02", "H-old.txt", 0.4 / 10, 576, 720),
}
HERMES = [
    "bo-360-050-050", "bo-360-075-075", "bo-360-090-090", "bo-360-120-120", "bo-360-160-160",
    "bot-300-050-050", "bot-300-065-065", "bot-300-075-075", "bot-300-085-085", "bot-300-100-100",
    "bot-360-050-050", "bot-360-075-075", "bot-360-090-090", "bot-360-120-120",
    "bot-360-160-160", "bot-360-200-200", "bot-360-250-250",
    "boa-300-050-070", "boa-300-050-085", "boa-300-055-095", "boa-300-065-105", "boa-300-080-120",
    "boa-300-frei",
]
HERMES_FPS = 16
HERMES_STEP = 4  # sample every 0.25 s; velocity by central difference over +-4 frames
HASHES = []


def fetch(rel):
    path = os.path.join(CACHE, rel.replace("/", "__"))
    if not os.path.exists(path):
        os.makedirs(CACHE, exist_ok=True)
        with urllib.request.urlopen(RAW + rel, timeout=120) as r:
            data = r.read()
        with open(path, "wb") as f:
            f.write(data)
    with open(path, "rb") as f:
        data = f.read()
    HASHES.append(f"{rel} sha256 {hashlib.sha256(data).hexdigest()[:16]}")
    return data.decode("utf-8", "replace")


def load_wild(name):
    city, d, hf, dt, rows, cols = WILD[name]
    h = [[float(v) for v in l.split()] for l in fetch(f"{d}/{hf}").splitlines() if l.strip()]
    hand = E.world_handedness(h, rows / 2, cols / 2)
    tracks = {}
    for line in fetch(f"{d}/obsmat.txt").splitlines():
        c = line.split()
        if len(c) < 8:
            continue
        f, pid = int(float(c[0])), int(float(c[1]))
        tracks.setdefault(pid, []).append((f * dt, float(c[2]), float(c[4]), float(c[5]), float(c[7])))
    groups = [[int(float(v)) for v in l.split()] for l in fetch(f"{d}/groups.txt").splitlines() if l.strip()]
    return city, tracks, groups, hand


def load_hermes(run):
    width = 3.0 if "-300-" in run else 3.6
    pts = {}
    for line in fetch(f"HERMES/Corridor-2D/{run}.txt").splitlines():
        c = line.split()
        if len(c) < 4 or c[0].startswith("#"):
            continue
        pts.setdefault(int(float(c[0])), {})[int(float(c[1]))] = (float(c[2]) / 100, float(c[3]) / 100)
    tracks = {}
    k = HERMES_STEP
    for pid, fr in pts.items():
        out = []
        for f in sorted(fr):
            if f % k:
                continue
            x, y = fr[f]
            if not (0 <= x <= width and -4 <= y <= 4):
                continue
            if f - k in fr and f + k in fr:
                vx = (fr[f + k][0] - fr[f - k][0]) / (2 * k / HERMES_FPS)
                vy = (fr[f + k][1] - fr[f - k][1]) / (2 * k / HERMES_FPS)
                out.append((f / HERMES_FPS, x, y, vx, vy))
        if out:
            tracks[pid] = out
    return tracks


def fmt(cl, seed):
    r = sum(a for a, _ in cl)
    n = sum(b for _, b in cl)
    lo, hi = E.boot_ci(cl, N_BOOT, seed)
    return r, n, (r / n if n else float("nan")), lo, hi


def diff_ci(a, b, seed):
    rng = random.Random(seed)
    sa = E.boot_share(a, N_BOOT, rng)
    sb = E.boot_share(b, N_BOOT, rng)
    return E.ci([x - y for x, y in zip(sa, sb)])


def write_svg(bars):
    W, H, l, r, t, b = 720, 360, 200, 40, 40, 50
    X = lambda v: l + v * (W - l - r)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{l}" y="22" font-size="13">Share of head-on encounters in which both walkers kept right (95% CI)</text>']
    for v in (0, 0.25, 0.5, 0.75, 1.0):
        style = 'stroke="#555" stroke-dasharray="4 3"' if v == 0.5 else 'stroke="#ddd"'
        o.append(f'<line x1="{X(v):.1f}" x2="{X(v):.1f}" y1="{t}" y2="{H - b}" {style}/>')
        o.append(f'<text x="{X(v):.1f}" y="{H - b + 16}" text-anchor="middle">{v:.2f}</text>')
    o.append(f'<text x="{(l + W - r) / 2}" y="{H - 12}" text-anchor="middle">share kept right (0.5 = no convention; below 0.5 = keep left)</text>')
    step = (H - t - b) / len(bars)
    for i, (label, colr, n, s, lo, hi) in enumerate(bars):
        y = t + step * (i + 0.5)
        o.append(f'<text x="{l - 8}" y="{y + 4:.1f}" text-anchor="end">{label} (n={n})</text>')
        o.append(f'<line x1="{X(lo):.1f}" x2="{X(hi):.1f}" y1="{y:.1f}" y2="{y:.1f}" stroke="{colr}" stroke-width="2"/>')
        o.append(f'<circle cx="{X(s):.1f}" cy="{y:.1f}" r="5" fill="{colr}"/>')
    o.append("</svg>")
    with open(os.path.join(HERE, "m7_wild_sides.svg"), "w") as f:
        f.write("\n".join(o) + "\n")


def run_all(max_dist=2.0, angle=135.0):
    res = {}
    for name in WILD:
        city, tracks, groups, hand = load_wild(name)
        enc = E.encounters(tracks, groups, max_dist=max_dist, min_angle_deg=angle, hand=hand)
        res[name] = (city, hand, enc)
    herm = {}
    for run in HERMES:
        enc = E.encounters(load_hermes(run), None, max_dist=max_dist, min_angle_deg=angle, hand=1)
        herm[run] = enc
    return res, herm


def main():
    out = []
    P = out.append
    P("Milestone 7: passing side in head-on encounters (ETH/Hotel Zurich, Zara Nicosia, HERMES corridor)")
    P(f"OpenTraj commit {COMMIT}; seed {SEED}; bootstrap {N_BOOT}; wild blocks {BLOCK_S:.0f} s, HERMES clusters = runs")
    P("Encounter: not in the same group, both > 0.3 m/s, headings > 135 deg apart at closest approach,"
      " closest approach < 2.0 m and strictly inside the shared window.")
    P("")
    res, herm = run_all()
    P("Per scene (kept right / kept left / views disagree; share kept right among decided, 95% block bootstrap):")
    clusters = {}
    for name, (city, hand, enc) in res.items():
        r, lft, z, s = E.share_right(enc)
        cl = E.blocks(enc, BLOCK_S)
        clusters[name] = cl
        _, _, _, lo, hi = fmt(cl, SEED)
        P(f"  {name:<7} {city:<8} world frame {'right' if hand > 0 else 'left'}-handed  {r:>3} / {lft:>3} / {z:>2}"
          f"  share {s:.3f} [{lo:.3f}, {hi:.3f}]  ({len(cl)} blocks)")
    hcl = {"free": [], "assigned": []}
    P("")
    P("HERMES runs (method check; frame assumed right-handed with z up, as in milestone 1):")
    for run, enc in herm.items():
        r, lft, z, s = E.share_right(enc)
        key = "free" if run.startswith("bo-") else "assigned"
        hcl[key].append((r, r + lft))
        P(f"  {run:<16} {r:>4} / {lft:>4} / {z:>3}  share {s:.3f}")
    P("")
    zur = clusters["ETH"] + clusters["Hotel"]
    nic = clusters["Zara01"] + clusters["Zara02"]
    pooled = {}
    for label, cl, sd in [("Zurich (ETH + Hotel)", zur, SEED + 1), ("Nicosia (Zara01 + Zara02)", nic, SEED + 2),
                          ("HERMES free choice", hcl["free"], SEED + 3), ("HERMES exit assigned", hcl["assigned"], SEED + 4)]:
        pooled[label] = fmt(cl, sd)
        r, n, s, lo, hi = pooled[label]
        P(f"Pooled {label}: {r}/{n} kept right = {s:.3f}, 95% CI [{lo:.3f}, {hi:.3f}]")
    dlo, dhi = diff_ci(zur, nic, SEED + 5)
    dz = pooled["Zurich (ETH + Hotel)"][2] - pooled["Nicosia (Zara01 + Zara02)"][2]
    P(f"Zurich minus Nicosia: {dz:+.3f}, 95% CI [{dlo:+.3f}, {dhi:+.3f}]")
    P("")
    hf = pooled["HERMES free choice"]
    ha = pooled["HERMES exit assigned"]
    zr = pooled["Zurich (ETH + Hotel)"]
    nc = pooled["Nicosia (Zara01 + Zara02)"]
    w0 = hf[2] >= 0.85 and 0.40 <= ha[2] <= 0.65
    P(f"W0 (HERMES free >= 0.85 and assigned in 0.40..0.65): {'held' if w0 else 'refuted'} ({hf[2]:.3f}, {ha[2]:.3f})")
    P(f"W1 (Zurich > 0.5, CI excludes 0.5): {'held' if zr[3] > 0.5 else 'refuted'} ({zr[2]:.3f} [{zr[3]:.3f}, {zr[4]:.3f}])")
    P(f"W2 (Nicosia below Zurich, difference CI excludes 0): {'held' if dlo > 0 else 'refuted'} ({dz:+.3f} [{dlo:+.3f}, {dhi:+.3f}])")
    P(f"W3 (Nicosia < 0.5, CI excludes 0.5): {'held' if nc[4] < 0.5 else 'refuted'} ({nc[2]:.3f} [{nc[3]:.3f}, {nc[4]:.3f}])")
    P(f"W4 (Zurich below HERMES free choice): {'held' if zr[2] < hf[2] else 'refuted'} ({zr[2]:.3f} vs {hf[2]:.3f})")
    P("")
    P("Sensitivity (pooled share kept right, n decided):")
    for md, ang in [(1.5, 135.0), (3.0, 135.0), (2.0, 150.0)]:
        r2, h2 = run_all(md, ang)
        parts = []
        for label, names in [("Zurich", ("ETH", "Hotel")), ("Nicosia", ("Zara01", "Zara02"))]:
            cl = sum((E.blocks(r2[nm][2], BLOCK_S) for nm in names), [])
            a, n, s, lo, hi = fmt(cl, SEED)
            parts.append(f"{label} {s:.3f} [{lo:.3f}, {hi:.3f}] n={n}")
        hfree = [E.share_right(e) for k, e in h2.items() if k.startswith("bo-")]
        rr = sum(x[0] for x in hfree)
        nn = sum(x[0] + x[1] for x in hfree)
        parts.append(f"HERMES free {rr / nn:.3f} n={nn}")
        P(f"  closest < {md} m, heading gap > {ang:.0f} deg: " + "; ".join(parts))
    P("")
    P("Files read:")
    for h in sorted(set(HASHES)):
        P("  " + h)
    write_svg([
        ("HERMES, free exit", "#1b6ca8", hf[1], hf[2], hf[3], hf[4]),
        ("HERMES, exit assigned", "#7fb3d5", ha[1], ha[2], ha[3], ha[4]),
        ("Zurich (ETH, Hotel)", "#c0392b", zr[1], zr[2], zr[3], zr[4]),
        ("Nicosia (Zara01, 02)", "#7d8a2e", nc[1], nc[2], nc[3], nc[4]),
    ])
    with open(os.path.join(HERE, "m7_wild_sides_results.txt"), "w") as f:
        f.write("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
