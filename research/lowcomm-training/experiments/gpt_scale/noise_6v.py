"""Milestone 6v (H6 mechanism): is it rand-k's sparsity that makes small compression free at H = 64 and not at H = 16?

Replace rand-k at keep 1/8 (omega 7) with additive Gaussian noise of the same expected energy, omega ||d||^2 per tensor
(`lowcomm.gauss_noise`), in the size-2 setup of scale.py (dim 192, 2 layers, 6 heads, M = 4, inner AdamW lr 2e-3, plain
outer SGD lr 1, 3,840 steps), at H = 16 and H = 64, seeds 0 to 3. Two variants:
  iso:    every coordinate of a tensor gets variance omega ||d||^2 / n (no per-coordinate structure);
  shaped: coordinate i gets variance omega d_i^2, rand-k's own per-coordinate variance, with no coordinate zeroed.
Each run is paired by seed with the uncompressed run and the rand-k keep-1/8 run in scale.jsonl (same initial model and
data streams). Written before the runs; the hypotheses are in LOG.md, 6v.
Usage: python3 noise_6v.py run | report   (run appends to noise_6v.jsonl)."""
import json, math, os, sys, time
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
M, B, STEPS, LR, DIM, HEADS, OMEGA = 4, 16, 3840, 2e-3, 192, 6, 7.0
PATH = os.path.join(HERE, "noise_6v.jsonl")
# iso first at both H, then shaped, so a cut-short run still scores H6v-i and ii
JOBS = [("none", 64, 0)] + [(kind, H, s) for kind in ("iso", "shaped") for s in range(4) for H in (64, 16)]
# ("none", 64, 0) reruns one uncompressed baseline: its loss must equal scale.jsonl's, a check on this torch build


def run(job):
    import torch
    torch.set_num_threads(1)
    from lowcomm import DiLoCo, GPT, GPTConfig, CharData, load_shakespeare, gauss_noise
    kind, H, seed = job
    data = CharData(load_shakespeare(os.path.join(HERE, "..", "tinyshakespeare.txt")))
    torch.manual_seed(seed)
    model = GPT(GPTConfig(vocab=data.vocab, block=64, layers=2, heads=HEADS, dim=DIM))
    inner = lambda p: torch.optim.AdamW(p, lr=LR, betas=(0.9, 0.95), weight_decay=0.0)
    outer = lambda p: torch.optim.SGD(p, lr=1.0)
    t0 = time.time()
    d = DiLoCo(model, lambda m, rng: m(*data.batch("train", B, rng)), workers=M, H=H, inner=inner, outer=outer, seed=seed,
               compress=None if kind == "none" else gauss_noise(OMEGA, shaped=kind == "shaped"))
    for _ in range(STEPS // H):
        d.round()
    model.eval()
    with torch.no_grad():
        vals = [model(x, y).item() for x, y in data.val_batches(32, 16)]
    loss = sum(vals) / len(vals)
    return {"kind": kind, "omega": OMEGA, "H": H, "seed": seed, "loss": loss if loss == loss else float("inf"),
            "torch": torch.__version__, "secs": round(time.time() - t0)}


def mse(x):
    mu = sum(x) / len(x)
    return mu, ((sum((v - mu) ** 2 for v in x) / (len(x) - 1)) ** .5 / len(x) ** .5 if len(x) > 1 else float("nan"))


def report():
    ref = {}
    for l in open(os.path.join(HERE, "scale.jsonl")):
        r = json.loads(l); ref[(round(r["keep"], 6), r["H"], r["seed"])] = r["loss"]
    rows = [json.loads(l) for l in open(PATH)] if os.path.exists(PATH) else []
    got = {(r["kind"], r["H"], r["seed"]): r["loss"] for r in rows}
    print("runs:", len(rows), " torch:", sorted({r["torch"] for r in rows}), " mean secs:", round(sum(r["secs"] for r in rows) / max(1, len(rows))))
    if ("none", 64, 0) in got:
        print(f"build check, uncompressed H 64 seed 0: {got[('none', 64, 0)]:.5f} vs scale.jsonl {ref[(1.0, 64, 0)]:.5f} "
              f"(diff {got[('none', 64, 0)] - ref[(1.0, 64, 0)]:+.6f})")
    ex, vs = {}, {}
    for kind in ("randk", "iso", "shaped"):
        for H in (16, 64):
            e, v = [], []
            for s in range(4):
                b, rk = ref.get((1.0, H, s)), ref.get((0.125, H, s))
                y = rk if kind == "randk" else got.get((kind, H, s))
                if y is None or b is None: continue
                e.append(y - b)
                if kind != "randk": v.append(y - rk)
            if len(e) < 2: print(f"{kind} H {H}: fewer than 2 seeds"); continue
            ex[(kind, H)], vs[(kind, H)] = mse(e), (mse(v) if len(v) > 1 else None)
            line = f"{kind:6s} H {H:2d}: excess over uncompressed {ex[(kind, H)][0]:+.4f} (se {ex[(kind, H)][1]:.4f}, n {len(e)}) per seed {[round(x, 4) for x in e]}"
            if vs[(kind, H)]: line += f";  minus rand-k {vs[(kind, H)][0]:+.4f} (se {vs[(kind, H)][1]:.4f}) per seed {[round(x, 4) for x in v]}"
            print(line)
    fin = lambda k: all(math.isfinite(got.get((k, H, s), 0.0)) for H in (16, 64) for s in range(4))
    if ("iso", 16) in ex and ("iso", 64) in ex:
        (a, sa), (b, sb) = ex[("iso", 16)], ex[("iso", 64)]
        z = (a - b) / (sa ** 2 + sb ** 2) ** .5
        print(f"\nH6v-i   (iso excess at H 16 minus at H 64 > 2 se): {'held' if fin('iso') and z > 2 else 'refuted'} ({a - b:+.4f}, {z:+.1f} se)")
    for tag, kind in (("H6v-ii ", "iso"), ("H6v-iii", "shaped")):
        if (kind, 16) in vs and (kind, 64) in vs and vs[(kind, 16)] and vs[(kind, 64)]:
            zs = [vs[(kind, H)][0] / vs[(kind, H)][1] for H in (16, 64)]
            ok = fin(kind) and all(abs(z) <= 2 for z in zs)
            print(f"{tag} ({kind} minus rand-k within 2 se of zero at both H): {'held' if ok else 'refuted'} "
                  f"(H 16 {zs[0]:+.1f} se, H 64 {zs[1]:+.1f} se)")


if __name__ == "__main__":
    if sys.argv[1] == "report": report(); sys.exit()
    have = {(json.loads(l)["kind"], json.loads(l)["H"], json.loads(l)["seed"]) for l in open(PATH)} if os.path.exists(PATH) else set()
    with Pool(4) as p, open(PATH, "a") as f:
        for r in p.imap_unordered(run, [j for j in JOBS if j not in have]):
            f.write(json.dumps(r) + "\n"); f.flush(); print(r, flush=True)
