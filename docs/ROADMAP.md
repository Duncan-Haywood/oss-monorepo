# Roadmap

Phased plan for **Maris Stella Labs** (Colorado, USA) operating **Local Site Studio** — digital presence bundles (website → marketing → client AI phone → e-commerce). Designed for continuation in Cursor Cloud or local dev.

See [PRODUCT-BUNDLES.md](./PRODUCT-BUNDLES.md) for tier definitions.

## Phase 0 — Scaffold (complete)

- [x] Next.js + TypeScript + Tailwind project
- [x] Agency marketing landing page (`/`)
- [x] Placeholder dashboard, leads, preview, checkout routes
- [x] Architecture, business, compliance, legal, and roadmap docs
- [x] Maris Stella Labs branding (Colorado, USA) across site and docs
- [x] `.env.example` with Stripe, marketing LLM, and scheduling placeholders
- [x] Marketing Engine docs + code scaffold (`src/lib/marketing/`, `/api/marketing/generate`)
- [x] Private GitHub repository
- [x] Product bundle docs (Starter / Growth / Complete / Commerce)

## Phase 1 — Website foundation (1–2 weeks)

**Goal:** Runnable operator experience with auth and one real preview template. **Delivers Starter tier.**

- [ ] Choose database (Convex or PostgreSQL + Prisma)
- [ ] Define `leads` and `sites` schema
- [ ] Add operator auth (Clerk or NextAuth) — protect `/dashboard`
- [ ] Build 2–3 category templates (restaurant, salon, trades)
- [ ] Manual lead entry form in dashboard (no scrapers yet)
- [ ] Deploy to Vercel; configure `NEXT_PUBLIC_APP_URL`
- [ ] Set up preview subdomain strategy (wildcard DNS or path-based previews)
- [ ] Preview page: bundle tier comparison cards (Starter / Growth / Complete)

**Exit criteria:** Operator can create a lead, assign a template, share `/preview/[slug]` with tier CTAs.

## Phase 2 — Outreach + platform voice (2–3 weeks)

**Goal:** Send compliant preview emails; **platform voice** sells bundles and customizes sites.

- [ ] Integrate email provider (Resend recommended)
- [ ] Email templates with unsubscribe + physical address
- [ ] Suppression list table
- [ ] Log outreach events on lead records
- [ ] Platform voice MVP (Vapi/Retell): outbound + inbound on `VOICE_INBOUND_NUMBER`
- [ ] Platform webhook: discovery tools, `explainBundles`, `createCheckoutSession`
- [ ] Dashboard: funnel by tier interest, voice transcript links

**Exit criteria:** Test lead receives email, calls back, platform voice explains tiers and sends checkout link.

## Phase 3 — Payments + Starter fulfillment (1 week)

**Goal:** Collect **$500 Starter** and bundle subscriptions via Stripe.

- [ ] Stripe Products: Starter ($500), Growth ($500 + $99/mo), Complete ($500 + $199/mo)
- [ ] Implement `POST /api/stripe/checkout` → Checkout Session (payment + subscription)
- [ ] Stripe webhook: `checkout.session.completed` → mark lead paid, store tier
- [ ] Success/cancel pages with tier-specific messaging
- [ ] Receipt email via Stripe or Resend

**Exit criteria:** Test mode payment for each tier; lead record shows selected bundle.

## Phase 4 — Data ingestion (2–4 weeks, legal review first)

**Goal:** Scale lead discovery without ToS violations.

- [ ] Legal review of target markets
- [ ] Google Places API integration (preferred over scraping)
- [ ] CSV import for directory exports
- [ ] Dedupe by business name + address
- [ ] LLM-assisted copy generation from public data

**Do not:** Ship Maps/Facebook HTML scrapers without explicit legal sign-off.

**Exit criteria:** Import 100+ leads from API or CSV into pipeline.

## Phase 5 — Production deploy & handoff (1–2 weeks)

**Goal:** Paid customers go live on custom domains. **Starter + Growth site fulfillment.**

- [ ] Post-payment workflow: remove preview banner, enable production mode
- [ ] Domain connection docs + Vercel domain API (optional automation)
- [ ] Contact form → client email (Resend inbound or Formspree)
- [ ] Digital sales stub: `clientLeads` table + email routing

**Exit criteria:** One paying customer live on custom domain per tier (Starter minimum).

## Phase 6 — Marketing engine (2–3 weeks)

**Goal:** **Growth** and **Complete** marketing automation live.

**Prerequisites:** Phase 5 live sites with business data.

