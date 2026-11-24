"""One command per experiment, and a check that a re-run gives the committed numbers.

    python3 reproduce.py --list                 # the experiments, what each needs, how long it takes
    python3 reproduce.py m7_cost                # re-run one in place: run.py > results.txt, then figure.py
    python3 reproduce.py --check m7_cost m5_cycle
    python3 reproduce.py --check --quick        # every experiment that needs only numpy/scipy and runs in minutes

``--check`` copies this project and its sibling ``buildbot-*`` projects to a temporary directory,
runs each experiment there (so nothing committed is overwritten), and compares the fresh
``results.txt`` with the committed one line by line. Lines that report wall-clock time or library
versions are left out of the comparison (``SKIP``, ``MASK``); every other line must match exactly. Exit
status 0 when every checked experiment reproduces, 1 otherwise. Stdlib only; the experiments
themselves need what ``--list`` says.
"""
import argparse
import difflib
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
RESEARCH = os.path.dirname(HERE)

# name: (needs, approximate minutes on four CPUs, extra scripts run after run.py as (script, stdout file or None))
EXPERIMENTS = {
    "m1_gap_placement": ("numpy", 0.2, []),
    "m2_asbuilt_studs": ("numpy", 0.7, []),
    "m3_ledger": ("numpy, mujoco", 1.6, []),
    "m3b_humanoid": ("numpy, mujoco, Menagerie G1/H1 (cloned once)", 6, []),
    "m4_tack_measure": ("numpy", 1.7, []),
    "m5_cycle": ("numpy", 1, []),
    "m6_drake": ("numpy, drake 1.51.1 (drake 1.58 has no TAMSI solver; run.py fails there)", 7, []),
    "m6b_bowed_edge": ("numpy, mujoco, drake", 8, [("envelope.py", "envelope.txt")]),
    "m7_cost": ("numpy; reads m5_cycle/results.json", 0.1, []),
    "m9_straighten": ("numpy, mujoco", 1, []),
    "m10_ceiling": ("numpy; reads m6b_bowed_edge/results.json", 1, []),
    "m11_measured": ("numpy; profiles.json (extract.py downloads the data set)", 0.3, []),
    "m12_remedies": ("numpy; reads m11 profiles.json", 0.7, []),
    "m13_price": ("numpy; reads m12_remedies/results.json", 0.1, []),
    "m14_escaped": ("numpy", 0.2, []),
    "m15_frame_joints": ("numpy, scipy", 11, []),
    "m16_soft_nails": ("numpy, scipy", 25, []),
    "m17_weiss_wall": ("numpy, scipy", 5, []),
    "m18_holddown_shear": ("numpy, scipy", 5, []),
    "m19_wall_pushover": ("numpy, scipy", 10, []),
    "m20_cyclic": ("numpy, scipy (ops_check.py: openseespy)", 70, []),
    "m21_degrading": ("numpy, scipy", 35, [("check_diag.py --walls", "check_diag.txt")]),
    "m27_slide_mech": ("numpy, mujoco, Menagerie G1/H1; reads m11 profiles.json, m6b results.json", 3, []),
    "m28_shim_mech": ("numpy, mujoco, Menagerie G1/H1; reads m11 profiles.json, m6b and m27 results.json", 1, []),
    "m29_tool_lean": ("numpy, scipy, mujoco, Menagerie G1/H1; reads m11 profiles.json, m6b and m27 results.json", 1,
                      []),
    "m30_backlash": ("numpy, scipy, mujoco, Menagerie G1/H1; reads m11 profiles.json, m6b and m27 results.json", 2.5,
                     []),
    "m31_pose_range": ("numpy, scipy, mujoco, Menagerie G1/H1; reads m11 profiles.json, m6b and m27 results.json",
                       2, []),
    "m32_grf_qp": ("numpy, scipy, mujoco, Menagerie G1/H1; reads m11 profiles.json, m6b and m27 results.json",
                   3.5, []),
    "m33_compensate": ("numpy, scipy, mujoco, Menagerie G1/H1; reads m11 profiles.json, m6b and m27 results.json",
                       5, []),
    "m34_windup": ("numpy, scipy, mujoco, Menagerie G1/H1; reads m11 profiles.json, m6b and m27 results.json",
                   12, []),
    "m35_hose": ("numpy, scipy, mujoco, Menagerie G1/H1; reads m11 profiles.json, m6b and m27 results.json",
                 9, []),
    "m36_wrist_ft": ("numpy, scipy, mujoco, Menagerie G1/H1; reads m11 profiles.json, m6b, m27 and m35 results.json",
                     35, []),
    "m37_preload": ("numpy, scipy, mujoco, Menagerie G1/H1; reads m11 profiles.json, m6b, m27, m35 and m36 results.json",
                    17, []),
    "m38_squeeze": ("numpy, scipy, mujoco, Menagerie G1/H1; reads m11 profiles.json, m6b, m27, m35 and m37 results.json",
                    20, []),
    "m39_waist": ("numpy, scipy, mujoco, Menagerie G1/H1; imports m38_squeeze/run.py and reads its inputs and results.json",
                  15, []),
    "m40_liftoff": ("numpy, scipy, mujoco, Menagerie G1/H1; imports m39_waist/run.py (and so m38's) and reads their inputs and results.json",
                    25, []),
    "m41_stance0": ("numpy, scipy, mujoco, Menagerie G1/H1; imports m38_squeeze/run.py twice (milestone 32's leans, then re-leaned) and reads m40 results.json",
                    4, []),
    "m42_sides": ("numpy, scipy, mujoco, Menagerie G1/H1; imports m41_stance0/run.py (and so m38's, twice) and reads m40 and m41 results.json",
                  3, []),
    "m43_specstack": ("numpy, scipy, mujoco, Menagerie G1/H1; imports m42_sides/run.py (and so m41's and m38's) and reads m40 and m42 results.json",
                      3, [("posthoc.py", "posthoc.txt")]),
    "m44_legpreload": ("numpy, scipy, mujoco, Menagerie G1/H1; imports m43_specstack/run.py (and so m42's, m41's and m38's) and reads m41 and m43 results.json",
                       4, [("posthoc.py", "posthoc.txt")]),
    "m45_tiered": ("numpy, scipy, mujoco, Menagerie G1/H1; imports m44_legpreload/run.py (and so m43's, m42's, m41's and m38's) and reads m41, m43 and m44 results.json",
                   4, [("posthoc.py", "posthoc.txt")]),
    "m46_holdside": ("numpy, scipy, mujoco, Menagerie G1/H1; imports m45_tiered/run.py (and so m44's, m43's, m42's, m41's and m38's) and reads m41, m43 and m45 results.json",
                     3, []),
    "m47_poseside": ("numpy, scipy, mujoco, Menagerie G1/H1; imports m46_holdside/run.py (and so m45's, m44's, m43's, m42's, m41's and m38's) and reads m41, m43, m45 and m46 results.json",
                     12, []),
    "m48_loadside": ("numpy, scipy, mujoco, Menagerie G1/H1; imports m47_poseside/run.py (and so m46's, m45's, m44's, m43's, m42's, m41's and m38's) and reads m41, m43, m45, m46 and m47 results.json",
                     5, [("posthoc.py", "posthoc.txt")]),
    "m49_backload": ("numpy, scipy, mujoco, Menagerie G1/H1; imports m48_loadside/run.py (and so m47's to m38's) and reads m48 results.json and posthoc.txt",
                     3, [("posthoc.py", "posthoc.txt")]),
    "m50_relean": ("numpy, scipy, mujoco, Menagerie G1/H1; imports m49_backload/run.py (and so m48's to m38's) and reads m48 results.json",
                   3, [("posthoc.py", "posthoc.txt")]),
    "m51_envelope": ("numpy, scipy, mujoco, Menagerie G1/H1; imports m48_loadside/posthoc.py (and so m48's to m38's) and reads m48 and m50 results.json",
                     5, [("posthoc.py", "posthoc.txt")]),
    "m52_slackcal": ("numpy, scipy, mujoco, Menagerie G1/H1; imports m51_envelope/run.py (and so m48's to m38's) and reads m48 and m50 results.json",
                     4, []),
    "m53_loadside": ("numpy, scipy, mujoco, Menagerie G1/H1; imports m52_slackcal/run.py (and so m51's, m48's to m38's) and reads m52 results.json",
                     2, []),
    "m54_lhs": ("numpy, scipy, mujoco, Menagerie G1/H1; imports m53_loadside/run.py (and so m52's, m51's, m48's to m38's) and reads m50 and m52 results.json",
                10, [("posthoc.py", "posthoc.txt")]),
    "m55_robust": ("numpy, scipy, mujoco, Menagerie G1/H1; imports m54_lhs/run.py (and so m53's to m38's) and reads m50 and m52 results.json",
                   40, []),
    "m56_weighted": ("numpy, scipy, mujoco, Menagerie G1/H1; imports m55_robust/run.py (and so m54's to m38's), reads m50, m52 and m55 results.json",
                     60, []),
    "m57_beta": ("numpy, scipy, mujoco, Menagerie G1/H1; imports m56_weighted/run.py (and so m55's to m38's), reads m50 and m52 results.json",
                 20, []),
    "m58_tworow": ("numpy, scipy, mujoco, Menagerie G1/H1; imports m56_weighted/run.py (and so m55's to m38's), reads m50 and m52 results.json",
                   45, []),
    "m59_depth": ("numpy, scipy, mujoco, Menagerie G1/H1; imports m58_tworow/run.py (and so m56's to m38's), reads m50 and m52 results.json",
                  45, []),
    "m60_jointpreload": ("numpy, scipy, mujoco, Menagerie G1/H1; imports m59_depth/run.py via core.py (and so m58's to m38's), reads m50 and m52 results.json",
                         35, []),
    "m61_lastfour": ("numpy, scipy, mujoco, Menagerie G1/H1; imports m60_jointpreload/core.py (and so m59's to m38's), reads m50 and m52 results.json",
                     40, []),
    "m62_exactgate": ("numpy, scipy, mujoco, Menagerie G1/H1; imports m61_lastfour/run.py (and so m60's to m38's), reads m50 and m52 results.json",
                      30, [("probe.py", "probe.out")]),
    "m63_worstbias": ("numpy, scipy, mujoco, Menagerie G1/H1; imports m61_lastfour/run.py (and so m60's to m38's), reads m50 and m52 results.json",
                      60, []),
    "m64_overbias": ("numpy, scipy, mujoco, Menagerie G1/H1; imports m63_worstbias/run.py (and so m61's to m38's), reads m50 and m52 results.json",
                     60, []),
    "m65_resized": ("numpy, scipy, mujoco, Menagerie G1/H1; imports m63_worstbias/run.py (and so m61's to m38's), reads m50 and m52 results.json",
                    75, []),
    "m66_directterm": ("numpy, scipy, mujoco, Menagerie G1/H1; imports m65_resized/run.py (and so m63's to m38's), reads m50 and m52 results.json",
                       90, []),
    "m67_aimeddirect": ("numpy, scipy, mujoco, Menagerie G1/H1; imports m66_directterm/run.py (and so m65's to m38's), reads m50 and m52 results.json",
                        90, []),
    "m68_jgate": ("numpy, scipy, mujoco, Menagerie G1/H1; imports m67_aimeddirect/run.py (and so m66's to m38's), reads m67's results.json (the J table), m50 and m52 results.json",
                  120, []),
    "m69_tworef": ("numpy, scipy, mujoco, Menagerie G1/H1; imports m68_jgate/run.py (and so m67's to m38's), reads m67's results.json (the full J table), m50 and m52 results.json",
                   60, []),
    "m70_drift": ("numpy, scipy, mujoco, Menagerie G1/H1; imports m69_tworef/run.py (and so m68's to m38's), reads m67's results.json (the full J table), m50 and m52 results.json",
                  45, []),
    "m71_allowance": ("numpy, scipy, mujoco, Menagerie G1/H1; imports m70_drift/run.py (and so m69's to m38's), reads m70's results.json (the S table), m67's results.json (the full J table), m50 and m52 results.json",
                      75, []),
    "m72_rezero": ("numpy; reads m71's results.json", 0.1, []),
    "m73_randomwalk": ("numpy, scipy; imports m72_rezero/run.py, reads m71's results.json", 20, []),
    "m74_allocate": ("numpy, scipy; imports m73_randomwalk/run.py (and so m72's), reads m73's and m71's results.json", 15, []),
}
QUICK = [n for n, (needs, mins, _) in EXPERIMENTS.items()
         if mins <= 2 and "mujoco" not in needs and "drake" not in needs]

