"""Milestone 1: side preference and lane order in the HERMES bidirectional corridor runs.

Fetches the trajectory archives from the Forschungszentrum Juelich pedestrian
data archive (not redistributed here), then writes m1_hermes_sides_results.txt
and m1_hermes_sides_runs.csv next to this file. Stdlib only, about a minute.

    python3 research/society-lanes/experiments/m1_hermes_sides.py
"""
from __future__ import annotations

import hashlib
import io
import json
import os
import random
import sys
import urllib.request
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import lanes as L  # noqa: E402

BASE = "https://ped.fz-juelich.de/experiments/2009.05.12_Duesseldorf_Messe_Hermes/data/zip/"
SETS = {  # set -> (DOI, archive)
    "free": ("10.34735/ped.2009.12", "2009bidirectional_free"),
    "symmetric": ("10.34735/ped.2009.11", "2009bidirectional_symmetric"),
    "asymmetric": ("10.34735/ped.2009.10", "2009bidirectional_asymmetric"),
}
CACHE = os.environ.get("SOCIETY_LANES_CACHE", os.path.join(HERE, "data_cache"))
FPS = 16  # metadata and archive table: 16 frames per second
SEED = 20261113
N_BOOT = 2000
N_SHUFFLE = 100
FRAME_STEP = 8  # lane order every 0.5 s


def fetch(name):
    os.makedirs(CACHE, exist_ok=True)
    out = {}
    for suffix in ("_trajectories_txt.zip", "_metadata.json"):
        path = os.path.join(CACHE, name + suffix)
        if not os.path.exists(path):
            with urllib.request.urlopen(BASE + name + suffix, timeout=120) as r:
                data = r.read()
            with open(path, "wb") as f:
                f.write(data)
        with open(path, "rb") as f:
            out[suffix] = f.read()
    return out


def write_svg(rows):
    """Share on own right per run against entrance width, one colour per set."""
    W, H, l, r, t, b = 720, 380, 64, 210, 36, 52
    x0, x1, y0, y1 = 0.4, 2.6, 0.3, 1.0
    X = lambda v: l + (v - x0) / (x1 - x0) * (W - l - r)
    Y = lambda v: H - b - (v - y0) / (y1 - y0) * (H - t - b)
    col = {"free": "#1b6ca8", "symmetric": "#c0392b", "asymmetric": "#7d8a2e"}
    lab = {"free": "free choice of exit", "symmetric": "exit assigned, equal flows",
           "asymmetric": "exit assigned, unequal flows"}
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{l}" y="20" font-size="13">Share of walkers on their own right, HERMES bidirectional runs (FZJ 2009)</text>']
    for v in (0.3, 0.5, 0.7, 0.9, 1.0):
        o.append(f'<line x1="{l}" x2="{W - r}" y1="{Y(v):.1f}" y2="{Y(v):.1f}" stroke="#ddd"/>')
        o.append(f'<text x="{l - 8}" y="{Y(v) + 4:.1f}" text-anchor="end">{v:.1f}</text>')
    for v in (0.5, 1.0, 1.5, 2.0, 2.5):
        o.append(f'<text x="{X(v):.1f}" y="{H - b + 18}" text-anchor="middle">{v:.1f}</text>')
    o.append(f'<line x1="{l}" x2="{W - r}" y1="{Y(0.5):.1f}" y2="{Y(0.5):.1f}" stroke="#555" stroke-dasharray="4 3"/>')
    o.append(f'<text x="{(l + W - r) / 2}" y="{H - 10}" text-anchor="middle">entrance width (m), a proxy for density</text>')
    o.append(f'<text transform="translate(16 {(t + H - b) / 2}) rotate(-90)" text-anchor="middle">share on own right (95% CI)</text>')
    for row in rows:
        c = row.split(",")
        if c[1] == "boa-300-frei":
            continue
        e = (float(c[3]) + float(c[4])) / 2
        k = c[0]
        o.append(f'<line x1="{X(e):.1f}" x2="{X(e):.1f}" y1="{Y(float(c[8])):.1f}" y2="{Y(float(c[9])):.1f}" stroke="{col[k]}"/>')
        shape = (f'<circle cx="{X(e):.1f}" cy="{Y(float(c[7])):.1f}" r="4.5" fill="{col[k]}"/>' if c[2] == "3.6"
                 else f'<rect x="{X(e) - 4:.1f}" y="{Y(float(c[7])) - 4:.1f}" width="8" height="8" fill="{col[k]}"/>')
        o.append(shape)
    for i, k in enumerate(col):
        yy = t + 20 + i * 20
        o.append(f'<circle cx="{W - r + 14}" cy="{yy}" r="4.5" fill="{col[k]}"/><text x="{W - r + 24}" y="{yy + 4}" font-size="10.5">{lab[k]}</text>')
    o.append(f'<text x="{W - r + 10}" y="{t + 94}" font-size="10.5">circle: 3.6 m corridor</text>')
    o.append(f'<text x="{W - r + 10}" y="{t + 110}" font-size="10.5">square: 3.0 m corridor</text>')
    o.append("</svg>")
    with open(os.path.join(HERE, "m1_hermes_sides.svg"), "w") as f:
        f.write("\n".join(o) + "\n")


