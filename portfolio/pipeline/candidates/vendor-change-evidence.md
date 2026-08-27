# Candidate: Vendor-change evidence monitor

**One line.** A customer-configured monitor that snapshots SaaS terms, privacy,
subprocessor, and security pages, then sends a source-linked diff when a vendor
changes them.

**Verdict: graduated from probe.** The artifact is cheap, deterministic, and the
liability boundary is clear, but distribution is unproven and the archive is
only valuable for the vendors a customer actually watches. The local capture
and diff slice is now implemented; the practitioner experiment remains open.

Scored 2026-08-24. Composite 6.75 · floor 4 (defensibility, distribution).

| Dimension | Score | Why |
|---|---:|---|
| AI leverage | 7 | Models classify changed sections, remove navigation noise, and explain what text moved; fetching, hashing, and diffing remain deterministic |
| Autonomous ops | 9 | Scheduled fetch, snapshot, diff, and notification run without an operator queue |
| Time to revenue | 6 | A small security or procurement team can trial it quickly, but urgency depends on an upcoming vendor review |
| Gross margin | 9 | Static pages, object storage, and modest summarisation inference are the delivery costs |
| Defensibility | 4 | A generic monitor is copyable; customer-specific watch lists and a signed history can become a useful record, but do not create a moat on day one |
| Distribution | 4 | Security newsletters and vendor-management communities are plausible channels, but no owned channel or partner is established |
| Liability containment | 7 | The product reports source text and timestamps; it does not decide whether a contract changed, give legal advice, or attest to compliance |
| Ethical robustness | 8 | Customers choose the public pages they monitor, receive provenance, and can inspect every snapshot; the product does not assemble personal profiles or rank vendors |

## Boundary

The product is an evidence feed, not a contract-review or compliance service.
It must:

- monitor only public pages or URLs supplied by the customer;
- preserve the fetched URL, timestamp, response metadata, and before/after text;
- label inaccessible or ambiguous fetches as inconclusive rather than silently
  reporting no change;
- avoid statements such as "your DPA is now invalid" or "this vendor is
  compliant"; and
- let the customer decide what contractual or security consequence a change
  has.

## Why this is distinct

This is not [public-record watch](public-record-watch.md): it monitors
customer-selected commercial vendor pages, not government registers or people.
It is not [CRA evidence desk](cra-evidence-desk.md): it does not map software
to a legal obligation or suppress dependency findings. It is also not a generic
documentation-drift tool: the buyer pays for an auditable change history tied to
third-party vendors they already use.

## Where it can fail

- **Distribution is unproven.** Procurement and security teams may already use
  vendor-management suites. The first probe must find buyers before adding
  integrations.
- **Page changes are not always policy changes.** Templates, cookie banners, and
  redesigns can create noisy diffs. Section-aware grouping and a customer-visible
  raw diff are required; the model summary cannot be the only evidence.
- **A missing snapshot can look like stability.** Fetch failures and robots or
  rate-limit responses must be first-class states in the customer record.

## First experiment

Two weeks, under EUR150:

1. Build a local watcher for ten public vendor pages across terms, privacy, and
   subprocessor sections. Replay a month of archived snapshots where available
   and hand-label substantive versus cosmetic changes.
2. Render a customer-facing alert with the raw diff, source URL, timestamp, fetch
   status, and an explicit "not legal advice" boundary.
3. Show it to ten security, procurement, or privacy practitioners in existing
   public communities. Ask three to provide a watch list and one to pre-pay
   EUR50/month for a 30-day pilot.

Kill it if the probe cannot produce three qualified conversations or if no one
will pilot after seeing a substantive, source-linked alert. If conversations
exist but the archive is not valued, retain the distribution finding and reject
the defensibility mitigation rather than calling the monitor a moat.

## Mitigations required by the rubric

The floor scores require named mitigations before graduation. For
defensibility, retain immutable customer-specific snapshots and export them in a
portable format; measure whether a new entrant can reconstruct the same history
without the customer's watch list. For distribution, secure one channel partner
or a repeatable practitioner community before building a hosted or scheduled
component for distribution.
