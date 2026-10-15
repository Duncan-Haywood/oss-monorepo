"""accel-policy: DAgger-trained MLP policies imitating a computed-torque controller on a two-link arm. For each
network and platform (microcontroller loop or P-lane accelerator) the inference latency is modelled, and the
closed loop is simulated with that latency at several control periods. Writes results.json and results.txt.
`python3 run.py --report` rebuilds results.txt from results.json."""
import json, os, sys, time
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from accel_policy import arm, policy, hw

HIDDEN = [[8], [16], [32], [16, 16], [32, 32], [64, 64]]
TS_MS = [0.05, 0.1, 0.25, 1, 5]
N_TEST = 12


def ctrl_of(f):
    return lambda q, qd, qr, qdr, qddr: f(arm.features(q, qd, qr, qdr)) * arm.TAU_MAX


def platforms():
    P = [{"name": n, "kind": "mcu", "clock": c, "cpm": m} for n, (c, m) in hw.MCUS.items()]
    return P + [{"name": f"accelerator P={p} @ {int(c / 1e6)} MHz", "kind": "accel", "P": p, "clock": c} for p in (1, 4, 16) for c in hw.ACCEL_CLOCKS]


def run():
    t0 = time.time()
    X, Y = policy.make_dataset(150, 0)
    Xv, Yv = policy.make_dataset(20, 999)
    rng = np.random.default_rng(1000)
    moves = [arm.random_move(rng) for _ in range(N_TEST)]

    def score(ctrl, Ts, lat):
        r = [arm.rollout(ctrl, qa, qb, T, Ts, lat) for qa, qb, T in moves]
        return float(np.sqrt(np.mean([a ** 2 for a, _ in r]))), float(max(b for _, b in r))

    out = {"n_train": len(X), "n_test": N_TEST, "teacher": {}, "nets": []}
    for ts in TS_MS:
        out["teacher"][str(ts)] = {"no_delay": score(arm.teacher, ts / 1e3, 0.0), "one_sample_delay": score(arm.teacher, ts / 1e3, ts / 1e3)}
    print("teacher", round(time.time() - t0), flush=True)
    train_rng = np.random.default_rng(5)
    for hid in HIDDEN:
        net = policy.MLP(hid, 0).fit(X, Y, epochs=40)
        Xd, Yd = X, Y
        for rnd in range(2):          # DAgger: roll the learner out (Ts = 1 ms), label the visited states with the teacher
            log = []
            for _ in range(40):
                qa, qb, T = arm.random_move(train_rng)
                arm.rollout(ctrl_of(lambda x, net=net: net.forward(x[None])[0]), qa, qb, T, 1e-3, 0.0, log=log)
            L = [(arm.features(q, qd, qr, qdr), arm.teacher(q, qd, qr, qdr, qddr) / arm.TAU_MAX) for q, qd, qr, qdr, qddr in log]
            Xd = np.vstack([Xd, [l[0] for l in L]]); Yd = np.vstack([Yd, [l[1] for l in L]])
            net.fit(Xd, Yd, epochs=25, lr=1.5e-3)
        rec = {"hidden": hid, "macs": net.macs(), "val_mse": float(np.mean((net.forward(Xv) - Yv) ** 2)), "dagger_samples": len(Xd) - len(X), "variants": {}}
        q8 = policy.QMLP(net, Xd, 8)
        for name, f in (("float", lambda x, net=net: net.forward(x[None])[0]), ("int8", q8.forward_int), ("int4", policy.QMLP(net, Xd, 4).forward_int)):
            rec["variants"][name] = score(ctrl_of(f), 1e-3, 0.0)
        c8 = ctrl_of(q8.forward_int)
        rec["platform"] = {}
        cache = {}
        for p in platforms():
            cyc = hw.accel_cycles(net.sizes, p["P"]) if p["kind"] == "accel" else hw.mcu_cycles(net.sizes, p["cpm"])
            lat = cyc / p["clock"]
            row = {"cycles": int(cyc), "latency_us": lat * 1e6, "by_ts": {}}
            for ts in TS_MS:
                if lat <= ts / 1e3:
                    key = (ts, round(lat * 1e8))
                    cache[key] = cache.get(key) or score(c8, ts / 1e3, lat)
                    row["by_ts"][str(ts)] = cache[key]
            rec["platform"][p["name"]] = row
        out["nets"].append(rec)
        print(hid, rec["variants"], round(time.time() - t0), "s", flush=True)
    json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    return out


def report(out):
    L = ["accel-policy results (stylised; assumed hardware constants)", f"BC samples {out['n_train']} (+DAgger per network), test moves {out['n_test']}", "",
         "Teacher (computed-torque PD; its own compute cost is not charged): RMS joint error (rad) / peak error (rad) by control period",
         "  Ts (ms)   no delay          one-sample delay"]
    for ts in TS_MS:
        a, b = out["teacher"][str(ts)]["no_delay"], out["teacher"][str(ts)]["one_sample_delay"]
        L.append(f"  {ts:>6}    {a[0]:.5f}/{a[1]:.5f}   {b[0]:.5f}/{b[1]:.5f}")
    L += ["", "Networks (zero latency, Ts = 1 ms): RMS/peak closed-loop error in rad ('inf' = diverged)"]
    for r in out["nets"]:
        s = "  ".join(f"{k} {v[0]:.5f}/{v[1]:.4f}" for k, v in r["variants"].items())
        L.append(f"  hidden {str(r['hidden']):9s} MACs {r['macs']:5d}  DAgger samples {r['dagger_samples']}  val_mse {r['val_mse']:.5f}  {s}")
    L += ["", "Latency (us) per platform and, where latency <= Ts, the int8 closed-loop RMS error (rad) at that Ts; '--' = misses the deadline"]
    for r in out["nets"]:
        L.append(f"hidden {r['hidden']} ({r['macs']} MACs)")
        L.append("  " + "platform".ljust(44) + "cycles latency_us  " + "  ".join(f"{ts:>7}ms" for ts in TS_MS))
        for n, row in r["platform"].items():
            cells = "  ".join((f"{row['by_ts'][str(ts)][0]:9.5f}" if str(ts) in row["by_ts"] else "       --") for ts in TS_MS)
            L.append("  " + n.ljust(44) + f"{row['cycles']:6d} {row['latency_us']:9.1f}  " + cells)
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    report(json.load(open(os.path.join(HERE, "results.json"))) if "--report" in sys.argv else run())
