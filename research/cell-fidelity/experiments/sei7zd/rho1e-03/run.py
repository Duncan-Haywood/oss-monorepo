"""Rung shim for milestone 7zd (see ../run.py): 7r's spawner calls this file."""
import importlib.util, sys
from pathlib import Path
_s = importlib.util.spec_from_file_location("sei7zd_run", Path(__file__).resolve().parents[1] / "run.py")
_m = importlib.util.module_from_spec(_s); sys.modules["sei7zd_run"] = _m; _s.loader.exec_module(_m)
_m.main(Path(__file__).resolve().parent, sys.argv[1:])