def main():
    rng = random.Random(SEED)
    lines_out = []
    rows_csv = ["set,run,corridor_m,entrance1_m,entrance2_m,participants,walkers,"
                "share_right,ci_lo,ci_hi,mean_offset_up,mean_offset_down,n_up,n_down,"
                "lane_frames,lane_order,lane_null_mean,lane_null_p975,median_speed_ms"]
    hashes = []
    per_set_flags = {k: [] for k in SETS}
    free_pairs = []
    frei_speed = None
    lane_excess = []
    for key, (doi, name) in SETS.items():
        blobs = fetch(name)
        hashes.append(f"{name}_trajectories_txt.zip sha256 {hashlib.sha256(blobs['_trajectories_txt.zip']).hexdigest()}")
        meta = json.loads(blobs["_metadata.json"])["experiment"]
        runs = {r["run_name"]: r for r in meta["run"]}
        zf = zipfile.ZipFile(io.BytesIO(blobs["_trajectories_txt.zip"]))
        for fn in sorted(zf.namelist()):
            run = os.path.splitext(os.path.basename(fn))[0]
            if not run:
                continue
            m = runs[run]
            par = m.get("parameter", {})
            width_m = float(par.get("corridor_width [m]"))
            e1 = par.get("entrance_width_1 [m]", par.get("entrance_1_width [m]"))
            e2 = par.get("entrance_width_2 [m]", par.get("entrance_2_width [m]"))
            text = io.TextIOWrapper(zf.open(fn), encoding="utf-8", errors="replace")
            ws = L.walkers(L.parse_trajectories(text), width_m * 100.0)
            offs = {pid: L.mean_right_offset(d, s, width_m * 100.0) for pid, (d, s) in ws.items()}
            flags = [1 if o > 0 else 0 for o in offs.values()]
            share = sum(flags) / len(flags)
            lo, hi = L.bootstrap_share(flags, N_BOOT, rng)
            up = [offs[p] for p, (d, _) in ws.items() if d > 0]
            dn = [offs[p] for p, (d, _) in ws.items() if d < 0]
            frames = L.frames_by_time(ws, step=FRAME_STEP)
            if len(frames) >= 10:
                lo_ord = L.lane_order(frames)
                null = L.lane_order_null(frames, N_SHUFFLE, rng)
                nm, n975 = sum(null) / len(null), L.quantile(null, 0.975)
                lane_excess.append((key, run, lo_ord, nm, n975))
            else:
                lo_ord = nm = n975 = float("nan")
            speeds = L.walker_speeds(ws, FPS, FPS)
            msp = L.median(speeds)
            if run == "boa-300-frei":
                frei_speed = msp
            per_set_flags[key].append(flags)
            if key == "free":
                free_pairs.append((float(e1), share))
            mu = lambda v: sum(v) / len(v) if v else float("nan")
            rows_csv.append(
                f"{key},{run},{width_m},{e1},{e2},{m['number_participants']},{len(ws)},"
                f"{share:.4f},{lo:.4f},{hi:.4f},{mu(up):.4f},{mu(dn):.4f},{len(up)},{len(dn)},"
                f"{len(frames)},{lo_ord:.4f},{nm:.4f},{n975:.4f},{msp:.3f}")

    with open(os.path.join(HERE, "m1_hermes_sides_runs.csv"), "w") as f:
        f.write("\n".join(rows_csv) + "\n")

    P = lines_out.append
    P("Milestone 1: side preference and lane order, HERMES bidirectional corridor (FZJ, 2009)")
    P(f"seed {SEED}, bootstrap {N_BOOT}, label shuffles {N_SHUFFLE}, lane order every {FRAME_STEP} frames at {FPS} fps, 30 cm bins")
    P("")
    P("Archives read:")
    for h in hashes:
        P("  " + h)
    P("")
    P("Per run (share of walkers whose mean offset is on their own right; 95% bootstrap over walkers):")
    for r in rows_csv[1:]:
        c = r.split(",")
        P(f"  {c[0]:<10} {c[1]:<18} W={c[2]} m  walkers {c[6]:>3}  right {float(c[7]):.3f} [{float(c[8]):.3f}, {float(c[9]):.3f}]"
          f"  offset up {float(c[10]):+.3f} down {float(c[11]):+.3f}  lane {c[15]} null {c[16]} (p97.5 {c[17]})  speed {c[18]} m/s")
    P("")
    pooled = {}
    for key in SETS:
        g = per_set_flags[key]
        tot = sum(sum(x) for x in g)
        n = sum(len(x) for x in g)
        lo, hi = L.bootstrap_share_clustered(g, N_BOOT, rng)
        pooled[key] = (tot / n, lo, hi)
        P(f"Pooled {key}: {tot}/{n} on own right = {tot / n:.3f}, 95% two-stage bootstrap [{lo:.3f}, {hi:.3f}] ({len(g)} runs)")
    P("")
    share, lo, hi = pooled["free"]
    P(f"L1 (free share > 0.5 and interval excludes 0.5): {'held' if share > 0.5 and lo > 0.5 else 'refuted'} ({share:.3f} [{lo:.3f}, {hi:.3f}])")
    P(f"L2 (free share >= 0.65): {'held' if share >= 0.65 else 'refuted'} ({share:.3f})")
    measurable = [e for e in lane_excess]
    above = [e for e in measurable if e[2] > e[4]]
    P(f"L3 (lane order above shuffled p97.5 in every measurable run): {'held' if len(above) == len(measurable) else 'refuted'} "
      f"({len(above)} of {len(measurable)} measurable runs)")
    rho = L.spearman([p[0] for p in free_pairs], [p[1] for p in free_pairs])
    P(f"L4 (Spearman entrance width vs right share, free runs, not negative): {'held' if rho >= 0 else 'refuted'} (rho = {rho:+.2f}, n = {len(free_pairs)})")
    ok = frei_speed is not None and 1.1 <= frei_speed <= 1.5
    P(f"L5 (median free speed in boa-300-frei within 1.1 to 1.5 m/s): {'held' if ok else 'refuted'} ({frei_speed:.3f} m/s)")
    write_svg(rows_csv[1:])
    with open(os.path.join(HERE, "m1_hermes_sides_results.txt"), "w") as f:
        f.write("\n".join(lines_out) + "\n")
    print("\n".join(lines_out))


if __name__ == "__main__":
    main()
