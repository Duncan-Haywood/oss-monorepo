// The tests that matter here are the ones proving this checker can FAIL.
//
// A guard that accepts everything reads as coverage while proving nothing,
// and this one guards a promise: every venture offering "turn usage counting
// off" is telling the visitor their choice sticks. The catalogue-wide run at
// the bottom is only trustworthy because the fixtures above show the checker
// distinguishes a module that keeps the choice from one that forgets it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { checkModule, checkAll } from "./optout-persistence.mjs";

// This file's own repo-relative path, so the catalogue test's failure message
// can quote a runnable `git log` rather than a path typed out by hand -- the
// kind of restatement that survives a rename and then sends the next reader
// to a file that is not there.
const RELATIVE_SELF = relative(
  join(fileURLToPath(new URL(".", import.meta.url)), "..", ".."),
  fileURLToPath(import.meta.url),
);

// How many venture usage modules offer an in-page way to turn counting off,
// measured 2026-09-12. Every one of them must keep the choice across a
// reload, and the count itself is pinned -- see the catalogue test at the
// bottom for why a lower bound is not enough.
//
// It went 69 -> 93 when discovery stopped using a name allowlist, and 93 ->
// 254 when the page-level repair gave 161 more modules a `writeOptOut` the
// recorder itself consults. That last jump is the point of the pinned count
// rather than an embarrassment to it: a number that moves by 161 is a claim
// worth restating deliberately, and the assertion made me restate it.
// 254 -> 255 on 2026-09-13, when `obsidian-plugin-review-check` (#4663)
// merged with a `usage.mjs` opt-out following the same working pattern as
// its sibling ventures -- missed by #4665's fix for this same venture's
// other CI gap (the missing venture-scores.yaml row), which didn't touch
// this file, so main stayed red here until now.
// 255 -> 256 on 2026-09-13, when `caption-quality-check` shipped with a
// `usage.mjs` following the same `readOptOut`/`writeOptOut` pattern as
// redirect-chain-check and its siblings.
// 256 -> 257 on 2026-09-11 (missed at the time), when
// `process-server-fee-calculator` graduated with a `usage.mjs` opt-out
// following the same `readOptOut`/`writeOptOut` pattern as its siblings --
// its own PR touched venture-scores.yaml, publish-surface.yaml and the
// front-door mirror but not this file, so main stayed red here by one until
// this comment was written, same shape as the obsidian-plugin-review-check
// miss above.
// 257 -> 258 on 2026-09-16, when `pdf-accessibility-tag-check` graduated
// with a `usage.mjs` copying the same `readOptOut`/`writeOptOut` pattern
// (via cors-misconfig-check's usage.mjs, keyed under its own storage name).
// 258 -> 259 on 2026-09-16, when `process-server-fee-calculator` (#4720)
// graduated with a `usage.mjs` opt-out. That merge left `main` red here --
// the same shape as the 254 -> 255 entry above, and for the same reason: the
// venture's own suite is green, and nothing in a new venture's diff points at
// this file. Found by a session that merged `main` into its branch and re-ran
// the checklist, not by CI, which is starved.
// One thing that entry is worth keeping separate from the others: it is the
// first addition here that does NOT copy the `readOptOut`/`writeOptOut` pair.
// It spells the same switch `usageAllowed`/`toggleUsage`, persisting an
// `...-usage-opt-out` key in `localStorage`. Behavioural discovery found it
// regardless, which is the argument for behavioural discovery -- the name
// allowlist this file started with would have filed it `no-switch` and left a
// real opt-out unverified while the count still read as full coverage.
// 259 -> 260 on 2026-09-16, when `photo-addon-pricing-calculator` graduated
// with a `usage.mjs` opt-out following the same `readOptOut`/`writeOptOut`
// pattern as its siblings.
// 260 -> 261 on 2026-09-16, when `security-txt-check` graduated with the same
// `readOptOut`/`writeOptOut` pair. Worth one line on why that switch matters
// more than most on this particular page: the tool reads a file naming a
// company's disclosure contact, so a list of which sites someone is checking
// is itself sensitive. Nothing is uploaded either way -- the counters are
// local and record only an event name and a day -- but the opt-out is the
// visitor's own control over even that, and it has to survive a reload to
// mean anything.
// 261 -> 262 on 2026-09-16, when `agent-instructions-drift-check` graduated
// with a `setUsageOptOut`/`usageOptedOut` switch -- named differently from
// the `readOptOut`/`writeOptOut` siblings but discovered the same way
// (behaviourally: does the switch's state survive a reload), which is the
// point of not using a name allowlist here.
// 262 -> 263 on 2026-09-16, when `hoa-reserve-fund-calculator` graduated
// with its own `toggleUsage`/`usageAllowed` opt-out switch, same discovery
// method as the rest of this running count.
// 263 -> 264 on 2026-09-16, when `overtime-pay-calculator` graduated with a
// `usage.mjs` opt-out following the same `readOptOut`/`writeOptOut` pattern
// as its siblings.
// 264 -> 265 on 2026-09-16, when `cron-dst-drift-check` graduated with its
// own `setUsageOptOut`/`usageOptedOut` switch (opts out of the
// `schedule_checked`/`drift_checked`/`example_loaded` counters), same
// discovery method as the rest of this running count.
// 265 -> 266 on 2026-09-16, when `bridal-hair-makeup-pricing-calculator`
// graduated with its own `toggleUsage`/`usageAllowed` switch (the same pair
// `hoa-reserve-fund-calculator` uses), same discovery method as the rest of
// this running count. Recorded a run late: #4766 and #4758 were open at the
// same time and each raised the constant by one against a base where the
// other had not landed, so the pair of graduations only moved it once. The
// count is a property of the tree, not of either diff -- which is why this
// check reads the catalogue and does not trust the number, and why the fix
// is one line here rather than anything in either venture.
// 266 -> 267 on 2026-09-16, when `sql-migration-lock-check` graduated with a
// `setUsageOptOut`/`usageOptedOut` switch (opts out of the
// `check_run`/`example_loaded` counters), same discovery method as the rest
// of this running count.
// 267 -> 268 on 2026-09-16, when `sbom-diff-check` graduated with its own
// `setUsageOptOut`/`usageOptedOut` switch (opts out of the
// `diff_run`/`example_loaded` counters), same discovery method as the rest
// of this running count.
// 268 -> 269 on 2026-09-16, when `commissary-kitchen-cost-split-calculator`
// graduated with its own `toggleUsage`/`usageAllowed` switch (the same pair
// `hoa-reserve-fund-calculator` and `bridal-hair-makeup-pricing-calculator`
// use), same discovery method as the rest of this running count.
// 269 -> 270 on 2026-09-16, when `backflow-test-fee-calculator` graduated
// with its own `setUsageOptOut`/`usageOptedOut` switch (the same
// `record`/`readUsage` pattern `overtime-pay-calculator` uses), same
// discovery method as the rest of this running count.
// 270 -> 271 on 2026-09-16, when `land-survey-bid-calculator` graduated with
// its own `toggleUsage`/`usageAllowed` switch (the same pair
// `hoa-reserve-fund-calculator` and `bridal-hair-makeup-pricing-calculator`
// use), same discovery method as the rest of this running count.
// 271 -> 272 on 2026-09-17, when `estate-sale-net-proceeds-calculator`
// graduated with its own `readOptOut`/`writeOptOut` switch (the same
// `recordUsage` pattern `poshmark-fee-calculator` uses), same discovery
// method as the rest of this running count.
// 272 -> 273 on 2026-09-16, when `wedding-florist-proposal-calculator`
// graduated with a `toggleUsage`/`usageAllowed` switch (opts out of the
// `proposal-priced`/`rounding-gap-shown`/`link_copied` counters), same
// discovery method as the rest of this running count.
// 273 -> 274 on 2026-09-17, when `world-clock-widget` gained a browser surface
// with its own `setUsageOptOut`/`usageOptedOut` switch in
// `ventures/world-clock-widget/site/usage.mjs` (the same `record`/`readUsage`
// pattern `cron-dst-drift-check` uses), same discovery method as the rest of
// this running count. Note this one is NOT a venture graduating, which every
// other line above is: the venture already existed as a Swift app, and the
// addition is a second surface over the same core. The distinction matters
// only for reading this list back -- the switch is a switch either way.
//
// The 271 -> 272 pair above is worth reading together: two branches were open
// at once and each raised the constant by one against a base where the other
// had not landed, exactly the collision the 265 -> 266 entry records. Both
// additions are real and both survive here, which is why the resolved number
// is 274 rather than either branch's 273.
// 274 -> 275 on 2026-09-17, when `openapi-breaking-change-check` graduated
// with its own `setUsageOptOut`/`usageOptedOut` switch (the same
// `record`/`readUsage` pattern `sbom-diff-check` and
// `sql-migration-lock-check` use), same discovery method as the rest of
// this running count.
// 275 -> 276 on 2026-09-17, when `asbestos-abatement-bid-calculator`
// graduated with its own `toggleUsage`/`usageAllowed` switch (the same pair
// `hoa-reserve-fund-calculator` and `land-survey-bid-calculator` use), same
// discovery method as the rest of this running count.
// 276 -> 277 on 2026-09-17, when `tutor-package-pricing-calculator`
// graduated with a `usage.mjs` opt-out following the same
// `setUsageOptOut`/`usageOptedOut` pattern as
// `overtime-pay-calculator`'s switch, same discovery method as the rest of
// this running count.
// 277 -> 278 on 2026-09-17, when `biohazard-cleanup-bid-calculator`
// graduated with its own `toggleUsage`/`usageAllowed` switch (the same pair
// `hoa-reserve-fund-calculator` and `bridal-hair-makeup-pricing-calculator`
// use), same discovery method as the rest of this running count. This is
// the same shape as the 271 -> 272 collision above: this branch was open
// before `tutor-package-pricing-calculator` landed, so it only ever knew
// its own predecessor's number (277) until this merge.
// 278 -> 279 on 2026-09-17, when `storage-auction-max-bid-calculator`
// graduated with its own `toggleUsage`/`usageAllowed` switch (opts out of
// the `bid-calculated`/`overbid-warning-shown`/`link_copied` counters, the
// same pattern `wedding-florist-proposal-calculator` uses), same discovery
// method as the rest of this running count. Landed the same afternoon as
// `asbestos-abatement-bid-calculator`, `tutor-package-pricing-calculator`
// and `biohazard-cleanup-bid-calculator`, so the resolved number is 279
// rather than any one branch's own count.
// 279 -> 280 on 2026-09-17, when `vector-db-cost-calculator` graduated with
// its own `setUsageEnabled`/`usageAllowed` switch (the same
// `countUsage`/`usageAllowed` pair `cloud-egress-calculator` uses), same
// discovery method as the rest of this running count. This branch was open
// before `tutor-package-pricing-calculator`, `biohazard-cleanup-bid-calculator`
// and `storage-auction-max-bid-calculator` landed, so it only ever knew its
// own predecessor's number (276) until this merge.
// 280 -> 281 on 2026-09-17, when `required-checks-drift-check` graduated
// with a `usage.mjs` opt-out following the same
// `setUsageOptOut`/`usageOptedOut` pattern as `pinned-actions-check`'s
// switch (copied from it directly), same discovery method as the rest of
// this running count. This branch was open before
// `storage-auction-max-bid-calculator` and `vector-db-cost-calculator`
// landed, so it only ever knew its own predecessor's number (279, then
// 280) until this merge.
// 281 -> 282 on 2026-09-17, when `dog-boarding-daycare-pricing` graduated
// with its own `toggleUsage`/`usageAllowed` switch (the same
// `recordEvent`/`toggleUsage`/`usageAllowed` pattern as
// `dog-walking-route-pricing`'s `usage.mjs`), same discovery method as the
// rest of this running count. This branch was open before
// `vector-db-cost-calculator` and `required-checks-drift-check` landed, so
// it only ever knew its own predecessor's number (280, then 281) until
// this merge.
// 282 -> 283 on 2026-09-17, when `call-recording-consent-check` (#4853)
// graduated with its own `usage.mjs` opt-out, discovered behaviourally like
// the rest. Its branch was open before `dog-boarding-daycare-pricing`
// (#4859) landed, so each of the two raised this constant by one against a
// base where the other had not, and the pair of graduations only moved it
// once -- leaving `main` red by one from #4853's merge until this commit.
// Same shape as the bridal-hair-makeup/#4766 entry above, and it happened
// again the same day in `gitops/tests/test_manifests.py`'s mirrored-tool
// total, where both branches independently wrote "297" for what the merged
// tree made 298.
//
// Worth stating once rather than a third time: this is not carelessness by
// either author, and it is not fixable in either venture's diff. With
// several sessions merging inside one 15-minute window, any constant that
// counts the *tree* will be written by two branches at once, and both will
// be right about the base they could see. The check reads the catalogue and
// refuses to trust the number, which is what makes the collision a one-line
// fix here instead of a silent wrong count -- and the reason it must be
// found by running the guard, since CI is starved and cannot find it.
// 283 -> 284 on 2026-09-17, when `podcast-sponsorship-rate-calculator`
// graduated with its own `record`/`setUsageOptOut`/`usageOptedOut` switch,
// the same pattern as its `newsletter-sponsorship-rate-calculator` and
// `brand-deal-rate-calculator` siblings. This branch was open before
// `call-recording-consent-check` (#4853) landed, so it only ever knew its
// own predecessor's number (282) until this merge -- same collision shape
// as the entry immediately above.
// 284 -> 285 on 2026-09-17, when `subpath-robots-check` graduated with its
// own `setUsageOptOut`/`usageOptedOut` switch (opts out of the
// `check_run`/`example_loaded` counters), same discovery method as the rest
// of this running count. Verified the way this file's error message
// prescribes rather than by assuming: exactly one added `usage.mjs`
// (`ventures/subpath-robots-check/usage.mjs`) and no deletions, so this is a
// graduation and not a switch that stopped being a switch. This branch was
// open before `podcast-sponsorship-rate-calculator` landed, so it only ever
// knew its own predecessor's number (283) until this merge.
// 285 -> 286 on 2026-09-17, when `propane-delivery-route-margin` graduated
// with its own `recordEvent`/`toggleUsage`/`usageAllowed` switch, the same
// pattern as its `atm-route-margin` and `fire-extinguisher-inspection-
// route-margin` siblings. Verified the way this file's error message
// prescribes: exactly one added `usage.mjs`
// (`ventures/propane-delivery-route-margin/usage.mjs`) and no deletions, so
// this is a graduation and not a switch that stopped being one.
// 286 -> 287 on 2026-09-17, when `k8s-deprecated-api-check` graduated with
// its own `setUsageOptOut`/`usageOptedOut` switch (opts out of the
// `check_run`/`example_loaded`/`file_loaded` counters), same discovery
// method as the rest of this running count. This branch was open before
// `propane-delivery-route-margin` landed, so it only ever knew its own
// predecessor's number (285) until this merge -- same collision shape as
// the entry immediately above: both branches independently wrote "286" for
// what the merged tree made 287.
// 287 -> 288 on 2026-09-17, when `branch-protection-drift-check` graduated
// with its own `setUsageOptOut`/`usageOptedOut` switch (opts out of the
// `check_run`/`example_loaded` counters), same discovery method as the
// rest of this running count. Verified the way this file's error message
// prescribes: exactly one added `usage.mjs`
// (`ventures/branch-protection-drift-check/usage.mjs`) and no deletions.
// 288 -> 289 on 2026-09-17, when `stockx-seller-payout-calculator` graduated
// with its own `toggleUsage`/`usageAllowed` switch (the same pair
// `hoa-reserve-fund-calculator` and `bridal-hair-makeup-pricing-calculator`
// use), same discovery method as the rest of this running count. This
// branch was open before `branch-protection-drift-check` landed, so it
// only ever knew its own predecessor's number (287) until this merge --
// same collision shape as the entry immediately above: both branches
// independently wrote "288" for what the merged tree made 289.
// 289 -> 290 on 2026-09-17, when `android-data-safety-check` graduated with
// its own `recordUsage`/`readOptOut`/`writeOptOut` switch (opts out of the
// `scan_run`/`example_loaded` counters), same discovery method as the rest
// of this running count. This branch was open before
// `branch-protection-drift-check` landed, so it only ever knew an earlier
// predecessor's number until this merge -- the same ordinary collision
// shape recorded throughout this list.
// 290 -> 291 on 2026-09-17, when `helm-values-schema-check` graduated with
// its own `setUsageOptOut`/`usageOptedOut` switch (opts out of the
// `check_run`/`example_loaded`/`file_loaded` counters), the same
// `usage.mjs` shape as its sibling `k8s-deprecated-api-check`. Verified the
// way this file's error message prescribes: exactly one added `usage.mjs`
// (`ventures/helm-values-schema-check/usage.mjs`) and no deletions, so this
// is a graduation and not a switch that stopped being one. This branch was
// open before `stockx-seller-payout-calculator`,
// `android-data-safety-check`, and `branch-protection-drift-check` landed,
// so it only ever knew an earlier predecessor's number until this merge --
// the same ordinary collision shape recorded throughout this list: both
// branches independently wrote "290" for what the merged tree made 291.
// 291 -> 292 on 2026-09-17, when `deploy-concurrency-check` graduated with
// its own `setUsageOptOut`/`usageOptedOut` switch (opts out of the
// `scan_run`/`example_loaded` counters), same discovery method as the rest
// of this running count. Verified the way this file's error message
// prescribes rather than by assuming: exactly one added `usage.mjs`
// (`ventures/deploy-concurrency-check/usage.mjs`) against `origin/main` and
// no deletions, so this is a graduation and not a switch that stopped being
// one. This branch was open before `branch-protection-drift-check` and
// `helm-values-schema-check` landed, so it only ever knew 290 until this
// merge -- three graduations in one afternoon, which is exactly the case
// `sync_tree_counts.py` exists to settle after the merge rather than on any
// one of the three branches.
// 292 -> 293 on 2026-09-17, when `actions-secret-leak-check` graduated
// concurrently with `deploy-concurrency-check` above, with its own
// `setUsageOptOut`/`usageOptedOut` switch (opts out of the
// `check_run`/`example_loaded` counters), the same `usage.mjs` shape as its
// sibling `actions-injection-check`. Verified the way this file's error
// message prescribes: exactly one added `usage.mjs`
// (`ventures/actions-secret-leak-check/usage.mjs`) and no deletions, so
// this is a graduation and not a switch that stopped being one. This
// branch was open before `deploy-concurrency-check` landed, so it only
// ever knew 291 until this merge -- both branches independently wrote
// "292" for what the merged tree made 293.
// 293 -> 294 on 2026-09-17, when `actions-transitive-pin-check` graduated
// with its own `setUsageOptOut`/`usageOptedOut` switch, the same
// `usage.mjs` shape as its sibling `pinned-actions-check`. Verified the
// way this file's error message prescribes: exactly one added
// `usage.mjs` (`ventures/actions-transitive-pin-check/usage.mjs`) and no
// deletions, so this is a graduation and not a switch that stopped being
// one. This branch was open before `actions-secret-leak-check` and
// `deploy-concurrency-check` landed, so it only ever knew 292 until this
// merge -- the same ordinary collision shape recorded throughout this
// list.
//
// 294 -> 295 after merging `cnc-machining-quote-calculator` (#4957), which
// landed on `main` with its own opt-out switch while this branch was
// still mid-merge -- the same collision shape one more time.
//
// 295 -> 296 on 2026-09-17, when `ny-llc-transparency-act-tracker`
// graduated with its own `setUsageOptOut`/`usageOptedOut` switch, the same
// `usage.mjs` shape as `call-recording-consent-check`. Verified the way
// this file's error message prescribes: exactly one added `usage.mjs`
// (`ventures/ny-llc-transparency-act-tracker/usage.mjs`) and no deletions,
// so this is a graduation and not a switch that stopped being one. This
// branch was open before `twitch-payout-calculator` landed, so it only
// ever knew 296 until this merge -- both branches independently wrote
// "296" for what the merged tree makes 297. The number below is
// `sync_tree_counts.py`'s own fresh measurement against the actual merged
// tree, not a hand sum of either branch's guess.
//
// (Merged concurrently: `twitch-payout-calculator` also graduated with its
// own `toggleUsage`/`usageAllowed` switch, opting out of the
// `month-priced`/`gap-checked` counters -- exactly one added `usage.mjs`,
// `ventures/twitch-payout-calculator/usage.mjs`, and no deletions.)
//
// 297 -> 298 on 2026-09-17, when `docker-build-secrets-check` graduated with
// its own `setUsageOptOut`/`usageOptedOut` switch, the same `usage.mjs`
// shape as its sibling `docker-base-image-pin-check`. Verified the way this
// file's error message prescribes: exactly one added `usage.mjs`
// (`ventures/docker-build-secrets-check/usage.mjs`) and no deletions, so
// this is a graduation and not a switch that stopped being one. The number
// below is `sync_tree_counts.py`'s own fresh measurement against the merged
// tree, not a hand sum.
//
// 298 -> 299 on 2026-09-17, when `no-tax-on-tips-overtime-calculator`
// graduated with its own `setUsageOptOut`/`usageOptedOut` switch, the same
// `usage.mjs` shape copied from `overtime-pay-calculator`. Verified the way
// this file's error message prescribes: exactly one added `usage.mjs`
// (`ventures/no-tax-on-tips-overtime-calculator/usage.mjs`) and no
// deletions, so this is a graduation and not a switch that stopped being
// one. The number below is `sync_tree_counts.py`'s own fresh measurement
// against the merged tree, not a hand sum.
//
// 299 -> 300 on 2026-09-17, when `depreciation-recapture-calculator`
// graduated concurrently with its own `record`/`setUsageOptOut`/
// `usageOptedOut` switch, the same `usage.mjs` shape as
// `quarterly-estimated-tax-calendar`. Verified the way this file's error
// message prescribes: exactly one added `usage.mjs`
// (`ventures/depreciation-recapture-calculator/usage.mjs`) and no
// deletions, so this is a graduation and not a switch that stopped being
// one. This branch was open before `no-tax-on-tips-overtime-calculator`
// landed, so it only ever knew 299 until this merge.
//
// 300 -> 301 on 2026-09-17, when `qbi-deduction-calculator` graduated
// concurrently with its own opt-out switch (a federal Section 199A
// qualified-business-income deduction estimator).
//
// 301 -> 302 on 2026-09-17, when `equipment-auction-buyer-premium-calculator`
// graduated concurrently with its own `record`/`setUsageOptOut`/
// `usageOptedOut` switch, the same `usage.mjs` shape as
// `storage-auction-max-bid-calculator`. Verified the way this file's error
// message prescribes: exactly one added `usage.mjs`
// (`ventures/equipment-auction-buyer-premium-calculator/usage.mjs`) and no
// deletions, so this is a graduation and not a switch that stopped being
// one.
//
// 302 -> 303 on 2026-09-17, when `docker-cache-order-check` graduated with
// its own `setUsageOptOut`/`usageOptedOut` switch, the same `usage.mjs`
// shape as its sibling Dockerfile checkers. Verified the way this file's
// error message prescribes: exactly one added `usage.mjs`
// (`ventures/docker-cache-order-check/usage.mjs`) and no deletions, so this
// is a graduation and not a switch that stopped being one. This branch was
// open before the concurrent graduations above landed, so it only ever
// knew 301 until this merge. The number below is `sync_tree_counts.py`'s
// own fresh measurement against the merged tree, not a hand sum.
//
// 303 -> 304 on 2026-09-18, when `parcel-dim-weight-calculator` graduated
// with its own `usage.mjs` opt-out (it gates the
// `weight_calculated`/`result_copied`/`box_target_copied` counters behind the
// same `usageAllowed` read that `clearUsage` writes), keyed under its own
// storage name and following the same working pattern as its sibling
// ventures. Verified the way this file's error message prescribes rather
// than by assuming: exactly one added `usage.mjs`
// (`ventures/parcel-dim-weight-calculator/usage.mjs`) and no deletions, so
// this is a graduation and not a switch that stopped being a switch. This
// branch was open before `equipment-auction-buyer-premium-calculator` and
// `docker-cache-order-check` landed, so it only ever knew its own
// predecessor's number (301) until this merge -- same collision shape as
// the entries above it.
//
// 304 -> 305: `docker-base-image-eol-check` graduated, adding one
// `usage.mjs` following the same opt-out pattern as its siblings.
//
// 305 -> 306: `freelance-platform-fee-calculator` graduated, adding one
// `usage.mjs` following the same opt-out pattern as its siblings. Verified
// the way this file's error message prescribes: exactly one added
// `usage.mjs` (`ventures/freelance-platform-fee-calculator/usage.mjs`) and
// no deletions.
//
// 306 -> 307: `personal-trainer-package-pricing-calculator` graduated,
// adding one `usage.mjs` following the same opt-out pattern as its
// siblings (`usageOptedOut`/`setUsageOptOut` gating `record`/`readUsage`
// the same way `tutor-package-pricing-calculator`'s does). Verified the way
// this file's error message prescribes: exactly one added `usage.mjs`
// (`ventures/personal-trainer-package-pricing-calculator/usage.mjs`) and no
// deletions.
//
// 307 -> 308: `actions-secrets-inherit-check` graduated, adding one
// `usage.mjs` following the same opt-out pattern as its `actions-*`
// siblings (`usageOptedOut`/`setUsageOptOut` gating `record`/`readUsage`
// the same way `actions-cache-poisoning-check`'s does). Verified the way
// this file's error message prescribes: exactly one added `usage.mjs`
// (`ventures/actions-secrets-inherit-check/usage.mjs`) and no deletions.
// This branch was open before `osha-trir-dart-calculator` and
// `supabase-rls-check` landed, so it only ever knew its own predecessor's
// number (307) until this merge -- the same ordinary collision shape
// recorded throughout this list.
//
// 308 -> 309: `osha-trir-dart-calculator` graduated, adding one `usage.mjs`
// following the same opt-out pattern as its siblings (`readOptOut`/
// `writeOptOut` gating `recordUsage`). Verified the way this file's error
// message prescribes: exactly one added `usage.mjs`
// (`ventures/osha-trir-dart-calculator/usage.mjs`) and no deletions.
//
// 309 -> 310: `supabase-rls-check` graduated concurrently, adding one
// `usage.mjs` following the same opt-out pattern as its siblings. Verified
// the way this file's error message prescribes: exactly one added
// `usage.mjs` (`ventures/supabase-rls-check/usage.mjs`) and no deletions.
// This branch only ever knew its own predecessor's number (307) until
// this merge -- the same ordinary collision shape recorded throughout
// this list.
//
// 310 -> 311: `source-map-leak-check` graduated, adding one `usage.mjs`
// following the same opt-out pattern as its sibling checkers
// (`usageOptedOut`/`setUsageOptOut`-equivalent gating via `readOptOut`/
// `writeOptOut` in `recordUsage`, same as `supabase-rls-check`'s). This
// branch only ever knew its own predecessor's number (310, counting only
// `actions-secrets-inherit-check`) until this merge brought
// `osha-trir-dart-calculator` and `supabase-rls-check` in alongside it --
// the same ordinary collision shape recorded throughout this list.
//
// 311 -> 312: `mercari-fee-calculator` graduated concurrently, adding one
// `usage.mjs` following the same opt-out pattern as its siblings
// (`readOptOut`/`writeOptOut` gating `recordUsage`, keyed under its own
// `mercari-fee-calculator-usage` storage name). Verified the way this
// file's error message prescribes: exactly one added `usage.mjs`
// (`ventures/mercari-fee-calculator/usage.mjs`) and no deletions. This
// branch only ever knew its own predecessor's number (309) until this
// merge -- the same ordinary collision shape recorded throughout this list.
//
// 312 -> 313: `voiceover-project-rate-calculator` graduated concurrently
// with both above, adding one `usage.mjs` following the same opt-out
// pattern as its siblings (`usageAllowed`/`toggleUsage` gating
// `recordEvent` the same way `locksmith-bid-calculator`'s does). This
// branch only ever knew its own predecessor's number (308, before the
// osha-trir-dart-calculator/supabase-rls-check pair landed) until this
// merge -- the same collision shape as the entry immediately above.
// Verified the way this file's error message prescribes: exactly one added
// `usage.mjs` (`ventures/voiceover-project-rate-calculator/usage.mjs`) and
// no deletions.
//
// 312 -> 313: `sign-language-interpreter-rate-calculator` graduated, adding
// one `usage.mjs` following the same opt-out pattern as its siblings
// (`usageAllowed`/`toggleUsage` gating `recordEvent`, the same shape as
// `voiceover-project-rate-calculator`'s, which it is modeled on). Verified
// the way this file's error message prescribes: exactly one added
// `usage.mjs`
// (`ventures/sign-language-interpreter-rate-calculator/usage.mjs`) and no
// deletions.
//
// 313 -> 314: `turo-host-payout-calculator` also graduated, concurrently,
// adding one `usage.mjs` following the same opt-out pattern as its siblings
// (`usageAllowed`/`toggleUsage` gating `recordEvent` the same way
// `voiceover-project-rate-calculator`'s does). This branch only ever knew
// its own predecessor's number (312, before `mercari-fee-calculator`
// landed) until this merge -- the same ordinary collision shape recorded
// throughout this list. Verified the way this file's error message
// prescribes: exactly one added `usage.mjs`
// (`ventures/turo-host-payout-calculator/usage.mjs`) and no deletions.
//
// 314 -> 315: `firebase-rules-check` also graduated, concurrently, adding
// one `usage.mjs` following the same `readOptOut`/`writeOptOut` pattern as
// `supabase-rls-check`'s. Verified the way this file's error message
// prescribes: exactly one added `usage.mjs`
// (`ventures/firebase-rules-check/usage.mjs`) and no deletions. This
// branch only ever knew its own predecessor's number (309, before
// `osha-trir-dart-calculator`, `supabase-rls-check`,
// `mercari-fee-calculator`, and `voiceover-project-rate-calculator`
// landed) until this merge -- the same ordinary collision shape recorded
// throughout this list.
//
// 314 -> 315: `podcast-feed-check` graduated (this branch), adding one
// `usage.mjs` following the same `readOptOut`/`writeOptOut` pattern as
// `redirect-chain-check`'s. Verified the way this file's error message
// prescribes: exactly one added `usage.mjs`
// (`ventures/podcast-feed-check/usage.mjs`) and no deletions. This branch
// only ever knew its own predecessor's number (312, before
// `turo-host-payout-calculator` and `firebase-rules-check` landed) until
// this merge -- the same ordinary collision shape recorded throughout
// this list.
//
// 315 -> 316: `source-map-leak-check` also graduated, concurrently, adding
// one `usage.mjs` following the same `readOptOut`/`writeOptOut` pattern as
// its checker siblings. Verified the way this file's error message
// prescribes: exactly one added `usage.mjs`
// (`ventures/source-map-leak-check/usage.mjs`) and no deletions. That
// branch only ever knew its own predecessor's number (309, before
// `osha-trir-dart-calculator`, `supabase-rls-check`,
// `mercari-fee-calculator`, `voiceover-project-rate-calculator`, and
// `turo-host-payout-calculator` landed) until this merge -- the same
// ordinary collision shape recorded throughout this list. Total
// re-derived here by `sync_tree_counts.py` against the fully merged tree
// rather than by hand.
//
// 316 -> 317: `graphql-introspection-exposure-check` also graduated,
// concurrently, adding one `usage.mjs` following the same
// `readOptOut`/`writeOptOut` pattern as its checker siblings, keyed under
// its own `graphql-introspection-exposure-check-usage` storage name. This
// branch only ever knew its own predecessor's number (313) until this
// merge -- the same ordinary collision shape recorded throughout this
// list. Verified the way this file's error message prescribes: exactly
// one added `usage.mjs`
// (`ventures/graphql-introspection-exposure-check/usage.mjs`) and no
// deletions.
//
// 317 -> 318: `podcast-feed-check` also graduated, concurrently on
// `origin/main`, adding one `usage.mjs` following the same
// `readOptOut`/`writeOptOut` pattern as its checker siblings. That
// branch's own comment read this as a no-op against its own predecessor
// number, which was wrong once merged with this branch's own addition --
// re-derived here by `sync_tree_counts.py` against the fully merged tree
// (and its regenerated mirror) rather than trusted from either branch's
// arithmetic.
//
// 318 -> 319: `git-exposure-check` also graduated, concurrently on
// `origin/main`, adding one `usage.mjs` following the same
// `readOptOut`/`writeOptOut` pattern as its siblings, keyed under its own
// `git-exposure-check-usage` storage name. This branch only ever knew its
// own predecessor's number (313, before `firebase-rules-check`,
// `source-map-leak-check`, and `podcast-feed-check` landed) until this
// merge -- the same ordinary collision shape recorded throughout this
// list. Total re-derived here by `sync_tree_counts.py` against the fully
// merged tree rather than by hand.
//
// 319 -> 320: `dotenv-exposure-check` graduated (this branch), adding one
// `usage.mjs` following the same opt-out pattern as its siblings
// (`readOptOut`/`writeOptOut` gating `recordUsage`, keyed under its own
// `dotenv-exposure-check-usage` storage name). Verified the way this
// file's error message prescribes: exactly one added `usage.mjs`
// (`ventures/dotenv-exposure-check/usage.mjs`) and no deletions. This
// branch only ever knew its own predecessor's number (317, before
// `graphql-introspection-exposure-check`, `podcast-feed-check`, and
// `git-exposure-check` landed) until this merge -- the same ordinary
// collision shape recorded throughout this list. Total re-derived here by
// `sync_tree_counts.py` against the fully merged tree rather than by
// hand.
//
// 320 -> 321: `subdomain-takeover-check` graduated (this branch), adding
// one `usage.mjs` following the same opt-out pattern as its siblings
// (`readOptOut`/`writeOptOut` gating `recordUsage`, keyed under its own
// `subdomain-takeover-check-usage` storage name). Verified the way this
// file's error message prescribes: exactly one added `usage.mjs`
// (`ventures/subdomain-takeover-check/usage.mjs`) and no deletions.
// 321 -> 322 on 2026-09-24, when `slopsquatting-check` graduated with a
// `usage.mjs` following the same `readOptOut`/`writeOptOut` pattern as
// its siblings (`dependency-confusion-check`, `npm-lifecycle-script-check`),
// keyed under its own `slopsquatting-check-usage` storage name. Exactly one
// added `usage.mjs` (`ventures/slopsquatting-check/usage.mjs`), no deletions.
//
// 322 -> 323 on 2026-09-24: `cloud-bucket-exposure-check` also graduated,
// concurrently on `main`, adding one `usage.mjs` following the same
// opt-out pattern as its siblings (`readOptOut`/`writeOptOut` gating
// `recordUsage`, keyed under its own `cloud-bucket-exposure-check-usage`
// storage name). This branch only ever knew its own predecessor's number
// (322, before `slopsquatting-check` landed) until this merge -- the same
// ordinary collision shape recorded throughout this list. Verified the way
// this file's error message prescribes: exactly one added `usage.mjs`
// (`ventures/cloud-bucket-exposure-check/usage.mjs`) beyond the merge base,
// no deletions.
//
// 323 -> 324 on 2026-09-24: `window-tinting-bid-calculator` graduated,
// adding one `usage.mjs` following the same `usageAllowed`/`toggleUsage`
// opt-out pattern as its siblings (`land-survey-bid-calculator`,
// `biohazard-cleanup-bid-calculator`), keyed under its own
// `window-tinting-bid-calculator-usage` storage name. Exactly one added
// `usage.mjs` (`ventures/window-tinting-bid-calculator/usage.mjs`), no
// deletions.
//
// 324 -> 325 on 2026-09-24: `backup-file-exposure-check` also graduated,
// concurrently on `main`, adding one `usage.mjs` following the same
// opt-out pattern as its siblings (`readOptOut`/`writeOptOut` gating
// `recordUsage`, keyed under its own `backup-file-exposure-check-usage`
// storage name). This branch only ever knew its own predecessor's number
// (323, before `window-tinting-bid-calculator` landed) until this merge --
// the same ordinary collision shape recorded throughout this list.
// Verified the way this file's error message prescribes: exactly one
// added `usage.mjs` (`ventures/backup-file-exposure-check/usage.mjs`)
// beyond the merge base, no deletions.
//
// 325 -> 326 on 2026-09-24: `employee-cost-calculator` also graduated,
// concurrently on `main`, adding one `usage.mjs` following the same
// opt-out pattern as its siblings (`readOptOut`/`writeOptOut` gating
// `recordUsage`, keyed under its own `employee-cost-usage` storage name).
// This branch only ever knew its own predecessor's number (325, before
// `backup-file-exposure-check` landed on this side) until this merge --
// the same ordinary collision shape recorded throughout this list.
// Exactly one added `usage.mjs`
// (`ventures/employee-cost-calculator/usage.mjs`), no deletions.
//
// 326 -> 327 on this merge: `str-occupancy-tax-calculator` also
// graduated, concurrently on `main`, adding one `usage.mjs` following the
// same opt-out pattern as its siblings (`readOptOut`/`writeOptOut` gating
// `recordUsage`, keyed under its own `str-occupancy-tax-usage` storage
// name). This branch only ever knew its own predecessor's number (324,
// before `backup-file-exposure-check` and `employee-cost-calculator` each
// landed) until this merge -- the same ordinary collision shape recorded
// throughout this list, two-wide this time. Exactly one added
// `usage.mjs` (`ventures/str-occupancy-tax-calculator/usage.mjs`), no
// deletions.
//
// 327 -> 328 on this merge: `llm-api-pricing-calculator` also graduated,
// adding one `usage.mjs` following the same opt-out pattern as its
// siblings (`usageAllowed`/`setUsageEnabled` gating `countUsage`, keyed
// under its own `llm-api-pricing-calculator:usage` storage name). Exactly
// one added `usage.mjs` (`ventures/llm-api-pricing-calculator/usage.mjs`),
// no deletions.
//
// 328 -> 329 on this merge: `mcp-config-risk-check` also graduated, adding
// one `usage.mjs` following the same opt-out pattern as its siblings
// (`usageAllowed`/`setUsageEnabled` gating `countUsage`, keyed under its
// own `mcp-config-risk-check:usage` storage name). Exactly one added
// `usage.mjs` (`ventures/mcp-config-risk-check/usage.mjs`), no deletions.
//
// 329 -> 330: `kickstarter-fee-calculator` also graduated, concurrently
// on `main` -- adding one `usage.mjs` following the same opt-out pattern
// as its siblings (`readOptOut`/`writeOptOut` gating `recordUsage`, keyed
// under its own `kickstarter-fee-calculator-usage` storage name). This
// branch only ever knew its own predecessor's number (328, before
// `mcp-config-risk-check` landed) until this merge -- the same ordinary
// collision shape recorded throughout this list. Exactly one added
// `usage.mjs` (`ventures/kickstarter-fee-calculator/usage.mjs`), no
// deletions.
//
// 330 -> 331: `auto-glass-bid-calculator` also graduated -- adding one
// `usage.mjs` following the same opt-out pattern as its siblings
// (`readOptOut`/`writeOptOut` gating `recordUsage`, keyed under its own
// `auto-glass-bid-usage` storage name). Exactly one added `usage.mjs`
// (`ventures/auto-glass-bid-calculator/usage.mjs`), no deletions.
//
// 331 -> 332: `depop-fee-calculator` graduated -- adding one `usage.mjs`
// following the same opt-out pattern as its siblings (`readOptOut`/
// `writeOptOut` gating `recordUsage`, keyed under its own
// `depop-fee-calculator-usage` storage name). Exactly one added
// `usage.mjs` (`ventures/depop-fee-calculator/usage.mjs`), no deletions.
//
// 332 -> 333: `hidden-unicode-check` also graduated, concurrently on
// `main` -- adding one `usage.mjs` following the same opt-out pattern as
// its siblings (`usageAllowed`/`setUsageEnabled` gating `countUsage`,
// keyed under its own `hidden-unicode-check:usage` storage name). This
// branch only ever knew its own predecessor's number (331, before
// `depop-fee-calculator` landed) until this merge -- the same ordinary
// collision shape recorded throughout this list. Exactly one added
// `usage.mjs` (`ventures/hidden-unicode-check/usage.mjs`), no deletions.
//
// 333 -> 334: `skill-manifest-check` also graduated, concurrently on
// `main` -- adding one `usage.mjs` following the same opt-out pattern as
// its siblings (`usageAllowed`/`setUsageEnabled` gating `countUsage`,
// keyed under its own `skill-manifest-check:usage` storage name). This
// branch only ever knew its own predecessor's number (332, before
// `hidden-unicode-check` landed) until this merge -- the same ordinary
// collision shape recorded throughout this list. Exactly one added
// `usage.mjs` (`ventures/skill-manifest-check/usage.mjs`), no deletions --
// the same-commit link added to `mcp-config-risk-check`'s footer reuses
// that venture's own existing switch rather than adding a new one.
//
// 334 -> 335: `salary-range-posting-check` also graduated, concurrently
// on `main` -- adding one more `usage.mjs`
// (`ventures/salary-range-posting-check/usage.mjs`), no deletions.
//
// 335 -> 336: `k8s-resource-limits-check` also graduates -- adding one
// `usage.mjs` following the same opt-out pattern as its siblings
// (`usageOptedOut`/`setUsageOptOut` gating `record`, keyed under its own
// `k8s-resource-limits-check-usage` storage name). This branch only ever
// knew its own predecessor's number (331, before any of the four merges
// above landed) until this merge -- the same ordinary collision shape
// recorded throughout this list. Exactly one added `usage.mjs`
// (`ventures/k8s-resource-limits-check/usage.mjs`), no deletions.
//
// 336 -> 337: `auto-loan-interest-deduction-calculator` graduates -- adding
// one `usage.mjs` following the same opt-out pattern as its siblings
// (`usageOptedOut`/`setUsageOptOut` gating `record`, keyed under its own
// `auto-loan-interest-deduction-calculator-usage` storage name). Exactly
// one added `usage.mjs`, no deletions.
//
// 337 -> 338: `tip-pool-compliance-calculator` also graduated, concurrently
// on `main` -- adding one more `usage.mjs`
// (`ventures/tip-pool-compliance-calculator/usage.mjs`), no deletions. This
// branch only ever knew its own predecessor's number (336, before
// `auto-loan-interest-deduction-calculator` landed) until this merge -- the
// same ordinary collision shape recorded throughout this list, this time
// with both sides claiming the same next number.
//
// 338 -> 339: `caa-record-check` graduates -- adding one `usage.mjs`
// following the same opt-out pattern as its siblings
// (`usageOptedOut`/`setUsageOptOut` gating `recordUsage`, keyed under its
// own `caa-record-check-usage` storage name). Exactly one added
// `usage.mjs`, no deletions.
//
// 339 -> 340: `claude-code-settings-check` also graduated, concurrently on
// `main` -- adding one more `usage.mjs`
// (`ventures/claude-code-settings-check/usage.mjs`), no deletions. This
// branch only ever knew its own predecessor's number (338, before
// `caa-record-check` landed) until this merge -- the same ordinary
// collision shape recorded throughout this list.
// `mega-backdoor-roth-calculator`'s own `vs-doing-the-math-by-hand.html`
// comparison page adds no switch of its own -- a static comparison page,
// not a `usage.mjs` -- so it does not move this count.
//
// 340 -> 341: `claude-code-subagent-check` also graduated, concurrently on
// `main` -- adding one more `usage.mjs`
// (`ventures/claude-code-subagent-check/usage.mjs`), the same opt-in/opt-out
// toggle shape as its `claude-code-settings-check` sibling
// (`usageAllowed`/`setUsageEnabled`/`countUsage` gating `countUsage`, keyed
// under its own `claude-code-subagent-check:usage` storage name). Exactly
// one added `usage.mjs`, no deletions.
//
// 341 -> 342: `claude-skill-scaffold-generator` also graduated,
// concurrently on `main` -- adding one more `usage.mjs`
// (`ventures/claude-skill-scaffold-generator/usage.mjs`) following the same
// opt-out pattern as its AI-agent-tooling siblings
// (`usageAllowed`/`setUsageEnabled` gating `countUsage`, keyed under its own
// `claude-skill-scaffold-generator:usage` storage name), no deletions.
// `mega-backdoor-roth-calculator`, which also graduated concurrently, added
// no `usage.mjs` of its own, so it does not move this count.
//
// 340 -> 341: `claude-code-subagent-check` also graduated, independently on
// `main` at the same 339 predecessor -- adding one more `usage.mjs`
// (`ventures/claude-code-subagent-check/usage.mjs`), the same opt-in/opt-out
// toggle shape as its `claude-code-settings-check` sibling
// (`usageAllowed`/`setUsageEnabled`/`countUsage` gating `countUsage`, keyed
// under its own `claude-code-subagent-check:usage` storage name), no
// deletions. Both this venture and `claude-skill-scaffold-generator` above
// claimed the same next number (340) from the same 339 predecessor -- the
// same ordinary collision shape recorded throughout this list, this time
// with both additions real and neither superseding the other.
// `mega-backdoor-roth-calculator`, which also graduated concurrently, added
// no `usage.mjs` of its own, so it does not move this count.
//
// 341 -> 342: `senior-deduction-calculator` also graduated (#5765),
// concurrently on `main` -- adding one more `usage.mjs`
// (`ventures/senior-deduction-calculator/usage.mjs`), no deletions. Two
// separate concurrent sessions each recorded their own half of this
// transition independently, one landing on 341 (only seeing
// claude-skill-scaffold-generator) and the other on 341 by a different path
// (only seeing claude-code-subagent-check) -- neither could see the other's
// addition. All three additions are real.
//
// 342 -> 343: `facebook-marketplace-fee-calculator` also graduated -- adding
// one more `usage.mjs`
// (`ventures/facebook-marketplace-fee-calculator/usage.mjs`) following the
// same opt-out pattern as its resale-marketplace siblings
// (`usageOptedOut`/`setUsageOptOut` gating `record`, keyed under its own
// `facebook-marketplace-fee-calculator-usage` storage name), no deletions.
// This branch only ever knew its own predecessor's number (341, from its
// own earlier merge of `senior-deduction-calculator`) until this merge
// revealed two further concurrent graduations
// (`claude-skill-scaffold-generator`, `claude-code-subagent-check`) it had
// never observed -- the same ordinary collision shape recorded throughout
// this list, one merge later. `senior-deduction-calculator` was
// independently recorded again by a fourth concurrent session at this same
// 343; the addition is the same one already counted above, not a second.
//
// 343 -> 344: `caa-record-check` also graduated, concurrently on `main` --
// adding one more `usage.mjs` (`ventures/caa-record-check/usage.mjs`), no
// deletions.
//
// 344 -> 345: `trump-account-calculator` also graduated -- adding one more
// `usage.mjs` (`ventures/trump-account-calculator/usage.mjs`) following the
// same opt-in/opt-out toggle shape as its
// `auto-loan-interest-deduction-calculator` sibling
// (`record`/`setUsageOptOut`/`usageOptedOut` gating localStorage writes,
// keyed under its own `trump-account-calculator-usage` storage name).
// Exactly one added `usage.mjs`, no deletions.
// Re-derived here by `sync_tree_counts.py` against the fully merged tree
// rather than by hand.
//
// 346 on this merge: this branch's own `npm-provenance-check` also
// graduated, concurrently and invisibly to the `trump-account-calculator`
// branch above -- adding one more `usage.mjs`
// (`ventures/npm-provenance-check/usage.mjs`) following the same opt-out
// pattern as its dev-tool-checker siblings (`usageOptedOut`/
// `setUsageOptOut` gating `record`, keyed under its own
// `npm-provenance-check-usage` storage name), no deletions. Both
// additions are real, taking 344 to 346.
//
// 346 -> 347: `claude-code-hooks-security-check` also graduated -- adding
// one more `usage.mjs`
// (`ventures/claude-code-hooks-security-check/usage.mjs`) following the
// same opt-out pattern as its AI-agent-tooling-checker siblings
// (`usageAllowed`/`setUsageEnabled` gating `countUsage`, keyed under its
// own `claude-code-hooks-security-check:usage` storage name), no
// deletions. Re-derived here by `sync_tree_counts.py` against the fully
// merged tree rather than by hand.
//
// 348 -> 349 on this merge: `section-174a-catchup-calculator` also
// graduated -- adding one more `usage.mjs`
// (`ventures/section-174a-catchup-calculator/usage.mjs`) following the same
// opt-out toggle shape as its `trump-account-calculator` sibling
// (`record`/`setUsageOptOut`/`usageOptedOut` gating localStorage writes,
// keyed under its own `section-174a-catchup-calculator-usage` storage
// name). Exactly one added `usage.mjs`, no deletions. Re-derived here by
// `sync_tree_counts.py` against the fully merged tree rather than by hand.
//
// 349 -> 350: `mrr-waterfall-calculator` graduated -- adding one more
// `usage.mjs` (`ventures/mrr-waterfall-calculator/usage.mjs`) following the
// same opt-out toggle shape as `subscription-price-impact`'s
// (`recordUsage`/`readOptOut`/`writeOptOut` gating localStorage writes,
// keyed under its own `mrr-waterfall-calculator-usage-v1` storage name).
//
// 350 -> 351 on that merge: `patreon-fee-calculator` also graduated,
// concurrently and invisibly to the `mrr-waterfall-calculator` branch
// above -- adding one more `usage.mjs`
// (`ventures/patreon-fee-calculator/usage.mjs`) following the same
// opt-out toggle shape as its `twitch-payout-calculator` sibling
// (`recordEvent`/`toggleUsage`/`usageAllowed` gating localStorage writes,
// keyed under its own `patreon-fee-calculator-usage` storage name). Both
// additions are real, taking 349 to 351.
//
// 351 -> 352 on this merge: `bonus-depreciation-calculator` also
// graduated, concurrently and invisibly to both branches above -- adding
// one more `usage.mjs` (`ventures/bonus-depreciation-calculator/usage.mjs`)
// following the same opt-out toggle shape as its
// `section-174a-catchup-calculator` sibling
// (`record`/`setUsageOptOut`/`usageOptedOut` gating localStorage writes,
// keyed under its own `bonus-depreciation-calculator-usage` storage name).
// Exactly one added `usage.mjs`, no deletions. Re-derived here by
// `sync_tree_counts.py` against the fully merged tree rather than by hand.
//
// 352 -> 353: `salt-cap-calculator` also graduated -- adding one more
// `usage.mjs` (`ventures/salt-cap-calculator/usage.mjs`) following the
// same opt-out toggle shape as its `bonus-depreciation-calculator`
// sibling (`record`/`setUsageOptOut`/`usageOptedOut` gating localStorage
// writes, keyed under its own `salt-cap-calculator-usage` storage name).
// Exactly one added `usage.mjs`, no deletions.
//
// 353 -> 354: `charitable-deduction-calculator` also graduated -- adding
// one more `usage.mjs` (`ventures/charitable-deduction-calculator/
// usage.mjs`) following the same opt-out toggle shape as its
// `salt-cap-calculator` sibling (`record`/`setUsageOptOut`/
// `usageOptedOut` gating localStorage writes, keyed under its own
// `charitable-deduction-calculator-usage` storage name). Exactly one
// added `usage.mjs`, no deletions.
//
// 354 -> 355: `gambling-loss-deduction-calculator` also graduated,
// concurrently with and invisibly to the five ventures below -- adding
// one more `usage.mjs` (`ventures/gambling-loss-deduction-calculator/
// usage.mjs`) following the same opt-out toggle shape as its
// `charitable-deduction-calculator` sibling (`record`/`setUsageOptOut`/
// `usageOptedOut` gating localStorage writes, keyed under its own
// `gambling-loss-deduction-calculator-usage` storage name). Exactly one
// added `usage.mjs`, no deletions.
//
// 355 -> 356: `estate-tax-exemption-calculator` also graduated -- adding
// one more `usage.mjs` (`ventures/estate-tax-exemption-calculator/
// usage.mjs`) following the same opt-out toggle shape as its
// `charitable-deduction-calculator` sibling (`record`/`setUsageOptOut`/
// `usageOptedOut` gating localStorage writes, keyed under its own
// `estate-tax-exemption-calculator-usage` storage name). Exactly one
// added `usage.mjs`, no deletions.
//
// 356 -> 357: `excess-business-loss-calculator` also graduated,
// concurrently -- adding one more `usage.mjs`
// (`ventures/excess-business-loss-calculator/usage.mjs`) following the
// same opt-out toggle shape as its `charitable-deduction-calculator`
// sibling (`record`/`setUsageOptOut`/`usageOptedOut` gating localStorage
// writes, keyed under its own `excess-business-loss-calculator-usage`
// storage name). Exactly one added `usage.mjs`, no deletions.
//
// 357 -> 358: `qsbs-exclusion-calculator` also graduated, also
// concurrently -- adding one more `usage.mjs`
// (`ventures/qsbs-exclusion-calculator/usage.mjs`) following the same
// opt-out toggle shape as its `excess-business-loss-calculator` sibling
// (`record`/`setUsageOptOut`/`usageOptedOut` gating localStorage writes,
// keyed under its own `qsbs-exclusion-calculator-usage` storage name).
// Exactly one added `usage.mjs`, no deletions.
//
// 358 -> 359: `referrer-permissions-policy-check` also graduated,
// concurrently and invisibly to the entries above -- adding one
// more `usage.mjs` (`ventures/referrer-permissions-policy-check/
// usage.mjs`) following the same opt-out toggle shape as its
// `cache-control-check` sibling (`recordUsage`/`readOptOut`/
// `writeOptOut` gating localStorage writes, keyed under its own
// `referrer-permissions-policy-check-usage` storage name). Exactly one
// added `usage.mjs`, no deletions.
//
// 359 -> 360: `exempt-salary-threshold-checker` also graduated,
// concurrently and invisibly to the entries above -- adding one more
// `usage.mjs` (`ventures/exempt-salary-threshold-checker/usage.mjs`), the
// same boilerplate opt-out toggle copied from `salt-cap-calculator`
// (`record`/`setUsageOptOut`/`usageOptedOut` gating localStorage writes,
// keyed under its own `exempt-salary-threshold-checker-usage` storage
// name). Exactly one added `usage.mjs`, no deletions. (This entry and the
// one above it were originally both mis-recorded as "358 -> 359" from two
// branches that each fetched `main` before the other's merge landed --
// corrected here to chain sequentially.)
//
// 360 -> 361: `final-paycheck-deadline-calculator` also joined,
// concurrently and invisibly to the entry above -- the same opt-out
// `usage.mjs` shape (`record`/`setUsageOptOut`/`usageOptedOut` gating
// localStorage writes, keyed under its own
// `final-paycheck-deadline-calculator-usage` storage name). Exactly one
// added `usage.mjs`, no deletions. (A later merge of this same
// conflict pattern also separately re-recorded
// `gambling-loss-deduction-calculator`'s switch -- already counted
// earlier, at 354 -> 355 -- as if it were a second, new addition; that
// duplicate is not repeated here.)
//
// 361 -> 362: `boi-reporting-exemption-checker` also graduated,
// concurrently -- adding one more `usage.mjs`
// (`ventures/boi-reporting-exemption-checker/usage.mjs`), the same
// boilerplate opt-out toggle copied from `exempt-salary-threshold-checker`
// (`record`/`setUsageOptOut`/`usageOptedOut` gating localStorage writes,
// keyed under its own `boi-reporting-exemption-checker-usage` storage
// name). Exactly one added `usage.mjs`, no deletions.
//
// 362 -> 363: `child-tax-credit-calculator` also graduated, concurrently
// and invisibly to both entries above -- adding one more `usage.mjs`
// (`ventures/child-tax-credit-calculator/usage.mjs`), the same
// boilerplate opt-out toggle copied from `senior-deduction-calculator`
// (`record`/`setUsageOptOut`/`usageOptedOut` gating localStorage writes,
// keyed under its own `child-tax-credit-calculator-usage` storage name).
// Exactly one added `usage.mjs`, no deletions.
//
// 363 -> 364: `eitc-calculator` also graduated -- adding one more
// `usage.mjs` (`ventures/eitc-calculator/usage.mjs`), the same
// boilerplate opt-out toggle copied from `child-tax-credit-calculator`
// (`record`/`setUsageOptOut`/`usageOptedOut` gating localStorage writes,
// keyed under its own `eitc-calculator-usage` storage name). Exactly one
// added `usage.mjs`, no deletions.
//
// 364 -> 365: `freelance-writer-rate-calculator` also graduated,
// concurrently -- adding one more `usage.mjs`, the same opt-out toggle
// shape as the siblings above (`record`/`setUsageOptOut`/`usageOptedOut`
// gating localStorage writes, keyed under its own
// `freelance-writer-rate-calculator-usage` storage name). Exactly one
// added `usage.mjs`, no deletions. `boi-reporting-exemption-checker` is
// NOT re-added here -- already counted above, at 361 -> 362; a sibling
// merge of this same conflict independently re-narrated it as new, which
// this resolution does not repeat.
//
// 365 -> 366: `hsa-contribution-limit-calculator` also graduated,
// concurrently on `origin/main` -- adding one more `usage.mjs`, the same
// boilerplate opt-out toggle copied from `boi-reporting-exemption-checker`
// (`record`/`setUsageOptOut`/`usageOptedOut` gating localStorage writes,
// keyed under its own `hsa-contribution-limit-calculator-usage` storage
// name). Exactly one added `usage.mjs`, no deletions.
//
// 366 -> 367: `solo-401k-contribution-calculator` also graduated -- adding
// one more `usage.mjs`, the same boilerplate opt-out toggle shape as the
// siblings above (`record`/`setUsageOptOut`/`usageOptedOut` gating
// localStorage writes, keyed under its own
// `solo-401k-contribution-calculator-usage` storage name). Exactly one
// added `usage.mjs`, no deletions. Total re-derived here by
// `sync_tree_counts.py` against the fully merged tree rather than by
// hand.
//
// 367 -> 368: `mileage-deduction-method-calculator` graduated -- one more
// boilerplate `usage.mjs` opt-out toggle, keyed under its own
// `mileage-deduction-method-calculator-usage` storage name. Exactly one
// added `usage.mjs`, no deletions. Re-derived by `sync_tree_counts.py`.
//
// 368 -> 369: `home-office-deduction-calculator` also graduated -- one more
// `usage.mjs`, keyed under its own `home-office-deduction-calculator-usage`.
//
// 369 -> 370: `str-tax-loophole-calculator` also graduated -- one more
// `usage.mjs`, keyed under its own `str-tax-loophole-calculator-usage`.
//
// 370 -> 371: `estimated-tax-penalty-calculator` also graduated -- one more
// `usage.mjs`, keyed under its own `estimated-tax-penalty-calculator-usage`.
//
// 371 -> 372: `self-employment-tax-calculator` also graduated -- one more
// `usage.mjs`, keyed under its own `self-employment-tax-calculator-usage`.
//
// 372 -> 373: `backdoor-roth-pro-rata-calculator` graduated -- one more
// boilerplate `usage.mjs` under its own storage name. Re-derived by
// `sync_tree_counts.py`.
// 376 -> 377: `dependabot-config-check` graduated -- one more boilerplate
// `usage.mjs` under its own storage name. Re-derived by `sync_tree_counts.py`.
// 379 -> 380: `roth-conversion-bracket-fill-calculator` graduated -- one more
// boilerplate `usage.mjs` under its own storage name.
// 382 -> 383: `etsy-statement-profit-analyzer` graduated -- one more
// boilerplate `usage.mjs` under its own storage name.
// 383 -> 384: `google-ads-wasted-spend-analyzer` graduated -- one more
// boilerplate `usage.mjs` under its own storage name.
// 384 -> 385: `shopify-discount-leakage-analyzer` graduated -- one more
// boilerplate `usage.mjs` under its own storage name.
// 385 -> 386: `mileage-log` graduated -- one more boilerplate `usage.mjs` under
// its own storage name.
// 386 -> 387: `airbnb-earnings-report-analyzer` graduated -- one more
// boilerplate `usage.mjs` under its own storage name.
// 388 -> 389: `ebay-transaction-report-analyzer` graduated -- one more
// boilerplate `usage.mjs` under its own storage name.
// 389 -> 390: `shopify-payments-fee-analyzer` graduated -- one more
// boilerplate `usage.mjs` under its own storage name.
// 390 -> 391: `gig-driver-earnings-report-analyzer` graduated -- one more
// boilerplate `usage.mjs` under its own storage name.
// 392 -> 393: `meta-ads-fatigue-analyzer` graduated -- one more boilerplate
// `usage.mjs` under its own storage name.
// 393 -> 394: `youtube-revenue-rpm-analyzer` graduated -- one more boilerplate
// `usage.mjs` under its own storage name.
// 394 -> 395: `amazon-ppc-search-term-analyzer` graduated too.
// +1: `turo-earnings-report-analyzer` graduated -- one more boilerplate
// `usage.mjs` under its own storage name.
// +1: `fiverr-earnings-fee-analyzer` graduated -- one more boilerplate
// `usage.mjs` under its own storage name.
// +1: `kdp-royalty-report-analyzer` graduated -- one more boilerplate
// `usage.mjs` under its own storage name.
// +1: `poshmark-sales-report-analyzer` graduated -- one more boilerplate
// `usage.mjs` under its own storage name.
// +1: `patreon-members-churn-analyzer` graduated.
// +1: `whatnot-sales-report-analyzer` graduated.
// +1: `tiktok-shop-settlement-analyzer` graduated -- one more boilerplate
// `usage.mjs` under its own storage name.
// +1: `substack-subscriber-export-analyzer` graduated.
// +1: `app-store-sales-report-analyzer` graduated.
// +1: `bandcamp-sales-report-analyzer` graduated.
// +1: `google-play-earnings-report-analyzer` graduated.
// +1: `indie-game-payout-calculator` graduated.
// +1: `home-service-lead-roi-analyzer` graduated.
// +1: `fba-reimbursement-claim-finder` graduated.
// +1: `rent-roll-delinquency-analyzer` graduated.
// +1: `fba-aged-inventory-fee-analyzer` graduated.
// +1: `client-profitability-time-analyzer` graduated.
// +1: `restaurant-pos-menu-mix-analyzer` graduated.
const SWITCHES_IN_THE_CATALOGUE = 417;

