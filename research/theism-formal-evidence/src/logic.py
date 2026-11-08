"""Decision procedures for the arguments in this programme (stdlib only).

Two fragments, each decided exactly:

* Propositional modal logic over a frame class (K, T, B, S4, S5).  For S5 the search
  is complete: a formula is S5-satisfiable iff it holds in a universal model with at
  most (number of diamond/box subformulas + 1) worlds (Ladner 1977).  For K, T, B and
  S4 the search finds certified countermodels up to `max_worlds`; "no countermodel"
  there is evidence, not proof, and the proof lives in lean/ (see VALIDITY_STATUS).
* Monadic first-order logic without identity (one-place predicates, 0-place atoms,
  constants), restricted to sentences with no quantifier inside another.  Such a
  sentence has a model iff it has one with #constants + #quantifiers elements (see
  fo_model), so grounding over that domain and searching is a complete procedure.

Formulas are tuples:
  ('atom', name)                     propositional atom / 0-place predicate
  ('pred', name, term)               one-place predicate applied to a variable or constant
  ('not', f) ('and', f, g) ('or', f, g) ('imp', f, g) ('iff', f, g)
  ('box', f) ('dia', f)              modal operators (modal fragment only)
  ('all', var, f) ('ex', var, f)     quantifiers (monadic fragment only)
  ('top',) ('bot',)
"""
from itertools import combinations, product

FRAME_CLASSES = {
    "K": (),
    "D": ("serial",),
    "T": ("reflexive",),
    "B": ("reflexive", "symmetric"),
    "S4": ("reflexive", "transitive"),
    "S5": ("reflexive", "symmetric", "transitive"),
}


# ---------------------------------------------------------------- helpers
def Not(f): return ("not", f)
def And(*fs):
    out = fs[0]
    for g in fs[1:]:
        out = ("and", out, g)
    return out
def Or(f, g): return ("or", f, g)
def Imp(f, g): return ("imp", f, g)
def Box(f): return ("box", f)
def Dia(f): return ("dia", f)
def A(name): return ("atom", name)
def P(name, term): return ("pred", name, term)
def All(v, f): return ("all", v, f)
def Ex(v, f): return ("ex", v, f)


def subformulas(f):
    yield f
    for part in f[1:]:
        if isinstance(part, tuple):
            yield from subformulas(part)


def atoms(f):
    return sorted({g[1] for g in subformulas(f) if g[0] == "atom"})


def preds(f):
    return sorted({g[1] for g in subformulas(f) if g[0] == "pred"})


def constants(f, bound=()):
    """Terms that are never bound by a quantifier are constants."""
    out = set()
    def walk(g, bnd):
        tag = g[0]
        if tag == "pred":
            if g[2] not in bnd:
                out.add(g[2])
        elif tag in ("all", "ex"):
            walk(g[2], bnd | {g[1]})
        else:
            for part in g[1:]:
                if isinstance(part, tuple):
                    walk(part, bnd)
    walk(f, frozenset(bound))
    return sorted(out)


def show(f):
    tag = f[0]
    if tag == "atom": return f[1]
    if tag == "pred": return f"{f[1]}({f[2]})"
    if tag == "top": return "T"
    if tag == "bot": return "F"
    if tag == "not": return "~" + show(f[1])
    if tag == "box": return "[]" + show(f[1])
    if tag == "dia": return "<>" + show(f[1])
    if tag in ("all", "ex"):
        return ("A" if tag == "all" else "E") + f"{f[1]}." + show(f[2])
    sym = {"and": "&", "or": "|", "imp": "->", "iff": "<->"}[tag]
    return f"({show(f[1])} {sym} {show(f[2])})"


# ---------------------------------------------------------------- modal fragment
def _eval_modal(f, w, R, val):
    tag = f[0]
    if tag == "atom": return w in val[f[1]]
    if tag == "top": return True
    if tag == "bot": return False
    if tag == "not": return not _eval_modal(f[1], w, R, val)
    if tag == "and": return _eval_modal(f[1], w, R, val) and _eval_modal(f[2], w, R, val)
    if tag == "or": return _eval_modal(f[1], w, R, val) or _eval_modal(f[2], w, R, val)
    if tag == "imp": return (not _eval_modal(f[1], w, R, val)) or _eval_modal(f[2], w, R, val)
    if tag == "iff": return _eval_modal(f[1], w, R, val) == _eval_modal(f[2], w, R, val)
    if tag == "box": return all(_eval_modal(f[1], v, R, val) for v in R[w])
    if tag == "dia": return any(_eval_modal(f[1], v, R, val) for v in R[w])
    raise ValueError(f"not a modal formula: {tag}")


