"""Milestone 70: price hash commitments to every s-th checkpoint (stdlib only).
Measures SHA-256 and BLAKE2b throughput here (hashlib, 1 thread, 64 MiB buffer, median of 5), then computes, for model sizes N and
commitment spacing s: hashing time per run as a share of training time, worker storage if it keeps every committed checkpoint, and verifier
storage (32 B per commitment). Training time is an ASSUMPTION swept, not measured: 6*N*tokens FLOPs per step at an effective FLOP/s."""
import math, hashlib, time, statistics, os
HERE = os.path.dirname(os.path.abspath(__file__))
buf = os.urandom(64 << 20)
def tput(name):
    ts = []
    for _ in range(5):
        t = time.perf_counter(); hashlib.new(name, buf).digest(); ts.append(time.perf_counter() - t)
    return len(buf) / statistics.median(ts)
rates = {n: tput(n) for n in ["sha256", "blake2b", "sha3_256"]}
L = ["throughput here (bytes/s, 1 thread): " + ", ".join("%s %.2f GB/s" % (n, r / 1e9) for n, r in rates.items()),
     "cpu count %d" % os.cpu_count(), ""]
R = rates["sha256"]
STEPS = 600
TOK = 1 << 20          # tokens per optimiser step (1M, a typical large-batch run)
for flops_eff in [1e14, 4e14]:   # effective accelerator FLOP/s per device (sweep, assumption)
    L.append("effective %.0e FLOP/s per device, %d tokens/step, one device holds the full model (no sharding), fp32 weights" % (flops_eff, TOK))
    L.append("%-8s %-9s %-10s %-14s %-12s %-14s %-12s" % ("params", "ckpt GB", "step s", "hash s/ckpt", "hash/step", "worker store s=1", "s for <=1%"))
    for N in [1e6, 1e8, 1e9, 7e9, 70e9]:
        ck = 4 * N                      # weights only
        step = 6 * N * TOK / flops_eff
        h = ck / R
        share = h / step
        s_needed = max(1, math.ceil(share * 100 - 1e-9))
        L.append("%-8s %-9.3f %-10.3g %-14.3g %-12s %-14s %-12d" % ("%.0e" % N, ck / 1e9, step, h, "%.2f%%" % (100 * share),
                 "%.1f GB" % (ck * STEPS / 1e9), s_needed))
    L.append("")
L.append("verifier storage: 32 B per commitment: s=1 %d B, s=5 %d B, s=20 %d B for %d steps (independent of model size)" % (32 * STEPS, 32 * STEPS // 5, 32 * STEPS // 20, STEPS))
L.append("worker storage for the unhashed path scales as ckpt * (steps/s); Adam state triples the bytes hashed.")
open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n"); print("\n".join(L))
