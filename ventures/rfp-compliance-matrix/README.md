# RFP Compliance Matrix Generator

**Paste an RFP, get a compliance matrix.** One row for every *shall*, *must* and *required* obligation, with the section number, a category, a strength (mandatory, prohibition, desirable), and blank Owner / Status columns for your team. Page limits, due dates, copies, mandatory meetings and required forms are listed separately because they are checked once for the whole proposal.

It is the step after [`tender-bid-readiness`](../tender-bid-readiness/) (should we bid?) and [`tender-radar`](../tender-radar/) (which tenders?): you have decided to bid and now need to be sure nothing goes unanswered.

## Run it

Browser: open `index.html` (or serve this directory with `python3 -m http.server`), paste the solicitation, press **Build the matrix**, download the CSV.

Command line, no dependencies, Node 18+:

```
node cli.mjs rfp.txt --format csv  > matrix.csv
node cli.mjs rfp.txt --format md   # Markdown table
node cli.mjs rfp.txt --format json # machine-readable
cat rfp.txt | node cli.mjs -       # stdin
```

Tests: `node --test`.

## What it does

- Splits the text into blocks under the nearest section number (`1.1`, `3.2.4`, `L.4`, `Section C`, `Article 7`).
- Flags obligations: *shall, must, is required to, needs to, will* (only when the contractor/offeror is the subject).
- Separates *shall not / must not* prohibitions and *should / preferred* desirables, and drops the buyer's own duties ("the County will evaluate...").
- A lead-in such as "The Contractor shall:" followed by `(a) ... (b) ...` items becomes one row per item.
- Merges repeated sentences into the first occurrence and records where they reappear.
- Categories: pricing, insurance and bonds, security and privacy, past performance, staffing, certifications and licenses, reporting and deliverables, proposal format, technical.
- CSV cells that start with `=`, `+`, `-` or `@` are neutralised so a hostile solicitation cannot plant a spreadsheet formula.

## What it does not do

It is a deterministic first pass, not a reading of the document. A sentence can hold two obligations; requirements can sit in tables, figures or attachments you did not paste; evaluation weighting is not modelled. Check the matrix against the solicitation and every addendum.

## Roadmap (not built)

Word/PDF ingestion with real section parsing, an LLM pass behind an env var to split compound requirements and draft a response outline, shared matrices for a team, and a content library. This repository ships the free, private core.

## Privacy and usage

Everything runs in your browser or on your machine. Pasted text is never uploaded and there are no accounts, cookies or analytics vendors. The optional counter stores only aggregate feature counts in local storage, honors DNT/GPC, and is turned off with the footer button.

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, procurement, tax, financial, medical, or engineering advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or taken offline without notice. We do not promise uptime, backups of anything you type, or that a URL will keep working. Do not use this as a system of record. If a tool needs to survive, export your inputs and run it yourself.

MIT licensed. Optional support: [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
