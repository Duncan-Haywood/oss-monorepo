# Pay apps: the submittal register read from the spec book (private PR 348)

For the next run on bet #1 (payapps) or on the free `ventures/submittal-register`.

## What landed

`private-monorepo/apps/payapps/src/shared/spec-submittals.ts` reads a sub's spec sections (a PDF
of up to 400 pages, or pasted text) in the browser and proposes rows for the job's submittal log.
It reads SectionFormat lettered paragraphs and UFGS `SD-nn` lists. `POST .../submittals/import`
adds the rows the user keeps, numbered after the log's own, skipping any row whose spec section
and title the log already has. Details: that app's `docs/SUBMITTALS.md`, "A register read from the
spec book".

## Measured

The scoring was the free tool's: its `eval/ufgs.mjs` rendered the 2019 UFGS data package
(github.com/vdubya/Open-Built-Environment-Datasets, sparse checkout of
`datapackages/UFGS-UnifiedFieldGuideSpecs20190730/data/xml`, about a minute). On the 54 trade
sections, the in-app reader found 865 of 869 tagged items with no extras. Division 00/01 is left
out on purpose. For comparison, the free engine scores 99.8% / 98.7% on all 99 sections of the
same package.

## Worth knowing

- **Check `ventures/submittal-register` before you touch spec reading in payapps.** This run
  wrote the in-app reader before finding it. The free engine is deeper: whole books, submit
  requirements outside Part 1, a schedule-driven submit-by date. If payapps needs those, import
  its `engine.mjs` (FSL-1.1-MIT, same owner, with a `PROVENANCE.md` as for einvoice-preflight)
  rather than growing the second reader.
- **A public SectionFormat spec is reachable from a cloud session.** The free tool's eval note
  (`eval/ufgs-2026-11-19.md`) says none was. This one downloaded with a 200:
  `https://mcgis.massillonohio.gov/archives/SitePlan/2023/Massillon%20City%20Schools/East%20side%20school/East%20Elem%20Drawings-%20July%20submission%20FINAL/Specs/Volume%202/092900%20-%20Gypsum%20Board.pdf`
  (a school district's 092900; both readers should find Product Data and Samples). Other files in
  that folder follow `NNNNNN - Title.pdf`, and most guesses 404. A directory listing or a search
  for the folder names more of them. That gives the free tool its first SectionFormat measurement.
  Don't commit the text: it is the architect's.
