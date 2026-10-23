"""Write experiments/results.txt: PSR gate and leave-one-clip-out choice of gamma and threshold (deterministic)."""
import sys
from multiprocessing import Pool
from pathlib import Path
import numpy as np

root = Path(__file__).resolve().parents[2]
for p in ("capture-syncgate", "capture-realedit", "capture-syncedit", "capture-realaudio", "capture-audiosync", "capture-edit"):
    sys.path.insert(0, str(root / p / "src"))
from capture_realaudio import available_clips  # noqa: E402
from capture_syncgate import gated_trial, loco_pick  # noqa: E402

SEEDS = range(12)
WIN = 2.0
GAMMAS = (0.25, 0.5, 1.0)
THRS = (0.0, 5.5, 6.5, 8.0)     # 0 = no gate; noise-only windows peak near PSR 5 (probe in README)
SNRS = (0, -10)
SETTINGS = [(g, t) for g in GAMMAS for t in THRS]


def job(args):
    name, snr = args
    clip = available_clips()[name]
    res = {}
    for g, t in SETTINGS:
        rs = [gated_trial(s, clip, WIN, snr, g, t) for s in SEEDS]
        res[(g, t)] = tuple(float(np.mean([r[k] for r in rs])) for k in ("visible", "event", "jump_ms", "dropped"))
    return name, snr, res


def main():
    names = sorted(available_clips())
    with Pool() as pool:
        done = pool.map(job, [(n, s) for n in names for s in SNRS])
    out = ["clips: " + " ".join(names),
           "visible = share of cuts with a jump over one 30 fps frame; event = with a loud event in the jump; dropped = share of windows gated out",
           "4 cameras, 120 s Viterbi edit, +-40 ppm, 0.8 s offset, 12 windows of 2 s, white noise, mean of 12 seeds",
           "== A. per clip: snr gamma psr_min clip visible event jump_ms dropped"]
    tab = {}
    for name, snr, res in done:
        for (g, t), v in res.items():
            tab.setdefault(snr, {}).setdefault(name, {})[(g, t)] = v
            out.append("%d %g %g %s %.3f %.3f %.1f %.3f" % ((snr, g, t, name) + v))
    out.append("== B. mean over the 10 clips: snr gamma psr_min visible event jump_ms dropped worst_clip_visible")
    for snr in SNRS:
        for g, t in SETTINGS:
            a = np.array([tab[snr][n][(g, t)] for n in names])
            out.append("%d %g %g %.3f %.3f %.1f %.3f %.3f" % (snr, g, t, *a.mean(0)[:4], a[:, 0].max()))
    out.append("== C. leave-one-clip-out: setting chosen on the other 9 clips (lowest mean visible), scored on the held-out clip")
    out.append("snr rule visible_heldout_mean  (picks per clip in brackets)")
    for snr in SNRS:
        vis = {n: {s: tab[snr][n][s][0] for s in SETTINGS} for n in names}
        for rule, sub in (("gamma only (no gate)", [s for s in SETTINGS if s[1] == 0.0]),
                          ("threshold only (gamma 0.25)", [s for s in SETTINGS if s[0] == 0.25]),
                          ("gamma and threshold", SETTINGS)):
            sel = loco_pick({n: {s: vis[n][s] for s in sub} for n in names})
            m = np.mean([v for _, v in sel.values()])
            picks = " ".join("%s:%g/%g" % (n, *sel[n][0]) for n in names)
            out.append("%d %s %.3f [%s]" % (snr, rule, m, picks))
        base = np.mean([vis[n][(1.0, 0.0)] for n in names])
        best_in = min(np.mean([vis[n][s] for n in names]) for s in SETTINGS)
        out.append("%d reference: PHAT ungated %.3f; best single setting scored in-sample %.3f" % (snr, base, best_in))
    Path(__file__).with_name("results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
