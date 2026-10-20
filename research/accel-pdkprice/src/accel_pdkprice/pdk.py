"""Read per-operation energies out of SKY130 liberty files and turn fetchprice breakevens into absolute ones.

Liberty units in these files: voltage 1 V, current 1 mA, time 1 ns, so internal_power is in pJ.
Nothing here is measured; every number is a library characterisation value (see README).
"""
import re

UNIT_PJ = 1.0  # V * mA * ns = pJ, for both files used here (checked by units_ok)


def units_ok(text):
    return all(s in text for s in ('voltage_unit : "1V"', 'current_unit : "1mA"')) and \
        re.search(r'time_unit\s*:\s*"1ns"', text) is not None


def cell_block(text, name):
    """Text of one `cell ("name") { ... }` block, found by brace matching."""
    m = re.search(r'cell\s*\(\s*"?%s"?\s*\)\s*\{' % re.escape(name), text)
    if not m:
        raise KeyError(name)
    i, depth = m.end(), 1
    while depth:
        c = text[i]
        depth += (c == "{") - (c == "}")
        i += 1
    return text[m.start():i]


def pin_block(block, pin):
    m = re.search(r'pin\s*\(\s*"?%s"?\s*\)\s*\{' % re.escape(pin), block)
    if not m:
        raise KeyError(pin)
    i, depth = m.end(), 1
    while depth:
        c = block[i]
        depth += (c == "{") - (c == "}")
        i += 1
    return block[m.start():i]


def _numbers(s):
    return [float(x) for x in re.findall(r"-?\d+\.?\d*(?:[eE][-+]?\d+)?", s)]


def power_values(pin, kind):
    """All numbers in every `<kind>_power` table of this pin (kind = rise or fall)."""
    out = []
    for m in re.finditer(r'%s_power\s*\([^)]*\)\s*\{(.*?)\}' % kind, pin, re.S):
        v = re.search(r'values\s*\((.*?)\)\s*;', m.group(1), re.S)
        out += _numbers(v.group(1))
    return out


def flop_clock_energy(text, cell="sky130_fd_sc_hd__dfxtp_1", vdd=1.8):
    """Per-cycle energy of an idle flop (D and Q static), in pJ, with its parts.

    internal = mean rise-edge table + mean fall-edge table of the CLK pin's internal_power;
    pin_switch = C_clk * VDD^2 (charge and discharge of the clock pin capacitance; wire excluded).
    """
    blk = cell_block(text, cell)
    clk = pin_block(blk, "CLK")
    rise, fall = power_values(clk, "rise"), power_values(clk, "fall")
    cap_pf = float(re.search(r'\bcapacitance\s*:\s*([\d.eE+-]+)\s*;', clk).group(1))
    leak_nw = float(re.search(r'cell_leakage_power\s*:\s*([\d.eE+-]+)\s*;', blk).group(1))
    internal = (sum(rise) / len(rise) + sum(fall) / len(fall)) * UNIT_PJ
    internal_lo = (min(rise) + min(fall)) * UNIT_PJ
    internal_hi = (max(rise) + max(fall)) * UNIT_PJ
    return dict(cell=cell, internal_pj=internal, internal_lo_pj=internal_lo, internal_hi_pj=internal_hi,
                pin_cap_ff=cap_pf * 1000.0, pin_switch_pj=cap_pf * vdd * vdd,
                leak_nw=leak_nw, total_pj=internal + cap_pf * vdd * vdd)


def leakage_pj_per_cycle(leak_nw, period_ns):
    return leak_nw * period_ns * 1e-6  # 1 nW * 1 ns = 1e-18 J = 1e-6 pJ


def sram_access_energy(text, clk="clk0"):
    """Energy listed on the macro's clock pin for an access, in pJ (rise-table, fall-table, and their set of distinct values)."""
    m = re.search(r'pin\s*\(\s*%s\s*\)\s*\{' % clk, text)
    i, depth = m.end(), 1
    while depth:
        c = text[i]
        depth += (c == "{") - (c == "}")
        i += 1
    pin = text[m.start():i]
    rise, fall = power_values(pin, "rise"), power_values(pin, "fall")
    return dict(rise_pj=sorted(set(rise)), fall_pj=sorted(set(fall)))


def weights_per_word(width_bits, weight_bits=4):
    return width_bits // weight_bits


def e_weight_pj(access_pj, width_bits, packed, weight_bits=4):
    """Energy attributed to one weight fetch: a whole-word access, shared by the weights packed in it if `packed`."""
    return access_pj / weights_per_word(width_bits, weight_bits) if packed else access_pj


def verdict_flop(e_flop_star_over_e_w, e_flop, e_weight):
    """'WS' if register-file WS beats OS on energy (idle flop cost below the breakeven), else 'OS'; None when no saving."""
    if e_flop_star_over_e_w is None:
        return None
    return "WS" if e_flop / e_weight < e_flop_star_over_e_w else "OS"


def verdict_psum(r_psum_star, e_psum, e_weight):
    if r_psum_star is None:
        return None
    return "WS" if e_psum / e_weight < r_psum_star else "OS"
