---
kind: polish
topics: [design, accessibility]
date: 2026-11-20
---
# Polish 2026-11-20: long single-item eyebrows fit one line at 390 px

Follows item 1 of `polish-2026-11-20-two-item-eyebrows.md` ("Long single-item eyebrows").

## What changed

- 47 `ventures/*/index.html` hero eyebrows shortened to at most 39 characters (full list below).
- `platform/pages/flagship-hero-order.test.mjs`: `EYEBROW_MAX_CHARS = 39` and `eyebrowText()`;
  the venture-eyebrow test now fails an eyebrow over 39 characters (entities count as one).
  On main it fails for the 47 pages; with this change it passes.

## Measured

Chromium (Playwright) over the source `ventures/<slug>/index.html` at 390×844 and 320×844; lines =
distinct line-box tops (`Range.getClientRects`) of the first `p.eyebrow`.

| Width | Eyebrows on 2+ lines (of 184) before → after | 3-line before → after | Sum of eyebrow lines before → after |
|---|---|---|---|
| 390 | 47 → 0 | 0 → 0 | 231 → 184 |
| 320 | 100 → 93 | 7 → 0 | 291 → 277 |

Cap choice: at 390, every eyebrow of ≤38 characters was one line; at 39 characters 3 of 11 wrapped
(egress-window, french-drain, retaining-wall: 12.8 px capitals with W/M/D). Those three were cut too.
39 is a guard, not a guarantee: near the cap, measure.

h1 top at 390: assembly-line-balancer 75 → 57 px, gig-driver-net-pay-calculator 76 → 57 px.
Screenshots: `img/polish-long-eyebrows-{before,after}-{assembly-line-balancer,gig-driver-net-pay-calculator}-390.png`.

## Rewrites

