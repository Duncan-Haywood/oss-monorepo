"""Equivalence-preserving textual rewrites of generated Verilog: statement order, wire names, sum-operand order."""
import random
import re

_DECL = re.compile(r"wire\s*(?:\[[^\]]*\]\s*)?(\w+)")


def shuffle_assigns(src, rng):
    """Shuffle `assign` lines inside each run of consecutive assign lines (declarations stay where they are)."""
    out, run = [], []
    for line in src.split("\n"):
        if line.lstrip().startswith("assign "):
            run.append(line)
            continue
        rng.shuffle(run)
        out += run + [line]
        run = []
    rng.shuffle(run)
    return "\n".join(out + run)


def rename_wires(src, rng):
    """Give every internal wire a random fresh name (ports a, b, s, p are untouched)."""
    names = sorted({m.group(1) for m in _DECL.finditer(src)}, key=len, reverse=True)
    fresh = rng.sample(range(10 ** 6), len(names))
    for n, k in zip(names, fresh):
        src = re.sub(rf"\b{re.escape(n)}\b", f"w{k}", src)
    return src


def permute_sum(src, rng):
    """Reorder the operands of every `assign/wire x = t0 + t1 + ...;` sum (addition is commutative mod 2^n)."""
    def fix(m):
        terms = [t.strip() for t in m.group(2).split("+")]
        rng.shuffle(terms)
        return f"{m.group(1)}{' + '.join(terms)};"
    return re.sub(r"((?:assign|wire(?:\s*\[[^\]]*\])?)\s+\w+\s*=\s*)([^;?{}()]*\+[^;?{}()]*);", fix, src)


REWRITES = {"shuffle": shuffle_assigns, "rename": rename_wires, "permute": permute_sum}


def variant(src, kinds, seed):
    rng = random.Random(seed)
    for k in kinds:
        src = REWRITES[k](src, rng)
    return src
