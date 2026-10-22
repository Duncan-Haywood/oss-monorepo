"""The cursor imitation game with an open code model as the imitator.

Reuses mimic-cursor's data, detector, scoring and copy test. The imitator is a
local Qwen2.5-Coder model that rewrites a Python stroke generator each round.
Per round it writes BUDGET candidates (the component search gets the same
BUDGET); the best by the loop detector's score replaces the current program if
it beats it. Conditions: blind (the model sees its code and the detector's
score) or feedback (it also sees which features the detector runs and how
people and its strokes differ on each).

Usage: python3 codeloop.py [rounds] [seeds] [model]
"""
import os

for _v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
    os.environ.setdefault(_v, "4")

import json  # noqa: E402
import sys  # noqa: E402
import time  # noqa: E402

import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "mimic-cursor"))
sys.path.insert(0, HERE)
import game as G  # noqa: E402
import programs as P  # noqa: E402
import run as R  # noqa: E402
import sandbox as S  # noqa: E402

RES = os.path.join(HERE, "results")
MODEL = "Qwen/Qwen2.5-Coder-1.5B-Instruct"
BUDGET = G.BUDGET
MAX_FAIL = 0.02

NAIVE_SRC = '''def generate(start, end, rng):
    # straight line at constant speed, 400 ms, one event every 16 ms
    t = np.append(np.arange(0, 400, 16.0), 400.0)
    u = t / 400.0
    pts = start + np.outer(u, end - start)
    return np.column_stack([t, pts])
'''

COLS = {
    "timing": ["log duration", "log duration per Fitts difficulty"],
    "straight": ["log path length / chord", "max deviation / chord"],
    "speed": ["speed variation (sd/mean)", "peak speed / mean speed"],
    "peak": ["time of peak speed (fraction of duration)"],
    "jerk": ["log mean jerk (scaled)"],
    "dt": ["log median event interval", "interval variation (sd/mean)", "share of events at the most common interval"],
    "steps": ["share of events with zero x step", "share with zero y step",
              "share of steps of at most 1 px", "share of events at non-integer coordinates"],
    "submove": ["number of speed peaks", "overshoot beyond the target / chord"],
    "heading": ["mean absolute heading change", "share of heading reversals"],
    "rate": ["log event count", "events per 100 ms"],
    "endphase": ["progress at half the time", "share of time spent after reaching 90% of the way"],
}


class Code:
    """A model-written generator; strokes that crash are replaced by the naive
    line and counted, so a program that mostly crashes is invalid."""

    def __init__(self, src):
        self.src = src
        self.fn = S.compile_generator(src)
        self.fails = 0
        self.total = 0

    def imitate(self, contexts, seed):
        rng = np.random.default_rng(seed)
        out = []
        for c in contexts:
            self.total += 1
            try:
                out.append(S.run(self.fn, c[0, 1:], c[-1, 1:], rng))
            except ValueError:
                self.fails += 1
                out.append(P.generate(P.NAIVE, c[0, 1:], c[-1, 1:], rng))
        return out


_orig_imitate = G.imitate


def _imitate(genome, contexts, seed):
    if isinstance(genome, Code):
        return genome.imitate(contexts, seed)
    return _orig_imitate(genome, contexts, seed)


G.imitate = _imitate


def feedback_text(pl, fh, fi):
    lines = []
    for g in pl.groups:
        for k, name in enumerate(COLS[g]):
            h, o = fh[g][:, k], fi[g][:, k]
            sd = np.sqrt((h.var() + o.var()) / 2) + 1e-9
            lines.append(f"- {name}: people {h.mean():.3f}, yours {o.mean():.3f} (gap {abs(h.mean() - o.mean()) / sd:.1f} sd)")
    return "\n".join(lines)


SYSTEM = ("You write Python functions that generate synthetic mouse-cursor strokes for a research "
          "study on detecting automated browsing. Reply with one python code block and nothing else.")


def make_prompt(src, score, fb):
    p = ("A detector tells strokes made by people filling in a web form from strokes made by this "
         "generator. Rewrite the generator so the detector finds it harder to tell them apart.\n\n"
         "Contract: define `generate(start, end, rng)`. `start` and `end` are numpy arrays [x, y] in "
         "screen pixels (distances are typically 50 to 800 px); `rng` is a numpy Generator. Return a numpy "
         "array of shape (n, 3) with columns time in ms (starting at 0, strictly increasing), x, y. "
         "Use only `np` and `math`, which are already available. No imports.\n\n"
         f"Current generator:\n```python\n{src}```\n"
         f"The detector's mean log-odds that its strokes are human is {score:.2f} (higher is better; a person scores about 0).\n")
    if fb:
        p += ("The detector currently looks at these measurements of each stroke; compare people with your strokes:\n"
              f"{fb}\n")
    return p + "Write the improved full function."


