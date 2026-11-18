"""Does a broadcast fragment Axelrod culture at larger L? (milestone 4, fifth run)

Runs src/civ_levers/axelrod.c with a global media field (probability B per event), uniform
and Poisson traits, F in {3, 10}, L in {20, 40}. q is set relative to q_half measured with
B = 0 (scaling_results.txt, poisson_results.txt) so each cell is in the ordered phase
without media. Prints mean S, regions and media-share with 1.96 s.e. Usage: python3 media.py [--quick]
"""
import math
import os
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "..", "src", "civ_levers", "axelrod.c")
EXE = os.path.join(tempfile.gettempdir(), "civ_axelrod_media")


def cell(L, F, q, B, runs, mode):
    out = subprocess.run([EXE, str(L), str(F), str(q), "7", str(runs), mode, str(B)],
                         capture_output=True, text=True, timeout=1500).stdout
    return [list(map(float, ln.split())) for ln in out.strip().splitlines()]


def stat(col):
    m = sum(col) / len(col)
    se = math.sqrt(sum((x - m) ** 2 for x in col) / max(1, len(col) - 1) / len(col))
    return m, 1.96 * se


def main():
    runs = 6 if "--quick" in sys.argv else 24
    subprocess.run(["gcc", "-O2", "-o", EXE, SRC, "-lm"], check=True)
    Bs = [0, 0.003, 0.01, 0.03, 0.1, 0.3]
    plan = [("uniform F3 L20", 20, 3, 8, "uniform"), ("uniform F3 L40", 40, 3, 10, "uniform"),
            ("uniform F10 L20", 20, 10, 25, "uniform"), ("uniform F10 L40", 40, 10, 30, "uniform"),
            ("poisson F10 L20", 20, 10, 80, "poisson"), ("poisson F10 L40", 40, 10, 120, "poisson")]
    jobs = [(p, B) for p in plan for B in Bs]
    with ThreadPoolExecutor(os.cpu_count() or 2) as ex:
        res = list(ex.map(lambda j: cell(j[0][1], j[0][2], j[0][3], j[1], runs, j[0][4]), jobs))
    print("label, q, B: S regions media_share (mean +- 95%%, %d runs)" % runs)
    for (p, B), rows in zip(jobs, res):
        S, sS = stat([r[0] for r in rows]); R, sR = stat([r[1] for r in rows]); M, sM = stat([r[3] for r in rows])
        print(f"{p[0]:16s} q={p[3]:<4} B={B:<6} S={S:.3f}+-{sS:.3f} regions={R:.1f}+-{sR:.1f} media_share={M:.3f}+-{sM:.3f}")


main()
