# Compliance

This document outlines legal and ethical considerations for Local Site Studio. **This is not legal advice.** Consult qualified counsel before scraping, emailing, or storing personal data in your target jurisdictions.

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

- **Manual + semi-automated:** Export lists from chambers of commerce, industry associations, or paid B2B data providers compliant with their licenses.
- **Google Places API:** Legitimate path for business metadata; budget for API costs.
- **No headless browser scraping** of Maps/Facebook in production without legal review.

## Email outreach

### United States — CAN-SPAM Act

- Identify message as an advertisement where applicable.
- Include valid physical postal address.
- Provide clear opt-out (unsubscribe) honored within 10 business days.
- Don't use deceptive subject lines or header information.
- Honor opt-outs permanently for that campaign/brand.

### EU / UK — GDPR & ePrivacy

- **B2B email** to corporate addresses may be permitted under legitimate interest in some contexts, but rules vary by country (e.g., UK PECR, Germany strict opt-in for cold email).
- Document lawful basis (legitimate interest assessment recommended).
- Provide privacy notice: what data you hold, why, retention, rights.
- Easy opt-out; don't email individuals who objected.

### Canada — CASL

- Generally requires consent for commercial electronic messages unless a narrow exemption applies (e.g., conspicuous publication of business email for relevant inquiry).
- Keep records of consent or exemption basis.

### Best practices (all regions)

- Email **business contact addresses** only when relevant to their business needs.
- Personalize; avoid spammy bulk blasts.
- Rate-limit sends; warm up new domains.
- Use SPF, DKIM, DMARC on sending domain.
- Maintain suppression list across campaigns.

## Telemarketing / AI discovery calls

If using outbound or AI phone calls:

- **US TCPA:** Prior express consent often required for autodialed marketing calls to cell phones; state mini-TTCPA rules vary (Florida, etc.).
- **UK TPS / CTPS:** Do not call numbers registered on Telephone Preference Service without consent.
- Record consent and call logs.
- AI voice disclosure requirements evolving — disclose automated nature where required.

**Recommendation:** Start with **email only**; add calls only with compliance workflow.

## Data retention & privacy

### Data minimization

Store only fields needed for outreach and site generation:

- Business name, category, location, public contact email/phone
- Preview slug, pipeline status, outreach timestamps
- Avoid storing unnecessary personal data about owners

### Retention policy (suggested)

| Data | Retention |
|------|-----------|
| Active leads in pipeline | Until converted or 12 months inactive |
| Opted-out / do-not-contact | Indefinitely (suppression list) |
| Paid customer records | Duration of service + legal/tax requirements |
| Email logs | 24 months |

### Security

- Encrypt data at rest (database provider default).
- Restrict dashboard access (auth + RBAC).
- Don't log full payment card data (Stripe handles PCI).

### Privacy policy & terms

Before public launch, publish:

- Privacy policy (what you collect, why, sharing, rights)
- Terms of service for purchased websites
- Cookie notice if using analytics

## Stripe & payments

- Use Stripe Checkout (PCI scope minimized).
- Clear refund policy on checkout page.
- Collect only necessary billing info via Stripe.

## Intellectual property

- Templates: you own; grant client license on payment.
- Client-provided assets: client warrants they have rights.
- Stock images: use licensed libraries (Unsplash license, paid stock) documented per site.

## Checklist before first outreach batch

- [ ] Legal review for target country/state
- [ ] Privacy policy and unsubscribe mechanism live
- [ ] Sending domain authenticated (SPF/DKIM/DMARC)
- [ ] Data source documented (API license or manual)
- [ ] Suppression list implemented
- [ ] No scraping of Maps/Facebook UI without approval

## References

- [FTC CAN-SPAM](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business)
- [ICO direct marketing (UK)](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/)
- [Google Maps Platform Terms](https://cloud.google.com/maps-platform/terms)
- [Stripe compliance](https://stripe.com/guides/general-data-protection-regulation)
