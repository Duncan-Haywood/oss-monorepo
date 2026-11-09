# Clothing Design Studio

**Say what you want on the shirt. See it, change it, know what it costs.**
A free, open-source (MIT) browser studio for independent clothing designers:
design a tee, long-sleeve, sweatshirt or hoodie by talking, typing or dragging,
compare three versions, cost every piece from your manufacturer's prices, and
download a tech pack and quote request to send them.

Live: https://marisstella.app/clothing-design-studio/

## Why someone would use it

A designer starting a line has three jobs before the first order: decide what
the garment looks like, find out what it costs to make and sell, and tell a
factory exactly what to make. Today that is usually three tools:

| Today | What it does well | What it leaves out |
|---|---|---|
| Professional 3D garment suites (CLO 3D, Browzwear) | Patterns, grading, fit on an avatar | Paid, and more than a graphic-led line needs; no costing or launch |
| Print-on-demand mockup makers (Printful, Printify) | Mockups on their own blanks, they print and ship | Their prices and blanks, not your manufacturer's; no tech pack |
| Graphic tools (Canva, Kittl) plus a spreadsheet | Artwork | No garment, fabric, method or cost model |

This studio does the part between: a designer who is not a pattern-maker or a
spreadsheet person can say "make it cream, add a halo, embroider it in 3D" and
see it, know the landed cost and break-even from their own supplier's quote,
and send a tech pack. Free, nothing uploaded. (Products named only to describe
what this tool is and is not; not affiliated with, endorsed or sponsored by
any of them. Names are trademarks of their owners.)

## Run it

It is a static page with ES modules and no build step:

```
cd ventures/clothing-design-studio
python3 -m http.server 8000      # then open http://localhost:8000
node --test *.test.mjs           # tests
```

## Optional AI

The command box needs no AI. To understand freer speech, pick a provider in
the page's last section: your own Anthropic, OpenAI or Gemini key, or a model
running on your own computer (Ollama, LM Studio, llama.cpp). The model only
rewrites what you said into the studio's own commands, which then go through
the same parser and rules (`ai.mjs`), so it cannot do anything a typed command
could not. The key stays in your browser unless you tick "remember", and then
only in this browser's local storage. `byok.mjs` is a synced copy of
`platform/llm/byok.mjs`; a test fails if they drift.

## Files

