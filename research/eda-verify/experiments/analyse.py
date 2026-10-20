"""Summarise mutants.jsonl into results.txt and kill_curve.png. Ground truth: a mutant is `killable` if the formal
bounded check or any simulation found a difference; `equivalent` if the induction proof succeeded; the rest are
`undecided` and are excluded from kill-rate denominators (and counted separately)."""
import json, os
import numpy as np
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
R = [json.loads(l) for l in open(os.path.join(HERE, "mutants.jsonl"))]
meta = json.load(open(os.path.join(HERE, "meta.json")))
for r in R:
    sim_kill = any(f is not None for f in r["random_first"]) or r["directed_first"] is not None
    r["truth"] = "killable" if (r["formal"] == "killed" or sim_kill) else r["formal"]
K = [r for r in R if r["truth"] == "killable"]
E_ = [r for r in R if r["truth"] == "equivalent"]
U = [r for r in R if r["truth"] == "undecided"]
lines = [f"tools: {meta['tools']}", f"design: p=8, wb=4 MAC accelerator; formal bound {meta['bound_cycles']} cycles; "
         f"{meta['seeds']} random seeds",
         f"mutants: {meta['n_enumerated']} enumerated, {meta['n_sampled']} sampled, {meta['n_compile']} compile; "
         f"killable {len(K)}, proved equivalent {len(E_)}, undecided {len(U)}"]
for kind in sorted({r["kind"] for r in R}):
    kk = [r for r in K if r["kind"] == kind]; ee = [r for r in E_ if r["kind"] == kind]; uu = [r for r in U if r["kind"] == kind]
    lines.append(f"  {kind}: killable {len(kk)}, equivalent {len(ee)}, undecided {len(uu)}")
budgets = [1, 2, 4, 8, 16, 32, 64]
curve = []
lines.append("\nkill rate over killable mutants (random inputs; mean over seeds, then over mutants):")
for n in budgets:
    rate = np.mean([np.mean([f is not None and f < n for f in r["random_first"]]) for r in K])
    curve.append(rate); lines.append(f"  random, {n:2d} vectors: {rate:.3f}")
d_rate = np.mean([r["directed_first"] is not None for r in K])
lines.append(f"  coverage-directed, 16 vectors (one deterministic set): {d_rate:.3f}")
lines.append(f"  formal (bounded {meta['bound_cycles']} cycles): {np.mean([r['formal'] == 'killed' for r in K]):.3f}")
hard = [r for r in K if all(f is None for f in r["random_first"])]
lines.append(f"\nkillable mutants never caught by 64 random vectors in any seed: {len(hard)}: " + ", ".join(r["id"] for r in hard))
dh = [r for r in hard if r["directed_first"] is not None]
lines.append(f"  of those, caught by the 16 directed vectors: {len(dh)}; by formal: {sum(r['formal'] == 'killed' for r in hard)}")
fm = [r for r in K if r["formal"] != "killed"]
lines.append(f"killable mutants formal did not kill (found by simulation): {len(fm)}: " + ", ".join(f"{r['id']}[{r['formal']}]" for r in fm))
rs = np.mean([r["random_seconds"] for r in R]); ds = np.mean([r["directed_seconds"] for r in R])
fs = np.mean([r["formal_seconds"] for r in K if r["formal"] == "killed"] or [np.nan])
lines.append(f"\nCPU seconds per mutant: random 64-vector run {rs:.2f}, directed (incl. generation) {ds:.2f}, "
             f"formal kill {fs:.1f}; equivalence proofs {np.mean([r['formal_seconds'] for r in E_] or [np.nan]):.1f}")
lines.append("kills per CPU-minute (killable mutants killed by that checker / its total seconds on all killable mutants):")
lines.append(f"  random-64 (one seed's run; mean over seeds): {60 * np.mean([np.mean([f is not None for f in r['random_first']]) for r in K]) * len(K) / sum(r['random_seconds'] for r in K):.1f}")
lines.append(f"  directed-16: {60 * sum(r['directed_first'] is not None for r in K) / sum(r['directed_seconds'] for r in K):.1f}")
lines.append(f"  formal: {60 * sum(r['formal'] == 'killed' for r in K) / sum(r['formal_seconds'] for r in K):.2f}")
open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")
print("\n".join(lines))
fig, ax = plt.subplots(figsize=(5.5, 3.6))
ax.plot(budgets, curve, "o-", label="random vectors"); ax.set_xscale("log", base=2)
ax.axhline(d_rate, color="C1", ls="--", label="coverage-directed (16)")
ax.axhline(np.mean([r["formal"] == "killed" for r in K]), color="C2", ls=":", label="formal (bounded)")
ax.set_xlabel("test vectors"); ax.set_ylabel("fraction of killable mutants killed"); ax.set_ylim(0, 1.02); ax.legend(loc="lower right")
fig.tight_layout(); fig.savefig(os.path.join(HERE, "kill_curve.png"), dpi=130)