# Wall-clock time and library versions legitimately change between runs. A line that is only a timing
# (``303.4 s``) or the closing ``(run time ...; python ...)`` line is skipped; a timing in parentheses
# inside a result line (``cyclic runs 72 (2099 s); largest residual ...``) is masked, so the rest of
# that line is still compared. Every other character must match.
SKIP = re.compile(r"^\(?\d+(\.\d+)? s\)?$|\brun ?time\b|\belapsed\b|^wall time \d+ s\b", re.IGNORECASE)
MASK = re.compile(r"\(\d+(\.\d+)? s\)")
# m6_drake section F ends each simulator's row with its wall-clock seconds a seat
# (``drake  +0.00002  0.00142  0.00325  0.00466  0.114``): mask that last column only.
SEAT_TIME = re.compile(r"^((?:drake|mujoco)(?:\s+[-+]?\d+\.\d+){4}\s+)\d+\.\d+$")


def run_one(root, name, python):
    """Run experiment ``name`` under ``root`` (a project directory); return (seconds, error text or None)."""
    exp = os.path.join(root, "experiments", name)
    env = dict(os.environ, OMP_NUM_THREADS=os.environ.get("OMP_NUM_THREADS", "1"))
    t0 = time.time()
    steps = [("run.py", "results.txt")] + EXPERIMENTS[name][2]
    for script, out in steps:
        argv = [python] + [os.path.join(exp, script.split()[0])] + script.split()[1:]
        with open(os.path.join(exp, out), "w") if out else open(os.devnull, "w") as f:
            p = subprocess.run(argv, cwd=root, stdout=f, stderr=subprocess.PIPE, text=True, env=env)
        if p.returncode:
            return time.time() - t0, f"{script} exited {p.returncode}:\n{p.stderr[-2000:]}"
    return time.time() - t0, None


