"""Milestone 6u (H6 mechanism check): does the ratio of rand-k noise to the workers' own disagreement explain why the
size-2 compression cost has no knee at H = 16 and a knee near omega 8 at H = 64?

Uncompressed size-2 runs (the scale.py setup: dim 192, 2 layers, 6 heads, M = 4, inner AdamW lr 2e-3, plain outer SGD lr 1,
3,840 steps) at H = 16, 32, 64, seeds 0 and 1. Every round records, over all parameters, with d_j the worker delta
(global before the round minus worker j's end point) and m their mean:
  S = ||m||^2 (the step actually taken), E = mean_j ||d_j||^2, V = sum_j ||d_j - m||^2 / (M - 1) (unbiased disagreement).
rand-k with keep p (omega = 1/p - 1, independent masks per worker) adds noise of expected energy omega E / M to the mean;
the data noise already in the mean has energy about V / M. Their ratio is omega rho with rho = E / V, so rho is the
compression noise per unit of omega in units of the noise DiLoCo already tolerates. The measurement reads the workers'
end points after each round, so it does not change the trajectory: the final loss must match scale.jsonl's run.
Usage: python3 mechanism_6u.py run | report   (run appends to mechanism_6u.jsonl; report scores H6u-i to iii from LOG.md)."""
import json, math, os, sys, time
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
M, B, STEPS, LR, DIM, HEADS = 4, 16, 3840, 2e-3, 192, 6
PATH = os.path.join(HERE, "mechanism_6u.jsonl")
JOBS = [(H, s) for s in (0, 1) for H in (64, 32, 16)]


