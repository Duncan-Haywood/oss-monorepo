# Commercial-surface audit, 2026-08-04

Four ventures that had never been held to the claims contract in
[the engineering roadmap](ENGINEERING-ROADMAP.md) — "Hold every venture's
customer-facing claims to what the venture can actually deliver" — were read
against their implementing code: `print-atelier`, `retail-pilot-intel`,
`real-estate-agent-photo-app`, `photo-editing`. Two are now fixed and gated.
The other two are recorded here because the findings are larger than one
session and the evidence should not have to be re-derived.

Every item below cites the file and line of the claim and of the code that
contradicts it. Nothing here is a style opinion or a guess.

## Fixed in this pass

### print-atelier — every paid order shipped to a placeholder address

`src/app/storefront/page.tsx:63` promises prints "shipped directly to your
door". `buildStripeCheckoutCreateParams` set no `shipping_address_collection`,
so no `shipping*` key ever reached payment metadata, and both partner adapters
substituted a literal when the key was missing: `123 Market St, San Francisco`
(`printful-orders.ts:89-96`) and `10 Market Street, London`
(`gelato-orders.ts:118-123`). `src/app/api/stripe/webhook/route.ts:107-115`
POSTs to the live partner API whenever credentials are configured. With those
set, every paid order becomes a real print job addressed to a street the buyer
has never seen.

Fixed by collecting the address at checkout, lifting it off the PaymentIntent
in the webhook, and making the adapters fail closed — a missing field blocks
the submission and names what is missing rather than inventing it. The retry
path is guarded too: it holds the payload but not the metadata, so it could not
supply what the guard was missing. Also removes the country derivation
`region.slice(0, 2)`, which produced the country codes `EU` and `AP`.

`tests/buyer-shipping-address.test.ts`, mutation-checked eight ways.

### print-atelier — the order summary quoted a total Stripe did not charge

`src/components/CheckoutLab.tsx:215-226` rendered a bolded Total of
`subtotal + shipping + tax` (`checkout.ts:244-247`) while the session carried
only the print line items (`checkout.ts:301-305`). A US cart of one $85 print
displayed **$99.11** and charged **$85.00**. EU and UK carts displayed 20% VAT
that was never collected and therefore could never be remitted.

Shipping is now a real Stripe shipping rate, so the quoted delivery charge is
taken. Tax is not: nothing in this repository registers the venture for sales
tax or VAT anywhere and the rate table is hardcoded, so collecting against it
would be worse than not collecting. The summary states whether tax is charged
instead of showing an amount the buyer is never asked for, and `automatic_tax`
is set only where a deployment declares a registration.

`tests/checkout-charges-what-it-quotes.test.ts` holds "what the summary quotes
is what Stripe is asked to charge" across all four regions, mutation-checked
four ways.

### real-estate-agent-photo-app — a claims guard that passed over the published site

`pipeline/src/offer-claims.test.ts` exists precisely to stop customer-facing
copy claiming an alteration the pipeline cannot perform, and it passed while
the docs site published all five of them. Its `CUSTOMER_FACING` list was three
hardcoded files; `docs-site/src/lib/docs.ts` renders `STRATEGY.md` as a public
page and `STRATEGY.md` was in no list. So the venture advertised "instant
on-device AI" over a `sharp`-only pipeline, and cloud edits for virtual
staging, twilight and object removal — the exact class that triggers the
CA AB 723 / NY / TX disclosure duty the contract was derived from.

The guard now reads `DOC_REGISTRY` off disk, so a page added to the site is
scanned without anyone remembering. A published page may still name a
restricted alteration when the same markdown block says it is not built —
**per claim, not per directory**, because a directory exemption is a region
where the claim may be untrue and nothing says so. Block granularity rather
than line, so re-wrapping a paragraph cannot strip a claim of its disclaimer.

Mutation-checked five ways. A sixth mutation — loosening the qualifier scope
from block to whole file — lets an unqualified offer through, which is the
argument for the block rule and is recorded rather than fixed: nothing enforces
that the guard keeps block granularity.

