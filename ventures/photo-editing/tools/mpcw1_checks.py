"""eval/noise-pca-mpcw1-2026-11-22.md's R and C checks on a rescored sweep.

R: the rerun's ``ship`` and ``mpcws`` arms against the committed 2026-11-21 rows' ``mpcw`` and ``mpcws`` (same
file, tile, SNR, scenario), share within 0.01 dB on both metrics and both +k arms.
C: on the K-1 Mark II's [372, 678] tile, ``mpcw1`` / ``ship`` (= ``mpcw``) sigma at 18% grey on every row.

    python tools/mpcw1_checks.py NEW.jsonl eval/noise-pca-whitened-level-2026-11-21.jsonl
"""

import json
import sys


def rows(path):
    out = {}
    for line in open(path):
        r = json.loads(line)
        if "cpsnr" in r:
            out[(r["file"], tuple(r["tile"]), r["snr"], r["scenario"])] = r
    return out


def main(argv=None) -> int:
    new_p, old_p = (argv or sys.argv[1:])[:2]
    new, old = rows(new_p), rows(old_p)
    keys = sorted(set(new) & set(old))
    print(f"R: {len(new)} new rows, {len(old)} committed, {len(keys)} joined")
    for new_arm, old_arm in (("ship", "mpcw"), ("mpcws", "mpcws")):
        ok = tot = 0
        worst = 0.0
        for k in keys:
            for m in ("cpsnr", "lpsnr"):
                for suf in ("", "+12"):
                    d = abs(new[k][m][new_arm + suf] - old[k][m][old_arm + suf])
                    worst = max(worst, d)
                    tot += 1
                    ok += d <= 0.01 + 1e-9
        print(f"R  {new_arm} vs committed {old_arm}: {ok}/{tot} within 0.01 dB ({ok / max(tot, 1):.4f}); worst {worst:.3f} dB")
    print("C: Pentax K-1 Mark II [372, 678], mpcw1 / ship sigma18")
    worst = 0.0
    for k in sorted(new):
        if k[0].startswith("Pentax K-1 Mark II") and k[1] == (372, 678):
            s = new[k]["sigma18"]
            q = s["mpcw1"] / s["ship"]
            worst = max(worst, q)
            print(f"   SNR {k[2]:>5g} {k[3]:5s} ship {s['ship']:.4f} mpcw1 {s['mpcw1']:.4f} mpcws {s['mpcws']:.4f}  ratio {q:.2f}")
    print(f"C worst ratio {worst:.2f}: {'PASS' if 0 < worst <= 1.3 else 'FAIL'} (at most 1.3)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
