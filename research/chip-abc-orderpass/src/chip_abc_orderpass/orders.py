"""csel4 carry-select adder with the operand order of every `a + b + const` chain chosen explicitly."""
import itertools
import re

from .gens import gen_add16

# chains with a constant 0 (x chains and the first block) and with a constant 1 (y chains)
_CHAIN = re.compile(r"(wire \[4:0\] (\w+) = )(a\[\d+:\d+\]) \+ (b\[\d+:\d+\]) \+ (5'd[01]);")


def orders():
    return list(itertools.permutations(range(3)))


def csel4(order0, order1):
    """`order0` / `order1`: permutation of (a, b, const) used by every const-0 / const-1 chain."""
    def fix(m):
        terms = [m.group(3), m.group(4), m.group(5)]
        order = order1 if m.group(5) == "5'd1" else order0
        return m.group(1) + " + ".join(terms[i] for i in order) + ";"
    return _CHAIN.sub(fix, gen_add16("csel", 4))


def label(order):
    return "".join("abk"[i] for i in order)  # k = the constant
