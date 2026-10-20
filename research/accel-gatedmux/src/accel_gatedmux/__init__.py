"""accel-gatedrtl's simulate/synth wrapper pointed at this project's rewritten RTL (RTL_DIR is looked up at call time)."""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "..", "accel-gatedrtl", "src"))
from accel_gatedrtl import rtl as _base  # noqa: E402

NEW_DIR = os.path.join(HERE, "..", "..", "rtl")
OLD_DIR = _base.RTL_DIR


class _Variant:
    """simulate / synth against either RTL directory; everything else is accel_gatedrtl.rtl."""
    def __init__(self, d): self.d = d
    def __getattr__(self, n): return getattr(_base, n)
    def simulate(self, *a, **k):
        _base.RTL_DIR = self.d
        try: return _base.simulate(*a, **k)
        finally: _base.RTL_DIR = OLD_DIR
    def synth(self, *a, **k):
        _base.RTL_DIR = self.d
        try: return _base.synth(*a, **k)
        finally: _base.RTL_DIR = OLD_DIR


rtl_base = _base
old, new = _Variant(OLD_DIR), _Variant(NEW_DIR)
