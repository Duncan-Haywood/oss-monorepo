# State bond claim rules: audit against the excerpts (2026-11-28)

PayApps (bet #1) gained bond claim steps for 36 states and D.C. in two days
(`STATE_BOND_RULES` and `stateBondSteps` in
`ventures/payapps/apps/payapps/src/shared/public-jobs.ts`), written by many parallel
sessions. This run re-read every step and note against the statute excerpts the
sessions saved, `ventures/pay-app-guides/sources/state-bond-claims.txt`. The session's
network policy refused every legislature host, so the excerpts were the only source.
Nothing new was fetched.

## Fixed in this PR

| State | Problem | Fix |
|---|---|---|
| TX | § 2253.046's retainage notice is due 90 days after **final completion of the public work contract**, but it was dated from the public body's acceptance. Acceptance can come after completion, so the date shown could be later than the real deadline. | Count from the earlier of the claimant's last day and the acceptance. Final completion falls between the two, so the date is never late. |
| LA | The § 38:2242(F) supplier note left out "or no later than the statutory lien period, whichever comes first" and the recipients. | Both added. |
| AL, WY | For a remote-tier claimant, the generic caution said the statute "names claimants who contracted with the prime or with a subcontractor". Both statutes say "any person". | `anyTier` added, quoting each statute and still pointing to an attorney on far-down suppliers. |
| MA | The generic caution hedged where ch. 149, § 29 is explicit: the 65-day route reaches only claimants in contract with the GC's own sub. | New `remoteTier` field (same mechanism as `anyTier`), quoting § 29. |
| MN | The note called the statute's form "sworn". The excerpt leaves the form out, and it is a safe harbour ("sufficient if"). | Reworded. |
| OR | The note said the notice must be "signed". The excerpt leaves out (3). | "signed" dropped. |

Every other dated step matched its excerpt: day counts, start days, who gives the
notice, recipients and citations.

## Not fixed: claims the excerpts do not hold

These notes cite statute text that was never excerpted. They may well be right, but the
tree cannot show it. The next session with network access to the legislature hosts
should excerpt the text, or cut the claim.

- IA § 573.15A (the 95% completion release moves both dated IA steps' start day; this one matters most) and § 573.8.
- AK 36.25.025 (municipal exemption up to $400,000); AS 08.18.151 is cited but not described.
- AZ § 33-992.01 (preliminary notice).
- FL § 255.05(2)(a)1 (the 60-day notice of contest); the retainage-suit conditions after "one of the following conditions is satisfied:".
- MA: the $25,000 threshold and legal fees (not in paragraphs 2, 3 and 5).
- CA: "Public Contract Code § 7103 bonds" (the excerpt says only that § 9550 excludes § 7103(d) state entities).
- CO § 38-26-106(3) (cut off mid-sentence).
- PA: "adjusted yearly" for § 903(a), the § 3.1 payment bond threshold, and Act 385's "contracting body" definition.
- NC § 44A-27(d) (cited; (e) itself refers to (d), so the citation is likely right).
- NJ: the `law` range says "to 2A:44-147", but the excerpt includes § 148 and not § 147.
- DE § 6962(d)(9)e; KS 60-1111(c) and 60-1112; NE § 52-118 and the court reading of "final settlement"; MT § 18-2-207 and "no suit limit of its own"; ND § 48-01.2-10; SC on county bond terms; WA: the RCW 39.08.030 form, the public-record status, the 30-day fee bar and "no suit deadline" (the excerpt stops mid-sentence).

## How the audit ran

Three read-only subagents each took 12 or 13 jurisdictions, briefed to report only
discrepancies a construction lawyer would flag, with verbatim quotes and line numbers.
Each finding above was then checked by hand against the excerpt before it was fixed.
Tests: `src/shared/state-bond.test.ts` (the Texas date both ways, and the AL, WY and MA
remote-tier words).
