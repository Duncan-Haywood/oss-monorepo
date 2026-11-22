"""The noise-aware blend near clean: does lifting smooth blocks beside detail stop the leak?

``xtrans_demosaic.blend`` interpolates block weights between block centres, so a detailed block beside a
smooth one takes part of the smooth block's bilinear weight. ``lift_near_detail(q, k)`` raises each block's
``q`` to at least its largest 3 x 3 neighbour's over ``k``. This sweep scores that lift for several ``k``,
with the true noise model and with what ships (``frame_noise``), on the raw.pixls.us sets of 2026-11-18
(LibRaw truths binned 4 x 4, re-mosaicked, noise added as ``tools/noise_aware_estimated.py sweep`` adds it:
same seeds, same tiles).

Arms: ``D`` (directional), ``true`` and ``true+k`` (the oracle model, unlifted and lifted), ``ship`` and
``ship+k`` (``frame_noise``, unlifted and lifted).

Usage (from ``ventures/photo-editing``)::

    PYTHONPATH=src python tools/near_clean_gate.py sweep --bayer --cards cards.json --cache /tmp/truths FILES... > rows.jsonl
    python tools/near_clean_gate.py tune rows.jsonl            # pick k (the committed rule)
    python tools/near_clean_gate.py rule rows.jsonl --k K      # the held-out test (the committed rule)
    # one sweep, both roles: --split tune for the pick, --split held for the test (rows carry split_of(body))
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from collections import defaultdict

import numpy as np

KS = (4.0, 6.0, 8.0, 12.0, 16.0, 24.0, 32.0, 48.0)


def emit(row: dict) -> None:
    sys.stdout.write(json.dumps(row) + "\n")
    sys.stdout.flush()


def arms(c, pat, b, d, model, ks, eigs=(), reads: dict | None = None) -> dict:
    """The scored arms. ``eigs``: further ``frame_noise`` arms, one per patch-PCA eigenvalue read
    (``noise_pca.EIG_READS``), named by it (eval/noise-pca-min-eigen-2026-11-19.md). ``reads``, when given,
    receives each estimated arm's sigma at 18% grey."""

    from shootflow import xtrans_demosaic as xd

    cfa = 6 if len(pat) == 36 else 2
    ramp, luma = xd.RAMPS[cfa], xd.LUMA_RAMPS[cfa]
    out = {"D": d}
    models = [("true", model), ("ship", xd.frame_noise(c, pat))] + [(e, xd.frame_noise(c, pat, eig=e)) for e in eigs]
    if reads is not None:
        for name, m in models[1:]:
            reads[name] = round(float(max(m[0] * 0.18 + m[1], 0.0) ** 0.5), 6)
    for name, noise in models:
        q = xd.frame_measures(c, pat, b, d, noise=noise, blocks=True)["q_blocks"]
        out[name] = xd.blend(b, d, q, ramp[0], ramp[1], luma_ramp=luma)
        for k in ks:
            out[f"{name}+{k:g}"] = xd.blend(b, d, xd.lift_near_detail(q, k), ramp[0], ramp[1], luma_ramp=luma)
    return out


