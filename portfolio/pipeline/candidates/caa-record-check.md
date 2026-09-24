# CAA record checker

Scored 2026-09-24. Composite 6.75 · floor 1 (ai_leverage). Same shape as this
portfolio's other deterministic DNS/HTTP checker ventures: which certificate
authorities are authorized to issue for a hostname is decided by applying
RFC 8659's own published processing rules to a real DNS answer, not a model
in the loop — which is what keeps the per-user cost at zero and every finding
traceable to a specific record and rule.

A developer or DNS administrator who has just hit "CAA record prevents
issuance" on a certificate renewal — or who is doing pre-launch DNS
verification after switching hosting providers — hits a specific,
well-documented, and still-recurring certificate-management footgun: a CAA
(Certification Authority Authorization) DNS record restricts which CA may
issue for a domain, and getting it wrong (or not understanding how the
authorization is actually computed) produces a confusing, often
intermittent-feeling failure that recurs across unrelated hosting stacks.

## Why this venture, not another dev-tooling checker

`portfolio/pipeline/README.md`'s "archetype itself" section argues for the
checker/CLI shape over another `<trade>-bid-calculator`, and this portfolio
already has a family of "read what's actually there, apply the real
processing rules, name the exact evidence" DNS/HTTP checkers
(`email-auth-check`, `subdomain-takeover-check`, `cors-misconfig-check`,
`security-headers-check`, and others). `duplicate_check.py`, run against a
description naming exactly this mechanism (the RFC 8659 tree-walk, the
`issuewild` fallback, the critical-unknown-tag block, per-CA authorization
verdicts), scored every existing venture, screened-out row, and pipeline
candidate at 0.12 or below — `subdomain-takeover-check` closest, a different
DNS-hygiene footgun entirely (a dangling CNAME an attacker can claim, not
certificate-issuance authorization), and `email-auth-check` next closest
(SPF/DKIM/DMARC/BIMI mail authentication, not TLS certificate authorization).
0.12 is well under the 0.45 read-this-first bar. Nothing in
`screened-out.md` covers CAA, certificate-authority authorization, or
certificate issuance.

`dns-configuration-evidence` (a pipeline probe candidate, unbuilt) is a
recurring monitor that records DNS answers for a customer-authorized domain
and diffs them over time — a different product shape from this one, which is
a one-shot deterministic classifier anyone can point at any public hostname,
with no subscription and no customer-authorization boundary to manage.

## The one thing that makes this more than "show me the raw record," and the reason it is worth building at all

Dozens of free "CAA record lookup" tools already rank for the generic search
term (UptimeRobot, DNS Spy, Pulsetic, nslookup.io, whatsmydns.net, and
others) — every one of them found during screening shows the raw record text
at the exact hostname queried, and stops there. That is necessary and not
sufficient, because RFC 8659 applies rules a raw dump doesn't surface:

1. **The tree-walk.** A real CA does not stop at the exact name being
   requested — if it has no CAA records, the CA checks the parent domain,
   then that domain's parent, until it finds one. A tool that queries only
   the exact name reports "no CAA record, any CA may issue" for a subdomain
   whose parent actually restricts issuance — the single most common source
   of "why does my subdomain suddenly fail to renew" confusion on Let's
   Encrypt's own community support forum, which this screening pass found
   carries an ongoing, actively-answered stream of exactly this thread.
2. **The `issuewild` fallback.** Wildcard certificates are governed by
   `issuewild` when present at all; if entirely absent, `issue` covers both.
3. **The critical-flag trap.** A record can mark any tag — including a
   custom or misspelled one — critical, which requires a compliant CA that
   doesn't implement that exact tag to refuse issuance entirely, regardless
   of any `issue` records also present. Since no public CA implements an
   arbitrary custom tag, this effectively blocks every CA until fixed, and
   it is invisible in a plain record listing.
