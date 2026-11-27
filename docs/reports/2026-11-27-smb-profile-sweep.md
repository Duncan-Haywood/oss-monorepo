---
kind: brief
topics: [monetization, bets, smb]
date: 2026-11-27
title: SMB owner-profile sweep, 29 profiles and the suites they point to
description: Four web-research passes over 29 small-business owner profiles (home services, health and personal services, professional services, food, retail, logistics and small manufacturing), with the candidates worth adding to bets.md.
---

# SMB owner-profile sweep (2026-11-27)

Owner, 2026-11-27: "do we have more items that are viable. finding wide array
of smb owner profiles and targeting product suites to them for all of the most
common problems they have."

This builds on [`portfolio/smb/VERTICALS.md`](../../portfolio/smb/VERTICALS.md)
(18 regional verticals, 2026-11-24), which maps the problems. This pass asks
a different question: **which of those owners would pay us a monthly fee
soon, for a product we can build on what already exists?** The candidates it
turned up are listed in [`bets.md`](../../portfolio/monetization/bets.md),
"Candidates from the 2026-11-27 sweep".

## How sure this is

- Four research agents, one per segment, used web search and page fetches on
  2026-11-27. Every factual line below carries the link it came from. Scores
  (1–5, the same WTP / Size / Dist / Margin / Time rubric as `bets.md`) are
  the researchers' judgment.
- **Establishment counts are secondary.** `api.census.gov`, `www2.census.gov`
  and vantainsights.com were blocked by this session's proxy, so
  `portfolio/smb/cbp_counts.py` could not run. Counts come from sites that say
  they reproduce Census County Business Patterns 2023 (mostly
  vantainsights.com via search snippets, naicscodes.org). Re-read them with
  `cbp_counts.py` from a session that can reach www2.census.gov before any
  figure goes on a page.
- Prices from Capterra, G2, GetApp and similar sites are marked
  (aggregator). Re-check on the vendor's page before pricing against one.
- No customer was interviewed. Owner-forum evidence was thin for several
  profiles (noted per profile).

## What the sweep found, across segments