def sweep(argv) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--raf", help="take the X-Trans layout from this RAF (default with --bayer: RGGB)")
    ap.add_argument("--bayer", action="store_true")
    ap.add_argument("--cache")
    ap.add_argument("--cards", help="tools/card_scenes.py output: skip repeat scenes")
    ap.add_argument("--ks", help="comma-separated k (default KS)")
    ap.add_argument("--no-raw-grain", action="store_true", help="skip truth_grain18 (two extra LibRaw passes a file)")
    ap.add_argument("--eigs", default="", help="comma-separated further eigenvalue reads to score as arms (mp, mpc, mpcw, mpcws)")
    args = ap.parse_args(argv)
    eigs = tuple(e for e in args.eigs.split(",") if e)
    ks = tuple(float(x) for x in args.ks.split(",")) if args.ks else KS
    cards = json.load(open(args.cards)) if args.cards else None

    import rawpy

    sys.path.insert(0, __file__.rsplit("/", 1)[0])
    import xtrans_demosaic_check as chk
    from noise_aware_estimated import card_of, seed_of
    from noise_aware_planes import carries, draw, gains_of
    from truth_noise_check import raw_grain
    from xtrans_frame_choice import _truth, split_of, tiles

    from shootflow.xtrans_demosaic import frame_noise as xd_frame_noise

    if args.bayer:
        from shootflow.bayer_demosaic import directional

        pat = (0, 1, 1, 2)
    else:
        from shootflow.xtrans_demosaic import directional

        pat = chk._pattern(rawpy.imread(args.raf))
    for path in args.files:
        name = path.rsplit("/", 1)[-1]
        if cards is not None and not cards.get(name, {}).get("keep"):
            continue
        try:
            truth_full = _truth(path, args.cache)
            gains = gains_of(path)
        except Exception as exc:  # noqa: BLE001
            emit({"file": name, "skipped": f"{type(exc).__name__}: {exc}"})
            continue
        cut = tiles(truth_full, 480, 3)
        grain = {}
        if not args.no_raw_grain:
            try:  # the truth's grain read from the raw (tools/truth_noise_check.py), not from the binned scene
                grain = raw_grain(path, [s for s, _ in cut]).get("tiles", {})
            except Exception:  # noqa: BLE001
                grain = {}
        for (ty, tx), truth in cut:
            clean = chk.mosaic(truth, pat)
            # The truth's own noise (the source frame's grain survives 4 x 4 binning): frame_noise on the clean
            # mosaic, as sigma at 18% grey. Where it rivals the noise added, the score rewards keeping that grain.
            ts, tr = xd_frame_noise(clean, pat)
            truth_sigma18 = round(float((ts * 0.18 + tr) ** 0.5), 6)
            for snr in (200.0, 60.0, 25.0, 12.0):
                for sc in ("equal", "wb"):
                    t0 = time.perf_counter()
                    seed = seed_of(name, ty, tx, snr, sc)
                    if sc == "equal":
                        c = chk.add_noise(clean, snr, seed=seed)
                        sig2 = (0.18 / snr) ** 2
                        model = (0.8 * sig2 / 0.18, 0.2 * sig2)
                    else:
                        c, raw_model = draw(clean, pat, gains, snr, ((1.0, 1.0),) * 3, seed)
                        model, _ = carries(raw_model, gains)
                    b = chk.ours_bilinear(c, pat)
                    d = directional(c, pat)
                    cps, lps, reads = {}, {}, {}
                    for arm, arr in arms(c, pat, b, d, model, ks, eigs, reads).items():
                        s = chk.scores(arr, truth)
                        cps[arm], lps[arm] = s["cpsnr"], s["lpsnr"]
                    emit({"layout": "bayer" if args.bayer else "xtrans", "file": name,
                          "card": card_of(name, cards), "split": split_of(card_of(name, cards)),
                          "tile": [ty, tx], "snr": snr, "scenario": sc, "truth_sigma18": truth_sigma18,
                          "truth_grain18": grain.get((ty, tx)), "sigma18": reads,
                          "true_sigma18": round(float(max(model[0] * 0.18 + model[1], 0.0) ** 0.5), 6) if np.ndim(model) == 1 else None,
                          "cpsnr": cps, "lpsnr": lps,
                          "s": round(time.perf_counter() - t0, 2)})
    return 0


def clean_enough(row: dict) -> bool:
    """The truth is at least as clean as the noise added: its own SNR at 18% grey is no lower than the row's
    ``snr``. The truth's noise is ``truth_grain18`` (read from the raw, ``tools/truth_noise_check.py``) when the
    row has it, else ``truth_sigma18`` (``frame_noise`` on the clean mosaic, which reads texture as grain: on
    eval/near-clean-truth-noise-2026-11-19.md's D780 foliage 6 to 12 times the raw's grain). Rows with neither
    count as clean. A row joined with ``truth_gg18`` (``whitened --gg``, the green-pair reading of
    eval/noise-pca-mpcws-noisy-truth-2026-11-22.md) takes the larger of it and ``truth_grain18``."""

    t = row.get("truth_grain18")
    if t is None:
        t = row.get("truth_sigma18")
    elif row.get("truth_gg18") is not None:
        t = max(t, row["truth_gg18"])
    return t is None or t <= 0 or 0.18 / t >= row["snr"]