let counter = 0;
function fixture(source) {
  // A fresh directory per fixture: the checker imports by URL, and Node caches
  // module URLs for the life of the process.
  const dir = mkdtempSync(join(tmpdir(), `optout-fixture-${counter++}-`));
  const path = join(dir, "usage.mjs");
  writeFileSync(path, source);
  return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

// The shape the catalogue shipped: the choice lives only in globalThis, which
// is a fresh realm on every page load.
const FORGETS = `
const KEY = "fixture-usage";
export function record(event) {
  if (typeof localStorage === "undefined" || globalThis.__usageOptOut) return;
  localStorage.setItem(KEY, String((Number(localStorage.getItem(KEY)) || 0) + 1));
}
export function setUsageOptOut(value) {
  globalThis.__usageOptOut = Boolean(value);
  if (value && typeof localStorage !== "undefined") localStorage.removeItem(KEY);
}
`;

const REMEMBERS = `
const KEY = "fixture-usage";
const OPT_OUT = "fixture-usage-opt-out";
function optedOut() {
  if (globalThis.__usageOptOut) return true;
  try { return localStorage.getItem(OPT_OUT) === "1"; } catch { return false; }
}
export function record(event) {
  if (typeof localStorage === "undefined" || optedOut()) return;
  localStorage.setItem(KEY, String((Number(localStorage.getItem(KEY)) || 0) + 1));
}
export function setUsageOptOut(value) {
  const off = Boolean(value);
  globalThis.__usageOptOut = off;
  if (off) { localStorage.removeItem(KEY); localStorage.setItem(OPT_OUT, "1"); }
  else localStorage.removeItem(OPT_OUT);
}
`;

// Stores the flag but never consults it. This is the case a static check
// cannot tell from a correct module, and the reason this checker drives the
// code instead of reading it.
const WRITES_BUT_NEVER_READS = `
const KEY = "fixture-usage";
const OPT_OUT = "fixture-usage-opt-out";
export function record(event) {
  if (typeof localStorage === "undefined" || globalThis.__usageOptOut) return;
  localStorage.setItem(KEY, String((Number(localStorage.getItem(KEY)) || 0) + 1));
}
export function setUsageOptOut(value) {
  globalThis.__usageOptOut = Boolean(value);
  if (value) { localStorage.removeItem(KEY); localStorage.setItem(OPT_OUT, "1"); }
}
`;

// No in-page switch at all: honours DNT/GPC only. A defensible design, and
// not this checker's business -- flagging it would make the check noise.
const NO_SWITCH = `
const KEY = "fixture-usage";
export function record(event) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, String((Number(localStorage.getItem(KEY)) || 0) + 1));
}
`;

// Clearing the counters is not switching them off, and a checker that took
// any storage change for a switch would confuse the two. The recorder starts
// again immediately, which is exactly how the behavioural test tells them
// apart.
const CLEARS_BUT_DOES_NOT_DISABLE = `
const KEY = "fixture-usage";
export function record(event) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, String((Number(localStorage.getItem(KEY)) || 0) + 1));
}
export function clearUsageLog() {
  if (typeof localStorage !== "undefined") localStorage.removeItem(KEY);
}
`;

// A live control whose name is in no allowlist -- this one is real, from
// equipment-rental-break-even, wired to a "clear usage" button. The first
// draft of the checker filed it as \`no-switch\` and would have stayed green
// through any regression in it.
const UNLISTED_NAME = `
const KEY = "fixture-usage";
export function record(event) {
  if (typeof localStorage === "undefined" || globalThis.__usageOptOut) return;
  localStorage.setItem(KEY, String((Number(localStorage.getItem(KEY)) || 0) + 1));
}
export function clearAndDisable() {
  globalThis.__usageOptOut = true;
  if (typeof localStorage !== "undefined") localStorage.removeItem(KEY);
}
`;

// And a name that hints at nothing at all, to prove the discovery is not the
// old allowlist with more entries in it. Nothing about "hush" says opt-out;
// what identifies it is that the recorder goes quiet when it is called.
const UNHINTED_NAME = `
const KEY = "fixture-usage";
const OFF = "fixture-usage-off";
function silenced() {
  if (globalThis.__usageOptOut) return true;
  try { return localStorage.getItem(OFF) === "1"; } catch { return false; }
}
export function record(event) {
  if (typeof localStorage === "undefined" || silenced()) return;
  localStorage.setItem(KEY, String((Number(localStorage.getItem(KEY)) || 0) + 1));
}
export function hush() {
  globalThis.__usageOptOut = true;
  localStorage.removeItem(KEY);
  localStorage.setItem(OFF, "1");
}
`;

// A counter key that honestly contains "off". An earlier draft decided which
// writes were counters by looking for "opt" or "off" in the key, so this
// module -- broken in exactly the way the FORGETS fixture is -- passed.
const COUNTER_NAMED_LIKE_A_FLAG = `
const KEY = "coffee-usage";
export function record(event) {
  if (typeof localStorage === "undefined" || globalThis.__usageOptOut) return;
  localStorage.setItem(KEY, String((Number(localStorage.getItem(KEY)) || 0) + 1));
}
export function setUsageOptOut(value) {
  globalThis.__usageOptOut = Boolean(value);
  if (value && typeof localStorage !== "undefined") localStorage.removeItem(KEY);
}
`;

// The same forgetting, under a different global. An earlier draft simulated
// the reload by deleting `globalThis.__usageOptOut` and nothing else, so this
// module -- broken in exactly the way FORGETS is -- kept its flag across the
// "reload" and passed. A real page load discards every global, not one name.
const ALTERNATE_GLOBAL = `
const KEY = "fixture-usage";
export function record(event) {
  if (typeof localStorage === "undefined" || globalThis.trackingDisabled) return;
  localStorage.setItem(KEY, String((Number(localStorage.getItem(KEY)) || 0) + 1));
}
export function disableTracking() {
  globalThis.trackingDisabled = true;
  if (typeof localStorage !== "undefined") localStorage.removeItem(KEY);
}
`;

// A recorder that writes once and then dedupes. It falls silent on its own,
// so "the recorder went quiet" stops being evidence of anything and every
// export would look like a switch.
const RECORDS_ONCE = `
const KEY = "fixture-usage";
export function record(event) {
  if (typeof localStorage === "undefined") return;
  if (localStorage.getItem(KEY)) return;
  localStorage.setItem(KEY, "1");
}
export function setUsageOptOut(value) { globalThis.__usageOptOut = Boolean(value); }
`;

// The inverted spelling: the argument means "enabled", so turning counting off
// is toggleUsage(false). A checker that only tried `true` would call this
// broken.
const INVERTED = `
const KEY = "fixture-usage";
const OPT_OUT = "fixture-usage-opt-out";
function allowed() {
  try { return localStorage.getItem(OPT_OUT) !== "1"; } catch { return true; }
}
export function record(event) {
  if (typeof localStorage === "undefined" || !allowed()) return;
  localStorage.setItem(KEY, String((Number(localStorage.getItem(KEY)) || 0) + 1));
}
export function toggleUsage(enabled) {
  if (enabled) localStorage.removeItem(OPT_OUT);
  else { localStorage.removeItem(KEY); localStorage.setItem(OPT_OUT, "1"); }
}
`;

async function statusOf(source) {
  const { path, cleanup } = fixture(source);
  try {
    return await checkModule(path);
  } finally {
    cleanup();
  }
}

test("a switch the reload forgets is caught", async () => {
  const result = await statusOf(FORGETS);
  assert.equal(result.status, "fail", JSON.stringify(result));
  assert.match(result.detail, /reload/);
});

test("a switch that survives the reload passes", async () => {
  const result = await statusOf(REMEMBERS);
  assert.equal(result.status, "pass", JSON.stringify(result));
});

test("storing the flag without reading it is still a failure", async () => {
  // The case that defeats every static rule: the grep for a stored opt-out
  // key succeeds, and the visitor is still counted on their next visit.
  const result = await statusOf(WRITES_BUT_NEVER_READS);
  assert.equal(result.status, "fail", JSON.stringify(result));
});

test("a module with no in-page switch is not accused", async () => {
  // Honouring DNT/GPC without offering a button is a different design, not a
  // broken promise. A guard that failed on it would be noise and get muted.
  const result = await statusOf(NO_SWITCH);
  assert.equal(result.status, "no-switch", JSON.stringify(result));
});

test("an enabled-style switch is understood", async () => {
  const result = await statusOf(INVERTED);
  assert.equal(result.status, "pass", JSON.stringify(result));
  assert.match(result.via, /toggleUsage/);
});

test("clearing the counters is not switching them off", async () => {
  // The recorder starts again on the next call, so this is a delete button,
  // not an opt-out. A checker that read any storage change as a switch would
  // then "verify" a promise the module never made.
  const result = await statusOf(CLEARS_BUT_DOES_NOT_DISABLE);
  assert.equal(result.status, "no-switch", JSON.stringify(result));
});

test("a switch whose name is in no allowlist is still checked", async () => {
  // `clearAndDisable` is real, and the first draft of this checker filed it
  // and four siblings as no-switch -- so a regression in any of them left CI
  // green. This is that defect, committed by the guard against it.
  const result = await statusOf(UNLISTED_NAME);
  assert.equal(result.status, "fail", JSON.stringify(result));
  assert.match(result.switch, /clearAndDisable/);
});

test("a switch whose name hints at nothing is found by what it does", async () => {
  const result = await statusOf(UNHINTED_NAME);
  assert.equal(result.status, "pass", JSON.stringify(result));
  assert.match(result.via, /hush/);
});

test("a counter key that contains \"off\" is still a counter", async () => {
  // `coffee-usage`. Deciding which writes were counters by looking for "opt"
  // or "off" in the key passed this module, which is broken in exactly the
  // way FORGETS is. Counter keys are now measured in the control run.
  const result = await statusOf(COUNTER_NAMED_LIKE_A_FLAG);
  assert.equal(result.status, "fail", JSON.stringify(result));
  assert.deepEqual(result.keys, ["coffee-usage"]);
});

test("a flag under a different global is still lost on reload", async () => {
  // The reload has to discard the realm, not one property of it. Special-
  // casing `__usageOptOut` passed a module that spells its flag anything
  // else, which is the same "names prove nothing" mistake as the allowlist.
  const result = await statusOf(ALTERNATE_GLOBAL);
  assert.equal(result.status, "fail", JSON.stringify(result));
  assert.match(result.switch, /disableTracking/);
});

test("a check leaves the realm as it found it", async () => {
  // 265 modules share one process. A global left behind by one would answer
  // for the next, and the failure would land on an innocent venture.
  assert.equal("trackingDisabled" in globalThis, false);
  await statusOf(ALTERNATE_GLOBAL);
  assert.equal("trackingDisabled" in globalThis, false);
});

test("a recorder that falls silent on its own is not read as an opt-out", async () => {
  // Silence is the evidence this whole check runs on, so it is worth nothing
  // from a recorder that goes quiet unprompted. Reported, never passed.
  const result = await statusOf(RECORDS_ONCE);
  assert.equal(result.status, "undrivable", JSON.stringify(result));
  assert.match(result.detail, /repeatab/);
});

test("a module the driver cannot reach is reported, not passed", async () => {
  // Silence from a recorder that never ran is not evidence of anything. This
  // is the same control the browser-signals checker keeps, for the same
  // reason: without it, an unreachable module "passes".
  const result = await statusOf(`
    export function setUsageOptOut(value) { globalThis.__usageOptOut = Boolean(value); }
  `);
  assert.equal(result.status, "undrivable", JSON.stringify(result));
});

test("every venture that offers the switch keeps it across a reload", async () => {
  // The catalogue-wide assertion. 2026-09-12: 37 of the 69 ventures then
  // visible failed this, all of them keeping the choice only in
  // `globalThis.__usageOptOut`. Fixed in the same change that added this.
  // Behavioural switch discovery then raised the visible set from 69 to 93 --
  // 24 controls the first draft's name allowlist had filed as `no-switch`.
  const results = await checkAll();

  // `undrivable` counts as broken here, and the reason is the point. It means
  // the module offers a switch (or `no-switch` would have returned first) and
  // the driver could not reach its recorder -- so nothing was verified. The
  // unit test above insists an unreachable recorder is never silently
  // accepted; excluding it here would grant exactly that at catalogue scale.
  // A venture changing to a signature the driver cannot call would otherwise
  // drop out of the check while CI stayed green.
  const broken = results.filter((r) => r.status !== "pass" && r.status !== "no-switch");
  assert.deepEqual(
    broken.map((r) => `${r.name} [${r.status}]: ${r.detail ?? r.error ?? "not verified"}`),
    [],
    "an advertised usage opt-out is unverified or does not survive a reload",
  );

  // Every module offering a switch must have been driven -- no slack, because
  // slack is where a silently-dropped module hides. An earlier draft allowed
  // `>= 60` of today's 69, which would have let nine become unverifiable
  // without failing.
  const switched = results.filter((r) => r.status !== "no-switch");
  assert.equal(
    results.filter((r) => r.status === "pass").length,
    switched.length,
    "some module offering an opt-out was not verified",
  );
  // And the sweep must find exactly the subjects it found before. Not `>=`:
  // a lower bound buys back the slack it was meant to remove the moment the
  // catalogue grows past it. With a 94th switch added, a regression in
  // `ltl-freight-class-estimator`'s `clearUsage()` -- a real opt-out that is
  // found behaviourally and by nothing else -- would reclassify it as
  // `no-switch`, leave 93 modules passing, and keep this assertion green.
  //
  // Equality makes an addition update the number deliberately, which is the
  // point: the count is the claim about how much of the catalogue this guard
  // covers, and a claim that can drift is not one. If this fails after you
  // added a venture, raise it. If it fails and you added nothing, a switch
  // stopped being a switch -- find out which before touching this line.
  //
  // The message names the repair because the bare number does not. Five
  // ventures have now graduated without bumping this line, and #4667 was a
  // whole PR spent rediscovering that a count moving up by one after a
  // venture addition is a one-line edit. The archaeology is what costs, not
  // the fix -- and a failure that has to be re-derived every time is one that
  // eventually gets waved through. The comment block above records *what*
  // happened each time; this records *how to find out* which it was.
  assert.equal(
    switched.length,
    SWITCHES_IN_THE_CATALOGUE,
    `the set of modules offering an opt-out changed: found ${switched.length}, ` +
      `this file pins ${SWITCHES_IN_THE_CATALOGUE}. Name what moved before ` +
      `editing the constant:\n` +
      `  git log -1 --format=%h -G'SWITCHES_IN_THE_CATALOGUE = [0-9]' -- ${RELATIVE_SELF}\n` +
      `  git diff --name-status <that-commit> HEAD -- 'ventures/*/usage.mjs' 'ventures/*/usage.js'\n` +
      `One 'A' line per unit of increase is a venture graduating: raise the ` +
      `constant and note it above. Anything else -- a decrease, or a rise no ` +
      `addition accounts for -- means a switch stopped being a switch, and ` +
      `the constant is not what needs changing.`,
  );
});
