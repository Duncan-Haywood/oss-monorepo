"""The pypower-only modules must import without pulling in pandapower.

Three runs on 2026-11-13 installed what `vlin` needs and then failed on
`import pandapower` through the package __init__; it now loads dcopf lazily.
"""
import subprocess
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parents[1] / "src"


def test_pypower_modules_do_not_import_pandapower():
    code = (
        "import sys; sys.path.insert(0, %r)\n"
        "import pypower  # noqa: F401  (skip cleanly below if absent)\n"
        "from infra_dcopf import aclin, lpac, vlin, vsched, pglib  # noqa: F401\n"
        "print('pandapower' in sys.modules)\n" % str(SRC)
    )
    r = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True)
    if "No module named 'pypower'" in r.stderr:
        import pytest
        pytest.skip("pypower not installed")
    assert r.returncode == 0, r.stderr
    assert r.stdout.strip() == "False"


def test_dcopf_names_still_resolve_from_the_package():
    import infra_dcopf
    assert "load_case" in dir(infra_dcopf)
    assert set(infra_dcopf.__all__) >= {"load_case", "solve_dc", "CASES"}
