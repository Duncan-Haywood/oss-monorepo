# Architecture

**Local Site Studio** is a product operated by **Maris Stella Labs** (Colorado, USA). It is an **automation-first** platform selling **digital presence + sales bundles** to local businesses: website, AI marketing, client AI phone agent, and optional e-commerce. The operator runs a **zero-touch pipeline**: leads are discovered, sites are generated, outreach is sent under the public brand, and **platform voice** handles sales interaction. **Client voice** (Complete tier) answers the customer's business phone. Prospects receive a preview link, select a bundle, and pay Maris Stella Labs via Stripe without human sales involvement.

## Design principles

| Stakeholder | Goal |
|-------------|------|
| **Local business owner (customer)** | Low friction — preview link, optional AI call, self-serve Stripe checkout |
| **Operator (Maris Stella Labs)** | Zero touch — no discovery calls, no manual outreach replies, automated funnel end-to-end |
| **System** | Voice agent gathers branding/content, updates preview, handles objections, hands off to payment |

## Automated funnel (zero-touch operator)

```mermaid
flowchart TB
  subgraph ingestion [Data ingestion — automated]
    A[Public data sources] --> B[Lead pipeline]
    B --> C[Site generator]
  end

  subgraph outreach [Outreach — automated]
    C --> D[Preview deploy]
    D --> E[Email + optional outbound voice]
  end

  subgraph customer [Customer interaction — low touch]
    E --> F{Customer responds?}
    F -->|Email click| G[Preview site]
    F -->|Answers call| H[Outbound voice agent]
    F -->|Calls back| I[Inbound voice agent]
    G --> J{Customize?}
    H --> J
    I --> J
    J -->|Yes| K[Voice discovery Q&A]
    K --> L[Auto-update preview config]
    L --> G
    J -->|No / ready| M[Self-serve Stripe checkout]
  end

  subgraph fulfillment [Fulfillment — automated]
    M --> N[Stripe webhook]
    N --> O[Production deploy]
    O --> P[Domain handoff email]
  end

  subgraph operator [Operator — monitoring only]
    Q[Dashboard metrics] -.-> B
    Q -.-> E
    Q -.-> M
  end
```

The operator dashboard is **read-only monitoring** at scale: funnel counts, error alerts, revenue — not a daily workflow tool.

## Components

### 1. Data ingestion (future)

**Purpose:** Continuously populate the lead pipeline without manual entry.

**Planned sources (public information only):**

| Source | Data | Approach |
|--------|------|----------|
| Google Places API | Name, category, address, phone, hours | Official API (preferred) |
| Business directories / chambers | Listings, contact | CSV import, licensed data providers |
| Facebook Pages | Public page info | Graph API where permitted; avoid UI scraping |

**Important:** Do not implement raw scrapers against Google Maps or Facebook without legal review. See [COMPLIANCE.md](./COMPLIANCE.md).

**Storage (planned):** `leads` table — `source`, `externalId`, `businessName`, `category`, `location`, `contactEmail`, `phone`, `status`, `previewSlug`, `voiceCallId`, `customizationJson`, `createdAt`.

### 2. Site generation (future)

**Purpose:** Turn lead data into a branded preview site automatically.

1. Select template by business category (restaurant, salon, trades, retail).
2. Merge public fields into template slots (name, tagline, services, hours, map embed).
3. Generate preview slug: `{business-name}-{city}`.
4. Store site config as JSON; render via `/preview/[slug]` or subdomain.

**AI assist:** LLM drafts copy from public business description; voice agent collects overrides from the customer.

**Template types:**

- **Landing + marketing** (default, $500)
- **E-commerce lite** (add-on) — product grid, Stripe Payment Links

### 3. Preview hosting

**Purpose:** Trustworthy URL before payment.

- **Primary app:** Vercel (`localsitestudio.com`)
- **Preview sites:** `{slug}.preview.localsitestudio.com` via wildcard DNS + middleware, or stable Vercel alias per lead

**Current scaffold:** `/preview/[slug]` placeholder template with "Claim this site" CTA.

### 4. Outreach (automated)

**Channels:**

| Channel | Role | Automation |
|---------|------|------------|
| **Email** | Primary — preview link + optional callback number | Scheduled sends, follow-up sequences |
| **Outbound voice** | Secondary — "we built your site" call | Triggered after site deploy or on schedule |
| **Inbound voice** | Customer callback from email/preview | Routes to same voice agent persona |

No operator-written emails or calls. Templates + voice agent scripts are version-controlled in repo docs.

