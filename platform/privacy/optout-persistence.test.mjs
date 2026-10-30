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
// +1: `ghost-members-export-analyzer` graduated.
// +1: `restaurant-pos-menu-mix-analyzer` graduated.
// +1: `rental-property-schedule-e-categorizer` graduated.
// +1: `property-tax-appeal-calculator` graduated.
// +1: `subscription-audit-from-statement` graduated.
// +1: `restaurant-labor-cost-daypart-analyzer` graduated.
// +1: `appointment-no-show-analyzer` graduated.
// +1: `freelancer-schedule-c-categorizer` graduated.
// +1: `self-employed-schedule-c-categorizer` graduated.
// +1: `late-invoice-collections-kit` graduated.
// +1: `print-on-demand-profit-calculator` graduated.
// +1: `service-hourly-yield-analyzer` graduated.
// +1: `medical-bill-error-checker` graduated.
// +1: `mortgage-escrow-analysis-checker` graduated.
// +1: `shopify-inventory-reorder-planner` graduated.
// +1: `like-kind-exchange-1031-calculator` graduated.
// +1: `aca-subsidy-cliff-calculator` graduated.
// +1: `parcel-late-delivery-refund-finder` graduated.
// +1: `social-security-claiming-age-calculator` graduated.
// +1: `wage-garnishment-limit-calculator` graduated.
// +1: `medicare-irmaa-cliff-calculator` graduated.
// +1: `rmd-calculator` graduated.
// +1: `rsu-withholding-gap-calculator` graduated.
// +1: `travel-nurse-contract-comparison-calculator` graduated.
// +1: `iso-exercise-amt-calculator` graduated.
// +1: `espp-tax-calculator` graduated.
// +1: `job-offer-total-comp-calculator` graduated.
// +1: `cash-balance-plan-calculator` graduated.
// +1: `cost-segregation-study-calculator` graduated.
// +1: `llm-usage-log-analyzer` graduated.
// +1: `agent-brokerage-split-calculator` graduated.
// +1: `home-sale-exclusion-calculator` graduated.
// +1: `tax-loss-harvesting-calculator` graduated.
// +1: `solar-payback-calculator` graduated.
// +1: `safe-dilution-calculator` graduated.
// +1: `rental-dscr-calculator` graduated.
// +1: `self-employed-health-insurance-deduction-calculator` graduated.
// +1: `rd-tax-credit-calculator` graduated.
// +1: `heat-pump-vs-furnace-calculator` graduated.
// +1: `physician-wrvu-compensation-calculator` graduated.
// +1: `dental-associate-pay-calculator` graduated.
// +1: `section-83b-election-calculator` graduated.
// +1: `startup-option-value-calculator` graduated.
// +1: `pslf-vs-refinance-calculator` graduated.
// +1: `dependent-care-fsa-vs-credit-calculator` graduated.
// +1: `van-westendorp-pricing-analyzer` graduated.
// +1: `augusta-rule-calculator` graduated.
// +1: `gabor-granger-price-analyzer` graduated.
// +1: `sales-commission-plan-comparison-calculator` graduated.
// +1: `merchant-cash-advance-true-cost-calculator` graduated.
// +1: `usage-based-pricing-simulator` graduated.
// +1: `rule-72t-sepp-calculator` graduated.
// +1: `locum-tenens-vs-employed-calculator` graduated.
// +1: `startup-exit-waterfall-calculator` graduated.
// +1: `insurance-agency-book-valuation-calculator` graduated.
// +1: `ab-test-significance-calculator` graduated.
// +1: `online-business-valuation-calculator` graduated.
// +1: `fix-and-flip-deal-analyzer` graduated.
// +1: `aws-commitment-breakeven-calculator` graduated.
// +1: `customer-lifetime-value-predictor` graduated.
// +1: `commercial-lease-effective-rent-calculator` graduated.
// +1: `sales-seasonality-forecaster` graduated.
// +1: `clearance-markdown-planner` graduated.
// +1: `price-elasticity-estimator` graduated.
// +1: `bid-win-rate-optimizer` graduated.
// +1: `liquidation-pallet-bid-calculator` graduated.
// +1: `ad-incrementality-test-analyzer` graduated.
// +1: `seasonal-buy-quantity-optimizer` graduated.
// +1: `appointment-overbooking-optimizer` graduated.
// +1: `shift-cover-optimizer` graduated.
// +1: `client-rebooking-predictor` graduated.
// +1: `crew-dispatch-optimizer` graduated.
// +1: `bundle-discount-optimizer` graduated.
// +1: `service-van-stock-optimizer` graduated.
// +1: `renewal-rent-optimizer` graduated.
// +1: `trial-conversion-timing-analyzer` graduated.
// +1: `str-nightly-rate-optimizer` graduated.
// +1: `quote-follow-up-timing` graduated.
// +1: `rental-rent-optimizer` graduated.
// +1: `mechanics-lien-deadline-calculator` graduated.
// +1: `route-account-pruner` graduated.
// +1: `donor-retention-analyzer` graduated.
// +1: `lead-response-time-analyzer` graduated.
// +1: `revenue-target-lead-planner` graduated.
// +1: `studio-class-slot-optimizer` graduated.
// +1: `workers-comp-premium-calculator` graduated.
// +1: `market-garden-bed-planner` graduated.
// +1: `private-practice-payer-mix-calculator` graduated.
// +1: `landlord-repair-or-replace-planner` graduated.
// +1: `cottage-food-pricing-calculator` graduated.
// +1: `contractor-wip-schedule` graduated.
// +1: `freelance-retainer-vs-hourly-calculator` graduated.
// +1: `payroll-tax-deposit-penalty-calculator` graduated.
// +1: `home-care-agency-margin-calculator` graduated.
// +1: `family-child-care-time-space-calculator` graduated.
// +1: `adu-payback-calculator` graduated.
// +1: `dog-grooming-profit-calculator` graduated.
// +1: `laundromat-machine-payback-calculator` graduated.
// +1: `tire-shop-ticket-margin-calculator` graduated.
// +1: `handyman-minimum-job-calculator` graduated.
// +1: `tattoo-piece-profit-calculator` graduated.
// +1: `candle-batch-cost-calculator` graduated.
// +1: `house-cleaning-quote-calculator` graduated.
// +1: `auction-car-flip-calculator` graduated.
// +1: `massage-therapist-profit-calculator` graduated.
// +1: `dj-gig-profit-calculator` graduated.
// +1: `wedding-photographer-profit-calculator` graduated.
// +1: `shipping-box-size-optimizer` graduated.
// +1: `container-load-planner` graduated.
// +1: `production-mix-optimizer` graduated.
// +1: `crypto-cost-basis-calculator` graduated.
// +1: `rental-fleet-size-optimizer` graduated.
// +1: `tile-layout-planner` graduated.
// +1: `event-seating-chart-optimizer` graduated.
// +1: `league-schedule-generator` graduated.
// +1: `state-residency-day-counter` graduated.
// +1: `shift-roster-builder` graduated.
// +1: `time-off-request-planner` graduated.
// +1: `cheap-meal-plan-optimizer` graduated.
// +1: `aid-award-letter-comparator` graduated.
// +1: `retirement-withdrawal-sequencer` graduated.
// +1: `coffee-roaster-margin-calculator` graduated.
// +1: `business-loan-offer-comparator` graduated.
// +1: `nsa-idr-offer-calculator` graduated.
// +1: `freight-broker-load-margin-calculator` graduated.
// +1: `breakeven-roas-calculator` graduated.
// +1: `driving-instructor-lesson-pricing-calculator` graduated.
// +1: `car-wash-membership-calculator` graduated.
// +1: `license-compat-check` graduated.
// +1: `llm-call-cost-scan` graduated.
// +1: `regex-redos-check` graduated.
// +1: `freelance-rate-increase-calculator` graduated.
// +1: `course-launch-revenue-calculator` graduated.
// +1: `postgres-explain-analyzer` graduated.
// +1: `prometheus-cardinality-cost` graduated.
// +1: `slo-burn-rate-alerts` graduated.
// +1: `lambda-memory-rightsizer` graduated.
// +1: `dynamodb-capacity-mode-advisor` graduated.
// +1: `s3-storage-class-advisor` graduated.
// +1: `s3-storage-class-savings` graduated.
// +1: `ebs-volume-cost-advisor` graduated.
// +1: `nat-gateway-cost-advisor` graduated.
// +1: `cloudwatch-logs-cost-advisor` graduated.
// +1: `bigquery-query-cost-advisor` graduated.
// +1: `snowflake-warehouse-cost-advisor` graduated.
// +1: `databricks-cluster-cost-advisor` graduated.
// +1: `k8s-requests-rightsizer` graduated.
// +1: `lambda-vs-fargate-cost-breakeven` graduated.
// +1: `rds-instance-cost-advisor` graduated.
// +1: `booking-request-chooser` graduated.
// +1: `rds-instance-rightsizer` graduated.
// +1: `free-shipping-threshold-optimizer` graduated.
// +1: `client-concentration-risk-analyzer` graduated.
// +1: `returns-policy-cost-analyzer` graduated.
// +1: `ticket-resale-profit-calculator` graduated.
// +1: `catering-quote-calculator` graduated.
// +1: `freelance-project-picker` graduated.
// +1: `market-event-picker` graduated.
// +1: `lot-split-calculator` graduated.
// +1: `trade-show-roi-calculator` graduated.
// +1: `csa-share-pricing-calculator` graduated.
// +1: `support-staffing-planner` graduated.
// +1: `consignment-markdown-planner` graduated.
// +1: `dog-grooming-day-planner` graduated.
// +1: `insurance-denial-appeal-builder` graduated.
// +1: `str-turnover-crew-planner` graduated.
// +1: `mobile-signing-agent-day-picker` graduated.
// +1: `saas-renewal-planner` graduated.
// +1: `process-server-day-picker` graduated.
// +1: `card-grading-submission-picker` graduated.
// +1: `appraisal-assignment-picker` graduated.
// +1: `thrift-haul-buy-picker` graduated.
// +1: `owner-operator-load-chain-planner` graduated.
// +1: `translation-job-picker` graduated.
// +1: `bookkeeping-client-fee-calculator` graduated.
// +1: `tax-season-client-picker` graduated.
// +1: `interior-design-fee-calculator` graduated.
// +1: `snow-plow-contract-calculator` graduated.
// +1: `pool-service-route-calculator` graduated.
// +1: `nail-tech-booth-rent-calculator` graduated.
// +1: `grant-indirect-cost-calculator` graduated.
// +1: `upwork-connects-roi-calculator` graduated.
// +1: `docker-compose-security-check` graduated.
// +1: `dog-grooming-price-calculator` graduated.
// +1: `thumbtack-lead-roi-calculator` graduated.
// +1: `app-subscription-proceeds-calculator` graduated.
// +1: `k8s-pod-security-check` graduated.
// +1: `terraform-plan-cost-estimate` graduated.
// +1: `aws-bill-change-explainer` graduated.
// +1: `lockfile-license-check` graduated.
// +1: `backyard-egg-profit-calculator` graduated.
// +1: `feie-physical-presence-calculator` graduated.
// +1: `ci-test-shard-balancer` graduated.
// +1: `backyard-honey-profit-calculator` graduated.
// +1: `requirements-pin-check` graduated.
// +1: `datadog-bill-estimator` graduated.
// +1: `webhook-signature-debugger` graduated.
// +1: `hvac-repair-tier-price-calculator` graduated.
// +1: `vercel-bill-estimator` graduated.
// +1: `supabase-bill-estimator` graduated.
// +1: `neon-bill-estimator` graduated.
// +1: `auth-mau-pricing-calculator` graduated.
// +1: `email-api-pricing-calculator` graduated.
// +1: `git-timesheet` graduated.
// +1: `cloudflare-bill-estimator` graduated.
// +1: `upstash-redis-bill-estimator` graduated.
// +1: `error-tracking-pricing-calculator` graduated.
// +1: `product-analytics-pricing-calculator` graduated.
// +1: `scope-creep-change-order-calculator` graduated.
// +1: `ci-minutes-pricing-calculator` graduated.
// +1: `log-management-pricing-calculator` graduated.
// +1: `cdn-bandwidth-pricing-calculator` graduated.
// +1: `merchant-of-record-fee-calculator` graduated.
// +1: `app-store-commission-calculator` graduated.
// +1: `llm-output-regression-diff` graduated.
// +1: `object-storage-pricing-calculator` graduated.
// +1: `video-hosting-pricing-calculator` graduated.
// +1: `uptime-monitoring-pricing-calculator` graduated.
// +1: `search-api-pricing-calculator` graduated.
// +1: `speech-to-text-pricing-calculator` graduated.
// +1: `training-gpu-pricing-calculator` graduated.
// +1: `business-vehicle-depreciation-calculator` graduated.
// +1: `era-835-underpayment-finder` graduated.
// +1: `nacha-file-validator` graduated.
// +1: `sepa-payment-file-validator` graduated.
// +1: `cobra-vs-marketplace-calculator` graduated.
// +1: `sepa-pain001-validator` graduated.
// +1: `form-5500-late-filing-calculator` graduated.
// +1: `bai2-statement-reader` graduated.
// +1: `eu-bank-statement-reader` graduated.
// +1: `sepa-pain002-status-reader` graduated.
// +1: `sepa-pain001-validator` graduated.
// +1: `eu-vat-oss-calculator` graduated.
// +1: `edi-x12-order-checker` graduated.
// +1: `woocommerce-product-csv-check` graduated.
// +1: `irs-iris-1099-csv-check` graduated.
// +1: `xero-invoice-csv-check` graduated.
// +1: `bigcommerce-product-csv-check` graduated.
// +1: `square-catalog-csv-check` graduated.
// +1: `quickbooks-chart-of-accounts-csv-check` graduated.
// +1: `xero-contacts-csv-check` graduated.
// +1: `etsy-listing-csv-check` graduated.
// +1: `wix-product-csv-check` graduated.
// +1: `hubspot-contacts-csv-check` graduated.
// +1: `pipedrive-import-csv-check` graduated.
// +1: `zoho-crm-import-csv-check` graduated.
// +1: `activecampaign-import-csv-check` graduated.
// +1: `klaviyo-profile-csv-check` graduated.
// +1: `mailchimp-audience-csv-check` graduated.
// +1: `payroll-hours-csv-check` graduated.
// +1: `shopify-customer-csv-check` graduated.
// +1: `shopify-inventory-csv-check` graduated.
// +1: `teachers-pay-teachers-earnings-analyzer` graduated.
// +1: `amazon-inventory-loader-check` graduated.
// +1: `gbp-bulk-location-check` graduated.
// +1: `redirect-map-check` graduated.
// +1: `google-ads-editor-csv-check` graduated.
// +1: `owner-operator-per-diem-calculator` graduated.
// +1: `meta-catalog-csv-check` graduated.
// +1: `gtin-list-check` graduated.
// +1: `iban-list-check` graduated.
// +1: `ics-calendar-check` graduated.
// +1: `vcard-contacts-check` graduated.
// +1: `ofx-file-check` graduated.
// +1: `youtube-chapters-check` graduated.
// +1: `google-contacts-csv-check` graduated.
// +1: `gpx-track-check` graduated.
// +1: `qif-file-check` graduated.
// +1: `mt940-statement-check` graduated.
// +1: `law-firm-realization-rate-calculator` graduated.
// +1: `xero-bank-statement-csv-check` graduated.
// +1: `quickbooks-iif-file-check` graduated.
// +1: `camt053-statement-check` graduated.
// +1: `bank-statement-pdf-to-csv` graduated.
// +1: `coi-expiry-gap-checker` graduated.
// +1: `bai2-to-ofx-converter` graduated.
// +1: `amazon-settlement-to-journal` graduated.
// +1: `stripe-payout-to-journal` graduated.
// +1: `etsy-statement-to-journal` graduated.
// +1: `paypal-activity-to-journal` graduated.
// +1: `square-sales-to-journal` graduated.
// +1: `payroll-register-to-journal` graduated.
// +1: `pickleball-facility-pro-forma` graduated.
// +1: `sales-export-to-journal` graduated.
// +1: `airbnb-payout-to-journal` graduated.
// +1: `lemonsqueezy-payout-to-journal` graduated.
// +1: `paddle-payout-to-journal` graduated.
// +1: `sep-ira-vs-solo-401k-calculator` graduated.
// +1: `truck-detention-pay-calculator` graduated.
// +1: `childcare-center-break-even-calculator` graduated.
// +1: `course-platform-fee-calculator` graduated.
// +1: `ko-fi-payout-to-journal` graduated.
// +1: `buymeacoffee-payout-to-journal` graduated.
// +1: `teachable-payout-to-journal` graduated.
// +1: `upwork-earnings-to-journal` graduated.
// +1: `fiverr-earnings-to-journal` graduated.
// +1: `kdp-royalty-to-journal` graduated.
// +1: `distrokid-royalty-to-journal` graduated.
// +1: `music-distribution-fee-calculator` graduated.
// +1: `microgreens-tray-planner` graduated.
// +1: `wise-statement-to-journal` graduated.
// +1: `revolut-business-statement-to-journal` graduated.
// +1: `payoneer-statement-to-journal` graduated.
// +1: `wedding-videographer-profit-calculator` graduated.
// +1: `syndication-waterfall-calculator` graduated.
// +1: `youtube-adsense-payout-to-journal` graduated.
// +1: `med-spa-treatment-profit-calculator` graduated.
// +1: `chiropractor-new-patient-roi-calculator` graduated.
// +1: `grant-writer-proposal-price-calculator` graduated.
// +1: `donor-acknowledgment-letter-generator` graduated.
// +1: `exemption-certificate-audit-check` graduated.
// +1: `rent-increase-notice-checker` graduated.
// +1: `pay-application-generator` graduated.
// +1: `nua-employer-stock-calculator` graduated.
// +1: `medicaid-lookback-penalty-calculator` graduated.
// +1: `freelance-contract-checker` graduated.
// +1: `injury-settlement-net-proceeds-calculator` graduated.
// +1: `supplier-price-creep-checker` graduated.
// +1: `lien-waiver-checker` graduated.
// +1: `employment-contract-checker` graduated.
// +1: `aba-authorization-tracker` graduated.
// +1: `restaurant-tip-pool-calculator` graduated.
// +1: `str-turnover-scheduler` graduated.
// +1: `mobile-detailing-day-planner` graduated.
// +1: `shared-kitchen-rate-planner` graduated.
// +1: `bakery-production-scheduler` graduated.
// +1: `greenhouse-bench-planner` graduated.
// +1: `mushroom-fruiting-room-planner` graduated.
// +1: `midterm-rental-calculator` graduated.
// +1: `freelance-editor-quote-calculator` graduated.
// +1: `cash-flow-risk-forecaster` graduated.
// +1: `social-security-benefits-tax-calculator` graduated.
// +1: `installment-sale-tax-calculator` graduated.
// +1: `app-listing-metadata-check` graduated.
// +1: `mobile-mechanic-visit-pricing-calculator` graduated.
// +1: `invoice-maker` graduated.
// +1: `wedding-officiant-fee-calculator` graduated.
// +1: `cdl-school-payback-calculator` graduated.
// +1: `wholesale-line-sheet-maker` graduated.
// +1: `estimate-maker` graduated.
// +1: `time-tracker` graduated.
// +1: `expense-tracker` graduated.
// +1: `freelance-dashboard` graduated.
// +1: `freelancer-tax-pack` graduated.
// +1: `freelance-contract-maker` graduated.
// +1: `freelance-proposal-maker` graduated (its own PR left this out; counted here).
// +1: `rental-ledger` graduated.
// +1: `freelance-lead-tracker` graduated.
// +1: `craft-brewery-batch-margin-calculator` graduated.
// +1: `maple-syrup-sugarbush-profit-calculator` graduated.
// +1: `fishing-crew-share-settlement-calculator` graduated.
// +1: `u-pick-farm-profit-planner` graduated.
// +1: `solar-panel-cleaning-quote-planner` graduated.
// +1: `apiary-profit-planner` graduated.
// +1: `christmas-tree-farm-profit-planner` graduated.
// +1: `sba-loan-capacity-calculator` graduated.
// +1: `sheep-goat-flock-profit-planner` graduated.
// +1: `pastured-poultry-profit-planner` graduated.
// +1: `pottery-piece-pricing-calculator` graduated.
// +1: `ball-python-morph-pairing-planner` graduated.
// +1: `stump-grinding-price-calculator` graduated.
// +1: `hay-baling-own-vs-hire-calculator` graduated.
// +1: `escape-room-pricing-capacity-planner` graduated.
// +1: `waterfront-rental-season-planner` graduated.
// +1: `boutique-fitness-studio-pricing-planner` graduated.
// +1: `property-management-profit-calculator` graduated.
// +1: `mobile-welding-job-price-calculator` graduated.
// +1: `sauna-cold-plunge-install-bid-calculator` graduated.
// +1: `good-faith-estimate-generator` graduated.
// +1: `collision-shop-drp-profit-calculator` graduated.
// +1: `volunteer-shift-scheduler` graduated.
// +1: `fleet-ev-vs-diesel-tco-calculator` graduated.
// +1: `franchise-unit-economics-calculator` graduated.
// +1: `appointment-no-show-cost-calculator` graduated.
// +1: `home-inspection-report-builder` graduated.
// +1: `pte-tax-election-calculator` graduated.
// +1: `container-demurrage-detention-calculator` graduated.
// +1: `roofing-insurance-supplement-finder` graduated.
// +1: `bonus-take-home-gross-up-calculator` graduated.
// +1: `farmland-lease-cash-rent-vs-crop-share-calculator` graduated.
// +1: `tip-fica-credit-calculator` graduated.
// +1: `crop-insurance-coverage-calculator` graduated.
// +1: `contract-vs-fte-rate-calculator` graduated.
// +1: `mobile-home-park-valuation-calculator` graduated.
// +1: `cell-tower-lease-buyout-calculator` graduated.
// +1: `tax-lien-certificate-yield-calculator` graduated.
// +1: `oil-gas-mineral-rights-offer-calculator` graduated.
// +1: `pension-lump-sum-vs-annuity-calculator` graduated.
// +1: `structured-settlement-buyout-calculator` graduated.
// +1: `section-1256-futures-tax-calculator` graduated.
// +1: `mortgage-points-break-even-calculator` graduated.
// +1: `heloc-vs-cash-out-refinance-calculator` graduated.
// +1: `tax-lot-sale-optimizer` graduated.
// +1: `mortgage-extra-payment-vs-invest-calculator` graduated.
// +1: `covered-call-wheel-calculator` graduated.
// +1: `charity-bunching-planner` graduated.
// +1: `hsa-shoebox-reimbursement-planner` graduated.
// +1: `cd-treasury-ladder-planner` graduated.
// +1: `cron-heartbeat` graduated.
// +1: `sbir-budget-builder` graduated.
// +1: `birth-doula-package-pricing-calculator` graduated.
// +1: `pet-sitting-platform-fee-calculator` graduated.
// +1: `ghostwriter-book-quote-calculator` graduated.
// +1: `hard-money-loan-cost-calculator` graduated.
// +1: `dmarc-report-reader` graduated.
// +1: `scrap-gold-buy-price-calculator` graduated.
// +1: `medical-billing-pricing-calculator` graduated.
// +1: `pawn-loan-profit-calculator` graduated.
// +1: `grape-grower-sell-vs-bottle-calculator` graduated.
// +1: `mosquito-control-program-pricing-calculator` graduated.
// +1: `card-bonus-planner` graduated.
// +1: `water-well-drilling-bid-calculator` graduated.
// +1: `junk-car-buyer-offer-calculator` graduated.
// +1: `adjunct-course-offer-calculator` graduated.
// +1: `lash-studio-service-profit-calculator` graduated.
// +1: `self-storage-unit-mix-optimizer` graduated.
// +1: `wedding-venue-date-pricing-optimizer` graduated.
// +1: `farm-crop-mix-optimizer` graduated.
// +1: `ev-charging-site-roi-calculator` graduated.
// +1: `food-truck-prep-mix-optimizer` graduated.
// +1: `class-price-and-minimum-optimizer` graduated.
// +1: `tutor-weekly-schedule-optimizer` graduated.
// +1: `capex-budget-prioritizer` graduated.
// +1: `surety-bond-capacity-calculator` graduated.
// +1: `rush-job-sequencer` graduated.
// +1: `warehouse-slotting-optimizer` graduated.
// +1: `early-pay-discount-picker` graduated.
// +1: `ghost-kitchen-brand-picker` graduated.
// +1: `childcare-enrollment-mix-optimizer` graduated.
// +1: `dining-room-table-mix-optimizer` graduated.
// +1: `vending-machine-planogram-optimizer` graduated.
// +1: `project-staffing-margin-optimizer` graduated.
// +1: `auto-detailing-service-menu-picker` graduated.
// +1: `proposal-maker` graduated (landed from a stranded branch).
// +1: `tile-layout-optimizer` graduated (landed from a stranded branch).
// +1: `mileage-deduction-calculator` graduated (landed from a stranded branch).
// +1: `wedding-flower-order-optimizer` graduated.
// +1: `saas-tier-price-optimizer` graduated.
// +1: `saas-feature-packaging-optimizer` graduated.
// +1: `pto-accrual-liability-calculator` graduated.
// +1: `car-hauler-load-planner` graduated.
// +1: `wholesale-real-estate-offer-calculator` graduated.
// +1: `commercial-solar-ppa-lease-buy-calculator` graduated.
// +1: `cafe-drink-margin-calculator` graduated.
// +1: `fers-retirement-planner` graduated.
// +1: `optical-dispensary-margin-calculator` graduated.
// +1: `fitness-studio-membership-calculator` graduated.
// +1: `hearing-aid-dispensing-margin-calculator` graduated.
// +1: `therapy-8-minute-rule-calculator` graduated.
// +1: `provider-credentialing-delay-cost-calculator` graduated.
// +1: `veterinary-wellness-plan-pricing-calculator` graduated.
// +1: `demand-charge-interval-analyzer` graduated.
// +1: `independent-pharmacy-rx-margin-calculator` graduated.
// +1: `dental-patient-financing-fee-calculator` graduated.
// +1: `app-review-insights` graduated.
// +1: `postgres-index-auditor` graduated.
// +1: `pg-stat-statements-analyzer` graduated.
// +1: `oncall-load-analyzer` graduated.
// +1: `bid-leveling-worksheet` graduated.
// +1: `mobile-vet-house-call-fee-calculator` graduated.
// +1: `fixed-bid-overrun-forecaster` graduated.
// +1: `soc2-readiness-checker` graduated.
// +1: `timber-sale-offer-checker` graduated.
// +1: `hunting-lease-income-calculator` graduated.
// +1: `pollination-contract-checker` graduated.
// +1: `grazing-lease-rate-calculator` graduated.
// +1: `solar-land-lease-offer-calculator` graduated.
// +1: `oyster-farm-growout-planner` graduated.
// +1: `hay-sale-price-calculator` graduated.
// +1: `coffee-cart-event-quote-calculator` graduated.
// +1: `vineyard-grape-vs-wine-calculator` graduated.
// +1: `house-hack-calculator` graduated.
// +1: `screen-print-job-quote-calculator` graduated.
// +1: `winery-excise-tax-calculator` graduated.
// +1: `form-2290-hvut-calculator` graduated.
// +1: `eu-pay-gap-report-calculator` graduated.
// +1: `401k-plan-fee-calculator` graduated.
// +1: `stocker-cattle-margin-calculator` graduated.
// +1: `payment-processor-fee-comparison-calculator` graduated.
// +1: `clergy-housing-allowance-calculator` graduated.
// +1: `fuel-surcharge-schedule-calculator` graduated.
// +1: `cake-pricing-calculator` graduated.
// +1: `construction-delay-claim-calculator` graduated.
// +1: `lumper-fee-reimbursement-calculator` graduated.
// +1: `powder-coating-job-price-calculator` graduated.
// +1: `grease-trap-pumping-price-calculator` graduated.
// +1: `laser-cutting-engraving-job-price-calculator` graduated.
// +1: `bed-bug-heat-treatment-price-calculator` graduated.
// +1: `pool-opening-closing-price-calculator` graduated.
// +1: `hoarding-cleanout-bid-calculator` graduated.
// +1: `standby-generator-install-price-calculator` graduated.
// +1: `ppf-ceramic-coating-price-calculator` graduated.
// +1: `paintless-dent-repair-quote-calculator` graduated.
// +1: `fundraising-event-net-calculator` graduated.
// +1: `private-chef-service-price-calculator` graduated.
// +1: `tournament-pairing-manager` graduated.
// +1: `fair-workweek-schedule-checker` graduated.
// +1: `vegetable-garden-planting-calendar` graduated.
// +1: `secret-santa-draw` graduated.
// +1: `json-ld-rich-result-validator` graduated.
// +1: `roommate-rent-splitter` graduated.
// +1: `car-lease-deal-checker` graduated.
// +1: `grain-store-or-sell-calculator` graduated.
// +1: `home-sale-net-proceeds-calculator` graduated.
// +1: `tax-deed-auction-max-bid-planner` graduated.
// +1: `courier-van-route-profit-calculator` graduated.
// +1: `investor-update-builder` graduated.
// +1: `private-school-tuition-discount-calculator` graduated.
// +1: `amusement-route-location-calculator` graduated.
// +1: `laundromat-acquisition-offer-calculator` graduated.
// +1: `franchise-item-19-reality-check` graduated.
// +1: `pilot-car-escort-run-profit-calculator` graduated.
// +1: `kids-birthday-party-package-profit-calculator` graduated.
// +1: `event-rental-inventory-payback-calculator` graduated.
// +1: `golf-simulator-bay-profit-calculator` graduated.
// +1: `weekly-staff-schedule-maker` graduated.
// +1: `ebike-rental-fleet-profit-calculator` graduated.
// +1: `trampoline-park-profit-calculator` graduated.
// +1: `axe-throwing-bar-profit-calculator` graduated.
// +1: `band-tour-profit-planner` graduated.
// +1: `climbing-gym-profit-calculator` graduated.
// +1: `percentage-rent-audit-checker` graduated.
// +1: `release-notes-generator` graduated.
// +1: `bail-bond-agency-exposure-calculator` graduated.
// +1: `shift-rotation-schedule-generator` graduated.
// +1: `funeral-price-list-checker` graduated.
// +1: `cannabis-280e-tax-calculator` graduated.
// +1: `sales-quota-capacity-planner` graduated.
// +1: `ppp-pricing-table-generator` graduated.
// +1: `3pl-invoice-audit-checker` graduated.
// +1: `glamping-unit-payback-calculator` graduated.
// +1: `str-arbitrage-lease-calculator` graduated.
// +1: `npm-lockfile-duplicates-check` graduated.
// +1: `subscription-proration-calculator` graduated.
// +1: `mini-golf-course-profit-calculator` graduated.
// +1: `rv-boat-storage-lot-calculator` graduated.
// +1: `self-serve-dog-wash-profit-calculator` graduated.
// +1: `coworking-space-profit-calculator` graduated.
// +1: `arcade-game-payback-calculator` graduated.
// +1: `hydroponic-farm-profit-calculator` graduated.
// +1: `kombucha-brewery-profit-calculator` graduated.
// +1: `npm-audit-triage` graduated.
// +1: `pet-boarding-daycare-profit-calculator` graduated.
// +1: `ice-cream-shop-seasonal-profit-calculator` graduated.
// +1: `boba-tea-shop-profit-calculator` graduated.
// +1: `convenience-store-gas-station-profit-calculator` graduated.
// +1: `pip-audit-triage` graduated.
// +1: `cargo-audit-triage` graduated.
// +1: `nis2-scope-checker` graduated.
// +1: `dry-cleaner-profit-calculator` graduated.
// +1: `eu-ai-act-risk-checker` graduated.
// +1: `eudr-scope-checker` graduated.
// +1: `cbam-cost-estimator` graduated.
// +1: `eaa-accessibility-act-checker` graduated.
// +1: `indoor-play-center-profit-calculator` graduated.
// +1: `gpsr-product-safety-checker` graduated.
// +1: `eu-battery-regulation-checker` graduated.
// +1: `padel-club-profit-calculator` graduated.
// +1: `eu-data-act-checker` graduated.
// +1: `eu-packaging-regulation-checker` graduated.
// +1: `bowling-center-profit-calculator` graduated.
// +1: `pay-transparency-directive-checker` graduated.
// +1: `eu-whistleblower-channel-checker` graduated.
// +1: `eu-einvoicing-mandate-checker` graduated.
// +1: `eu-green-claims-checker` graduated.
// +1: `eu-product-liability-directive-checker` graduated.
// +1: `dac7-seller-reporting-checker` graduated.
// +1: `eu-platform-work-directive-checker` graduated.
// +1: `eu-price-reduction-claim-checker` graduated.
// +1: `eu-green-claims-copy-scanner` graduated.
// +1: `eu-dora-readiness-checker` graduated.
// +1: `ugc-creator-rate-calculator` graduated.
// +1: `eu-csrd-scope-checker` graduated.
// +1: `uk-sole-trader-vs-limited-company-calculator` graduated.
// +1: `eu-espr-readiness-checker` graduated.
// +1: `employer-payroll-tax-cost-calculator` graduated.
// +1: `commercial-property-cap-rate-calculator` graduated.
// +1: `uk-statutory-sick-pay-calculator` graduated.
// +1: `retirement-plan-startup-credit-calculator` graduated.
// +1: `au-gst-registration-checker` graduated.
// +1: `tfsa-over-contribution-checker` graduated.
// +1: `social-security-survivor-spousal-benefit-calculator` graduated.
// +1: `au-redundancy-pay-calculator` graduated.
// +1: `iolta-three-way-reconciliation-checker` graduated.
// +1: `uk-cis-deduction-refund-calculator` graduated.
// +1: `nz-gst-registration-checker` graduated.
// +1: `uk-trading-allowance-calculator` graduated.
// +1: `uk-ir35-inside-outside-calculator` graduated.
// +1: `uk-self-assessment-late-penalty-calculator` graduated.
// +1: `uk-child-benefit-charge-calculator` graduated.
// +1: `uk-student-loan-repayment-calculator` graduated.
// +1: `uk-100k-tax-trap-calculator` graduated.
// +1: `uk-landlord-section-24-calculator` graduated.
// +1: `uk-stamp-duty-calculator` graduated.
// +1: `uk-pension-annual-allowance-calculator` graduated.
// +1: `uk-marriage-allowance-calculator` graduated.
// +1: `uk-redundancy-pay-calculator` graduated.
// +1: `uk-statutory-maternity-pay-calculator` graduated.
// +1: `uk-holiday-pay-calculator` graduated.
// +1: `uk-employer-hiring-cost-calculator` graduated.
// +1: `uk-scottish-income-tax-calculator` graduated.
// +1: `uk-self-assessment-tax-calculator` graduated.
// +1: `uk-money-tools-finder` graduated.
// +1: `uk-salary-sacrifice-calculator` graduated.
// +1: `uk-company-car-tax-calculator` graduated.
// +1: `uk-minimum-wage-checker` graduated.
// +1: `uk-tax-code-checker` graduated.
// +1: `uk-state-pension-ni-years-checker` graduated.
// +1: `uk-rent-a-room-relief-calculator` graduated.
// +1: `uk-late-payment-interest-calculator` graduated.
// +1: `uk-tax-free-childcare-calculator` graduated.
// +1: `uk-simplified-expenses-calculator` graduated.
// +1: `uk-vat-flat-rate-scheme-calculator` graduated.
// +1: `uk-capital-allowances-calculator` graduated.
// +1: `uk-directors-loan-s455-calculator` graduated.
// +1: `uk-savings-interest-tax-calculator` graduated.
// +1: `uk-rd-tax-relief-calculator` graduated.
// +1: `uk-emi-share-option-tax-calculator` graduated.
// +1: `uk-gift-aid-higher-rate-relief-calculator` graduated.
// +1: `uk-lifetime-isa-vs-pension-calculator` graduated.
// +1: `uk-eis-seis-relief-calculator` graduated.
// +1: `uk-shared-parental-pay-planner` graduated.
// +1: `uk-mortgage-overpayment-calculator` graduated.
// +1: `uk-working-from-home-tax-relief-calculator` graduated.
// +1: `uk-bonus-tax-calculator` graduated.
// +1: `uk-mileage-allowance-calculator` graduated.
// +1: `uk-unfair-dismissal-compensation-calculator` graduated.
// +1: `ca-self-employed-tax-set-aside-calculator` graduated.
// +1: `au-sole-trader-tax-set-aside-calculator` graduated.
// +1: `ie-self-employed-tax-set-aside-calculator` graduated.
// +1: `nl-zzp-tax-set-aside-calculator` graduated.
// +1: `de-freiberufler-tax-set-aside-calculator` graduated.
// +1: `za-freelancer-provisional-tax-set-aside-calculator` graduated.
// +1: `sg-freelancer-tax-set-aside-calculator` graduated.
// +1: `in-freelancer-advance-tax-set-aside-calculator` graduated.
// +1: `us-freelancer-tax-set-aside-calculator` graduated.
// +1: `tenant-security-deposit-deadline-checker` graduated.
// +1: `rfp-compliance-matrix` graduated.
// +1: `security-questionnaire-matcher` graduated.
// +1: `job-application-tracker` graduated.
// +1: `youtube-sponsorship-rate-calculator` graduated.
// +1: `dunning-engine` graduated.
// +1: `cancel-flow` graduated.
// +1: `webhook-relay` graduated.
// +1: `visit-keeper` graduated.
// +1: `rev-rec` graduated.
// +1: `trial-converter` graduated.
// +1: `form-inbox` graduated.
// +1: `meter-keeper` graduated.
// +1: `link-keeper` graduated.
// +1: `support-desk` graduated.
// +1: `slot-keeper` graduated.
// +1: `help-keeper` graduated.
// +1: `churn-radar` graduated.
// +1: `pql-radar` graduated.
// +1: `deal-keeper` graduated.
// +1: `changelog-keeper` graduated.
// +1: `error-keeper` graduated.
// +1: `workflow-audit` graduated.
// +1: `reseller-books` graduated.
// +1: `review-reply-desk` graduated.
// +1: `sales-call-notes-desk` graduated.
// +1: `seller-net-sheet/compare-multiple-offers.html` (a second page with its own opt-out).
// +1: `uk-crypto-cgt-calculator` graduated.
// +1: `bid-price-engine` graduated (the consolidated bid calculator).
// +1: `us-substantial-presence-test-calculator` graduated.
// +1: `discogs-fee-calculator` graduated.
// +2: `hands-free-language-coach` and `listen-and-learn-audio` graduated.
// +1: `persona-conversation-simulator` graduated.
// +1: `sales-cadence-builder` graduated.
// +1: `publish-kit` graduated.
// +1: `saints-by-candlelight` graduated.
// +1: `ai-bookkeeper` graduated.
// +1: `open-house-plans` graduated.
// +1: `wall-framing-takeoff` graduated.
// +1: `support-agent` graduated.
// +1: `ca-crypto-acb-calculator` graduated.
// +1: `vsme-report-builder` graduated.
// +1: `dupehound` graduated.
const SWITCHES_IN_THE_CATALOGUE = 1292;
// +1: `open-tennis-robots` graduated.
// +1: `uk-statutory-residence-test-checker` graduated.
// +1: `llm-spend-guard` graduated.
// +1: `liability-audit` graduated.
// +1: `equipment-lease-vs-buy-calculator` graduated.
// +1: `patent-maintenance-fee-planner` graduated.
// +1: `retreat-profit-pricing-calculator` graduated.
// +1: `sms-segment-cost-calculator` graduated.
// +1: `tow-truck-rate-calculator` graduated.
// +1: `saas-efficiency-metrics-calculator` graduated.
// +1: `sports-official-game-fee-calculator` graduated.
// +1: `embroidery-shop-quote-calculator` graduated.
// +1: `feature-flag-pricing-calculator` graduated.
// +1: `fishing-charter-trip-pricing-calculator` graduated.
// +1: `farrier-visit-pricing-calculator` graduated.
// +1: `rv-rental-host-profit-calculator` graduated.
// +1: `horse-boarding-stall-profit-calculator` graduated.
// +1: `pet-waste-removal-route-calculator` graduated.
// +1: `campground-site-profit-calculator` graduated.
// +1: `worker-classification-checker` graduated.
// +1: `ad-slot-sell-through-planner` graduated.
// +1: `ag-spray-drone-quote-calculator` graduated.
// +1: `lcl-vs-fcl-container-calculator` graduated.
// +1: `ski-snowboard-tune-shop-profit-calculator` graduated.
// +1: `bike-shop-repair-profit-calculator` graduated.
// +1: `tailor-alterations-shop-profit-calculator` graduated.
// +1: `shoe-repair-shop-profit-calculator` graduated.
// +1: `phone-repair-shop-profit-calculator` graduated.
// +1: `barbershop-chair-profit-calculator` graduated.
// +1: `braiding-studio-profit-calculator` graduated.
// +1: `esthetician-studio-profit-calculator` graduated.
// +1: `swim-lesson-pool-rental-profit-calculator` graduated.
// +1: `upholstery-shop-job-profit-calculator` graduated.
// +1: `hydroseeding-job-bid-calculator` graduated.
// +1: `home-inspection-business-profit-calculator` graduated.
// +1: `driving-school-profit-calculator` graduated.
// +1: `yoga-pilates-studio-class-profit-calculator` graduated.
// +1: `wedding-day-timeline-builder` graduated.
// +1: `ca-meal-rest-break-premium-checker` graduated.
// +1: `flsa-regular-rate-overtime-audit` graduated.
// +1: `json-to-types-generator` graduated.
// +1: `prop-firm-challenge-calculator` graduated.
// +1: `csv-to-sql-generator` graduated.
// +1: `eu-dsa-obligations-checker` graduated.
// +1: `uk-mtd-income-tax-checker` graduated.
// +1: `tutoring-group-schedule-optimizer` graduated.

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