| File | What |
|---|---|
| `catalogue.mjs` | Garments (to scale), print areas, fabrics, methods, colours, compatibility notes |
| `design.mjs` | The design model, every edit as an operation, undo, three variants, share links |
| `commands.mjs` | Spoken or typed sentences to operations, no model |
| `ai.mjs` | Optional model that rewrites free speech into commands |
| `render.mjs`, `motifs.mjs` | SVG drawing; original motifs; public-domain image sources |
| `runcost.mjs` | A whole size run costed: cloth by size, metres to buy, blended cost |
| `suppliers.mjs` | Supplier sheet, CSV in and out, example placeholder sheet |
| `costing.mjs` | Landed cost, margin, break-even, target price, quantity breaks |
| `techpack.mjs` | Tech pack and quote request |
| `launchkit.mjs` | Description, captions, hashtags, store CSV |
| `eyewear.mjs`, `sunglasses.html` | Sunglasses: stock frame, size, logos, case, cost, quote request |
| `wardrobe.mjs`, `wardrobe.html` | Capsule wardrobe from a profile, outfit count, first drop within a budget |
| `camera.mjs`, `camera.html` | Photo and live-camera try-on: tap two shoulders, the garment outline in the chosen size is scaled (shoulder span over the body model's shoulder width) and rotated onto the picture; on-device, no pose model |
| `fit.mjs`, `fit.html` | Size from body measurements with ease per size; size run for a quantity from the audience chest curve; typical size chart, replaceable by the factory's |
| `markets.mjs`, `prices.html` | One margin target to a shelf price per market (EU/UK VAT included, US before sales tax), price endings, the real margin at the rounded price. VAT rates are standard rates cross-checked against commercial 2026 tables on 2026-11-05 (not the Commission's own table, unreachable), editable |
| `duty.mjs`, `duty.html` | Landed cost into the US, EU and UK: duty on the right customs value (US factory price only; EU and UK factory price plus freight and insurance), extra-tariff field, zero-duty least-developed-country origins only with an origin proof, import VAT shown apart, freight per garment. Duty rates for four knitted garment types are typed from memory and unchecked (official tariff sites blocked from the build host, 2026-11-06); hand-worked tests only |
| `labels.mjs`, `labels.html` | Fibre-content label wording for the EU (8 languages) and US, checklist of other required label items, starting care text |
| `caresymbols.mjs` | The five care symbols (wash, bleach, tumble dry, iron, professional care) drawn as SVG from the starting care text, shown on the label page and downloadable one file each |
| `commission.mjs`, `partners.html` | Multi-brand shop money: payout per sale after VAT, commission and card fees (shop, brand or split), shelf price for a target payout, settlement statement per partner with refunds, per-partner terms, CSV. Seller-of-record and VAT treatment are assumptions to check with an accountant |
| `marketing.mjs` | Ad affordability (break-even cost per sale and ROAS) and a launch calendar of drafts from the break-even |
| `usage.mjs` | Anonymous local usage counts |

Roadmap: [`ROADMAP.md`](ROADMAP.md).

## Privacy

Everything runs in your browser. Designs, images and prices are saved in this
browser's local storage and never uploaded; there are no accounts, tracking
cookies or analytics vendor. Speaking uses the browser's own speech
recognition, which in Chrome and Edge sends audio to the browser maker (the
page asks first). With an AI provider chosen, your command text and a
one-line summary of the design go to that provider. Anonymous counts of which
features are used stay in your browser and can be turned off.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not legal, tax, financial, manufacturing or
intellectual-property advice, and it does not replace a qualified
professional. **You are responsible for reviewing and verifying its output
before relying on it**, including the rights to any artwork you use, and for
meeting any obligation it helps you prepare for. To the maximum extent
permitted by law, the authors accept no liability for any loss or damage
arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be
slow, broken, moved, or taken offline without notice. We do not promise
uptime, backups of anything you type, or that a URL will keep working. Do not
use this as a system of record. If a tool needs to survive, export your inputs
and run it yourself.

MIT licence: [`LICENSE`](LICENSE). Sponsor: https://github.com/sponsors/Duncan-Haywood


## Turntable preview (2026-11-04)

`turntable.mjs` turns the design about its vertical axis on the studio page ("Turn the garment": a slider and a spin button). It is an approximation, the drawing squeezed by cos(angle) and shaded across its width, showing the back artwork past 90 degrees; it has no drape, seams or sleeves, so it is not a fit check. Checked by `turntable.test.mjs` (side switching, wrap-around, escaping) and a headless-browser run of the page with no console errors. The WebGL/WebXR garment is still the next step in `ROADMAP.md`.

## Storefront (2026-11-04)

`storefront.mjs` turns a design into one static HTML shop page: front and back
drawings, size picker, schema.org Product data with price and pre-order
availability, no scripts from other sites, no trackers. Checkout is off by
default (order-by-email); the deployer's own https payment link becomes the Buy
button. Shipping and returns text appear only if typed; missing terms come back
as `warnings`, never invented. Payment, tax, delivery and consumer-law
obligations stay with the seller. Tested in `storefront.test.mjs` (escaping,
`javascript:` links dropped, JSON-LD cannot close its script) and checked in a
real browser. Next: several designs per shop, a real deploy by a real designer.


## 3D garment preview (2026-11-04)

`garment3d.mjs` (pure geometry, tested in Node) and `viewer3d.mjs` (WebGL1, no
libraries) add a "3D garment (preview)" panel to the studio. The flat outline is
laid over with a grid; cells inside become a front and a back surface that meet
at the outline, pushed out by a quarter-ellipse of the distance from the edge
(58 units thick over 105) and smoothed. The front drawing maps on the front and
the back drawing on the back, so artwork turns with the garment. Drag to turn,
scroll to zoom, arrow keys, optional spin. Honest limits: it is a rounded solid,
not cloth: no drape, seams, gathers or true sleeve tubes, so it is not a fit check.
Checked by `garment3d.test.mjs` (edge distance, profile, mesh closes at the edge,
normals, mirrored back, camera maths) and a headless-Chromium run (swiftshader)
that drew the tee with its artwork, turned it by dragging, and logged no console
errors. Next: a body model for fit and try-on, WebXR, cloth drape.

## Try-on from tape measurements (2026-11-04)

`tryon.mjs` draws the recommended size over a body built from the shopper's
chest, waist, hip and height, as a front-view SVG on `fit.html` ("Try it on").
Each level is an ellipse of the measured circumference (Ramanujan's formula
turns it into a front-view width, so the drawing is to scale across); vertical
landmarks are average proportions of standing height (about +-3 cm on a real
body). It reports ease at the chest, the waist and the hem against the hips
(a hem narrower than the hips is flagged as riding up) and where the hem lands
(cropped, at the hip, covers the hips, long). The cut is assumed straight; a
ribbed or tapered hem is replaced by the factory's hem width. Missing waist,
hip or height are assumed and listed. Geometry only: no drape, stretch or
camera, so it is not a promise of fit. Checked by `tryon.test.mjs` (ellipse
width, ease, hem word by height, assumed inputs, refusals, SVG sanity) and a
headless-Chromium run with no console errors. Next: arms and sleeve length
from arm measurements, a side view, then WebXR and a camera-based view on device.

## Halftone film for screen print (2026-11-04)

`halftone.mjs` turns the tone of one ink layer into round dots on a rotated grid,
as an SVG film in millimetres. Tone comes from luminance between the ink and the
garment colour; each dot's area is the mean tone under its grid cell (a dot stops
growing at 78.5% of a cell, where circles touch). `screenAngles(n)` gives
moire-safe angles (15/75/0/45 for four inks, even spacing otherwise).
`checkScreen` applies two rules of thumb: mesh about 4 to 5 times the lpi (230 mesh
holds about 51 lpi), and dots under about 10% or over about 90% usually do not hold.
Highlights under `minDotPct` (default 5%) are cut and counted. Rules of thumb,
not a printer's word: strike a test first. Checked by `halftone.test.mjs`
(flat 50% grey covers 50% +- 6, gradient grows dots toward dark, cut-off, bounds
on a 30 degree grid, determinism, escaping). Wired into the studio page 2026-11-04 as `singleInkFilm(sep, ...)`: the separation's palette lightness against the garment sets each region's dot size, so a painting prints as one ink in several tones on one screen ("Download one-ink halftone film", with lpi, mesh and ink fields; a contrasting ink is picked until you choose one, and ink too close to the garment warns). Checked by `halftone.test.mjs` and a headless-Chromium download (3,068 dots from a test card, no console errors). Per-ink halftones of separated spot colours are not offered: a flat ink has one tone. Next: a real painting through a real printer.
- 2026-11-05: `marker.mjs` and a "Cutting plan" block on `fit.html`: pattern pieces per size packed onto the fabric width (grain-aligned rectangles, first-fit-decreasing shelves), lays x plies within the ply limit and table length, spares counted as cloth. `node --test marker.test.mjs`. Rectangles, so cautious against a factory's CAD marker.

- 2026-11-06: `salestax.mjs`, `salestax.html`: US economic-nexus check by state (sales and order thresholds, "and"/"or" rules as in New York, planned sales that will cross, tax on later sales at the base rate, clothing exemptions as a note). 24 states, thresholds, rates and clothing rules typed from memory, unchecked, all overridable; local taxes and marketplace sales left out. `node --test salestax.test.mjs`. Next: check each state against its revenue department.
- 2026-11-07: `camera.mjs` and `camera.html`: photo or live-camera try-on. Two taps on the shoulders set scale and tilt; the `tryOn` outline (neck, shoulder, chest, hem) is drawn to scale over the picture with ease and hem/sleeve words. `node --test camera.test.mjs` (hand-computed scale, hem drop, tilt, bad taps) and a headless-Chromium run of both paths (file upload; fake camera device, freeze frame): no page errors. Unproven: a real photo of a real person, where perspective and posture skew the scale; no pose model, no drape.
- 2026-11-08: `orderlines.mjs`, `orderlines.html`: colour x size order matrix with a per-colour minimum check, spares and a PO CSV. `node --test orderlines.test.mjs`. Arithmetic on typed shares; no real factory order.
- 2026-11-08: `salestax.mjs` now covers every state with a sales tax plus DC (47 entries: 46 states and DC; the other 23 states added from memory, same unchecked label; the build host still cannot reach any revenue department site). Still to do: check each state against its own page; local taxes.
- 2026-11-09: `salestax.mjs`: Illinois (200-order test dropped 2026-01-01), Kentucky (2026-08-01, HB 757), Utah (2025-07-01) and Alaska (2025-01-01) are now sales-only, from web search results citing Avalara (Apr 2026) and Taxually (Oct 2026); the revenue-department sites are still unreachable from the build host. Maine is listed as dropped by one source and left as typed. Test in `salestax.test.mjs`. Other states remain from memory.