def gg_of(path: str) -> dict:
    """``tools/truth_noise_check.py`` output as ``{(file, (ty, tx)): gg18}``."""

    out = {}
    for line in open(path):
        r = json.loads(line)
        out[(r["file"], tuple(r["tile"]))] = r.get("gg18")
    return out


def load(paths, split: str | None = None, clean_truths: bool = False, gg: dict | None = None) -> list[dict]:
    """Scored rows from sweep output; ``split`` keeps only rows whose body ``split_of`` put there;
    ``clean_truths`` drops rows whose truth is noisier than the noise added (``clean_enough``); ``gg``
    (``gg_of``) joins ``truth_gg18`` by file and tile first."""

    rows = []
    for p in paths:
        for line in open(p):
            r = json.loads(line)
            if gg is not None and "tile" in r:
                r["truth_gg18"] = gg.get((r["file"], tuple(r["tile"])))
            if "cpsnr" in r and (split is None or r.get("split") == split) and (not clean_truths or clean_enough(r)):
                rows.append(r)
    return rows


def g(rows, metric, arm, ref="D") -> np.ndarray:
    m = "cpsnr" if metric == "c" else "lpsnr"
    return np.array([r[m][arm] - r[m][ref] for r in rows])


def losers(rows, arm, bar=0.1) -> set:
    return {i for i, r in enumerate(rows) if min(r["cpsnr"][arm] - r["cpsnr"]["D"], r["lpsnr"][arm] - r["lpsnr"]["D"]) < -bar}


def table(rows, ks, base) -> None:
    print(f"{'arm':10s} {'luma':>8s} {'colour':>8s} {'losers':>6s} {'worst':>6s}  SNR 200 luma / SNR 12 luma")
    for arm in [base] + [f"{base}+{k:g}" for k in ks]:
        lw = min(g(rows, "l", arm).min(), g(rows, "c", arm).min())
        hi = [r for r in rows if r["snr"] == 200.0]
        lo = [r for r in rows if r["snr"] == 12.0]
        print(f"{arm:10s} {g(rows, 'l', arm).mean():+8.4f} {g(rows, 'c', arm).mean():+8.4f} "
              f"{len(losers(rows, arm)):6d} {lw:+6.2f}  {g(hi, 'l', arm).mean():+.4f} / {g(lo, 'l', arm).mean():+.4f}")


def tune(argv) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("rows", nargs="+")
    ap.add_argument("--split", choices=("tune", "held"), help="only rows of this split (default: all)")
    ap.add_argument("--clean-truths", action="store_true", help="drop rows whose truth is noisier than the noise added")
    args = ap.parse_args(argv)
    rows = load(args.rows, args.split, args.clean_truths)
    ks = sorted({float(a.split("+")[1]) for a in rows[0]["cpsnr"] if a.startswith("ship+")})
    print(f"{len(rows)} rows")
    for base in ("true", "ship"):
        table(rows, ks, base)
    # The committed pick: the k maximising mean (luma + colour) gain of ship+k over D; ties to the larger k.
    score = {k: float((g(rows, "l", f"ship+{k:g}") + g(rows, "c", f"ship+{k:g}")).mean()) for k in ks}
    best = max(ks, key=lambda k: (round(score[k], 4), k))
    print("pick: k =", f"{best:g}", f"(mean luma + colour gain over D {score[best]:+.4f}; unlifted "
          f"{float((g(rows, 'l', 'ship') + g(rows, 'c', 'ship')).mean()):+.4f})")
    return 0


