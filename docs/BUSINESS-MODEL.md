# Business model

## Value proposition

We sell **digital presence bundles** to local businesses under a **public brand** (TBD — set `NEXT_PUBLIC_BRAND_NAME`). The differentiator is **preview before purchase** plus **zero human sales friction**: customers get a link, talk to an AI assistant if they want changes, and pick a bundle (Starter from $500) self-serve — no waiting on a salesperson.

See [PRODUCT-BUNDLES.md](./PRODUCT-BUNDLES.md) for full tier definitions.

**Legal entity:** Maris Stella Labs (Colorado, USA) — handles Stripe, contracts, and compliance. **Public brand** — used in marketing, outreach, and voice agent persona.

## Operating model: zero-touch operator

| Traditional agency | This product |
|--------------------|--------------|
| Operator discovery calls | **AI voice agent** gathers branding and answers questions |
| Manual email replies | Automated sequences + voice callback number |
| Custom quotes | Fixed bundle tiers ($500 setup + optional monthly) |
| Operator deploys site | Automated post-payment deploy |

**Operator role:** Configure automation, monitor dashboard metrics, handle edge-case alerts (failed payments, deploy errors) — not day-to-day sales.

## Target customers

- **Geography:** Business-friendly countries (US, UK, Canada, Australia — start with one metro).
- **Segments:** Restaurants, salons, trades, retail, gyms, professional services with weak or no web presence.
- **Profile:** Listed on Google Maps, reachable phone/email, would benefit from a simple landing page.

## Pricing — product bundles

Sold as **bundles**, not à la carte packages. See [PRODUCT-BUNDLES.md](./PRODUCT-BUNDLES.md) for full scope.

| Bundle | Price | Includes |
|--------|-------|----------|
| **Starter** | **$500** one-time | Professional landing page, mobile responsive, contact form, Google Maps embed, basic SEO, preview → custom domain handoff, self-serve Stripe checkout |
| **Growth** | **$500** + **$99/mo** | Everything in Starter, plus AI marketing engine — 8 social/GBP posts + 2 emails per month, auto-scheduled, brand voice from site data |
| **Complete** | **$500** + **$199/mo** | Everything in Growth, plus full marketing tier (seasonal promos, A/B variants) and **client AI phone agent** — answers their business line, books appointments, captures leads |
| **Commerce** *(add-on)* | **+$300** one-time + **$49/mo** | Stacks on any bundle — Stripe checkout, simple catalog (≤50 SKUs), order notifications; retail, restaurant ordering, booking deposits, or gift cards |
| **Copy pack** *(legacy upsell)* | **$49** one-time | Download-only GBP posts, social captions, review email — no scheduling; nurtured toward Growth |
| Rush / custom | Quote | Only if automated flow cannot satisfy (exception path) |

**Recommendation logic (preview + voice):**

- Quote-based trades, price-sensitive → **Starter**
- Wants visibility but won't post themselves → **Growth**
- Phone-heavy, appointment-based → **Complete**
- Online orders, menu sales, deposits → add **Commerce**

All marketing content is **100% AI-generated** — no human copywriter. Quality comes from business-specific data (hours, services, location) and category templates, not generic prompts.

Invoices and Stripe receipts show **Maris Stella Labs** as seller. Marketing and outreach use the **public brand**.

## Sales funnel (fully automated)

```mermaid
flowchart TD
  A[Discover business — API/CSV] --> B[Auto-generate preview site]
  B --> C[Automated email with preview link]
  C --> D[Optional outbound AI voice call]
  D --> E{Customer engages?}
  C --> E
  E -->|Views preview| F[Self-serve path]
  E -->|Calls back| G[Inbound AI voice agent]
  E -->|Answers outbound| G
  F --> H{Wants changes?}
  G --> H
  H -->|Yes| I[Voice discovery — branding, copy, photos]
  I --> J[Auto-update preview]
  J --> F
  H -->|No| K[Stripe checkout — self-serve]
  G --> K
  K --> L[Automated production deploy]
  L --> M[Automated DNS handoff email]
```

**No operator discovery calls.** All "discovery" happens via:

1. **Self-serve:** Customer reviews preview and pays, or
2. **Voice agent:** Customer calls (or receives outbound call) and AI collects customization inputs.

## Customer touchpoints (low touch)

| Touchpoint | Customer effort | Handler |
|------------|-----------------|---------|
| Receive email | Open link | Automated |
| View preview | Browse site | Self-serve |
| Customize site | 5–10 min voice call OR ignore and buy as-is | AI voice agent |
| Pay | Click checkout link | Stripe self-serve |
| Go live | Follow DNS email | Automated instructions |

