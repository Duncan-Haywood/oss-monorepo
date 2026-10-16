"""A scratch build of the apex tool mirror, shared by the gitops tests.

The tests used to read the committed `gitops/prod/front-door-tools/` tree. They
now build it with `front-door-tools.mjs --write --out <tmp>` (which touches no
tracked file), so the tree can be removed without breaking them (process
backlog P014 / P022). One build per pytest process.
"""

from __future__ import annotations

import atexit
import functools
import shutil
import subprocess
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
COMMITTED_MIRROR = REPO / "gitops" / "prod" / "front-door-tools"


@functools.lru_cache(maxsize=1)
def mirror_kustomization() -> Path:
    out = Path(tempfile.mkdtemp(prefix="front-door-mirror-"))
    atexit.register(shutil.rmtree, out, ignore_errors=True)
    subprocess.run(
        ["node", str(REPO / "platform/marketing/front-door-tools.mjs"), "--write", "--out", str(out)],
        check=True, capture_output=True, text=True, cwd=REPO,
    )
    return out / "kustomization.yaml"


def all_kustomizations(root: Path) -> list[Path]:
    """Every kustomization under `root`, with the mirror's taken from the scratch build."""
    found = [k for k in sorted(root.rglob("kustomization.yaml")) if k.parent != COMMITTED_MIRROR]
    return found + [mirror_kustomization()]
