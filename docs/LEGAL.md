# Legal — Maris Stella Labs

**This document is operational guidance, not legal advice.** Have a qualified attorney review before launch, especially for outbound email and AI voice calls.

## Two-layer branding

| Layer | Name | Used for |
|-------|------|----------|
| **Legal entity** | Maris Stella Labs | Stripe merchant account, contracts, Terms/Privacy controller, CAN-SPAM/TCPA footer disclosures, invoices, registered agent |
| **Public brand** | `[TBD — set NEXT_PUBLIC_BRAND_NAME]` | Marketing site, outreach emails (From name), voice agent persona, preview pages, social handles |

**Maris Stella Labs** (Colorado, USA) is the legal entity that owns and operates the business. The **public brand** is the customer-facing name — it can differ from the legal entity name.

### DBA / trade name

If the public brand differs from "Maris Stella Labs", file a **trade name (DBA)** with the Colorado Secretary of State before using it in commerce:

| Item | Status |
|------|--------|
| **Public brand name** | `[TBD]` — e.g. SitePreview, LocalLaunch, etc. |
| **DBA / trade name filing** | `[PLACEHOLDER]` — required if brand ≠ legal entity name |
| **Env var** | `NEXT_PUBLIC_BRAND_NAME` (public) · `NEXT_PUBLIC_LEGAL_ENTITY=Maris Stella Labs` (legal) |

Until the public brand is chosen and DBA filed (if needed), use the placeholder in `.env.example` and do not run paid outreach under an unregistered trade name.

## Operating entity

| Field | Value |
|-------|--------|
| **Legal name** | Maris Stella Labs |
| **State of operation** | Colorado, USA |
| **Public brand** | `[TBD — NEXT_PUBLIC_BRAND_NAME]` |
| **Business model** | Pre-built websites for local businesses ($500 one-time, self-serve checkout) |

All payment processing, contracts, and compliance obligations attach to **Maris Stella Labs**. Marketing and outreach may lead with the **public brand**; legal disclosures must still identify Maris Stella Labs where required (CAN-SPAM physical address, Stripe receipts, Terms/Privacy).

## Placeholders to complete with counsel

Before public launch or first outreach batch, replace bracketed placeholders and confirm with your lawyer:

| Item | Status | Notes |
|------|--------|-------|
| **Public brand name + DBA** | `[TBD]` | File trade name if brand ≠ Maris Stella Labs |
| **Registered business address** | `[PLACEHOLDER]` | Required for CAN-SPAM physical address in every commercial email |
| **EIN / tax ID** | `[PLACEHOLDER]` | For Stripe merchant account and tax reporting |
| **Entity type** | `[PLACEHOLDER]` | LLC, corporation, etc. — Colorado Secretary of State filing |
| **Registered agent** | `[PLACEHOLDER]` | If required for your entity type |
| **Terms of Service** | Draft below | Publish at `/terms` |
| **Privacy Policy** | Draft below | Publish at `/privacy` |
| **Refund policy** | `[PLACEHOLDER]` | Link from checkout and Terms |
| **Colorado sales tax** | Review with CPA | Digital services / website deliverables may have tax implications |

### Suggested registered address format (CAN-SPAM)

```
Maris Stella Labs
[Street address]
[City], CO [ZIP]
United States
```

Use a real address where Maris Stella Labs can receive mail. A P.O. Box is permitted under CAN-SPAM if it is a valid postal address you check.

---

## Terms of Service (outline — publish at `/terms`)

**Status:** Placeholder — full Terms to be drafted/reviewed by attorney.

Suggested sections:

1. **Parties** — Agreement between customer ("Client") and Maris Stella Labs ("Company"), Colorado, USA. Service marketed under public brand `[TBD]`.
2. **Service** — Pre-built website package as described at purchase.
3. **Preview** — Preview sites are provided for evaluation; Company may remove unpublished previews after [X] days.
4. **Payment** — One-time fee via Stripe; merchant of record Maris Stella Labs.
5. **Deliverables** — Landing page, hosting setup assistance, domain connection documentation.
6. **Client obligations** — Accurate information, rights to logos/photos provided, timely DNS cooperation.
7. **Intellectual property** — Company retains template/framework rights; Client receives license to deployed site content upon full payment.
8. **Revisions** — Scope of included changes vs. paid add-ons.
9. **Refund policy** — `[PLACEHOLDER — e.g., 7-day satisfaction window before go-live]`
10. **Disclaimer** — Sites provided "as is" within stated scope; no guarantee of specific business results.
11. **Limitation of liability** — Standard caps per attorney advice.
12. **Governing law** — State of Colorado, USA.
13. **Contact** — Maris Stella Labs, `[address]`, `[support email]`.

---

## Privacy Policy (outline — publish at `/privacy`)

**Status:** Placeholder — full Privacy Policy to be drafted/reviewed by attorney.

