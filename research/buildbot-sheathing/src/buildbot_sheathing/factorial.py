"""A 2 x 2 split of a change into two factors and their interaction (milestone 42)."""


def split2x2(oo, ao, ob, ab):
    """Split ab - oo (both factors changed) into a's effect at b fixed, b's at a fixed, and the interaction.

    oo: neither changed; ao: only a; ob: only b; ab: both. Returns a dict with 'both', 'a', 'b' and
    'interaction', where both == a + b + interaction exactly. Raises ValueError if any cell is None."""
    if None in (oo, ao, ob, ab):
        raise ValueError("a cell has no value")
    a, b, both = ao - oo, ob - oo, ab - oo
    return {"both": both, "a": a, "b": b, "interaction": both - a - b}
