"""Self-financed wagering mechanisms as routers for modular, continually
learning experts. Pure standard library."""
from .scoring import brier_score, brier_loss
from .mechanism import WageringMechanism, Round
from .baselines import EqualWeights, Hedge
from .environment import RegimeEnvironment, make_experts
from .simulation import run, RunResult

__all__ = [
    "brier_score", "brier_loss", "WageringMechanism", "Round", "EqualWeights",
    "Hedge", "RegimeEnvironment", "make_experts", "run", "RunResult",
]