test("a plainly named switch is tried before an unrelated export that silences the recorder", async () => {
  // Candidates run in export order after the sort, and the first one that
  // silences the recorder decides the verdict. `hush` forgets on reload but is
  // exported first; the module is sound because `setUsageOptOut` persists.
  // Without the promised-names-first sort the unrelated export answers for it.
  const result = await statusOf(`
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
export function hush() { globalThis.__usageOptOut = true; }
export function setUsageOptOut(value) {
  globalThis.__usageOptOut = Boolean(value);
  if (value) localStorage.setItem(OPT_OUT, "1"); else localStorage.removeItem(OPT_OUT);
}
`);
  assert.equal(result.status, "pass", JSON.stringify(result));
  assert.match(result.via, /setUsageOptOut/);
});

test("a candidate that throws is skipped, not judged as a switch", async () => {
  // `disableUsage` flips the in-memory flag and then throws on every call
  // shape. Treating a throw as acceptance would fail the module on that
  // function's reload even though the real switch after it keeps the choice.
  const result = await statusOf(`
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
export function disableUsage() { globalThis.__usageOptOut = true; throw new Error("not a switch"); }
export function setUsageOptOut(value) {
  globalThis.__usageOptOut = Boolean(value);
  if (value) localStorage.setItem(OPT_OUT, "1"); else localStorage.removeItem(OPT_OUT);
}
`);
  assert.equal(result.status, "pass", JSON.stringify(result));
  assert.match(result.via, /setUsageOptOut/);
});

