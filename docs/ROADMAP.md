# Roadmap

Phased plan to take Local Site Studio from scaffold to revenue. Designed for continuation in Cursor Cloud or local dev.

## Phase 0 — Scaffold (complete)

- [x] Next.js + TypeScript + Tailwind project
- [x] Agency marketing landing page (`/`)
- [x] Placeholder dashboard, leads, preview, checkout routes
- [x] Architecture, business, compliance, and roadmap docs
- [x] `.env.example` with Stripe and hosting placeholders
- [x] Private GitHub repository

## Phase 1 — Foundation (1–2 weeks)

**Goal:** Runnable operator experience with auth and one real preview template.

- [ ] Choose database (Convex or PostgreSQL + Prisma)
- [ ] Define `leads` and `sites` schema
- [ ] Add operator auth (Clerk or NextAuth) — protect `/dashboard`
- [ ] Build 2–3 category templates (restaurant, salon, trades)
- [ ] Manual lead entry form in dashboard (no scrapers yet)
- [ ] Deploy to Vercel; configure `NEXT_PUBLIC_APP_URL`
- [ ] Set up preview subdomain strategy (wildcard DNS or path-based previews)

**Exit criteria:** Operator can create a lead, assign a template, share `/preview/[slug]` link.

## Phase 2 — Outreach (1–2 weeks)

**Goal:** Send compliant preview emails and track funnel.

- [ ] Integrate email provider (Resend recommended)
- [ ] Email templates with unsubscribe + physical address
- [ ] Suppression list table
- [ ] Log outreach events on lead records
- [ ] Optional: Calendly embed for discovery calls
- [ ] Dashboard: filter leads by stage, mark replies

**Exit criteria:** Send 10 test emails to yourself/team; funnel updates on send.

## Phase 3 — Payments (1 week)

**Goal:** Collect $500 via Stripe.

- [ ] Create Stripe Product + Price in Dashboard
- [ ] Implement `POST /api/stripe/checkout` → Checkout Session
- [ ] Stripe webhook: `checkout.session.completed` → mark lead paid
- [ ] Success/cancel pages
- [ ] Receipt email via Stripe or Resend

**Exit criteria:** Test mode payment end-to-end; lead moves to "Paid" in dashboard.

## Phase 4 — Data ingestion (2–4 weeks, legal review first)

**Goal:** Scale lead discovery without ToS violations.

- [ ] Legal review of target markets
- [ ] Google Places API integration (preferred over scraping)
- [ ] CSV import for directory exports
- [ ] Dedupe by business name + address
- [ ] Optional: LLM-assisted copy generation with human approval queue

**Do not:** Ship Maps/Facebook HTML scrapers without explicit legal sign-off.

**Exit criteria:** Import 100+ leads from API or CSV into pipeline.

## Phase 5 — Production deploy & handoff (1–2 weeks)

**Goal:** Paid customers go live on custom domains.

- [ ] Post-payment workflow: remove preview banner, enable production mode
- [ ] Domain connection docs + Vercel domain API (optional automation)
- [ ] Contact form → client email (Resend inbound or Formspree)
- [ ] E-commerce lite template (Stripe Payment Links or simple cart)

**Exit criteria:** One paying customer live on custom domain.

## Phase 6 — Scale & optimize (ongoing)

- [ ] A/B test email subject lines
- [ ] Analytics (Plausible or Vercel Analytics)
- [ ] Automated follow-up sequences
- [ ] Multi-region expansion with localized compliance
- [ ] AI discovery call pilot (TCPA-compliant)
- [ ] Recurring hosting tier

---

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
2. Pick database and implement Phase 1 schema.
3. Replace placeholder preview with first real template.
4. Deploy to Vercel and test preview URLs.

## Open decisions

| Decision | Options | Recommendation |
|----------|---------|----------------|
| Database | Convex vs PostgreSQL | Convex for speed + realtime dashboard |
| Email | Resend vs SendGrid | Resend for DX with Next.js |
| Preview URLs | Subdomain vs path | Subdomain (`*.preview.domain.com`) for trust |
| Auth | Clerk vs NextAuth | Clerk for fastest operator login |

## Dependencies between phases

```
Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 5
                    ↘ Phase 4 (parallel after Phase 1, after legal review)
```

Phase 4 can run in parallel with Phase 2–3 once manual lead entry works.