def _frames(n, conditions):
    worlds = range(n)
    pairs = [(a, b) for a in worlds for b in worlds]
    if conditions == FRAME_CLASSES["S5"]:
        # every S5 frame is a disjoint union of clusters; a countermodel lives in one
        # cluster, so the universal relation suffices
        yield {w: set(worlds) for w in worlds}
        return
    for bits in product((0, 1), repeat=len(pairs)):
        rel = {p for p, b in zip(pairs, bits) if b}
        if "reflexive" in conditions and any((w, w) not in rel for w in worlds):
            continue
        if "symmetric" in conditions and any((b, a) not in rel for a, b in rel):
            continue
        if "transitive" in conditions and any((a, d) not in rel for a, b in rel for c, d in rel if b == c):
            continue
        if "serial" in conditions and any(all((w, v) not in rel for v in worlds) for w in worlds):
            continue
        yield {w: {v for v in worlds if (w, v) in rel} for w in worlds}


def s5_bound(f):
    return 1 + sum(1 for g in subformulas(f) if g[0] in ("box", "dia"))


def modal_model(f, system="S5", max_worlds=None):
    """A model (n, R, valuation, world) where f is true, or None if none was found.

    For S5 the default bound makes the search complete."""
    cond = FRAME_CLASSES[system]
    names = atoms(f)
    if max_worlds is None:
        max_worlds = s5_bound(f) if system == "S5" else 3
    for n in range(1, max_worlds + 1):
        for R in _frames(n, cond):
            for bits in product((0, 1), repeat=n * len(names)):
                val = {a: {w for w in range(n) if bits[i * n + w]} for i, a in enumerate(names)}
                for w in range(n):
                    if _eval_modal(f, w, R, val):
                        return {"worlds": n, "R": {k: sorted(v) for k, v in R.items()},
                                "val": {k: sorted(v) for k, v in val.items()}, "at": w}
    return None


# ---------------------------------------------------------------- monadic fragment
def _eval_fo(f, env, dom, interp):
    tag = f[0]
    if tag == "atom": return interp["atoms"][f[1]]
    if tag == "pred": return env[f[2]] in interp["preds"][f[1]]
    if tag == "top": return True
    if tag == "bot": return False
    if tag == "not": return not _eval_fo(f[1], env, dom, interp)
    if tag == "and": return _eval_fo(f[1], env, dom, interp) and _eval_fo(f[2], env, dom, interp)
    if tag == "or": return _eval_fo(f[1], env, dom, interp) or _eval_fo(f[2], env, dom, interp)
    if tag == "imp": return (not _eval_fo(f[1], env, dom, interp)) or _eval_fo(f[2], env, dom, interp)
    if tag == "iff": return _eval_fo(f[1], env, dom, interp) == _eval_fo(f[2], env, dom, interp)
    if tag == "all": return all(_eval_fo(f[2], {**env, f[1]: d}, dom, interp) for d in dom)
    if tag == "ex": return any(_eval_fo(f[2], {**env, f[1]: d}, dom, interp) for d in dom)
    raise ValueError(f"not a first-order formula: {tag}")


def _nested(f, inside=False):
    tag = f[0]
    if tag in ("all", "ex"):
        if inside:
            return True
        return _nested(f[2], True)
    return any(_nested(p, inside) for p in f[1:] if isinstance(p, tuple))


def _ground(f, env, m):
    """Replace quantifiers by finite conjunctions/disjunctions over elements 0..m-1."""
    tag = f[0]
    if tag == "pred":
        return ("var", ("p", f[1], env[f[2]]))
    if tag == "atom":
        return ("var", ("a", f[1]))
    if tag in ("top", "bot"):
        return f
    if tag == "not":
        return ("not", _ground(f[1], env, m))
    if tag in ("and", "or", "imp", "iff"):
        return (tag, _ground(f[1], env, m), _ground(f[2], env, m))
    if tag in ("all", "ex"):
        parts = [_ground(f[2], {**env, f[1]: d}, m) for d in range(m)]
        out = parts[0]
        for p in parts[1:]:
            out = ("and" if tag == "all" else "or", out, p)
        return out
    raise ValueError(tag)


