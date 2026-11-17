---
title: "A re-saved IFC model is not 8,975 new failures: GitLab Code Quality keyed on GlobalId"
seo_title: "IFC model checks in GitLab merge requests, keyed on GlobalId"
date: 2026-11-17
description: "ids-model-check now writes a GitLab Code Quality report. On real model revisions it showed the 18 real changes and nothing for a re-save that renumbered 665,224 entities."
tags: [ids-model-check, bim, ifc, gitlab]
---

GitLab's merge request page has a Code Quality widget. You give it a JSON file
of findings, each with a `fingerprint`. GitLab compares those fingerprints with
the target branch's report and shows two lists: findings this merge request
introduced and findings it fixed. For source code that works well. For an IFC
model the hard part is choosing the fingerprint.

[ids-model-check](/ids-model-check/) checks IFC models against IDS
requirement files. From today, `node ci-cli.mjs --gitlab-codequality
gl-code-quality-report.json` writes that report. It contains one finding for
each failing element, placed on the element's `#123=` line in the model, plus
findings for IDS mistakes placed on the line of the faulty `<specification>`.

## Why the fingerprint can't use the line or `#id`

An IFC file numbers its entities `#1`, `#2` and so on, and any tool that
saves the model can renumber them. The opensourceBIM sample set shows this.
The HHS Office project includes a second revision of each model, and
`MEP2.ifc` is the Revit export re-saved through BIMserver. It has the same
665,224 entities, with every one renumbered and the file reordered. One duct
is `#1597` on line 1,570 of the first file and `#322587` on line 1,403 of the
second.

We checked both revisions against 67 IDS files: three samples and 64 public
ones written by other people. Then we counted what the widget would show:

| Fingerprint built from | MEP re-save | architect revision | construction revision |
|---|---|---|---|
| `#id` | 8,975 new, 8,975 fixed (none real) | 0 (missed 2 and 2) | 0 (missed 16 and 16) |
| GlobalId and class (shipped) | **0** | **2 new, 2 fixed** | **16 new, 16 fixed** |

The `#id` key gets both kinds of revision wrong. The re-save looks like
thousands of new problems. The real changes don't appear at all, because in
those revisions a wall and a column got new GlobalIds but kept their `#id`s.
The GlobalId is the element's identity across exports, so the fingerprint is
built from it.

## Two things this measurement caught

**The cap.** The first version gave each specification at most 50 findings.
With that cap the widget showed none of the 18 real changes, because the
changed elements sorted past the 50th. Taking the first 50 in file order
instead found most of them, but flagged 624 false changes on the reordered
MEP file. The default is now every element the report lists (up to 1,000 per
specification). On these models that comes to about 200 to 415 KB of JSON per
IDS file. `--gitlab-max-per-spec` still exists for anyone who needs a smaller
report, and the README states what a cap costs.

**Duplicate GlobalIds.** A GlobalId is supposed to be unique. The
construction revision gives a column the GlobalId of a slab, and the original
files already contained one to three duplicates. With GlobalId alone in the
fingerprint, the column and the slab collided. The tie-break suffix then moved
onto the slab, so the widget reported the unchanged slab as both new and
fixed. Adding the IFC class to the fingerprint fixed this. The checker should
also report duplicate GlobalIds directly, and that is the next item for this
venture.

## Using it

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

The checker runs on your own runner and nothing leaves it. We haven't tested
it on a live GitLab instance yet. The report follows GitLab's documented
format, and the measurement, script and limits are in
`ventures/ids-model-check/eval/gitlab-codequality-2026-11-17.md`. The code is
MIT licensed.