### real-estate-agent-photo-app — the delivered photo was not the one encoded

`enhanceImage` encoded to a buffer with the requested quality and mozjpeg, then
decoded that buffer and re-encoded it through a second `sharp()` on the way to
disk. Delivered photos were twice-compressed at the library default quality 80,
so `--quality` and mozjpeg were inert, and `outputBytes` reported the length of
the discarded buffer — the operator's per-file delivery report described a file
nobody received. Separately, `maxWidth` is documented as a long-edge cap but
constrained only width, so a portrait frame (the orientation the capture
checklist asks agents to shoot) came out above the cap.

The suite generated only landscape fixtures and asserted `outputBytes > 0`, so
neither was visible. It now stats the written file, drives a portrait frame,
and checks that two `--quality` values produce different delivered sizes.

## Open: retail-pilot-intel

Not fixed. These are copy and analytics defects across a sales surface, and the
right fix is a venture-local claims contract of the shape
`real-estate-agent-photo-app` now has, not a series of edits.

1. **Fabricated pilot results are scripted as closing proof.** `apps/docs/src/pages/DemoPage.tsx:136`
   presents `"Conversion lift (pilot)", "+2.4 pts"` in a table headed "Key
   numbers for the close"; `:35` claims `"till script lifted scarf attach 22% -> 67%"`;
   `apps/portal/src/pages/ValuePage.tsx:47-51` heads a section "Before vs after
   (6-week pilot)" and states the provenance as "week 6 from joined door CV and
   POS". `apps/portal/src/data/demoStore.ts:1` says of the same numbers:
   "Illustrative pilot data — not connected to live edge/POS in this build",
   and every figure is a literal (`:24`, `:136-137`, `:199`, `:204-209`).
   `VENTURE.yaml:3,9-11,16-17` records `stage: prototype`, hypothesis
   `untested`, `mrr: 0`, `customers: null`. There is no pilot and no customer.
   `demoStore.ts:349` instructs the presenter to call it "concrete proof for
   prospects". A generic "Illustrative data" pill elsewhere in the shell does
   not cure a page that names its own data source.
2. **GDPR "technical controls" asserted to a prospective data controller are
   not implemented.** `apps/docs/src/pages/PrivacyPage.tsx:41` lists "On-device
   CV / Inference on edge PC; RTSP not on internet" under a column headed
   "Implementation"; `demoStore.ts:170` states "Video retention: 0 days (frames
   discarded on device)". `packages/edge/src/cli.ts:10-13` refuses to run
   without `--sample` because there is no RTSP ingest, and `:29` stamps every
   event `model: "stub"`. `packages/edge/package.json` declares one dependency
   and no inference runtime. "Frames discarded on device" is true only because
   no frame is ever ingested. This is the highest-liability item: a store
   signing a DPIA acts as controller on the strength of it.
3. **Two priced tiers have no implementing code.** Margin+ at EUR 299-449 per
   store per month sells "SKU zones, desirability gap, experiment registry"
   (`BusinessPlanPage.tsx:358-360`); a grep for `touch|zone_dwell|desirability|experiment`
   across `packages/*/src` returns nothing, and `packages/analytics/src/db.ts:8-32`
   has two tables and no experiment registry. The Street add-on
   (`:363-365`) is flagged `liveInDemo: false` in the venture's own data.
4. **No payment code exists at all**, so none of the four surfaces quoting a
   price can charge one.
5. **The same demo script quotes three setup fees and two upside ranges.**
   Setup is EUR 2k-5k (`DemoPage.tsx:134`), EUR 1.5k-3k (`BusinessPlanPage.tsx:334`)
   and EUR 2.5k-4k (`demoStore.ts:212`); annual upside is EUR 18k-48k in the
   docs and EUR 14k-32k on the portal screen the script tells the presenter to
   open next.
