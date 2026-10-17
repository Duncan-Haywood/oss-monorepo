"""Peer-prediction and prediction-market mechanisms for verifying
decentralized ML training, without ground-truth recomputation on every step.
"""

from .scoring_rules import log_score, brier_score, spherical_score, SCORING_RULES
from .peer_prediction import peer_truth_serum, correlated_agreement_matrix, ca_payment
from .market_maker import LMSRMarketMaker
from .agents import Verifier, generate_tasks
from .reputation import (
    pts_calibration_scores,
    trust_weights,
    trust_weighted_correlated_agreement_matrix,
    reputation_weighted_trade_size,
)
from .simulation import SimulationConfig, run_simulation

__all__ = [
    "log_score",
    "brier_score",
    "spherical_score",
    "SCORING_RULES",
    "peer_truth_serum",
    "correlated_agreement_matrix",
    "ca_payment",
    "LMSRMarketMaker",
    "Verifier",
    "generate_tasks",
    "pts_calibration_scores",
    "trust_weights",
    "trust_weighted_correlated_agreement_matrix",
    "reputation_weighted_trade_size",
    "SimulationConfig",
    "run_simulation",
]
