"""Milestone 2e: compare the load shape of the force-model cycles with a measured excavator power trace.

Measured: Zenodo 18862594 (CC-BY-4.0), electric excavator electrical power, 0.1 s samples. Model: the
useful hydraulic power (sum of pressure x flow) per phase of the 2c force-model cycles, time-weighted.
Both normalised by their own peak, so only the shape is compared. Stdlib, seeded.
"""
import csv, os, random, statistics, sys, io, contextlib
here = os.path.dirname(__file__)
sys.argv = [sys.argv[0]]
with contextlib.redirect_stdout(io.StringIO()):   # importing physics_cycle runs its study; we only want `one`
    sys.path.insert(0, here)
    import physics_cycle as pc

def shape(p):
    pk = max(p)
    return {"load_factor": statistics.mean(p) / pk, **{f"below_{int(t*100)}": sum(x < t * pk for x in p) / len(p) for t in (.1, .2, .3, .5)}}

def measured(name):
    rows = list(csv.reader(open(os.path.join(here, "data", name))))[1:]
    return shape([float(b) for _, b in rows])

def model_cycle(c):
    # time-weighted samples: (seconds, useful power W) with p bar x q L/min -> W = p*1e5 * q/60000
    return [(ph.seconds, sum(a.pressure * a.flow for a in ph.actuators) * 1e5 / 60000) for ph in c]

def model_shape(c):
    w = [(s, x) for s, x in model_cycle(c)]
    tot = sum(s for s, _ in w); pk = max(x for _, x in w)
    out = {"load_factor": sum(s * x for s, x in w) / tot / pk}
    for t in (.1, .2, .3, .5):
        out[f"below_{int(t*100)}"] = sum(s for s, x in w if x < t * pk) / tot
    return out

if __name__ == "__main__":
    for n in ("ElectricExcavator_profile.csv", "Digging_profile.csv"):
        print("measured", n, {k: round(v, 3) for k, v in measured(n).items()})
    ms = [model_shape(pc.one(random.Random(s * 7919 + i))[0]) for s in pc.SEEDS for i in range(pc.N)]
    for k in ms[0]:
        v = sorted(m[k] for m in ms)
        print(f"model {k:12s} median {v[len(v)//2]:.3f}  5-95%: {v[int(.05*len(v))]:.3f} to {v[int(.95*len(v))]:.3f}")
