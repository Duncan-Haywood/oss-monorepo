#!/usr/bin/env python3
"""Print a Python interpreter that can import the given modules, installing
them into that same interpreter if none can.

    PY=$(python3 platform/ci/pyenv.py pytest numpy) && "$PY" -m pytest ...

When the pip name and the import name differ and are not in PIP_NAMES, pass
`pip-name:module` (e.g. `OpenDSSDirect.py:opendssdirect`).

Why: on 2026-10-16 about 20 of the day's 66 CLAUDE.md friction reports were
one problem. Some session images put a bare /usr/local/bin/python3 first on
PATH while `pip` and `apt-get install python3-*` install into /usr/bin/python3,
so the checklist's `python3 -m pytest` failed after a "successful" install and
runs lost minutes finding the right interpreter by hand. This script checks
every python3 it can find, so the answer does not depend on the image.

Order: an interpreter that already imports everything wins. Otherwise each
candidate tries `<it> -m pip install` (pip then always targets that
interpreter). If none works, a private venv (`$PYENV_VENV`, default
~/.cache/pyenv-venv) gets the pip install, and last `apt-get install
python3-<module>` is tried; the first interpreter that imports everything is
printed. Progress goes to stderr; stdout is only the path. Exit 1 when nothing works, with what
was tried.
"""
import fcntl
import glob
import os
import shutil
import subprocess
import sys
import threading
import time

# import name -> package name, where they differ
PIP_NAMES = {"sklearn": "scikit-learn", "yaml": "pyyaml", "PIL": "pillow",
             "skfem": "scikit-fem", "skimage": "scikit-image", "cv2": "opencv-python-headless",
             "bs4": "beautifulsoup4", "dateutil": "python-dateutil",
             "opendssdirect": "OpenDSSDirect.py"}
APT_NAMES = {"sklearn": "python3-sklearn", "yaml": "python3-yaml", "PIL": "python3-pil",
             "skimage": "python3-skimage", "cv2": "python3-opencv", "bs4": "python3-bs4",
             "dateutil": "python3-dateutil"}


# Wheels too big for the default pip timeout. 2026-10-25: a torch install hit
# the 300 s cap, was killed and restarted by the next interpreter and the venv
# (over 15 minutes in all), and a second concurrent call started a duplicate pip.
HEAVY = {"torch", "tensorflow", "jax", "torchvision", "torchaudio"}


# PyPI's torch wheel bundles CUDA libraries (~3 GB, 25-35 min in cloud runs,
# 2026-10-26 and 2026-10-28); the CPU index serves the same version in about 2 min.
TORCH_CPU_INDEX = "https://download.pytorch.org/whl/cpu"
TORCH_FAMILY = {"torch", "torchvision", "torchaudio"}


def pip_timeout(modules):
    """Seconds one pip run may take: $PYENV_PIP_TIMEOUT, else 300, or 1800 for HEAVY."""
    env = os.environ.get("PYENV_PIP_TIMEOUT")
    if env and env.isdigit():
        return int(env)
    return 1800 if HEAVY & set(modules) else 300


# pip distribution name -> import name, so `pyenv.py scikit-learn` works
# (2026-10-20: it built `import scikit-learn`, a SyntaxError, and reported
# "no interpreter imports" after a venv that had everything installed)
IMPORT_NAMES = {v.lower(): k for k, v in PIP_NAMES.items()}


def import_name(arg):
    """Import name for a module or pip name; other dashes become underscores.
    `pip-name:module` names both when neither table knows the pair (it is
    remembered in PIP_NAMES for the install)."""
    if ":" in arg:
        pkg, mod = arg.split(":", 1)
        PIP_NAMES.setdefault(mod, pkg)
        return mod
    return IMPORT_NAMES.get(arg.lower(), arg.replace("-", "_"))


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


def index_reachable(url=TORCH_CPU_INDEX, timeout=8):
    import urllib.request
    try:
        urllib.request.urlopen(url + "/torch/", timeout=timeout).close()
        return True
    except Exception:
        return False


