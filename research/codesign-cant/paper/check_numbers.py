"""Check that every figure section VI and the abstract of DRAFT.md quote is still in the results file it is taken from.

Each check is (text quoted in DRAFT.md, results file under ../experiments/, a regular expression that must match that file).
The script fails if the draft no longer contains the quoted text (the claim was edited without updating this list) or the results
file no longer matches (an experiment was re-run and the number moved). Run from the project directory:
    python3 paper/check_numbers.py
Stdlib only.
"""
import os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
EXP = os.path.join(HERE, "..", "experiments")

CHECKS = [
    # abstract, section IV
    ("4.18° (INDI)", "m4_controllers/results.txt", r"indi: RMS -4\.18 deg .*better in 10 of 10"),
    ("4.88° (geometric)", "m4_controllers/results.txt", r"geo : RMS -4\.88 deg .*better in 10 of 10"),
    ("5.27° (PID)", "m4_controllers/results.txt", r"pid : RMS -5\.27 deg .*better in 10 of 10"),
    # section VI: the certificate and its accuracy
    ("0 of 2,688", "m7c_stab/results.txt", r"7b design-conditions \(48 x 64\), lever 0: unstable&dead 84, unstable&alive 300, stable&dead 0, stable&alive 2688; accuracy 0\.902, sensitivity 1\.000"),
    ("1.04, 1.00, 1.01, 1.05, 1.11 and 0.88", "m7c_stab/results.txt", r"\[above, integ retrained\] ff 1 \(integ\)\n  ki/kp [^\n]*; ceil 1\.04, 1\.00, 1\.01, 1\.05, 1\.11, 0\.88"),
    ("0.29–0.44", "m7c_stab/results.txt", r"\[above, 6b\+integ\] ff 1 \(integ\)\n  ki/kp [^\n]*; ceil 0\.37, 0\.37, 0\.44, 0\.32, 0\.36, 0\.29"),
    ("3.91–7.41 per second", "m7c_stab/results.txt", r"growth rate at worst held-out plant \(1/s\) 4\.20, 4\.66, 3\.91, 5\.88, 5\.01, 7\.41"),
    ("367 of 384", "m7c_stab/results.txt", r"new rescaled designs \(24 x 64\), lever 0: unstable&dead 0, unstable&alive 367"),
    ("growth 0.50–0.66 per s", "m7c_stab/results.txt", r"growth rate at worst held-out plant \(1/s\) 0\.50, 0\.55, 0\.62, 0\.58, 0\.59, 0\.66"),
    # section VI: the tilt-command limit
    ("84 of 384", "m7d_clip/results.txt", r"base   6 s lever 0: dead \[7, 8, 10, 20, 11, 28\] \(total 84"),
    ("166 of 384", "m7d_clip/diag.txt", r"\[1\.25x\](?:\n[^\n]*)*?clip   45 deg,  6 s: dead \[[^\]]*\] \(total 166\)"),
    ("318 of 384", "m7d_clip/diag.txt", r"\[1\.25x\](?:\n[^\n]*)*?clip   45 deg, 18 s: dead \[[^\]]*\] \(total 318\)"),
    ("(median RMS 0.110 m)", "m7d_clip/diag.txt", r"\[1\.25x\]\n  clip   20 deg,  6 s: dead \[0, 0, 0, 0, 0, 0\] \(total 0\); pos 0\.110; att 8\.73"),
    ("against 3.63°", "m7d_clip/diag.txt", r"\[0\.8x\]\n  clip   20 deg,  6 s: dead \[0, 0, 0, 0, 0, 0\] \(total 0\); pos 0\.103; att 3\.63"),
    ("from 0.105 m to\n0.257 m", "m7e_margin/tilt.txt", r"tilt cap   45 deg, lever 0, above unconstrained: diverged  13 of 384 \[[^\]]*\]; pos 0\.257 m"),
    ("ceiling multiples 1.26–1.30", "m7e_margin/results.txt", r"ceil 1\.27, 1\.28, 1\.30, 1\.28, 1\.26, 1\.30"),
    # section VI: table VI-1 (milestone 7f), one check per arm
    ("| 13 | 9 | 3 | 0 | 0 | 0 |", "m7f_sweep/results.txt", r"\[unconstrained\][^\n]*(?:\n[^\n]*)*?cap 45, lever 0: [^\n]*dead 13 "),
    ("| 45 | 32 | 22 | 12 | 13 | 12 |", "m7f_sweep/results.txt", r"\[unconstrained\][^\n]*(?:\n[^\n]*)*?cap 45, lever 2: [^\n]*dead 45 "),
]
ARMS = [("M=1.00", -0.001, 9, 32), ("M=1.11", -0.012, 3, 22), ("M=1.25", -0.011, 0, 12), ("M=1.43", -0.010, 0, 13), ("M=1.67", -0.012, 0, 12)]


def main():
    draft = open(os.path.join(HERE, "DRAFT.md")).read()
    bad = []
    for quote, path, rx in CHECKS:
        if quote not in draft:
            bad.append(f"DRAFT.md no longer quotes {quote!r}")
        if not re.search(rx, open(os.path.join(EXP, path)).read()):
            bad.append(f"{path} no longer matches {rx!r} (quoted as {quote!r})")
    sweep = open(os.path.join(EXP, "m7f_sweep", "results.txt")).read()
    for lab, dj, d45, d45l2 in ARMS:
        block = sweep.split(f"[{lab}]")[1].split("\n\n")[0]
        for rx in (rf"cap 20, lever 0: J [^;]*; minus unconstrained {dj:+.3f} ", rf"cap 45, lever 0: [^\n]*dead {d45} ", rf"cap 45, lever 2: [^\n]*dead {d45l2} "):
            if not re.search(rx, block):
                bad.append(f"m7f_sweep/results.txt [{lab}] no longer matches {rx!r}")
    m7g = open(os.path.join(EXP, "m7g_lever2", "results.txt")).read()
    base45, ideal45, room45, peaks = 0, 0, 0, []
    for lab in ("M=1.25", "M=1.43", "M=1.67"):
        line = re.search(rf"\[above, {re.escape(lab)}\](?:\n[^\n]*)*?\n  cap 45: dead base (\d+); dead85 \d+; ideal mixer (\d+); ideal mixer, 2x torque (\d+)[^\n]*\n[^\n]*peak D ([\d.]+) S 0\.50", m7g)
        if not line:
            bad.append(f"m7g_lever2/results.txt: no cap-45 rows for [above, {lab}]"); continue
        base45 += int(line[1]); ideal45 += int(line[2]); room45 += int(line[3]); peaks.append(line[4])
    if (base45, ideal45, room45) != (37, 8, 0) or not all(p in ("0.87", "0.88") for p in peaks):
        bad.append(f"m7g_lever2 pooled cap-45 counts {base45}/{ideal45}/{room45}, peaks {peaks}; draft quotes 37/8/0 and 0.87-0.88")
    for q in ("from 37 to\n8", "0.87–0.88", "against 0.50 in the survivors"):
        if q not in draft:
            bad.append(f"DRAFT.md no longer quotes {q!r}")
    row = "| held-out J − unconstrained, 20°, trained lever | 0 | " + " | ".join(f"{a[1]:.3f}".replace("-", "−") for a in ARMS) + " |"
    if row not in draft:
        bad.append(f"DRAFT.md table row differs from results: expected {row!r}")
    for b in bad:
        print("FAIL", b)
    print(f"{len(CHECKS) + 3 * len(ARMS) + 2 - len(bad)} of {len(CHECKS) + 3 * len(ARMS) + 2} checks ok")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
