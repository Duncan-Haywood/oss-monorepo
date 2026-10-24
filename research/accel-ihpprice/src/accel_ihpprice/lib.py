"""Idle clock-pin energies of flops and clock gates, and read/write energies of SRAM macros, from liberty files.

Nothing here is measured; every number is a library characterisation value (see README).

Energy units differ between the libraries used. SKY130 and GF180 give internal_power in V x mA x ns, which is pJ.
IHP SG13G2 declares current_unit 1uA, which would make the same product fJ, but its SRAM files state the unit as
"capacitive_load_unit * voltage_unit^2 per toggle" (pJ), and the standard-cell values only make physical sense that way
(see `unit_ratio`). `energy_unit_pj` therefore takes capacitive_load_unit x voltage_unit^2, which equals the
V x mA x ns reading wherever that one is also sane.
"""
import re

_CAP_PF = {"pf": 1.0, "ff": 1e-3}
_LEAK_W = {"pw": 1e-12, "nw": 1e-9, "uw": 1e-6, "mw": 1e-3}


def _unit(text, key):
    m = re.search(r'%s\s*:\s*"?\s*([\d.]+)\s*([A-Za-z]+)\s*"?\s*;' % key, text)
    return (float(m.group(1)), m.group(2)) if m else None


def energy_unit_pj(text):
    """Energy of one unit of an internal_power value, in pJ: capacitive_load_unit x voltage_unit^2."""
    m = re.search(r'capacitive_load_unit\s*\(\s*([\d.]+)\s*,\s*"?([A-Za-z]+)"?\s*\)', text)
    v = _unit(text, "voltage_unit")
    if not m or not v or v[1].lower() != "v":
        raise ValueError("unrecognised capacitive_load_unit or voltage_unit")
    return float(m.group(1)) * _CAP_PF[m.group(2).lower()] * v[0] ** 2


def vima_unit_pj(text):
    """The other reading: voltage_unit x current_unit x time_unit, in pJ (1 V x 1 mA x 1 ns = 1 pJ)."""
    v, c, t = _unit(text, "voltage_unit"), _unit(text, "current_unit"), _unit(text, "time_unit")
    amp = {"ma": 1e-3, "ua": 1e-6, "a": 1.0}[c[1].lower()]
    sec = {"ns": 1e-9, "ps": 1e-12}[t[1].lower()]
    return v[0] * c[0] * amp * t[0] * sec * 1e12


def leakage_pj_per_cycle(text, leak_value, period_ns):
    """Leakage energy over one clock period, in pJ, from a cell_leakage_power value in the file's unit."""
    u = _unit(text, "leakage_power_unit")
    return leak_value * u[0] * _LEAK_W[u[1].lower()] * period_ns * 1e-9 * 1e12


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


def _table(group, kind):
    """Numbers of the `<kind>_power` table of one internal_power group, or None if absent."""
    m = re.search(r'%s_power\s*\([^)]*\)\s*\{(.*?)\}' % kind, group, re.S)
    if not m:
        return None
    v = re.search(r'values\s*\((.*?)\)\s*;?', m.group(1), re.S)
    return _nums(v.group(1).replace("\\", " "))


def internal_groups(pin):
    """Every internal_power group of a pin as (when-condition without spaces or None, rise values, fall values)."""
    out = []
    for m in re.finditer(r'internal_power\s*\(\s*\)\s*\{', pin):
        g = _block(pin, m)
        w = re.search(r'\bwhen\s*:\s*"([^"]*)"', g)
        out.append((re.sub(r"\s+", "", w.group(1)) if w else None, _table(g, "rise"), _table(g, "fall")))
    return out


