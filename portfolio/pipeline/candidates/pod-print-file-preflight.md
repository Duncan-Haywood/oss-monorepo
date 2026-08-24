# Candidate: POD print-file preflight

**One line.** A dated evidence record for art files destined for print-on-demand:
named print size versus pixel count, implied DPI, format, file-size cap, and
web-export filename tokens — sold as a product line of `print-atelier`, never
as a lab submission and never as "print-ready."

**Verdict: build now, as a product line inside
`ventures/print-atelier`, not as a new venture.** Same artist, same upload
folder, and that venture already promises "print-ready masters" in its
strategy copy. If it sells, keep it there; the artist portal is the channel.

Scored 2026-08-24. Composite 6.625 · floor 5 (distribution).

| Dimension | Score | Why |
|---|---|---|
| AI leverage | 6 | The first probe is header math and filename tokens. Colour-managed proofing, ICC validity, and bleed-margin vision are the model-shaped work, and they are **disclosed as unimplemented** rather than faked |
| Autonomous ops | 8 | Drop a folder on the CLI; no queue a person has to drain. Artist review is optional |
| Time to revenue | 6 | Priced as a check on an upload the host venture already intends to take. No new buyer to find — and that venture still has zero customers, so this is not a month-one cash story |
| Gross margin | 8 | Compute only on the checks that exist. A later colour-managed proof is inference, still no contractor |
| Defensibility | 5 | Print-lab floors are public and copyable. What accrues is a per-file re-check archive and a dated spec-excerpt library |
| Distribution | 5 | Product line of a venture that already talks to this artist on paper. Honest that the host has no customers yet — same honesty MLS photo spec used for the same shape |
| Liability containment | 7 | We never send a file to a printer. A wrong flag is a re-export; a silent pass is the failure that can waste a paid print run, and the record names that direction |
| Ethical robustness | 8 | Makes hidden lab floors visible instead of surprising the artist after a reject. Refuses the "print-ready" warranty the host venture's own strategy page still uses |

## What this is not

Named against [screened-out.md](../screened-out.md), so the next pass does
not re-derive the rejection:

- **Not print-on-demand the marketplace.** `print-atelier` is capture,
  listing, and fulfillment. This is the check that runs *on* an upload
  folder. The pipeline README rule is "a candidate that fits an existing
  venture is a product line first."
- **Not listing photography / [mls-photo-spec-preflight](mls-photo-spec-preflight.md).**
  That scores MLS delivery photos for a real-estate agent. This scores art
  files against a named print size. Different buyer, different spec, different
  failure cost (wasted print run, not a board fine).
- **Not photo-editing the venture, not photos-import-tools.** ShootFlow is
  ingest-to-reel; the import tools are macOS card offload. Neither is a
  print-lab floor check.
- **Not EAA / web accessibility / Shopify a11y.** Those score web pages.
- **Not e-invoice preflight.** Different artifact, different obligation.
- **Not advice-of-record.** "This PNG is 400×500 and the filename says
  `8x10`, so implied DPI is 50" is a file fact. "Your lab will print this"
  is a warranty we do not sell.
- **Not a Twin-product SKU** and not a new `ventures/` directory.

## Why now

`session_gate.py` on 2026-08-24 printed BUILD and "no candidate carries an
unbuilt `build-now` verdict" after `eaa-remediation-pipeline` and
`mls-photo-spec-preflight` both graduated. The intake brief still says do
not produce another list of the nine archetypes. This is an eleventh
shape: **print-size evidence on customer-supplied art files**, attached to
a venture that already decided the phrase "print-ready" is the sale
(`src/components/Strategy.tsx`, `src/app/capture-demo/page.tsx`).

The host venture currently promises "phone photo → print-ready master."
That phrase is the warranty this product exists to stop selling. The
record replaces it.

## What is sold

A dated file the artist (or the host portal) can keep next to the upload:

1. **What was tested**, against which spec excerpt, on which date.
2. **What failed**, with the rule cited (implied DPI vs named size,
   pixel floor when no size is named, format, byte cap, web-export
   filename, aspect vs named size).
3. **What was not tested.** Bleed margin, CMYK/ICC, PDF fonts, and
   lab-specific extras are `unimplemented`. A clean table is not a
   clean print file.
4. **How the tool can be wrong**, including which direction costs the
   customer (a silent pass).

Indicative price: included in artist onboarding, or $9 as a stand-alone
folder check. No print-lab account, no upload on anyone's behalf.

## Liability and ethics

- **Never submit.** Input is a folder the customer already has. Output is
  a markdown record. Credentials for Printful / Prodigi / Gooten are out
  of scope.
- **Never say "print-ready" or "will print."** Those are warranties. The
  record says what was measured.
- **A miss is the expensive error.** Over-reporting a filename token
  costs a rename. Under-reporting a 50-DPI file sold as `8x10` is what
  wastes a print run. The record states that.
- **Customer-supplied art only.** No scraped portfolios, no purchased
  artist lists.

## First experiment

Two weeks, $0 spend beyond agent time, no new directory:

1. Build the folder check and the customer record (this pass).
2. Measure precision/recall on an author-authored fixture corpus; print
   both figures in the record.
3. Run the same check on a real artist upload once the host venture has
   one — that step needs the first onboarding and is owner-gated.

Kill it if the fixture silent-pass class is not empty after the first
measurement (the tool said pass on a file labelled fail), or if a real
upload is checked and the record still claims a check it did not run.

## Sources

- [`ventures/print-atelier/src/components/Strategy.tsx`](../../../ventures/print-atelier/src/components/Strategy.tsx) — host copy, "print-ready masters"
- [Printful print-file guidelines (public help)](https://www.printful.com/blog/print-file-guidelines)
- [Prodigi artwork requirements (public docs)](https://www.prodigi.com/print-api/docs/)

Secondary / desk research, gathered 2026-08-24. Same confidence as the
rest of this directory: good enough to rank, not good enough to put in
customer-facing copy as a named lab rule.