class Writer:
    def __init__(self, model):
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer
        self.torch = torch
        self.tok = AutoTokenizer.from_pretrained(model)
        self.mod = AutoModelForCausalLM.from_pretrained(model, dtype=torch.float32)

    def write(self, prompt, seed):
        t = self.torch
        t.manual_seed(seed)
        msgs = [{"role": "system", "content": SYSTEM}, {"role": "user", "content": prompt}]
        ids = self.tok.apply_chat_template(msgs, add_generation_prompt=True, return_tensors="pt", return_dict=True)
        with t.no_grad():
            out = self.mod.generate(**ids, max_new_tokens=450, do_sample=True, temperature=0.8, top_p=0.95)
        return self.tok.decode(out[0][ids["input_ids"].shape[1]:], skip_special_tokens=True)


def play(cond, seed, rounds, writer, env):
    pool, ref, tst, fref, ftst = env
    pl = G.Player("blind", np.random.default_rng(1000 + seed))  # detector side: no shared code, as in blind
    pl.genome = Code(NAIVE_SRC)
    see = cond == "feedback"
    hist = []
    r0, _ = R.reference_auroc(pl.genome, ref, tst, fref, ftst)
    hist.append({"round": 0, "reference": r0})
    for rnd in range(1, rounds + 1):
        s0 = time.time()
        d_fit = G.detector_step(pl, pool, rnd, seed * 1000 + rnd)
        rng = pl.rng
        ctx = [pool[i] for i in rng.choice(len(pool), G.N_CTX, replace=False)]
        fh = P.features(ctx)

        def evaluate(code):
            code.fails = code.total = 0
            strokes = code.imitate(ctx, seed * 1000 + rnd + 500)
            fi = P.features(strokes)
            sc = -float(np.mean(pl.clf.decision_function(P.stack(fi, pl.groups))))
            if code.fails / max(code.total, 1) > MAX_FAIL or G.copy_rate(strokes) > G.MAX_COPY:
                sc += 1e6
            return sc, fi

        base, fi0 = evaluate(pl.genome)
        fb = feedback_text(pl, fh, fi0) if see else None
        best, cands = (base, pl.genome), []
        for k in range(BUDGET):
            reply = writer.write(make_prompt(pl.genome.src, -base, fb), seed * 100000 + rnd * 100 + k)
            src = S.extract(reply)
            rec = {"valid": False}
            try:
                code = Code(src)
                sc, _ = evaluate(code)
                rec.update(valid=sc < 1e5, score=sc, fail_rate=code.fails / max(code.total, 1))
                if not rec["valid"]:
                    print(f"   candidate invalid: fail rate {rec['fail_rate']:.2f}", flush=True)
                if sc < best[0]:
                    best = (sc, code)
            except ValueError as e:
                rec["error"] = str(e)
                print("   candidate rejected:", e, flush=True)
            cands.append(rec)
        pl.genome = best[1]
        ref_a, fi_te = R.reference_auroc(pl.genome, ref, tst, fref, ftst)
        loop_a = G.auroc(pl.clf, pl.groups, ftst, fi_te)
        hist.append({"round": rnd, "detector_cv": d_fit, "loop_test": loop_a, "reference": ref_a,
                     "groups": pl.groups, "candidates": cands, "src": pl.genome.src, "seconds": time.time() - s0})
        print(f"{cond} s{seed} r{rnd}: loop-test {loop_a:.3f} ref {ref_a:.3f} "
              f"valid {sum(c['valid'] for c in cands)}/{BUDGET} {pl.groups} {time.time() - s0:.0f}s", flush=True)
    return {"condition": cond, "seed": seed, "model": MODEL, "rounds": hist,
            "note": "Generated cursor strokes are simulated; nothing was sent to any site."}


def main():
    rounds = int(sys.argv[1]) if len(sys.argv) > 1 else 6
    seeds = int(sys.argv[2]) if len(sys.argv) > 2 else 3
    model = sys.argv[3] if len(sys.argv) > 3 else MODEL
    os.makedirs(RES, exist_ok=True)
    pool, test, copyref = R.split()
    P.set_human(pool)
    R.setup_copy(pool, copyref)
    ref, tst = R.fixed_sets(pool, test)
    env = (pool, ref, tst, P.features(ref), P.features(tst))
    writer = Writer(model)
    for seed in range(seeds):
        for cond in ("blind", "feedback"):
            path = os.path.join(RES, f"run_{cond}_{seed}.json")
            if os.path.exists(path):
                continue
            out = play(cond, seed, rounds, writer, env)
            with open(path, "w") as f:
                json.dump(out, f, indent=1)


if __name__ == "__main__":
    main()
