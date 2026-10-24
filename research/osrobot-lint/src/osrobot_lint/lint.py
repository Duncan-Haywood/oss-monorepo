"""A stdlib static linter for Opentrons Python API v2 protocol scripts.

It walks the script's syntax tree and runs the liquid-handling calls on a small abstract machine (tip
state, which tip wells were used, the volume in each well declared with load_liquid, the liquid in the
tip). It adds checks the Opentrons simulator does not make (see osrobot-labreal): a reused tip, a tip
left on at the end, a volume below the pipette minimum, an aspirate from a well declared to hold less,
a dispense of more than the tip holds, a tip carried between different liquids, a well filled past its
capacity.

It does not run the script. It follows straight-line code, `for` loops over a literal list or
`range(...)` of constants, assignments of constants, f-strings, and `plate["A1"]`, `plate.wells()[i]`
and `plate.wells_by_name()["A1"]`. Anything else it meets (transfer(), mix(), a while loop, a
function call it cannot evaluate) is reported as an INFO "SKIPPED" line and the affected state is
marked unknown, so it stays quiet rather than guess. Volumes, capacities and pipette limits are
ASSUMED values from memory of the published specifications; none was checked against a datasheet.
"""
import ast
from dataclasses import dataclass

# ASSUMED (uL): pipette name -> (minimum, maximum)
PIPETTES = {
    "p20_single_gen2": (1.0, 20.0), "p300_single_gen2": (20.0, 300.0), "p1000_single_gen2": (100.0, 1000.0),
    "p20_multi_gen2": (1.0, 20.0), "p300_multi_gen2": (20.0, 300.0),
}
# ASSUMED (uL): labware load name -> (kind, well capacity)
LABWARE = {
    "opentrons_96_tiprack_300ul": ("tips", 0.0), "opentrons_96_tiprack_20ul": ("tips", 0.0),
    "opentrons_96_tiprack_1000ul": ("tips", 0.0),
    "corning_96_wellplate_360ul_flat": ("plate", 360.0), "nest_96_wellplate_200ul_flat": ("plate", 200.0),
    "nest_12_reservoir_15ml": ("reservoir", 15000.0),
    "opentrons_24_tuberack_nest_1.5ml_snapcap": ("tubes", 1500.0),
}
ROWS = {"tips": 8, "plate": 8, "reservoir": 1, "tubes": 4}
COLS = {"tips": 12, "plate": 12, "reservoir": 12, "tubes": 6}


@dataclass
class Finding:
    code: str
    line: int
    message: str

    def __str__(self):
        return f"line {self.line}: {self.code}: {self.message}"


class _Skip(Exception):
    pass


class _Bad(Exception):
    """A reference that would raise at run time (unknown labware key, well off the labware)."""


def _wells(kind):
    """Well names in the API's order (column by column)."""
    return [f"{'ABCDEFGH'[r]}{c + 1}" for c in range(COLS[kind]) for r in range(ROWS[kind])]


class _Labware:
    def __init__(self, load_name):
        if load_name not in LABWARE:
            raise _Skip(f"unknown labware {load_name!r}")
        self.name = load_name
        self.kind, self.cap = LABWARE[load_name]
        self.wells = _wells(self.kind)


class _Well:
    def __init__(self, lw, name):
        self.lw, self.name = lw, name


class _Pip:
    def __init__(self, name, tip_racks):
        if name not in PIPETTES:
            raise _Skip(f"unknown pipette {name!r}")
        self.lo, self.hi = PIPETTES[name]
        self.tip_racks = tip_racks


class _Wells:
    """A `plate.wells()` list or a `wells_by_name()` mapping."""
    def __init__(self, lw):
        self.lw = lw


