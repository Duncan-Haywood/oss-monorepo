"""The loop as a tool: proposer -> generate -> lint -> RTL sim vs reference -> gate-level equivalence -> synthesis PPA.

Each candidate is a dict of design parameters. Results are cached by a hash of the generated Verilog, the
stage configuration and the tool versions, and every evaluation (including cache hits) is appended to a JSONL log.
Place and route is an optional stage that is skipped when OpenROAD is not installed (it was not here).
"""
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
import time

import numpy as np

from chip_accel import flow, gen, model  # reuse chip-accel's generator, testbench and Yosys score script

STAGES = ("generate", "lint", "rtl_sim", "gate_equiv", "synth")


def tool_versions():
    y = subprocess.run(["yosys", "-V"], capture_output=True, text=True).stdout.strip()
    i = subprocess.run(["iverilog", "-V"], capture_output=True, text=True).stdout.splitlines()[0]
    return {"yosys": y, "iverilog": i, "openroad": shutil.which("openroad") is not None}


class Problem:
    """A parameterised design generator, a reference model and a search space. Here: chip-accel's MAC engine."""
    space = {"p": list(range(1, 9)), "wb": [4, 5, 6, 7, 8]}

    def __init__(self, n_vec=24, seed=0):
        self.xtr, self.ytr = model.make_data(0, 400)
        self.xte, self.yte = model.make_data(1, 400)
        self.params = model.train_float(self.xtr, self.ytr)
        self.n_vec, self.seed = n_vec, seed

    def quant(self, cand):
        return model.quantise(self.params, self.xtr, cand["wb"])

    def verilog(self, cand):
        return gen.verilog(self.quant(cand), cand["p"])

    def vectors(self, cand):
        q = self.quant(cand)
        return q, q["xq"](self.xte[: self.n_vec])

    def reference(self, cand):
        q = self.quant(cand)
        full = model.int_forward(q, q["xq"](self.xte))
        return float((model.predict(full) == self.yte).mean())


def _run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


def _gate_netlist(v):
    """Synthesise to generic gates and write the netlist back as Verilog (same module name, same ports)."""
    with tempfile.TemporaryDirectory() as d:
        open(f"{d}/a.v", "w").write(v)
        r = _run(["yosys", "-q", "-p", f"read_verilog {d}/a.v; hierarchy -top accel; synth -top accel -flatten; "
                  f"abc -g {flow.GATES}; opt_clean; write_verilog -noattr {d}/n.v"])
        if r.returncode:
            raise RuntimeError(r.stderr or r.stdout)
        return open(f"{d}/n.v").read()


def _sim_text(prob, cand, verilog_text):
    """Simulate arbitrary Verilog text for `accel` with the shared testbench; return (outputs, cycles)."""
    q, xi = prob.vectors(cand)
    real = gen.verilog
    gen.verilog = lambda *_a, **_k: verilog_text      # flow.simulate writes gen.verilog(...): substitute the netlist
    try:
        return flow.simulate(q, cand["p"], xi)
    finally:
        gen.verilog = real