**Tracking:** Webhooks update lead status — `outreach_sent`, `preview_viewed`, `voice_started`, `voice_completed`, `checkout_started`, `paid`.

### 5. Platform voice agent (sells TO the local business)

**Purpose:** Replace human discovery/sales calls with AI voice agents for info gathering, bundle explanation, Q&A, objections, and checkout handoff. This is **not** the client's phone agent — see §9.

```mermaid
flowchart LR
  subgraph providers [Voice providers]
    VAPI[Vapi / Retell / Bland]
    TWILIO[Twilio + LLM]
  end

  subgraph app [This app]
    WH["/api/voice/webhook"]
    LIB["src/lib/voice/"]
    DB[(Lead + site config)]
  end

  providers --> WH
  WH --> LIB
  LIB --> DB
  LIB --> GEN[Site config updater]
  GEN --> PREVIEW[Preview redeploy]
  LIB --> STRIPE[Checkout link SMS/email]
```

**Responsibilities:**

| Flow | Trigger | Agent actions |
|------|---------|---------------|
| **Outbound** | Lead has preview + phone | Intro, mention preview URL, offer to walk through or send link via SMS |
| **Inbound** | Customer calls published number | Identify lead (caller ID / PIN), answer questions, run discovery script |
| **Discovery** | Customer wants changes | Collect logo URL, colors, services, hours, photos; write to `customizationJson` |
| **Objection handling** | Price, timing, trust | Scripted responses; offer email with checkout link |
| **Handoff** | Customer ready to buy | Trigger Stripe Checkout Session; send link via SMS or email during call |

**Integration pattern:**

1. Voice provider places/receives call with assistant configured via API.
2. Provider POSTs events to `/api/voice/webhook` (call started, transcript, tool calls, ended).
3. `src/lib/voice/` validates signature, maps `leadId`, executes tools (update site, create checkout).
4. Post-call: optional summary email to customer with preview + payment link.

See [VOICE-AGENT-FLOW.md](./VOICE-AGENT-FLOW.md) for scripts and state machine.