4. **The RFC 8657 account-binding parameters.** An `issue` value can carry
   `key=value` parameters after the issuer domain restricting issuance to a
   specific CA account or validation method — a parser assuming "exactly one
   token" breaks on this shape, and a DNSControl GitHub issue found during
   screening independently confirms this exact failure mode ("CAA value
   does not contain 3 fields").

That is the entire value proposition over a raw lookup or `dig`, and it is
pinned by `analyze.test.mjs` and `parse.test.mjs`'s dedicated test cases for
each rule.

## Scope, deliberately narrow

This tool never sends any request to the hostname being checked at all —
only to a public DNS-over-HTTPS resolver, reading CAA and CNAME records the
domain owner already published for anyone to see. That is a narrower, safer
request surface than most of this portfolio's checker family, which
typically also sends one live HTTP request to the target. The CA
issuer-domain shortlist (8 well-known CAs) is disclosed as a helpful list
sourced from each CA's own documentation, not an authoritative registry, and
the `--ca` flag / browser field accept any CA domain, not only the shortlist.

## Scoring

| Dimension | Score | Note |
|---|---|---|
| AI leverage | 1 | Pure deterministic application of RFC 8659's published processing rules to a real DNS answer; no model in the loop |
| Autonomous ops | 10 | Zero-dependency browser tool + CLI, no server, no queue, no ops |
| Time to revenue | 6 | Donations only; a developer who has just hit a CAA issuance failure wants an immediate self-check, plausible discovery via search inside weeks |
| Gross margin | 10 | Every request runs from the visitor's own browser or the user's own machine (CLI) to a public DNS resolver — this tool never contacts the hostname being checked at all. Serving one more visitor costs a static file |
| Defensibility | 3 | The RFC 8659 tree-walk and the issuewild/critical-flag fallback-rule interactions are a genuine, if narrow, correctness surface to get right — matching `security-headers-check`'s CSP-fallback-rule precedent for a 3 rather than the flatter 2 scored checkers whose whole differentiator is a single body-vs-status distinction — but a determined competitor could still reimplement it from the same published RFCs |
| Distribution | 6 | "CAA record prevents issuance" and "Blocking CAA record(s) found" are recurring, actively-answered threads on community.letsencrypt.org and a recurring certbot GitHub issue category, plus hosting-panel forum threads (DirectAdmin and others). Scored below the sibling checker family's typical 7 because several free CAA lookup tools already rank for the generic search term; none apply RFC 8659's tree-walk, the issuewild fallback, or the critical-flag rule, so the differentiation is diagnostic depth on a crowded term rather than being first to it |
| Liability containment | 9 | This tool never sends any request of any kind to the hostname being checked — only to a public DNS-over-HTTPS resolver, reading records the domain owner already published. There is no live-request-to-a-third-party surface to contain at all, which is why this scores above the sibling checkers that do send one GET to the target |
| Ethical robustness | 9 | Donations-only with no per-use fee and no revenue model that would reward misclassifying a CA's authorization in either direction; the tool gets strictly more useful to a domain owner as it is used, and a false "authorized" reading would only surface as their own next renewal failing — the same self-correcting incentive structure this portfolio's other read-only DNS/HTTP checkers already rely on |

Composite: (1+10+6+10+3+6+9+9)/8 = **6.75**. Floor: **1** (`ai_leverage`).

## Mitigation for the floor and near-floor dimensions

`ai_leverage` sits at the deliberate floor every deterministic checker in
this family carries — the classification is factual application of a
published IETF standard to a DNS answer, not a judgment call, so there is no
accuracy claim that needs a model behind it. `defensibility` (3) is a real,
named weakness rather than one masked by the composite: mitigated the same
way as the sibling checkers — the free-and-correct version, shipped first
with the narrowest honest scope and the RFC 8657 parameter-parsing edge case
already covered, is the moat available to a zero-marginal-cost product; a
copy competing on the same axis does not change the portfolio's economics.

## Verdict

**Graduate as a venture** (`ventures/caa-record-check`). Both gates clear
well above the floor of 5 (`liability_containment` 9, `ethical_robustness`
9). Kill criteria: no organic traffic or CLI/repo engagement after a fair
run per `portfolio/usage/README.md`; a materially better free tool covering
the same RFC 8659 tree-walk/fallback/critical-flag classification at the
same zero-install bar becomes the obvious default; or real user reports show
the CA shortlist or the RFC 8659/8657 parsing produces false positives or
negatives that cannot be fixed without expanding scope past what this
liability read covers.