6. **Every call to action is dead.** No `mailto:`, `href`, `<form>` or calendar
   link exists anywhere under `apps/docs/src/pages/`, and `App.tsx:45-69`
   defines no contact, demo-request or waitlist route.
7. **A hardcoded "Edge online" badge** (`PortalShell.tsx:95`) that cannot ever
   read offline, beside numbers described as coming from live door CV and POS.

## Open: photo-editing

Not fixed. The safety core here is genuinely sound — unlike its sibling
`photos-import-tools`, `sha256_file()` is actually called in the copy path
(`ingest.py:114,139,153`), the catalog re-verifies (`catalog.py:153`), and
`render_workspace.py:293` re-hashes deliverables. The gap is in the pilot/GTM
analytics layer.

1. **Dry-run stubs are counted as real deliverables in pilot-readiness
   metrics.** `render_adapter.py:479-492` writes a JSON payload as the
   deliverable in dry-run mode; the committed demo shows
   `deliverables/instagram_reel.mp4` is 559 bytes of JSON.
   `render_scheduler.py:630` *does* record `renderer_adapter: "dry-run-local"`,
   and `workspace_health.py:278` keeps only the counts and drops that field.
   `pilot_dashboard.py:296,336,356` then reports
   `ready_for_pilot_review: true` and a 100% pilot-ready rate. Grepping
   `adapter|renderer|dry` across `pilot_dashboard.py`, `pilot_cohort_report.py`
   and `pilot_cohort_brief.py` returns zero hits: nothing in the analytics
   stack can tell a real render from a stub. The one field that distinguishes
   proof-of-concept from product exists in the trusted source report and is
   discarded exactly one layer before it would be shown.
2. **"Color calibration" scores are slices of a SHA-256 digest.**
   `VENTURE.yaml:2,9` describes the venture as a service for "automated raw
   color calibration" at $0.25/photo. `production_adapter.py:2438-2442`
   defines `_analysis_score(sha256, offset)` as
   `0.5 + (int(sha256[offset:offset+4], 16) / 0xFFFF) * 0.5`, and `:2015-2018`
   derives `aesthetic`, `story`, `technical` and `motion` scores from four
   windows of the file digest. No pixel is read. The
   `adapter: "shootflow-analysis-production-local"` marker written at `:2011`
   is never read by `analysis.py` or `story.py`, so probe output is
   structurally identical to real output at every boundary after the adapter —
   which is what makes finding 1 possible.
3. **The declared verify gate cannot run.** `VENTURE.yaml:4` declares
   `pytest tests && ...`; `tests/test_ingest.py:6` imports `shootflow`, the
   package lives at `src/shootflow/`, and there is no `pyproject.toml`,
   `conftest.py` or `pytest.ini` anywhere to put `src/` on `sys.path`. The
   working invocation used everywhere else in the venture's own docs is
   `PYTHONPATH=src python3 -m unittest discover -s tests`. Separately,
   `.github/workflows/docs-site.yml:31-33` runs only `npm ci` and
   `npm run build`, and its `paths:` filters mean no change under `src/` or
   `tests/` triggers CI at all.

## What generalizes

The recurring shape across all four ventures is not dishonesty; it is **an
internal document that already tells the truth, sitting one click from a public
page that contradicts it, with no join between them**. `retail-pilot-intel`'s
commercial-viability pages say plainly that CV, POS adapters and experiments
are stubs. `photo-editing`'s README is candid about probes.
`real-estate-agent-photo-app` records the pipeline's real capabilities in
`process/mls-compliance.ts`. In each case the honest text and the selling text
can drift indefinitely, and only ever in the direction that sells better.

The control that closes it is a test that reads the public surface **off disk**
and binds each claim to the code that would implement it. The two failure modes
to avoid are both visible in this pass: a hardcoded file list (which is how
`offer-claims.test.ts` came to pass over the whole published site), and a
directory-wide exemption (which converts the gap from an oversight into a
sanctioned region where claims need not be true).
