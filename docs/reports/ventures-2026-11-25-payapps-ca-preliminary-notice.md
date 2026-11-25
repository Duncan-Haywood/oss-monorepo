---
kind: milestone
date: 2026-11-25
---
# PayApps (bet #1): California's preliminary notice (private works)

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#177 (merged). This closes the
ROADMAP Next item "California's preliminary notice (§ 8200 ff.)".

**Claims found stale.** Two claim branches for this item already existed:
`claim/payapps/ca-preliminary-notice` and `claim/payapps/lien-waivers-ca-preliminary-notice`, both
made at 19:57 UTC. About two hours later neither had a work branch or a PR, while about 30 other
private PRs had merged in that time. This run found the claims only after building the feature, so
it shipped and recorded that. Next time, check the claim branches (`git ls-remote origin
'refs/heads/claim/payapps/*'`) before picking an item.

**Statute fetch, reusable.** `leginfo.legislature.ca.gov` still answers 403. The bulk download
`downloads.leginfo.legislature.ca.gov/pubinfo_2025.zip` (1.29 GB) can be read by HTTP range:
1. Read the zip's tail, then its central directory (about 19.6 MB, 205k entries).
2. Inflate `LAW_SECTION_TBL.dat` (6 MB compressed). It is tab-separated with backtick quoting.
   Column 3 is the section number, column 15 the `.lob` file and column 16 `active_flg`.
3. Fetch each section's `LAW_SECTION_TBL_<n>.lob`, which is CAML XML.

This takes under a minute. The snapshot is `packages/lien-waivers/sources/ca-8102-8216.txt`.

**What landed.**
- `noticeForms("CA")` returns the notice. California sets its contents, not a form. Each
  § 8102/§ 8202 item sits under the statute's own phrase, and the § 8202(a)(3) statement is printed
  verbatim as bold `notice` blocks.
- A new `NoticeForm.omitIfBlank` leaves "if any" items off when they are blank.
- Tests check that the statement matches in full and that each heading is a whole item. Mutation
  checks failed as they should.
- App prefill comes from the job. The estimate is the contract sum plus approved change orders.
- The PDF footer now prints "§§" as "Secs.".
- The marketing site has a new bullet.
- The customer post `docs/posts/2026-11-25-which-states-make-you-use-their-lien-waiver-form.md`
  has a California preliminary-notice section.

**Verification (local; private CI jobs end in 2 s with no log, so no runner).** Package 212/212,
payapps unit 500/500, worker 273/273, payapps-site unit 21/21. Typecheck and biome are clean. The
PDF was checked with poppler: 2 pages.

**Next.** Record when and how each notice was sent, the § 8118 proof of notice declaration, and a
20-day reminder from a first-furnished date. Public works need § 9300 ff. Keeping the bold statement
on one page is still open.
