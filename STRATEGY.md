# Listing Lens Strategy

## Verdict

**PURSUE — agent-first wedge**  
**Confidence:** medium-high

Listing Lens is realistic if it starts with the audience already feeling the pain of mediocre listing media: mid-market real estate agents and brokerage marketing assistants who need faster, cheaper, better DIY output. The wedge is not "another HDR camera app." It is an integrated listing-media workflow that compresses capture, enhancement, delivery, and branding into a repeatable 30-minute iPhone process.

## Product concept

**Working name:** Listing Lens  
**Tagline:** "Pro-level listing media in 30 minutes — from your iPhone."

## Problem

- 97% of homebuyers start online; listing photos are the product
- ~65% of agents don't use professional photographers
- DIY shots are often mediocre on Zillow, leading to fewer showings and longer days on market
- Professional shoots cost $150-500 per listing and require 3-7 day scheduling
- DIY shoots consume 4-8 hours of agent time, or roughly $300-1,200 in opportunity cost

## Solution

Listing Lens guides agents through a 5-step capture-to-publish workflow:

1. **Guide** — room-by-room prompts, vertical lock, HDR brackets
2. **Enhance** — instant on-device AI for exposure, sky, perspective, and white balance
3. **Polish** — optional cloud edits for virtual staging, twilight, and object removal
4. **Deliver** — MLS exports, optional LiDAR 3D, and 60-second video walkthroughs
5. **Brand** — agent headshot, logo, and property microsite

## Target customer

### Primary beachhead: mid-market real estate agents

- 12-24 deals per year
- Lists $200k-$600k homes
- Shoots some listings themselves or uses low-cost help
- Compares Listing Lens against photographer invoices and lost time
- Has recurring demand: 4-12 listings per month for active agents and small teams

### B2B expansion: brokerage marketing assistants

- Shoots for 5-15 agents
- Needs templates, batch export, repeatable quality, and brand consistency
- Experiences daily workflow pain, making the use case more operational and recurring

## Secondary Airbnb / STR market

Airbnb and STR hosts are a real opportunity, but not the lead subscription wedge.

- Airbnb professional photography can recoup in roughly one night for 85% of hosts
- Professional photos are associated with +21% earnings and +19% bookings
- Single-property hosts are episodic and churn-prone
- Multi-property managers with 5+ units behave like small businesses
- Best fit is a one-time pack: $29-79 per listing, not a monthly subscription

## Positioning

Listing Lens should compete against mediocre DIY and slow outsourcing, not luxury production crews.

**Positioning statement:** For mid-market agents who need listings online fast, Listing Lens turns an iPhone into a guided listing-media workflow that produces MLS-ready photos, optional 3D/video, and branded delivery in about 30 minutes.

## Differentiation

| Alternative | Strength | Listing Lens difference |
| --- | --- | --- |
| BoxBrownie SnapSnapSnap | Human editing quality and known market presence | Faster integrated workflow; avoid 24-48 hour turnaround for basic use cases |
| Julius / RealtyCam | HDR, flyers, websites, cleanup | Less point-solution feel; own capture through publishing |
| ListingPix | Credit-based AI camera for agents and STR hosts | Add 3D/video and agent-first workflow depth |
| Polycam | Excellent iPhone 3D and floor plans | Listing-marketing focus, MLS export, branding, and photo workflow |
| Matterport | Industry-standard 3D brand | Lower-cost, faster, mid-market "good enough" alternative |
| AutoMLS | Validates walk-and-shoot thesis | Move quickly; differentiate with quality, workflow, and agent branding |

## Business model

| Tier | Price | Buyer | Notes |
| --- | --- | --- | --- |
| Starter | $29/mo | Occasional agents | 3 listings included |
| Agent Pro | $79/mo | Active agents | Unlimited listings with fair use |
| Team | $249/mo | Small teams / brokerage marketing | 10 seats, templates, batch export |
| Host pack | $19/listing | Airbnb / STR hosts | One-time listing refresh |

Validation pricing can start lower:

- $19/listing for concierge MVP
- $49-99/mo once users prove recurring need
- $8-15/listing as an alternate transactional test

Unit economics are compelling if quality is sufficient. An agent with 6 listings per month and 30 images per listing could spend about $360/mo at $2/image with an editing service. A $79/mo unlimited plan is competitive if Listing Lens saves time and produces MLS-ready output quickly.

## GTM 90-day plan

### Week 1-2 — Problem interviews

- Interview 10 agents about workflow, spend, and pain
- Interview 5 STR hosts or property managers
- Collect 20 Zillow listings in one target metro, split between mediocre and excellent examples

### Week 3-4 — Concierge MVP

- Use a guided shoot checklist and manual AI pipeline before building an app
- Deliver MLS-ready packs in under 2 hours
- Charge $19/listing to test willingness to pay

### Month 2 — Smoke-test app

- Launch TestFlight with 20 users
- Measure time-to-publish, NPS, and willingness to pay
- A/B test agent messaging against host messaging

### Month 3 — Pick wedge

- Select the audience where more than 40% would pay $49/mo
- Land 1 brokerage pilot
- Define v1 as either photos only or photos plus 3D lite

## Key metrics

- Percent of interviewed agents willing to pay $49+/mo
- Paying customers without hand-holding
- Median arrive-to-MLS-ready time
- Blind photo quality rating versus current DIY
- Number of listings completed per user per month
- Conversion from concierge MVP to TestFlight usage
- Brokerage pilot activation and seat expansion

## Success criteria by day 90

- At least 40% of interviewed agents would pay $49+/mo
- At least 5 paying customers without hand-holding
- Median arrive-to-MLS-ready time under 45 minutes
- Blind quality rating at least 7/10 versus current DIY

## Scope guard

- Do not build the iOS app in phase 1
- Do not over-engineer backend, auth, or Convex
- Do not lead GTM messaging with Airbnb subscription
- Do not target luxury ($1M+) listings in v1 positioning

## Open questions checklist

- [x] MLS compliance by board — general rules researched and documented in `process/mls-compliance.ts` (no branding/watermarks on MLS photos; virtual staging disclosure required in most states as of 2026). Still needs re-verification against the specific board once a real listing is booked.
- [ ] On-device vs cloud for virtual staging
- [ ] v1 scope: photos only vs photos + 3D lite
- [ ] Brokerage sales cycle vs agent PLG
