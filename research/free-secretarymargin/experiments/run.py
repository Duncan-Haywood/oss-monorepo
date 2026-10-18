"""Train on one seed, test on a fresh one: margin rule vs best cutoff (about 3 minutes, stdlib only)."""
import json, sys
from math import sqrt
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from secretary_margin import make_trials, search, p_best, paired_diff  # noqa: E402

N = 50
TRAIN, TEST = 8000, 60000
SIGMAS = [0.0, 0.5, 1.0, 2.0]
RS = list(range(8, 31))
DS = [0.0, 0.1, 0.2, 0.4, 0.7, 1.0]


def main():
    lines = ["== free-secretarymargin: n=%d, train %d (seed 11), test %d (seed 12) ==" % (N, TRAIN, TEST), "",
             "sigma  cutoff_r  margin_r  margin_d  train_P_cut  train_P_margin  test_P_cut  test_P_margin  diff  se  z"]
    rows = []
    for s in SIGMAS:
        tr = make_trials(N, s, TRAIN, 11)
        (rc, pc), ((rm, dm), pm) = search(tr, N, s, RS, DS)
        te = make_trials(N, s, TEST, 12)
        sd = sqrt(1 + s * s)
        tc = p_best(te, rc, 0.0)
        tm = p_best(te, rm, dm * sd)
        diff, se = paired_diff(te, (rm, dm), (rc, 0.0), sd)
        rows.append(dict(sigma=s, cutoff_r=rc, margin_r=rm, margin_d=dm, train_cut=pc, train_margin=pm,
                         test_cut=tc, test_margin=tm, diff=diff, se=se))
        lines.append("%.2f %d %d %.1f %.4f %.4f %.4f %.4f %+.4f %.4f %+.1f" % (s, rc, rm, dm, pc, pm, tc, tm, diff, se, diff / se if se else 0))
        print(lines[-1], flush=True)
    (HERE / "results.txt").write_text("\n".join(lines) + "\n")
    (HERE / "results.json").write_text(json.dumps(dict(n=N, train=TRAIN, test=TEST, rows=rows), indent=1))


if __name__ == "__main__":
    main()
