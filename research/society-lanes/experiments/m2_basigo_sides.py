"""Milestone 2: side preference and lane order in the BaSiGo 2013 bidirectional corridor.

Replicates milestone 1 (HERMES 2009) on an independent experiment by the same group:
variant A (no instruction about the lateral exits) against variant B (exit assigned by
wristband colour). Predictions B1 to B6 were written in LOG.md before this ran.

Data: FZJ pedestrian data archive, doi:10.34735/ped.2013.5 (CC BY 4.0), fetched by
script into experiments/data_cache/ (gitignored), not redistributed. Stdlib only.
Run: python3 experiments/m2_basigo_sides.py
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

BASE = ("https://ped.fz-juelich.de/experiments/2013.06.19_Duesseldorf_Messe_BaSiGo/"
        "data/2013bidirectional/2013bidirectional")
DOI = "10.34735/ped.2013.5"
CACHE = os.environ.get("SOCIETY_LANES_CACHE", os.path.join(HERE, "data_cache"))
FPS = 25  # archive table: trajectories at 25 fps
WIDTH_CM = 400.0  # corridor between walls at y = 0 and y = 4 m (WKT geometry)
SEED = 20261114
N_BOOT = 2000
N_SHUFFLE = 100
FRAME_STEP = 12  # lane order about every 0.5 s
HERMES_FREE_CI = (0.865, 0.993)  # milestone 1, free choice, two-stage bootstrap


def fetch():
    os.makedirs(CACHE, exist_ok=True)
    out = {}
    for suffix in ("_trajectories_txt.zip", "_metadata.json"):
        path = os.path.join(CACHE, "2013bidirectional" + suffix)
        if not os.path.exists(path):
            with urllib.request.urlopen(BASE + suffix, timeout=120) as r:
                data = r.read()
            with open(path, "wb") as f:
                f.write(data)
        with open(path, "rb") as f:
            out[suffix] = f.read()
    return out


def write_svg(rows):
    """Share on own right per run against start time; A blue, B red; hollow = guided entry."""
    W, H, l, r, t, b = 760, 380, 64, 230, 36, 52
    x0, x1, y0, y1 = 12 * 60 + 35, 13 * 60 + 57, 0.3, 1.0
    X = lambda v: l + (v - x0) / (x1 - x0) * (W - l - r)
    Y = lambda v: H - b - (v - y0) / (y1 - y0) * (H - t - b)
    col = {"A": "#1b6ca8", "B": "#c0392b"}
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{l}" y="20" font-size="13">Share of walkers on their own right, BaSiGo bidirectional corridor (FZJ 2013)</text>']
    for v in (0.3, 0.5, 0.7, 0.9, 1.0):
        o.append(f'<line x1="{l}" x2="{W - r}" y1="{Y(v):.1f}" y2="{Y(v):.1f}" stroke="#ddd"/>')
        o.append(f'<text x="{l - 8}" y="{Y(v) + 4:.1f}" text-anchor="end">{v:.1f}</text>')
    for hh, mm in ((12, 40), (13, 0), (13, 20), (13, 40)):
        v = hh * 60 + mm
        o.append(f'<text x="{X(v):.1f}" y="{H - b + 18}" text-anchor="middle">{hh}:{mm:02d}</text>')
    o.append(f'<line x1="{l}" x2="{W - r}" y1="{Y(0.5):.1f}" y2="{Y(0.5):.1f}" stroke="#555" stroke-dasharray="4 3"/>')
    o.append(f'<text x="{(l + W - r) / 2}" y="{H - 10}" text-anchor="middle">start time of run, 22 June 2013</text>')
    o.append(f'<text transform="translate(16 {(t + H - b) / 2}) rotate(-90)" text-anchor="middle">share on own right (95% CI)</text>')
    for row in rows:
        e = X(row["minute"])
        c = col[row["variant"]]
        o.append(f'<line x1="{e:.1f}" x2="{e:.1f}" y1="{Y(row["lo"]):.1f}" y2="{Y(row["hi"]):.1f}" stroke="{c}"/>')
        fill = "#fff" if row["guided"] else c
        o.append(f'<circle cx="{e:.1f}" cy="{Y(row["share"]):.1f}" r="4.5" fill="{fill}" stroke="{c}" stroke-width="1.5"/>')
    scr = [row for row in rows if row["screen"] == "given"]
    if scr:
        xs = X(min(row["minute"] for row in scr))
        o.append(f'<text x="{xs - 8:.1f}" y="{Y(0.955):.1f}" text-anchor="end" font-size="10.5">screen information given</text>')
    leg = [("A", "variant A: no exit instruction"), ("B", "variant B: exit by wristband")]
    for i, (k, s) in enumerate(leg):
        yy = t + 20 + i * 20
        o.append(f'<circle cx="{W - r + 14}" cy="{yy}" r="4.5" fill="{col[k]}"/><text x="{W - r + 24}" y="{yy + 4}" font-size="10.5">{s}</text>')
    o.append(f'<circle cx="{W - r + 14}" cy="{t + 60}" r="4.5" fill="#fff" stroke="#555" stroke-width="1.5"/>'
             f'<text x="{W - r + 24}" y="{t + 64}" font-size="10.5">hollow: guide split the entry</text>')
    o.append("</svg>")
    with open(os.path.join(HERE, "m2_basigo_sides.svg"), "w") as f:
        f.write("\n".join(o) + "\n")


def main():
    rng = random.Random(SEED)
    blobs = fetch()
    meta = json.loads(blobs["_metadata.json"])["experiment"]
    runs = {r["run_name"]: r for r in meta["run"]}
    zf = zipfile.ZipFile(io.BytesIO(blobs["_trajectories_txt.zip"]))
    rows = []
    for fn in sorted(zf.namelist()):
        run = os.path.splitext(os.path.basename(fn))[0]
        if not run:
            continue
        m = runs[run]
        par = m["parameter"]
        assert float(par["corridor width [m]"]) * 100 == WIDTH_CM
        variant = "A" if "_a_" in run else "B"
        guided = bool(m.get("notes")) and "guide" in m["notes"]
        hh, mm, _ = m["start_time"].split(":")
        text = io.TextIOWrapper(zf.open(fn), encoding="utf-8", errors="replace")
        raw = list(L.parse_trajectories(text))
        ws = L.walkers(L.rotate_x_corridor(raw, WIDTH_CM), WIDTH_CM)
        offs = {pid: L.mean_right_offset(d, s, WIDTH_CM) for pid, (d, s) in ws.items()}
        flags = [1 if o > 0 else 0 for o in offs.values()]
        share = sum(flags) / len(flags)
        lo, hi = L.bootstrap_share(flags, N_BOOT, rng)
        up = [offs[p] for p, (d, _) in ws.items() if d > 0]
        dn = [offs[p] for p, (d, _) in ws.items() if d < 0]
        frames = L.frames_by_time(ws, step=FRAME_STEP)
        if len(frames) >= 10:
            lane = L.lane_order(frames)
            null = L.lane_order_null(frames, N_SHUFFLE, rng)
            nm, n975 = sum(null) / len(null), L.quantile(null, 0.975)
        else:
            lane = nm = n975 = float("nan")
        speeds = L.walker_speeds(ws, FPS, FPS)
        mu = lambda v: sum(v) / len(v) if v else float("nan")
        rows.append(dict(run=run, variant=variant, guided=guided, minute=int(hh) * 60 + int(mm),
                         start=m["start_time"][:5], screen=par["screen information"],
                         length=par["corridor length [m]"], entrance=par["entrance width [m]"],
                         exit=par["exit width [m]"], walkers=len(ws), flags=flags, share=share,
                         lo=lo, hi=hi, up=mu(up), dn=mu(dn), n_up=len(up), n_dn=len(dn),
                         frames=len(frames), lane=lane, null=nm, n975=n975, speed=L.median(speeds)))

    # the z column: reported so a reader can see it carries no orientation information
    zf2 = io.TextIOWrapper(zf.open(sorted(zf.namelist())[0]), encoding="utf-8")
    zs = [float(s.split()[4]) for s in zf2 if s.strip() and not s.startswith("#") and len(s.split()) >= 5]
    rows.sort(key=lambda r: r["minute"])

    out = []
    P = out.append
    P("Milestone 2: side preference and lane order, BaSiGo bidirectional corridor (FZJ, 2013)")
    P(f"doi:{DOI}; seed {SEED}, bootstrap {N_BOOT}, label shuffles {N_SHUFFLE}, lane order every {FRAME_STEP} frames at {FPS} fps, 30 cm bins")
    P(f"section: middle 8 m (x = -4..4 m), corridor width {WIDTH_CM / 100:.1f} m; lateral = 4 m - y, so heading +x has the right at small y")
    P(f"2013bidirectional_trajectories_txt.zip sha256 {hashlib.sha256(blobs['_trajectories_txt.zip']).hexdigest()}")
    P(f"z column in {sorted(zf.namelist())[0]}: min {min(zs):.0f}, max {max(zs):.0f} cm (a fixed head height, so it says nothing about the frame's handedness)")
    P("")
    P("Per run, in start order (share of walkers whose mean offset is on their own right; 95% bootstrap over walkers):")
    for r in rows:
        P(f"  {r['run']:<17} {r['start']} {r['variant']}{' guided' if r['guided'] else '       '} screen={r['screen']:<5}"
          f" L={r['length']:>2} m entr={r['entrance']:>3} m exit={r['exit']} m  walkers {r['walkers']:>4}"
          f"  right {r['share']:.3f} [{r['lo']:.3f}, {r['hi']:.3f}]  offset +x {r['up']:+.3f} -x {r['dn']:+.3f}"
          f"  lane {r['lane']:.3f} null {r['null']:.3f} (p97.5 {r['n975']:.3f})  speed {r['speed']:.2f} m/s")
    P("")

    def pooled(sel, label):
        g = [r["flags"] for r in rows if sel(r)]
        tot, n = sum(sum(x) for x in g), sum(len(x) for x in g)
        lo, hi = L.bootstrap_share_clustered(g, N_BOOT, rng)
        P(f"Pooled {label}: {tot}/{n} on own right = {tot / n:.3f}, 95% two-stage bootstrap [{lo:.3f}, {hi:.3f}] ({len(g)} runs)")
        return g, tot / n, lo, hi

    gA, sA, loA, hiA = pooled(lambda r: r["variant"] == "A" and not r["guided"], "A, primary (no guide)")
    gB, sB, loB, hiB = pooled(lambda r: r["variant"] == "B" and not r["guided"], "B, primary (no guide)")
    pooled(lambda r: r["variant"] == "A", "A, all 5 runs")
    pooled(lambda r: r["variant"] == "B", "B, all 10 runs")
    pooled(lambda r: r["guided"], "guided runs (a_01, b_01..b_03)")
    pooled(lambda r: r["variant"] == "B" and r["screen"] == "given", "B with screen information (b_09, b_10)")
    dlo, dhi = L.bootstrap_diff_clustered(gA, gB, N_BOOT, rng)
    P(f"A - B (primary): {sA - sB:+.3f}, 95% [{dlo:+.3f}, {dhi:+.3f}]")
    gAall = [r["flags"] for r in rows if r["variant"] == "A"]
    gBall = [r["flags"] for r in rows if r["variant"] == "B"]
    sAall = sum(map(sum, gAall)) / sum(map(len, gAall))
    sBall = sum(map(sum, gBall)) / sum(map(len, gBall))
    alo, ahi = L.bootstrap_diff_clustered(gAall, gBall, N_BOOT, rng)
    P(f"A - B (all runs, sensitivity): {sAall - sBall:+.3f}, 95% [{alo:+.3f}, {ahi:+.3f}]")
    P("")
    P(f"B1 (A share > 0.5, interval excludes 0.5): {'held' if sA > 0.5 and loA > 0.5 else 'refuted'} ({sA:.3f} [{loA:.3f}, {hiA:.3f}])")
    P(f"B2 (A - B >= 0.10 and interval excludes 0): {'held' if sA - sB >= 0.10 and dlo > 0 else 'refuted'} ({sA - sB:+.3f} [{dlo:+.3f}, {dhi:+.3f}])")
    meas = [r for r in rows if r["frames"] >= 10]
    above = [r for r in meas if r["lane"] > r["n975"]]
    P(f"B3 (lane order above shuffled p97.5 in every measurable run): {'held' if len(above) == len(meas) else 'refuted'} ({len(above)} of {len(meas)})")
    bs = [r for r in rows if r["variant"] == "B"]
    rho_b = L.spearman([r["minute"] for r in bs], [r["share"] for r in bs])
    as_ = [r for r in rows if r["variant"] == "A"]
    rho_a = L.spearman([r["minute"] for r in as_], [r["share"] for r in as_])
    P(f"B4 (Spearman start time vs share within B not negative): {'held' if rho_b >= 0 else 'refuted'} (rho = {rho_b:+.2f}, n = {len(bs)}; within A, not registered: rho = {rho_a:+.2f}, n = {len(as_)})")
    inside = HERMES_FREE_CI[0] <= sA <= HERMES_FREE_CI[1]
    P(f"B5 (A share inside HERMES free-choice interval {HERMES_FREE_CI}): {'held' if inside else 'refuted'} ({sA:.3f})")
    b01 = next(r for r in rows if r["run"] == "bi_corr_400_b_01")
    P(f"B6 (median speed in b_01 within 1.0 to 1.6 m/s): {'held' if 1.0 <= b01['speed'] <= 1.6 else 'refuted'} ({b01['speed']:.2f} m/s, {b01['walkers']} walkers)")

    csv = ["run,variant,guided,start,screen,length_m,entrance_m,exit_m,walkers,share_right,ci_lo,ci_hi,"
           "mean_offset_plus_x,mean_offset_minus_x,n_plus_x,n_minus_x,lane_frames,lane_order,lane_null_mean,lane_null_p975,median_speed_ms"]
    for r in rows:
        csv.append(f"{r['run']},{r['variant']},{int(r['guided'])},{r['start']},{r['screen']},{r['length']},{r['entrance']},{r['exit']},"
                   f"{r['walkers']},{r['share']:.4f},{r['lo']:.4f},{r['hi']:.4f},{r['up']:.4f},{r['dn']:.4f},{r['n_up']},{r['n_dn']},"
                   f"{r['frames']},{r['lane']:.4f},{r['null']:.4f},{r['n975']:.4f},{r['speed']:.3f}")
    with open(os.path.join(HERE, "m2_basigo_sides_runs.csv"), "w") as f:
        f.write("\n".join(csv) + "\n")
    write_svg(rows)
    with open(os.path.join(HERE, "m2_basigo_sides_results.txt"), "w") as f:
        f.write("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