def pip_install(py, modules, run=subprocess.run, log=lambda m: print(m, file=sys.stderr),
                reachable=index_reachable):
    pkgs = [PIP_NAMES.get(m, m) for m in modules]
    base = [py, "-m", "pip", "install", "--quiet", "--disable-pip-version-check"]
    if TORCH_FAMILY & set(modules) and not os.environ.get("PYENV_TORCH_CUDA"):
        base += ["--extra-index-url", TORCH_CPU_INDEX]
        if not reachable():
            # 2026-10-28: the proxy refused this host and pip silently fell back
            # to PyPI's CUDA build (about 25 min); say so up front.
            log(f"pyenv: {TORCH_CPU_INDEX} is unreachable, so pip will pull PyPI's ~3 GB CUDA torch (25 to 35 min); prefer an interpreter that already has torch")
    for extra in ([], ["--break-system-packages"], ["--user", "--break-system-packages"]):
        try:
            done = run(base + extra + pkgs, capture_output=True, timeout=pip_timeout(modules))
        except (OSError, subprocess.TimeoutExpired):
            return False
        if done.returncode == 0:
            return True
        tail = (getattr(done, "stderr", None) or b"").decode(errors="replace").strip().splitlines()[-1:]
        log(f"pyenv: {py} -m pip install {' '.join(pkgs)} failed: {tail[0] if tail else 'no output'}")
        if b"Cannot uninstall" in (getattr(done, "stderr", None) or b""):
            # A distro-owned package (e.g. packaging) blocks the upgrade; the
            # other flag variants fail identically and each costs a full
            # resolve, so go on to the next interpreter or the venv.
            return False
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


HEARTBEAT_SECONDS = 30


def heartbeat(log, every=HEARTBEAT_SECONDS):
    """Log "still installing" every `every` s until the returned Event is set.
    Installs capture pip's output, so a backgrounded call's output file stayed empty
    for 15+ minutes and runs could not tell a live install from a hung one
    (doc_friction, 2026-10-24 and 2026-10-25)."""
    stop, start = threading.Event(), time.monotonic()

    def beat():
        while not stop.wait(every):
            log(f"pyenv: still installing ({int(time.monotonic() - start)} s)")
    threading.Thread(target=beat, daemon=True).start()
    return stop


def find(modules, cands, run=subprocess.run, log=lambda m: print(m, file=sys.stderr), venv_dir=None):
    for py in cands:
        if imports(py, modules, run):
            return py
    stop = heartbeat(log)
    try:
        return install(modules, cands, run, log, venv_dir)
    finally:
        stop.set()


def install(modules, cands, run, log, venv_dir):
    log(f"pyenv: none of {cands} imports {', '.join(modules)}; installing "
        "(can take over 120 s, torch-class wheels 15 min or more: if your shell tool times out, rerun with run_in_background "
        "and read the path from its output)")
    for py in cands:
        if pip_install(py, modules, run, log) and imports(py, modules, run):
            log(f"pyenv: installed with {py} -m pip")
            return py
    if venv_dir and cands:
        # Before apt: `apt-get update` is slow and often fails in these images,
        # while a venv sidesteps PEP 668 (2026-10-19: pip hit the 120s foreground
        # timeout, then a venv by hand worked).
        vpy = venv_install(cands[0], modules, venv_dir, run, log)
        if vpy:
            return vpy
    if apt_install(modules, run):
        for py in cands:
            if imports(py, modules, run):
                log(f"pyenv: installed with apt-get; {py} imports them")
                return py
    return None


def main(argv=None):
    modules = (argv if argv is not None else sys.argv[1:]) or ["pytest"]
    if any(m.startswith("-") for m in modules):
        print(__doc__, file=sys.stderr)
        return 2
    modules = [import_name(m) for m in modules]
    cands = candidates()
    venv_dir = os.environ.get("PYENV_VENV") or os.path.join(os.path.expanduser("~"), ".cache", "pyenv-venv")
    # One install at a time: a second call waits here, then finds the first's
    # result importable instead of starting a duplicate pip.
    lock = open(os.path.join(os.path.dirname(venv_dir) or ".", ".pyenv.lock"), "w") if os.path.isdir(os.path.dirname(venv_dir)) else None
    if lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            # Silent waiting looked like a hang (doc_friction, 2026-10-28:
            # "printed nothing" while another install held the lock).
            print("pyenv: another pyenv.py install is running; waiting for it", file=sys.stderr)
            fcntl.flock(lock, fcntl.LOCK_EX)
    py = find(modules, cands, venv_dir=venv_dir)
    if not py:
        print(f"pyenv: no interpreter imports {', '.join(modules)} after pip and apt; "
              f"tried {cands}", file=sys.stderr)
        return 1
    default = shutil.which("python3")
    if default and os.path.realpath(default) == os.path.realpath(py):
        print(f"pyenv: {py} is the default python3; plain python3 imports them too",
              file=sys.stderr)
    print(py)
    return 0


if __name__ == "__main__":
    sys.exit(main())
