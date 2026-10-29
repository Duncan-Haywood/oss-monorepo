"""Milestone 6e adds plain top-k at keep 1/16, H in {4, 64}, via `python3 composition.py run_topk`, results in topk_composition.jsonl; see LOG.md.
Milestone 6c adds keep 1/8 and 1/32 at H in {4, 64} via `python3 composition.py run_p`; see LOG.md.
Milestone 6b adds held-out H in {8, 32} (uncompressed and keep 1/16) via `python3 composition.py run8_32`; see LOG.md.
Milestone 6a (H6 pilot): does rand-k compression's excess loss compose additively with the outer delay H on the 413k-parameter GPT?
Same model, data, budget (3,840 steps), M = 4, inner lr 2e-3, plain outer step as 3d/4a. New cells: keep p in {0.25, 0.0625} x H in {4, 64}, seeds 0 to 2.
Existing cells read from gpt_retune_all (uncompressed, H in {4, 16, 64}, lr 2e-3) and gpt_compression (H = 16 rand-k).
Usage: python3 composition.py run   then   python3 composition.py report. Results append to composition.jsonl."""
import json, os, sys, time
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
M, B, STEPS, LR = 4, 16, 3840, 2e-3
HOLD = [8, 32]
KEEPS, HS, SEEDS = [0.25, 0.0625], [4, 64], [0, 1, 2]
PLEVELS = [0.125, 0.03125]
PATH = os.path.join(HERE, "composition.jsonl")
TOPK = os.path.join(HERE, "topk_composition.jsonl")
TOPK_OLD = os.path.join(HERE, "..", "gpt_topk_ef", "topk_ef.jsonl")
OLD = os.path.join(HERE, "..", "gpt_retune_all", "retune.jsonl")
RAND = os.path.join(HERE, "..", "gpt_compression", "compression.jsonl")
load = lambda p: [json.loads(l) for l in open(p)] if os.path.exists(p) else []


