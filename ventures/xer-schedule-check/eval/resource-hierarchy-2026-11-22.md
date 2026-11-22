# P6 resource hierarchy <-> Project resource Group, 2026-11-22

**Question.** P6 files its resources in a tree (`RSRC.parent_rsrc_id`: a
crew under a trade under "Labour", equipment under "EQP"). Planners group the
resource sheet and resource histograms by it. The XER to Project XML
converter (`msproject.mjs`) wrote every resource flat, and the way back
(`p6xer.mjs`) wrote no parents, so the tree was lost both ways with no
warning. Project has no resource outline; its resource **Group** field is
the one Project users group and filter the resource sheet by. Does a
Group path carry the tree there and back?

## What was built

- `mspdiText` writes each resource's Group as its parents' resource IDs from
  the top, "/" between them (`CCAD Project/LABOR MANHOURS`, `EQP`). No public
  resource ID contains "/" (0 of 502). `counts.rsrcGroups` and a warning say
  how many.
- `p6XerText` reads a work or material resource's Group back: each step is the
  resource with that ID when the file has one, else a new labour resource of
  that ID and name; parents are listed before children. A Project file whose
  Group is a plain word ("Electrical") gets one parent of that name, which is
  where a P6 user files resources by trade. A step that already has a parent
  keeps it; a link that would make a loop is left out and counted. A cost
  resource's Group stays the expense's cost category, as before.
- `p6Problems` now checks that a parent resource exists and that the tree has
  no loop.

## Data

- The six public P6 files of `eval/cpm-vs-p6-2026-11-19.md` (fetched with
  raw.githubusercontent.com at the commits listed there, not committed).
- Every MSPDI file in MPXJ's test corpus (github.com/joniles/mpxj @ 8c7f83c,
  `junit/data`) with a work or material resource: 66 files.

```
node eval/resource-hierarchy-check.mjs --xer <six XERs> --mspdi <mpxj>/junit/data --json eval/resource-hierarchy-2026-11-22.json
```

## Results

| File | Resources | Under a parent | Parents | Depth |
|---|---|---|---|---|
| CCA_R03 (6.0) | 119 | 117 | 14 | 3 |
| Expressway (7.0) | 336 | 331 | 13 | 2 |
| hotel (6.0) | 11 | 7 | 5 | 3 |
| airport (5.0) | 7 | 6 | 1 | 1 |
| example (24.12 Web) | 29 | 0 | 0 | 0 |
| sample (20.12) | 0 | 0 | 0 | 0 |

None of the 33 parent resources has an assignment, so the default (only the
resources the project's activities use) never wrote them.

| Check | Default | `allResources` |
|---|---|---|
| Resources written to Project XML | 469 | 502 |
| ... whose Group equals their parent path in the XER | 469 / 469 | 502 / 502 |
| ... back in the XER after the XML with the same parent path (by resource ID) | **469 / 469** | **502 / 502** |
| Parent resources rebuilt from Group paths (named by their IDs) | 33 | 0 (written as resources, names kept) |
| P6 import problems (`p6Problems`) in the XERs written | 0 | 0 |
| MPXJ corpus: work resources with a Group (6 files) back with the same Group after the XER | - | 14 / 14 |

Before this change the path-back rows were 0 of the 461 resources that have
a parent. The MPXJ files' Groups are plain words ("Group1"), so the XER gets
13 parent resources and a trip back with `--all-resources` writes those 13 as
resources too (`extraResources`): the tree has no other place in Project.

## Limits

- By default a rebuilt parent is named by its resource ID ("LAB", not
  "Labour"): the name of an unassigned parent is not in the XML. With
  `--all-resources` the parents are written and keep their names.
- No P6 import was run here; whether P6 matches a parent by resource ID to an
  existing global resource or adds one is open, as for every resource.
- No check against MPXJ's reading of the Group in our XML (MPXJ maps the
  element by name; not run in this session).
