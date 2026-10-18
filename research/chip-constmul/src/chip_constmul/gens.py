"""Verilog for y = x * K (x unsigned XW bits, K a constant) in three forms (original, MIT)."""

XW = 8


def csd(k):
    """Canonical signed digits of k >= 0 as a list of (shift, +1/-1); no two adjacent digits are non-zero."""
    out, i = [], 0
    while k:
        if k & 1:
            d = 2 - (k & 3)  # +1 if k = ...01, -1 if k = ...11
            out.append((i, d))
            k -= d
        k >>= 1
        i += 1
    return out


def binary_digits(k):
    return [(i, 1) for i in range(k.bit_length()) if (k >> i) & 1]


def _terms(digits, yw):
    if not digits:
        return f"{yw}'d0"
    s = ""
    for n, (sh, d) in enumerate(digits):
        t = f"(xe << {sh})"
        s += (f"{t}" if d > 0 else f"- {t}") if n == 0 else (f" + {t}" if d > 0 else f" - {t}")
    return s


def verilog(form, k, xw=XW):
    """Return (source, top). `form` is 'op' (x*K), 'bin' (shift-add of set bits) or 'csd'."""
    yw = xw + max(1, k.bit_length())
    top = f"{form}_{k}"
    head = f"module {top}(input [{xw-1}:0] x, output [{yw-1}:0] y); wire [{yw-1}:0] xe = x;"
    if form == "op":
        body = f"assign y = x * {yw}'d{k};"
    elif form == "bin":
        body = f"assign y = {_terms(binary_digits(k), yw)};"
    elif form == "csd":
        body = f"assign y = {_terms(csd(k), yw)};"
    else:
        raise ValueError(form)
    return f"{head} {body} endmodule\n", top
