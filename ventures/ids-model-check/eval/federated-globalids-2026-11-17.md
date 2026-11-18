# GlobalIds shared between federated models (2026-11-17)

`eval/duplicate-globalids-2026-11-17.md` made a GlobalId held twice inside
one file (IfcRoot rule UR1) a model finding. Its "Not done" list named the
case UR1 cannot see: a coordination set of discipline exports (architecture,
structure, MEP) where one file's element carries a GlobalId that another
file's element also carries. A federating viewer, a BCF topic (it selects by
`IfcGuid`), a clash test or a model diff then treats the two as one element,
and a quantity takeoff over the set counts it twice. `ci-cli.mjs` checked
models one at a time, so it never compared them.

## What changed

- `globalIdIndex(model)` (`ids.mjs`): every IfcRoot GlobalId in a model to its
  first holder (`#id`, class, name) and a kind: `frame` (project, site,
  building, storeys, spaces, facilities: IFC2X3 `IfcSpatialStructureElement`,
  IFC4 `IfcSpatialElement`, plus `IfcContext` and `IfcGrid`), `element`
  (`IfcElement` subtypes) or `other` (types, relationships, property sets,
  systems). It is small, so a CI run keeps one per model after dropping the
  parsed model.
- `crossModelGlobalIds(indexes)` (`ci.mjs`), over every model of the run:
  - **frame**: the same GlobalId on the same frame class in each file. Files
    exported from one template share these on purpose, so they are counted
    ("Shared frame" in the summary, a `note:` line) and not warned about.
  - **revision pairs**: two models sharing at least half the smaller one's
    GlobalIds (frame excluded, at least 10) are one model twice: a revision
    left beside the current file, or the same model as `.ifc` and `.ifczip`.
    One finding per pair instead of thousands.
  - **conflicts**: every other GlobalId held in two or more models, with each
    holder, marked same class (one element in two disciplines' files) or
    different classes (two objects a viewer cannot tell apart).
- Every CI output reports them: text (`federation warning:` lines), one
  annotation per model (on the line of its first shared element, read after
  the loop from that file only), one per revision pair, a job summary
  paragraph and details list, GitLab issues `ifc-shared-globalid` (keyed on the
  GlobalId and the models holding it, not lines) and `ifc-model-twice`, the
  JSON report's `federation`, the tally's `sharedGlobalIds`, `revisionPairs`
  and `sharedFrame`, and the Action output `shared-globalids`.
- `--fail-on-shared-globalids` (Action input `fail-on-shared-globalids`)
  fails the build on conflicts and revision pairs. Off by default, like the
  other model findings.

The browser page checks one model at a time and is unchanged.

## Measured on real exports

Run with `node --max-old-space-size=8000 eval/federated-globalids.mjs DIR...`
(all models under the directories as one set).

**HHS Office** (opensourceBIM/IFC-files `cb96c50`: the architect, MEP and
structural ("construction") exports of one office building, the federated set
the earlier evals use), through `ci-cli.mjs` with the coordination starter IDS:

| | |
|---|---:|
| Models | 3 (82,221 rooted GlobalIds) |
| Shared frame | 7 (project, site, building, 4 storeys; every pair shares them) |
| Conflicts | 1 |
| Whole run (3 parses, 3 checks, the cross-model step, line lookup) | 2.1 s |

The conflict is `3XrBtx9eX7mQE6EqWHPk1R`, `IFCWALLSTANDARDCASE "Basic
Wall:STB 30.0:573321"`: #83 in `architect.ifc` and #1266 in
`construction.ifc`, the same name, class and Revit element id in both files.
A takeoff over the federated set counts that wall twice, and a BCF topic about
it selects it in both models. No other element, type or relationship GlobalId
is shared between the three disciplines.

Adding the revision files (`architect2.ifc`, `MEP2.ifc`, `construction2.ifc`)
to the set gives three revision pairs (22,120 of 22,161; 54,065 of 54,072;
5,980 of 5,987 shared) and the same one conflict, now listing four holders.
OpeningDesign's Schultz Residence, a different project, shares nothing with
any HHS file.

**buildingSMART Simple-Scene** (`Sample-Test-Files` `80d976a`): ten discipline
models of one scene (four building, six infrastructure), published in each of
IFC2X3, IFC4 and IFC4X3. Each schema's ten files as one set:

| Schema | Rooted | Frame shared | Conflicts | Elements among them |
|---|---:|---:|---:|---|
| IFC2X3 | 940 | 12 | 31 | 8: the house roof (architecture + structure), two "highway location marker" assemblies, two "sewer manhole" chambers (plumbing + electrical), and three proxies: "geo-reference" (all ten files), "origin" (four) and the house chimney |
| IFC4 | 1,084 | 18 | 35 | 8, the same, with the chimney an `IfcChimney` |
| IFC4X3 | 985 | 18 | 35 | 8, as IFC4 |

The rest are the types and relationships that go with those elements (12
`IfcRelAssociatesMaterial`, 5 to 7 `IfcRelDefinesByType`, the proxy and
chamber types). All are same-class: no GlobalId names two different objects
within one schema. The "origin" and "geo-reference" markers look deliberate
(a shared reference point copied into each discipline). The roof and the
manholes are the case the check is for: an element in two disciplines' files.

All 30 Simple-Scene files as one set (mixing schemas, which no real
federation does) give 30 revision pairs (the same scene in another schema)
and also the first different-class conflicts: `IfcSystem` in IFC2X3 that is
`IfcDistributionSystem` in IFC4, and `IfcBuildingElementProxyType "tree"` that
became `IfcGeographicElementType`.

**xBIM test files** (`XbimEssentials` `e3c8777`, the 17 that
`eval/fetch-xbim-samples.sh` fetches): 16 revision pairs, all one small model
written as `.ifc`, `.ifcxml` and `.ifczip` (113 of 113 GlobalIds shared), and
2 relationship conflicts with `Ifc4WithNestedLists.ifczip`.

The cross-model step took 177 ms over 42 models and 171,528 rooted GlobalIds.

## Not done

- A copy-monitored grid or level set shared on purpose is counted as frame
  only when the class matches; a shared marker element (the Simple-Scene
  "origin" proxy) is still a warning. A per-team allow list (GlobalIds or
  classes expected to be shared) is the next step if a real team asks.
- The page (one model) does not take a set of models.
- BCF topics for cross-model conflicts: a topic would need to select the
  element in two models, which BCF 2.1's single-model viewpoint does not say.
