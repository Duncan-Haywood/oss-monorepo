"""Run model-written stroke generators with a restricted namespace and a time limit.

This is containment against mistakes, not a security boundary: the code comes
from a small local model, runs in a child-free exec with numpy and math only,
no imports, no file or network builtins, and an alarm-based time limit.
"""
import math
import re
import signal

import numpy as np

SAFE_BUILTINS = {n: __builtins__[n] if isinstance(__builtins__, dict) else getattr(__builtins__, n)
                 for n in ("abs", "min", "max", "range", "len", "float", "int", "round", "sum",
                           "zip", "enumerate", "list", "tuple", "pow", "sorted", "bool")}
BANNED = re.compile(r"\b(import|open|exec|eval|compile|__\w+__|globals|locals|getattr|setattr)\b")


class Timeout(Exception):
    pass


def _alarm(*_):
    raise Timeout()


def extract(text):
    """The first python block (or the whole reply) as source."""
    m = re.search(r"```(?:python)?\n(.*?)```", text, re.S)
    return (m.group(1) if m else text).strip()


def compile_generator(src):
    """Return gen(start, end, rng) -> array (n,3) of (t_ms, x, y), or raise ValueError."""
    # models habitually start with `import numpy as np`; np and math are already
    # provided, so drop plain numpy/math imports and reject any other import
    src = re.sub(r"^\s*import (numpy(?: as np)?|math)\s*$", "", src, flags=re.M)
    src = re.sub(r"^\s*from (numpy|math) import .*$", "", src, flags=re.M)
    # a demo block under `if __name__ == ...` is not part of the generator
    src = re.split(r"^if __name__", src, maxsplit=1, flags=re.M)[0]
    # words in comments and docstrings are not code
    code = re.sub(r'"""[\s\S]*?"""|\'\'\'[\s\S]*?\'\'\'', "", src)
    code = re.sub(r"#.*", "", code)
    if BANNED.search(code):
        raise ValueError("banned token")
    ns = {"__builtins__": SAFE_BUILTINS, "np": np, "math": math}
    try:
        exec(compile(src, "<model>", "exec"), ns)
    except Exception as e:  # noqa: BLE001
        raise ValueError(f"does not load: {type(e).__name__}") from e
    fn = ns.get("generate")
    if not callable(fn):  # the model renamed the one function it defined
        defs = [v for k, v in ns.items() if hasattr(v, "__code__") and k not in ("np", "math")]
        fn = defs[-1] if defs else None
    if not callable(fn):
        raise ValueError("no generate()")
    return fn


def run(fn, start, end, rng, limit=1):
    old = signal.signal(signal.SIGALRM, _alarm)
    signal.alarm(limit)
    try:
        out = np.asarray(fn(np.array(start, float), np.array(end, float), rng), float)
    except Timeout:
        raise ValueError("timeout")
    except Exception as e:  # noqa: BLE001
        raise ValueError(f"crashed: {type(e).__name__}") from e
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, old)
    if out.ndim != 2 or out.shape[1] != 3 or len(out) < 3 or not np.isfinite(out).all():
        raise ValueError("bad shape")
    if np.any(np.diff(out[:, 0]) <= 0):
        raise ValueError("time not increasing")
    if out[-1, 0] > 10000:
        raise ValueError("too long")
    out = out.copy()
    out[0, 1:], out[-1, 1:] = start, end  # same endpoint pinning as the component generator
    return out


def make_imitate(fn):
    def imitate(contexts, seed):
        rng = np.random.default_rng(seed)
        return [run(fn, c[0, 1:], c[-1, 1:], rng) for c in contexts]
    return imitate
