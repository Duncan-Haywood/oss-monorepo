"""Harmonised permit classes, shared by the loader and the transfer runs (stdlib only).

Session 69 found that the catch-all class 'other' is large in Chicago and Seattle because
their `permit_type` field names a review track ("express permit program", "building"),
not the kind of work, and that `work_class` rescues only Austin. The kind of work is in
the free-text description, which the loader used to keep only as a length.

So there are now two keyword maps:
  RULES       for the short structured labels (permit_type, work_class); unchanged since
              session 10, so every committed transfer result reproduces.
  DESC_RULES  for free-text descriptions. Order differs on purpose: descriptions list
              trades inside larger jobs ("new single family residence with electrical and
              plumbing"; "install new water heater"), so demolition and new construction
              need whole-job phrases and come first, structural alteration words next, and
              the single-trade classes only after those. "new" alone does not mean new
              construction in a description.

DESC_RULES were written from the feeds' documented field meanings and common permit
phrasing, before any description text was classified with them (session 70, 2026-11-10,
feeds unreachable). How much of 'other' they rescue, and how often they are wrong, is
unmeasured until a pull: see LOG.md, session 70.

`cascade` picks the first non-'other' class from permit_type, then work_class, then the
description class, so a structured label always wins where it says something.
"""
import re

CLASSES = ["new_construction", "alteration", "electrical", "plumbing", "mechanical",
           "demolition", "sign", "fire", "other"]

RULES = [("new_construction", r"new construction|new building|new const|\bnew\b"),
         ("demolition", r"demol|wreck"),
         ("electrical", r"electric|wiring"),
         ("plumbing", r"plumb|water heater|sewer"),
         ("mechanical", r"mechanic|hvac|furnace|boiler|heating|refriger|ventilat"),
         ("sign", r"\bsign|awning|banner"),
         ("fire", r"fire|sprinkler"),
         ("alteration", r"alter|renov|repair|remodel|addition|additions|reno|ot -|otc|interior|exterior")]

DESC_RULES = [
    ("demolition", r"\bdemo(lish|lition)?\b|\bwreck|\braze\b"),
    ("new_construction", r"\berect\b|\bconstruct(ion of)? (a |an )?new\b|new construction|new building"
                         r"|\bnew (\d+[- ]?(story|storey|unit)|single[- ]family|two[- ]family|multi[- ]?family"
                         r"|detached|attached|duplex|triplex|townhouse|townhome|apartment|dwelling|residen"
                         r"|house|home|sfr|adu|dadu|garage|commercial|mixed[- ]use|warehouse|office)"),
    ("alteration", r"\balter|remodel|renovat|\baddition|tenant improvement|\bt\.?i\.?\b|build[- ]?out"
                   r"|change of use|convert|conversion|underpin|foundation repair|structural"),
    ("electrical", r"electric|wiring|\bsolar\b|photovoltaic|\bpv\b|low voltage|service upgrade|\bev charg"),
    ("plumbing", r"plumb|water heater|sewer|\bgas line|\bgas pipe|backflow|water service"),
    ("mechanical", r"mechanic|hvac|furnace|boiler|heating|heat pump|refriger|ventilat|air condition|\bduct"),
    ("sign", r"\bsign(s|age)?\b|awning|banner|billboard"),
    ("fire", r"fire (alarm|sprinkler|suppression|escape)|sprinkler"),
    ("alteration", r"repair|replace|re-?roof|roofing|siding|window|deck|porch|fence|retaining wall"
                   r"|interior|exterior|kitchen|bath"),
]


def _first(rules, s):
    t = (s or "").lower()
    for name, pat in rules:
        if re.search(pat, t):
            return name
    return "other"


def harmonise(s):
    """Class of a short structured label (permit_type or work_class)."""
    return _first(RULES, s)


def describe(s):
    """Class of a free-text work description."""
    return _first(DESC_RULES, s)


def cascade(permit_type, work_class="", desc_class=""):
    """First non-'other' class of permit_type, work_class, then the stored description class."""
    for c in (harmonise(permit_type), harmonise(work_class) if work_class else "other",
              desc_class if desc_class in CLASSES else "other"):
        if c != "other":
            return c
    return "other"
