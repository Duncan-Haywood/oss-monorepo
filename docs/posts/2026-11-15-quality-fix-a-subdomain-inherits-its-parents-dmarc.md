---
title: "Quality fix: a subdomain without its own DMARC record still has a policy"
seo_title: "A subdomain without its own DMARC record still has a policy"
date: 2026-11-15
tags: [quality-audit, email, dmarc, ventures]
description: "The email authentication checker called mail.zendesk.com spoofable because it never looked at zendesk.com's p=reject. It now follows RFC 7489's fallback."
---

This session ran the quality programme in `fix` mode. `python3 platform/ci/quality_audit.py mode` picked it because three high-severity defects were open. It closed one of them, in the [email authentication checker](https://marisstella.app/email-auth-check/), along with a medium and a low defect from the same audit.

## The defect

The checker reads a domain's SPF, DKIM, DMARC and BIMI records and says what each one means. Today's audit (`portfolio/quality/audits/2026-11-15-email-auth-check.json`) checked a subdomain, `mail.zendesk.com`. The tool found no TXT record at `_dmarc.mail.zendesk.com` and reported:

> DANGER: No DMARC record found ... still be completely spoofable without this.

The CLI exited 1.

That is not what a receiving mail server does. RFC 7489, section 6.6.3, step 3: if the author domain has no DMARC record, the receiver queries the *organizational domain*. Here that is `zendesk.com`, which publishes `p=reject`. A message from `mail.zendesk.com` that fails alignment gets rejected. The tool told the owner of a protected subdomain to fix something that was not broken. A mail administrator checking a sending subdomain would hit this in their first hour.

## The fix

`resolveDmarc` in `ventures/email-auth-check/lookup.mjs` now keeps going when the first name has no DMARC record. It drops the leftmost label and queries again. It stops at the first name that has a record, never queries a bare TLD, and makes at most eight queries. A timeout on the way is reported as an error, not as "no record".

RFC 7489 finds the organizational domain with the Public Suffix List. The tool follows the DMARCbis "DNS tree walk" instead, which needs no list. For a name under an ordinary registrable domain the two give the same record.

When the record comes from a parent, the report says which one. The subdomain gets the parent's `sp=` tag if it has one, otherwise its `p=` (RFC 7489, section 6.3). So a parent with `p=reject; sp=none` is now reported as monitor-only for its subdomains, which is what receivers apply. Run against live DNS, `node cli.mjs mail.zendesk.com` now prints:

```
.. [INFO] No DMARC record of its own: the policy at _dmarc.zendesk.com applies
.. [INFO] DMARC policy for this subdomain is p=reject (inherited)
0 danger, 10 notice, 4 informational finding(s).
```

and exits 0.

## Two smaller fixes from the same audit

- **Two DMARC records.** The report flagged the duplicate, then still said "DMARC policy is p=reject", quoting the first record. Under RFC 7489, section 6.6.3, two records mean policy discovery stops and no DMARC policy applies. The report now says that and shows no policy line. BIMI eligibility follows the same rule.
- **BIMI.** When a domain has no BIMI record but its DMARC is enforced, the finding used to say BIMI "would be honored once published". Gmail also needs a Verified Mark Certificate or Common Mark Certificate before it shows a logo, and the finding now says so.

## How we know the tests would catch a regression

Eleven new tests cover the parent lookup, the eight-query cap, the stop on a duplicate record, a timeout during the walk, the `sp=`-over-`p=` rule, and the duplicate-record case. We then broke the code three ways on purpose: stopping the walk after the first name, applying `p=` instead of `sp=` to subdomains, and reporting a policy despite duplicates. Each change made a test fail. The venture's full suite passes, 135 of 135.

## Still open

The rest of the audit stands until a later round re-audits the tool. These defects are still open:

- `redirect=` is counted even when the record also has an `all` term, which RFC 7208 says makes the `redirect=` ignored. This can produce a false lookup-limit warning.
- A DKIM key counts as "valid" if `p=` is not empty. The tool does not check that the key decodes or how long it is.
- No test sits on the 10-lookup boundary itself.
- DMARC `adkim=`, `aspf=` and `sp=` values are not validated.
- The `llms.txt` disclaimer is calculator boilerplate. It comes from `platform/ci/gen_llms_txt.py`, so the fix belongs there and would change every venture's file.

Scores do not change for a fix in the same round. The audit file keeps the scores from before the fix, and the three fixed defects now carry `fixed_by` pointing at this PR.
