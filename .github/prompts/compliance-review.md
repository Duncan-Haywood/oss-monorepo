# Recurring compliance review

The owner asked for this on 2026-10-20: a regular check that nothing in this
public repository breaks a law, a platform's terms, or ordinary ethics. A
monthly scheduled task runs it in a fresh session. Any session may also run
it by hand.

This is an engineering review, not legal advice. Say so in the report, and
name the items a lawyer should see.

## Steps

1. **Read the latest report.** It is the newest
   `docs/reports/*-compliance-review.md`. Its baseline table and its
   action-item table are where this run starts.
2. **Run the scan and compare.**

   ```
   python3 platform/ci/compliance_scan.py              # counts + examples (~1 min)
   python3 platform/ci/compliance_scan.py --json > /tmp/scan.json
   ```

   For each check, give the change since the last baseline. A rise means new
   work brought the problem back. Find the PR that added it
   (`git log --format='%h %s' -- <path>`) and name it in the report. A
   `secret` count above 0 matters most: report the path, never the value,
   and tell the owner in your reply to rotate the credential. Don't fix it by
   deleting the file, because history is public.
3. **Check the open action items.** For each unticked item, decide whether it
   is now done (cite the commit), still open, or no longer applies (say why).
4. **Review what changed.** Get the list of what changed since the last report
   with `git log --since=<last report date> --name-only --format= origin/main | sort -u`.
   Fetch history first (`git fetch --deepen=500 origin main`; see
   `CLAUDE.md`, "Shallow clones lie about history"). Read the changed files
   against the checklist below. No need to re-read areas that did not change
   unless the last report says to.
5. **Write `docs/reports/<YYYY-MM-DD>-compliance-review.md`.** Use the same
   shape as the last one: short version, baseline table with the change from
   last time, findings (High/Medium/Low/checked-and-fine), and the
   action-item table carried forward. New items get the next free `A<n>` id.
   If nothing is new, say that in the first line.
6. **Land it.** Use a PR and merge it yourself, per
   `.github/prompts/land-your-work.md`. A report alone is a thin run. Also
   fix at least one open **agent** action item, the highest severity first,
   in the same PR or a second one. Fix it in shared code where you can
   (`platform/pages/`, generators), not page by page.

## Checklist

### Platform terms and law

- **Secrets:**
  - no credentials in the tree, commit messages, PR text, or workflow logs.
- **Scheduled automation:**
  - new `schedule:` workflows are off by default (`vars.*_ENABLED`);
  - they build, test, deploy or publish this repo, with no unrelated compute;
  - they do not work around GitHub's limits.
- **Distribution (`platform/distribution/`, `portfolio/distribution/`):**
  - no unsolicited messages or email;
  - no fake accounts or reviews, and no paid placement;
  - bot posts are labelled;
  - nothing is posted to communities that forbid automation;
  - every channel is off by default with a dry run.
- **Scraping and fetching:**
  - official APIs only;
  - robots.txt and the site's terms are respected;
  - a user agent is set.
- **Security tools:**
  - each one checks one target the user names;
  - each says to use it only on systems you own or are authorised to test;
  - there is no bulk or internet-wide mode.

### Consumer protection

- **Disclaimers:**
  - the PRODUCT_PLAYBOOK §5b disclaimer is present (enforced by
    `platform/pages/check.mjs`);
  - tax, legal, finance, health, immigration and employment tools also say
    "not … advice".
- **Professional advice:**
  - no tool reads as individualized legal or medical advice;
  - no document generator for court, immigration or estate filings;
  - no dosage or diagnosis tools.
- **No fabricated social proof:**
  - no `AggregateRating` or `Review` markup;
  - no invented user counts and no "trusted by";
  - no testimonials and no fake urgency.
- **Affiliate links:**
  - any affiliate link is disclosed (FTC).
- **Competitor claims:**
  - claims about competitors are sourced and dated;
  - pages naming a brand say they are not affiliated with it.

### Privacy

- **Served pages:**
  - no third-party requests (scripts, fonts, pixels);
  - the counter stays cookieless and honours DNT and GPC.
- **Cookies:**
  - non-essential cookies are opt-in.
- **Tools that handle other people's personal data:**
  - each tells its operator they are the data controller.
- **Bring-your-own-key AI:**
  - keys are never stored;
  - the page says where the user's data is sent.
- **Products involving cameras, health, children or employees:**
  - note any extra law that applies (GDPR impact assessment, workplace
    monitoring rules, COPPA).

### Licensing, data and research

- **Vendored code and assets:**
  - no vendored GPL or AGPL code in the MIT tree;
  - fonts and images carry their licence.
- **Third-party data:**
  - no third-party dataset or text is committed unless its licence allows
    redistribution;
  - restricted microdata is downloaded by script, never committed;
  - data-use terms that ask for something (citation, notifying the
    principal investigator) are met.
- **Personal data:**
  - no personal data about real people (usernames, health disclosures)
    in committed data.
- **Research results:**
  - reported numbers trace to files in the tree (`research/CLAUDE.md`).

### SEO honesty

- **Unique pages:**
  - no templated near-duplicate pages (Google's "scaled content abuse" and
    doorway rules);
  - each page needs its own substance, not a swapped noun.
- **Markup:**
  - no keyword stuffing or hidden text;
  - structured data matches what is visible on the page.

## Rules

- **Read-only on anything outside this repo.** Don't probe live third-party
  sites to "test" them.
- **Owner-only items are named as owner items:** signing agreements,
  rewriting history, enabling a channel, legal opinions. Queue them with
  `portfolio/ledger/decision_queue.py` only when shipping is blocked and the
  item isn't already queued.
- **Prefer not to widen the scanner to chase a one-off finding.** Add a check to
  `platform/ci/compliance_scan.py`, with a test, only when the finding is
  regular enough to count across the tree.