def clock_pin_energy(text, cell, pin, vdd, when=None):
    """Idle energy of one clock cycle seen at `pin` of `cell`, in pJ, with its parts.

    internal = mean of the rise table + mean of the fall table, averaged over the pin's internal_power groups
    (all of them, or those whose `when` is in `when`); a missing table counts as 0. pin_switch = C_pin x VDD^2.
    """
    blk = cell_block(text, cell)
    pb = pin_block(blk, pin)
    gs = [g for g in internal_groups(pb) if when is None or g[0] in when]
    if not gs:
        raise ValueError("no matching internal_power group")
    u = energy_unit_pj(text)
    mean = lambda xs: sum(xs) / len(xs) if xs else 0.0
    per = [(mean(r or []) + mean(f or [])) * u for _, r, f in gs]
    lo = min((min(r or [0.0]) + min(f or [0.0])) * u for _, r, f in gs)
    hi = max((max(r or [0.0]) + max(f or [0.0])) * u for _, r, f in gs)
    cap_pf = float(re.search(r'\bcapacitance\s*:\s*([\d.eE+-]+)\s*;', pb).group(1)) * _cap_pf(text)
    lk = re.search(r'\bcell_leakage_power\s*:\s*([\d.eE+-]+)\s*;', blk)
    internal = sum(per) / len(per)
    pin_switch = cap_pf * vdd * vdd
    return dict(cell=cell, groups=len(gs), internal_pj=internal, internal_lo_pj=lo, internal_hi_pj=hi,
                pin_cap_ff=cap_pf * 1000.0, pin_switch_pj=pin_switch, total_pj=internal + pin_switch,
                cell_leakage=float(lk.group(1)) if lk else None)


def _cap_pf(text):
    m = re.search(r'capacitive_load_unit\s*\(\s*([\d.]+)\s*,\s*"?([A-Za-z]+)"?\s*\)', text)
    return float(m.group(1)) * _CAP_PF[m.group(2).lower()]


def unit_ratio(e):
    """internal energy over C_pin x VDD^2 for a clock pin. Real flops land near 1 to 20; a wrong unit is 1000x off."""
    return e["internal_pj"] / e["pin_switch_pj"]


MACRO_NAME = re.compile(r"RM_IHPSG13_1P_(\d+)x(\d+)_")
_ACCESS = {"read": "A_MEN&!A_WEN&A_REN", "write": "A_MEN&A_WEN&!A_REN", "idle": "!A_MEN&!A_WEN&!A_REN"}


def macro_dims(filename):
    """(words, bits per word) from an IHP macro file name such as RM_IHPSG13_1P_256x64_c2_bm_bist_typ_1p20V_25C.lib."""
    m = MACRO_NAME.search(filename)
    return (int(m.group(1)), int(m.group(2))) if m else None


def macro_access_energy(text):
    """Energy per clock edge of one macro access on its A_CLK pin, in pJ, for read, write and idle.

    The file gives a separate scalar for each combination of A_MEN, A_WEN and A_REN (rise table plus fall table).
    """
    pb = pin_block(text, "A_CLK")
    u = energy_unit_pj(text)
    by = {}
    for w, r, f in internal_groups(pb):
        by[w] = (sum(r or []) + sum(f or [])) * u
    return {k: by[v] for k, v in _ACCESS.items()}


def weights_per_word(bits, weight_bits=4):
    return bits // weight_bits


def e_weight_pj(access_pj, bits, packed, weight_bits=4):
    """Energy attributed to one weight fetch: a whole-word access, shared by the weights packed in it if `packed`."""
    return access_pj / weights_per_word(bits, weight_bits) if packed else access_pj


def gated_cost_per_flop_cycle(e_icg_pj, group_size, e_leak_flop_pj=0.0):
    """Idle cost, per extra flop and per cycle, of flops behind one clock gate per `group_size` flops."""
    return e_icg_pj / group_size + e_leak_flop_pj


def min_e_weight_pj(cost_per_flop_cycle_pj, e_flop_star_over_e_w):
    """Weight-fetch energy above which weight-stationary beats output-stationary: c / (e_flop*/e_w)."""
    return cost_per_flop_cycle_pj / e_flop_star_over_e_w


def min_group_size(e_icg_pj, e_weight, ratio, leak_flop_pj=0.0):
    """Smallest flops-per-gate G with e_icg/G + leak < e_weight x ratio; None if even G = infinity does not win."""
    head = e_weight * ratio - leak_flop_pj
    if head <= 0:
        return None
    import math
    return max(1, math.ceil(e_icg_pj / head))
