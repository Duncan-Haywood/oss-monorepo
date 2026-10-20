"""Two design families, one question: does 'the mutant synthesises to the golden netlist' predict formal equivalence?

Family A (chip-accel MAC engine, p=8, wb=4): the 27 survivors of the 16 directed vectors in the committed eda-verify log
(`eda-verify/experiments/mutants.jsonl`, formal verdicts from that run); only the netlist signature is new.
Family B (chip-systolic 2x4 array, wb=4): mutated here with eda-verify's operators, checked by 64 random batches of 2
vectors, then formal (eda-verify's checks.formal with the shorter timeouts below) on the survivors.
Writes experiments/systolic.jsonl, experiments/mac_sig.jsonl and experiments/meta.json. About 40 minutes on 4 cores."""
import json
import os
import subprocess
import sys
import tempfile
import time
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
R = os.path.join(HERE, "..", "..")
sys.path[:0] = [os.path.join(HERE, "..", "src")] + [os.path.join(R, p, "src") for p in
                                                      ("chip-systolic", "chip-accel", "eda-verify", "eda-harness")]
import numpy as np                                    # noqa: E402
from chip_systolic import gen as sgen, model as smodel  # noqa: E402
from eda_harness import harness as H                  # noqa: E402
from eda_verify import checks, mutate                 # noqa: E402
from eda_equivxfer import netlist, simcheck           # noqa: E402

C, RR, WB = 4, 2, 4
SAT_T, IND_T = 60, 120
N_BATCH = 32
ROM_SAMPLE = 15
K = sgen.cycles(C, RR) + 2


def systolic_golden():
    xtr, ytr = smodel.make_data(0, 400)
    q = smodel.quantise(smodel.train_float(xtr, ytr), xtr, WB)
    return q, sgen.verilog(q, C, RR)


Q, GOLD = systolic_golden()
XS = simcheck.vectors(Q, RR, N_BATCH, seed=0)
GOLD_SIG = None


def sim_stage(args):
    i, m = args
    try:
        k = simcheck.killed(Q, C, RR, m["text"], XS)
    except RuntimeError:
        return {"i": i, "compiles": False}
    return {"i": i, "compiles": True, "sim_killed": bool(k)}


def survivor_stage(args):
    i, m = args
    sig, ss = netlist.signature(m["text"])
    with tempfile.TemporaryDirectory() as d:
        v, fs = checks.formal(GOLD, m["text"], K, d, SAT_T, IND_T)
    return {"i": i, "sig": sig, "sig_seconds": ss, "formal": v, "formal_seconds": fs}


def mac_stage(args):
    rec, text = args
    sig, ss = netlist.signature(text)
    return {"id": rec["id"], "sig": sig, "sig_seconds": ss}


def main():
    gsig, gs = netlist.signature(GOLD)
    allm = mutate.sites(GOLD)
    rng = np.random.default_rng(0)
    rom = [m for m in allm if m["kind"] == "rom"]
    keep = [m for m in allm if m["kind"] != "rom"] + [rom[j] for j in sorted(rng.choice(len(rom), ROM_SAMPLE, replace=False))]
    # family A first (cheap): signatures of the MAC survivors
    P = H.Problem(); cand = {"p": 8, "wb": 4}
    mgold = P.verilog(cand)
    msig, ms = netlist.signature(mgold)
    byid = {m["id"]: m for m in mutate.sites(mgold)}
    log = [json.loads(l) for l in open(os.path.join(R, "eda-verify", "experiments", "mutants.jsonl"))]
    surv = [r for r in log if r["directed_first"] is None]
    with Pool(4) as pool:
        mac = pool.map(mac_stage, [(r, byid[r["id"]]["text"]) for r in surv])
    with open(os.path.join(HERE, "mac_sig.jsonl"), "w") as f:
        for r, s in zip(surv, mac):
            f.write(json.dumps({**s, "formal": r["formal"], "formal_seconds": r["formal_seconds"], "kind": r["kind"]}) + "\n")
    print("mac done", len(mac), flush=True)
    with Pool(4) as pool:
        sims = pool.map(sim_stage, list(enumerate(keep)))
    ok = [i for i, s in enumerate(sims) if s["compiles"]]
    sv = [i for i in ok if not sims[i]["sim_killed"]]
    print(f"{len(allm)} enumerated, {len(keep)} sampled, {len(ok)} compile, {len(sv)} survive the simulation", flush=True)
    with open(os.path.join(HERE, "systolic.jsonl"), "w") as f, Pool(4) as pool:
        for r in pool.imap_unordered(survivor_stage, [(i, keep[i]) for i in sv]):
            rec = {**r, "id": keep[r["i"]]["id"], "kind": keep[r["i"]]["kind"]}
            f.write(json.dumps(rec) + "\n"); f.flush()
            print(rec["id"], rec["formal"], round(rec["formal_seconds"]), flush=True)
    json.dump({"tools": H.tool_versions(), "systolic": {"r": RR, "c": C, "wb": WB, "bound_cycles": K, "sat_timeout": SAT_T,
               "induct_timeout": IND_T, "sim_batches": N_BATCH, "n_enumerated": len(allm), "n_sampled": len(keep),
               "n_compile": len(ok), "n_survive": len(sv), "golden_cells": sum(gsig.values()), "golden_sig": gsig},
               "mac": {"p": 8, "wb": 4, "golden_cells": sum(msig.values()), "golden_sig": msig}},
              open(os.path.join(HERE, "meta.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