def rule(argv) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("rows", nargs="+")
    ap.add_argument("--k", type=float, required=True)
    ap.add_argument("--split", choices=("tune", "held"), help="only rows of this split (default: all)")
    ap.add_argument("--clean-truths", action="store_true", help="drop rows whose truth is noisier than the noise added")
    args = ap.parse_args(argv)
    rows = load(args.rows, args.split, args.clean_truths)
    arm = f"ship+{args.k:g}"
    ok = True
    for base in ("ship", "true"):
        lifted = f"{base}+{args.k:g}"
        dl, dc = g(rows, "l", lifted, base), g(rows, "c", lifted, base)
        cells = defaultdict(list)
        for i, r in enumerate(rows):
            cells[(r["snr"], r["scenario"])].append(i)
        worst_cell = min((float(min(dl[ix].mean(), dc[ix].mean())), key) for key, ix in cells.items())
        new = losers(rows, lifted) - losers(rows, base)
        print(f"{base}: {len(rows)} rows; lifted - unlifted mean luma {dl.mean():+.4f}, colour {dc.mean():+.4f}; "
              f"worst cell {worst_cell[0]:+.4f} at SNR {worst_cell[1][0]:g} {worst_cell[1][1]}; "
              f"losers > 0.1 dB vs D {len(losers(rows, base))} -> {len(losers(rows, lifted))}, new {len(new)}")
        for key in sorted(cells):
            ix = cells[key]
            print(f"   SNR {key[0]:>5g} {key[1]:5s} n={len(ix):4d}  luma {dl[ix].mean():+.4f}  colour {dc[ix].mean():+.4f}"
                  f"  (gain over D: {g([rows[i] for i in ix], 'l', base).mean():+.3f} -> {g([rows[i] for i in ix], 'l', lifted).mean():+.3f})")
        if base == "ship":
            h1 = dl.mean() >= -0.005 and dc.mean() >= -0.005 and worst_cell[0] >= -0.02
            h2 = len(losers(rows, arm)) < len(losers(rows, "ship")) and not new
            hi = [r for r in rows if r["snr"] == 200.0]
            h3 = min(g(hi, "l", arm).min(), g(hi, "c", arm).min()) > min(g(hi, "l", "ship").min(), g(hi, "c", "ship").min())
            for label, passed in (("h1 means within 0.005 dB, every cell within 0.02 dB", h1),
                                  ("h2 fewer rows lose > 0.1 dB to D, none new", h2),
                                  ("h3 the worst SNR 200 row improves", h3)):
                print(("PASS " if passed else "FAIL ") + label)
                ok &= passed
    print("verdict:", "ship the lift" if ok else "the lift stays off")
    return 0


# The six held-out rows of eval/near-clean-truth-noise-2026-11-19.md that lose on clean truths (file, tile, snr,
# scenario): the over-read noise on fine foliage and wallpaper that eval/noise-pca-min-eigen-2026-11-19.md tests.
NAMED = (("Nikon_D780__DSC_0336.NEF", (0, 0), 60.0, "equal"), ("Nikon_D780__DSC_0336.NEF", (0, 0), 60.0, "wb"),
         ("Nikon_D780__DSC_0336.NEF", (0, 0), 25.0, "wb"), ("Nikon_D780__DSC_0338.NEF", (0, 0), 60.0, "wb"),
         ("Nikon_D780__DSC_0334.NEF", (0, 0), 60.0, "wb"), ("Nikon_D600__DSC_3294.NEF", (0, 1026), 60.0, "equal"))


def worse(rows, arm) -> np.ndarray:
    return np.minimum(g(rows, "l", arm), g(rows, "c", arm))


