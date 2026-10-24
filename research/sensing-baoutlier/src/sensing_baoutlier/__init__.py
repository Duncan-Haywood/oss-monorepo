"""Bundle adjustment with mismatched observations: linear, Huber, Cauchy and trim-and-refit."""
from .outlier import contaminate, robust_adjust, ransac_triangulate, run_trial

__all__ = ["contaminate", "robust_adjust", "ransac_triangulate", "run_trial"]