class _Lint:
    def __init__(self):
        self.findings = []
        self.env = {}
        self.used = set()
        self.tip = None                 # None, or dict(vol, liquid) (vol None when unknown)
        self.vol = {}                   # (id(lw), well) -> declared uL
        self.liq = {}                   # (id(lw), well) -> declared liquid name
        self.known = set()              # wells whose declared volume is still exact
        self.skipped = 0
        self.unsure = False             # a statement was skipped: tip state may be wrong

    def flag(self, code, node, msg):
        self.findings.append(Finding(code, getattr(node, "lineno", 0), msg))

    # --- expression evaluation -------------------------------------------------------------
    def ev(self, n):
        if isinstance(n, ast.Constant):
            return n.value
        if isinstance(n, ast.Name):
            if n.id in self.env:
                return self.env[n.id]
            raise _Skip(f"name {n.id!r} has no known value")
        if isinstance(n, ast.JoinedStr):
            return "".join(str(self.ev(v.value)) if isinstance(v, ast.FormattedValue) else v.value for v in n.values)
        if isinstance(n, ast.BinOp):
            a, b = self.ev(n.left), self.ev(n.right)
            ops = {ast.Add: lambda: a + b, ast.Sub: lambda: a - b, ast.Mult: lambda: a * b,
                   ast.Div: lambda: a / b, ast.FloorDiv: lambda: a // b, ast.Mod: lambda: a % b}
            if type(n.op) in ops:
                return ops[type(n.op)]()
            raise _Skip("operator")
        if isinstance(n, ast.UnaryOp) and isinstance(n.op, ast.USub):
            return -self.ev(n.operand)
        if isinstance(n, (ast.List, ast.Tuple)):
            return [self.ev(e) for e in n.elts]
        if isinstance(n, ast.Subscript):
            base, idx = self.ev(n.value), self.ev(n.slice)
            if isinstance(base, _Labware):
                if idx not in base.wells:
                    raise _Bad(f"{idx!r} is not a well of {base.name}")
                return _Well(base, idx)
            if isinstance(base, _Wells):
                names = base.lw.wells
                return _Well(base.lw, names[idx] if isinstance(idx, int) else idx)
            if isinstance(base, dict):
                if idx not in base:
                    raise _Bad(f"{idx!r} is not a loaded labware")
                return base[idx]
            if isinstance(base, list):
                return base[idx]
            raise _Skip("subscript")
        if isinstance(n, ast.Call):
            f = n.func
            if isinstance(f, ast.Name) and f.id == "range":
                return list(range(*[self.ev(a) for a in n.args]))
            if isinstance(f, ast.Attribute) and f.attr in ("wells", "wells_by_name") and not n.args:
                base = self.ev(f.value)
                if isinstance(base, _Labware):
                    return _Wells(base)
        raise _Skip("expression")

    def labware(self, n):
        """Evaluate n; accept a Labware."""
        v = self.ev(n)
        if not isinstance(v, _Labware):
            raise _Skip("not labware")
        return v

    # --- statements ------------------------------------------------------------------------
    def run(self, body):
        for st in body:
            self.stmt(st)

    def stmt(self, st):
        try:
            self._stmt(st)
        except _Bad as e:
            self.flag("BAD_REFERENCE", st, str(e))
        except _Skip as e:
            self.skipped += 1
            self.unsure = True
            self.flag("SKIPPED", st, str(e))
            if self.tip is not None:
                self.tip = {"vol": None, "liquid": None}

    def _stmt(self, st):
        if isinstance(st, ast.Expr) and isinstance(st.value, ast.Constant):
            return
        if isinstance(st, (ast.Import, ast.ImportFrom, ast.Pass, ast.Return)):
            return
        if isinstance(st, ast.Assign):
            self.assign(st)
        elif isinstance(st, ast.For):
            if not isinstance(st.target, ast.Name):
                raise _Skip("loop target")
            items = self.ev(st.iter)
            if not isinstance(items, list):
                raise _Skip("loop over a non-literal")
            for it in items:
                self.env[st.target.id] = it
                self.run(st.body)
        elif isinstance(st, ast.Expr) and isinstance(st.value, ast.Call):
            self.call(st.value)
        else:
            raise _Skip(f"statement {type(st).__name__}")

    def assign(self, st):
        if len(st.targets) != 1:
            raise _Skip("multiple assignment")
        t, v = st.targets[0], st.value
        val = self.value(v)
        if isinstance(t, ast.Name):
            self.env[t.id] = val
        elif isinstance(t, ast.Subscript) and isinstance(t.value, ast.Name) and isinstance(self.env.get(t.value.id), dict):
            self.env[t.value.id][self.ev(t.slice)] = val
        else:
            raise _Skip("assignment target")

    def value(self, v):
        """An assigned value: the call forms of the API, or an evaluable expression."""
        if isinstance(v, ast.Call) and isinstance(v.func, ast.Attribute):
            m = v.func.attr
            if m == "load_labware":
                return _Labware(self.ev(v.args[0]))
            if m == "load_instrument":
                racks = []
                for kw in v.keywords:
                    if kw.arg == "tip_racks":
                        racks = self.ev(kw.value)
                return _Pip(self.ev(v.args[0]), racks)
            if m == "define_liquid":
                for kw in v.keywords:
                    if kw.arg == "name":
                        return ("liquid", self.ev(kw.value))
                return ("liquid", None)
        if isinstance(v, ast.Dict) and not v.keys:
            return {}
        return self.ev(v)

    # --- calls -----------------------------------------------------------------------------
    def call(self, c):
        if not isinstance(c.func, ast.Attribute):
            raise _Skip("call")
        m = c.func.attr
        if m == "load_liquid":
            return self.load_liquid(c)
        pip = self.ev(c.func.value) if isinstance(c.func.value, ast.Name) else None
        if not isinstance(pip, _Pip):
            raise _Skip(f"call .{m}()")
        if m == "pick_up_tip":
            return self.pick_up(c, pip)
        if m == "drop_tip":
            if self.tip is None and not self.unsure:
                self.flag("NO_TIP", c, "drop_tip with no tip attached")
            self.tip = None
            return
        if m in ("aspirate", "dispense"):
            return self.move_liquid(c, pip, m)
        raise _Skip(f"call .{m}()")

    def load_liquid(self, c):
        w = self.ev(c.func.value)
        if not isinstance(w, _Well):
            raise _Skip("load_liquid target")
        kind, vol = self.ev(c.args[0]), self.ev(c.args[1])
        key = (id(w.lw), w.name)
        self.vol[key] = float(vol)
        self.known.add(key)
        self.liq[key] = kind[1] if isinstance(kind, tuple) else None

    def pick_up(self, c, pip):
        if self.tip is not None:
            if not self.unsure:
                self.flag("TIP_PRESENT", c, "pick_up_tip while a tip is attached")
            return
        if c.args:
            w = self.ev(c.args[0])
            if not isinstance(w, _Well):
                raise _Skip("pick_up_tip target")
        else:
            w = next((_Well(r, n) for r in pip.tip_racks for n in r.wells if (id(r), n) not in self.used), None)
            if w is None:
                self.flag("NO_TIPS_LEFT", c, "no unused tip left in the tip racks")
                return
        key = (id(w.lw), w.name)
        if w.lw.kind != "tips":
            self.flag("NOT_TIPRACK", c, f"{w.lw.name} is not a tip rack")
        elif key in self.used:
            self.flag("TIP_REUSED", c, f"tip {w.name} was already used")
        self.used.add(key)
        self.tip = {"vol": 0.0, "liquid": None}

    def move_liquid(self, c, pip, op):
        v = self.ev(c.args[0])
        w = self.ev(c.args[1]) if len(c.args) > 1 else None
        if not isinstance(w, _Well):
            raise _Skip(f"{op} target")
        if self.tip is None:
            if not self.unsure:
                self.flag("NO_TIP", c, f"{op} with no tip attached")
            return
        if not (pip.lo <= v <= pip.hi):
            self.flag("VOLUME_RANGE", c, f"{v:g} uL is outside the pipette range {pip.lo:g}-{pip.hi:g} uL")
        key = (id(w.lw), w.name)
        tip = self.tip
        if op == "aspirate":
            lq = self.liq.get(key)
            if tip["liquid"] and lq and tip["liquid"] != lq:
                self.flag("CARRY_OVER", c, f"tip held {tip['liquid']!r}, now aspirating {lq!r}")
            if key in self.known and v > self.vol[key] + 1e-9:
                self.flag("SOURCE_EMPTY", c, f"aspirate {v:g} uL from {w.lw.name} {w.name} declared to hold {self.vol[key]:g} uL")
            if tip["vol"] is not None and tip["vol"] + v > pip.hi + 1e-9:
                self.flag("TIP_OVERFILL", c, f"tip would hold {tip['vol'] + v:g} uL")
            if key in self.known:
                self.vol[key] = max(0.0, self.vol[key] - v)
            if tip["vol"] is not None:
                tip["vol"] += v
            tip["liquid"] = tip["liquid"] or lq
        else:
            if tip["vol"] is not None and v > tip["vol"] + 1e-9:
                self.flag("DISPENSE_EXCESS", c, f"dispense {v:g} uL but the tip holds {tip['vol']:g} uL")
            if w.lw.cap and key in self.known and self.vol[key] + v > w.lw.cap + 1e-9:
                self.flag("OVERFLOW", c, f"{w.lw.name} {w.name} would hold {self.vol[key] + v:g} uL, over {w.lw.cap:g} uL")
            if tip["vol"] is not None:
                tip["vol"] = max(0.0, tip["vol"] - v)
            # a destination starts empty unless declared; track what we put in so overflow can fire later
            if key not in self.known:
                self.known.add(key)
                self.vol[key] = 0.0
            self.vol[key] += v
            if not self.liq.get(key):
                self.liq[key] = tip["liquid"]


def lint(source):
    """Return the findings (a list of Finding) for a protocol script. SKIPPED entries are INFO."""
    tree = ast.parse(source)
    lt = _Lint()
    body = tree.body
    for node in body:
        if isinstance(node, ast.FunctionDef) and node.name == "run" and node.args.args:
            lt.env[node.args.args[0].arg] = _Ctx()
            body = node.body
            break
    # the protocol context object: load_labware / load_instrument / define_liquid are handled in value()
    lt.run(body)
    if lt.tip is not None and not lt.unsure:
        lt.findings.append(Finding("TIP_LEFT", 0, "the protocol ends with a tip attached"))
    return lt.findings


class _Ctx:
    """Stand-in for the protocol context passed to run()."""