class Harness:
    def __init__(self, prob, log_path, cache_dir):
        self.prob, self.log_path, self.cache_dir = prob, log_path, cache_dir
        os.makedirs(cache_dir, exist_ok=True)
        self.versions = tool_versions()
        self.n_eval = 0

    def _key(self, v):
        h = hashlib.sha256()
        h.update(v.encode()); h.update(json.dumps([self.prob.n_vec, self.versions], sort_keys=True).encode())
        return h.hexdigest()[:20]

    def evaluate(self, cand):
        t_all = time.perf_counter()
        times, rec = {}, {"cand": cand, "versions": self.versions}

        def stage(name, fn):
            t = time.perf_counter(); out = fn(); times[name] = time.perf_counter() - t; return out

        v = stage("generate", lambda: self.prob.verilog(cand))
        key = self._key(v); rec["hash"] = key
        path = os.path.join(self.cache_dir, key + ".json")
        if os.path.exists(path):
            cached = json.load(open(path)); rec.update(cached["result"]); rec["cache_hit"] = True
            rec["stage_seconds"] = {"generate": times["generate"]}
        else:
            rec["cache_hit"] = False
            res = self._stages(cand, v, stage)
            rec.update(res)
            json.dump({"result": res}, open(path, "w"))
            rec["stage_seconds"] = times
        rec["wall_seconds"] = time.perf_counter() - t_all
        self.n_eval += 1; rec["eval_index"] = self.n_eval
        with open(self.log_path, "a") as f:
            f.write(json.dumps(rec, default=float) + "\n")
        return rec

    def _stages(self, cand, v, stage):
        res = {"passed": False, "failed_stage": None}
        # lint: compile with Icarus and let Yosys read + check the hierarchy
        with tempfile.TemporaryDirectory() as d:
            open(f"{d}/a.v", "w").write(v)
            def lint():
                a = _run(["iverilog", "-g2012", "-Wall", "-o", f"{d}/x", f"{d}/a.v"])
                b = _run(["yosys", "-q", "-p", f"read_verilog {d}/a.v; hierarchy -check -top accel; check -assert"])
                return a.returncode == 0 and b.returncode == 0
            if not stage("lint", lint):
                res["failed_stage"] = "lint"; return res
        q, xi = self.prob.vectors(cand)
        ref = model.int_forward(q, xi)
        out, cs = stage("rtl_sim", lambda: flow.simulate(q, cand["p"], xi))
        res["rtl_match"] = bool((out == ref).all()); res["cycles"] = cs[0] if cs else None
        res["cycles_ok"] = set(cs) == {gen.cycles(cand["p"])}
        if not (res["rtl_match"] and res["cycles_ok"]):
            res["failed_stage"] = "rtl_sim"; return res
        # equivalence of the synthesised gate netlist with the reference on the same vectors (simulation-based, not formal)
        def equiv():
            nl = _gate_netlist(v)
            o2, c2 = _sim_text(self.prob, cand, nl)
            return bool((o2 == ref).all()) and c2 == cs
        res["gate_match"] = bool(stage("gate_equiv", equiv))
        if not res["gate_match"]:
            res["failed_stage"] = "gate_equiv"; return res
        s = stage("synth", lambda: flow.score(q, cand["p"]))
        res.update(cells=s["cells"], ff=s["ff"], depth=s["depth"], int_acc=self.prob.reference(cand))
        res["cells_x_cycles"] = s["cells"] * res["cycles"]
        res["passed"] = True
        return res


# ---- proposers: one interface -------------------------------------------------------------------------
class Proposer:
    def __init__(self, space, seed=0):
        self.space, self.rng = space, np.random.default_rng(seed)

    def propose(self, history):
        raise NotImplementedError


class RandomProposer(Proposer):
    def propose(self, history):
        return {k: int(self.rng.choice(v)) for k, v in self.space.items()}


class GridProposer(Proposer):
    def __init__(self, space, seed=0):
        super().__init__(space, seed)
        import itertools
        ks = list(space)
        self.grid = [dict(zip(ks, map(int, c))) for c in itertools.product(*space.values())]
        self.i = 0

    def propose(self, history):
        c = self.grid[self.i % len(self.grid)]; self.i += 1
        return c


def pareto(recs, objs=("cells", "cycles")):
    ok = [r for r in recs if r.get("passed")]
    front = []
    for r in ok:
        if not any(all(o[k] <= r[k] for k in objs) and any(o[k] < r[k] for k in objs) for o in ok):
            if not any(f["cand"] == r["cand"] for f in front):
                front.append(r)
    return sorted(front, key=lambda r: r[objs[0]])


def run_loop(harness, proposer, budget):
    hist = []
    for _ in range(budget):
        hist.append(harness.evaluate(proposer.propose(hist)))
    return hist
