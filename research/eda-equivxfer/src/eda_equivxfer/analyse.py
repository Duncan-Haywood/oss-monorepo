"""Score the rule 'the mutant synthesises to the golden netlist' against formal verdicts. Stdlib only."""


def same(sig, gold):
    return sig is not None and sig == gold


def confusion(rows, gold):
    """Rule predicts 'equivalent' when the signature matches the golden one. Truth is the formal verdict, with
    'undecided' kept apart (it is neither a proof nor a kill)."""
    out = {}
    for flag in (True, False):
        sel = [r for r in rows if same(r["sig"], gold) == flag]
        out["same" if flag else "differs"] = {v: sum(r["formal"] == v for r in sel)
                                              for v in ("equivalent", "killed", "undecided")}
    return out


def cost(rows, gold):
    """CPU-s: formal on every survivor vs formal only where the signatures differ (signature charged to all)."""
    full = sum(r["formal_seconds"] for r in rows)
    sig = sum(r["sig_seconds"] for r in rows)
    skipped = sum(r["formal_seconds"] for r in rows if same(r["sig"], gold))
    return {"formal_all": full, "signature_all": sig, "formal_saved": skipped, "net": full - (full - skipped + sig)}
