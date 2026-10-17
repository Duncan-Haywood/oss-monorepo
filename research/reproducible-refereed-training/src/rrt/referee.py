"""Teacher-forced refereed verification of a committed training trace.

The solver commits a Merkle root over states s_0..s_T. A verifier re-executes
*teacher-forced*: it computes f(s_{i-1}) from the solver's own committed
s_{i-1}, so drift does not compound across steps; only one-step drift matters.
On finding a step with ||s_i - f(s_{i-1})||_inf > tau it submits (i, s_{i-1},
s_i, Merkle proofs) and the referee re-executes that single step. Cost to the
referee: one step plus 2*ceil(log2 T) hashes, independent of T.
tau = 0 is the bitwise (RepOps) rule.
"""
from dataclasses import dataclass

from .merkle import verify_proof
from .train import step


@dataclass
class Claim:
    i: int
    s_prev: list
    s_cur: list
    proof_prev: list
    proof_cur: list


def linf(a, b):
    return max(abs(x - y) for x, y in zip(a, b))


def verifier_find_violation(prob, states, tree, tau, order="canonical", rng=None):
    """Returns a Claim for the first step exceeding tau, or None."""
    for i in range(1, len(states)):
        if linf(states[i], step(prob, states[i - 1], order, rng)) > tau:
            return Claim(i, states[i - 1], states[i], tree.proof(i - 1), tree.proof(i))
    return None


def referee_check(prob, root, claim, tau, order="canonical"):
    """True iff the claim proves a violation (solver slashed)."""
    if not (verify_proof(root, claim.s_prev, claim.i - 1, claim.proof_prev)
            and verify_proof(root, claim.s_cur, claim.i, claim.proof_cur)):
        return False
    return linf(claim.s_cur, step(prob, claim.s_prev, order)) > tau