def stable(lines):
    return [SEAT_TIME.sub(r"\1<time>", MASK.sub("(<time> s)", ln.strip()))
            for ln in lines if not SKIP.search(ln.strip())]


def compare(committed, fresh):
    """Return the unified diff of the stable lines (empty when they match)."""
    with open(committed) as a, open(fresh) as b:
        old, new = stable(a.readlines()), stable(b.readlines())
    return list(difflib.unified_diff(old, new, "committed", "re-run", n=0, lineterm=""))


def check(names, python, keep=False):
    tmp = tempfile.mkdtemp(prefix="buildbot-sheathing-check-")
    for d in sorted(os.listdir(RESEARCH)):
        if d.startswith("buildbot-") and os.path.isdir(os.path.join(RESEARCH, d)):
            shutil.copytree(os.path.join(RESEARCH, d), os.path.join(tmp, d),
                            ignore=shutil.ignore_patterns("__pycache__", ".pytest_cache", "latex"))
    root = os.path.join(tmp, os.path.basename(HERE))
    bad = 0
    for name in names:
        secs, err = run_one(root, name, python)
        outs = ["results.txt"] + [o for _, o in EXPERIMENTS[name][2] if o]
        if err:
            bad += 1
            print(f"{name}: FAILED to run ({secs:.0f} s)\n{err}")
            continue
        diffs = {o: compare(os.path.join(HERE, "experiments", name, o), os.path.join(root, "experiments", name, o))
                 for o in outs}
        n = sum(len([d for d in v if d[:1] in "+-" and d[:3] not in ("+++", "---")]) for v in diffs.values())
        with open(os.path.join(HERE, "experiments", name, "results.txt")) as f:
            total = len(stable(f.readlines()))
        if n:
            bad += 1
            print(f"{name}: DIFFERS ({secs:.0f} s; {n} changed lines of {total} compared)")
            for o, v in diffs.items():
                for d in v[:80]:
                    print(f"  {o}: {d}")
        else:
            print(f"{name}: reproduces ({secs:.0f} s; {total} lines compared)")
    if keep:
        print(f"re-run copy kept at {tmp}")
    else:
        shutil.rmtree(tmp, ignore_errors=True)
    print(f"{len(names) - bad} of {len(names)} experiments reproduce")
    return 1 if bad else 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("names", nargs="*", help="experiment directories under experiments/")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--check", action="store_true", help="re-run in a temporary copy and compare results.txt")
    ap.add_argument("--quick", action="store_true", help="every numpy/scipy experiment of two minutes or less")
    ap.add_argument("--keep", action="store_true", help="keep the temporary copy after --check")
    ap.add_argument("--python", default=sys.executable)
    a = ap.parse_args(argv)
    if a.list:
        for n, (needs, mins, extra) in EXPERIMENTS.items():
            more = "".join(f"; then {s}" for s, _ in extra)
            print(f"{n:20s} ~{mins:g} min  needs {needs}{more}{'  [quick]' if n in QUICK else ''}")
        return 0
    names = (QUICK if a.quick else []) + [n for n in a.names if not (a.quick and n in QUICK)]
    unknown = [n for n in names if n not in EXPERIMENTS]
    if unknown or not names:
        ap.error(f"unknown experiment(s): {unknown}" if unknown else "name an experiment, --quick or --list")
    if a.check:
        return check(names, a.python, a.keep)
    for n in names:
        secs, err = run_one(HERE, n, a.python)
        fig = os.path.join(HERE, "experiments", n, "figure.py")
        if not err and os.path.exists(fig):
            p = subprocess.run([a.python, fig], cwd=HERE, stderr=subprocess.PIPE, text=True)
            err = p.stderr[-2000:] if p.returncode else None
        print(f"{n}: {'FAILED' if err else 'done'} ({secs:.0f} s){chr(10) + err if err else ''}")
        if err:
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