**Recommended stack:** [Vapi](https://vapi.ai) or [Retell](https://retellai.com) for fastest MVP (built-in telephony + LLM + webhooks). Twilio + custom LLM pipeline for maximum control at higher build cost.

### 6. Payments (self-serve)

**Purpose:** Customer completes purchase without operator.

1. Customer clicks "Claim this site" on preview **or** voice agent sends checkout link.
2. `POST /api/stripe/checkout` creates Stripe Checkout Session (`mode: payment`).
3. Webhook `checkout.session.completed` → mark lead paid → trigger production deploy workflow.
4. Automated handoff email: DNS instructions, receipt.

**Current scaffold:** `/checkout` UI + `/api/stripe/checkout` returns 501 until configured.

### 9. Production deploy (automated)

After payment (no operator step):

1. Promote preview config to production tenant.
2. Send automated DNS instructions (CNAME to Vercel).
3. Remove preview banner; route contact form to client email.

### 10. Marketing Engine (Growth + Complete)

**Purpose:** Generate and optionally publish ongoing marketing for paying clients — fully AI-driven, zero operator copywriting. Upsold during voice discovery, on the preview site, or post-purchase.

```mermaid
flowchart LR
  subgraph inputs [Inputs]
    ING[Ingestion pipeline]
    SITE[Website content]
    VOICE[Voice discovery answers]
  end

  subgraph engine [Marketing Engine]
    BRAND[Brand voice extractor]
    GEN[Content generators]
    QA[Quality gates]
    SCHED[Scheduler]
  end

  subgraph outputs [Outputs]
    COPY[Copy variants]
    POSTS[Scheduled posts]
    EMAIL[Email sequences]
  end

  ING --> BRAND
  SITE --> BRAND
  VOICE --> BRAND
  BRAND --> GEN
  GEN --> QA
  QA -->|approve or auto| SCHED
  QA --> COPY
  SCHED --> POSTS
  SCHED --> EMAIL
```

**Inputs:**

| Source | Data used |
|--------|-----------|
| **Ingestion pipeline** | Business name, category, address, hours, phone, services, public reviews |
| **Website content** | Tagline, service pages, hero copy, CTAs, location pages |
| **Voice agent discovery** | Brand tone preferences, seasonal promos, owner quotes, photo URLs, opt-out of topics |

**Outputs:**

| Output | Format | Delivery |
|--------|--------|----------|
| Copy variants | GBP posts, social captions, ad copy, email subject/body | Stored in `marketingContent` table; review link for customer |
| Scheduled posts | Platform-specific payloads + publish time | Buffer API or direct platform APIs (Google Business Profile, Meta) |
| Email sequences | Review requests, seasonal promos, re-engagement | Resend (transactional) with CAN-SPAM footer |

**Suggested stack:**

| Layer | Choice | Notes |
|-------|--------|-------|
| LLM | OpenAI or Anthropic | Structured JSON output; brand voice system prompt from scraped data |
| Scheduling | Buffer API (MVP) | Multi-platform queue; upgrade to direct GBP/Meta APIs where OAuth permits |
| Image gen | Optional (DALL·E / Flux) | Promo graphics; prefer client photos from ingestion when available |
| Review | Customer approval link | Optional approve-before-publish; default auto within compliance bounds |

**Quality gates:**

1. **Templates** — Category-specific prompts (restaurant vs trades vs salon); slot real business data, never generic placeholders.
2. **Brand voice** — Derived from website copy + voice discovery; reject outputs missing location, hours, or service names.
3. **Fact check** — Cross-reference generated claims against ingestion record (no invented discounts or fake awards).
4. **Human-readable review** — Optional customer link (`/marketing/review/[token]`) to approve, edit, or skip before publish.
5. **Compliance filter** — Block prohibited claims, missing unsubscribe on email, platform character limits.

**Integration points:**

- Voice agent tool: `offerMarketingPackage()` → explain tiers, add to Stripe subscription or one-time checkout.
- Preview site CTA: "Add automated marketing from $99/mo" on claim page.
- Post-payment webhook: if marketing add-on purchased, enqueue first content batch within 24h.

See [MARKETING-AUTOMATION.md](./MARKETING-AUTOMATION.md) for content types, automation levels, and compliance.

### 9. Client AI phone agent (Complete tier — sold AS product)

**Purpose:** Answer the **client's business phone** for their customers — receptionist, booking, FAQ, lead capture. Provisioned automatically after Complete tier payment.

```mermaid
flowchart LR
  subgraph telephony [Telephony]
    TWILIO[Twilio — client number or forward]
    VAPI[Vapi / Retell assistant]
  end

  subgraph clientApp [Per-client config]
    CFG[Client site config + hours + services]
    CAL[Cal.com or native booking slots]
    CRM[Lead stub — email + webhook]
  end

  subgraph handlers [This app]
    PROV["/api/client-phone/provision"]
    WH2["/api/client-phone/webhook"]
    LIB2["src/lib/client-phone/"]
  end

  TWILIO --> VAPI
  VAPI --> WH2
  WH2 --> LIB2
  LIB2 --> CFG
  LIB2 --> CAL
  LIB2 --> CRM
  PROV --> TWILIO
  PROV --> VAPI
```

**Responsibilities:**

| Capability | Implementation |
|------------|----------------|
| Inbound on client line | Twilio number + call forwarding from client's existing number, or new local DID |
| Business hours FAQ | Assistant prompt from `sites` config (hours, address, services) |
| Appointment booking | Tool call → Cal.com API or internal `bookings` table + availability rules |
| Lead qualification | Structured fields → `leads` stub + Resend email to client |
| Missed-call SMS follow-up | Twilio SMS with booking link (optional) |
| Transcript + summary | Post-call webhook → store + email digest to client |

**Provisioning flow (automated):**

1. Stripe webhook: Complete subscription active → enqueue `provisionClientPhone`.
2. Create Twilio sub-account or shared pool number per client.
3. Clone assistant template by business category; inject site JSON.
4. Send client email: "Forward your line to {number}" or porting instructions.

**Env vars:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `VAPI_API_KEY`, `CLIENT_PHONE_WEBHOOK_SECRET`.

See [VOICE-AGENT-FLOW.md](./VOICE-AGENT-FLOW.md) — Client voice section.

### 10. Digital sales module (Growth / Complete)

**Purpose:** Turn website traffic into leads and revenue without operator involvement — contact capture, routing, and optional Stripe products.

```mermaid
flowchart TB
  FORM[Contact / quote forms] --> LEAD[Lead stub table]
  CHAT[Optional chat widget — future] --> LEAD
  PHONE[Client AI phone — Complete] --> LEAD
  LEAD --> ROUTE[Lead routing]
  ROUTE --> EMAIL[Email to client]
  ROUTE --> WEBHOOK[Optional Zapier webhook]
  STRIPE_PROD[Stripe Products — Commerce] --> CHECKOUT[Embedded checkout]
  CHECKOUT --> ORDER[Order notification]
```

**Components:**

| Component | Tier | Notes |
|-----------|------|-------|
| Contact form → email | All | Resend or Formspree; spam honeypot |
| Lead stub (`clientLeads` table) | Growth+ | name, phone, source, status, transcript ref |
| Quote request workflow | Growth+ | Multi-step form for trades; AI phone can complete |
| Stripe Payment Links | Commerce | Simple SKUs, no custom cart logic |
| Embedded Stripe Checkout | Commerce | Cart with ≤50 products from `catalog` JSON |
| Booking deposits | Commerce | Stripe `mode: payment` for deposit; balance on arrival |

**Integration:** Platform voice can create checkout sessions with bundle + Commerce line items. Client phone agent can SMS payment links for deposits.

### 11. E-commerce module (Commerce add-on — optional)

**Purpose:** Lightweight online selling for local SMBs — not a Shopify replacement.

**Scope:**

- Product/service catalog stored as JSON on `sites` record (≤50 items)
- Stripe Products/Prices synced on publish (or Payment Links per SKU for MVP)
- Category templates: retail grid, restaurant menu + modifiers, salon service menu + deposit
- Order confirmation email to customer + notification to client
- Pickup time slots (restaurants) or appointment hold (salons)

**Out of scope (refer elsewhere):**

- Inventory sync with Square/Toast/Shopify
- Shipping rate calculation (flat rate only)
- Multi-location franchises
- Subscription boxes

**Architecture:**

```
src/lib/commerce/
  catalog.ts       # CRUD for site catalog JSON
  stripe-sync.ts   # Create/update Stripe Products
  checkout.ts      # Checkout Session with line items
  orders.ts        # Webhook handler for fulfillment emails
```

**When to provision:** Commerce add-on purchased at initial checkout or upsold post-purchase; triggers catalog editor seed from ingestion data (menu items from GBP category defaults).

## Tech stack

| Layer | Choice |
|-------|--------|
| App framework | Next.js 16 (App Router) + TypeScript |
| Styling | Tailwind CSS v4 |
| Hosting | Vercel |
| Payments | Stripe Checkout |
| Platform voice | Vapi / Retell — sells bundles, customizes preview |
| Client AI phone | Twilio + Vapi / Retell — Complete tier inbound for client's business |
| Digital sales | Stripe Checkout + lead stub + Resend notifications |
| E-commerce | Stripe Products + catalog JSON (Commerce add-on) |
| Marketing LLM | OpenAI or Anthropic — content generation |
| Marketing scheduling | Buffer API (MVP); direct GBP/Meta APIs (Phase 2) |
| Email | Resend (transactional + outreach + marketing sequences) |
| Database | TBD — Convex or PostgreSQL for leads + voice session logs + marketing queue |
| Auth (dashboard) | Clerk / NextAuth — operator monitoring only |

## Repository structure

```
src/
  app/
    page.tsx                    # Agency marketing landing
    dashboard/                  # Operator monitoring (read-only metrics)
    preview/[slug]/             # Client preview sites
    checkout/                   # Self-serve Stripe checkout UI
    api/
      stripe/checkout/          # Bundle checkout session API (stub)
      marketing/generate/       # POST — generate marketing copy (stub)
      voice/
        platform/webhook/       # Platform voice webhooks (stub)
        client/webhook/         # Client AI phone webhooks (stub)
  lib/
    marketing/
      types.ts                  # Content types, automation levels
      generators.ts             # LLM generator interface (stub)
      index.ts                  # Public exports
    voice/
      config.ts                 # Provider env config
      types.ts                  # Call events, tool payloads
      platform/                 # Outreach + sales voice handlers (stub)
      client/                   # Client receptionist handlers (stub)
    commerce/
      catalog.ts                # Product catalog types (stub)
      orders.ts                 # Order notification handlers (stub)
    sales/
      crm.ts                    # Lead routing stub
docs/
  PRODUCT-BUNDLES.md            # Tier definitions and use cases
  VOICE-AGENT-FLOW.md           # Platform vs client voice scripts
  MARKETING-AUTOMATION.md       # Content types, automation, compliance
```

## Security notes

- Never commit `.env.local` or API keys.
- Validate Stripe and voice provider webhook signatures.
- Restrict dashboard to operator; customers never log in.
- Store call transcripts with retention limits (see COMPLIANCE.md).
- TCPA/consent for outbound calls — document lawful basis per jurisdiction.

## Environment variables

See `.env.example` for Stripe, voice provider, email, and hosting keys.
