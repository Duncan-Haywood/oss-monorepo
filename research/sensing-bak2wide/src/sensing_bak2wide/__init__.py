"""Wide field of view for the sensing-bak2 rig: does k2 become identifiable when points reach the image corners?"""
from .wide import wide_rig, rig_radius_stats, run_trial_wide

__all__ = ["wide_rig", "rig_radius_stats", "run_trial_wide"]
