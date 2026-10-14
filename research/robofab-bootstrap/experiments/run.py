"""Bootstrapping chain: can a printed gripper assemble the next one? Prints a results table."""
from robofab_bootstrap.model import Model, gripper, min_jaw, opening, chain, search

SC = [1 + 0.5 * i for i in range(0, 13)]   # scales 1.0 .. 7.0
print("# robofab-bootstrap: gripper generations (side-approach arm; unit gripper = robofab-selfparts design)")
print("# opening(s) = 32*s - 2*pad_t mm (assumption), min_jaw(s) = smallest jaw opening with a complete order\n")
print("## 1. Required jaw vs offered jaw by scale (pad_t = 4 mm)")
print(f"{'scale':>6s} {'min_jaw':>8s} {'opening':>8s} {'copy possible':>14s}")
for s in SC:
    mj, op = min_jaw(s), opening(s)
    print(f"{s:6.1f} {mj:8.2f} {op:8.2f} {'yes' if op >= mj else 'no':>14s}")
print("\n## 2. Smallest self-assembling scale on a 0.25 grid, by pad thickness")
for t in (1, 2, 3, 4, 6):
    s = next((x / 4 for x in range(4, 60) if opening(x / 4, t) >= min_jaw(x / 4, pad_t=t)), None)
    print(f"pad_t={t}: scale={s}  (closed form: s >= pad_t)")
print("\n## 3. Actuator stroke cap: is there any self-assembling scale? (pad_t = 4 mm)")
for cap in (60, 100, 120, 130, 160):
    ok = [s for s in SC if opening(s, 4.0, cap) >= min_jaw(s)]
    print(f"stroke={cap:4d} mm: self-assembling scales {ok if ok else 'none'}")
print("\n## 4. Chains from a purchased seed gripper (opening w0 mm), scales 1.0-7.0, pad_t=4")
for w0 in (24, 60, 100, 130, 140):
    for pol in ("max", "min"):
        r = chain(w0, SC, policy=pol, generations=6)
        print(f"w0={w0:3d} {pol}: " + " -> ".join(f"{x[2]}" for x in r))
