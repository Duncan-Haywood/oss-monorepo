"""Idle clock-pin energies of flops and clock-gating cells (ICGs) from liberty files, in pJ per clock cycle.

Nothing here is measured; every number is a library characterisation value (see README).
Liberty units in the files used: 1 V, 1 mA, 1 ns, so internal_power is in pJ.
"""
import re


def units_ok(text):
    q = r'\"?'
    return (re.search(r'voltage_unit\s*:\s*%s1V%s' % (q, q), text) is not None
            and re.search(r'current_unit\s*:\s*%s1mA%s' % (q, q), text) is not None
            and re.search(r'time_unit\s*:\s*%s1ns%s' % (q, q), text) is not None)


def _block(text, m):
    i, depth = m.end(), 1
    while depth:
        c = text[i]
        depth += (c == "{") - (c == "}")
        i += 1
    return text[m.start():i]


def cell_block(text, name):
    m = re.search(r'cell\s*\(\s*"?%s"?\s*\)\s*\{' % re.escape(name), text)
    if not m:
        raise KeyError(name)
    return _block(text, m)


def pin_block(block, pin):
    m = re.search(r'pin\s*\(\s*"?%s"?\s*\)\s*\{' % re.escape(pin), block)
    if not m:
        raise KeyError(pin)
    return _block(block, m)


def _nums(s):
    return [float(x) for x in re.findall(r"-?\d+\.?\d*(?:[eE][-+]?\d+)?", s)]


def _table_mean(group, kind):
    """Mean of the numbers in the `<kind>_power` table of one internal_power group, or None if absent."""
    m = re.search(r'%s_power\s*\([^)]*\)\s*\{(.*?)\}' % kind, group, re.S)
    if not m:
        return None
    v = re.search(r'values\s*\((.*?)\)\s*;?', m.group(1), re.S)
    xs = _nums(v.group(1).replace("\\", " "))
    return xs


def internal_groups(pin):
    """Every internal_power group of a pin as (when-condition or None, rise values, fall values)."""
    out = []
    for m in re.finditer(r'internal_power\s*\(\s*\)\s*\{', pin):
        g = _block(pin, m)
        w = re.search(r'\bwhen\s*:\s*"([^"]*)"', g)
        out.append((w.group(1) if w else None, _table_mean(g, "rise"), _table_mean(g, "fall")))
    return out


def clock_pin_energy(text, cell, pin="CLK", when=None, vdd=None):
    """Idle energy of one clock cycle seen at `pin` of `cell`, in pJ, with its parts.

    internal = mean of the rise table + mean of the fall table, averaged over the pin's internal_power groups
    (all of them, or those whose `when` is in `when`); a missing table counts as 0.
    pin_switch = C_pin * VDD^2. Leakage is reported separately (cell_leakage_power, in the file's unit).
    """
    blk = cell_block(text, cell)
    pb = pin_block(blk, pin)
    gs = [g for g in internal_groups(pb) if (when is None or g[0] in when)]
    if not gs:
        raise ValueError("no matching internal_power group")
    mean = lambda xs: sum(xs) / len(xs) if xs else 0.0
    per = [mean(r or []) + mean(f or []) for _, r, f in gs]
    lo = min(min(r or [0.0]) + min(f or [0.0]) for _, r, f in gs)
    hi = max(max(r or [0.0]) + max(f or [0.0]) for _, r, f in gs)
    cap = float(re.search(r'\bcapacitance\s*:\s*([\d.eE+-]+)\s*;', pb).group(1))
    lk = re.search(r'\bcell_leakage_power\s*:\s*([\d.eE+-]+)\s*;', blk)
    leak = float(lk.group(1)) if lk else None
    internal = sum(per) / len(per)
    out = dict(cell=cell, groups=len(gs), internal_pj=internal, internal_lo_pj=lo, internal_hi_pj=hi,
               pin_cap_ff=cap * 1000.0, cell_leakage=leak)
    if vdd is not None:
        out["pin_switch_pj"] = cap * vdd * vdd
        out["total_pj"] = internal + cap * vdd * vdd
    return out


def gated_cost_per_flop_cycle(e_icg_pj, group_size, e_leak_flop_pj=0.0):
    """Idle cost, per extra flop and per cycle, of flops behind one clock gate per `group_size` flops.

    The gated flops are clocked only when written (the same writes the OS design makes, which drop out),
    so what remains is the gate's own idle clock energy shared over the group, plus the flop's leakage.
    """
    return e_icg_pj / group_size + e_leak_flop_pj


def min_e_weight_pj(cost_per_flop_cycle_pj, e_flop_star_over_e_w):
    """Weight-fetch energy above which weight-stationary beats output-stationary: c / (e_flop*/e_w)."""
    return cost_per_flop_cycle_pj / e_flop_star_over_e_w