def run(job):
    import torch
    torch.set_num_threads(1)
    from lowcomm import DiLoCo, GPT, GPTConfig, CharData, load_shakespeare
    H, seed = job
    data = CharData(load_shakespeare(os.path.join(HERE, "..", "tinyshakespeare.txt")))
    torch.manual_seed(seed)
    model = GPT(GPTConfig(vocab=data.vocab, block=64, layers=2, heads=HEADS, dim=DIM))
    inner = lambda p: torch.optim.AdamW(p, lr=LR, betas=(0.9, 0.95), weight_decay=0.0)
    outer = lambda p: torch.optim.SGD(p, lr=1.0)
    t0 = time.time()
    d = DiLoCo(model, lambda m, rng: m(*data.batch("train", B, rng)), workers=M, H=H, inner=inner, outer=outer, seed=seed)
    rounds = []
    for _ in range(STEPS // H):
        before = [p.detach().clone() for p in model.parameters()]
        d.round()
        S = E = V = 0.0
        with torch.no_grad():
            for i, g in enumerate(before):
                ds = torch.stack([g - list(w.parameters())[i].data for w in d.workers])
                m = ds.mean(0)
                S += m.pow(2).sum().item()
                E += ds.pow(2).sum().item() / M
                V += (ds - m).pow(2).sum().item() / (M - 1)
        rounds.append((S, E, V))
    model.eval()
    with torch.no_grad():
        vals = [model(x, y).item() for x, y in data.val_batches(32, 16)]
    return {"H": H, "seed": seed, "loss": sum(vals) / len(vals), "rounds": rounds, "torch": torch.__version__, "secs": round(time.time() - t0)}


def rho_of(rec):
    """Median of E / V over the second half of training's rounds, and the same for E / (M S)."""
    half = rec["rounds"][len(rec["rounds"]) // 2:]
    med = lambda v: sorted(v)[len(v) // 2]
    return med([e / v for s, e, v in half]), med([e / (M * s) for s, e, v in half])


def report():
    from knee16_6s import cells, boot_w0
    recs = [json.loads(l) for l in open(PATH)]
    ref = {}
    for l in open(os.path.join(HERE, "scale.jsonl")):
        r = json.loads(l)
        if r["keep"] == 1.0: ref[(r["H"], r["seed"])] = r["loss"]
    print("run (H, seed): final loss, scale.jsonl loss, diff;  rho = E/V and E/(M S), medians over the second half; secs")
    rho, kap = {}, {}
    for r in sorted(recs, key=lambda r: (r["H"], r["seed"])):
        a, b = rho_of(r); rho.setdefault(r["H"], []).append(a); kap.setdefault(r["H"], []).append(b)
        q = ref.get((r["H"], r["seed"]), float("nan"))
        print(f"  ({r['H']}, {r['seed']}): {r['loss']:.4f}, {q:.4f}, {r['loss'] - q:+.5f};  rho {a:.3f}  E/(MS) {b:.3f};  {r['secs']} s ({r['torch']})")
    print("\nper-round trajectory (seed-mean of E/V at 10%, 25%, 50%, 75%, 100% of rounds):")
    for H in sorted(rho):
        rs = [r["rounds"] for r in recs if r["H"] == H]; n = len(rs[0])
        pts = [max(0, int(f * n) - 1) for f in (.1, .25, .5, .75, 1.0)]
        print(f"  H {H}: " + "  ".join(f"{sum(x[i][1] / x[i][2] for x in rs) / len(rs):.3f}" for i in pts))
    R = {H: sum(v) / len(v) for H, v in rho.items()}
    print("\nrho(H), seed mean (spread): " + ", ".join(f"H {H}: {R[H]:.3f} ({min(rho[H]):.3f} to {max(rho[H]):.3f})" for H in sorted(R)))
    print(f"H6u-i   (rho_16 > rho_32 > rho_64): {'held' if R[16] > R[32] > R[64] else 'refuted'}")

    pts = {16: cells(16, (0.25, 0.125, 0.0625, 1 / 32)), 32: cells(32, (0.125, 0.0625, 1 / 32)),
           64: cells(64, (0.25, 0.125, 1 / 12, 0.0625, 1 / 32))}
    allc = [(H, o, m, s) for H, p in pts.items() for o, m, s in p]

    def hinge(xs):  # xs: list of (x, m, s); a max(0, x - x0), x0 on a 400-step grid over [0, max x]
        top = max(x for x, _, _ in xs); best = None
        for i in range(401):
            x0 = top * i / 400; g = [max(0.0, x - x0) for x, _, _ in xs]
            den = sum(gi * gi / s ** 2 for gi, (_, _, s) in zip(g, xs))
            if den == 0: continue
            a = sum(gi * m / s ** 2 for gi, (_, m, s) in zip(g, xs)) / den
            chi = sum(((m - a * gi) / s) ** 2 for gi, (_, m, s) in zip(g, xs))
            if best is None or chi < best[0]: best = (chi, a, x0)
        return best

    for name, xmap in (("omega (no collapse)", {H: 1.0 for H in pts}), ("omega rho(H)", R),
                       ("omega E/(M S) (exploratory)", {H: sum(kap[H]) / len(kap[H]) for H in kap}),
                       ("omega rho(H) x rounds (exploratory, accumulated)", {H: R[H] * STEPS / H for H in R})):
        chi, a, x0 = hinge([(o * xmap[H], m, s) for H, o, m, s in allc])
        print(f"\npooled hinge in {name}, {len(allc)} cells: chi2 {chi:.2f} on {len(allc) - 2} dof; a {a:.5f}, x0 {x0:.3f}; "
              "implied knee in omega: " + ", ".join(f"H {H} {x0 / xmap[H]:.2f}" for H in sorted(pts)))
        if name == "omega (no collapse)": base = chi
        if name == "omega rho(H)": col = (chi, x0)
    print(f"\nH6u-ii  (collapse chi2 <= 20 and <= half of the omega-only chi2 {base:.2f}): "
          f"{'held' if col[0] <= 20 and col[0] <= base / 2 else 'refuted'} (chi2 {col[0]:.2f})")
    inside = 0
    for H in sorted(pts):
        lo, md, hi = boot_w0(pts[H]); k = col[1] / R[H]; inside += lo <= k <= hi
        print(f"  H {H}: implied knee {k:.2f}, per-H hinge w0 bootstrap {lo}/{md}/{hi}")
    print(f"H6u-iii (implied knee inside the per-H w0 interval at >= 2 of 3 H): {'held' if inside >= 2 else 'refuted'} ({inside} of 3)")


if __name__ == "__main__":
    if sys.argv[1] == "report": report(); sys.exit()
    have = {(json.loads(l)["H"], json.loads(l)["seed"]) for l in open(PATH)} if os.path.exists(PATH) else set()
    with Pool(4) as p, open(PATH, "a") as f:
        for r in p.imap_unordered(run, [j for j in JOBS if j not in have]):
            f.write(json.dumps(r) + "\n"); f.flush(); print({k: v for k, v in r.items() if k != "rounds"}, flush=True)
