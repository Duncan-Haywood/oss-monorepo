"""Make the sibling projects garment-nesting and garment-teardown importable (same pattern as garment-twonodegate)."""
import os, sys
_HERE = os.path.dirname(__file__)
for _p in ("garment-nesting", "garment-teardown"):
    _d = os.path.abspath(os.path.join(_HERE, "..", "..", "..", _p, "src"))
    if _d not in sys.path:
        sys.path.insert(0, _d)
