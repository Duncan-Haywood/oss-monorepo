"""Cost of privacy: accuracy and subsidy vs eps and b. T=256 traders, 200 markets per cell."""
import math, statistics as st
from private_markets import simulate

T, R = 256, 200
INF = float("inf")

def cell(b, eps, counter="tree"):
    rs = [simulate(T, b, eps, s, counter=counter) for s in range(R)]
    return (st.mean(r.final_logit_err for r in rs), st.mean(r.mm_loss for r in rs),
            max(r.mm_loss for r in rs), st.mean(r.bound for r in rs))

print("== accuracy |final logit - true logit| / mean MM loss / worst MM loss / mean bound (tree) ==")
print("eps\\b " + "".join(f"{b:>30}" for b in (2, 5, 10, 20, 40)))
for eps in (0.5, 1, 2, 5, INF):
    row = f"{eps:<6}"
    for b in (2, 5, 10, 20, 40):
        e, m, w, bd = cell(b, eps)
        row += f"  {e:5.2f}/{m:5.2f}/{w:5.2f}/{bd:6.1f}"
    print(row)

print("\n== tree vs naive independent noise (b=10) ==")
for eps in (1, 5):
    print(f"eps={eps}: tree err={cell(10,eps)[0]:.2f}  naive err={cell(10,eps,'naive')[0]:.2f}")

print("\n== smallest b reaching final logit error <= 0.5: b ln2 vs observed mean/worst MM loss ==")
for eps in (0.5, 1, 2, 5, INF):
    for b in (1, 2, 3, 5, 8, 12, 20, 30, 50, 80):
        if cell(b, eps)[0] <= 0.5:
            e, m, w, bd = cell(b, eps)
            print(f"eps={eps}: b={b}, b ln2={b*math.log(2):.1f}, mean loss={m:.1f}, worst loss={w:.1f}"); break
    else:
        print(f"eps={eps}: not reached for b<=80")
