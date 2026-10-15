"""accel-policy: behaviour-cloned MLP policies for a two-link arm, closed-loop tracking vs control period,
and which hardware (microcontroller loop or P-lane accelerator) can meet the deadline. Writes results.json/txt."""
import json, os, sys, time
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from accel_policy import arm, policy, hw

HIDDEN = [[4], [8], [16], [32], [16, 16], [32, 32], [64, 64]]
BITS = [8, 4]
TS_MS = [0.1, 0.25, 0.5, 1, 2, 5, 10]
N_TEST = 16
t0 = time.time()
X, Y = policy.make_dataset(200, 0)
Xv, Yv = policy.make_dataset(20, 999)
print("dataset", X.shape, "val", Xv.shape)
rng = np.random.default_rng(1000)
moves = [arm.random_move(rng) for _ in range(N_TEST)]


def score(ctrl, Ts, lat):
    r = [arm.rollout(ctrl, qa, qb, T, Ts, lat) for qa, qb, T in moves]
    rms = np.array([a for a, _ in r]); pk = np.array([b for _, b in r])
    return float(np.sqrt(np.mean(rms ** 2))), float(pk.max())


def ctrl_of(f):
    return lambda q, qd, qr, qdr, qddr: f(arm.features(q, qd, qr, qdr)) * arm.TAU_MAX


out = {"teacher": {}, "nets": [], "platforms": []}
# teacher (cost of running it not charged): ideal and with one sample of delay
for ts in TS_MS:
    out["teacher"][str(ts)] = {"no_delay": score(arm.teacher, ts / 1e3, 0.0), "one_sample_delay": score(arm.teacher, ts / 1e3, ts / 1e3)}
print("teacher done", round(time.time() - t0))

plats = []
for name, (clk, cpm) in hw.MCUS.items():
    plats.append({"name": name, "kind": "mcu", "clock": clk, "cpm": cpm})
for P in (1, 4, 16):
    for clk in hw.ACCEL_CLOCKS:
        plats.append({"name": f"accelerator P={P} @ {int(clk/1e6)} MHz", "kind": "accel", "P": P, "clock": clk})

for hid in HIDDEN:
    net = policy.MLP(hid, 0).fit(X, Y, epochs=60)
    val_mse = float(np.mean((net.forward(Xv) - Yv) ** 2))
    rec = {"hidden": hid, "macs": net.macs(), "val_mse": val_mse, "variants": {}}
    for bits in [None] + BITS:
        if bits is None:
            f = lambda x, net=net: net.forward(x[None])[0]
        else:
            qn = policy.QMLP(net, X, bits)
            f = qn.forward_int
        c = ctrl_of(f)
        v = {"ideal_1ms": score(c, 1e-3, 0.0)}
        v["by_ts_ideal"] = {str(ts): score(c, ts / 1e3, 0.0) for ts in (1, 2, 5)}
        rec["variants"]["float" if bits is None else f"int{bits}"] = v
        if bits == 8:
            c8 = c
    rec["platform"] = {}
    for p in plats:
        cyc = hw.accel_cycles(net.sizes, p["P"]) if p["kind"] == "accel" else hw.mcu_cycles(net.sizes, p["cpm"])
        lat = cyc / p["clock"]
        row = {"cycles": cyc, "latency_us": lat * 1e6, "by_ts": {}}
        for ts in TS_MS:
            if lat <= ts / 1e3:
                row["by_ts"][str(ts)] = score(c8, ts / 1e3, lat)
        rec["platform"][p["name"]] = row
    out["nets"].append(rec)
    print(hid, "val_mse %.4f" % val_mse, round(time.time() - t0), "s", flush=True)
out["platforms"] = [p["name"] for p in plats]
json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1)

L = ["accel-policy results (stylised; assumed hardware constants)", f"train samples {len(X)}, test moves {N_TEST}", "",
     "Teacher (computed-torque PD, cost not charged): RMS joint error (rad) / peak error by control period (ms)"]
for ts in TS_MS:
    a, b = out["teacher"][str(ts)]["no_delay"], out["teacher"][str(ts)]["one_sample_delay"]
    L.append(f"  Ts={ts:>5} ms  no delay {a[0]:.4f}/{a[1]:.4f}   one-sample delay {b[0]:.4f}/{b[1]:.4f}")
L += ["", "Per network: MACs, validation MSE, ideal (zero-latency) closed-loop RMS/peak at Ts = 1 ms"]
for r in out["nets"]:
    s = "  ".join(f"{k} {v['ideal_1ms'][0]:.4f}/{v['ideal_1ms'][1]:.3f}" for k, v in r["variants"].items())
    L.append(f"  hidden {str(r['hidden']):10s} MACs {r['macs']:5d}  val_mse {r['val_mse']:.4f}  {s}")
L += ["", "Latency (us) and, where latency <= Ts, int8 closed-loop RMS error (rad) at that Ts; '--' = misses deadline"]
for r in out["nets"]:
    L.append(f"hidden {r['hidden']} ({r['macs']} MACs)")
    L.append("  " + "platform".ljust(44) + "cycles latency_us  " + "  ".join(f"{ts:>6}ms" for ts in TS_MS))
    for n, row in r["platform"].items():
        cells = "  ".join((f"{row['by_ts'][str(ts)][0]:8.4f}" if str(ts) in row["by_ts"] else "      --") for ts in TS_MS)
        L.append("  " + n.ljust(44) + f"{row['cycles']:6d} {row['latency_us']:9.1f}  " + cells)
open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n")
print("\n".join(L)); print("total s", round(time.time() - t0))
