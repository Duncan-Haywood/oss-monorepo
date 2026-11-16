"""Write regret.svg (milestone 8): milestone 6's figure (worst-case regret, refitted against fixed
fits) drawn from this step's regret.json, which adds the six complex-centrality rules.
Reads regret.json (written by run.py; never retyped). Stdlib only.

python3 experiments/m8_cc_uncertainty/figure.py
"""
import importlib.util
from pathlib import Path

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("m6fig", HERE.parent / "m6_uncertainty" / "figure.py")
m6fig = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m6fig)
m6fig.HERE = HERE

if __name__ == "__main__":
    m6fig.main()
