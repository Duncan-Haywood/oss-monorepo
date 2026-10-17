"""Cost-function markets as expert-routing / online-learning algorithms."""
from .simplex import softmax, project_simplex
from .markets import EntropicMarket, QuadraticMarket
from .routing import run_routing, RoutingResult, hedge_regret_bound, ftrl_l2_regret_bound

__all__ = [
    "softmax", "project_simplex", "EntropicMarket", "QuadraticMarket",
    "run_routing", "RoutingResult", "hedge_regret_bound", "ftrl_l2_regret_bound",
]
