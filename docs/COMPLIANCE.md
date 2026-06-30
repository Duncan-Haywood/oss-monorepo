# Compliance

Legal and ethical considerations for **Maris Stella Labs** (Colorado, USA), operator of the **Local Site Studio** product. **This is not legal advice.** Consult qualified counsel before scraping, emailing, placing automated voice calls, or storing personal data.

## Operating entity

All outreach, payments, and customer data processing should be conducted in the name of **Maris Stella Labs**, Colorado, USA. See [LEGAL.md](./LEGAL.md) for Terms, Privacy Policy, and CAN-SPAM address requirements.

## Data gathering & scraping

### General principles

1. **Prefer official APIs and licensed data** over scraping HTML.
2. **Use only publicly available business information** — name, address, phone, hours, public reviews summaries.
3. **Do not copy** copyrighted photos, logos, or long-form text from third-party sites without permission.
4. **Respect robots.txt** and site Terms of Service for any automated access.
5. **Document your data source** per lead for auditability.

### Platform-specific notes

| Platform | Considerations |
|----------|----------------|
| **Google Maps / Business Profile** | [Google Maps Platform Terms](https://cloud.google.com/maps-platform/terms) apply to Places API. Scraping the Maps UI violates Google's ToS. Use Places API (billing required) or manual research. |
| **Facebook / Meta** | [Platform Terms](https://developers.facebook.com/terms/) restrict automated collection. Graph API requires app review for many fields. Public Page info may be accessed within API rules — scraping is high risk. |
| **Yelp and other directories** | Each site prohibits scraping in ToS. Use partnerships, exports, or manual entry. |
| **Business websites** | Trademarks and copyright apply to logos and images. Ask the business for assets after interest is shown. |

### Recommended approach at launch

- **Google Places API:** Legitimate path for business metadata; budget for API costs.
- **Licensed B2B data providers** with documented license terms.
- **No headless browser scraping** of Maps/Facebook in production without legal review.

## Email outreach

### United States — CAN-SPAM Act (federal)

Applies to all commercial email to US recipients. **Critical for Maris Stella Labs:**

- **Identify sender:** Maris Stella Labs (Local Site Studio service)
- **Valid physical postal address** of Maris Stella Labs in Colorado — see [LEGAL.md](./LEGAL.md)
- Clear opt-out (unsubscribe) honored within 10 business days
- Non-deceptive subject lines and header information
- Honor opt-outs permanently (suppression list)

**Note:** CAN-SPAM is federal law; Colorado does not replace it with a separate email marketing statute for B2B, but general Colorado consumer protection laws still apply to unfair practices.

### Colorado considerations

- **Colorado Privacy Act (CPA):** Colorado has a comprehensive privacy law. Assess applicability with counsel — especially if processing personal data of Colorado residents beyond pure B2B business contact info. **CCPA (California)** applies only if your business meets California revenue/volume thresholds; document your assessment.
- **Colorado Unfair Trade Practices:** Avoid deceptive outreach claims about preview sites or pricing.
- **Entity compliance:** Ensure Maris Stella Labs is properly registered with the Colorado Secretary of State.

### EU / UK — GDPR & ePrivacy

If expanding beyond the US:

- B2B email rules vary by country; legitimate interest may apply in some contexts.
- Document lawful basis; provide privacy notice and opt-out.

### Canada — CASL

- Consent or narrow exemption required for commercial electronic messages.

### Best practices (all regions)

- Email **business contact addresses** relevant to the offer.
- Rate-limit sends; authenticate domain (SPF, DKIM, DMARC).
- Every email footer: Maris Stella Labs physical address + unsubscribe.

## Telemarketing / AI voice agents — TCPA (critical)

Automated and AI voice outreach is **high-risk** under the Telephone Consumer Protection Act (TCPA). This is the primary US federal law governing calls to cell phones and use of autodialers/AI voice systems.

### TCPA requirements (summary — not legal advice)

| Scenario | Typical requirement |
|----------|---------------------|
| **Marketing calls to cell phones** using autodialer / AI / prerecorded voice | **Prior express written consent** in most cases |
| **Marketing calls to landlines** | Less restricted federally; state laws may apply |
| **Informational / transactional** | Narrower exemptions — marketing preview sites is generally **marketing** |
| **Inbound calls** (customer calls you) | Lower risk — customer initiated contact |
| **Established business relationship** | Limited exemptions; do not rely on this for cold outbound AI calls without counsel |

### State law (including Colorado)

- TCPA is federal baseline; states may impose additional restrictions.
- **Colorado:** No separate mini-TCPA as strict as Florida, but comply with federal TCPA and general telemarketing rules.
- **Do Not Call Registry:** Scrub against National DNC for telemarketing calls where applicable.

### AI voice disclosure

- Disclose that the caller is an **automated AI assistant** calling on behalf of **Maris Stella Labs**.
- Honor verbal opt-out immediately ("stop calling," "remove me") — sync to suppression list.
- If recording calls or storing transcripts, disclose in Privacy Policy and where required by state law (Colorado is one-party consent for recording, but disclosure is still best practice).

### Recommended launch sequence

1. **Phase A:** Email outreach only (CAN-SPAM compliant with Maris Stella Labs address).
2. **Phase B:** **Inbound-only** voice — customer calls number from email/preview (lower TCPA risk).
3. **Phase C:** Outbound AI voice only after **TCPA consent strategy** approved by attorney (e.g., leads who opted in, or landline-only with legal review).

**Do not** launch automated outbound AI marketing calls to cell phones without explicit legal sign-off.

## Data retention & privacy

### Data minimization

Store only fields needed for outreach and site generation:

- Business name, category, location, public contact email/phone
- Preview slug, pipeline status, outreach timestamps, voice session summaries
- Avoid unnecessary owner personal data

### Retention policy (suggested)

| Data | Retention |
|------|-----------|
| Active leads in pipeline | Until converted or 12 months inactive |
| Opted-out / do-not-contact | Indefinitely (suppression list) |
| Paid customer records | Duration of service + legal/tax requirements |
| Email logs | 24 months |
| Voice transcripts | 90 days (adjust per Privacy Policy and counsel) |

### Security

- Encrypt data at rest (database provider default).
- Restrict dashboard access (auth + RBAC).
- Stripe handles PCI — Maris Stella Labs merchant account.

### Privacy policy & terms

Before public launch, publish at `/privacy` and `/terms`:

- Privacy policy naming **Maris Stella Labs** as controller
- Terms of service for purchased websites
- Cookie notice if using analytics

See [LEGAL.md](./LEGAL.md) for outlines.

## Stripe & payments

- Merchant of record: **Maris Stella Labs**, Colorado, USA
- Use Stripe Checkout (PCI scope minimized).
- Clear refund policy on checkout page.
- Statement descriptor recognizable to customers.

## Intellectual property

- Templates: Maris Stella Labs owns; grant client license on payment.
- Client-provided assets: client warrants they have rights.
- Stock images: licensed libraries only.

## Checklist before first outreach batch

- [ ] Maris Stella Labs entity registered (Colorado SOS)
- [ ] CAN-SPAM physical address live (not placeholder)
- [ ] Privacy policy and Terms published
- [ ] Unsubscribe mechanism and suppression list implemented
- [ ] Sending domain authenticated (SPF/DKIM/DMARC)
- [ ] Stripe verified as Maris Stella Labs
- [ ] Data source documented (API license or manual)
- [ ] TCPA strategy documented before any outbound voice
- [ ] Voice agent scripts identify Maris Stella Labs + AI disclosure
- [ ] No Maps/Facebook UI scraping without legal approval

## References

- [FTC CAN-SPAM](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business)
- [FCC TCPA](https://www.fcc.gov/consumers/guides/stop-unwanted-robocalls-and-texts)
- [Colorado Privacy Act (overview)](https://coag.gov/resources/colorado-privacy-act/)
- [Google Maps Platform Terms](https://cloud.google.com/maps-platform/terms)
- [Stripe compliance](https://stripe.com/guides/general-data-protection-regulation)
- [LEGAL.md](./LEGAL.md) — entity, Terms/Privacy outlines, voice disclosures
