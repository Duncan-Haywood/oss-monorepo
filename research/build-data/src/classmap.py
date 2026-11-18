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


# DESC_RULES_V2 (session 71, 2026-11-10). Written AFTER the rules above were scored against
# 400 hand labels (200 Chicago, 200 Seattle, 2023 applications whose permit_type and work_class
# both map to 'other'; LOG.md session 71). Each change answers an error seen there, so the
# dev-set score of V2 is optimistic; its honest score is on a second, held-out sample of 2022
# applications labelled before V2 was run on it (results/desc_rules_eval.json). Changes:
#   * administrative rows (contractor change, revision, reinstatement, withdrawal) -> 'other' first;
#   * conveying equipment and scaffolds -> 'other' (no class fits; they were caught by 'replace');
#   * a leading "(construct) alterations / additions / tenant improvement" names the job (Seattle);
#   * fire alarm before alteration ("fire alarm ... tenant build out" was alteration);
#   * strong electrical words (solar, photovoltaic, low voltage, amp service, riser, panel, camera)
#     before new construction: "erect a photovoltaic array" was new construction;
#   * "erect" is new construction only when no fence, scaffold, array, sign or antenna follows;
#   * "construct (west) two-family dwelling", "construct apartment building", "construct accessory
#     structure / detached garage" are new construction without the word "new" (Seattle);
#   * seismic retrofit, push piers, masonry, tuckpointing, drywall, roof -> alteration;
#   * service, fixtures, outlets, circuits, generators -> electrical; split systems, rooftop
#     units, pumps -> mechanical; piping words -> plumbing.
_ADMIN = (r"change (of )?(the )?(\w+ )?contractor|contractor (name )?change|revision to permit"
          r"|reinstate|withdraw|complete and final|name change")
_ELEC_STRONG = (r"\bsolar\b|photovolt|\bpv\b|low voltage|\b\d+ ?a(mp)?s?\b.{0,30}service|\bamp\b"
                r"|(electric(al)?|temp(orary)?) (service|power|wiring)|service upgrade|upgrade (\w+ )?service"
                r"|repair service|\briser\b|\bpanel\b|feeder|meter (socket|bank)|transfer switch"
                r"|camera|security system|burglar alarm|access control|data cabl|\bev charg|\bel\. code")
DESC_RULES_V2 = [
    ("other", _ADMIN),
    ("other", r"elevator|platform lift|wheelchair lift|scaffold"),
    ("alteration", r"^\W*(construct(ion)? )?((interior|exterior|substantial|minor|non[- ]?structural) )*"
                   r"(alteration|additions?\b(?! of)|tenant improvement)"),
    ("demolition", r"\bdemo(lish|lition)?\b|\bwreck|\braze\b"),
    ("fire", r"fire (alarm|sprinkler|suppression|escape)|sprinkler"),
    ("electrical", _ELEC_STRONG),
    ("new_construction", r"\berect\b(?![^.]*\b(fence|scaffold|photovolt|solar|array|sign|tent|canopy|antenna)\b)"
                         r"|\bconstruct(ion of)? (a |an )?new\b|new construction|new building"
                         r"|\bnew (\d+[- ]?(story|storey|unit)|single[- ]family|two[- ]family|multi[- ]?family"
                         r"|detached|attached|duplex|triplex|townhouse|townhome|apartment|dwelling|residen"
                         r"|house|home|sfr|adu|dadu|garage|commercial|mixed[- ]use|warehouse|office)"
                         r"|\bconstruct (a |an )?(\w+ )?((one|two|single|multi)[- ]?family|duplex|townhouse|apartment"
                         r"|hotel|residential|accessory structure|detached (accessory|garage)|garage accessory)"
                         r"|factory[- ]built"),
    ("alteration", r"\balter|remodel|renovat|\baddition|tenant improvement|\bt\.?i\.?\b|build[- ]?out"
                   r"|change of use|convert|conversion|underpin|foundation|structural|seismic|retrofit|push pier"
                   r"|rehab"),
    ("electrical", r"electric|wiring|light(ing)? fixture|\blights?\b|lighting|outlet|receptacle|switches"
                   r"|circuit|generator|hardwire|\bservice\b"),
    ("plumbing", r"plumb|water heater|sewer|\bgas (service )?line|\bgas pipe|backflow|water service|piping"
                 r"|\bpipe work|faucet|p-traps?|floor ?drain"),
    ("mechanical", r"mechanic|hvac|furnace|boiler|heating|heat pump|refriger|ventilat|air condition|\bduct"
                   r"|split system|roof ?top unit|\brtu\b|heat exchanger|\bpumps?\b"),
    ("sign", r"\bsign(s|age)?\b|awning|banner|billboard"),
    ("alteration", r"repair|replace|re-?roof|roofing|\broof\b|siding|window|deck|porch|fence|retaining wall"
                   r"|interior|exterior|kitchen|bath|tuckpoint|brick|masonr|lintel|drywall|flooring|balcon"),
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


def describe(s, version=1):
    """Class of a free-text work description: version 1 (session 70, pre-registered) or 2."""
    return _first(DESC_RULES_V2 if version == 2 else DESC_RULES, s)


def cascade(permit_type, work_class="", desc_class=""):
    """First non-'other' class of permit_type, work_class, then the stored description class."""
    for c in (harmonise(permit_type), harmonise(work_class) if work_class else "other",
              desc_class if desc_class in CLASSES else "other"):
        if c != "other":
            return c
    return "other"