test("a check puts back a global it overwrote or deleted", async () => {
  // restoreGlobals must reinstate pre-existing globals a module changed, not
  // only delete the ones it added.
  globalThis.__optoutChanged = "original";
  globalThis.__optoutRemoved = "original";
  try {
    await statusOf(`
globalThis.__optoutChanged = "module";
delete globalThis.__optoutRemoved;
${REMEMBERS}`);
    assert.equal(globalThis.__optoutChanged, "original");
    assert.equal(globalThis.__optoutRemoved, "original");
  } finally {
    delete globalThis.__optoutChanged;
    delete globalThis.__optoutRemoved;
  }
});

test("an export named like a recorder is never tried as the switch", async () => {
  // Calling `countOptOut(true)` is what silences this module, but the name
  // puts it with the recorders `drive` itself calls. With it excluded the
  // module offers no switch (`no-switch`); letting it through would judge the
  // module on a function that is the recorder's own business.
  const result = await statusOf(`
const KEY = "fixture-usage";
export function record(event) {
  if (typeof localStorage === "undefined" || globalThis.__usageOptOut) return;
  localStorage.setItem(KEY, String((Number(localStorage.getItem(KEY)) || 0) + 1));
}
export function countOptOut(value) { if (value === true) globalThis.__usageOptOut = true; }
`);
  assert.equal(result.status, "no-switch", JSON.stringify(result));
});

