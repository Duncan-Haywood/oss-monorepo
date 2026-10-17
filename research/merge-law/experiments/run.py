import random
from merge_law import *

print("E1 merged model vs law, d=12 r=3 m=4 (|e0|=1), 20000 runs: |e|^2 / seen loss / fresh loss")
rng = random.Random(1)
for name, a in (("a=1/m (average)", 1 / 4), ("a*=1/(1+(m-1)p)", best_scale(12, 3, 4)), ("a=1 (task arithmetic)", 1.0)):
    n2, sl, fl = simulate_merge(12, 3, 4, a, 20000, rng)
    print(f" {name:22s} a={a:.3f}  |e|^2 law {norm2(12,3,4,a):.4f} sim {n2:.4f} | seen law {seen_loss(12,3,4,a):.4f} sim {sl:.4f} | fresh law {fresh_loss(12,3,4,a):.4f} sim {fl:.4f}")

print("\nE2 optimal scale and residual error vs m (r/d = 1/8): a*, E|e|^2 at a*, at a=1/m, at a=1, sequential (1-p)^m")
for m in (1, 2, 4, 8, 16, 64, 256):
    d, r = 32, 4
    print(f" m={m:4d} a*={best_scale(d,r,m):.3f} best {best_norm2(d,r,m):.4f} avg {norm2(d,r,m,1/m):.4f} sum {norm2(d,r,m,1.0):9.3f} sequential {seq_norm2(d,r,m):.2e}")

print("\nE3 repeated merge rounds vs law, d=12 r=3 m=5, 8000 runs: |e|^2 after k rounds")
rng = random.Random(2)
sim = simulate_rounds(12, 3, 5, 6, 8000, rng)
f = best_norm2(12, 3, 5)
for k in range(7):
    print(f" k={k}: law {f**k:.4f} sim {sim[k]:.4f}")

print("\nE4 parallel speedup over sequential steps, efficiency, and m at 50% / 25% efficiency")
for d, r in ((32, 1), (32, 4), (128, 4), (128, 16), (512, 8)):
    row = " ".join(f"m={m}:{speedup(d,r,m):.2f}x" for m in (2, 4, 8, 16, 64))
    print(f" d={d:4d} r={r:3d} r/d={r/d:.4f} {row} | m@50%={critical_m(d,r,.5)} m@25%={critical_m(d,r,.25)} 1/p={d/r:.0f}")

print("\nE5 seen vs fresh loss trade-off over the scale a, d=32 r=4 m=8")
d, r, m = 32, 4, 8
for a in (0.1, 1 / m, 0.25, best_scale(d, r, m), 0.75, 1.0):
    print(f" a={a:.3f} |e|^2 {norm2(d,r,m,a):.4f} seen {seen_loss(d,r,m,a):.4f} fresh {fresh_loss(d,r,m,a):.4f}")
