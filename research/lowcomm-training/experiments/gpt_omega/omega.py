"""Milestone 6d: do rand-k-then-ternary compressors sit on rand-k's excess-versus-omega line? See LOG.md.
Cells: A = rand_k(1/4) then quantise(1); B = rand_k(1/8) then quantise(1); H in {4, 64}; seeds 0 to 2.
Realised omega = sum ||C(x)-x||^2 / sum ||x||^2 over every compressed delta of the run.
Usage: python3 omega.py run   then   python3 omega.py report. Results append to omega.jsonl."""
import json, os, sys, time
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
M, B, STEPS, LR = 4, 16, 3840, 2e-3
CELLS = {"A": 0.25, "B": 0.125}
HS, SEEDS = [4, 64], [0, 1, 2]
PATH = os.path.join(HERE, "omega.jsonl")
COMP = os.path.join(HERE, "..", "gpt_composition", "composition.jsonl")
OLD = os.path.join(HERE, "..", "gpt_retune_all", "retune.jsonl")
RAND = os.path.join(HERE, "..", "gpt_compression", "compression.jsonl")
load = lambda p: [json.loads(l) for l in open(p)] if os.path.exists(p) else []


def run(job):
    import torch
    torch.set_num_threads(1)
    from lowcomm import DiLoCo, GPT, GPTConfig, CharData, load_shakespeare, rand_k, quantise
    cell, H, seed = job
    data = CharData(load_shakespeare(os.path.join(HERE, "..", "tinyshakespeare.txt")))
    torch.manual_seed(seed)
    model = GPT(GPTConfig(vocab=data.vocab, block=64, layers=2, heads=4, dim=128))
    inner = lambda p: torch.optim.AdamW(p, lr=LR, betas=(0.9, 0.95), weight_decay=0.0)
    outer = lambda p: torch.optim.SGD(p, lr=1.0)
    sp, q, acc = rand_k(CELLS[cell]), quantise(1), [0.0, 0.0]
    def comp(x, gen):
        y = q(sp(x, gen), gen)
        acc[0] += ((y - x) ** 2).sum().item(); acc[1] += (x ** 2).sum().item()
        return y
    t0 = time.time()
    d = DiLoCo(model, lambda m, rng: m(*data.batch("train", B, rng)), workers=M, H=H, inner=inner, outer=outer, seed=seed, compress=comp)
    for _ in range(STEPS // H):
        d.round()
    model.eval()
    with torch.no_grad():
        vals = [model(x, y).item() for x, y in data.val_batches(32, 16)]
    loss = sum(vals) / len(vals)
    return {"cell": cell, "keep": CELLS[cell], "H": H, "seed": seed, "loss": loss if loss == loss else float("inf"),
            "omega": acc[0] / acc[1], "secs": round(time.time() - t0)}


def report():
    mean = lambda v: sum(v) / len(v)
    base, rk = {}, {}
    for r in load(OLD):
        if r["lr"] == LR and r["H"] in HS and r["seed"] in SEEDS: base.setdefault(r["H"], {})[r["seed"]] = r["loss"]
    for r in load(COMP):
        if r["keep"] == 1.0: base.setdefault(r["H"], {})[r["seed"]] = r["loss"]
        else: rk.setdefault((r["H"], r["keep"]), {})[r["seed"]] = r["loss"]
    out = load(PATH)
    ok = {}
    for H in HS:
        b = mean(list(base[H].values()))
        pts = sorted(((1 / p - 1, mean(list(rk[(H, p)].values())) - b) for (h, p) in rk if h == H), key=lambda t: t[0])
        def interp(w):
            for (w0, e0), (w1, e1) in zip(pts, pts[1:]):
                if w0 <= w <= w1: return e0 + (e1 - e0) * (w - w0) / (w1 - w0)
            (w0, e0), (w1, e1) = (pts[0], pts[1]) if w < pts[0][0] else (pts[-2], pts[-1])
            return e0 + (e1 - e0) * (w - w0) / (w1 - w0)
        print(f"H={H} rand-k excess by omega:", {round(w, 1): round(e, 4) for w, e in pts})
        for c in CELLS:
            rows = [r for r in out if r["cell"] == c and r["H"] == H]
            if not rows: continue
            w, loss = mean([r["omega"] for r in rows]), mean([r["loss"] for r in rows])
            m, po, pp = loss - b, interp(mean([r["omega"] for r in rows])), interp(1 / CELLS[c] - 1)
            ok[(c, H)] = (abs(po - m), abs(pp - m))
            print(f"  cell {c} (n={len(rows)}): realised omega {w:.1f}  measured {m:+.4f}  omega-pred {po:+.4f} (err {po - m:+.4f})  p-only pred {pp:+.4f} (err {pp - m:+.4f})")
    if ok:
        print("H6d-i all four within 0.02:", all(a <= 0.02 for a, _ in ok.values()), "| H6d-ii omega beats p-only in",
              sum(a < b for a, b in ok.values()), "of", len(ok))


if __name__ == "__main__":
    if sys.argv[1] == "report":
        report(); sys.exit()
    have = {(r["cell"], r["H"], r["seed"]) for r in load(PATH)}
    jobs = [(c, H, s) for s in SEEDS for H in HS for c in CELLS if (c, H, s) not in have]
    with Pool(4) as p, open(PATH, "a") as f:
        for r in p.imap_unordered(run, jobs):
            f.write(json.dumps(r) + "\n"); f.flush(); print(r, flush=True)