def _eval3(f, asg):
    """Three-valued evaluation under a partial assignment: True, False or None."""
    tag = f[0]
    if tag == "var": return asg.get(f[1])
    if tag == "top": return True
    if tag == "bot": return False
    if tag == "not":
        v = _eval3(f[1], asg)
        return None if v is None else not v
    a = _eval3(f[1], asg)
    if tag == "and":
        if a is False: return False
        b = _eval3(f[2], asg)
        if b is False: return False
        return True if a and b else None
    if tag == "or":
        if a is True: return True
        b = _eval3(f[2], asg)
        if b is True: return True
        return False if a is False and b is False else None
    if tag == "imp":
        if a is False: return True
        b = _eval3(f[2], asg)
        if b is True: return True
        return False if a is True and b is False else None
    if tag == "iff":
        b = _eval3(f[2], asg)
        return None if a is None or b is None else a == b
    raise ValueError(tag)


def _vars(f, out):
    if f[0] == "var":
        out.setdefault(f[1], None)
    else:
        for p in f[1:]:
            if isinstance(p, tuple):
                _vars(p, out)
    return out


def _sat(f, order, asg, i=0):
    v = _eval3(f, asg)
    if v is True:
        return dict(asg)
    if v is False or i == len(order):
        return None
    for val in (True, False):
        asg[order[i]] = val
        r = _sat(f, order, asg, i + 1)
        if r is not None:
            return r
        del asg[order[i]]
    return None


def fo_model(f):
    """A model of the monadic sentence f, or None.

    Exact for sentences in which no quantifier occurs inside another (every argument in
    arguments.py): such a sentence is a boolean combination of Ax.phi / Ex.phi with phi
    quantifier-free, so a model keeps its truth value when cut down to the constants plus
    one witness or counterexample per quantified subformula, and duplicating an element
    is harmless without identity.  So a domain of exactly m = #constants + #quantifiers
    elements (at least 1) suffices, and the grounded propositional problem is decided by
    backtracking search."""
    if _nested(f):
        raise ValueError("nested quantifiers are outside this checker's exact fragment")
    cs = constants(f)
    m = max(1, len(cs) + sum(1 for g in subformulas(f) if g[0] in ("all", "ex")))
    env = {c: i for i, c in enumerate(cs)}
    g = _ground(f, env, m)
    order = list(_vars(g, {}))
    asg = _sat(g, order, {})
    if asg is None:
        return None
    full = {k: asg.get(k, False) for k in order}
    return {"domain": m,
            "preds": {p: sorted(k[2] for k, v in full.items() if k[0] == "p" and k[1] == p and v) for p in preds(f)},
            "atoms": {k[1]: v for k, v in full.items() if k[0] == "a"},
            "constants": env}


# ---------------------------------------------------------------- arguments
def is_modal(f):
    return any(g[0] in ("box", "dia") for g in subformulas(f))


def satisfiable(formulas, system="S5", max_worlds=None):
    """A model of all the formulas, or None."""
    f = And(*formulas) if formulas else ("top",)
    return modal_model(f, system, max_worlds) if is_modal(f) else fo_model(f)


def check(premises, conclusion, system="S5", max_worlds=None):
    """{'valid': bool, 'certified': bool, 'countermodel': model or None}.

    'certified' is True when the verdict is proved by the procedure: always for the
    monadic fragment and S5, and for a found countermodel in any system."""
    goal = list(premises) + [Not(conclusion)]
    f = And(*goal)
    modal = is_modal(f)
    m = modal_model(f, system, max_worlds) if modal else fo_model(f)
    complete = (not modal) or system == "S5"
    return {"valid": m is None, "certified": m is not None or complete, "countermodel": m}


def minimal_unsat_subsets(formulas, system="S5"):
    """All minimal inconsistent subsets (by index).  Each is a 'crux': a set of claims
    of which at least one must be given up.  Exponential; fine for <= 10 claims."""
    n = len(formulas)
    found = []
    for size in range(1, n + 1):
        for idx in combinations(range(n), size):
            if any(set(m) <= set(idx) for m in found):
                continue
            sub = [formulas[i] for i in idx]
            f = And(*sub)
            sat = modal_model(f, system) if is_modal(f) else fo_model(f)
            if sat is None:
                found.append(idx)
    return found


def maximal_consistent_subsets(formulas, system="S5"):
    """All maximal satisfiable subsets (by index): the coherent positions available."""
    n = len(formulas)
    found = []
    for size in range(n, -1, -1):
        for idx in combinations(range(n), size):
            if any(set(idx) <= set(m) for m in found):
                continue
            if satisfiable([formulas[i] for i in idx], system) is not None:
                found.append(idx)
    return found