def pick(argv) -> int:
    """eval/noise-pca-min-eigen-2026-11-19.md's pick: of the ``--eigs`` reads, the one whose +k arm gains most
    (mean luma + colour over D) with no more losers than ship+k."""

    ap = argparse.ArgumentParser()
    ap.add_argument("rows", nargs="+")
    ap.add_argument("--k", type=float, default=12.0)
    ap.add_argument("--eigs", default="mp,mpc")
    ap.add_argument("--clean-truths", action="store_true")
    args = ap.parse_args(argv)
    rows = load(args.rows, clean_truths=args.clean_truths)
    k = f"{args.k:g}"
    print(f"{len(rows)} rows")
    table_arms(rows, ["ship+" + k] + [f"{e}+{k}" for e in args.eigs.split(",")])
    base = len(losers(rows, "ship+" + k))
    ok = [(float((g(rows, "l", f"{e}+{k}") + g(rows, "c", f"{e}+{k}")).mean()), e) for e in args.eigs.split(",")
          if len(losers(rows, f"{e}+{k}")) <= base]
    print("pick:", max(ok)[1] if ok else "none (every read has more losers than ship): stop")
    return 0


def table_arms(rows, names) -> None:
    print(f"{'arm':10s} {'luma':>8s} {'colour':>8s} {'losers':>6s} {'worst':>6s}")
    for arm in names:
        print(f"{arm:10s} {g(rows, 'l', arm).mean():+8.4f} {g(rows, 'c', arm).mean():+8.4f} "
              f"{len(losers(rows, arm)):6d} {worse(rows, arm).min():+6.2f}")


def compare(argv) -> int:
    """eval/noise-pca-min-eigen-2026-11-19.md's test of an eigenvalue read's +k arm against ship+k (h1 to h3)."""

    ap = argparse.ArgumentParser()
    ap.add_argument("rows", nargs="+")
    ap.add_argument("--eig", required=True)
    ap.add_argument("--k", type=float, default=12.0)
    ap.add_argument("--clean-truths", action="store_true")
    args = ap.parse_args(argv)
    rows = load(args.rows, clean_truths=args.clean_truths)
    k = f"{args.k:g}"
    ship, cand = "ship+" + k, f"{args.eig}+{k}"
    print(f"{len(rows)} rows")
    table_arms(rows, [ship, cand])
    dl, dc = g(rows, "l", cand, ship), g(rows, "c", cand, ship)
    cells = defaultdict(list)
    for i, r in enumerate(rows):
        cells[(r["snr"], r["scenario"])].append(i)
    worst_cell = min(float(min(dl[ix].mean(), dc[ix].mean())) for ix in cells.values())
    for key in sorted(cells):
        ix = cells[key]
        print(f"   SNR {key[0]:>5g} {key[1]:5s} n={len(ix):4d}  {cand} - {ship}: luma {dl[ix].mean():+.4f}  colour {dc[ix].mean():+.4f}")
    ls, lc = losers(rows, ship), losers(rows, cand)
    new = lc - ls
    for i in sorted(ls | lc):
        r = rows[i]
        print(f"   loser {r['file']} {r['tile']} SNR {r['snr']:g} {r['scenario']}: {ship} {worse([r], ship)[0]:+.2f}, "
              f"{cand} {worse([r], cand)[0]:+.2f}; sigma18 {r.get('sigma18')}, true {r.get('true_sigma18')}")
    named = [r for r in rows if (r["file"], tuple(r["tile"]), r["snr"], r["scenario"]) in set(NAMED)]
    h = {
        "h1 means within 0.005 dB of ship, every cell within 0.02 dB":
            dl.mean() >= -0.005 and dc.mean() >= -0.005 and worst_cell >= -0.02,
        "h2 fewer rows lose > 0.1 dB to D, none new": len(lc) < len(ls) and not new,
        f"h3 the {len(named)} named rows' mean worse gain improves":
            bool(named) and worse(named, cand).mean() > worse(named, ship).mean(),
    }
    print(f"means: luma {dl.mean():+.4f}, colour {dc.mean():+.4f}; worst cell {worst_cell:+.4f}; losers {len(ls)} -> "
          f"{len(lc)}, new {len(new)}; named rows {worse(named, ship).mean() if named else float('nan'):+.3f} -> "
          f"{worse(named, cand).mean() if named else float('nan'):+.3f}")
    for label, passed in h.items():
        print(("PASS " if passed else "FAIL ") + label)
    print("verdict:", f"ship {args.eig}" if all(h.values()) else "what ships stays")
    return 0


