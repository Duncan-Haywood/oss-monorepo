# Model checks in a GitLab merge request: a Code Quality report keyed on GlobalId (2026-11-17)

The flagship row listed "audit warnings in a GitLab code-quality report" as
buildable. GitLab already read the JUnit file, but a JUnit report has no file
or line, and GitLab's merge request widget only says "new" or "resolved" for
Code Quality issues, by comparing each issue's `fingerprint` with the target
branch's report. So the useful question is not only "can ci-cli write the
format" but "does the widget then say which elements a merge request broke or
fixed, when the model is re-exported".

## What landed (`ci.mjs`, `ci-cli.mjs`)

- `codeQuality(runs, { lines, idsLines, failOnUnchecked, failOnAudit, maxPerSpec, pathPrefix })`:
  a GitLab Code Quality array (`description`, `check_name`, `fingerprint`,
  `severity`, `location.path`, `location.lines.begin`, plus CodeClimate's
  `type` and `categories`).
  - One issue per failing element (`ids-required`, `ids-prohibited` critical;
    `ids-optional` minor), on the element's `#id=` line of a STEP model.
  - Its fingerprint is the model path, IDS path, specification name and the
    element's **GlobalId and class**, never its `#id` or line.
  - IDS audit warnings (`ids-audit`, minor; major under
    `--fail-on-audit-warnings`) and invalid specifications
    (`ids-invalid-specification`, blocker) once per IDS file on the
    specification's line; unchecked subclasses (`ids-not-checked`) per model;
    an unreadable file (`ids-unreadable`, blocker). GitLab has no ten-per-step
    cap, so nothing folds.
  - Past `maxPerSpec` elements of one specification, one "N more" issue whose
    fingerprint is the specification's, so a changing count stays one issue.
  - Elements are picked by GlobalId order, not file order (`cqElements`).
- `ci-cli.mjs --gitlab-codequality FILE [--gitlab-max-per-spec N]` writes it,
  with paths from the working directory (prefixed with `--root` when that is
  inside it, as GitLab wants paths from the repository root). Default per
  specification: every listed element (`--max-failures`, 1,000).
- `cqHash`: a dependency-free 128-bit hex fingerprint (not a security hash).
- Tests in `ci.test.mjs` (3 new; 27 pass): shape, lines, uniqueness,
  fingerprints unchanged when every `#id` is renumbered and lines move, the
  cap, severities, the CLI path prefix.

## Measured: real model revisions

`opensourceBIM/IFC-files` at `cb96c50`, "HHS Office": `MEP.ifc`,
`architect.ifc`, `construction.ifc` and their `*2.ifc` second revisions
("second revision with minor change", `info.txt`). Fetch steps:
`model-attr-codes-2026-11-17.md`. What the revisions are:

- `MEP2.ifc` is a BIMserver 1.0RC5 re-serialisation of the Revit export: the
  same 665,224 entities, **every `#id` renumbered and the file reordered**
  (the duct `0n7wahcm1EpPpR64_XDzc3` is `#1597` on line 1,570 in one and
  `#322587` on line 1,403 in the other), LF instead of CRLF.
- `architect2.ifc`: one wall renamed with a new GlobalId (`...0L` to `...0a`).
- `construction2.ifc`: one column given a new GlobalId (`...2z` to `...2a`),
  which is **also the GlobalId of a slab** in both files: the revision adds a
  duplicate GlobalId (the original files have none: a regex over the text
  finds a repeated 22-character string, but it is a property name;
  `duplicate-globalids-2026-11-17.md`).

Each revision pair was checked against 67 IDS files (the three in `samples/`
and the 64 parseable public ones `eval/fetch-audit-corpus.sh` fetches; one of
65 does not parse), and the widget's new and resolved counts were compared
with the element-level truth: failing (GlobalId, class) per specification that
appear or disappear, over the full lists, in IDS files where no specification
was truncated at 1,000.

