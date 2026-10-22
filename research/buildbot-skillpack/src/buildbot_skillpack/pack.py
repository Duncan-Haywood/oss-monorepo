"""Skill files: a small versioned JSON format for the building-site robot skills, a loader and a validator.

A skill file says what the skill is (kind), what it takes and gives (interface), the numbers a controller needs
(params), the scenes and criteria it was scored on (scene, criteria) and the success rates it got when it was
published (claimed, with the seed and episode count). `evalpack.rescore` re-runs the scene and compares.
"""
import json
from pathlib import Path

SCHEMA = "buildbot-skillpack/1"
KINDS = {"cohold-follow", "sheathing-nail"}
REQUIRED = ("schema", "name", "kind", "version", "licence", "interface", "params", "scene", "criteria", "claimed", "caveats")
PARAMS = {"cohold-follow": ("K", "B", "Ki"), "sheathing-nail": ("s_read_mm", "s_tool_mm")}
LIMITS = {"K": (1.0, 1e6), "B": (0.0, 1e5), "Ki": (0.0, 1e6), "s_read_mm": (0.0, 50.0), "s_tool_mm": (0.0, 50.0)}


class SkillError(ValueError):
    pass


def validate(d):
    """Raise SkillError unless d is a well-formed skill; returns d."""
    for k in REQUIRED:
        if k not in d:
            raise SkillError("missing field %r" % k)
    if d["schema"] != SCHEMA:
        raise SkillError("unknown schema %r (this loader reads %r)" % (d["schema"], SCHEMA))
    if d["kind"] not in KINDS:
        raise SkillError("unknown kind %r" % d["kind"])
    for p in PARAMS[d["kind"]]:
        if p not in d["params"]:
            raise SkillError("%s: missing param %r" % (d["name"], p))
        v = d["params"][p]
        lo, hi = LIMITS[p]
        if not isinstance(v, (int, float)) or isinstance(v, bool) or not (lo <= v <= hi):
            raise SkillError("%s: param %s=%r outside [%g, %g]" % (d["name"], p, v, lo, hi))
    if not d["caveats"]:
        raise SkillError("%s: a skill must carry its caveats" % d["name"])
    if "not a rated" not in " ".join(d["caveats"]).lower():
        raise SkillError("%s: caveats must say the skill is not a rated capability" % d["name"])
    return d


def load(path):
    return validate(json.loads(Path(path).read_text()))


def load_all(directory):
    return {p.stem: load(p) for p in sorted(Path(directory).glob("*.json"))}


def save(d, path):
    validate(d)
    Path(path).write_text(json.dumps(d, indent=1, sort_keys=False) + "\n")
