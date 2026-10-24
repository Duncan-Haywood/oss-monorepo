"""Whole-system energy per decision = front end + classifier (or cascade)."""
FRAMES_PER_S = 50.0   # 20 ms hop, accel-frontend
DECISIONS_PER_S = 4.0  # accel-kws rate


def fe_nj_per_decision(fe_frame_nj, scale=1.0):
    """Streaming: every frame computed once, so 12.5 frames per decision."""
    return fe_frame_nj * scale * FRAMES_PER_S / DECISIONS_PER_S


def system_nj(clf_nj, fe_frame_nj, scale=1.0):
    return fe_nj_per_decision(fe_frame_nj, scale) + clf_nj


def saving(single_clf_nj, any_clf_nj, fe_frame_nj, scale=1.0):
    """Fractional whole-system saving of the second over the first."""
    a = system_nj(single_clf_nj, fe_frame_nj, scale)
    b = system_nj(any_clf_nj, fe_frame_nj, scale)
    return (a - b) / a


def breakeven_scale(single_clf_nj, any_clf_nj, fe_frame_nj, goal):
    """Front-end cost multiplier at which the saving reaches `goal` (None if never)."""
    if single_clf_nj <= 0 or (single_clf_nj - any_clf_nj) / single_clf_nj < goal:
        return None
    d = single_clf_nj - any_clf_nj
    # d / (fe*s + single) = goal  ->  s = (d/goal - single) / fe
    return (d / goal - single_clf_nj) / fe_nj_per_decision(fe_frame_nj)