1. **Generic scheduling, CRM and POS are saturated everywhere.** Jobber,
   Housecall Pro and ServiceTitan (trades), Toast and Square (restaurants),
   Tekmetric and Shopmonkey (auto), Clio (law), Brightwheel and Procare
   (child care) and Vagaro and Boulevard (salons) leave no room for a fifth
   general-purpose tool. Housecall Pro lists $59–$299/mo
   ([vendor](https://housecallpro.com/pricing/)); Tekmetric $179–$439/mo
   ([vendor](https://tekmetric.com/pricing)).
2. **The openings are in paperwork an outside party demands:** a fire
   marshal, a water utility, a county, the DEA, a state licensing surveyor,
   a surety, a general contractor's insurance exhibit. Each has a deadline,
   a format and a penalty, and the big horizontal tools handle it badly or
   not at all. That is the same shape as the CMMC and pay-app products.
3. **The strongest candidates reuse what is already built.** Three engines
   carry over:
   - **Rate-card costing** (`jobshop-quote/src/shared/costing.ts`: the model
     extracts with verbatim quotes, prices come only from the shop's card)
     fits cabinet shops, sign shops and fire-protection deficiency quotes.
   - **Pay-app and job-cost data** (`payapps`) fits construction CPAs' WIP
     schedules and GCs' certificate-of-insurance checks.
   - **Cited control library + evidence + drafts-stay-drafts** (`cmmc`) fits
     DEA audit readiness, home-care caregiver files and child-care staff
     files.
4. **Health care is cheaper on AWS than on Cloudflare.** Cloudflare signs a
   HIPAA business associate agreement only on Enterprise
   ([Paubox quoting Cloudflare](https://www.paubox.com/blog/cloudflare-hipaa-compliant));
   AWS accepts one in AWS Artifact for its HIPAA-eligible services
   ([AWS](https://aws.amazon.com/compliance/hipaa-compliance)). Until the
   AWS move lands, only no-PHI wedges are open; the three health picks below
   are all no-PHI.

## The candidates, best first

Scores are judgment. "Reuse" says which existing app it grows out of.

| # | Candidate | Customer | WTP | Size | Dist | Margin | Time | Total | Reuse |
|---|---|---|---|---|---|---|---|---|---|
| A | WIP schedule + surety pack from QuickBooks | CPAs and bookkeepers with contractor clients | 4 | 3 | 4 | 5 | 4 | 20 | payapps |
| B | Plans/photo/email → priced quote | cabinet and millwork shops; sign shops | 3 | 3 | 4 | 4 | 5/4 | 19/18 | jobshop-quote |
| C | DEA controlled-drug audit readiness | independent vet clinics | 3 | 3 | 4 | 5 | 4 | 19 | cmmc |
| D | Fire and life-safety inspection reports, deficiency quotes, AHJ filing (+ backflow) | sprinkler, extinguisher and alarm ITM contractors | 4 | 3 | 4 | 4 | 3 | 18 | payapps, jobshop-quote, cmmc |
| E | Contract-to-coverage check (subcontract insurance exhibit vs. certificate and endorsements) | GCs (inside PayApps); independent P&C agencies | 4 | 4 | 3 | 4 | 3 | 18 | payapps |
| F | Caregiver-file and state-survey readiness | non-medical home care agencies | 4 | 4 | 3 | 4 | 3 | 18 | cmmc |
| G | Staff-file and licensing-inspection readiness | child care centres | 2 | 5 | 4 | 4 | 4 | 19 (demoted on WTP) | cmmc |
| H | Four-monthly maintenance reports to each county | Texas aerobic septic maintenance providers | 3 | 2 | 4 | 5 | 4 | 18 | (scheduling, invoicing) |
| I | ALTA/NSPS 2026 title-commitment exception list | land surveyors | 3 | 2 | 4 | 5 | 4 | 18 | jobshop-quote extraction |

**Watch, not now:** small food manufacturers' lot traceability (17; FDA's FSMA
204 date moved to July 20, 2028, so retailer mandates are the live trigger),
commercial snow logs for slip-and-fall defence (17; seasonal, this season has
started), AIM Act refrigerant leak records inside HVAC maintenance agreements
(17; $29–$89 leak-log apps exist), freight-broker carrier fraud checks (17;
liability wording), funeral-home price lists (17), plan-check response letters
(17; a competitor exists, close to the rejected permit bet), Phase I
environmental drafts (17; three AI rivals shipped in 2026), mental-health
credentialing (17), med-spa supervision logs (17; PHI).

**Skip:** restaurants (15), auto repair (16, fifth entrant), dental (16,
crowded with funded AI and PHI-heavy), small law (17, unauthorised-practice
risk), breweries and distilleries (15, shrinking, $30/mo anchors), independent
pharmacies (14, PHI and distressed buyers), pool service (15, Skimmer at $1 per
pool), salons, fitness, residential cleaning, lawn care, title and escrow
(FinCEN's residential rule was vacated on Mar 19, 2026), IT MSPs (a channel for
CMMC, not a bet).

## What to do with it

Not nine new apps. In order:

1. **Modules inside PayApps once it is live:** E (certificate-of-insurance
   check, a GC buys it with the suite) and A (WIP and surety pack, sold to the
   contractor and to their CPA; the CPA tier is a second channel).
2. **Widen Job Shop Quote into "custom fabrication quote"** (B): rate-card
   templates and landing pages for cabinet and sign shops on the same engine,
   each with its own marketing page.
3. **Fire and life-safety ITM (D)** as the next construction-family app,
   after PayApps takes its first payment.
4. **A second compliance-readiness line on the CMMC engine:** vet DEA (C)
   first, home care (F) after, since each state pack is work.
5. H and I are small, quick niches. Take them only when a run has spare
   capacity, not as main bets.

Before building any of them: re-read the counts with `cbp_counts.py`, read the
cited rule text (40 CFR 84 for AIM, 21 CFR 1304 for DEA records, 30 TAC §285.7
for Texas septic), and talk to about ten owners.

## Evidence, by profile

### A. Construction CPAs: WIP and surety pack

- 55,052 CPA offices, NAICS 541211, 2023 (secondary,
  [naicscodes.org](https://naicscodes.org/code/541211-offices-of-certified-public-accountants/)).
  How many serve contractors: unsourced.
- QuickBooks Online has no percentage-of-completion or over/under-billing
  report, so WIP schedules are built in spreadsheets
  ([QuickBooks Community](https://quickbooks.intuit.com/community/reports-and-accounting-5/wip-work-in-progress-reporting-solution-for-qbo-35652);
  [AICPA-CIMA guidance](https://www.aicpa-cima.com/resources/article/wip-schedules-blueprints-for-solid-construction-accounting)).
- Sureties want CPA-prepared percentage-of-completion statements with a WIP
  schedule ([Old Republic Surety](https://www.orsurety.com/blog/financial-statements-what-to-expect-in-the-underwriting-process)).
- Incumbent: Foundation Software, custom pricing from about $300/mo plus
  $10k–$30k to implement (aggregator,
  [toolradar](https://toolradar.com/guides/best-accounting-software-construction)).
- Wedge: connect each client's QuickBooks file, deterministic cost-to-cost
  WIP, over/under-billings, a surety schedule pack; AI only maps cost codes
  and drafts variance notes. $149–$399/mo per firm (judgment).
- Risk: never claim GAAP, ASC 606 or "review-ready"; every figure traces to
  the ledger.

### B. Cabinet, millwork and sign shops: quotes from messy requests

- 6,055 cabinet establishments (NAICS 337110) and 5,895 sign manufacturers
  (339950), CBP 2023 (secondary, vantainsights snippets); First Research
  says about 6,000 sign shops
  ([First Research](https://firstresearch.com/Industry-Research/Sign-Manufacturing.html)).
- Quoting is slow and inconsistent between reps
  ([The Fabricator](https://www.thefabricator.com/article/shopmanagement/it-s-time-to-accelerate-the-quoting-process);
  [Signs101](https://signs101.com/threads/how-do-you-estimate-quote-job.160102));
  many sign shops run on spreadsheets
  ([Signs101](https://www.signs101.com/threads/what-are-you-actually-using-to-manage-quotes-jobs-and-invoices-not-looking-to-sell-anything.182840/));
  Cabinet Vision is called "very expensive" with a steep learning curve
  ([WoodWeb](https://www.woodweb.com/knowledge_base/User_views_on_cabinet_software.html)).
- Incumbents: Mozaik $95–$325/mo, Windows only
  ([vendor](https://www.mozaiksoftware.com/products)); shopVOX about
  $109–$249/mo plus users (aggregator,
  [fitgap](https://us.fitgap.com/products/006948/shopvox)). They are
  design/CNC or job-board tools; none turns a photo, sketch or email into a
  priced quote.
- Wedge: $99–$199/mo (cabinet), $79–$149/mo (sign), judgment.

### C. Vet clinics: DEA audit readiness

- 34,296 establishments, NAICS 54194, CBP 2023 (secondary,
  [vantainsights](https://vantainsights.com/industry/541940-veterinary-services)).
- Public settlements: $125,000
  ([DOJ, San Diego](https://www.justice.gov/usao-sdca/pr/san-diego-county-veterinary-clinic-pays-125000-mishandling-controlled-substances)),
  $200,000 ([DOJ, Utah](https://www.justice.gov/usao-ut/pr/logan-veterinarian-pays-200000-settle-allegations-under-controlled-substance-act)),
  $956,709 ordered ([DEA](https://www.dea.gov/es/node/232701)).
- Incumbents sell a log: VetSnap from $25/mo per DVM
  ([listing](https://www.medicalexpo.com/prod/vetsnap/product-4580685-1133080.html)),
  Vet S8 $125/mo (aggregator). Integration marketplaces exist
  ([Shepherd integrations](https://www.shepherd.vet/integrations/vetsnap)).
- Wedge: reconcile distributor invoices against the drug log, biennial
  inventory, loss/theft report draft. $99–$199/mo per location (judgment).
  No PHI. Never claim "DEA-compliant"; check against 21 CFR 1304.

### D. Fire and life-safety inspection contractors (+ backflow)

- Inspection reports go to the fire authority electronically, and a
  deficiency clears only with separate repair paperwork
  ([San Diego TCE FAQ](https://www.sandiego.gov/sites/default/files/2026-04/tce-contractor-faq.pdf)).
  Per-report fees: $15 Charleston
  ([city](https://charleston-sc.gov/DocumentCenter/View/29992)), $25 Tacoma
  ([city](https://tacoma.gov/government/departments/fire/code-inspections-permits/fire-and-life-safety-compliance-program/)),
  $35 Worcester County, MD ([county](https://worcestermd.gov/node/208)).
- Incumbents: ServiceTrade $89–$189 per tech/mo with a 5-tech minimum
  (aggregator, [Capterra](https://www.capterra.com/p/132690/ServiceTrade/));
  Inspect Point, quote only
  ([vendor](https://www.inspectpoint.com/trades/fire-sprinkler/)).
- Backflow: every water district has its own portal and deadline (Columbus 5
  days, Vancouver 15;
  [Columbus](https://www.columbus.gov/files/sharedassets/city/v/2/utilities/documents/water-forms/online-test-submittal-user-guide.pdf),
  [Vancouver](https://vancouver.ca/home-property-development/protecting-water-quality.aspx)),
  but tools cost $15–$49/mo, so it is a module, not a product.
- Establishment count for fire protection alone: unsourced.
- Wedge: phone walkthrough to NFPA report, deficiency to a rate-card quote,
  an upload package for the fire authority. $149–$299/mo flat for 1–10 techs (judgment).
  Sprinkler installs are billed on AIA pay apps, so PayApps applies.

### E. Contract-to-coverage check

- About 37,000 independent P&C agencies in 2026
  ([Insurance Business on the Big "I" study](https://www.insurancebusinessmag.com/us/news/technology/independent-agency-revenue-rose-at-three-in-four-firms-as-ai-adoption-tripled-big-i-study-finds-590958.aspx));
  AI adoption rose from 15% to 46% of agencies (same source).
- Certificate volume is a known workload
  ([Vertafore](https://www.vertafore.com/resources/press-releases/vertafore-unveils-integrated-certificates-solution-remove-service)).
  That checking insurance exhibits by hand is the main pain is unsourced.
- Wedge: extract each requirement from the subcontract's insurance exhibit
  with a verbatim quote, flag what the certificate and endorsements do not
  show. Output is "found / not found in these documents", never a coverage
  opinion (errors-and-omissions exposure). ACORD form licensing for vendors:
  verify before using ACORD 25.

### F. Non-medical home care agencies

- 40,265 establishments, NAICS 62412, CBP 2023 (secondary,
  [vantainsights](https://vantainsights.com/industry/624120-services-for-the-elderly-persons-with-disabilities));
  HCAOA says 26,000+ agencies ([HCAOA](https://www.hcaoa.org/media-room.html)).
- Compliance was owners' top business priority in 2025
  ([HHAeXchange](https://www.hhaexchange.com/2025-homecare-insights-provider-voices-survey));
  surveyors pull random employee files
  ([WA DOH](https://www.doh.wa.gov/uk/node/7845)).
- CareAcademy charges $239–$383/mo for training with a one-year minimum
  ([vendor](https://careacademy.com/pricing/)), which shows the willingness to pay.
- No PHI if care plans and visit notes stay out; rule packs must cite state
  code.

### G. Child care centres

- 82,162 establishments, NAICS 624410, CBP 2023 (secondary,
  [startbusinessbystate](https://startbusinessbystate.com/?p=24099)).
- Arizona's top citations rank incomplete staff files first
  ([AZDHS](https://www.azdhs.gov/documents/licensing/childcare-facilities/parents/top_10_violations.pdf));
  5-year comprehensive background checks
  ([45 CFR 98.43](https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-A/part-98/subpart-E/section-98.43)).
- Thin centre margins (WTP 2); Brightwheel and Procare could ship it as a feature.

### H. Texas aerobic septic maintenance providers

- Report to the county and the owner at least every four months, within 14
  days of the visit ([TCEQ](https://www.tceq.texas.gov/permitting/ossf/ossfmaintenance.html));
  counties use their own formats
  ([Fort Bend bulk upload spec](https://fortbendcountytx.gov/sites/default/files/document-central/Maintenance-Provider-Inspection-Bulk-Upload-Instructions-04-04-25.pdf));
  every provider is in a public TCEQ directory. Check the current interval
  in 30 TAC §285.7 (amended March 30, 2024).

### I. Land surveyors

- 7,288 establishments, NAICS 541370, CBP 2023 (secondary,
  [vantainsights](https://vantainsights.com/industry/541370-surveying-mapping-except-geophysical-services));
  other sources say 12,750 or about 17k.
- The 2026 ALTA/NSPS standards apply to surveys contracted on or after Feb
  23, 2026, and title insurers no longer have to supply adjoiner deeds
  ([ALTA](https://alta.org/news-and-publications/news/20251125-Key-Updates-to-the-2026-ALTANSPS-Land-Title-Survey-Standards),
  [McGuireWoods](https://www.mcguirewoods.com/client-resources/alerts/2026/2/updated-alta-nsps-land-title-survey-standards-take-effect-feb-23/)).
  No forum evidence that this is the top pain: interviews needed.

### Watch list, one line each

- **Food traceability:** Walmart may hold or reject freight over traceability
  since Aug 1, 2025
  ([Walmart](https://one.walmart.com/content/food-safety/en_us/food-safety-requirements/food-traceability.html));
  FDA compliance date July 20, 2028
  ([FDA](https://www.fda.gov/food/food-safety-modernization-act-fsma/fsma-final-rule-requirements-additional-traceability-records-certain-foods));
  ReposiTrak from $49/mo
  ([press release](https://www.businesswire.com/news/home/20250318844960/en)).
- **Snow logs:** "the side with the best records often wins"
  ([Landscape Ontario](https://landscapeontario.com/battle-of-evidence-the-side-with-the-best-records-often-wins-a-slip-and-fall-lawsuit));
  SIMA estimates 22,000 commercial-grade contractors
  ([SIMA](https://sima.org/our-industry)).
- **AIM Act leak records:** in force Jan 1, 2026 with no grace period
  ([ACHR News](https://www.achrnews.com/blogs/17-opinions/post/165785-new-year-new-refrigerant-rules-no-grace-period));
  verify scope against 40 CFR 84.
- **Freight brokers:** 53% of TIA survey respondents lost over $10k to fraud
  ([TIA](https://member.tianet.org/TIAnetOrg/Member%20Resources/White-Papers/State-of-Fraud-in-the-Industry-April-2025.aspx));
  FMCSA suspends authority when broker security drops below $75,000 since
  Jan 16, 2026
  ([FMCSA](https://www.fmcsa.dot.gov/registration/broker-and-freight-forwarder-financial-responsibility-rule-overview-and-compliance)).
- **Funeral homes:** FTC phone sweep sent 39 warning letters; penalties up to
  $51,744 per violation
  ([FTC](https://www.ftc.gov/news-events/news/press-releases/2024/01/ftc-sends-warning-letters-funeral-homes-after-first-undercover-phone-sweep)).
- **Independent pharmacies:** DSCSA small-dispenser exemption to Nov 27, 2027
  ([Buchanan](https://www.bipc.com/fda-extends-dscsa-exemption-for-small-pharmacies-through-november-27-2027-what-pharmacies-need-to-know)).

## Gaps for the next run

- Census counts (blocked here). Allowing `www2.census.gov` in the
  environment's network settings lets `cbp_counts.py` run.
- Owner-forum evidence for breweries, food traceability, backflow and
  surveyors' title work.
- Fire-protection establishment count; Texas aerobic system count; number of
  CPA firms with construction practices.
