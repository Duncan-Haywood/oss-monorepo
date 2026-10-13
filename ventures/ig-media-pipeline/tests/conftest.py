"""Shared test helpers: a byte-level fingerprint of a folder tree, and a stand-in rawtherapee-cli."""
from __future__ import annotations

import hashlib
import os
import stat
import sys
from pathlib import Path

import pytest


def tree(root: Path) -> dict[str, tuple]:
    """Every file, folder and link under root (hidden ones too) with its content hash, size,
    mtime and mode, so any write, touch, chmod, rename, deletion or new file shows up."""
    out: dict[str, tuple] = {}
    for dirpath, dirnames, filenames in os.walk(root):
        for name in dirnames + filenames:
            p = os.path.join(dirpath, name)
            st = os.lstat(p)
            rel = os.path.relpath(p, root)
            if stat.S_ISREG(st.st_mode):
                with open(p, "rb") as fh:
                    digest = hashlib.sha256(fh.read()).hexdigest()
                out[rel] = ("file", digest, st.st_size, st.st_mtime_ns, st.st_mode)
            else:
                out[rel] = ("dir" if stat.S_ISDIR(st.st_mode) else "other", st.st_mtime_ns, st.st_mode)
    return out


@pytest.fixture
def library_tree():
    return tree


FAKE_RAWTHERAPEE = '''#!{python}
"""Stand-in for rawtherapee-cli that misbehaves the way a real one could: besides rendering to
-o, it writes a .pp3 sidecar next to its input (as -O or a GUI preference might) and leaves an
extra file beside its output. It logs its arguments to $FAKE_RT_LOG."""
import json, os, sys
from PIL import Image
args = sys.argv[1:]
out, src = args[args.index("-o") + 1], args[-1]
if os.environ.get("FAKE_RT_LOG"):
    with open(os.environ["FAKE_RT_LOG"], "a") as fh:
        fh.write(json.dumps(args) + "\\n")
with open(src + ".pp3", "w") as fh:
    fh.write("[Version]\\n")
with open(out + ".out.pp3", "w") as fh:
    fh.write("[Version]\\n")
img = Image.new("RGB", (600, 400), (150, 120, 90))
img.paste((40, 60, 160), (300, 0, 600, 400))
img.save(out, "TIFF")
'''


@pytest.fixture
def fake_rawtherapee(tmp_path) -> Path:
    path = tmp_path / "bin" / "rawtherapee-cli"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(FAKE_RAWTHERAPEE.format(python=sys.executable))
    path.chmod(0o755)
    return path
