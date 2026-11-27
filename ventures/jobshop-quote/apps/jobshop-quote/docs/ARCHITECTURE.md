# Job Shop Quote: Architecture (v0.1)

RFQ-to-quote for CNC machining and fabrication job shops. An estimator pastes an RFQ email and
attaches drawings; the LLM extracts part number, revision, material, quantities, tolerances, finish
and due date into an editable form; the estimator confirms each part, enters cost inputs (blank
size, operations with setup and cycle minutes, finishing, extras); a deterministic engine prices
every quantity break from **the shop's own rate card**; the quote goes out as a PDF and lands in a
won/lost log.

Stack and conventions are copied from `apps/grants` (read its `docs/ARCHITECTURE.md`); this app does
not import from grants.

## Stack (all Cloudflare)

| Concern         | Choice                                                                                   |
| --------------- | ---------------------------------------------------------------------------------------- |
| Runtime         | One Worker: Hono API at `/api/*` + static SPA assets                                     |
| UI              | React 19 SPA, TanStack Router (code-based routes) + TanStack Query, Tailwind 4           |
| Data            | D1 via Drizzle. Shared DB, every tenant row keyed by `org_id`, `ON DELETE CASCADE`       |
| Files           | R2 `FILES`: `orgs/{orgId}/rfqs/{rfqId}/{fileId}`, `orgs/{orgId}/quotes/{quoteId}/Q-n.pdf` |
| PDF text        | Workers AI `toMarkdown` (port `DocumentConverter`); fake reads a PDF's text with `shared/pdf-text.ts` (content streams, ToUnicode, form XObjects), other bytes as text |
| CAD geometry    | Port `GeometryExtractor` (`ports/geometry.ts`); `CadFeaturesGeometry` wraps `packages/cad-features` (alias `@cad-features`, consumed as source) for STEP, ASCII DXF, STL and ASCII IGES (box and holes, no volume; its hole locations feed "Drill from CAD" like STEP's) (a file with no units of its own is read in assumed mm at low confidence until an estimator picks mm or inches: `POST /rfqs/:id/files/:fileId/units`) |
| LLM             | Claude `claude-haiku-5-5` (env `LLM_MODEL`) via `ctx.llm` (`ports/llm.ts`), wrapped in `BudgetedLlm` (spend caps), FakeLlm offline |
| Quote PDF       | Own minimal PDF writer (`lib/pdf.ts`, no dependency)                                     |
| Auth            | Better Auth email + password with email verification and reset (docs/EMAIL.md); our own org/member/invitation tables |

## Code layout (`apps/jobshop-quote`)

```
src/shared/
  costing.ts         THE costing engine (pure): rate card + inputs -> quantity breaks; geometry aids
  extraction.ts      LLM extraction schema + deterministic verification; material/finish matching
  cover-note.ts      cover-note facts, number-grounding check, template fallback
  routings.ts        routing templates: schemas, applyRouting (replace/append), family-first sort
  routing-suggest.ts routing suggestions for a line from the shop's own lines (pure ranker)
  mime.ts            inbound email (RFC 5322/2045-2047/2231) -> text body + attachments, no dependency
  sender-allowlist.ts  who may email RFQs in: address / @domain entries, parse + match (docs/EMAIL.md)
  sender-auth.ts       Cloudflare's Authentication-Results (SPF/DKIM/DMARC) read; which claimed sender it backs
  rate-card-import.ts  the shop's sheet -> rate rows (header mapping, cell readers) + name-matched plan
  settings-import.ts   label/value rows of the same sheet -> shop settings (markups, line minimum,
                       quote days, quantity breaks, lead time and terms text; "(none)" empties a text
                       setting) + the PATCH of what changes; export reads back unchanged
  material-price.ts  material price dates and history: what counts as a new price, the shop's age
                     limit, the draft-line notes ("past the limit", "the card's price moved"); never prices
  material-bar-setup.ts  a per-foot row's bar setup (allowance, bar, remnant): edited in place,
                     the draft-line note when it changed since pricing (lineMaterialNotes wraps
                     linePriceNotes), and the edit form's parts-per-bar check; never prices
  material-price-impact.ts  "quotes this changes": open quotes (draft, sent) priced at a material
                     price the card no longer has, with the move and a threshold; read only.
                     Also the import preview's moves (importPriceMoves) and the quotes the prices an
                     import would set touch (proposedPriceImpact)
  sheet/             .xlsx and CSV into cell grids in the browser (copied from apps/payapps)
  api.ts             request schemas (zod) + DTO types;  enums.ts, geometry.ts
src/worker/
  app.ts index.ts context.ts env.ts types.ts
  db/schema/         auth.ts (user/session/... + organization/member/invitation), shop.ts (rate card),
                     rfqs.ts (rfqs, rfq_files, rfq_parts), quotes.ts (quotes, quote_lines), ops.ts (llm_calls)
  ports/             llm.ts, anthropic-llm.ts, fake-llm.ts, fake-llm-handlers.ts, converter.ts, geometry.ts
  middleware/        context, security (headers + Origin check), session, tenant (requireOrg/requireRole)
  routes/            legal.ts (public Terms/Privacy/Refunds/AUP from docs/legal, bundled by
                     docs/legal/sync-documents.mjs); public.ts (health, auth, me + legal accept, orgs, invitations); org/shop.ts (org, members, rate
                     card); org/work.ts (rfqs, quotes, costing preview)
  services/          auth/, orgs/, ratecard/, inbound/ (RFQs by email, docs/EMAIL.md), rfq/ (index, prompts, fake-llm), quotes/ (index, pdf,
                     prompts, fake-llm)
  lib/               errors, validate, ids, hash, logger, pdf
src/client/          main.tsx, router.tsx, lib/api.ts, components/ui.tsx, routes/*.tsx
test/worker/         workerd integration tests (local D1/R2, fake LLM/converter/geometry)
test/fixtures/       synthetic RFQ text (invented company and parts)
```

## No invented prices, no invented facts (the core liability)

1. **Prices come only from the rate card and the estimator's inputs.** `computeCost` is a pure
   function of (rate card, inputs). The LLM never produces a number that reaches it.
2. **Missing data blocks pricing; it is never guessed.** A line with no material choice (and not
   marked customer-supplied), no operations, a machine/material/finish not on the card, a per-lb
   material without blank size or density, a stock material without parts-per-stock, a per-foot
   material without a blank length (or with a cut longer than its usable bar), an operation
   whose cycle time was never entered (`cycleMinutesPerPart: null`, how a new operation and a blank
   box start), or an operation with neither setup nor cycle time returns `issues` and no price. A
   typed 0 cycle is a setup-only operation (programming, first article) and prices. A quote with any
   unpriced line cannot be sent.
3. **Rate ids are resolved against the caller's own card**, so ids from another shop (or made up)
   are `unknown_*` issues, never someone else's prices.
4. **Snapshots.** Each line stores the rate rows it used. Rate changes do not touch saved lines until
   the estimator presses Re-price. Sent quotes are frozen: every draft write carries a
   `status = 'draft'` guard in SQL and bumps `quotes.revision` in the same D1 batch, and sending
   succeeds only at the revision the PDF was rendered from. The exact PDF is kept in R2 under a
   content-addressed key with its SHA-256.
5. **Extraction is verified.** For every value the model returns the verbatim RFQ text it came from.
   `verifyExtraction` drops a value when that quote is not in the RFQ; when an identifier (part
   number, revision, customer name/email) is not written whole in the quote; when any token with a
   digit (alloy, tolerance) does not *equal* a token of the quote or one of its dash segments (no
   substring matches: `ABC-10` is not in `ABC-100`, `0.05` is not `.005`); when a word of the value
   is not in the quote; when a quantity is not a standalone number in its quote (not inside a part
   number, not after "Rev"); or when the quote does not state the exact date, year included.
   Dropped values become warnings. Parts start `confirmed = false`; only confirmed parts go onto a
   quote. Material and finishing are *suggested* by deterministic grade/word matching and confirmed
   by the estimator.
6. **The cover note only explains.** The model gets customer-safe facts (part numbers, quantities,
   unit and extended prices, what the price includes by name, lead time). It never sees rates, costs
   or markup. Its note may not state any price or percentage, offer discounts or other terms, or use
   a number that is not in the facts; otherwise the deterministic template is used.
7. **The customer PDF shows prices only**, never cost basis, rates or markup.
8. **Repeat parts reuse inputs, never prices** (`src/shared/repeat-parts.ts`,
   `services/quotes/history.ts`). Copying an earlier quote's line brings its material, blank,
   operations, finishing and extras, keeps this line's quantities, and prices from today's rate card.
   The old unit prices are shown to the estimator for reference only. A machine retired since is
   flagged in the history and still prices at its current card rate, as on any line that uses it.
   Pre-fill (part 2, opt-in per shop: `shop_settings.prefill_repeat_parts`) applies the same rule at
   quote creation: `pickPrefillSource` takes the last won line of the same part number and revision,
   the line stores where it came from (`prefilled_from`) so the estimator can check it, and nothing
   from the old line's prices or snapshot is reused.
   Part 3 applies it to lines added by hand (`addLine`/`updateLine`): only a line with no cost
   inputs yet whose save gives it a new part number (`shouldPrefillOnSave`), so a pre-fill never
   replaces what an estimator typed.
   Win/loss analytics (`src/shared/win-loss.ts`, `services/quotes/analytics.ts`) only count the
   shop's own decided quotes; markup there is read from each line's stored first break, never
   recomputed or estimated, and is shown to the shop's members only (never on a PDF or email).
   The CSV export (`GET /quotes/analytics.csv`) carries the same markup and the estimators' names,
   so it is behind the same membership check and served `private, no-store`. Months and the CSV's
   dates are read on the shop's calendar (`shop_settings.time_zone`, `src/shared/time-zone.ts`,
   Intl only, UTC when unset or unknown); instants are stored and sent as UTC. The same calendar
   dates a quote: the "Date" printed on its PDF, the valid-until day a new quote or revision gets
   (the shop's today plus `quote_valid_days`), and which day the daily expiry job and the
   day-before email count as today for that shop (`shopDay`; the sweeps bound their candidates by
   UTC's calendar, since no zone is more than a day from it, then check each shop's own day).

9. **A sent quote is never edited; it is revised** (`reviseQuote`, `src/shared/quote-label.ts`).
   Revise copies a sent, lost or expired quote into a new draft with the same quote number and the
   next `rev_number` ("Q-1001 Rev 2"; `revision` stays the internal edit counter), lines copied
   exactly (inputs, prices, rate snapshot) so the revision starts from what the customer saw; Re-price
   brings in today's card. A unique index allows one revision per quote, so revisions form a chain.
   The earlier quote stays live until the revision is sent; then, in the same D1 batch and only if
   that send stored this exact PDF, it becomes `superseded` (no outcome recorded on it, excluded from
   the quoted value). A won quote is not revised (a change to an order is a new quote), and a revision
   cannot be sent once the quote it replaces was marked won. The PDF prints "Replaces Q-1001".
   What changed between two revisions is a pure diff (`src/shared/quote-diff.ts`,
   `services/quotes/changes.ts`): lines paired by RFQ part, then part number and revision, then
   part number; stored prices compared as they are, never re-priced. The customer PDF can print "Changes from
   Q-1001" (opt-in per quote): `src/shared/quote-change-summary.ts` reads only fields the PDF
   already shows (part number and revision, description, quantity breaks and unit prices, lead
   time), never operations, material, finishing or extras.
10. **Expiry is a daily job** (cron `17 11 * * *`, `expireQuotes`): sent quotes whose valid-until
   day has passed become `expired`. It is the one quote query not scoped to an org (a system sweep
   that changes only status and `decided_at`).
11. **Routing templates carry inputs, never prices** (`src/shared/routings.ts`,
   `services/routings`). A routing is a named list of operations and finishing steps; applying it
   changes only the editor's inputs (operations and finishing), which are priced from today's card on
   preview and save. Its machine and finishing ids must be on the shop's own card when saved.
   Suggestions (`src/shared/routing-suggest.ts`) rank routings only from evidence in the shop's
   own lines and the line's description, say which evidence, and never offer one with none. A line
   in another rate-card row of the same alloy (`materialFamily`: the grade read from the row's
   name, "6061-T6 plate" and "6061 bar"; no synonyms, no family when the name gives none) counts
   between the same row and any other material, and the reason names the alloy.
   A line records the routings it was built from (`quote_lines.routing_ids`, migration 0030): the
   editor sets it when a routing is used on the line ("Use routing" leaves only that one, "Add
   after" adds it), saved from it or updated from it, and Save stores it (`PATCH .../lines/:lineId`
   `routingIds`, filtered to this shop's routings in one org-scoped query). Revisions, repeat-part
   pre-fills and copied lines carry it with the inputs. Win/loss by routing and the CSV count that
   record ("Routing since deleted" for one deleted since); null (lines from before 0030, or never
   touched by a routing) falls back to matching operations against today's routings. The line
   shows its record under "Routing templates" (today's names, "Routing since deleted", read-only on
   a sent quote), and the estimator can take a routing off it ("×") or clear it; the last one off
   leaves an empty record, not null (`withoutRouting`), so the line counts under "No saved
   routing" and is never re-matched by operations. Stored with the line's next Save.

## Costing model (`src/shared/costing.ts`)

Per quantity break q, all money in integer cents of the shop's currency, each component rounded once.
The currency (`shop_settings.currency`, `src/shared/currency.ts`) is one ISO 4217 code per shop from a
short list of two-decimal currencies, null reading as USD. It only labels amounts: nothing converts
between currencies, and changing it relabels the card and every saved quote. Every printed amount
goes through `formatMoney` (the engine's basis lines, the PDF, the cover-note facts, the revision's
change lines, the expiry email, the pages via `money()` in `client/lib/api.ts`), so the Worker, the
browser and the PDF print the same marks: `$`, `CA$`, `€`, `£`, `CHF `... A shop that chose a
currency gets "Prices in EUR" on every quote PDF; a shop that never did prints as before. The PDF
writer carries `€` (WinAnsi 0x80) and `£`; the cover-note guard refuses a price in any listed
currency, not only `$`. Plan prices (Paddle) stay in USD and do not follow the setting.

The rate-card and settings imports read amounts in the shop's currency only
(`splitCurrencyMark` and `headerCurrencyMark` in `currency.ts`, used by `readMoneyCell`,
`readRateSheet` and `readSettingsSheet`): `€85`, `85,00 €`, `CA$95`, `450 kr`, `EUR 12.5`, and a
header such as "Rate (€/hr)" or "Price (£/lb)". A bare `$` fits any dollar or peso shop (USD, CAD,
MXN, AUD, NZD) and `kr` any of SEK, NOK and DKK. A cell marked in another currency is a row error
and a money column whose header names one is left out, both naming the two currencies; nothing is
converted, since a guessed exchange rate would be an invented price. Codes outside the shop list
(JPY, INR, ...) are still recognised so that they are refused for their currency, and a code in a
header counts only as a whole word beside a bracket, a slash, "per", "in" or the end, so "CAD
programming rate" is not Canadian dollars. Unmarked amounts are read as the shop's currency.

Components:

| Component | Formula |
| --- | --- |
| material (per lb) | blank lb × q × $/lb × (1 + scrap%), at least the material minimum |
| material (per stock) | ceil(q / parts per stock) × $/piece, at least the material minimum |
| material (per ft, bar length set) | ceil(q / floor((bar − remnant) / (blank length + cut allowance))) × bar ft × $/ft, at least the minimum |
| material (per ft, no bar length) | q × (blank length + cut allowance) ft × $/ft × (1 + scrap%), at least the minimum |
| setup | Σ setup min / 60 × setup rate (machine hourly rate unless set) |
| run | Σ cycle min / 60 × hourly rate × q |
| finishing | Σ max(per part × q, lot minimum) |
| extras | Σ per part × q + per lot |
| markup | material × material% + (setup + run + in-house finishing) × labor% + outside finishing × outside% + extras × material% |
| price | max(cost + markup, line minimum); unit = ceil(price / q); total = unit × q |

Estimating aids (suggestions only): `blankFromBoundingBox` (CAD bounding box + stock allowance,
rounded up to 1/8 in) pre-fills the blank when a STEP solid's box was measured with better than low
confidence (never from a DXF, which has no thickness); `suggestRoughingOperation` adds a "Rough from
CAD" operation (volume removed ÷ the machine's measured removal rate) only when exactly one active
machine has a rate and the part volume is not low confidence. Both are ordinary inputs the estimator
edits; the label says where the minutes came from. From a DXF flat pattern,
`suggestCuttingOperation` adds "Cut from DXF" (cut length ÷ the machine's cut speed, plus pierces ×
its pierce seconds; one pierce per closed contour) when exactly one active machine has a cut speed
and neither the outline nor the holes are low confidence, and `suggestBendingOperation` adds "Bend
from DXF" (bend lines × the machine's seconds per bend) when exactly one machine has that rate and
the bend lines came from a bend layer (dashed linetypes alone are low confidence: often hidden
lines). Cut speed depends on material and thickness, which a DXF does not carry: a shop can enter
a speed (and pierce time) per cutting machine and material row in `cut_speeds` (migration 0018; a
material row carries its sheet thickness). When the line's material has rows on active machines,
those machines are the candidates (exactly one must remain) and the row's speed is used, labelled
"(rate for <material>)"; otherwise the machine default applies. The rows import from the shop's cut chart
(`src/shared/cut-speed-import.ts`, the rate-card import's fourth sheet type): machine and material
are matched by name to rows already on the card, never created, and only exact unit factors apply. The label always names the speed
used; minutes round up to the hundredth so a short cut cycle is never rounded away. The
three machine rates are optional rate-card columns (`cut_speed_in_per_min`, `pierce_seconds`,
`seconds_per_bend`, migration 0015) and import/export with the rest of the card. From a STEP solid,
`suggestDrillingOperation` adds "Drill from CAD" (hole locations × the machine's seconds per hole,
`seconds_per_hole`, migration 0016, plus each location's depth at the machine's drill feed in in/min,
`drill_feed_in_per_min`, migration 0019, when the shop entered one) when exactly one machine has
either rate and the holes are not low confidence. The feed is one number per machine rather than a
chart by diameter: feed per revolution grows roughly with diameter while spindle speed falls with it,
so the penetration rate moves much less than either, and the label names the rate used. Material
does move it (stainless or titanium drills at a fraction of aluminum's feed), so the rate card's
"Drill feeds by material" (`drill_feeds`, migration 0023, one row per drilling machine and material,
`PUT/DELETE /rate-card/drill-feeds`) overrides the machine's default feed for a line in that
material: the active machines with a feed for it are the candidates (exactly one must remain), its
seconds per hole still apply, and the label adds "feed for <material>". Both per-material tables (removal
rates and drill feeds) import and export as their own rate-card sheet types
(`src/shared/material-rate-import.ts`, `POST /rate-card/{removal-rates,drill-feeds}/import`), matched
by machine and material name like the cut chart; only exact unit factors apply, and a feed per
revolution is refused rather than converted at an assumed spindle speed. A drilling machine is a
mill or lathe kind or any machine with a seconds per hole or drill feed (`isDrillingMachine`). Holes deeper
than 3× their diameter are counted as deep in the label. When the drilling machine has a peck depth (in drill
diameters, the G83 Q as ×D) and seconds per peck on the rate card (`peck_depth_diameters`,
`seconds_per_peck`, migration 0025), each deep hole adds ceil(depth / (peck × D)) − 1 extra pecks at
that time (`extraPecks`); holes at or under 3×D drill in one plunge. With either value missing the
label only flags deep holes, as before. A location is every full hole cylinder on one axis line (`holeAxes` in
`packages/cad-features`), so a counterbored hole is one cycle, labelled stepped; locations whose
smallest diameter is over 1 in are bores, left out and counted in the label; a DXF's holes are
cut, not drilled. Tapping: STEP rarely carries threads, so the RFQ review lists the drill-sized hole
sizes (`drilledHoleSizes`, by each location's smallest diameter, the tap drill under any
counterbore) and the estimator ticks the threaded ones (`rfq_parts.tapped_hole_diameters_in`,
migration 0020); `suggestTappingOperation` then adds "Tap from CAD" (those locations × the
machine's `seconds_per_tapped_hole`, same migration, an import/export column; a column in minutes is
refused) when exactly one machine has the rate. The tap drill stays in the drilling op, and tapping
on the roughing or drilling machine carries no second setup. A size ticked on an earlier file and
absent from a new one is ignored. On the roughing
machine the drilling operation carries no second setup. A DXF flat pattern also sizes the sheet
blank when the part's material has a sheet thickness on its rate row (`sheet_thickness_in`,
migration 0017, an optional import/export column; a column in mm or gauge is refused, never
converted): `blankFromFlatPattern` takes the flat's overall size, each side rounded up to 1/8 in,
times that thickness, so a per-lb sheet prices by weight like any blank. No nesting margin is added
(the skeleton belongs in the material's scrap %), and a low-confidence size gives no blank.
A material priced per stock piece that is a sheet can carry the sheet's width, length and one nest
gap (between parts and from the sheet edge) on its row (`sheet_width_in`, `sheet_length_in`,
`nest_gap_in`, migration 0031, optional import/export columns; mm or feet refused, never
converted). With all three set, a DXF part's "parts per piece" is pre-filled from a rectangular nest
of the flat pattern's bounding rectangle (`src/shared/nest.ts`, `nestYield`): parts may turn 90°,
and the layout is a guillotine pattern of up to three homogeneous blocks, searched exactly in integer
thousandths. Every counted layout is a real one, so the count is a lower bound on a nesting
program's (true-shape nests of L-shapes or rings fit more) and the price errs high; a
low-confidence size or a row with no gap pre-fills nothing, and the estimator can change it. The parser's flags (units assumed, unsupported
faces, expansion limit) are shown on the RFQ next to the file.

## LLM purposes (all through `ctx.llm`, FakeLlm handlers in each module's `fake-llm.ts`)

| Purpose | Module | Output | Guard |
| --- | --- | --- | --- |
| `rfq.extract` | services/rfq | `llmExtractionSchema` (structured) | `verifyExtraction` |
| `quote.cover_note` | services/quotes | text | `ungroundedNumbers` → template fallback |

Calls are metered into `llm_calls` (tokens, cost, org).

## Tenancy & security

- Tenant routes live under `/api/orgs/:orgId/*` behind `requireOrg()` (404 for non-members).
  Roles: `viewer` < `estimator` (RFQs, quotes) < `admin` (rate card, members) < `owner`.
- Every query on a tenant table filters by `c.var.tenant.orgId`; lookups by id also match `orgId`.
  R2 keys start with `orgs/{orgId}/`; downloads re-check the prefix (the logo's too:
  `services/ratecard/logo.ts` never follows a `logo_key` outside `orgs/{orgId}/logo/`, and
  `PATCH /settings` cannot set it).
- Origin check on state-changing requests; API CSP `default-src 'none'`; downloads are
  `attachment` + `sandbox`. No document contents or prices in logs.
- Invitations are links; only the SHA-256 of the token is stored, the link is shown once, and only
  the invited address can accept.
- Customer links (`services/quotes/customer-link.ts`) are bearer links to one sent quote: 32 random
  bytes, only the SHA-256 stored, revocable per quote, 404 for unknown, malformed or revoked tokens.
  The customer's page gets customer-facing facts only (what the PDF prints), and an answer can only
  pick quantity breaks the sent quote carries. Responses `Referrer-Policy: no-referrer`.

## Endpoint contract

Public / account
- `GET /api/health` → `{ ok, app, email }` (`email`: account mail leaves the Worker); `ALL /api/auth/*` (Better Auth, behind the durable limits in `middleware/auth-rate-limit.ts`); `GET /api/me` → `{ user, memberships: [{ orgId, orgName, orgSlug, role }] }`
- `POST /api/orgs` `{ name }` → `{ orgId }` (201); `GET /api/orgs` → `{ items }`
- `POST /api/invitations/:token/accept` → `{ orgId }`
- `GET /api/quote-links/:token` → `CustomerQuoteDto` (no session; `state` open/accepted/declined/won/lost/expired/superseded; 404 for an unknown or revoked link); `GET /api/quote-links/:token/pdf` (the PDF as sent, hash-checked); `POST /api/quote-links/:token/respond` `{ decision: "accept", name, email?, poNumber?, choices: [{ lineId, quantity }], note? } | { decision: "decline", name, email?, note? }` → `CustomerQuoteDto` (400 for a quantity not quoted, 409 once answered, expired or superseded)

Org (`/api/orgs/:orgId`)
- `GET /` → `{ org, role, settings }`; `PATCH /settings` (admin); `GET /settings/logo` (any member: the stored PNG/JPEG, `nosniff`, 404 when none); `PUT /settings/logo` (admin; the raw image as the body, at most 1 MB and 4 megapixels, PNG or JPEG decided by its bytes, 8-bit PNG only; 400 with the reason, 411 without a Content-Length, 413 over 1 MB) → `ShopSettingsDto`; `DELETE /settings/logo` (admin) → `ShopSettingsDto`. `settings.hasLogo` says one is set; the R2 key never leaves the Worker
- `GET /members`; `GET|POST /members/invitations` (admin; POST → `{ id, email, role, token, acceptUrl }`); `DELETE /members/invitations/:id`; `PATCH /members/:memberId` `{ role }`; `DELETE /members/:memberId`
- `GET /rate-card` → `RateCardDto`; `POST /rate-card/machines`, `PATCH /rate-card/machines/:id`; `POST /rate-card/materials`, `PUT /rate-card/materials/:id`; `POST /rate-card/finishing-ops`, `PATCH /rate-card/finishing-ops/:id`; `DELETE /rate-card/{machines|materials|finishing-ops}/:id` (retires: `active = false`). All writes admin.
- `GET /rfqs?status=`; `POST /rfqs` (JSON `{ subject?, bodyText }` or multipart `subject`, `bodyText`, `files[]`) → `RfqDetailDto` (201); `GET /rfqs/:id`; `PATCH /rfqs/:id`; `POST /rfqs/:id/files` (multipart); `GET /rfqs/:id/files/:fileId/download`; `POST /rfqs/:id/files/:fileId/measure` (a STEP/DXF over 1 MB, stored unmeasured at upload: `geometryPending`); `POST /rfqs/:id/extract`; `POST /rfqs/:id/parts`; `PATCH /rfqs/:id/parts/:partId`; `DELETE /rfqs/:id/parts/:partId`
- `GET /quotes?status=`; `GET /quotes/stats` → `QuoteStatsDto`; `POST /quotes` `{ rfqId?, customerCompany? }` (201; needs ≥1 confirmed part); `GET|PATCH /quotes/:id`; `POST /quotes/:id/lines`; `PATCH|DELETE /quotes/:id/lines/:lineId` (PATCH also takes `routingIds`, at most 20, unknown ids dropped); `GET /quotes/:id/lines/:lineId/history` → `PartHistoryDto` (earlier quotes of the same part number, any status, newest first, at most 10); `POST /quotes/:id/lines/:lineId/copy-from` `{ sourceLineId }` (copies that line's cost inputs, keeps this line's quantities, prices from today's card; same shop only, 404 otherwise); `POST /quotes/:id/recalculate`; `POST /quotes/:id/cover-note`; `POST /quotes/:id/send` (a revision also marks the quote it replaces `superseded`); `POST /quotes/:id/revise` → `QuoteDetailDto` (201; a new draft "Rev N+1" of a sent, lost or expired quote, or the revision already started; 409 for drafts and won quotes); `GET /quotes/:id/changes[?from=<quoteId>]` → `QuoteChangesDto` (from the revision this one replaces, or another revision of the same quote number; 409 on an original, 400 for a different quote number, 404 across shops; viewers may read); `GET /quotes/:id/revisions` → `QuoteRevisionsDto` (every revision of the quote number, oldest first; 404 across shops); `PATCH /quotes/:id` also takes `showChangesOnPdf` (drafts); `POST /quotes/:id/outcome` (409 on a superseded quote) `{ outcome: "won", poNumber?, wonAmountCents? } | { outcome: "lost", reason? } | { outcome: "expired" }`; `GET /quotes/:id/pdf`; `GET /quotes/:id/traveler.pdf[?due=YYYY-MM-DD&qty.<lineId>=N]` (job traveler for the floor, no prices; won quotes only, 409 otherwise; 400 naming the part when a multi-break line has no quantity, for a bad date or quantity, or a line not on the quote; viewers may print; 404 across shops); `GET /quotes/:id/emails` → `QuoteEmailsDto` (history newest first, prefills, `canDeliver`); `GET|POST|DELETE /quotes/:id/customer-links` → `CustomerLinksDto` (POST, estimator, 201: `{ url, links }`, the URL shown once, open sent quotes only; DELETE turns every link of the quote off); `POST /quotes/:id/email` `{ to, message, copyMe?, customerLink? }` → `QuoteEmailDto` (201; estimator with a confirmed address; open sent quotes only, 409 otherwise; the stored PDF checked against its SHA-256; 1-5 recipients; 429 past 30 a shop an hour or 5 a quote a day; 502 when the provider refuses, with the failed row recorded; docs/EMAIL.md)
- `GET /routings` → `{ items: RoutingDto[] }` (viewer; machine and finishing names from today's card, retired flagged); `POST /routings` `{ name, partFamily?, operations (1-30), finishing? }` (201; 400 for an id not on this shop's card, 409 for a name already used or past 200); `PATCH /routings/:id` (any create field, plus optional `ifUpdatedAt`: the `updatedAt` the editor loaded; 409 when the stored one differs, so a concurrent edit is refused rather than overwritten); `DELETE /routings/:id`; `GET /routings/suggestions?materialId=&description=&lineId=` → `RoutingSuggestionsDto` (viewer; at most 3, each with its evidence counts and matched words; 400 for unknown keys)
- `GET /quickbooks` → `QuickBooksStatusDto` (any member); `POST /quickbooks/connect` → `{ url }` (admin; Intuit's consent page, a single-use state); `DELETE /quickbooks` (admin; revokes and forgets the tokens). `GET /quickbooks/items` → `QuickBooksItemsDto` and `PUT /quickbooks/item` `{ itemId | null }` (admin; the shop's own invoice item, checked live, tied to the connected company). `GET /quotes/:id/quickbooks` → `QuoteQuickBooksDto` (viewer: the invoice once sent, else its number, memo and the online acceptance); `POST /quotes/:id/quickbooks` `{ choices: [{ lineId, quantity }] }` (estimator; won quotes only, 409 otherwise, unconnected or already sent; 400 naming a multi-break part with no pick or a quantity not quoted; 409 when the company's home currency is not the shop's; 404 across shops). `GET /api/integrations/quickbooks/callback` (Intuit's redirect; the state must be the signed-in admin's). docs/QUICKBOOKS.md
- `POST /costing/preview` `{ inputs }` → `{ ok: true, result } | { ok: false, issues }`

Writes on RFQs and quotes need `estimator`; drafts only (409 once sent).

## Testing

- `pnpm test:unit`: costing engine (hand-computed breaks, minimums, stock pieces, markup split,
  every blocking issue), extraction verification (fabricated values dropped), FakeLlm handlers,
  cover-note grounding, PDF structure.
- `pnpm test:worker`: RFQ intake → extraction → review → quote → send → outcome through the API;
  invented values dropped; geometry port; role checks; cross-tenant isolation for every router.
- `pnpm demo`: the app offline (fake LLM, no keys) at http://localhost:5199.
