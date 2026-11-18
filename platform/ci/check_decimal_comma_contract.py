#!/usr/bin/env python3
"""Run decimal_comma_contract.mjs over every venture's detectDecimalComma copy.

32 report analyzers vendor the same decimal-comma detector; 30 had no test
calling it when a red-team run seeded faults into two copies on 2026-11-16 and
both passed. This runs every copy against one case table (see the .mjs file).
No workflow names it, so unwired_checks.py runs it on every pull request.

    python3 platform/ci/check_decimal_comma_contract.py [ventures-dir]
"""
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
CONTRACT = HERE / "decimal_comma_contract.mjs"


def run(root):
    node = shutil.which("node")
    if not node:
        return 1, "node not found: decimal_comma_contract.mjs cannot run (install Node 22)"
    proc = subprocess.run([node, str(CONTRACT), str(root)], capture_output=True, text=True)
    return proc.returncode, (proc.stdout + proc.stderr).strip()


def main(argv):
    root = argv[1] if len(argv) > 1 else HERE.parents[1] / "ventures"
    code, out = run(root)
    print(out)
    return 1 if code else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
