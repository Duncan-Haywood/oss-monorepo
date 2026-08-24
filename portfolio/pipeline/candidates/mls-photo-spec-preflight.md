# Candidate: MLS photo spec preflight

**One line.** A dated evidence record for listing photos: what we checked
against a published floor spec (size, aspect, format, filename branding,
virtual-staging pairing), what failed, and what this tool does not look at —
sold as a product line of `real-estate-agent-photo-app`, never as a portal
submission and never as "MLS-ready."

**Verdict: build now, as a product line inside
`ventures/real-estate-agent-photo-app`, not as a new venture.** Same buyer,
same delivery folder, and that venture already wrote the desk-research
guardrails this product turns into an executable check
(`process/mls-compliance.ts`). If it sells, keep it there; the capture app
is the channel.

Scored 2026-08-24. Composite 6.75 · floor 5 (distribution).

| Dimension | Score | Why |
|---|---|---|
| AI leverage | 7 | Filename branding and staging-pair rules are deterministic; the work that would earn a model is visual watermark / burned-in contact text, which this first probe **discloses as unimplemented** rather than faking |
| Autonomous ops | 8 | Drop a delivery folder on the CLI; no queue a person has to drain. Agent review is optional |
| Time to revenue | 6 | Priced as an add-on to a listing the host venture already intends to deliver ($19/listing concierge). No new buyer to find — and that venture still has zero customers, so this is not a month-one cash story |
| Gross margin | 8 | Compute only on the checks that exist. A later visual-watermark model is inference, still no contractor |
| Defensibility | 5 | Portal rules are public and copyable. What accrues is a per-listing re-check archive and a dated spec-excerpt library |
| Distribution | 5 | Product line of a venture that already talks to this buyer on paper. Honest that the host has no customers yet — not the 8 EAA originally scored for the same shape |
| Liability containment | 7 | We never submit to an MLS. A wrong flag is a re-export; a silent pass is the failure that can cost the broker a board fine, and the record names that direction |
| Ethical robustness | 8 | Makes hidden portal rules visible instead of surprising the photographer after upload. Refuses the "MLS-ready" warranty the host venture's own marketing still uses |

## What this is not

Named against [screened-out.md](../screened-out.md), so the next pass does
not re-derive the rejection:

- **Not listing photography the venture.** `real-estate-agent-photo-app`
  (Listing Lens) is guided capture, enhancement, and delivery. This is the
  check that runs *on* a delivery folder. The pipeline README rule is "a
  candidate that fits an existing venture is a product line first."
- **Not `multi-location-listing-guard`.** That was NAP consistency across
  directories (Yext/BrightLocal). This never reads a business listing and
  never touches name/address/phone.
- **Not EAA / web accessibility / Shopify a11y.** Those score web pages.
  This scores image files in a customer-supplied folder.
- **Not photo-editing the venture, not photos-import-tools.** Different
  buyer, different artifact.
- **Not advice-of-record.** "This JPEG is 1024×768 and the filename does
  not contain `watermark`" is a file fact. "Your board will accept this
  listing" is a warranty we do not sell.
- **Not a Twin-product SKU** and not a new `ventures/` directory.

## Why now

`session_gate.py` on 2026-08-24 printed BUILD and "no candidate carries an
unbuilt `build-now` verdict" after `eaa-remediation-pipeline` graduated.
The intake brief still says do not produce another list of the nine
archetypes. This is a tenth: **file-spec evidence on customer-supplied
media**, attached to a venture that already decided the rules matter
(MLS boards fine broker accounts, no-notice, for branding on submitted
photos — desk research in `process/mls-compliance.ts`, unverified against
a named board).

The host venture currently promises "MLS-ready" photos in outreach copy.
That phrase is the warranty this product exists to stop selling. The
record replaces it.

## What is sold

A dated file the agent can keep next to the delivery:

1. **What was tested**, against which spec excerpt, on which date.
2. **What failed**, with the rule cited (min edge, aspect, format, byte
   cap, branding-filename, staging-pair).
3. **What was not tested.** Visual watermark, burned-in phone/URL, and
   board-specific extras are `unimplemented`. A clean table is not a
   clean photo.
4. **How the tool can be wrong**, including which direction costs the
   customer (a silent pass).

Indicative price: included in the $19 concierge listing, or $9 as a
stand-alone folder check. No portal account, no upload on anyone's
behalf.

## Liability and ethics

- **Never submit.** Input is a folder the customer already has. Output is
  a markdown record. Credentials for Realtor.com / Zillow / a board are
  out of scope.
- **Never say "MLS-ready" or "compliant."** Those are warranties. The
  record says what was measured.
- **A miss is the expensive error.** Over-reporting a filename token
  costs a rename. Under-reporting a branded file is what boards fine.
  The record states that, and the first probe is biased toward flagging
  (filename tokens are conservative on purpose).
- **Customer-supplied photos only.** No scraped listings, no purchased
  lead photos.

## Shipped: free browser tool (2026-08-24)

The folder check now also runs client-side at
[`ventures/real-estate-agent-photo-app/research/src/app/photo-check/`](../../../ventures/real-estate-agent-photo-app/research/src/app/photo-check/page.tsx) —
drag photos in, get the same findings table (same rule set, same
disclosed-unimplemented list) with nothing uploaded anywhere. This is a
direct answer to the `distribution` floor (5): instead of waiting on the
host venture's first paying customer, any agent or photographer can find
and use the check today, for free, without an account. The Python probe
in `portfolio/pipeline/probes/mls-photo-spec/` stays the CLI/CI-testable
reference implementation; the TypeScript port in `photo-spec.ts` is tested
for parity against the same fixture corpus (`photo-spec.test.ts`, ported
from `tests/test_check.py`). No usage or revenue data yet — the page is
not deployed to a public domain (deployment is owner-gated per
`portfolio/ledger/decision_queue.py`'s `deploy-settings` ask).

## First experiment

Two weeks, $0 spend beyond agent time, no new directory:

1. Build the folder check and the customer record (this pass).
2. Measure precision/recall on an author-authored fixture corpus; print
   both figures in the record.
3. Run the same check on a delivery produced by `pipeline/src/enhance.ts`
   once a real listing folder exists — that step needs the host venture's
   first concierge delivery and is owner-gated.

Kill it if the fixture silent-pass class is not empty after the first
measurement (the tool said pass on a photo labelled fail), or if a real
delivery is checked and the record still claims a check it did not run.

## Sources

- [`ventures/real-estate-agent-photo-app/process/mls-compliance.ts`](../../../ventures/real-estate-agent-photo-app/process/mls-compliance.ts) — desk research, not board-verified
- [NAR — use of photographs in an MLS](https://www.nar.realtor/about-nar/policies/mls-policy/use-of-photographs-in-a-multiple-listing-service)
- [ARMLS — watermarks](https://armls.com/watermarks)

Secondary / desk research, gathered 2026-08-24. Same confidence as the
rest of this directory: good enough to rank, not good enough to put in
customer-facing copy as a board rule.
