"""Generic tools shared by the single-check models: a 2x2 mixed-equilibrium solver and the
inspection game written down as payoff matrices (not as the closed form it is tested against)."""
from dataclasses import dataclass
from fractions import Fraction

__all__ = ["Inspection", "solve_2x2", "inspection_equilibrium", "inspection_closed_form"]


@dataclass(frozen=True)
class Inspection:
    s: float            # worker's saving from cheating (steps skipped, compute saved)
    S: float            # worker's stake, forfeited when a cheat is checked
    k: float            # verifier's cost of checking
    lam: float = 0.5    # share of the slashed stake paid to the catcher
    h: float = 0.0      # verifier's harm from an unchecked bad result


def solve_2x2(A, B):
    """Nash equilibria of a 2x2 bimatrix game (row payoffs A, column payoffs B).

    Returns a list of (p, q), p = P(row plays 0), q = P(column plays 0): every pure equilibrium,
    plus the interior mixed one when it exists. Exact arithmetic on the inputs' floats."""
    out = []
    for i in (0, 1):
        for j in (0, 1):
            if A[i][j] >= A[1 - i][j] and B[i][j] >= B[i][1 - j]:
                out.append((1.0 - i, 1.0 - j))
    # indifference of the column player fixes p, of the row player fixes q
    dB = B[0][0] - B[0][1] - B[1][0] + B[1][1]
    dA = A[0][0] - A[1][0] - A[0][1] + A[1][1]
    if dA != 0 and dB != 0:
        p = (B[1][1] - B[1][0]) / dB
        q = (A[1][1] - A[0][1]) / dA
        if 0 < p < 1 and 0 < q < 1:
            out.append((p, q))
    return out


def inspection_equilibrium(g: Inspection):
    """(cheat rate x, check rate y) of the unique equilibrium, from the payoff matrices.

    Worker row 0 = cheat, 1 = honest; verifier column 0 = check, 1 = skip.
    Cheat: caught if checked (-S), saves s if skipped. Verifier: checking costs k and, on a cheat,
    earns lam*S; skipping on a cheat costs h."""
    A = [[-g.S, g.s], [0.0, 0.0]]
    B = [[g.lam * g.S - g.k, -g.h], [-g.k, 0.0]]
    eq = solve_2x2(A, B)
    mixed = [e for e in eq if 0 < e[0] < 1]
    if mixed:
        return mixed[0][0], mixed[0][1]
    # no interior equilibrium: the pure one (cheat, skip) when checking never pays
    return 1.0, 0.0


def inspection_closed_form(g: Inspection):
    """x = k/(lam S + h), y = s/(s+S) when checking can pay; else (1, 0)."""
    if g.k >= g.lam * g.S + g.h:
        return 1.0, 0.0
    return g.k / (g.lam * g.S + g.h), g.s / (g.s + g.S)
