#!/usr/bin/env python3
"""Print a Python interpreter that can import the given modules, installing
them into that same interpreter if none can.

    PY=$(python3 platform/ci/pyenv.py pytest numpy) && "$PY" -m pytest ...

Why: on 2026-10-16 about 20 of the day's 66 CLAUDE.md friction reports were
one problem. Some session images put a bare /usr/local/bin/python3 first on
PATH while `pip` and `apt-get install python3-*` install into /usr/bin/python3,
so the checklist's `python3 -m pytest` failed after a "successful" install and
runs lost minutes finding the right interpreter by hand. This script checks
every python3 it can find, so the answer does not depend on the image.

Order: an interpreter that already imports everything wins. Otherwise each
candidate tries `<it> -m pip install` (pip then always targets that
interpreter), then `apt-get install python3-<module>`, and the first one that
imports everything afterwards is printed. Progress goes to stderr; stdout is
only the path. If all of that fails, a private venv (`$PYENV_VENV`, default
~/.cache/pyenv-venv) gets the pip install. Exit 1 when nothing works, with what
was tried.
"""
import glob
import os
import shutil
import subprocess
import sys

# import name -> package name, where they differ
PIP_NAMES = {"sklearn": "scikit-learn", "yaml": "pyyaml", "PIL": "pillow",
             "skfem": "scikit-fem", "skimage": "scikit-image", "cv2": "opencv-python-headless",
             "bs4": "beautifulsoup4", "dateutil": "python-dateutil"}
APT_NAMES = {"sklearn": "python3-sklearn", "yaml": "python3-yaml", "PIL": "python3-pil",
             "skimage": "python3-skimage", "cv2": "python3-opencv", "bs4": "python3-bs4",
             "dateutil": "python3-dateutil"}


def candidates(path=None, extra_globs=("/usr/bin/python3*", "/usr/local/bin/python3*")):
    """Distinct real interpreters: PATH's python3 first, then versioned ones."""
    seen, out = set(), []
    found = [shutil.which("python3", path=path), sys.executable]
    for pattern in extra_globs:
        found += sorted(glob.glob(pattern), reverse=True)
    for p in found:
        if not p or not os.path.isfile(p) or not os.access(p, os.X_OK):
            continue
        name = os.path.basename(p)
        if name.endswith("-config") or not name.replace("python3", "").replace(".", "").isdigit() and name != "python3":
            continue
        real = os.path.realpath(p)
        if real not in seen:
            seen.add(real)
            out.append(p)
    return out


def imports(py, modules, run=subprocess.run):
    code = "import " + ", ".join(modules) if modules else "pass"
    try:
        return run([py, "-c", code], capture_output=True, timeout=60).returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def pip_install(py, modules, run=subprocess.run, log=lambda m: print(m, file=sys.stderr)):
    pkgs = [PIP_NAMES.get(m, m) for m in modules]
    base = [py, "-m", "pip", "install", "--quiet", "--disable-pip-version-check"]
    for extra in ([], ["--break-system-packages"], ["--user", "--break-system-packages"]):
        try:
            done = run(base + extra + pkgs, capture_output=True, timeout=300)
        except (OSError, subprocess.TimeoutExpired):
            return False
        if done.returncode == 0:
            return True
        tail = (getattr(done, "stderr", None) or b"").decode(errors="replace").strip().splitlines()[-1:]
        log(f"pyenv: {py} -m pip install {' '.join(pkgs)} failed: {tail[0] if tail else 'no output'}")
    return False


def apt_install(modules, run=subprocess.run):
    if not shutil.which("apt-get"):
        return False
    pkgs = [APT_NAMES.get(m, "python3-" + m.lower()) for m in modules]
    try:
        run(["apt-get", "update", "-qq"], capture_output=True, timeout=300)
        return run(["apt-get", "install", "-y", "-qq", "--no-install-recommends", *pkgs],
                   capture_output=True, timeout=600).returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def venv_install(py, modules, venv_dir, run=subprocess.run, log=lambda m: print(m, file=sys.stderr)):
    """Last resort: a private venv, where a system-site install failed (2026-10-17:
    pip into the system interpreter could not build scikit-fem; a plain venv could).
    Returns the venv's python when it imports every module, else None."""
    vpy = os.path.join(venv_dir, "bin", "python")
    try:
        if not os.path.isfile(vpy) and run([py, "-m", "venv", venv_dir], capture_output=True, timeout=300).returncode != 0:
            return None
    except (OSError, subprocess.TimeoutExpired):
        return None
    if imports(vpy, modules, run) or pip_install(vpy, modules, run, log) and imports(vpy, modules, run):
        log(f"pyenv: using venv {venv_dir}")
        return vpy
    return None


def find(modules, cands, run=subprocess.run, log=lambda m: print(m, file=sys.stderr), venv_dir=None):
    for py in cands:
        if imports(py, modules, run):
            return py
    log(f"pyenv: none of {cands} imports {', '.join(modules)}; installing")
    for py in cands:
        if pip_install(py, modules, run, log) and imports(py, modules, run):
            log(f"pyenv: installed with {py} -m pip")
            return py
    if apt_install(modules, run):
        for py in cands:
            if imports(py, modules, run):
                log(f"pyenv: installed with apt-get; {py} imports them")
                return py
    if venv_dir and cands:
        return venv_install(cands[0], modules, venv_dir, run, log)
    return None


def main(argv=None):
    modules = (argv if argv is not None else sys.argv[1:]) or ["pytest"]
    if any(m.startswith("-") for m in modules):
        print(__doc__, file=sys.stderr)
        return 2
    cands = candidates()
    venv_dir = os.environ.get("PYENV_VENV") or os.path.join(os.path.expanduser("~"), ".cache", "pyenv-venv")
    py = find(modules, cands, venv_dir=venv_dir)
    if not py:
        print(f"pyenv: no interpreter imports {', '.join(modules)} after pip and apt; "
              f"tried {cands}", file=sys.stderr)
        return 1
    print(py)
    return 0


if __name__ == "__main__":
    sys.exit(main())
