# Suggested bSDD links for standard IFC properties (2026-11-19)

What was built: `bsdd-suggest.mjs`, which adds the buildingSMART Data
Dictionary (bSDD) `uri` to IDS property facets on a standard IFC property
that carry none, offline. CLI `node cli.mjs --link-bsdd SPEC.ids -o OUT.ids`;
on the page, auditing an IDS shows a "bSDD" box listing the links and a
"Download IDS with bSDD links" button.

## Why

IDS 1.0 lets a requirement facet carry `uri`, the bSDD entry it asks for.
Authoring tools and readers use it to know exactly which property is meant
(and `--audit --bsdd` can then check the facet against the dictionary). In
the public corpus below, 316 of 1,317 requirement property facets carry one;
the other 1,001 do not, and most of those are standard `Pset_`/`Qto_`
properties whose link needs no lookup: the IFC 4.3 dictionary in bSDD codes
every template property by its own name
(`https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4.3/prop/FireRating`).
bsdd.mjs could only check links that exist; nothing wrote them.

## The rule

A requirement property facet (ids.xsd allows `uri` only in requirements) with
no `uri`, whose `propertySet` and `baseName` are plain names (no pattern or
enumeration) and are a property of an IFC 4.3 template set
(`schema/psets-ifc4x3.json`, `Pset_` and `Qto_`), exactly as spelt, gets
`<IFC 4.3 dictionary>/prop/<baseName>`. A facet whose dataType differs from
the template's has the template's type named next to the link. The attribute
goes in right after the element name; nothing else in the file changes.

## Measured

`node eval/bsdd-suggest-corpus.mjs` over both public corpora the venture
already uses (`sh eval/fetch-audit-corpus.sh`: 65 IDS from public repos;
`sh eval/fetch-bsdd-ids.sh`: 88 IDS that contain a bSDD link), byte-identical
copies counted once. Full output: `eval/bsdd-suggest-corpus.txt`.

| | count |
| --- | --- |
| distinct IDS files read | 117 (1 not an IDS) |
| requirement property facets | 1,317 |
| with a uri already | 316 |
| suggested a link | 619 in 54 files (111 of them Qto_ quantities) |
| of those, facet dataType differs from the template | 27 |
| no suggestion: set or name a pattern / missing | 24 |
| no suggestion: set is not an IFC 4.3 template | 322 |
| no suggestion: name not in that template | 36 |

**Does the rule match the links people wrote?** 212 facets in the corpus
already link the IFC dictionary (in any of its forms). For 196 of them the
rule, applied to the facet's own set and name, gives the same link (15 are
Qto_ quantities). It gives a different one for 2, and both are the authors'
slips that the bSDD check reported on 2026-11-19 with the same correction
(`eval/bsdd-links-2026-11-19.md`): `Qto_WallBaseQuantities.Width` linked to
`prop/Name`, `Pset_SpaceOccupancyRequirements.AreaPerOccupant` linked to
`prop/OccupancyNumberPeak`. It gives none for 14, all where the facet does
not name a standard property: no property set or a placeholder
`undefined_set` (7), an "Attributes" set holding IFC attribute names (5, one
test file), a baseName written "Thermal Transmittance [ThermalTransmittance]"
(1) and a project set `ePset_Pipe` (1). Those
are left alone on purpose: the IFC dictionary link only means the IFC
property when the facet asks for the IFC property.

**Do the links resolve?** bSDD's API is not reachable from this run's
container (proxy 403), so the 619 suggestions were not looked up one by one.
What stands for it: every IFC 4.3 link in the corpus written in this form was
looked up live on 2026-11-19 by `eval/bsdd-corpus.mjs`, and none of the 9
not-found results there is an `ifc/4.3/prop/<template name>` link (they are
ifc-2x3, demo dictionaries and deliberate test fixtures); that includes 11
distinct `Qto_` quantity links (GrossFloorArea, NetVolume, GrossHeight, ...),
which is why quantities are suggested too. A run with bSDD access should run
`node cli.mjs --audit OUT.ids --bsdd` over the 54 linked outputs to confirm
the rest.

**Is the output the same IDS?** For 54 of 54 files: removing exactly the
inserted attributes gives the input byte for byte, the result parses to the
same specifications, and a second pass suggests nothing. The tests
(`bsdd-suggest.test.mjs`) also check that the audit's findings are unchanged
and that bsdd.mjs reads the new links.

The page was driven in Chromium on `samples/coordination-basics.ids.xml`:
audit, the bSDD box lists IsExternal and LoadBearing, the download carries 2
uri attributes, no page errors.

## Limits

- IFC 4.3 dictionary only. An IDS written for IFC2X3 or IFC4 gets the 4.3
  link (bSDD has no IFC 2x3 dictionary; the check already names the 4.3 entry
  for 2x3 links), and only when the property is still in the 4.3 templates.
- Classification and material facets get nothing: their link depends on the
  classification system or material dictionary, which needs bSDD's search.
- Non-standard sets get nothing, even where the name is an IFC property
  name: whether "Acme.FireRating" means IFC's FireRating is the author's call.
