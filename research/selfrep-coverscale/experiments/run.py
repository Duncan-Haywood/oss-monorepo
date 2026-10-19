import pathlib, random, statistics, sys, time
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_coverscale import cover as c

N_INST = 100
out = ["synthetic instances (assumed generator, see README): lines = 2n/3, 1-3 lines per substitution, penalties U[0.3,0.9], log-normal line weights",
       f"{N_INST} instances per row, seed 0; ratio = value / exact optimum, budget = 25% of total penalty",
       "== mean (and worst) ratio to the exact optimum, by number of substitutions n and overlap",
       "n   overlap  greedy mean(worst)   greedy+single      local search      random 64        greedy optimal"]
for n in (7, 12, 18, 24):
    for ov in (0.0, 0.5, 0.9):
        rng = random.Random(0)
        rs = {k: [] for k in ("g", "gs", "ls", "rs")}
        gopt = 0
        for _ in range(N_INST):
            w, cov, pen = c.random_instance(rng, n, max(4, 2 * n // 3), ov)
            b = 0.25 * sum(pen)
            e = c.exact(w, cov, pen, b)
            g = c.greedy(w, cov, pen, b)
            rs["g"].append(g / e); rs["gs"].append(c.greedy_plus_single(w, cov, pen, b) / e)
            rs["ls"].append(c.local_search(rng, w, cov, pen, b) / e)
            rs["rs"].append(c.random_search(rng, w, cov, pen, b, 64) / e)
            gopt += g >= e - 1e-9
        f = lambda k: f"{100*statistics.mean(rs[k]):6.2f}% ({100*min(rs[k]):5.1f}%)"
        out.append(f"{n:2d}  {ov:5.1f}   {f('g')}   {f('gs')}   {f('ls')}   {100*statistics.mean(rs['rs']):6.2f}%      {gopt}/{N_INST}")
text = "\n".join(out)
print(text)
(pathlib.Path(__file__).parent / "results.txt").write_text(text + "\n")
