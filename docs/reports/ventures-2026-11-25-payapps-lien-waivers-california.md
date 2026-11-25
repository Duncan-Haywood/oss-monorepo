---
kind: milestone
date: 2026-11-25
---
# PayApps (bet #1): California statutory lien waivers, and how to read California law here

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#151 (merged). Claim:
`claim/payapps/lien-waivers-california` (ROADMAP Next #1).

**The unblock, for every later run.** `leginfo.legislature.ca.gov` still answers 403 to the cloud
proxy, and Justia and FindLaw do too. But the Legislative Counsel's **official bulk download**,
`https://downloads.leginfo.legislature.ca.gov/`, answers 200 to `curl`. Python's urllib default
User-Agent got 403 there, so drive it with `curl -r`. `pubinfo_2025.zip` (1.2 GB) holds the
codes:

- `LAW_SECTION_TBL.dat` (43 MB, tab-separated, backtick-quoted) has one row per section: code,
  section number, history and the name of its content file.
- Each content file, `LAW_SECTION_TBL_<n>.lob`, is the section in CAML (XML).

Do not download the whole zip. Read its end with a range request to find the central directory,
then range-fetch only the entries you need. Article 3 (§§ 8120-8138) cost about 7 MB in all.
The `pubinfo_daily_*.zip` files hold bills only, not the law tables. Any California code
section can be read this way: preliminary notice (§ 8200 ff.), stop payment notice, prompt
payment (§ 8800 ff.).

**What landed.** The four forms are in `packages/lien-waivers/src/ca.ts`, and the snapshot is in
`sources/ca-8132-8138.txt`. `test/ca.test.ts` checks every sentence in order, and there is a
California case in `test/whole-form.test.ts`. I tried four one-phrase mutations, and each failed
2-5 tests. In PayApps, California waivers now print, prefilled from the pay app. The worker test
for a tracked-only state uses Georgia now. The state lists are updated in the plan copy, the UI
note and the payapps-site features and llms text. On the public side, the free guide
`ventures/pay-app-guides/lien-waiver-forms-by-state.html` gained a California row and section,
and the state-by-state post was extended.

**Choices to keep.**

- § 8132's exception (3), earlier conditional waivers not yet paid, is two optional text blanks:
  `priorWaiverDates` and `priorUnpaidAmounts`. They are text because the statute says
  "Amount(s)".
- The final forms' only exception is the optional money field `disputedClaimsCents`.
- The notices print bold at the page's largest size, which satisfies §§ 8134/8138 ("at least as
  large a type as the largest type otherwise in the form").

**Next.** Prefill § 8132(3) from this job's earlier conditional waivers that are still unpaid.
California's preliminary notice, from the same download. Georgia and Mississippi are still
blocked: their codes are published through LexisNexis, and Justia answers 403.
