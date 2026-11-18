---
title: "Check every IFC model against your IDS on each push: a free GitHub Action"
seo_title: "IDS check in CI: a free GitHub Action for IFC models"
date: 2026-11-17
description: "One workflow step checks every IFC export in a repository against every IDS file, with annotations, a JUnit report and BCF files. Tried on four real models."
tags: [ids-model-check, bim, ifc, ids, ci]
---

An IDS file says what a building model must contain: which walls need a
fire rating, which elements need a classification code, which classes are not
allowed at all. Checking a model against one is usually a manual step: someone
opens a desktop checker, loads the export and the IDS, and reads the result.
That step gets skipped on the export that matters.

[IDS Model Check](/ids-model-check/) now runs as a GitHub Action. A team that
keeps its IFC exports and IDS files in a repository adds one step:

```yaml
- uses: actions/checkout@v4
- uses: Duncan-Haywood/oss-monorepo/ventures/ids-model-check@main
  with:
    models: "models/**/*.{ifc,ifczip,ifcxml}"
    ids: "requirements/*.ids"
    bcf-dir: bcf
```

Every model is checked against every IDS (or, with `pairing: name`, `wall.ifc`
only against `wall*.ids`). The run gets:

- **An annotation per failing specification**, on the failing element's own
  line of the STEP file, so the pull request diff shows where the first
  offending wall is.
- **A summary table** on the run page: model, IDS, pass or fail, how many
  specifications pass, how many elements fail.
- **A JUnit report**, one test case per specification, which GitHub test
  report actions, GitLab, Jenkins and Azure DevOps already read.
- **BCF 2.1 files** for each failing pair, to open in a BIM viewer.

Required and prohibited specifications fail the build; optional ones are
warnings unless you ask for `fail-on: warning`. A glob that matches nothing
fails with exit 2 instead of passing an empty check. Outside GitHub,
`node ci-cli.mjs` does the same from any CI or a pre-commit hook. There are no
dependencies to install and nothing is uploaded anywhere.

## On four real models

We ran it on four public Revit-era IFC2X3 exports from opensourceBIM's
IFC-files repository (the HHS office's MEP, architect and construction models
and the Schultz Residence, 76 MB together), against the two starter IDS files
that ship with the tool. Eight pairs took about 7.5 seconds. Of 16
annotations, 9 pointed at an element, and all 9 landed on that element's own
line. The other 7 were requirements that nothing in the model matched, such as
walls in the MEP model.

The real files caught four bugs the sample house could not. The most useful:
the engine lists at most 500 elements of a prohibited specification, and the
first report said "500 of 574 fail" for the MEP model's 574 building element
proxies. It now counts all 574. Models linked into the folder were skipped,
line numbers were put on zipped models, and a comma inside `{ifc,ifczip}` split
the pattern. All four are fixed and tested. The full run is in
`ventures/ids-model-check/eval/ci-action-2026-11-17.md`.

It has not yet run on a team's own repository. If you keep IFC exports in git
and try it, the
[source and README](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/ids-model-check)
say how to report what it gets wrong.

*Results are a check of the model against the IDS as written, not a design
review or professional advice.*
