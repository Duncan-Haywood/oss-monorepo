"""Post-hoc diagnostic (after step 7's 2019 scores; uses the ground-truth leak flows, so not a detector).

    PYTHONPATH=src python experiments/step7-mnf2/visible.py   # writes visible.txt; reads night.tsv

For each 2019 leak under 12 m3/h: the leak's own night flow (mean over 00:00-06:00, from
2019_Leakages.csv) on each of its first 30 days, minus the median of that flow over the
trailing baseline window the detectors use ([d - 21, d - 7)). That difference is the step a
night-flow detector can see; a slow ramp is partly inside its own baseline. Compared with the
robust sd of M4's series over the same window.
"""
from pathlib import Path

import numpy as np

from water_leaks import data, detect
from water_leaks.harness import Y19

HERE = Path(__file__).resolve().parent
SMALL = ["p123", "p193", "p277", "p280", "p331", "p455", "p680", "p710", "p879"]


def main():
    ts, cols, L = data.load("Leakages", 2019)
    hrs, Lh = detect.hourly(ts, L)
    days = len(hrs) // 24
    night = Lh[: days * 24].reshape(days, 24, -1)[:, 0:6, :].mean(axis=1)   # [day, pipe] m3/h
    rows = [ln.split("\t") for ln in (HERE / "night.tsv").read_text().split("\n")[1:] if ln]
    m4 = np.array([float(r[5]) for r in rows])
    off = int((Y19.astype("datetime64[D]") - np.datetime64(rows[0][0], "D")).astype(int))  # 2019-01-01 in night.tsv
    out = ["# step 7 post-hoc: the step each small 2019 leak shows a night-flow detector, against M4's spread",
           "# visible(d) = leak night flow on day d - median of it over [d-21, d-7); sd = 1.4826 MAD of M4 over the same window",
           f"  {'pipe':>5} {'peak':>6} {'night d7':>9} {'d14':>6} {'d30':>6} {'max vis':>8} {'at day':>6} {'sd':>6} {'max vis/sd':>10} {'days > 1 sd':>11}"]
    ratios = []
    for p in SMALL:
        j = cols.index(p)
        x = night[:, j]
        d0 = int(np.nonzero(x > 0)[0][0])
        vis, rat = [], []
        for d in range(d0, min(d0 + 30, days)):
            base = np.median(x[max(d - 21, 0): max(d - 7, 1)]) if d - 7 > 0 else 0.0
            v = x[d] - base
            ref = m4[off + d - 21: off + d - 7]
            sd = 1.4826 * np.median(np.abs(ref - np.median(ref)))
            vis.append(v)
            rat.append(v / sd)
        k = int(np.argmax(vis))
        ref = m4[off + d0 + k - 21: off + d0 + k - 7]
        sd = 1.4826 * np.median(np.abs(ref - np.median(ref)))
        ratios.append(max(rat))
        g = lambda n: x[min(d0 + n, days - 1)]
        out.append(f"  {p:>5} {L[:, j].max():6.2f} {g(7):9.2f} {g(14):6.2f} {g(29):6.2f} {vis[k]:8.2f} {k:>6} {sd:6.2f} "
                   f"{max(rat):10.2f} {sum(r > 1 for r in rat):>11}")
    out.append(f"  median over the 9 of the best visible step in sd units: {np.median(ratios):.2f}")
    # the leak's own flow (hourly mean, m3/h) at the hour each detector was credited with it
    import importlib.util
    spec = importlib.util.spec_from_file_location("step6", HERE.parent / "step6-mnf" / "run.py")
    s6 = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(s6)
    det = {"D1-F": s6.prior_delays(HERE.parent / "step1-baseline" / "results.txt", "## variant F", "## variant L"),
           "LILA": s6.prior_delays(HERE.parent / "step2-lila" / "results.txt", "## LILA-auto, MAS ties by index", "# H1 check"),
           "M3": s6.prior_delays(HERE / "results.txt", "## M3: h", "## H4 (M3)"),
           "M4": s6.prior_delays(HERE / "results.txt", "## M4: h", "## H4 (M4)")}
    out += ["", "# leak flow (m3/h, hourly mean) at the hour each detector was credited with the leak; '-' = missed",
            "# the onset hour is the first 5-minute step with flow > 0, so a delay counts from that hour",
            f"  {'pipe':>5} " + " ".join(f"{k:>8}" for k in det)]
    for p in SMALL:
        j = cols.index(p)
        on = int(np.nonzero(Lh[:, j] > 0)[0][0])
        cells = []
        for k in det:
            dl = det[k][p]
            cells.append("-" if not np.isfinite(dl) else f"{Lh[min(on + int(dl), len(Lh) - 1), j]:.2f}")
        out.append(f"  {p:>5} " + " ".join(f"{c:>8}" for c in cells))
    (HERE / "visible.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
