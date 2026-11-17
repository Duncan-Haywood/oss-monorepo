---
kind: polish
topics: [design, seo]
date: 2026-11-17
---
# Polish 2026-11-17: 18 tools out of "Marketplace seller tools" (breadcrumbs and category pages)

Date: 2026-11-17. Track: polish/0. Picked item 3 of "Still weakest" in
`polish-2026-11-17-h1-90.md` ("Odd breadcrumb category: the driving-school page's breadcrumb reads
'Marketplace seller tools'"). Open PRs searched (`list_pull_requests`, open, 50): none touch
`categoryFor`, `CATEGORY_RULES` or breadcrumbs.

## What was wrong

The marketplace rule in `platform/pages/build.mjs` (`CATEGORY_RULES`, id `marketplace`) is a slug
regex. Between 2026-10-08 and 2026-10-12, 18 tools were added to it that are not marketplace tools.
The comments in the `services` rule give the reason: "filed here because the back-office bundle is
over the 3 MB ceiling". That is, they were parked where there was room in the offline bundle. The
comments for five of them sat in the `services` block while their slugs went into the marketplace
regex, so the code said one thing and the comments said another.

The category reaches a visitor in four places, all from `categoryFor`:

- the visible breadcrumb at the top of the page, the first link a phone reader sees;
- the `BreadcrumbList` JSON-LD, which search results show as "Maris Stella Labs › Marketplace
  seller tools › …";
- the category page `/c/marketplace/`, where a barbershop owner had to read past the eBay fee
  calculators;
- the category's offline bundle and share-card tint.

Measured on the built site (Playwright at 390 px, `driving-school-profit-calculator`):

| | before | after |
|---|---|---|
| Visible breadcrumb | Marketplace seller tools › Driving School Profit Calculator | Service business pricing & quotes › Driving School Profit Calculator |
| `BreadcrumbList` item 2 on the 18 pages | "Marketplace seller tools" (18 of 18) | Services (11), Back-office (7) |
| Tools in `marketplace` | 118 | 100 |

## What changed

- **To `services`** (Service business pricing & quotes): axe-throwing bar, tournament pairing
  manager, tailor/alterations, shoe repair, phone repair, barbershop chair, driving school, braiding
  studio, esthetician studio, lash studio, bail bond agency exposure.
- **To `backoffice`** (Back-office money & contracts): payment processor fee comparison, severance
  package, commercial lease abstract reader, vendor contract clause reader, business insurance policy
  reader, workers' comp audit dispute checker, percentage rent audit checker. The ceiling that pushed
  them out is now 4 MiB, and the UK tax tools left for `uk-tax` on 2026-10-17, so there is room.
- The five stale "filed here because the back-office bundle is over the 3 MB ceiling" comments in
  the `services` block are gone. A comment at the new `backoffice` match says why the tools moved.
- `build.test.mjs`: eight of the moved slugs join the placements table, and a new test, "no shop,
  studio or salon profit calculator is filed as a marketplace seller tool", catches the pattern by
  slug shape (`-(shop|studio|chair|school|salon|bar)-(service-)?profit-calculator`).

## Offline bundle sizes after the move (gzipped, full build, bound is 4 MiB = 4,194,304 bytes)

| category | bytes | MiB |
|---|---|---|
| backoffice | 4,104,534 | 3.914 |
| evidence | 3,954,475 | 3.771 |
| services | 3,670,027 | 3.500 |
| ci | 3,349,177 | 3.194 |
| marketplace | 2,563,894 | 2.445 |

`backoffice` has about 88 KiB of headroom, roughly five more tools at the moved readers' 13 to 20 KiB
each.

## Still weakest, and what I would do next

1. **`services` holds about 24 household tax, retirement and legal tools** that no service business
   prices: 401k-loan-vs-withdrawal, 529-to-roth-rollover, qcd, niit, fbar-8938, nanny-tax,
   medicaid-lookback, injury-settlement-net-proceeds, h1b-weighted-lottery-odds, gift-vs-inherit-basis,
   nua-employer-stock, real-estate-professional-status, bonus-take-home-gross-up and others (list them
   with `categoryFor` over `ventures/`). They were parked for the same bundle reason. They want their
   own section ("Personal tax & retirement" or similar). That means a category page, a share card and
   a placements entry, and `rsu-tax-calculator`, `unemployment-benefits-calculator` and
   `job-offer-comparison-calculator` could come out of the catch-all (`more`) into it as well.
2. **`backoffice` is 88 KiB under its bound.** The next few back-office tools will hit it. Split it
   (contracts and leases apart from cash and fees) rather than parking tools elsewhere again; the
   new test catches only the shop/studio shape.
3. **The `trades` block still carries comments for the shop and studio calculators** ("joined
   2026-10-11 … beside nail-tech-booth-rent") that were never in its regex. They are harmless but
   misleading; move them to `services` when that block is next edited.
4. Carried over from `polish-2026-11-17-h1-90.md`: item 1 (59 h1s of 81 to 90 characters) and item 2
   (lower `MAX_H1_PX[390]` to 160).