```
  assembly-line-balancer: FOR MANUFACTURING, INDUSTRIAL AND LEAN ENGINEERS, PLANT MANAGERS AND STUDENTS  ->  FOR MANUFACTURING AND LEAN ENGINEERS
  job-shop-scheduler: FOR PRODUCTION PLANNERS, MACHINE SHOPS, OPERATIONS ENGINEERS AND STUDENTS  ->  FOR PRODUCTION PLANNERS AND JOB SHOPS
  elevator-traffic-analysis: FOR ARCHITECTS, BUILDING SERVICES ENGINEERS, DEVELOPERS AND STUDENTS  ->  FOR ARCHITECTS AND BUILDING ENGINEERS
  continuous-beam-calculator: FOR BUILDERS, DECK AND FRAMING CONTRACTORS, DESIGNERS AND STUDENTS  ->  FOR BUILDERS, DECK AND FRAMING CREWS
  rebar-schedule: FOR SITE ENGINEERS, REBAR DETAILERS, FIXERS AND SMALL CONTRACTORS  ->  FOR SITE ENGINEERS AND REBAR DETAILERS
  forestry-mulching-bid-calculator: FOR OWNER-OPERATORS BIDDING FORESTRY MULCHING AND LAND CLEARING  ->  FOR FORESTRY MULCHING OWNER-OPERATORS
  formwork-pressure: FOR CONCRETE CONTRACTORS, FORMWORK FOREMEN AND SITE ENGINEERS  ->  FOR CONCRETE AND FORMWORK CONTRACTORS
  ifta-quarterly-fuel-tax-calculator: FOR SMALL CARRIERS AND OWNER-OPERATORS FILING THEIR OWN IFTA  ->  FOR CARRIERS FILING THEIR OWN IFTA
  concrete-maturity: FOR CONCRETE CONTRACTORS, QC TECHNICIANS AND SITE ENGINEERS  ->  FOR CONCRETE CONTRACTORS AND QC TECHS
  stair-lift-bid-calculator: FOR ACCESSIBILITY CONTRACTORS AND AGING-IN-PLACE REMODELERS  ->  FOR AGING-IN-PLACE CONTRACTORS
  drone-mapping-job-calculator: FOR PART 107 PILOTS QUOTING AERIAL MAPPING AND SURVEY WORK  ->  FOR PART 107 MAPPING AND SURVEY PILOTS
  str-occupancy-tax-calculator: FOR SHORT-TERM RENTAL HOSTS FILING THEIR OWN OCCUPANCY TAX  ->  FOR RENTAL HOSTS FILING OCCUPANCY TAX
  sprinkler-hydraulic-calc: FOR SPRINKLER FITTERS, DESIGNERS, ESTIMATORS AND STUDENTS  ->  FOR SPRINKLER FITTERS AND DESIGNERS
  certified-payroll-calculator: FOR DAVIS-BACON / PREVAILING-WAGE GOVERNMENT CONTRACTORS  ->  FOR DAVIS-BACON / PREVAILING-WAGE JOBS
  tip-pool-compliance-calculator: FOR RESTAURANT & BAR OWNERS RUNNING A MANDATORY TIP POOL  ->  FOR RESTAURANTS RUNNING A TIP POOL
  gig-driver-net-pay-calculator: FOR DOORDASH, UBER EATS, INSTACART, UBER & LYFT DRIVERS  ->  FOR DELIVERY AND RIDESHARE DRIVERS
  where-to-sell-calculator: FOR PEOPLE SELLING THE SAME ITEM IN MORE THAN ONE PLACE  ->  FOR SELLING ONE ITEM IN SEVERAL PLACES
  employee-cost-calculator: FOR SMALL BUSINESS OWNERS DECIDING HOW TO STAFF A ROLE  ->  FOR OWNERS DECIDING HOW TO STAFF A ROLE
  osha-trir-dart-calculator: FOR EHS COORDINATORS, SAFETY MANAGERS AND CONTRACTORS  ->  FOR EHS AND SAFETY MANAGERS
  parcel-dim-weight-calculator: FOR ONLINE SELLERS, MAKERS AND ANYONE WHO SHIPS BOXES  ->  FOR ONLINE SELLERS AND ANYONE WHO SHIPS
  water-supply-sizing: FOR PLUMBERS, BUILDERS, DESIGNERS AND CURIOUS OWNERS  ->  FOR PLUMBERS, BUILDERS AND OWNERS
  earthwork-cut-fill: FOR SITE-WORK CONTRACTORS, ESTIMATORS AND BUILDERS  ->  FOR SITE-WORK CREWS AND ESTIMATORS
  walk-in-tub-bid-calculator: FOR BATH REMODELERS AND ACCESSIBILITY CONTRACTORS  ->  FOR BATH AND ACCESSIBILITY REMODELERS
  staffing-markup-calculator: FOR INDEPENDENT STAFFING AGENCIES AND RECRUITERS  ->  FOR INDEPENDENT STAFFING AGENCIES
  standby-generator-bid-calculator: FOR ELECTRICAL CONTRACTORS AND GENERATOR DEALERS  ->  FOR ELECTRICIANS AND GENERATOR DEALERS
  sunroom-bid-calculator: FOR SUNROOM, THREE-SEASON, AND FOUR-SEASON CREWS  ->  FOR SUNROOM AND THREE-SEASON CREWS
  interview-content-studio: Interview Content Studio · runs in your browser  ->  Interview Studio · runs in your browser
  menu-engineering-calculator: FOR INDEPENDENT RESTAURANTS, CAFES AND KITCHENS  ->  FOR INDEPENDENT RESTAURANTS AND CAFES
  bounce-house-rental-calculator: FOR INFLATABLE & BOUNCE HOUSE RENTAL COMPANIES  ->  FOR INFLATABLE RENTAL COMPANIES
  dental-ppo-writeoff-calculator: FOR DENTAL PRACTICE OWNERS AND OFFICE MANAGERS  ->  FOR DENTAL OWNERS AND OFFICE MANAGERS
  auto-glass-bid-calculator: FOR MOBILE AND IN-SHOP AUTO GLASS TECHNICIANS  ->  FOR MOBILE AND SHOP AUTO GLASS TECHS
  hvac-load-calc: FOR HOMEOWNERS, BUILDERS AND HVAC CONTRACTORS  ->  FOR HOMEOWNERS AND HVAC CONTRACTORS
  appliance-repair-quote-calculator: FOR INDEPENDENT APPLIANCE REPAIR TECHNICIANS  ->  FOR INDEPENDENT APPLIANCE REPAIR TECHS
  metal-roof-bid-calculator: FOR STANDING-SEAM AND EXPOSED-FASTENER CREWS  ->  FOR STANDING-SEAM METAL ROOF CREWS
  pool-plaster-bid-calculator: FOR POOL PLASTER AND RESURFACING CONTRACTORS  ->  FOR POOL PLASTER AND RESURFACING CREWS
  pressure-washing-bid-calculator: FOR PRESSURE WASHING & SOFT-WASH CONTRACTORS  ->  FOR PRESSURE AND SOFT-WASH CONTRACTORS
  screened-porch-bid-calculator: FOR PORCH, LANAI, AND SCREEN-ENCLOSURE CREWS  ->  FOR PORCH AND SCREEN-ENCLOSURE CREWS
  shed-install-bid-calculator: FOR SHED DEALERS AND BACKYARD-BUILDING CREWS  ->  FOR SHED DEALERS AND BACKYARD CREWS
  pour-cost-calculator: FOR BARS, RESTAURANTS AND BEVERAGE PROGRAMS  ->  FOR BARS AND BEVERAGE PROGRAMS
  estate-sale-net-proceeds-calculator: FOR FAMILIES HIRING AN ESTATE SALE COMPANY  ->  FOR FAMILIES HIRING ESTATE SALE FIRMS
  home-elevator-bid-calculator: FOR ACCESSIBILITY AND ELEVATOR CONTRACTORS  ->  FOR HOME ELEVATOR CONTRACTORS
  hood-cleaning-bid-calculator: FOR KITCHEN EXHAUST CLEANING CONTRACTORS  ->  FOR KITCHEN EXHAUST HOOD CLEANERS
  irrigation-install-bid-calculator: FOR IRRIGATION AND LANDSCAPE CONTRACTORS  ->  FOR IRRIGATION AND LANDSCAPE CREWS
  water-heater-bid-calculator: FOR PLUMBERS AND WATER-HEATER INSTALLERS  ->  FOR PLUMBERS INSTALLING WATER HEATERS
  egress-window-bid-calculator: FOR FOUNDATION AND BASEMENT CONTRACTORS  ->  FOR FOUNDATION AND BASEMENT CREWS
  french-drain-bid-calculator: FOR DRAINAGE AND EXCAVATION CONTRACTORS  ->  FOR DRAINAGE AND EXCAVATION CREWS
  retaining-wall-bid-calculator: FOR HARDSCAPE AND LANDSCAPE CONTRACTORS  ->  FOR HARDSCAPE AND LANDSCAPE CREWS
```

Checked with grep: the gig-driver page still names DoorDash, Instacart and Lyft in its body, but on
most pages the dropped audiences (students, plant managers, estimators, fixers, developers,
builders) appeared only in the eyebrow and are now not named on the page. No factual claim changed.
If one of those audiences matters for a page, add it to the lede rather than the eyebrow.

## Still weakest, and what I would do next

1. **320 px**: 93 of 184 eyebrows still take two lines. A ~30-character cap would start cutting
   trade names; try instead a `@media (max-width: 360px)` eyebrow at 0.72rem / 0.06em tracking on
   the shared bid-calculator template and measure readability before and after.
2. Carried over from `polish-2026-11-20-two-item-eyebrows.md`: ai-bookkeeper's jump chips (three
   rows at 390), and `polish-2026-11-19-short-ledes.md` items 1, 2 and 4.
