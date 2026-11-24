# ids-model-check: open items beyond flagships.yaml

`portfolio/flagships.yaml` caps a flagship's `next:` at 2000 characters, so it holds the items most worth starting. Open items moved out to make room are kept here by `portfolio/router/flagship_field.py --park`. Take one back into `next:` when it becomes the most useful thing to do, and delete it here when it lands.

## Parked from flagships.yaml `next:`

- (2026-11-17) a BIM coordinator's real IDS and model (needs a person)
- (2026-11-17) the GitHub Action: a run on a GitHub runner and a team's repo
- (2026-11-17) landed, kept for reference: the CI runner parses each model once and caps failures per spec (eval/ci-scale-2026-11-17.md)
- (2026-11-17) heap 2026-11-17 (eval/heap-200mb-2026-11-17.md: 219 MB model 2.5 to 1.0 GB); specs applying to every entity 2026-11-17 (eval/no-entity-facet-2026-11-17.md: 68 public IDS 515 to 111 s on 219 MB, 96 to 13 s on HHS MEP, reports identical; the 4.7 GB peak was uncollected garbage, 2 GB suffices). Next: lazy ifcXML (attribute-pattern requirements on geometry landed 2026-11-18, eval/attribute-any-geometry-2026-11-18.md)
- (2026-11-17) GitHub Action and ci-cli.mjs 2026-11-17 (eval/ci-action-2026-11-17.md: 8 pairs on 4 real exports in 7.5 s, 9 of 9 annotations on the element's line)
- (2026-11-17) date and duration ranges 2026-11-17 (eval/date-ranges-2026-11-17.md: IfcTester 0.9.0 fails every object on a date range, Write as a pattern agrees 10 of 10; 86.4% of public facets editable)
- (2026-11-17) a dataType-mismatch hint, Accept any data type 2026-11-17 (eval/model-any-type-2026-11-17.md)
- (2026-11-17) a range for numeric attributes
- (2026-11-17) attribute values and classification codes 2026-11-17 (eval/model-attr-codes-2026-11-17.md: 242 of 242 offers pass; 143 of 210 Uniformat elements in Schultz have an empty code, Require a code)
- (2026-11-17) unchecked subclasses in CI and the editor 2026-11-17 (eval/ci-unchecked-2026-11-17.md: 21,405 elements in 165 of 2,028 checks)
- (2026-11-17) GitLab Code Quality report keyed on GlobalId+class 2026-11-17 (eval/gitlab-codequality-2026-11-17.md: 18 of 18 real changes, 0 for a renumbering re-export)
- (2026-11-17) a no-dataType value row
- (2026-11-17) editor (opens an IDS, eval/editor-open-2026-11-16.md; opens a model and offers its classes and sets, own sets editable, 79.4% of public facets editable, eval/model-inventory-2026-11-16.md: 4 real exports, 347 of 395 class-set pairs own sets, 21 of 122 standard props in a non-template dataType): applicability rows 2026-11-17 (eval/applicability-rows-2026-11-17.md: counts equal the checker's applicable; 83.5% of public facets editable, IDS-Audit-tool 21.5%)
- (2026-11-18) no-class numbers 2026-11-17 (eval/no-class-numbers-2026-11-17.md: derived-on-subclass and xs:integer-on-NUMBER rows, list attributes an audit warning; 117 of 129 audit-tool numeric lists open, was 109)
- (2026-11-18) a standard property in the file's own dataType 2026-11-17 (eval/template-type-2026-11-17.md: 16 rows in 7 public files, Use the template's type, 14 pset-datatype errors to 0). 'did you mean' rows 2026-11-17 (eval/name-suggestion-2026-11-17.md: 17 rows in 7 public files, name errors 31 to 14)
- (2026-11-18) number one-of rows 2026-11-17 (eval/number-oneof-2026-11-17.md: 663 of 663 offers pass, IfcTester 646)
- (2026-11-18) duplicate GlobalIds in a model (eval/duplicate-globalids-2026-11-17.md) and across federated models in CI 2026-11-17 (eval/federated-globalids-2026-11-17.md; allow list and followers, eval/federation-allow-2026-11-17.md: Simple-Scene 35 to 23)
- (2026-11-18) file-order candidate lists 2026-11-18 (eval/file-order-candidates-2026-11-18.md: pooled specs 2.9x on HHS MEP, same reports)
- (2026-11-18) facet-result cache 2026-11-18 (eval/applies-cache-2026-11-18.md: 68 IDS on HHS MEP 11.4M facet tests to 3.7M, 6.3-7.0 to 5.0-5.3 s; 219 MB 60.4 to 43.1 s, fits 1 GB)
- (2026-11-18) property sets indexed by name 2026-11-18 (eval/psets-cache-2026-11-18.md: 68 IDS on HHS MEP 7.9 to 4.6 s, same reports)
- (2026-11-18) 65 public IDS vs IfcTester 2026-11-17 (1,661 of 1,736 same; unchecked subclasses reported, eval/corpus-crosscheck-*)
- (2026-11-18) IDS editor 2026-11-16 (203,433 offered specs audit clean, 15,102 valid in ids.xsd; found voids/fills token pair and classification-system gaps, eval/editor-2026-11-16.md)
- (2026-11-18) IDS structure against ids.xsd landed (structure.mjs, eval/ids-structure-2026-11-18.md: same verdict as IfcTester on 3,080 of 3,080 files; 12 of 65 public IDS break it). The "fix it" landed 2026-11-18 as fix.mjs (page "Download repaired IDS", `cli.mjs --fix`; eval/fix-structure-2026-11-18.md). The editor runs the repair as a file opens (landed 2026-11-18, eval/editor-open-repair-2026-11-18.md); XSD regex validity of xs:pattern values landed 2026-11-18 (xsdregex.mjs, eval/xsd-regex-2026-11-18.md); `<n>` for `<name>` (one public file) if a second file shows it.
- (2026-11-18) IFC 4.3 infra/HVAC cross-check 2026-11-17 (348 of 348, eval/infra-mep-crosscheck-*)
- (2026-11-18) 43 IFC4 STEP/ifcXML twins 2026-11-18 (eval/ifcxml-twins-2026-11-18.md: verdicts 108 to 129 of 129; href refs, decimal commas, flat point lists; B-spline rows from knot counts)
- (2026-11-18) a model's property values 2026-11-17 (eval/model-values-2026-11-17.md: one-of or range from the model, ranges rounded outward, 1,014 of 1,014 pass their model; 82.0% of public facets editable)
- (2026-11-18) landed, kept for reference: ifcXML and .ifczip read 2026-11-16 (eval/ifcxml-xbim-2026-11-16.md); several IFC versions per spec 2026-11-17 (eval/multi-version-2026-11-17.md: opened in the schema that edits most, page audit in every named schema, false page errors 18 to 0 on 18 public files).
- (2026-11-19) landed, kept for reference: STEP and ifcXML from bytes 2026-11-18 (eval/step-bytes-*, eval/ifcxml-bytes-*: 670/680 MB files check)
- (2026-11-19) landed, kept for reference: xs:pattern as XML Schema regex 2026-11-18 (eval/xsd-regex-2026-11-18.md: same verdict as elementpath on 78 of 78 corpus patterns; anchors, (?: and \/ flagged and repaired; 4 of 65 public IDS read differently per tool)
- (2026-11-21) next: a BIM manager's read of its wording
- (2026-11-21) next: an authoring tool's own ifcJSON. IFC5 .ifcx read 2026-11-21 (ifcx.mjs, cli --layer; eval/ifcx-twins-2026-11-21.md: 8 twins, class 12,115 of 12,116, partOf 1,646 of 1,648, 47 of 47 files)
- (2026-11-21) next: a real tool's .ifcx
- (2026-11-22) next: a client's real stage-to-stage IDS pair
- (2026-11-22) an RVB/ILS author on \s
- (2026-11-22) a Revit/ARCHICAD IFC4X3 export to confirm
- (2026-11-22) a page route for bSDD if its API ever allows CORS; a BIM manager's real table or filled Excel2IDS workbook via --from-sheet; Excel itself typing into the download (dropdown lists in it 2026-11-19, eval/sheet-dropdowns-2026-11-19.md: 0 strict-list cells out on 476 IDS, LibreOffice agrees 476 of 476)
- (2026-11-22) member Length: Tekla's cut members done 2026-11-22 (eval/tekla-cut-members-2026-11-22.md; left: bent parts, volume over section right 3 of 3, too few to offer; another Tekla office's export to confirm) and Revit cut members (none stored in a public model); plates exported as beams (PL..., 221 store the extrusion, 56 the plate length: no rule separates them), eval/member-lengths-2026-11-22.md
- (2026-11-22) a public export storing Qto_ plate or covering Width
- (2026-11-22) doors and windows (eval/door-window-quantities-2026-11-22.md): Revit rule landed 2026-11-22 (eval/revit-door-window-quantities-2026-11-22.md; next: a Revit Perimeter checked against an export that stores one, group names in other Revit languages); doors and windows with no IfcRelFillsElement (schependomlaan: 390 of 464), whose body includes casings; another tool's export that stores the sets
- (2026-11-22) spaces (eval/space-quantities-2026-11-22.md): a Revit export storing Height over a lowered ceiling with its ceilings exported, to tell the 24 held-back agreeing ARK_NUS rooms apart; NetPerimeter with door widths off once an export stores one unlike the gross figure
- (2026-11-22) member surface areas (eval/member-surfaces-2026-11-22.md): an ARCHICAD or Revit export storing a tube's Outer/GrossSurfaceArea; cut ends (Tekla's 26 split 15/11 between readings); Tekla's constant 0.2016 m2 on Mini Project's `BALK` beams; NetSurfaceArea (NetWeight/GrossWeight from a material density landed 2026-11-22, eval/member-weights-2026-11-22.md)
- (2026-11-22) footings by Tekla's convention 2026-11-22, 482/505, eval/footing-quantities-2026-11-22.md
- (2026-11-22) railings' Length (eval/railing-lengths-2026-11-22.md): the 9 whose readings disagree (a section cut along the run's own middle line for the 2 corner cuts; tessellated round handrails read from a fitted tube); the 16 whose body is only posts or balusters (their rail is another element); an ARCHICAD or other tool's export storing a Qto_ railing Length
- (2026-11-22) Revit brep openings (eval/opening-brep-quantities-2026-11-22.md, 102/102 = window size): a vertical (floor or roof) brep opening in a public export; a slanted, arched or round brep cut; another tool's brep openings storing the set
- (2026-11-23) openings' Width/Height/Depth/Area by ARCHICAD's or Revit's convention 2026-11-22, 4,532/4,554, eval/opening-quantities-2026-11-22.md
- (2026-11-23) Revit brep openings 2026-11-22, 102/102, eval/opening-brep-quantities-2026-11-22.md
- (2026-11-23) wall-hosted fittings by box sample 2026-11-23, 37/37, eval/cobie-wall-hosted-2026-11-23.md
- (2026-11-23) Tekla twins by schema done 2026-11-23 (eval/beam-schema-twins-2026-11-23.md: no-fillet NetVolume 109/109, walls on their side 74/74). One-member railings read as members 2026-11-23 (eval/one-member-railings-2026-11-23.md: Tekla 16/16 in all three schemas). Left: a clipped Tekla extrusion's fillet share; an ARCHICAD/Revit rolled section's stored NetVolume
- (2026-11-23) one-member railings (eval/one-member-railings-2026-11-23.md): a swept-disk handrail along a bent path is neither a top rail nor a prism; read it by its directrix once a public export stores its Length.

## WHERE rules (2026-11-24, eval/where-rules-2026-11-24.md)

- Seeded faults: write one fault per rule family into public files (USERDEFINED with ObjectType cleared, a type relationship pointed at another class's type, a duplicated pset name, a negative quantity, a 3D direction in a 2D placement) and show each rule fires on exactly the seeded records, beside ifcopenshell.validate. The public files exercise 87 of about 1,800 rules; the seeds would cover the IDS-relevant families on purpose.
- An IDS-side cross-reference: when a spec's predefinedType or partOf facet fails on an element that also breaks CorrectPredefinedType / CorrectTypeAssigned / UniquePropertySetNames, say in that failure's row that the model itself breaks the rule (today the MODEL block and the spec rows are separate).
- `LIKE` (unused by IFC rules) evaluates to UNKNOWN; implement it if a later schema uses it.
