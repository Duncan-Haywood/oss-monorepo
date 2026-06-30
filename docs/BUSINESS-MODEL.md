# Business model

**Legal entity:** Maris Stella Labs · Colorado, USA  
**Product:** Local Site Studio

## Value proposition

Maris Stella Labs sells **pre-built websites** through the Local Site Studio service to local businesses. The differentiator is **preview before purchase** plus **zero human sales friction**: customers get a link, talk to an AI assistant if they want changes, and pay $500 self-serve — no waiting on a salesperson.

## Operating model: zero-touch operator

| Traditional agency | Local Site Studio |
|--------------------|-------------------|
| Operator discovery calls | **AI voice agent** gathers branding and answers questions |
| Manual email replies | Automated sequences + voice callback number |
| Custom quotes | Fixed $500 (+ optional e-commerce add-on) |
| Operator deploys site | Automated post-payment deploy |

**Operator role:** Configure automation, monitor dashboard metrics, handle edge-case alerts (failed payments, deploy errors) — not day-to-day sales.

## Target customers

- **Geography:** Business-friendly countries (US, UK, Canada, Australia — start with one metro).
- **Segments:** Restaurants, salons, trades, retail, gyms, professional services with weak or no web presence.
- **Profile:** Listed on Google Maps, reachable phone/email, would benefit from a simple landing page.

## Pricing

| Package | Price | Includes |
|---------|-------|----------|
| Standard landing site | **$500** one-time | Marketing site, mobile responsive, contact form, map embed, basic SEO, subdomain hosting, domain connection docs |
| E-commerce lite add-on | **+$200–400** (TBD) | Product catalog, Stripe checkout |
| Rush / custom | Quote | Only if automated flow cannot satisfy (exception path) |

**Optional recurring (future):** Hosting + minor updates at $29–49/mo.

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

### Email 1 — Preview delivery

**Subject:** `{BusinessName} — we built your website (free preview)`

**Body outline:**

1. **Maris Stella Labs** builds sites for local businesses — yours is ready to preview.
2. Link: `https://{slug}.preview.yourdomain.com`
3. **Call us anytime:** `{VOICE_CALLBACK_NUMBER}` — AI assistant from Maris Stella Labs can walk you through and make changes.
4. **Or buy now:** checkout link on preview page — $500 to Maris Stella Labs via Stripe, no call required.
5. CAN-SPAM footer: **Maris Stella Labs** physical address (Colorado), unsubscribe.

### Email 2 — Follow-up (automated, 3–5 days)

- Reminder + preview link + callback number.
- "Prefer not to call? Click Claim on your preview page."

### Email 3 — Final touch (7–10 days)

- Last automated note; opt-out honored permanently.

### Outbound voice (optional, automated)

Triggered when lead has phone and consent basis documented.

**Opening:** "Hi, this is [Assistant], an automated assistant from **Maris Stella Labs**. We built a preview website for {BusinessName} through our Local Site Studio service. I can text you the link or walk you through it now — takes about two minutes."

If no answer: voicemail with preview URL (where legally permitted) + email backup.

## Voice agent vs self-serve

| Path | Best for |
|------|----------|
| **Self-serve checkout** | Customer happy with preview; minimal friction |
| **Inbound callback** | Questions, wants tweaks, needs reassurance |
| **Outbound call** | Higher engagement markets; phone-first SMBs |

Both paths converge on the same Stripe checkout — voice agent can SMS/email the link during the call.

## Operator workflow (monitoring only)

1. Weekly: review dashboard conversion metrics.
2. On alert: failed webhooks, deploy errors, spike in opt-outs.
3. Monthly: tune voice scripts and email templates from transcript analytics.
4. **Not required:** daily outreach, discovery calls, manual site edits.

## Unit economics (rough)

| Item | Estimate |
|------|----------|
| Revenue per sale | $500 |
| Stripe fees | ~$15 |
| Voice (2–5 min call) | ~$0.10–0.50 (Vapi/Retell) |
| Email | ~$0.01–0.05 per lead |
| Hosting | ~$0–20/mo shared |
| Operator time | Near-zero at scale |

## Competitive positioning

- **vs DIY:** Done for you, preview first, AI help if needed — no learning curve.
- **vs agencies:** $500 flat, instant preview, no sales calls.
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