```
CQ_MAX=1000 node --max-old-space-size=8000 eval/gitlab-codequality.mjs DIR   # and CQ_MAX=50
```

Shipped keying, every listed element (default):

| Revision pair | IDS with issues | Issues (rev 2) | JSON (67 IDS) | On own `#id=` line | Duplicate fingerprints | Truth new / resolved | Widget new / resolved | Spurious |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| MEP -> MEP2 (renumbered) | 62 | 35,062 | 25.1 MB | 34,651 of 34,651 | 0 | 0 / 0 | 0 / 0 | 0 |
| architect -> architect2 | 67 | 36,614 | 24.7 MB | 36,148 of 36,148 | 0 | 2 / 2 | 2 / 2 | 0 |
| construction -> construction2 | 67 | 22,504 | 13.1 MB | 22,091 of 22,091 | 0 | 16 / 16 | 16 / 16 | 0 |

The same widget under two keyings a simpler report might use (spurious = a new
or resolved issue whose element did not change):

| Revision pair | `#id` fingerprint | GlobalId, first N in file order, N = 50 |
|---|---:|---:|
| MEP -> MEP2 | 8,975 new / 8,975 resolved, all spurious | 312 / 312, all spurious |
| architect -> architect2 | 0 / 0 (misses the 2 / 2) | 2 / 2 |
| construction -> construction2 | 0 / 0 (misses the 16 / 16) | 15 / 15 (misses 1 / 1) |

- **Re-export:** keyed on `#id`, a merge request that only re-saves the model
  through another tool would show 8,975 "new" failures and 8,975 "fixed"; keyed
  on GlobalId it shows none, which is what happened. And where the model did
  change, the `#id` key saw nothing, because the wall and column kept their
  `#id`s.
- **The cap hides changes.** With 50 issues per specification picked by
  GlobalId the widget showed 0 of the 2 and 0 of the 16 real changes: the
  changed elements sort past the 50th. Picked in file order it found them on
  architect and construction (the changed elements are early in the file) but
  flagged 312 + 312 spurious ones on MEP2. So the default is every element the
  report lists, and the per-spec cap (`--gitlab-max-per-spec`) is there for
  size, with this trade-off written next to it.
- **Duplicate GlobalIds** were found by this measurement: the first version
  keyed on GlobalId alone, and the construction column that took a slab's
  GlobalId pushed a collision suffix onto the slab, so the widget reported the
  unchanged slab as both new and resolved in several IDS files. Adding the class to the key fixed it (the counts
  above). Two elements of one class sharing a GlobalId would still share a key
  and get an order-dependent suffix. Since `duplicate-globalids-2026-11-17.md`
  the checker reports duplicate GlobalIds as such, in every output.
- **Size:** 200 to 415 KB and 336 to 565 issues per IDS file on these
  models, so a project with one to three IDS files writes a report under about
  1.3 MB.

End to end, `ci-cli.mjs` on the four exports of `ci-scale-2026-11-17.md`
against the two starter IDS files (8 pairs), three runs each: 3.0 to 3.3 s
without `--gitlab-codequality`, 3.1 to 3.4 s with it; 1,352 issues (7
required, 732 prohibited, 613 optional), 748 KB, 1,352 distinct
fingerprints, 1,345 on an element's line (the 7 others are failures with no
element to point at).

## Not measured

No GitLab instance was used: the shape follows GitLab's documented Code
Quality format (required: `description`, `check_name`, `fingerprint`,
`severity`, `location.path`, `location.lines.begin`), and GitLab's own size
limit for the artifact (an instance setting) was not tested. A GitLab job:

```yaml
ids-check:
  image: node:22
  script:
    - node ids-model-check/ci-cli.mjs --models "models/**/*.ifc" --ids "requirements/*.ids"
        --junit ids-report.xml --gitlab-codequality gl-code-quality-report.json
  artifacts:
    when: always
    reports:
      junit: ids-report.xml
      codequality: gl-code-quality-report.json
```