Suggested sections:

1. **Controller** — Maris Stella Labs, Colorado, USA (operator of public brand `[TBD]`).
2. **Data collected** — Business contact info from public sources; email/phone; call transcripts (voice agent); payment data via Stripe (not stored on our servers).
3. **Purpose** — Outreach, site customization, payment, service delivery.
4. **Lawful basis (US)** — Legitimate interest for B2B outreach where applicable; contract for paying customers.
5. **Sharing** — Stripe, Vercel, email/voice providers; no sale of personal data.
6. **Retention** — See [COMPLIANCE.md](./COMPLIANCE.md) retention table.
7. **Opt-out** — Unsubscribe link (email); "stop calling" honored on voice (TCPA).
8. **Colorado Privacy Act (CPA)** — Note: Colorado has state privacy law; evaluate applicability if processing personal data of Colorado residents beyond B2B context. CCPA (California) does not apply unless thresholds met — document assessment with counsel.
9. **Rights** — Access, correction, deletion requests to `[support email]`.
10. **Security** — Reasonable safeguards; no PCI data stored directly.
11. **Changes** — Notice on website.
12. **Contact** — Maris Stella Labs, `[address]`.

---

## CAN-SPAM compliance (email outreach)

Every commercial email **must identify Maris Stella Labs** in the footer (legal entity). The **From name** may use the public brand:

- **From name:** e.g. `{Public Brand}` or `{Public Brand} Team`
- **From address:** Domain you control (e.g. `hello@yourbrand.com` or `noreply@marisstellalabs.com`)
- **Subject lines:** Not deceptive
- **Body:** Clear identification of sender and offer
- **Physical address:** Valid postal address of Maris Stella Labs (see above)
- **Unsubscribe:** Working opt-out, honored within 10 business days
- **Identification:** Disclose message is a commercial solicitation where required

Footer template:

```
---
{Public Brand}
A Maris Stella Labs company

Maris Stella Labs
[Street], [City], CO [ZIP]
Pre-built websites for local businesses

Unsubscribe: [link]
```

---

## Stripe merchant

- **Stripe account business name:** Maris Stella Labs
- **Statement descriptor:** Public brand or abbreviated form (within Stripe character limits)
- **Business address:** Colorado registered address matching Stripe verification
- **Product description:** Website design and deployment — standard package

Checkout and receipts should show **Maris Stella Labs** as the seller (legal entity). Marketing copy on checkout may reference the public brand.

---

## Voice agent disclosures

AI voice agents must:

1. **Introduce with the public brand:** "This is [Assistant name], an automated assistant from **{Public Brand}**" — not Maris Stella Labs unless counsel requires legal entity identification on the call.
2. **Disclose AI/automation** where required by state or federal guidance.
3. **Offer opt-out:** Honor verbal "stop calling" / "remove me" via `opt_out` tool — sync to email suppression list.
4. **Outbound TCPA:** Do not place automated marketing calls without documented consent basis — see [COMPLIANCE.md](./COMPLIANCE.md).
5. **Recordings/transcripts:** Disclose if calls are recorded; define retention in Privacy Policy.

See [VOICE-AGENT-FLOW.md](./VOICE-AGENT-FLOW.md) for scripts.

---

## Colorado business context

- **Formation:** Register entity with [Colorado Secretary of State](https://www.sos.state.co.us/) if not already done.
- **Trade name:** File DBA if public brand differs from legal entity name.
- **Tax registration:** Consult CPA for Colorado state tax obligations.
- **No state-specific CAN-SPAM override** — federal CAN-SPAM applies to commercial email in the US.
- **Colorado Privacy Act (CPA):** May apply depending on data volume and processing activities; assess with counsel (distinct from California CCPA thresholds).
- **Telemarketing:** Federal TCPA applies to interstate calls; Colorado may have additional consumer protection rules — verify before outbound voice automation.

---

## Pre-launch legal checklist

- [ ] Entity formed and in good standing (Colorado)
- [ ] Public brand chosen; DBA filed if brand ≠ Maris Stella Labs
- [ ] EIN obtained
- [ ] Registered business address for CAN-SPAM (not placeholder)
- [ ] Terms of Service published at `/terms`
- [ ] Privacy Policy published at `/privacy`
- [ ] Stripe account verified as Maris Stella Labs
- [ ] Email domain authenticated (SPF/DKIM/DMARC)
- [ ] TCPA/consent workflow documented before outbound voice
- [ ] Attorney review of outreach templates and voice scripts

## Related documents

- [COMPLIANCE.md](./COMPLIANCE.md) — operational compliance detail
- [VOICE-AGENT-FLOW.md](./VOICE-AGENT-FLOW.md) — call scripts
- [BUSINESS-MODEL.md](./BUSINESS-MODEL.md) — funnel and outreach copy