def run(job):
    import torch
    torch.set_num_threads(1)
    from lowcomm import DiLoCo, GPT, GPTConfig, CharData, load_shakespeare, rand_k, top_k
    keep, H, seed = job[:3]
    comp = rand_k if len(job) == 3 else top_k
    data = CharData(load_shakespeare(os.path.join(HERE, "..", "tinyshakespeare.txt")))
    torch.manual_seed(seed)
    model = GPT(GPTConfig(vocab=data.vocab, block=64, layers=2, heads=4, dim=128))
    inner = lambda p: torch.optim.AdamW(p, lr=LR, betas=(0.9, 0.95), weight_decay=0.0)
    outer = lambda p: torch.optim.SGD(p, lr=1.0)
    t0 = time.time()
    d = DiLoCo(model, lambda m, rng: m(*data.batch("train", B, rng)), workers=M, H=H, inner=inner, outer=outer, seed=seed, compress=None if keep == 1.0 else comp(keep))
    for _ in range(STEPS // H):
        d.round()
    model.eval()
    with torch.no_grad():
        vals = [model(x, y).item() for x, y in data.val_batches(32, 16)]
    loss = sum(vals) / len(vals)
    return {"keep": keep, "H": H, "seed": seed, "loss": loss if loss == loss else float("inf"), "secs": round(time.time() - t0)}


def cells():
    """{(H, keep): [losses by seed 0..2]}; keep 1 = uncompressed (seeds 0..2 of 3d)."""
    c = {}
    for r in load(OLD):
        if r["lr"] == LR and r["H"] in (4, 16, 64) and r["seed"] in SEEDS:
            c.setdefault((r["H"], 1.0), {})[r["seed"]] = r["loss"]
    for r in load(RAND):
        if r["keep"] in KEEPS: c.setdefault((16, r["keep"]), {})[r["seed"]] = r["loss"]
    for r in load(PATH): c.setdefault((r["H"], r["keep"]), {})[r["seed"]] = r["loss"]
    return c


def report():
    c = cells()
    mean = lambda d: sum(d.values()) / len(d)
    print("cell (H, keep): n seeds, mean loss")
    for k in sorted(c, key=lambda t: (t[0], -t[1])): print(k, len(c[k]), round(mean(c[k]), 4), {s: round(v, 4) for s, v in sorted(c[k].items())})
    ex = lambda H, p: mean(c[(H, p)]) - mean(c[(H, 1.0)])
    print("\nrand-k excess over the uncompressed cell at the same H (nats):")
    for p in KEEPS:
        print(f"keep {p}: " + "  ".join(f"H={H}: {ex(H, p):+.4f}" for H in (4, 16, 64) if (H, p) in c))
    print("\nadditive rule: excess(H, p) = excess(16, p); worst absolute miss over the corners:")
    worst = 0
    for p in KEEPS:
        for H in HS:
            if (H, p) in c:
                miss = ex(H, p) - ex(16, p); worst = max(worst, abs(miss))
                print(f"H={H} keep {p}: measured {ex(H, p):+.4f} predicted {ex(16, p):+.4f} miss {miss:+.4f}")
    print(f"worst miss {worst:.4f}")
    if (8, 1.0) in c and (32, 1.0) in c:
        import math
        p = 0.0625
        g4, g64 = ex(4, p) / ex(16, p), ex(64, p) / ex(16, p)
        g = lambda H: 1 + (g4 - 1) * (4 - math.log2(H)) / 2 * (1 if H < 16 else 0) + (g64 - 1) * (math.log2(H) - 4) / 2 * (1 if H > 16 else 0)
        print("\n6b held-out H at keep 1/16: product rule vs additive rule vs measured excess")
        for H in (8, 32):
            if (H, p) in c:
                m, pr, ad = ex(H, p), g(H) * ex(16, p), ex(16, p)
                print(f"H={H}: measured {m:+.4f}  product {pr:+.4f} (err {pr - m:+.4f})  additive {ad:+.4f} (err {ad - m:+.4f})")


def report_p():
    """6c: excess vs omega = 1/p - 1 at H = 4, 64. H6c-i: fit through the origin on p = 1/4, 1/16; predict 1/8, 1/32. H6c-ii: power-law exponent over all four."""
    import math
    c = cells()
    mean = lambda d: sum(d.values()) / len(d)
    om = lambda p: 1 / p - 1
    for H in (4, 64):
        pts = {p: mean(c[(H, p)]) - mean(c[(H, 1.0)]) for p in (0.25, 0.125, 0.0625, 0.03125) if (H, p) in c}
        print(f"H={H} excess by omega:", {om(p): round(v, 4) for p, v in pts.items()})
        fit = [p for p in (0.25, 0.0625) if p in pts]
        slope = sum(pts[p] * om(p) for p in fit) / sum(om(p) ** 2 for p in fit)
        for p in (0.125, 0.03125):
            if p in pts: print(f"  p={p}: measured {pts[p]:+.4f} linear-fit {slope * om(p):+.4f} err {slope * om(p) - pts[p]:+.4f}")
        pos = [(math.log(om(p)), math.log(v)) for p, v in pts.items() if v > 0]
        if len(pos) >= 3:
            mx, my = sum(x for x, _ in pos) / len(pos), sum(y for _, y in pos) / len(pos)
            b = sum((x - mx) * (y - my) for x, y in pos) / sum((x - mx) ** 2 for x, _ in pos)
            print(f"  power-law exponent b = {b:.2f} from {len(pos)} points")


def report_topk():
    """6e: plain top-k at keep 1/16. H6e-i: rand-k's g(4) = 0.49, g(64) = 1.19 (6b) times top-k's H = 16 excess predicts H = 4, 64 within 0.02."""
    c = cells()
    mean = lambda v: sum(v) / len(v)
    tk = {16: {r["seed"]: r["loss"] for r in load(TOPK_OLD) if r["arm"] == "topk" and r["keep"] == 0.0625}}
    for r in load(TOPK): tk.setdefault(r["H"], {})[r["seed"]] = r["loss"]
    ex = lambda H: mean(list(tk[H].values())) - mean(list(c[(H, 1.0)].values()))
    rk = lambda H: mean(list(c[(H, 0.0625)].values())) - mean(list(c[(H, 1.0)].values()))
    print("plain top-k keep 1/16 excess over uncompressed (nats), with rand-k:")
    for H in (4, 16, 64):
        if H in tk: print(f"H={H}: topk {ex(H):+.4f} (n={len(tk[H])}, per seed {[round(v - c[(H, 1.0)][s], 4) for s, v in sorted(tk[H].items())]})  randk {rk(H):+.4f}")
    for H in (4, 64):
        if H in tk:
            pred = ex(16) * rk(H) / rk(16)
            print(f"H={H}: g-scaled prediction {pred:+.4f} err {pred - ex(H):+.4f};  H-independent rival {ex(16):+.4f} err {ex(16) - ex(H):+.4f}")


if __name__ == "__main__":
    if sys.argv[1] == "report_topk":
        report_topk(); sys.exit()
    if sys.argv[1] == "run_topk":
        have = {(r["H"], r["seed"]) for r in load(TOPK)}
        jobs = [(0.0625, H, s, "topk") for s in SEEDS for H in HS if (H, s) not in have]
        with Pool(4) as p, open(TOPK, "a") as f:
            for r in p.imap_unordered(run, jobs):
                f.write(json.dumps(r) + "\n"); f.flush(); print(r, flush=True)
        sys.exit()
    if sys.argv[1] == "report":
        report(); sys.exit()
    if sys.argv[1] == "report_p":
        report_p(); sys.exit()
    have = {(r["keep"], r["H"], r["seed"]) for r in load(PATH)}
    hs, ks = {"run8_32": (HOLD, [1.0, 0.0625]), "run_p": (HS, PLEVELS)}.get(sys.argv[1], (HS, KEEPS))
    jobs = [(k, H, s) for s in SEEDS for H in hs for k in ks if (k, H, s) not in have]
    with Pool(4) as p, open(PATH, "a") as f:
        for r in p.imap_unordered(run, jobs):
            f.write(json.dumps(r) + "\n"); f.flush(); print(r, flush=True)
