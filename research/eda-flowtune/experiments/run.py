"""Evaluate every ABC pass sequence of length 0..3 on each design, then run the transfer and search analyses.
Writes table.json (cache; delete to recompute), results.txt and transfer.png. Run from research/eda-flowtune."""
import json
import subprocess
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT / "src"))
from eda_flowtune import analysis as A  # noqa: E402
from eda_flowtune import space as S  # noqa: E402
from eda_flowtune.space import flow  # noqa: E402

LIB = ROOT / S.LIB
SEEDS = 200
BUDGETS = (5, 10, 20, 40)


def job(args):
    d, k = args
    return d, k, S.evaluate(d, S.unkey(k), LIB)


def build_table():
    seqs = S.all_sequences()
    jobs = [(d, S.key(s)) for d in S.DESIGNS for s in seqs]
    table = {d: {} for d in S.DESIGNS}
    with ProcessPoolExecutor() as ex:
        for d, k, v in ex.map(job, jobs, chunksize=20):
            table[d][k] = v if v != float("inf") else None
    return table


def main():
    tpath = HERE / "table.json"
    if not tpath.exists():
        tpath.write_text(json.dumps(build_table()))
    raw = json.loads(tpath.read_text())
    tables = {d: {S.unkey(k): (float("inf") if v is None else v) for k, v in t.items()} for d, t in raw.items()}
    names = sorted(tables)
    out = []
    P = out.append
    yv = subprocess.run(["yosys", "-V"], capture_output=True, text=True).stdout.strip()
    P(f"tool: {yv}; liberty sky130_fd_sc_hd__tt_025C_1v80 (ORFS e5cc6e7); score = area(um^2) x ABC static delay(ns)")
    P(f"space: {len(S.all_sequences())} sequences (length 0..{S.MAXLEN} over {len(S.PASSES)} passes) x {len(names)} designs\n")
    base = {d: S.evaluate_named(d, "strash_map", LIB) for d in names}
    resyn = {d: S.evaluate_named(d, "resyn2_map", LIB) for d in names}
    P("per design: optimum | best sequence | aborted | median finite / opt | strash;map / opt | resyn2 / opt")
    for d in names:
        t = tables[d]
        s, o = A.optimum(t)
        fin = sorted(v for v in t.values() if v != float("inf"))
        P(f"{d:9s} {o:9.1f}  {'|'.join(s) or '(none)':32s} aborted {len(t) - len(fin):3d}  "
          f"median {fin[len(fin) // 2] / o:5.2f}  strash;map {base[d] / o:5.2f}  resyn2 {resyn[d] / o:5.2f}")
    rc = A.rank_correlation(tables)
    P("\nSpearman rank correlation of scores between designs (sequences finite on both):")
    P(" " * 10 + "".join(f"{b:>9s}" for b in names))
    for a in names:
        P(f"{a:9s} " + "".join(f"{rc[(a, b)]:9.2f}" for b in names))
    off = [rc[(a, b)] for a in names for b in names if a < b]
    P(f"off-diagonal: min {min(off):.2f}, median {sorted(off)[len(off) // 2]:.2f}, max {max(off):.2f}")
    tm = A.transfer_matrix(tables)
    P("\nTransfer: target's score under the SOURCE's best sequence / target optimum (rows source, columns target; inf = aborts):")
    P(" " * 10 + "".join(f"{b:>9s}" for b in names))
    for a in names:
        P(f"{a:9s} " + "".join(f"{tm[(a, b)]:9.3f}" for b in names))
    loo = A.leave_one_out(tables, base)
    P("\nLeave-one-out, per target, regret = score / target optimum:")
    P("target     consensus (rank of 400)  single-source mean/worst  median seq  strash;map")
    for t in names:
        r = loo[t]
        P(f"{t:9s} {r['consensus']:9.3f} ({r['consensus_rank_in_target']:3d})        "
          f"{r['single_source_mean']:7.3f} / {r['single_source_worst']:7.3f}   {r['median_sequence']:8.3f}  {r['baseline']:9.3f}")
    ss = A.search_study(tables, BUDGETS, SEEDS)
    P(f"\nSearch on each target, {SEEDS} seeds, median best-found / optimum (share of seeds reaching the optimum):")
    P("random = uniform sequences; hill = hill climbing; warm = hill climbing whose first 3 evaluations are the other designs' consensus top 3")
    for b in BUDGETS:
        P(f"budget {b}")
        for t in names:
            P(f"  {t:9s} " + "  ".join(f"{m} {ss[(t, m, b)]['median']:6.3f} ({ss[(t, m, b)]['hit']:4.0%})" for m in ("random", "hill", "warm")))
    for b in BUDGETS:
        for m in ("random", "hill", "warm"):
            v = sorted(ss[(t, m, b)]["median"] for t in names)
            P(f"mean over designs, budget {b:2d}, {m:6s}: {sum(v) / len(v):.3f}")
    # equivalence of each design's best mapped netlist to its RTL
    P("\nBest-sequence netlist proved equivalent to the RTL (Yosys miter + sat over all inputs):")
    import tempfile, os
    for d in names:
        s, _ = A.optimum(tables[d])
        flow.SCRIPTS["best"] = S.script_text(s)
        f = ROOT / "designs" / f"{d}.v"
        r, ok = flow.map_checked(f, S.DESIGNS[d], f, S.DESIGNS[d], "best", str(LIB))
        P(f"  {d:9s} {ok}")
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import numpy as np
    fig, ax = plt.subplots(1, 2, figsize=(11, 4.4))
    m = np.array([[min(tm[(a, b)], 3.0) for b in names] for a in names])
    im = ax[0].imshow(m, cmap="viridis_r", vmin=1, vmax=3)
    ax[0].set_xticks(range(len(names)), names, rotation=45, ha="right")
    ax[0].set_yticks(range(len(names)), names)
    ax[0].set_xlabel("target design")
    ax[0].set_ylabel("design the sequence was tuned on")
    ax[0].set_title("Transfer: score / target optimum (capped at 3)")
    for i in range(len(names)):
        for j in range(len(names)):
            ax[0].text(j, i, f"{tm[(names[i], names[j])]:.2f}", ha="center", va="center", fontsize=6, color="w")
    fig.colorbar(im, ax=ax[0], fraction=0.046)
    w = 0.25
    for i, mth in enumerate(("random", "hill", "warm")):
        ax[1].bar(np.arange(len(BUDGETS)) + (i - 1) * w,
                  [np.mean([ss[(t, mth, b)]["median"] for t in names]) for b in BUDGETS], w, label=mth)
    ax[1].set_xticks(range(len(BUDGETS)), [str(b) for b in BUDGETS])
    ax[1].set_xlabel("evaluation budget (distinct sequences)")
    ax[1].set_ylabel("best found / optimum (mean over designs of medians)")
    ax[1].set_ylim(1.0, None)
    ax[1].legend()
    ax[1].set_title("Search with and without a transferred warm start")
    fig.tight_layout()
    fig.savefig(HERE / "transfer.png", dpi=110)


if __name__ == "__main__":
    main()
