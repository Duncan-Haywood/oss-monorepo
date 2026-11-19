"""The cell-fidelity triage runner (7n's lean read) under a policy fitted on the same state-read observables (7o).

    python experiments/state7o/triage.py --cond Chen2020@1.5x --x '[...]'                     # deploy_state
    python experiments/state7o/triage.py --cond Chen2020@1.5x --x '[...]' --policy replay7h_state

Same runner as `experiments/lean7n/triage.py` (solve 10 cycles in one long-lived `Simulation`, read the picked
observable from the dead-lithium state, stop or extend in place to cycle 50); only the policy file differs: its lines
and thresholds were fitted on state-read observables (`run.py policy`), so the scorer and its tuning now match.
Needs numpy and pybamm (26.10.1.1 here).
"""
import importlib.util
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def _mod(name, path):
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


N = _mod("lean7n_triage", HERE.parent / "lean7n" / "triage.py")


def load_policy(name="deploy_state"):
    return N.load_policy(name, HERE / "policy.json")


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--cond", required=True)
    ap.add_argument("--x", required=True, help="design vector as JSON")
    ap.add_argument("--policy", default="deploy_state")
    a = ap.parse_args()
    print(json.dumps(N.run_design(a.cond, json.loads(a.x), load_policy(a.policy))))
