"""Runs the proposer files and the sweep baseline through the same gate and scorer; writes results.txt."""
import itertools, json, random, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from chip_ppa_logic import flow, sweep  # noqa: E402

SEEDS = 200
SPEC = {'pop16': 'for-loop sum of 16 bits', 'clz16': 'for-loop, last set bit wins', 'absd8': '(a > b) ? a - b : b - a'}


def adp(sc):
    return sc["cells"] * sc["depth"]


def evaluate(design, top, text, tmp, tag):
    f = Path(tmp) / f"{tag}.v"
    f.write_text(text)
    ref = ROOT / "designs" / f"{design}.v"
    if not flow.equivalent(ref, top, f, top):
        return None
    return flow.score(f, top)


def main():
    out, summary = [], {}
    tmp = tempfile.mkdtemp()
    for design, space, gen in (("pop16", sweep.pop16_config_space(), sweep.gen_pop16),
                               ("clz16", sweep.clz16_config_space(), sweep.gen_clz16),
                               ("absd8", sweep.absd8_config_space(), sweep.gen_absd8)):
        ref = flow.score(ROOT / "designs" / f"{design}.v", design)
        out.append(f"== {design}: reference `{SPEC[design]}` -> cells {ref['cells']}, depth {ref['depth']}, cells*depth {adp(ref)}")
        files = sorted((ROOT / "proposals" / design).glob("*.v"))
        prop = []
        out.append(f"-- proposer (session-written), {len(files)} attempts")
        for f in files:
            sc = evaluate(design, design, f.read_text(), tmp, f.stem)
            prop.append(sc)
            out.append(f"  {f.stem:24s} " + ("REJECTED (not equivalent)" if sc is None else f"cells {sc['cells']:4d} depth {sc['depth']:3d} cells*depth {adp(sc)}"))
        budget = len(files)
        best_p = min([adp(s) for s in prop if s] + [adp(ref)])
        # exhaustive sweep
        allsc = {}
        for cfg in space:
            sc = evaluate(design, design, gen(*cfg), tmp, "sw_" + "_".join(map(str, cfg)))
            allsc[cfg] = sc
        bad = [c for c, s in allsc.items() if s is None]
        good = {c: adp(s) for c, s in allsc.items() if s}
        best_all = min(good.values())
        out.append(f"-- sweep: {len(space)} configs, {len(bad)} not equivalent; exhaustive best cells*depth {best_all} at {min(good, key=good.get)}")
        for c in space:
            s = allsc[c]
            if s:
                out.append(f"  {str(c):22s} cells {s['cells']:4d} depth {s['depth']:3d} cells*depth {adp(s)}")
        # random subsets of size `budget` (reference counted as free starting point, like the proposer)
        bests = []
        for seed in range(SEEDS):
            pick = random.Random(seed).sample(list(good), min(budget, len(good)))
            bests.append(min([good[c] for c in pick] + [adp(ref)]))
        mean = sum(bests) / len(bests)
        wins = sum(b < best_p for b in bests)
        ties = sum(b == best_p for b in bests)
        out.append(f"-- equal budget = {budget} evaluations; reference counted as the starting point for both")
        out.append(f"   proposer best cells*depth {best_p} ({best_p/adp(ref):.3f} x reference)")
        out.append(f"   sweep (random {budget} of {len(good)}, {SEEDS} seeds): mean best {mean:.1f}, min {min(bests)}, max {max(bests)}; "
                   f"beats proposer in {wins}/{SEEDS}, ties in {ties}/{SEEDS}")
        out.append("")
        summary[design] = dict(ref=adp(ref), proposer=best_p, sweep_exhaustive=best_all, sweep_mean=mean)
    out.append("summary " + json.dumps(summary))
    text = "\n".join(out) + "\n"
    (ROOT / "experiments" / "results.txt").write_text(text)
    print(text)


if __name__ == "__main__":
    main()
