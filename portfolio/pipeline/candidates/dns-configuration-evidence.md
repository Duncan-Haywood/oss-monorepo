# Candidate: DNS configuration evidence monitor

**One line.** A customer-authorized monitor that records DNS answers and
delegation metadata for selected domains, then emits a source-linked diff when
the observed configuration changes.

**Verdict: probe.** The record can make an operational change inspectable
without claiming that a domain is secure, deliverable, or compliant. The open
questions are whether an MSP or agency has a recurring review workflow and
whether customer history is worth more than existing DNS tools.

Scored 2026-08-24. Composite 6.625 · floor 4 (defensibility, distribution).

| Dimension | Score | Why |
|---|---:|---|
| AI leverage | 6 | Models can group record changes, explain likely operational impact, and suppress formatting noise; resolution, canonicalization, and comparison remain deterministic |
| Autonomous ops | 9 | Scheduled lookups, snapshotting, comparison, and notification run unattended |
| Time to revenue | 6 | A provider can trial it against a handful of domains quickly, but urgency is episodic unless it fits a recurring client review |
| Gross margin | 9 | Resolver requests, object storage, and modest summarisation inference are the delivery costs |
| Defensibility | 4 | A signed, portable, customer-specific history may compound, but lookup and diff logic are easy to reproduce |
| Distribution | 4 | Managed service providers and domain-management communities are plausible channels, but no owned channel is established |
| Liability containment | 7 | The product reports observed answers and timestamps; it does not promise uptime, email delivery, security, or legal compliance |
| Ethical robustness | 8 | It monitors domains selected by the customer, preserves provenance, and avoids collecting visitor or mailbox data |

## Boundary

The product is an operational evidence feed, not a DNS or security authority. It
must:

- monitor only domains the customer owns or is authorized to inspect;
- retain resolver, timestamp, query type, response, and error metadata so an
  absent response is distinguishable from an unchanged record;
- label resolver disagreement, timeout, DNSSEC failure, and provider refusal as
  inconclusive rather than silently converting them to a change or no-change;
- avoid statements such as "your email is secure," "your domain is compliant,"
  or "this record will deliver mail"; and
- let the customer decide whether an observed change needs remediation.

## Why it is distinct

This is not [vendor-change evidence](vendor-change-evidence.md): its input is
DNS observations for customer-authorized domains, not public vendor policy
pages. It is not an uptime monitor or an email deliverability tester: it does
not promise reachability, send mail, or infer a domain's security posture. It is
also not a registrar or DNS-management interface; it never writes records.

## Where it can fail

- **Distribution is unproven.** MSPs may already bundle this into managed DNS
  services. The first probe must find a repeatable practitioner channel before
  a hosted service is justified.
- **DNS answers are contextual.** Resolver location, caching, split-horizon
  DNS, and transient failures can create apparent changes. The record needs
  resolver identity and uncertainty states, not a single green/red result.
- **The archive may be a commodity.** A customer can recreate snapshots with
  standard tools. The probe must test whether portable history and review
  workflow, rather than lookup code, are the paid value.

## First experiment

Seven days, under EUR50, with no external account or credential:

1. Build a local recorder around public DNS fixtures and captured resolver
   responses. Emit JSON and Markdown containing query context, raw answers,
   timestamps, and explicit timeout/disagreement states.
2. Add mutations for a changed TXT record, changed nameserver delegation,
   resolver disagreement, timeout, and unchanged answer. The report must never
   label an inconclusive observation as stable.
3. Show the report privately to ten MSP, web-agency, or domain-operations
   practitioners found through public technical communities. Ask three whether
   they perform this review repeatedly for clients and one to pre-pay EUR50 for
   a 30-day pilot.

Kill it if fewer than three qualified conversations identify a recurring review
workflow, or if no practitioner values the portable, source-linked history
above existing DNS tooling. Record that result before adding integrations.

## Mitigations required by the rubric

The floor scores require named mitigations before graduation. For
defensibility, retain immutable customer-specific snapshots with portable
export and measure whether an independent operator can reconstruct the same
history from the customer's selected schedule. For distribution, secure one
named MSP, agency, or repeatable practitioner community before building a
hosted product.
