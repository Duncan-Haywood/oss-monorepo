"""Detection-probability analysis of the eda-verify mutation log. Stdlib only.

Reads ../../eda-verify/experiments/mutants.jsonl, writes results.txt (and results.json) next to this file."""
import json, math, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
LOG = os.path.join(HERE, "..", "..", "eda-verify", "experiments", "mutants.jsonl")
NMAX = 64


def load(path=LOG):
    return [r for r in map(json.loads, open(path)) if r["compiles"]]


def exposure(first, nmax=NMAX):
    """Geometric-model exposure for one mutant: a seed whose first mismatch is at index k contributes k+1 trials and
    one detection; a seed with no mismatch in nmax vectors contributes nmax trials and none."""
    kills = sum(f is not None for f in first)
    trials = sum((f + 1) if f is not None else nmax for f in first)
    return kills, trials


def p_hat(first, nmax=NMAX):
    k, t = exposure(first, nmax)
    return k / t if t else 0.0


def p_upper(trials, conf=0.95):
    """Upper confidence bound on a per-vector detection probability after `trials` vectors with no detection."""
    return 1 - (1 - conf) ** (1.0 / trials)


def vectors_needed(p, conf=0.95):
    """Vectors needed to see a bug whose per-vector detection probability is p with probability conf."""
    return math.ceil(math.log(1 - conf) / math.log(1 - p)) if p < 1 else 1


def classify(first):
    """'first-vector' (caught by vector 0 in every seed), 'fixed-index' (the same later index in every seed, so
    the seeds do not behave as independent draws: a stall or truncated output), 'sampled' (detections vary
    with the seed), 'never' (no detection in any seed)."""
    ks = [f for f in first if f is not None]
    if not ks:
        return "never"
    if len(ks) == len(first) and len(set(ks)) == 1:
        return "first-vector" if ks[0] == 0 else "fixed-index"
    return "sampled"


def miss_curve(rows, ns):
    """Observed and geometric-model-predicted mean miss rate over `rows` at each budget n."""
    obs, pred = [], []
    for n in ns:
        o = m = 0.0
        for r in rows:
            f = r["random_first"]
            o += sum(1 for x in f if x is None or x >= n) / len(f)
            c = classify(f)
            if c == "sampled":
                m += (1 - p_hat(f)) ** n
            elif c == "never":
                m += 1.0
            else:       # the same index in every seed: a miss until the budget reaches it
                m += 1.0 if n <= min(x for x in f if x is not None) else 0.0
        obs.append(o / len(rows)); pred.append(m / len(rows))
    return obs, pred


def main():
    rows = load()
    out = {}
    L = []
    cls = {}
    for r in rows:
        cls.setdefault(classify(r["random_first"]), []).append(r)
    killable = [r for r in rows if r["formal"] == "killed" or any(x is not None for x in r["random_first"])]
    L.append(f"compiling mutants: {len(rows)}; killable (any random or formal kill): {len(killable)}")
    L.append("random-vector behaviour of all compiling mutants: " + ", ".join(f"{k} {len(v)}" for k, v in sorted(cls.items())))
    L.append("")
    L.append("per-vector detection probability, geometric MLE (kills / trials) over the 'sampled' mutants:")
    samp = sorted(cls.get("sampled", []), key=lambda r: p_hat(r["random_first"]))
    for r in samp:
        k, t = exposure(r["random_first"])
        L.append(f"  {r['id']:<22} formal={r['formal']:<10} seeds hit {k:>2}/20  p_hat {k/t:.3f}  (95% to see it: {vectors_needed(k/t)} vectors)")
    out["sampled"] = [{"id": r["id"], "formal": r["formal"], "p_hat": p_hat(r["random_first"])} for r in samp]
    L.append("")
    fixed = cls.get("fixed-index", [])
    L.append(f"'fixed-index' mutants (same first-mismatch index in all 20 seeds, index > 0): {len(fixed)}")
    for r in fixed:
        L.append(f"  {r['id']:<22} formal={r['formal']:<10} index {r['random_first'][0]}")
    L.append("")
    nev = cls.get("never", [])
    trials = 20 * NMAX
    L.append(f"never detected by random vectors: {len(nev)} mutants; formal verdicts: " +
             ", ".join(f"{v} {sum(1 for r in nev if r['formal']==v)}" for v in sorted({r['formal'] for r in nev})))
    L.append(f"each had {trials} random vectors with no mismatch: per-vector detection probability < {p_upper(trials):.5f} at 95% (rule of three: 3/{trials} = {3/trials:.5f})")
    L.append(f"  a bug that rare needs about {vectors_needed(p_upper(trials))} vectors to be seen with 95% probability")
    out["never_upper_p"] = p_upper(trials)
    L.append("")
    L.append("vectors needed to see a bug with per-vector detection probability p (95% / 99%):")
    for p in (0.5, 0.1, 0.01, 0.001, 0.0001):
        L.append(f"  p = {p:<7} {vectors_needed(p):>6} / {vectors_needed(p, 0.99):>6}")
    L.append("")
    ns = [1, 2, 4, 8, 16, 32, 64]
    kl = [r for r in rows if classify(r["random_first"]) != "never" and (r["formal"] != "equivalent")]
    obs, pred = miss_curve(kl, ns)
    L.append(f"== C. miss rate of random vectors over the {len(kl)} detectable mutants, observed vs geometric model fitted on the same data")
    L.append("n observed model")
    for n, o, p in zip(ns, obs, pred):
        L.append(f"{n} {o:.4f} {p:.4f}")
    out["curve"] = {"n": ns, "observed": obs, "model": pred}
    L.append("")
    # extrapolation: vectors for 1% / 0.1% expected miss among detectable mutants
    for tgt in (0.01, 0.001):
        n = 1
        while n < 10**6:
            m = sum((1 - p_hat(r["random_first"])) ** n if classify(r["random_first"]) == "sampled" else 0.0 for r in kl) / len(kl)
            if m <= tgt:
                break
            n += 1
        L.append(f"model: vectors until the expected miss rate over detectable mutants is <= {tgt:.1%}: {n}")
        out[f"n_for_{tgt}"] = n
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n")
    json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    print("\n".join(L))


if __name__ == "__main__":
    main()