def whitened(argv) -> int:
    """eval/noise-pca-whitened-level-2026-11-21.md's pick (``--split tune``) and test (``--split held``) of the
    colour-whitened reads on one sweep: the pick takes, of ``--eigs``, the +k arm with the highest mean (luma +
    colour) gain over D that beats ship+k's and has no more losers; the test scores ``--eig`` against ship+k
    (h1 means, h2 no new loser, h3 the white-balanced SNR 25 and 12 rows' luma)."""

    ap = argparse.ArgumentParser()
    ap.add_argument("rows", nargs="+")
    ap.add_argument("--split", choices=("tune", "held"), required=True)
    ap.add_argument("--eigs", default="mpcw,mpcws", help="the pick's candidates (tune)")
    ap.add_argument("--eig", help="the picked read (held)")
    ap.add_argument("--k", type=float, default=12.0)
    ap.add_argument("--base", default="ship", help="the read to beat (2026-11-22: mpcw, what ships since 2026-11-21)")
    ap.add_argument("--gg", help="truth_noise_check.py output: join truth_gg18 into clean_enough")
    args = ap.parse_args(argv)
    rows = load(args.rows, args.split, clean_truths=True, gg=gg_of(args.gg) if args.gg else None)
    k = f"{args.k:g}"
    ship = f"{args.base}+{k}"
    print(f"{len(rows)} rows ({args.split}, clean truths)")

    def both(arm):
        return float((g(rows, "l", arm) + g(rows, "c", arm)).mean())

    def ratio_table(names):
        print("   read / true sigma at 18% grey (median), by SNR and scenario:")
        for sc in ("equal", "wb"):
            for snr in (200.0, 60.0, 25.0, 12.0):
                rr = [r for r in rows if r["snr"] == snr and r["scenario"] == sc and r.get("true_sigma18")]
                if rr:
                    print(f"   SNR {snr:>5g} {sc:5s} " + "  ".join(
                        f"{n} {np.median([r['sigma18'][n] / r['true_sigma18'] for r in rr]):.2f}" for n in names))

    if args.split == "tune":
        cands = args.eigs.split(",")
        table_arms(rows, [ship] + [f"{e}+{k}" for e in cands])
        ratio_table([args.base] + cands)
        base_l, base_s = len(losers(rows, ship)), both(ship)
        ok = [(both(f"{e}+{k}"), e) for e in cands if len(losers(rows, f"{e}+{k}")) <= base_l and both(f"{e}+{k}") > base_s]
        print(f"ship+{k} mean luma + colour over D {base_s:+.4f}; " + ", ".join(f"{e} {both(f'{e}+{k}'):+.4f}" for e in cands))
        print("pick:", max(ok)[1] if ok else "none: stop")
        return 0
    cand = f"{args.eig}+{k}"
    table_arms(rows, [ship, cand])
    ratio_table([args.base, args.eig])
    dl, dc = g(rows, "l", cand, ship), g(rows, "c", cand, ship)
    cells = defaultdict(list)
    for i, r in enumerate(rows):
        cells[(r["snr"], r["scenario"])].append(i)
    worst_cell = min(float(min(dl[ix].mean(), dc[ix].mean())) for ix in cells.values())
    for key in sorted(cells):
        ix = cells[key]
        print(f"   SNR {key[0]:>5g} {key[1]:5s} n={len(ix):4d}  {cand} - {ship}: luma {dl[ix].mean():+.4f}  colour {dc[ix].mean():+.4f}")
    ls, lc = losers(rows, ship), losers(rows, cand)
    new = lc - ls
    for i in sorted(ls | lc):
        r = rows[i]
        print(f"   loser {r['file']} {r['tile']} SNR {r['snr']:g} {r['scenario']}: {ship} {worse([r], ship)[0]:+.2f}, "
              f"{cand} {worse([r], cand)[0]:+.2f}; sigma18 {r.get('sigma18')}, true {r.get('true_sigma18')}")
    wb = [i for i, r in enumerate(rows) if r["scenario"] == "wb" and r["snr"] in (25.0, 12.0)]
    h3v = float(dl[wb].mean()) if wb else float("nan")
    h = {
        "h1 means within 0.005 dB of ship, every cell within 0.02 dB":
            dl.mean() >= -0.005 and dc.mean() >= -0.005 and worst_cell >= -0.02,
        "h2 no row newly loses > 0.1 dB to D, and no more losers": not new and len(lc) <= len(ls),
        f"h3 white-balanced SNR 25 and 12 rows' luma gains at least +0.02 dB over ship ({h3v:+.4f}, n={len(wb)})":
            bool(wb) and h3v >= 0.02,
    }
    print(f"means: luma {dl.mean():+.4f}, colour {dc.mean():+.4f}; worst cell {worst_cell:+.4f}; "
          f"losers {len(ls)} -> {len(lc)}, new {len(new)}")
    for label, passed in h.items():
        print(("PASS " if passed else "FAIL ") + label)
    print("verdict:", f"ship {args.eig} on Bayer" if all(h.values()) else "what ships stays")
    return 0


