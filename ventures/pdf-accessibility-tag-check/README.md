# PDF Accessibility Tag Checker

A free tool for anyone who publishes PDFs a government body, school, or
business is obligated (or just trying) to make accessible: reads a PDF's
**internal structure** — not a screenshot, the actual tag tree, metadata, and
content streams — and reports which PDF/UA and Section 508 structural
requirements are met.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/pdf-accessibility-tag-check/

Specifically, it checks:

- **Tagged PDF** — does the document catalog declare `/MarkInfo /Marked
  true` and have a `/StructTreeRoot`? Without both, a screen reader has no
  reading order, headings, or roles to work from at all.
- **Document title** — a non-empty `/Title` in the Document Information
  dictionary (WCAG 2.4.2), plus whether `ViewerPreferences/DisplayDocTitle`
  is set so a viewer actually shows it.
- **Declared language** — a `/Lang` entry on the catalog that looks like a
  well-formed BCP 47 tag (WCAG 3.1.1).
- **Image alt text** — counts image objects against structure-tree elements
  carrying non-empty `/Alt` text. Zero alt-bearing elements against one or
  more images is a clear finding; a partial count is a notice, because
  mapping one specific structure element to one specific image needs the
  marked-content ID chain this tool does not walk — see the FAQ on the page.
- **Scanned pages with no text layer** — a page with image content but no
  `Tj`/`TJ` text-showing operator in its (decompressed) content stream is
  flagged as likely an un-OCR'd scan: invisible to a screen reader, to
  search, and to copy-paste.
- **Form field labels** — interactive `/Widget` annotations with no `/TU`
  (accessible name) on themselves or an inherited parent field.

After using this, you can point to the exact structural gap a PDF has —
instead of guessing from a visual read-through or waiting for an audit to
find it.

## Why this exists, not just "another PDF accessibility checker"

Several free online PDF/UA checkers already exist (PDFix, PDF Audit,
freepdfchecker.com, axesCheck) and the classic free desktop tool PAC. Every
one of them either requires **uploading the file to a server**, or checks
**one file at a time** with no batch mode. This tool is built around the two
gaps that leaves:

1. **Nothing is uploaded, ever.** The browser page reads the file entirely in
   your own tab — Flate-compressed PDF streams are read with the browser's
   native `DecompressionStream` API, no server round-trip. That matters for
   government forms, permits, and HR documents you would rather not hand to
   an unfamiliar third-party site.
2. **A matching CLI that batch-scans a folder.** A government IT office or
   university disability-services team usually has a document library, not
   one PDF. `node cli/check.mjs ./document-library/ --json` walks a whole folder
   recursively and exits non-zero if any file has a finding, so it works as a
   CI or scheduled-job gate. Nothing free and online offers this today.

## Two parts, sharing the same checking logic (`engine.mjs`)

### CLI

```
node cli/check.mjs report.pdf
node cli/check.mjs ./document-library/ --json
node cli/check.mjs a.pdf b.pdf --json
```

Reads the file(s) directly from disk — nothing goes through this portfolio.
Exit code `0` when every file parsed and none has a danger-severity finding;
`1` otherwise, so it works directly as a CI gate:

```yaml
# in your own CI, not this portfolio's
- run: node cli/check.mjs ./public/documents/ --json
```

### Browser

Open `index.html` and drop a PDF onto it. The file is read with the
`File`/`ArrayBuffer` APIs and never leaves the tab.

## What this is, and isn't

**Evidence, not a determination.** These are specific, automatable structural
checks — not a full PDF/UA or Section 508 conformance audit, not a
substitute for a manual or assistive-technology review, and not a judgement
on whether an alt-text string is *accurate* or a reading order is *correct*.
A clean report means these checks found nothing, not that the document is
compliant.

**Encrypted PDFs are disclosed as a limitation, not silently mis-scored.** If
a PDF is encrypted, the report says so and notes that the content-dependent
checks (alt-text coverage, scanned-page detection) may be incomplete.

## Privacy

Nothing about the file — its name, contents, or path — is ever sent
anywhere by either the browser page or the CLI. The only thing stored is an
anonymous local count (`localStorage`, browser only) of which features were
used and the day — no file names, no file contents, no account, no tracking
cookies, no analytics vendor, honouring Do Not Track and Global Privacy
Control automatically. Turn it off with the checkbox in the page footer.

## No warranty

This tool is provided free and as-is, without warranty of any kind, express
or implied. It is not legal, accessibility-consulting, or compliance advice,
and it does not replace a qualified accessibility review or a real
assistive-technology test. You are responsible for reviewing and verifying
its output before relying on it, and for meeting any obligation it helps you
prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** The hosted browser page is free,
experimental, and may be slow, broken, moved, or taken offline without
notice. The CLI has no such dependency — it's a script you run yourself.

## License

[MIT](LICENSE). Free and open source —
[support](https://github.com/sponsors/Duncan-Haywood) is entirely optional
and never changes what the tool does.

## Tests

```
cd ventures/pdf-accessibility-tag-check && node --test
```

Assertions across the byte-level PDF object parser (`pdf-parser.test.mjs`,
including a real `zlib`-compressed content stream and a compressed object
stream), the checking logic (`engine.test.mjs`), the CLI's file/directory
handling and exit codes (`check.test.mjs`, including real subprocess runs),
the usage counter (`usage.test.mjs`), and the page's structure and
disclaimers (`page.test.mjs`).
