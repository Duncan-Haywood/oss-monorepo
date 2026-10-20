"""Excitation design for calibrating a mass-spring-damper twin (standard library only)."""
from .core import (TRUE, simulate, inputs, jacobian, crb_std, fit, trial_errors, heldout_rmse,
                   condition_number)

__all__ = ["TRUE", "simulate", "inputs", "jacobian", "crb_std", "fit", "trial_errors",
           "heldout_rmse", "condition_number"]