## Outreach (automated)

Outreach uses the **public brand** in subject lines, From name, and voice scripts. Email footers and checkout identify **Maris Stella Labs** for legal compliance.

### Email 1 — Preview delivery

**From:** `{Public Brand}` (e.g. SitePreview)

**Subject:** `{BusinessName} — we built your website (free preview)`

**Body outline:**

1. We build sites for local businesses — yours is ready to preview.
2. Link: `https://{slug}.preview.yourdomain.com`
3. **Call us anytime:** `{VOICE_CALLBACK_NUMBER}` — AI assistant can walk you through and make changes.
4. **Or buy now:** checkout link on preview page — bundles from $500, no call required.
5. CAN-SPAM footer: public brand + Maris Stella Labs address, unsubscribe.

### Email 2 — Follow-up (automated, 3–5 days)

- Reminder + preview link + callback number.
- "Prefer not to call? Click Claim on your preview page."

### Email 3 — Final touch (7–10 days)

- Last automated note; opt-out honored permanently.

### Outbound voice (optional, automated)

Triggered when lead has phone and consent basis documented.

**Opening (see VOICE-AGENT-FLOW.md):** "Hi, this is [Assistant] from **{Public Brand}**. We built a preview website for {BusinessName}. I can text you the link or walk you through it now — takes about two minutes."

If no answer: voicemail with preview URL (where legally permitted) + email backup.

## Voice agent vs self-serve

| Path | Best for |
|------|----------|
| **Self-serve checkout** | Customer happy with preview; minimal friction |
| **Inbound callback** | Questions, wants tweaks, needs reassurance |
| **Outbound call** | Higher engagement markets; phone-first SMBs |

Both paths converge on the same Stripe checkout — voice agent can SMS/email the link during the call.

## Bundle upsell path (automated)

Bundles are offered **without operator involvement** at three touchpoints:

| Touchpoint | Script / CTA | Action |
|------------|----------------|--------|
| **Preview site** | Tier comparison cards — Starter / Growth / Complete + optional Commerce | Self-serve Stripe checkout per tier |
| **Voice agent (discovery)** | After customization: explain Starter ($500), Growth (+$99/mo marketing), Complete (+$199/mo with AI phone), Commerce add-on | Voice tool `explainBundles` → `createCheckoutSession` |
| **Post-purchase email** | Starter buyers: "Add Growth marketing?" Complete buyers: "Add Commerce?" | One-click Stripe upgrade link |

Upsell acceptance triggers the appropriate module (see [MARKETING-AUTOMATION.md](./MARKETING-AUTOMATION.md), [VOICE-AGENT-FLOW.md](./VOICE-AGENT-FLOW.md)). Upgrade paths:

- **Starter → Growth** — marketing engine at go-live
- **Growth → Complete** — client AI phone agent provisioning
- **Any tier + Commerce** — catalog + Stripe checkout add-on
- **Copy pack ($49)** — legacy entry; email sequence nurtures to Growth

## Operator workflow (monitoring only)

1. Weekly: review dashboard conversion metrics.
2. On alert: failed webhooks, deploy errors, spike in opt-outs.
3. Monthly: tune voice scripts and email templates from transcript analytics.
4. **Not required:** daily outreach, discovery calls, manual site edits.

## Unit economics (rough)

| Item | Estimate |
|------|----------|
| Revenue per sale | $500 (Starter) · $500 + $99/mo (Growth) · $500 + $199/mo (Complete) · +$300 + $49/mo (Commerce) |
| Stripe fees | ~$15 (setup) + ~3% recurring |
| Platform voice (2–5 min) | ~$0.10–0.50 (Vapi/Retell) |
| Client AI phone (Complete) | ~$5–15/mo per client (Twilio + Vapi minutes) |
| Email | ~$0.01–0.05 per lead |
| Marketing LLM | ~$0.50–2/mo per client (batch generation) |
| Scheduling (Buffer) | ~$6–12/mo shared across clients |
| Hosting | ~$0–20/mo shared |
| Operator time | Near-zero at scale |

## Competitive positioning

- **vs DIY:** Done for you, preview first, AI help if needed — no learning curve.
- **vs agencies:** Bundles from $500 flat, instant preview, no sales calls.
- **vs freelancers:** Productized, automated, consistent quality.

## Metrics to track

- Leads ingested / week (automated)
- Previews deployed / week
- Email open → preview view rate
- Voice calls: outbound connect rate, inbound volume, avg duration
- Voice → customization applied rate
- Preview → checkout → paid (self-serve vs post-voice)
- Time to live after payment
- Opt-out / complaint rate