test("a write to a key the control never saw is counting that resumed", async () => {
  // After the reload this recorder lands on a different key than the control
  // run did. The key is neither a measured counter nor the switch's own, so it
  // has to read as counting; only the switch's own bookkeeping is exempt.
  const result = await statusOf(`
const KEY = import.meta.url.includes("optout-reload") ? "fixture-reloaded" : "fixture-usage";
export function record(event) {
  if (typeof localStorage === "undefined" || globalThis.__usageOptOut) return;
  localStorage.setItem(KEY, String((Number(localStorage.getItem(KEY)) || 0) + 1));
}
export function setUsageOptOut(value) {
  globalThis.__usageOptOut = Boolean(value);
  if (value) localStorage.removeItem("fixture-usage");
}
`);
  assert.equal(result.status, "fail", JSON.stringify(result));
  assert.deepEqual(result.keys, ["fixture-reloaded"]);
});

test("a check puts back an accessor global the module replaced", async () => {
  // Same value (undefined) and same setter, different getter: the restore must
  // compare getters too, or a replaced accessor leaks into the next module.
  Object.defineProperty(globalThis, "__optoutAccessor", {
    get: () => "original", configurable: true,
  });
  try {
    await statusOf(`
Object.defineProperty(globalThis, "__optoutAccessor", { get: () => "module", configurable: true });
${REMEMBERS}`);
    assert.equal(globalThis.__optoutAccessor, "original");
  } finally {
    delete globalThis.__optoutAccessor;
  }
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
