# Shared on purpose: grouping followers and a team allow list (2026-11-17)

`eval/federated-globalids-2026-11-17.md` added the cross-model GlobalId check
and left this in "Not done": a marker element shared on purpose (the
Simple-Scene "origin" proxy) is still a warning, and "a per-team allow list
(GlobalIds or classes expected to be shared) is the next step". Measuring that
list on Simple-Scene first showed it would not be enough alone: of IFC4's 35
findings, only 8 are elements. The other 27 are types and relationships. Allowing
the "origin" proxy would still leave its type, its IfcRelDefinesByType and its
material link as three warnings.

## What changed

- `globalIdIndex` (`ids.mjs`) records, for each relationship, the GlobalIds of
  the IfcRoot objects it names (its attributes after the four IfcRoot ones).
- `crossModelGlobalIds` (`ci.mjs`):
  - **followers**: a shared relationship that, in every file holding it, names
    only shared GlobalIds (at least one of them a non-relationship conflict), and
    a shared type or property set that such a relationship names next to a
    shared element, are listed under that element (`conflict.with`, the
    "with it:" part of the line). They are no longer findings of their own.
  - **one GlobalId, different links**: a shared relationship left as a
    finding whose holders name different object sets gets `contentsDiffer`, and
    the line says a viewer merging by GlobalId keeps one and drops the others'
    links. This is a different fault from one element in two files.
  - **allow list**: `parseSharedAllow(text)` reads one rule per line (`#`
    comments): a GlobalId (first character 0-3, which tells it from a
    22-letter class like `IFCBUILDINGELEMENTPART`), a class, a class and a
    quoted name (`*` matches any run, other characters are literal), or `*`
    and a name. A conflict every holder of which matches some rule moves, with
    its followers, to `allowed` (with `allowedBy`, the rule lines). A follower
    of two elements leaves only when both are allowed. Rules that matched
    nothing are `allowUnused`.
- `ci-cli.mjs --shared-globalids-allow FILE` (relative to `--root`) and the
  Action input `shared-globalids-allow`. A bad line or a missing file exits 2
  rather than being skipped. Text output gets `note:` lines for the allowed and
  the unused rules; the job summary gets "Shared on purpose" and "Allow list"
  paragraphs; the JSON report carries `federation.allowed` and
  `allowUnused`. Allowed GlobalIds are not counted in `shared-globalids`, the
  tally or `--fail-on-shared-globalids`.

## Measured on real exports

`node eval/federated-globalids.mjs [--allow FILE] DIR`, buildingSMART
`Sample-Test-Files` at `80d976a`, each schema's ten Simple-Scene files as one
set (the clone is in the session's scratch space, not the repository).

| Schema | Findings before | After grouping | of which elements (followers) | different links | other shared | With `eval/simple-scene-allow.txt` | Allowed (followers) | Unused rules |
|---|---:|---:|---|---:|---:|---:|---|---|
| IFC2X3 | 31 | 21 | 8 (12) | 11 | 2 | 19 | 2 (6) | `IFCGRID` |
| IFC4 | 35 | 23 | 8 (14) | 12 | 3 | 21 | 2 (6) | `IFCGRID` |
| IFC4X3 | 35 | 23 | 8 (14) | 12 | 3 | 21 | 2 (6) | `IFCGRID` |

The allow list has two live rules, `* "geo-reference"` and
`IFCBUILDINGELEMENTPROXY "origin"`, plus `IFCGRID`, which is there to show
the unused-rule report. Each live rule clears the marker and its type,
IfcRelDefinesByType and IfcRelAssociatesMaterial.

What the "different links" relationships are: material links
(IfcRelAssociatesMaterial) that carry the same GlobalId in up to four files
and name a different set of elements in each. `0bat_vVbL5e9xkiecCrRuV` links
four "rail bridge - filler" proxies in `Infra-Bridge.ifc`, the house's
underground site in `Building-Landscaping.ifc`, and four park, river and site
elements in `Infra-Landscaping.ifc`. The exporter appears to reuse one GlobalId
per material. Those are two (or three) relationships a federating viewer cannot
tell apart, so they stay findings. The highway location marker's
IfcRelDefinesByType names two shared assemblies in four files and ten
assemblies (eight unshared) in `Infra-Landscaping.ifc`, so it also stays,
along with its type.

The 3 "other shared" in IFC4 are the highway marker's type, the
`IfcDistributionSystem` "road wastewater system" (plumbing and electrical) and
the `IfcGeographicElementType` "tree" (both landscaping files, each naming its
own tree). A team that keeps a shared type library can allow those by class.

**HHS Office** (opensourceBIM/IFC-files `cb96c50`) is unchanged. The architect,
MEP and structural files give 1 conflict (the wall `3XrBtx9eX7mQE6EqWHPk1R`, no
followers) and 7 frame. All six files with the revisions give 3 revision pairs
and the same 1 conflict. The rule `IFCWALLSTANDARDCASE "Basic Wall:STB
30.0:573321"` allows it, leaving 0.

## Tests

`federation-allow.test.mjs` (6 tests) covers relationship references in the
index, a property set and its relationship listed under a shared wall, a
material link naming different walls in two files, the rule parser (including
the 22-letter class and literal regex characters), allowing with followers
and unused rules, and the CLI with a good list, a bad line and a missing file.
The whole venture suite gives 173 pass and 0 fail.

## Not done

- The page (one model) still does not take a set of models.
- BCF topics for cross-model findings (as before).
- A type library shared on purpose needs a class rule per type class. A rule
  kind that means "any type object" (IfcTypeObject subtypes) would be
  shorter, if a team's list shows the need.