def noisytruth(argv) -> int:
    """eval/noise-pca-mpcws-noisy-truth-2026-11-22.md's validity tests of the green-pair reading: P1, each K-1
    Mark II tile's ``gg18`` at least 1.5 x ``raw_grain18``; P2, on the other tiles the median ratio in 0.67 to
    1.5, and at most 1.5 on textured tiles (``truth_sigma18 / raw_grain18`` at least 3)."""

    ap = argparse.ArgumentParser()
    ap.add_argument("gg", help="tools/truth_noise_check.py output")
    args = ap.parse_args(argv)
    rows = [json.loads(line) for line in open(args.gg)]
    rows = [r for r in rows if r.get("gg18") is not None and r.get("raw_grain18")]
    k1 = [r for r in rows if r["file"].startswith("Pentax K-1 Mark II")]
    rest = [r for r in rows if not r["file"].startswith("Pentax K-1 Mark II")]
    for r in k1:
        print(f"   K-1 II {r['tile']}: gg18 {r['gg18']:.6f} raw_grain18 {r['raw_grain18']:.6f} "
              f"ratio {r['gg18'] / r['raw_grain18']:.2f}")
    ratio = np.array([r["gg18"] / r["raw_grain18"] for r in rest])
    tex = np.array([r["gg18"] / r["raw_grain18"] for r in rest if r["truth_sigma18"] / r["raw_grain18"] >= 3])
    print(f"   other tiles: n={len(ratio)}, median gg/grain {np.median(ratio):.2f} "
          f"(quartiles {np.quantile(ratio, 0.25):.2f} to {np.quantile(ratio, 0.75):.2f}); "
          f"textured n={len(tex)}, median {np.median(tex) if len(tex) else float('nan'):.2f}")
    p1 = len(k1) == 3 and all(r["gg18"] >= 1.5 * r["raw_grain18"] for r in k1)
    p2 = bool(len(ratio)) and 0.67 <= float(np.median(ratio)) <= 1.5 and (not len(tex) or float(np.median(tex)) <= 1.5)
    print(("PASS " if p1 else "FAIL ") + "P1 every K-1 Mark II tile reads gg18 >= 1.5 x raw_grain18")
    print(("PASS " if p2 else "FAIL ") + "P2 other tiles' median ratio in 0.67-1.5, textured tiles' at most 1.5")
    print("verdict:", "use truth_gg18 in clean_enough (whitened --gg)" if p1 and p2 else "reading only: clean_enough unchanged")
    return 0


def main(argv=None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    cmd = {"sweep": sweep, "tune": tune, "rule": rule, "pick": pick, "compare": compare, "whitened": whitened,
           "noisytruth": noisytruth}.get(argv[0] if argv else "")
    if cmd is None:
        print(__doc__)
        return 2
    return cmd(argv[1:])


if __name__ == "__main__":
    sys.exit(main())