- [ ] Implement `src/lib/marketing/` generators (wired to LLM)
- [ ] Brand voice extractor from site config + ingestion JSON
- [ ] Category prompt templates (restaurant, salon, trades, retail)
- [ ] Quality gates: fact check, forbidden phrase filter, character limits
- [ ] Buffer API integration for scheduled posts
- [ ] Stripe subscription webhooks for Growth/Complete recurring
- [ ] Post-purchase upsell: Starter → Growth email sequence
- [ ] Optional customer review link (`/marketing/review/[token]`)

**Platform priority:** GBP → Facebook → email → Instagram

**Exit criteria:** Growth client receives 30 days of scheduled posts without operator editing.

## Phase 7 — Client AI phone agent (2–3 weeks)

**Goal:** **Complete tier** — AI answers client's business phone.

**Prerequisites:** Phase 5 production sites (assistant needs business data); Twilio account.

- [ ] `src/lib/voice/client/` handlers: FAQ, booking, lead capture
- [ ] Twilio number provisioning (forward or new DID)
- [ ] Vapi/Retell client assistant templates by category
- [ ] `/api/voice/client/webhook` + post-call email digest
- [ ] Cal.com integration or native availability slots
- [ ] Automated provisioning on Complete subscription webhook
- [ ] Client onboarding email: call forwarding instructions
- [ ] Dashboard: client call volume, booking count (read-only)

**Exit criteria:** Complete tier client forwards line; test caller books appointment via AI.

## Phase 8 — Commerce add-on (2–3 weeks)

**Goal:** Optional **Commerce** — Stripe catalog, checkout, booking deposits.

**Prerequisites:** Phase 3 Stripe integration; Phase 5 production deploy.

- [ ] `src/lib/commerce/` — catalog JSON, Stripe Product sync
- [ ] Restaurant menu + pickup slots template
- [ ] Retail simple grid template
- [ ] Salon services + deposit checkout
- [ ] Order notification emails
- [ ] Commerce upsell on preview + post-purchase
- [ ] Platform voice tool: `offerCommerceAddOn`

**Exit criteria:** One Commerce client accepts test order end-to-end.

## Phase 9 — Scale & optimize (ongoing)

- [ ] A/B test email subject lines and tier card placement
- [ ] Analytics (Plausible or Vercel Analytics)
- [ ] Automated follow-up sequences by tier
- [ ] Multi-region expansion with localized compliance
- [ ] Bundle upgrade flows (Growth → Complete) in Stripe Customer Portal
- [ ] Recurring hosting tier (if separated from bundles)

---

## Rollout summary

```
Website (Starter)     →  Phase 1, 3, 5
Marketing (Growth+)   →  Phase 6
Client AI phone       →  Phase 7  (Complete)
E-commerce (optional) →  Phase 8  (Commerce add-on)
Platform voice sales  →  Phase 2  (parallel after Phase 1)
```

## Cursor Cloud continuation — quick start

```bash
git clone git@github.com:Duncan-Haywood/local-site-studio.git
cd local-site-studio
npm install
cp .env.example .env.local
# Fill in keys as you reach each phase
npm run dev
```

**Recommended first tasks in cloud:**

1. Read `docs/COMPLIANCE.md` before any outreach code.
2. Read `docs/PRODUCT-BUNDLES.md` for tier scope.
3. Pick database and implement Phase 1 schema.
4. Replace placeholder preview with first real template + tier cards.
5. Deploy to Vercel and test preview URLs.

## Open decisions

| Decision | Options | Recommendation |
|----------|---------|----------------|
| Database | Convex vs PostgreSQL | Convex for speed + realtime dashboard |
| Email | Resend vs SendGrid | Resend for DX with Next.js |
| Preview URLs | Subdomain vs path | Subdomain (`*.preview.domain.com`) for trust |
| Auth | Clerk vs NextAuth | Clerk for fastest operator login |
| Client phone | Vapi vs Retell | Vapi for faster tool-call MVP |
| Booking | Cal.com vs native | Cal.com for MVP; native for zero third-party |

## Dependencies between phases

```
Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 5 → Phase 6 → Phase 7
                    ↘ Phase 4 (parallel after Phase 1, after legal review)
Phase 5 → Phase 8 (Commerce — can parallel with Phase 6–7)
Phase 2 (platform voice) can start after Phase 1; does not block Phase 3
```

Phase 4 can run in parallel with Phase 2–3 once manual lead entry works.
Phase 6 requires Phase 5 so marketing pulls from live site content.
Phase 7 requires Phase 5 for client business data; benefits from Phase 6 but not blocking.
Phase 8 requires Phase 3 (Stripe) and Phase 5 (production site).
