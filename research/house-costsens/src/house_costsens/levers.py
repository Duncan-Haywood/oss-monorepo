"""Load house-cost's LEVERS (name, low kwargs, high kwargs) from its experiment script, so the ranges stay one copy."""
import importlib.util
from pathlib import Path

_RUN = Path(__file__).resolve().parents[3] / "house-cost" / "experiments" / "run.py"


def load_levers():
    spec = importlib.util.spec_from_file_location("house_cost_run", _RUN)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.LEVERS
