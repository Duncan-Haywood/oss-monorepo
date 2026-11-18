"""infra_dcopf: DC-OPF, AC checks and linearised OPF variants.

The names below come from `dcopf.py`, which imports pandapower. They are
loaded on first use (PEP 562 `__getattr__`), not at package import, so the
pypower-only modules (`aclin`, `lpac`, `vlin`, `vsched`, `pglib`) import
without pandapower installed. Three runs on 2026-11-13 installed what
`vlin` needs and then failed on `import pandapower` through this file
(prompts/runs/*.json, doc_friction).
"""
import importlib

_DCOPF_NAMES = (
    "CASES", "load_case", "scaled", "gen_cost", "solve_ac", "solve_dc",
    "ac_check_of_dispatch", "compare", "tighten",
    "loss_adjusted_dc", "loss_sensitivities", "penalty_factors",
    "penalty_adjusted_dc", "ac_optimum_penalty_dc", "previous_interval_penalty_dc",
    "clamp_setpoints", "uniform_setpoints",
    "q_violations", "q_balancing_setpoints", "reactive_redispatch",
)

__all__ = list(_DCOPF_NAMES)


def __getattr__(name):
    if name in _DCOPF_NAMES:
        value = getattr(importlib.import_module(".dcopf", __name__), name)
        globals()[name] = value  # cache: later lookups skip __getattr__
        return value
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


def __dir__():
    return sorted(set(globals()) | set(_DCOPF_NAMES))
