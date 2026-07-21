/**
 * Archived ProcessIteration entries — see src/lib/process/prompt_process.tsx for
 * why this exists (process-log-archive-scalability-split in
 * BUSINESS_DECISIONS) and for the live, editable tail. Part 3 of 8, oldest-first (chronological order preserved across all archive files + the live tail).
 *
 * Append-only, like the live arrays it was split from — never edit an entry
 * here, and never append new entries directly to an archive file. New
 * entries always go in the live array in prompt_process.tsx (or
 * business-decisions.ts for BUSINESS_DECISIONS); a future maintenance pass
 * moves the oldest live entries into a new archive file (or a new numbered
 * file in this directory) once the live file grows large again.
 */
import type { ProcessIteration } from "../types";
import { BUSINESS_DECISIONS } from "../business-decisions";

export const ITERATIONS_ARCHIVE_03: ProcessIteration[] = [
  {
    date: "2026-07-14",
    branch: "cursor/prompt-process-evolution-f936",
    summary:
      "Empty-backlog after PR #216 (checkout-slug-sanitize-traversal): free NEXT_STEPS stayed operator/legal-gated. Same-minute sibling business-process-evolution-7bfa claimed preview-indexing-consent-guard (folding claude/dev-work-preview-index-consent). Scanned CLI remotes first and found grok/dev-work-redirect-url-hardening had a complete feature body for residual safe-next-path + resolveTrustedAppUrl gaps but no mergeable PR (Actions token blocked). Re-verified the bugs on main, then folded that body as redirect-url-validator-hardening.",
    shipped: [
      "src/lib/auth/safe-next-path.ts — normalizePathnameForSafety (decode + collapse `.` + reject `..`); dashboard-prefix and login self-loop checks run on the normalized pathname so hash / single-dot / percent-encoded login forms fail closed",
      "src/lib/auth/safe-next-path.test.ts — regressions for login#hash, ./login, %6cogin self-loops",
      "src/lib/security/app-url.ts — tryHeaderDerivedAppOrigin (http(s) only, host-only, no userinfo/path/query/hash, returns url.origin); resolveTrustedAppUrl uses it",
      "src/lib/security/app-url.test.ts — regressions for javascript:/data: proto, path-smuggling host, userinfo host",
      "Docs: architecture.tsx notes both hardenings beside the existing safe-next-path / resolveTrustedAppUrl prose",
      "NEXT_STEPS: redirect-url-validator-hardening done (folded from grok/dev-work-redirect-url-hardening)",
      "AGENT_PROTOCOL — open-redirect + trusted-app-url rules updated for normalize-then-check / tryHeaderDerivedAppOrigin; cooperation rule now says scan stuck CLI remotes before inventing a new empty-backlog audit target",
      "BUSINESS_DECISIONS — documented why folding the stuck CLI validator hardening beat a clean re-audit",
      "Verified: npm test + lint + build",
    ],
    decisions: BUSINESS_DECISIONS.slice(307, 308),
  },
  {
    date: "2026-07-14",
    branch: "cursor/prompt-process-evolution-7291",
    summary:
      "Empty-backlog after PR #218 (redirect-url-validator-hardening): free NEXT_STEPS stayed operator/legal-gated. Prior sibling explicitly queued opencode/dev-work-7qz1k9 Convex↔SQLite ordering parity as the next fold target. Scanned stuck CLI remotes and found six remotes (grok/claude/opencode convex-order-parity variants) with a complete feature body and no open PR (Actions token blocked). Re-verified the order drift on main, then folded that body as convex-query-ordering-parity.",
    shipped: [
      "convex/leads.ts — leads.list .order(\"desc\") so _creationTime newest-first matches getLeads ORDER BY createdAt DESC (leads has no explicit createdAt)",
      "convex/checkoutSessions.ts — listOpen sorts app createdAt ISO ascending to match SQLite abandoned-recovery oldest-first",
      "convex/inquiries.ts — listBySlug collect + sort app createdAt numeric desc + slice(limit) (by_leadSlug has no createdAt sort field)",
      "Docs: architecture.tsx documents the dual-backend list-order contract beside the existing Convex/SQLite mapping notes",
      "AGENT_PROTOCOL — dual-backend list-order rule so new list* twins mirror SQLite ORDER BY in the same commit",
      "NEXT_STEPS: convex-query-ordering-parity done (folded from grok/dev-work-convex-order-parity + claude/dev-work-convex-order-parity + opencode/dev-work-7qz1k9)",
      "BUSINESS_DECISIONS — documented why folding the stuck CLI ordering parity beat a clean re-audit",
      "Verified: npm test + lint + build",
    ],
    decisions: BUSINESS_DECISIONS.slice(308, 309),
  },
  {
    date: "2026-07-14",
    branch: "cursor/business-process-evolution-eccd",
    summary:
      "Empty-backlog after PR #222 (convex-query-ordering-parity). Sibling prompt-process-evolution-7291 already owned and merged the queued Convex↔SQLite list-order fold — pivoted per AGENT_PROTOCOL rather than dual-building. Fresh TOCTOU audit (axis not exhausted: commerce sync + orphan archive guarded, handoff provision not) found assignCustomDomainAndProvision / assignVercelProjectAndProvision / enqueueProductionHandoff call tryProvisionVercelDomain (real Vercel fetch) then insertDeployHandoff the pre-call snapshot via full-row upsert, so a concurrent Mark live during that window silently reverts live → provisioned and drops the Mark live note. Claimed and shipped handoff-provision-lost-update-guard.",
    shipped: [
      "src/lib/deploy/handoff-preserve.ts — mergeProvisionOntoFreshHandoff (fresh operator fields + provision vercelDomainStatus/notes/status; never downgrade live/provisioned; prefer rebuild status over stale failed)",
      "src/lib/deploy/handoff.ts — assignCustomDomainAndProvision / assignVercelProjectAndProvision / enqueueProductionHandoff re-read getDeployHandoffBySlug after tryProvisionVercelDomain and merge before insertDeployHandoff",
      "src/lib/deploy/handoff-preserve.test.ts (+4) + handoff.test.ts (+2) — concurrent Mark live survives Vercel window on both assign paths; pure merge cases for clear-domain / failed-rebuild / provisioned-no-downgrade",
      "Docs: architecture.tsx documents the re-read + merge contract beside preserveDeployHandoffOperatorFields",
      "AGENT_PROTOCOL — TOCTOU rule extended to deploy handoff provision (handoff-provision-lost-update-guard)",
      "NEXT_STEPS: handoff-provision-lost-update-guard done",
      "BUSINESS_DECISIONS — documented why handoff provision TOCTOU beats inventing an optional aggregate after ordering-parity landed",
      "Verified: npm test (1273 passed, +6 handoff TOCTOU regressions) + lint + build",
    ],
    decisions: BUSINESS_DECISIONS.slice(309, 310),
  },
  {
    date: "2026-07-14",
    branch: "cursor/business-process-evolution-8524",
    summary:
      "Empty-backlog after PR #223 (handoff-provision-lost-update-guard). Free NEXT_STEPS stayed operator/legal-gated. Sibling scan found grok/dev-work-handoff-marker-status with a complete never-downgrade fix for updateDeployHandoffStatus (bundle receipt/DNS markers regressing concurrent Mark live) but no open PR (Actions token blocked). Folded that body rather than inventing a new audit target. Claimed and shipped handoff-email-marker-status-no-downgrade.",
    shipped: [
      "src/lib/deploy/handoff-preserve.ts — preferAdvancedHandoffStatus + HANDOFF_STATUS_RANK (live > provisioned > awaiting_dns > pending/failed)",
      "src/lib/db.ts updateDeployHandoffStatus SQLite path — apply never-downgrade before UPDATE",
      "convex/deployHandoffs.ts updateStatus — atomic never-downgrade when patching status + notes (mirrors pure helper; Convex cannot import src/)",
      "src/lib/deploy/handoff-preserve.test.ts (+3) — stale awaiting_dns cannot undo live; upgrades still work; equal-rank note append keeps requested",
      "Docs: architecture.tsx notes never-downgrade beside handoff provision TOCTOU prose",
      "AGENT_PROTOCOL — TOCTOU rule extended for status-regression on marker writes (preferAdvancedHandoffStatus)",
      "NEXT_STEPS: handoff-email-marker-status-no-downgrade done (folded from grok/dev-work-handoff-marker-status)",
      "BUSINESS_DECISIONS — documented why atomic never-downgrade + folding a stuck CLI remote beats inventing an optional aggregate",
      "Verified: npm test (1276 passed, +3 preferAdvancedHandoffStatus regressions) + lint + build",
    ],
    decisions: BUSINESS_DECISIONS.slice(309, 310),
  },
  {
    date: "2026-07-14",
    branch: "cursor/prompt-process-evolution-6033",
    summary:
      "Empty-backlog after PR #226 (handoff-email-marker-status-no-downgrade). Same-minute dual window: this branch claimed the handoff-marker fold first, sibling business-process-evolution-8524 claimed+merged it (PR #226) — pivoted per AGENT_PROTOCOL. Scanned stuck CLI remotes next and found grok/continuous-work-voice-test-env with a complete faq-pack ANTHROPIC_API_KEY isolation fix and no open PR (Actions token blocked). Folded that body as client-voice-factory-test-env-isolation.",
    shipped: [
      "src/lib/voice/faq-pack.test.ts — clear/restore ANTHROPIC_API_KEY around getClientVoiceGenerator().generate(); assert StubClientVoiceGenerator + CLIENT_VOICE_FAQ_SCRIPT_TYPES.length (matches generators.test.ts isolation)",
      "AGENT_PROTOCOL — Vitest LLM-factory tests must isolate ANTHROPIC_API_KEY (client-voice-factory-test-env-isolation)",
      "NEXT_STEPS: client-voice-factory-test-env-isolation done (folded from grok/continuous-work-voice-test-env)",
      "BUSINESS_DECISIONS — documented why folding this stuck CLI CI hygiene fix beats inventing an optional aggregate after sibling owned the handoff-marker fold; queued residual legacy-slug encode-at-use path-safety",
      "Verified: npm test (1276 passed; faq-pack + generators also under ANTHROPIC_API_KEY=sk-fake) + lint + build",
    ],
    decisions: BUSINESS_DECISIONS.slice(310, 311),
  },
  {
    date: "2026-07-14",
    branch: "cursor/prompt-process-evolution-78e4",
    summary:
      "Empty-backlog after PR #227 (client-voice-factory-test-env-isolation). Sibling business-process-evolution-2d7a already claimed legacy-slug-encode-at-use-path-safety — pivoted. Scanned stuck CLI remotes and folded opencode/dev-work-f3k8p1 (complete CSV hours / RFC 4180 / field-limits body; Actions token blocked from gh pr create) as csv-import-hours-multiline-limits — the live lead-volume unlock while Places stays counsel-gated.",
    shipped: [
      "src/lib/leads/csv-import.ts — hours column + CSV_LEAD_TEMPLATE; splitCsvIntoLines (RFC 4180 quoted multiline); MAX_BUSINESS_NAME_LENGTH/MAX_DESCRIPTION_LENGTH/MAX_SERVICES; parseLeadHours for optional hours cells",
      "src/lib/leads/sqlite-row-mapping.ts — parseLeadHours splits on the first '·' only so weekend values that contain middots survive SQLite round-trip",
      "src/lib/leads/csv-import.test.ts (+11) + sqlite-row-mapping.test.ts (+1) — hours parse, multiline quoted fields, length caps, middot-in-weekend regression",
      "Docs: architecture.tsx documents hours column + RFC 4180 line split + first-separator hours parse",
      "AGENT_PROTOCOL — CSV quality preferred empty-backlog unlock while Places stays gated; parseLeadHours first-separator rule",
      "NEXT_STEPS: csv-import-hours-multiline-limits done (folded from opencode/dev-work-f3k8p1)",
      "BUSINESS_DECISIONS — documented why folding this stuck CSV quality fix beats dual-building sibling encode-at-use or inventing an optional aggregate",
      "Verified: npm test (1288 passed, +12 CSV hours/RFC4180/limits + middot-in-weekend regressions) + lint + build",
    ],
    decisions: BUSINESS_DECISIONS.slice(311, 312),
  },
  {
    date: "2026-07-14",
    branch: "grok/dev-work-slug-path-encode",
    summary:
      "Empty-backlog after PR #227 (client-voice-factory-test-env-isolation). Free NEXT_STEPS stayed operator/legal-gated. Prior ITERATIONS queued residual encode-at-use slug path-safety after PR #216 closed checkout create-path sanitize. Claimed and shipped legacy-slug-encode-at-use-path-safety: shared slug-path helpers + wire-through of every /preview and /api/contact construction site so legacy free-form slugs cannot expand into multi-segment paths.",
    shipped: [
      "src/lib/leads/slug-path.ts (+tests) — encodeLeadSlugPathSegment, leadPreviewPath, leadContactApiPath, leadPreviewAbsoluteUrl, leadContactAbsoluteUrl, leadSlugAsDnsLabel",
      "src/lib/seo.ts previewUrl — encode-at-use via leadPreviewAbsoluteUrl; seo.test.ts path-breaking slug regression",
      "src/lib/deploy/handoff.ts buildHandoffRecord — encoded preview/contact URLs + DNS-safe suggestedHost",
      "src/lib/email/resend.ts — outreach Email 1–3, commerce abandoned recovery, starter upsell use leadPreviewAbsoluteUrl",
      "src/proxy.ts — rewrite targets via leadPreviewPath",
      "src/app/sitemap.ts, commerce checkout cancel_url, stripe webhook commerce receipt, dashboard/checkout hrefs, contact form, preview-open beacon",
      "Docs: architecture.tsx notes encode-at-use beside create-path sanitize",
      "AGENT_PROTOCOL — encode-at-use rule for lead slug path construction (legacy-slug-encode-at-use-path-safety)",
      "NEXT_STEPS: legacy-slug-encode-at-use-path-safety done",
      "BUSINESS_DECISIONS — documented why encode-at-use beats create-path-only and dead Convex API map busywork",
      "Verified: npm test (1285 passed) + lint + build",
      "PR handoff: Actions token blocked from gh pr create — issue #228 points at grok/dev-work-slug-path-encode",
    ],
    decisions: BUSINESS_DECISIONS.slice(313, 314),
  },
  {
    date: "2026-07-14",
    branch: "grok/continuous-work-slug-path-encode",
    summary:
      "Empty-backlog continuous-work run: free NEXT_STEPS stayed operator/legal-gated. Scanned stuck CLI remotes before inventing an audit target and found grok/dev-work-slug-path-encode with a complete legacy-slug-encode-at-use-path-safety feature body plus issue #228 (Actions token blocked from gh pr create). Folded that body onto this continuous-work branch to open a mergeable draft PR rather than re-auditing 2x-clean axes or dual-building encode-at-use.",
    shipped: [
      "merge: fast-forward fold of origin/grok/dev-work-slug-path-encode (claim + feature + handoff note) — both ITERATIONS kept",
      "NEXT_STEPS owner updated to grok/continuous-work-slug-path-encode (folded from grok/dev-work-slug-path-encode; issue #228)",
      "No feature re-implementation — re-verified residual path sinks stay on slug-path helpers; query-string checkout links already encodeURIComponent; revalidatePath left unencoded (Next internal path key, not a browser/proxy URL)",
      "Verified on continuous-work branch: npm test (1285 passed) + lint + build",
      "PR handoff: Actions token blocked from gh pr create on continuous-work too — issue #229 points at grok/continuous-work-slug-path-encode (fold of #228 / grok/dev-work-slug-path-encode)",
    ],
    decisions: BUSINESS_DECISIONS.slice(313, 314),
  },
  {
    date: "2026-07-14",
    branch: "cursor/business-process-evolution-2d7a",
    summary:
      "Empty-backlog after PR #227 (client-voice-factory-test-env-isolation). Free NEXT_STEPS stayed operator/legal-gated. Prior ITERATIONS explicitly queued residual encode-at-use slug path-safety. Scanned stuck CLI remotes and found grok/continuous-work-slug-path-encode (fold of grok/dev-work-slug-path-encode) with a complete feature body and no open PR (Actions token blocked; issues #228/#229). Folded that body onto this automation branch that can open/merge. Merged origin/main (PR #230 csv-import-hours-multiline-limits) mid-window — kept both ITERATIONS.",
    shipped: [
      "Fold: origin/grok/continuous-work-slug-path-encode feature files (slug-path helpers + wire-through) — kept both grok ITERATIONS above",
      "NEXT_STEPS: legacy-slug-encode-at-use-path-safety done (owner 2d7a, folded from continuous-work ← dev-work)",
      "AGENT_PROTOCOL + architecture.tsx encode-at-use rule retained from fold",
      "BUSINESS_DECISIONS — documented why folding this queued residual beats inventing an optional aggregate; remapped encode decision to slice(313, 314) after CSV/as-const/mark-live appends",
      "merge: origin/main (PR #230 CSV hours fold) — both ITERATIONS kept",
      "Verified: npm test (1297 passed) + lint + build",
    ],
    decisions: BUSINESS_DECISIONS.slice(313, 314),
  },
  {
    date: "2026-07-14",
    branch: "opencode/dev-work-9k2m4x",
    summary:
      "Empty-backlog regression audit after PR #231 (slug-path-encode fold). Found the as const annotations on updateLeadStageAction, importLeadsCsvAction, and bootstrapStripePricesAction had been silently overwritten by the grok/dev-work-slug-path-encode branch's pre-fix version of actions.ts — restoring them closes a silent discriminated-union narrowing regression.",
    shipped: [
      "src/app/dashboard/actions.ts — restored as const on bootstrapStripePricesAction success literals",
      "src/app/dashboard/leads/actions.ts — restored as const on updateLeadStageAction + importLeadsCsvAction",
      "PR handoff: Actions token blocked from gh pr create — branch opencode/dev-work-9k2m4x",
    ],
    decisions: BUSINESS_DECISIONS.slice(314, 315),
  },
  {
    date: "2026-07-14",
    branch: "grok/dev-work-as-const-restore",
    summary:
      "Empty-backlog after PR #231. Scanned stuck CLI remotes and found opencode/continuous-work-062115 + opencode/dev-work-9k2m4x with a complete server-action/resend as-const fix and no open PR. Folded that body (corrected 9k2m4x duplicate success key) as server-action-as-const-success-literals / restore.",
    shipped: [
      "src/app/dashboard/actions.ts — bootstrapStripePricesAction: all success literals use as const",
      "src/app/dashboard/leads/actions.ts — updateLeadStageAction + importLeadsCsvAction: all success literals use as const",
      "src/lib/email/resend.ts — sendEmail + sendOperatorDailyDigest: all success literals use as const",
      "PR handoff: Actions token blocked — issue #232 points at grok/dev-work-as-const-restore",
    ],
    decisions: BUSINESS_DECISIONS.slice(314, 315),
  },
  {
    date: "2026-07-14",
    branch: "grok/continuous-work-as-const-restore",
    summary:
      "Empty-backlog continuous-work run: folded opencode/dev-work-9k2m4x + resend from continuous-work-062115 onto this branch for a mergeable PR (Actions token blocked; issue #233).",
    shipped: [
      "Fold of grok/dev-work-as-const-restore feature body (actions + resend as const)",
      "PR handoff: Actions token blocked — issue #233 points at grok/continuous-work-as-const-restore",
    ],
    decisions: BUSINESS_DECISIONS.slice(314, 315),
  },
  {
    date: "2026-07-14",
    branch: "cursor/prompt-process-evolution-7c34",
    summary:
      "Empty-backlog after PR #231 (legacy-slug-encode-at-use-path-safety). Free NEXT_STEPS stayed operator/legal-gated. Same-minute sibling business-process-evolution-9ced dual-claimed the same fold (~16s later) — this branch's claim was earlier and both pushed feature body; kept a single implementation and both ITERATIONS per AGENT_PROTOCOL. Scanned stuck CLI remotes and folded grok/continuous-work-as-const-restore (complete feature body; issues #232/#233; Actions token blocked) rather than inventing an optional aggregate.",
    shipped: [
      "Fold: origin/grok/continuous-work-as-const-restore feature files (actions.ts + leads/actions.ts + resend.ts as const) — kept opencode/dev + grok/dev + grok/continuous ITERATIONS above",
      "NEXT_STEPS: server-action-as-const-success-restore done (owner 7c34; same-minute dual with 9ced)",
      "AGENT_PROTOCOL — post-merge as-const grep rule for actions.ts / resend.ts folds",
      "BUSINESS_DECISIONS — documented why folding the PR #231 merge regression beats inventing an optional aggregate",
      "Verified: npm test (1297 passed) + lint + build",
    ],
    decisions: BUSINESS_DECISIONS.slice(314, 315),
  },
  {
    date: "2026-07-14",
    branch: "cursor/business-process-evolution-9ced",
    summary:
      "Same-minute dual with prompt-process-evolution-7c34 on server-action-as-const-success-restore — both pushed the fold; 7c34's earlier claim merged as PR #234. Pivoted per AGENT_PROTOCOL to unique process/docs polish rather than re-shipping the suite: architecture.tsx now documents as-const merge-fold hygiene beside bootstrap action Vitest prose so future agents re-check success literals after large folds.",
    shipped: [
      "Docs: architecture.tsx notes as-const merge-fold hygiene (updateLeadStageAction / importLeadsCsvAction / bootstrapStripePricesAction / sendEmail / sendOperatorDailyDigest) beside bootstrap action Vitest prose",
      "merge: origin/main (PR #234 as-const restore) — kept both 7c34 + 9ced ITERATIONS; feature body already on main",
      "NEXT_STEPS owner remains 7c34 (earlier claim); 9ced recorded as dual + architecture follow-up",
      "Verified: npm test (1297 passed) + lint + build",
    ],
    decisions: BUSINESS_DECISIONS.slice(314, 315),
  },
  {
    date: "2026-07-14",
    branch: "grok/dev-work-mark-live-null-guard",
    summary:
      "Empty-backlog after PR #234/#235 (as-const restore). Free NEXT_STEPS stayed operator/legal-gated. Found markHandoffLive advancing lead stage even when updateDeployHandoffStatus returns null — a race that desyncs stage=live from handoff status and paid-not-live / open-handoff metrics. Claimed and shipped mark-handoff-live-null-status-guard.",
    shipped: [
      "src/lib/deploy/handoff.ts — return null before updateLeadStage when status write is null",
      "src/lib/deploy/handoff.test.ts — null-status regression (updateLeadStage must not run)",
      "src/app/dashboard/leads/actions.ts — revalidatePath via leadPreviewPath (encode-at-use)",
      "Docs: architecture.tsx notes null-status guard + encode-at-use revalidatePath",
      "PR handoff: Actions token blocked from gh pr create — issue #237 points at grok/dev-work-mark-live-null-guard",
    ],
    decisions: BUSINESS_DECISIONS.slice(316, 317),
  },
  {
    date: "2026-07-14",
    branch: "cursor/prompt-process-evolution-7e66",
    summary:
      "Empty-backlog after PR #234/#235 (as-const restore). Free NEXT_STEPS stayed operator/legal-gated. Sibling business-process-evolution-266d already claimed email-href-url-html-escape — pivoted. Scanned stuck CLI remotes and folded grok/dev-work-mark-live-null-guard (complete feature body; issue #237; Actions token blocked) as mark-handoff-live-null-status-guard rather than inventing an optional aggregate.",
    shipped: [
      "Fold: origin/grok/dev-work-mark-live-null-guard feature files (handoff null guard + test + leadPreviewPath revalidatePath + architecture) — kept grok ITERATION above",
      "NEXT_STEPS: mark-handoff-live-null-status-guard done (owner 7e66; folded from grok/dev-work-mark-live-null-guard)",
      "AGENT_PROTOCOL — markHandoffLive null-status rule; encode-at-use extends to revalidatePath",
      "BUSINESS_DECISIONS — documented why folding this fulfillment race beats inventing an optional aggregate",
      "Verified: npm test (1298 passed, +1 null-status regression) + lint + build",
    ],
    decisions: BUSINESS_DECISIONS.slice(316, 317),
  },
  {
    date: "2026-07-14",
    branch: "grok/continuous-work-email-href-escape",
    summary:
      "Empty-backlog continuous-work after PR #235. Free NEXT_STEPS stayed operator/legal-gated; sibling remotes for as-const/slug-path already folded; latest opencode audits re-confirmed send-success + Convex API map clean. Rotated to escapeHtmlForEmail URL/href asymmetry: resend.ts left preview/checkout/catalog/unsubscribe/privacy hrefs unescaped while sibling templates already escaped. Claimed and shipped email-href-url-html-escape.",
    shipped: [
      "src/lib/email/resend.ts — escapeHtmlForEmail on every dynamic href (CAN-SPAM unsubscribe + privacy footer; outreach 1/2/3 preview+checkout; abandoned checkout; commerce abandoned catalog; starter upsell checkout+preview)",
      "src/lib/email/resend.test.ts — +4 regressions with quote/ampersand-tainted NEXT_PUBLIC_APP_URL asserting escaped hrefs and no raw attribute breakout",
      "Docs: architecture.tsx notes resend.ts href URLs share escapeHtmlForEmail with sibling email templates",
      "AGENT_PROTOCOL — escapeHtmlForEmail rule names href attribute values explicitly",
      "NEXT_STEPS: email-href-url-html-escape done",
      "BUSINESS_DECISIONS — documented why href escape beats inventing an optional aggregate",
      "PR handoff: Actions token blocked from gh pr create — issue #236 points at grok/continuous-work-email-href-escape",
    ],
    decisions: BUSINESS_DECISIONS.slice(315, 316),
  },
  {
    date: "2026-07-14",
    branch: "cursor/business-process-evolution-266d",
    summary:
      "Empty-backlog after PR #235 (as-const restore). Free NEXT_STEPS stayed operator/legal-gated. Scanned stuck CLI remotes before inventing an audit and found grok/continuous-work-email-href-escape with a complete email-href-url-html-escape feature body and no open PR (Actions token blocked; issue #236). Folded that body onto this automation branch that can open/merge rather than re-auditing exhausted axes or inventing an optional aggregate.",
    shipped: [
      "Fold: origin/grok/continuous-work-email-href-escape feature files (resend.ts + resend.test.ts + architecture.tsx) — kept grok ITERATION above",
      "NEXT_STEPS: email-href-url-html-escape done (owner 266d, folded from continuous-work; issue #236)",
      "AGENT_PROTOCOL — href attribute escape rule retained from fold",
      "BUSINESS_DECISIONS — documented why folding this stuck CLI href-escape fix beats inventing an optional aggregate; queued mark-handoff-live-null-status-guard (grok/dev-work-mark-live-null-guard; issue #237) as next fold",
      "Verified: npm test (1301 passed, +4 href-escape regressions) + lint + build",
    ],
    decisions: BUSINESS_DECISIONS.slice(315, 316),
  },

  {
    date: "2026-07-15",
    branch: "grok/continuous-work-custom-domain-normalize",
    summary:
      "Empty-backlog continuous-work after PR #238/#239. Free NEXT_STEPS stayed operator/legal-gated. Scanned stuck CLI remotes (already folded) and recent opencode clean audits (send-success + env-readiness) before inventing work. Fresh sold-capability audit of Starter custom-domain handoff found Save domain only trim+lowercased operator input — URL/port/path pastes never matched Host→preview or Vercel Domains API. Claimed and shipped custom-domain-host-normalize.",
    shipped: [
      "src/lib/deploy/custom-domain-routing.ts — normalizeOperatorCustomDomainHost, isPlausibleCustomDomainHost, parseOperatorCustomDomain (+tests)",
      "src/app/dashboard/leads/actions.ts — assignCustomDomainAction validates/normalizes via parseOperatorCustomDomain(productionRootDomain())",
      "src/lib/db.ts — updateDeployHandoffCustomDomain + getLeadSlugByCustomDomain re-normalize bare host",
      "convex/deployHandoffs.ts updateCustomDomain — mirror bare-host strip (Convex cannot import src/)",
      "src/app/dashboard/leads/assign-custom-domain-action.test.ts — URL paste + invalid/platform reject regressions",
      "Docs: architecture.tsx notes bare-host Save domain contract",
      "AGENT_PROTOCOL — custom-domain bare-host normalize rule",
      "NEXT_STEPS: custom-domain-host-normalize done",
      "BUSINESS_DECISIONS — documented why bare-host normalize beats a third clean re-audit",
      "Verified: npm test (1312 passed, +11 custom-domain normalize regressions) + lint + build",
      "PR handoff: Actions token blocked from gh pr create — issue #240 points at grok/continuous-work-custom-domain-normalize",
    ],
    decisions: BUSINESS_DECISIONS.slice(317, 318),
  },
  {
    date: "2026-07-15",
    branch: "grok/dev-work-custom-domain-normalize",
    summary:
      "Empty-backlog after PR #238/#239. Free NEXT_STEPS stayed operator/legal-gated. Same-window dual with continuous-work-custom-domain-normalize on bare-host Save domain — both pushed feature body. Folded continuous-work normalize (parseOperatorCustomDomain + db/convex re-normalize) and kept uniqueness complement (reject another lead's domain). Single implementation; both ITERATIONS kept.",
    shipped: [
      "merge: origin/grok/continuous-work-custom-domain-normalize — keep continuous-work ITERATION above",
      "Unified on parseOperatorCustomDomain (custom-domain-routing.ts); dropped parallel custom-domain.ts normalizer",
      "assignCustomDomainAction — collision reject via getLeadSlugByCustomDomain owner !== slug (custom-domain-normalize-and-unique)",
      "customDomainAlreadyOwnedMessage on custom-domain-routing + action Vitest",
      "NEXT_STEPS: custom-domain-host-normalize + custom-domain-normalize-and-unique done",
      "Issues #240/#241 handoff notes",
      "Verified after fold: npm test (1316 passed) + lint + build",
    ],
    decisions: BUSINESS_DECISIONS.slice(318, 319),
  },
  {
    date: "2026-07-15",
    branch: "cursor/business-process-evolution-57f2",
    summary:
      "Empty-backlog after PR #238/#239 (email-href + mark-live null guard on main). Free NEXT_STEPS stayed operator/legal-gated. Scanned stuck CLI remotes before inventing an audit and found grok/continuous-work-custom-domain-normalize + grok/dev-work-custom-domain-normalize with a complete bare-host Save domain + collision-reject feature body and no open PR (Actions token blocked; issues #240/#241). Folded that body onto this automation branch that can open/merge rather than re-auditing exhausted axes or inventing an optional aggregate.",
    shipped: [
      "Fold: origin/grok/dev-work-custom-domain-normalize feature files (custom-domain-routing helpers + action + db + Convex + architecture + tests) — kept continuous-work + dev-work ITERATIONS above",
      "NEXT_STEPS: custom-domain-host-normalize + custom-domain-normalize-and-unique done (owner 57f2)",
      "AGENT_PROTOCOL — bare-host normalize + uniqueness rule retained from fold",
      "BUSINESS_DECISIONS — documented why folding this stuck Starter Host→preview fix beats inventing an optional aggregate; tightened encode/as-const/email-href/mark-live ITERATIONS slices after +1 drift",
      "Verified: npm test (1316 passed) + lint + build",
    ],
    decisions: BUSINESS_DECISIONS.slice(317, 319),
  },
  {
    date: "2026-07-15",
    branch: "cursor/prompt-process-evolution-f6b5",
    summary:
      "Empty-backlog after PR #239. Free NEXT_STEPS stayed operator/legal-gated. Sibling business-process-evolution-57f2 claimed custom-domain-normalize-and-unique first — pivoted per AGENT_PROTOCOL. Fresh sold-capability audit found post-payment receipt/DNS/Commerce client receipt blocked by marketing suppression after a cold-outreach unsubscribe. Claimed and shipped transactional-email-skip-marketing-suppression. Merged origin/main (PR #242 custom-domain fold) mid-window — kept both process entries.",
    shipped: [
      "src/lib/email/resend.ts — SendEmailParams.skipSuppression; sendReceiptEmail + sendCommerceBuyNowClientReceipt pass true",
      "src/app/api/stripe/webhook/route.ts — DNS go-live sendEmail passes skipSuppression: true",
      "src/lib/email/resend.test.ts — +3 regressions (receipt + commerce receipt deliver when suppressed; outreach still blocked)",
      "Docs: architecture.tsx notes transactional skip vs marketing suppression",
      "AGENT_PROTOCOL — post-payment skipSuppression rule; marker rule clarifies marketing-suppression vs skip",
      "NEXT_STEPS: transactional-email-skip-marketing-suppression done",
      "BUSINESS_DECISIONS — documented why skipSuppression beats marker-only gating for suppressed converters",
      "merge: origin/main (PR #242 custom-domain normalize) — both ITERATIONS kept",
      "Verified: npm test (1319 passed, +3 transactional skip-suppression regressions) + lint + build",
    ],
    decisions: BUSINESS_DECISIONS.slice(319, 320),
  },
  {
    date: "2026-07-15",
    branch: "grok/continuous-work-contact-notify-skip",
    summary:
      "Empty-backlog after PR #243 (transactional-email-skip-marketing-suppression). Free NEXT_STEPS stayed operator/legal-gated. Scanned stuck CLI remotes (clean-audit process-only) before inventing work. Sold-capability audit found POST /api/contact/[slug] still honors marketing suppression for lead.email inquiry notify after cold-outreach unsubscribe — Starter sold contact-form alerts silently fail while CRM trail succeeds. Claimed and shipped contact-form-notify-skip-marketing-suppression.",
    shipped: [
      "src/app/api/contact/[slug]/route.ts — skipSuppression: true on business/operator notify sendEmail",
      "src/app/api/contact/[slug]/route.test.ts — +1 skipSuppression regression; Resend-failure path still surfaces notifySent:false",
      "src/lib/email/resend.ts — SendEmailParams.skipSuppression JSDoc names contact-form product notify",
      "Docs: architecture.tsx notes contact-form notify skip beside transactional skip",
      "AGENT_PROTOCOL — skipSuppression rule extends to contact-form lead.email notify",
      "NEXT_STEPS: contact-form-notify-skip-marketing-suppression done",
      "BUSINESS_DECISIONS — documented why product notify skip beats inventing an optional aggregate",
      "Verified: npm test (1320 passed, +1 contact skipSuppression regression) + lint + build",
      "PR handoff: Actions token blocked from gh pr create — issue #244 points at grok/continuous-work-contact-notify-skip",
    ],
    decisions: BUSINESS_DECISIONS.slice(320, 321),
  },
  {
    date: "2026-07-15",
    branch: "cursor/prompt-process-evolution-63b3",
    summary:
      "Empty-backlog after PR #243. Free NEXT_STEPS stayed operator/legal-gated. Scanned stuck CLI remotes before inventing an audit and found grok/continuous-work-contact-notify-skip with a complete contact-form skipSuppression feature body and no open PR (Actions token blocked; issue #244). Folded that body onto this automation branch that can open/merge. Same-minute sibling business-process-evolution-fbad claimed ~2s earlier and also folded; 63b3 merged as PR #246.",
    shipped: [
      "Fold: origin/grok/continuous-work-contact-notify-skip feature files (contact route + tests + architecture + resend JSDoc) — kept grok ITERATION above",
      "NEXT_STEPS: contact-form-notify-skip-marketing-suppression done (owner 63b3 / PR #246; dual with fbad)",
      "AGENT_PROTOCOL — skipSuppression rule names contact-form notify; empty-backlog note to check sibling lead.email product notifies after one skip surface ships",
      "BUSINESS_DECISIONS — documented why folding this stuck Starter product-notify fix beats inventing an optional aggregate",
      "Verified: npm test (1320 passed, +1 contact skipSuppression regression vs 1319 on main) + lint + build",
    ],
    decisions: BUSINESS_DECISIONS.slice(320, 321),
  },
  {
    date: "2026-07-15",
    branch: "grok/dev-work-slug-edge-dash",
    summary:
      "Empty-backlog after PR #243 (transactional-email-skip-marketing-suppression). Free NEXT_STEPS stayed operator/legal-gated. Scanned stuck CLI remotes (already folded) then sold-capability audit of Starter preview-subdomain Host→preview: addLeadAction + CSV kept edge dashes while leadSlugAsDnsLabel stripped them. Claimed and shipped create-path-slug-edge-dash-normalize.",
    shipped: [
      "src/lib/leads/slug.ts (+tests) — shared sanitizeLeadSlug (collapse + strip edge dashes)",
      "src/app/dashboard/leads/actions.ts addLeadAction — uses sanitizeLeadSlug; rejects all-symbol empty",
      "src/lib/leads/csv-import.ts — explicit slug column uses sanitizeLeadSlug; empty falls back to slugifyBusinessName",
      "src/lib/checkout/organic-attribution.ts — resolveBundleCheckoutLeadSlug uses shared sanitizeLeadSlug",
      "add-lead-action.test.ts + csv-import.test.ts — edge-dash + all-symbol regressions",
      "Docs: architecture.tsx notes create-path edge-dash / DNS-label identity contract",
      "AGENT_PROTOCOL — create-path sanitizeLeadSlug edge-dash rule",
      "NEXT_STEPS: create-path-slug-edge-dash-normalize done",
      "BUSINESS_DECISIONS — documented why shared edge-dash strip beats inventing an optional aggregate",
      "Verified: npm test (1325 passed, +6 slug edge-dash / all-symbol regressions) + lint + build",
      "PR handoff: Actions token blocked from gh pr create — issue #245 points at grok/dev-work-slug-edge-dash",
    ],
    decisions: BUSINESS_DECISIONS.slice(321, 322),
  },
  {
    date: "2026-07-15",
    branch: "cursor/business-process-evolution-fbad",
    summary:
      "Same-minute dual with prompt-process-evolution-63b3 on contact-form-notify-skip-marketing-suppression — fbad claimed ~2s earlier and folded the same grok body; 63b3 merged as PR #246. Per AGENT_PROTOCOL, pivoted this PR to fold create-path-slug-edge-dash-normalize from stuck grok/dev-work-slug-edge-dash (issue #245; Actions token blocked).",
    shipped: [
      "merge: origin/main (PR #246 contact-form skip) — both dual ITERATIONS kept; contact-form owner recorded as 63b3/PR #246",
      "Fold: origin/grok/dev-work-slug-edge-dash feature files (sanitizeLeadSlug + addLead/CSV/checkout wire-through + architecture + tests) — kept grok ITERATION above",
      "NEXT_STEPS: create-path-slug-edge-dash-normalize done (owner fbad; issue #245)",
      "AGENT_PROTOCOL — create-path sanitizeLeadSlug edge-dash rule retained from fold",
      "BUSINESS_DECISIONS — documented why shared edge-dash strip beats inventing an optional aggregate (slice 321)",
      "Verified: npm test + lint + build on fold branch",
    ],
    decisions: BUSINESS_DECISIONS.slice(321, 322),
  },
  {
    date: "2026-07-15",
    branch: "cursor/prompt-process-evolution-f037",
    summary:
      "Empty-backlog after PR #247 (slug edge-dash + contact-form notify on main). Free NEXT_STEPS stayed operator/legal-gated. Scanned stuck CLI remotes (already folded) and lead.email skip surfaces first; fresh sold-capability audit of the Starter contact-form CRM loop found sendInquiryReply still honored marketing suppression after notify already skipped — persist-then-notify marked inquiries replied while visitors never got the reply. Claimed and shipped inquiry-reply-skip-marketing-suppression. Sibling business-process-evolution-0064 was RUNNING but had not pushed a remote tip/claim yet.",
    shipped: [
      "src/lib/email/resend.ts — sendInquiryReply passes skipSuppression: true; JSDoc names CRM reply + contact notify",
      "src/lib/email/resend.test.ts — +1 regression (inquiry reply delivers when visitor is marketing-suppressed)",
      "src/app/dashboard/leads/reply-to-inquiry-action.test.ts — suppression branch kept as defense-in-depth if helper regresses",
      "Docs: architecture.tsx notes notify + reply skipSuppression for Starter contact-form CRM",
      "AGENT_PROTOCOL — skipSuppression rule names inquiry reply; empty-backlog note to check CRM-loop siblings (notify ↔ reply)",
      "NEXT_STEPS: inquiry-reply-skip-marketing-suppression done",
      "BUSINESS_DECISIONS — documented why CRM-loop reply skip beats inventing an optional aggregate (slice 322)",
      "Verified: npm test (1327 passed, +1 inquiry-reply skipSuppression regression) + lint + build",
    ],
    decisions: BUSINESS_DECISIONS.slice(322, 323),
  },
  {
    date: "2026-07-15",
    branch: "cursor/business-process-evolution-0064",
    summary:
      "Empty-backlog after PR #247 (create-path-slug-edge-dash). Free NEXT_STEPS stayed operator/legal-gated. Scanned stuck CLI remotes (already folded). Sibling prompt-process-evolution-f037 shipped inquiry-reply-skip-marketing-suppression (PR #248) in the same window — complementary CRM-loop skip. Sold-capability audit of Starter custom-domain Host→preview found www↔apex still exact-only after normalize+unique — claimed and shipped custom-domain-www-apex-alias. Merged origin/main mid-PR; kept both ITERATIONS.",
    shipped: [
      "merge: origin/main (PR #248 inquiry-reply skip) — both ITERATIONS kept; inquiry-reply owns slice 322",
      "src/lib/deploy/custom-domain-routing.ts (+tests) — customDomainHostAliases (exact first, www↔apex twin)",
      "src/lib/db.ts getLeadSlugByCustomDomain — try each alias (Convex + SQLite)",
      "assignCustomDomainAction — uniqueness via alias-aware lookup (www twin owned by another lead rejects)",
      "tryProvisionVercelDomain — POST both aliases when customDomain set; suggestedHost stays single",
      "handoff.test + assign-custom-domain-action.test — dual-register + twin-collision regressions",
      "Docs: architecture.tsx notes www↔apex Host→preview / uniqueness / Vercel dual-register",
      "AGENT_PROTOCOL — www↔apex alias rule; keep storing operator's chosen bare host",
      "NEXT_STEPS: custom-domain-www-apex-alias done",
      "BUSINESS_DECISIONS — documented why www↔apex aliasing beats inventing an optional aggregate (slice 323)",
      "Verified: npm test (1332 passed after merge with #248) + lint + build",
    ],
    decisions: BUSINESS_DECISIONS.slice(323, 324),
  },
  {
    date: "2026-07-15",
    branch: "opencode/dev-work-marketing-voice-skip-suppression",
    summary:
      "Empty-backlog after transactional-email + contact-form skipSuppression surfaces. Free NEXT_STEPS stayed operator/legal-gated. Per AGENT_PROTOCOL empty-backlog scan rule, audited sibling sold product notifies on lead.email: sendMarketingPackToClientEmail and sendClientVoicePackToClientEmail deliver paid Growth/Complete features but still honored marketing suppression. Claimed and shipped marketing-voice-pack-skip-suppression (feature body; no open PR — folded onto grok remotes then cursor/prompt-process-evolution-ea8d as PR #252; dual with cursor/business-process-evolution-d2b8).",
    shipped: [
      "src/lib/email/resend.ts — sendMarketingPackToClientEmail + sendClientVoicePackToClientEmail pass skipSuppression: true",
      "src/lib/email/resend.test.ts — +2 regressions (pack still delivers when suppressed)",
      "AGENT_PROTOCOL — moved marketing/voice pack delivery from 'keep suppression' to skipSuppression bucket",
      "BUSINESS_DECISIONS — documented why marketing/voice pack skip is a sold-notify gap",
      "NEXT_STEPS: marketing-voice-pack-skip-suppression (folded done on ea8d PR #252)",
      "Verified: npm test (+2 skipSuppression regressions) + npm run build",
      "PR handoff: Actions token blocked from gh pr create — folded onto cursor/prompt-process-evolution-ea8d",
    ],
    decisions: BUSINESS_DECISIONS.slice(324, 325),
  },
  {
    date: "2026-07-15",
    branch: "grok/continuous-work-marketing-voice-skip",
    summary:
      "Empty-backlog after PR #248/#249 (inquiry-reply skip + www↔apex aliases on main). Free NEXT_STEPS stayed operator/legal-gated. Scanned stuck CLI remotes before inventing an audit and found opencode/dev-work-marketing-voice-skip-suppression with a complete sold-pack skipSuppression feature body and no open PR. Folded that body: sendMarketingPackToClientEmail + sendClientVoicePackToClientEmail now pass skipSuppression: true so a cold-outreach unsub cannot permanently block paid Growth/Complete feature delivery. Same-window dual with grok/dev-work-marketing-voice-skip.",
    shipped: [
      "Fold: origin/opencode/dev-work-marketing-voice-skip-suppression feature files (resend.ts + resend.test.ts)",
      "src/lib/email/resend.ts — sendMarketingPackToClientEmail + sendClientVoicePackToClientEmail pass skipSuppression: true; JSDoc updated",
      "src/lib/email/resend.test.ts — +2 regressions (pack still delivers when marketing-suppressed; outreach still blocked)",
      "Docs: architecture.tsx — pack delivery listed with other sold skipSuppression surfaces; pack sections note skip",
      "AGENT_PROTOCOL — moved marketing/voice pack delivery from 'keep suppression' to skipSuppression: true bucket",
      "NEXT_STEPS: marketing-voice-pack-skip-suppression done",
      "BUSINESS_DECISIONS — documented why sold pack skipSuppression beats inventing an optional aggregate (slice 324)",
      "Verified: npm test (1334 passed, +2 pack skipSuppression regressions vs 1332 on main) + lint + build",
      "PR handoff: Actions token blocked — folded onto cursor/prompt-process-evolution-ea8d (PR #252); dual with d2b8",
    ],
    decisions: BUSINESS_DECISIONS.slice(324, 325),
  },
  {
    date: "2026-07-15",
    branch: "grok/dev-work-marketing-voice-skip",
    summary:
      "Empty-backlog after PR #249 (custom-domain-www-apex-alias). Free NEXT_STEPS stayed operator/legal-gated. Same-window dual with continuous-work-marketing-voice-skip on the same opencode pack-skip body. Folded opencode feature onto this branch; later absorbed into ea8d PR #252 with continuous-work architecture docs (d2b8 dual-claim kept as process record).",
    shipped: [
      "Fold: origin/opencode/dev-work-marketing-voice-skip-suppression feature (resend.ts + resend.test.ts) — kept opencode ITERATION above",
      "src/lib/email/resend.ts — SendEmailParams JSDoc + pack delivery helpers pass skipSuppression: true",
      "src/lib/email/resend.test.ts — +2 pack delivery regressions under isEmailSuppressed=true",
      "Docs: architecture.tsx notes marketing/voice pack delivery skip beside transactional + contact CRM skips",
      "AGENT_PROTOCOL — skipSuppression rule names marketing/voice pack delivery; keep suppression for outreach/abandoned/upsell only",
      "NEXT_STEPS: marketing-voice-pack-skip-suppression done",
      "BUSINESS_DECISIONS — documented why folding this sold-feature skip beats inventing an optional aggregate (slice 324)",
      "Verified: npm test (1334 passed, +2 pack skipSuppression regressions) + lint + build",
      "PR handoff: Actions token blocked from gh pr create — issue #251; folded onto ea8d PR #252",
    ],
    decisions: BUSINESS_DECISIONS.slice(324, 325),
  },
  {
    date: "2026-07-15",
    branch: "cursor/prompt-process-evolution-ea8d",
    summary:
      "Empty-backlog after PR #248/#249 (inquiry-reply skip + www↔apex aliases). Free NEXT_STEPS stayed operator/legal-gated. Scanned stuck CLI remotes before inventing an audit and found opencode/dev-work-marketing-voice-skip-suppression + grok/continuous-work-marketing-voice-skip + grok/dev-work-marketing-voice-skip with a complete marketing-voice-pack-skip-suppression feature body and no open PR (Actions token blocked). Folded that body onto this automation branch that can open/merge rather than re-auditing exhausted axes or inventing an optional aggregate. Merged as PR #252; same-window dual claim by cursor/business-process-evolution-d2b8 kept both ITERATIONS.",
    shipped: [
      "Fold: stuck CLI remotes feature files (resend.ts + resend.test.ts + architecture.tsx) — kept opencode + grok continuous/dev ITERATIONS above",
      "src/lib/email/resend.ts — sendMarketingPackToClientEmail + sendClientVoicePackToClientEmail pass skipSuppression: true; JSDoc names sold pack delivery",
      "src/lib/email/resend.test.ts — +2 pack skipSuppression regressions (outreach still blocked)",
      "Docs: architecture.tsx notes marketing/voice pack delivery skip beside transactional + contact CRM skips",
      "AGENT_PROTOCOL — skipSuppression rule names marketing/voice pack delivery; keep suppression for outreach/abandoned/upsell only",
      "NEXT_STEPS: marketing-voice-pack-skip-suppression done (owner ea8d / PR #252)",
      "BUSINESS_DECISIONS — documented why folding this sold-feature skip beats inventing an optional aggregate (slice 324)",
      "Verified: npm test (1334 passed, +2 pack skipSuppression regressions vs 1332 on main) + lint + build",
    ],
    decisions: BUSINESS_DECISIONS.slice(324, 325),
  },
  {
    date: "2026-07-15",
    branch: "cursor/business-process-evolution-d2b8",
    summary:
      "Same-window dual with prompt-process-evolution-ea8d on marketing-voice-pack-skip-suppression — both folded the stuck CLI pack-skip bodies; ea8d merged as PR #252. Per AGENT_PROTOCOL, merge main and keep both ITERATIONS (no second implementation). Pivoted this PR to dual-claim process record + AGENT_PROTOCOL dual-CLI-fold clarity + pack action-test defense-in-depth comments mirroring inquiry-reply/contact-form after skipSuppression.",
    shipped: [
      "merge: origin/main (PR #252 pack skip) — ea8d owns NEXT_STEPS; both dual ITERATIONS kept",
      "AGENT_PROTOCOL — dual-CLI-fold note retained (when continuous-work + dev-work dual-build the same sold-skip, fold one implementation and keep every ITERATION)",
      "Process: recorded dual-claim ownership note on marketing-voice-pack-skip-suppression",
      "send-marketing-pack-to-client-action.test.ts + send-client-voice-pack-to-client-action.test.ts — suppression cases renamed defense-in-depth after skipSuppression; file headers match architecture",
      "Verified after merge: npm test + lint + build",
    ],
    decisions: BUSINESS_DECISIONS.slice(324, 325),
  },
  {
    date: "2026-07-15",
    branch: "opencode/dev-work-20260715",
    summary:
      "Empty-backlog audit of pipeline-health/daily-digest wiring completeness: found 11 PipelineHealth fields without a DailyDigest equivalent. Wired the four most actionable — newInquiryCount, oldestUnrepliedInquiryAgeHours, oldestFollowUpDueAgeHours, closedLeadCount — in the digest builder, DailyDigest type, and HTML renderer. No open PR on this remote (Actions token blocked; folded onto grok/continuous-work-digest-age-counts then cursor/prompt-process-evolution-7d49).",
    shipped: [
      "src/lib/digest/daily-digest.ts — DailyDigest type: +newInquiryCount, +oldestUnrepliedInquiryAgeHours, +oldestFollowUpDueAgeHours, +closedLeadCount; buildDailyDigest computes all four from existing input data; renderDailyDigestHtml shows new count in unreplied header (with oldest age), follow-ups header age, and closed footnote",
      "src/lib/digest/daily-digest.test.ts — +11 tests covering newInquiryCount, oldest ages, closedLeadCount, HTML rendering, and the redundant-display guard (all-new inquiries omit redundant 'N new')",
      "NEXT_STEPS: digest-pipeline-health-age-and-count-wiring done (owner recorded on fold branch)",
      "Verified on opencode remote: npm test (1345 passed, +11 vs 1334 on prior main) + lint + build",
    ],
    decisions: BUSINESS_DECISIONS.slice(325, 326),
  },
  {
    date: "2026-07-15",
    branch: "codex/continuous-work-6a36ae",
    summary:
      "Empty-backlog with all 4 remaining NEXT_STEPS operator/legal-gated. Scanned stuck CLI remotes per AGENT_PROTOCOL and found opencode/dev-work-20260715 with complete feature body (digest age/count wiring) but no open PR (Actions token blocked). Folded that body onto this automation branch that can open/merge.",
    shipped: [
      "Folded opencode/dev-work-20260715: src/lib/digest/daily-digest.ts (+newInquiryCount, +oldestUnrepliedInquiryAgeHours, +oldestFollowUpDueAgeHours, +closedLeadCount in DailyDigest type/build/HTML render); daily-digest.test.ts (+11 tests)",
      "Merge record: opencode/dev-work-20260715 (feature body) folded onto codex/continuous-work-6a36ae per AGENT_PROTOCOL stuck-CLI-fold rule",
      "NEXT_STEPS: digest-pipeline-health-age-and-count-wiring done (owner recorded on fold branch)",
      "PR handoff: Actions token blocked — folded onto cursor/prompt-process-evolution-7d49",
    ],
    decisions: BUSINESS_DECISIONS.slice(325, 326),
  },
  {
    date: "2026-07-15",
    branch: "grok/continuous-work-digest-age-counts",
    summary:
      "Empty-backlog continuous-work after PR #253 (marketing-voice-pack-skip-suppression). Free NEXT_STEPS stayed operator/legal-gated. Scanned stuck CLI remotes before inventing an audit and found opencode/dev-work-20260715 with a complete digest-pipeline-health-age-and-count-wiring feature body and no open PR. Folded that body onto this continuous-work branch that can open/merge rather than re-auditing 2x-clean skipSuppression/Convex/send-success axes or manufacturing a new optional aggregate.",
    shipped: [
      "Fold: origin/opencode/dev-work-20260715 feature files (daily-digest.ts + daily-digest.test.ts) — kept opencode ITERATION above",
      "src/lib/digest/daily-digest.ts — newInquiryCount, oldestUnrepliedInquiryAgeHours, oldestFollowUpDueAgeHours, closedLeadCount + HTML header/footnote wiring",
      "src/lib/digest/daily-digest.test.ts — +11 regressions for the four fields and HTML rendering",
      "Docs: architecture.tsx notes the four digest-mirrored pipeline-health age/count fields",
      "NEXT_STEPS: digest-pipeline-health-age-and-count-wiring done (owner grok/continuous-work-digest-age-counts; folded from opencode/dev-work-20260715)",
      "BUSINESS_DECISIONS — documented why folding this pipeline-health/digest wiring beats inventing an optional aggregate (slice 325)",
      "Verified on continuous-work branch: npm test (1345 passed, +11 vs 1334 on main) + lint + build",
      "PR handoff: Actions token blocked from gh pr create — issue #254; folded onto cursor/prompt-process-evolution-7d49",
    ],
    decisions: BUSINESS_DECISIONS.slice(325, 326),
  },
  {
    date: "2026-07-15",
    branch: "cursor/prompt-process-evolution-7d49",
    summary:
      "Empty-backlog after PR #252/#253 (marketing-voice-pack-skip-suppression). Free NEXT_STEPS stayed operator/legal-gated. Scanned stuck CLI remotes before inventing an audit and found opencode/dev-work-20260715 + grok/continuous-work-digest-age-counts + codex/continuous-work-6a36ae with a complete digest-pipeline-health-age-and-count-wiring feature body and no open PR (Actions token blocked). Reclaimed after stale claim-only remotes cursor/prompt-process-evolution-8fc4 + cursor/business-process-evolution-3fe8 sat idle with no feature body. Folded onto this automation branch that can open/merge rather than re-auditing exhausted axes or inventing an optional aggregate. Same-window sibling business-process-evolution-693b pivoted to login-rate-limit (complementary).",
    shipped: [
      "Fold: stuck CLI remotes feature files (daily-digest.ts + daily-digest.test.ts + architecture.tsx) — kept opencode + codex + grok ITERATIONS above",
      "src/lib/digest/daily-digest.ts — newInquiryCount, oldestUnrepliedInquiryAgeHours, oldestFollowUpDueAgeHours, closedLeadCount + HTML header/footnote wiring",
      "src/lib/digest/daily-digest.test.ts — +11 regressions for the four fields and HTML rendering",
      "Docs: architecture.tsx notes the four digest-mirrored pipeline-health age/count fields",
      "AGENT_PROTOCOL — pipeline-health/digest wiring note lists the four age/count fields as shipped; remaining optional age mirrors are oldestAbandonedAgeHours / oldestColdLeadAgeHours only",
      "NEXT_STEPS: digest-pipeline-health-age-and-count-wiring done (owner 7d49)",
      "BUSINESS_DECISIONS — documented why folding this pipeline-health/digest wiring beats inventing an optional aggregate (slice 325)",
      "Verified: npm test (1345 passed, +11 digest age/count regressions vs 1334 on main) + lint + build",
    ],
    decisions: BUSINESS_DECISIONS.slice(325, 326),
  },
  {
    date: "2026-07-15",
    branch: "opencode/dev-work-login-rate-limit",
    summary:
      "Empty-backlog after PR #253 (marketing-voice-pack-skip-suppression). Free NEXT_STEPS stayed operator/legal-gated. Per AGENT_PROTOCOL empty-backlog scan, found loginOperatorAction had zero rate limiting on a public password-check. Shipped checkRateLimit (5/60s) before password comparison; feature body with no open PR (Actions token blocked) — folded onto cursor/business-process-evolution-693b.",
    shipped: [
      "src/app/dashboard/login/actions.ts — checkRateLimit login:<clientIp> at 5/60s before tryCreateSessionFromPassword; redirect error=rate_limited",
      "src/app/dashboard/login/page.tsx — Too many attempts alert for error=rate_limited",
      "src/app/dashboard/login/actions.test.ts — +1 rate-limit exceed regression",
      "NEXT_STEPS: login-rate-limit (folded done on 693b)",
      "PR handoff: Actions token blocked — folded onto cursor/business-process-evolution-693b",
    ],
    decisions: BUSINESS_DECISIONS.slice(326, 327),
  },
  {
    date: "2026-07-15",
    branch: "grok/continuous-work-login-rate-limit",
    summary:
      "Empty-backlog after PR #253. Free NEXT_STEPS stayed operator/legal-gated. Scanned stuck CLI remotes and found opencode/dev-work-login-rate-limit with a complete login throttle body and no open PR. Folded that body; dual with grok/dev-work-login-rate-limit. Later absorbed into cursor/business-process-evolution-693b.",
    shipped: [
      "Fold: opencode/dev-work-login-rate-limit feature files",
      "src/app/dashboard/login/actions.ts — 5/60s checkRateLimit before password check",
      "src/app/dashboard/login/page.tsx + actions.test.ts — rate_limited alert + regression",
      "Docs: architecture.tsx notes login per-IP rate limit",
      "BUSINESS_DECISIONS — documented why login throttle beats inventing an optional aggregate (slice 326)",
      "Verified: npm test + lint + build",
      "PR handoff: Actions token blocked — folded onto cursor/business-process-evolution-693b",
    ],
    decisions: BUSINESS_DECISIONS.slice(326, 327),
  },
  {
    date: "2026-07-15",
    branch: "grok/dev-work-login-rate-limit",
    summary:
      "Same-window dual with continuous-work-login-rate-limit on the login throttle. Folded the same opencode body; later absorbed into cursor/business-process-evolution-693b with continuous-work architecture docs.",
    shipped: [
      "Fold: opencode/dev-work-login-rate-limit feature (actions.ts + page.tsx + actions.test.ts)",
      "src/app/dashboard/login/actions.ts — LOGIN_RATE_LIMIT 5/60s via checkRateLimit + clientIpFromHeaders",
      "NEXT_STEPS: login-rate-limit (folded done on 693b)",
      "PR handoff: Actions token blocked — folded onto cursor/business-process-evolution-693b",
    ],
    decisions: BUSINESS_DECISIONS.slice(326, 327),
  },
  {
    date: "2026-07-15",
    branch: "cursor/business-process-evolution-693b",
    summary:
      "Empty-backlog after PR #253 (marketing-voice-pack-skip-suppression). Free NEXT_STEPS stayed operator/legal-gated. Sibling prompt-process-evolution-7d49 claimed digest-pipeline-health-age-and-count-wiring in the same window (merged as PR #276) — pivoted to the next free fold. Scanned stuck CLI remotes before inventing an audit and found grok/continuous-work-login-rate-limit + grok/dev-work-login-rate-limit + opencode/dev-work-login-rate-limit* with a complete login-rate-limit feature body and no open PR (Actions token blocked). Folded that body onto this automation branch that can open/merge rather than re-auditing exhausted axes or inventing an optional aggregate. Merged origin/main mid-PR; kept both digest + login ITERATIONS.",
    shipped: [
      "merge: origin/main (PR #276 digest age/count wiring) — 7d49 owns digest NEXT_STEPS / slice 325; both complementary ITERATIONS kept",
      "Fold: stuck CLI remotes feature files (login actions/page/tests + architecture docs) — kept opencode + grok continuous/dev ITERATIONS above",
      "src/app/dashboard/login/actions.ts — checkRateLimit login:<clientIp> at 5 attempts/60s before tryCreateSessionFromPassword; redirect error=rate_limited",
      "src/app/dashboard/login/page.tsx — Too many attempts alert for error=rate_limited",
      "src/app/dashboard/login/actions.test.ts — +1 rate-limit exceed regression; header docs note 5/60s",
      "src/lib/security/rate-limit.ts — module comment names loginOperatorAction tighter window",
      "Docs: architecture.tsx notes login per-IP rate limit beside safeNextPath",
      "AGENT_PROTOCOL — public rate-limit rule names loginOperatorAction 5/60s + error=rate_limited redirect",
      "NEXT_STEPS: login-rate-limit done",
      "BUSINESS_DECISIONS — documented why folding this login throttle beats inventing an optional aggregate (slice 326)",
      "Verified after merge: npm test (1346 passed, +1 login rate-limit regression on top of PR #276's 1345) + lint + build",
    ],
    decisions: BUSINESS_DECISIONS.slice(326, 327),
  },
  {
    date: "2026-07-15",
    branch: "opencode/dev-work-digest-age-mirrors",
    summary:
      "Empty-backlog after PR #277 (login-rate-limit). Remaining PipelineHealth age mirrors oldestAbandonedAgeHours and oldestColdLeadAgeHours were still missing from the daily digest — the digest section headers showed only the count for abandoned checkouts and cold leads, never how long the oldest has been sitting. Wired both age fields into DailyDigest type, buildDailyDigest computation, renderDailyDigestHtml section headers (abandoned checkouts header + cold footnote), and daily-digest.test.ts. No open PR on this remote (Actions token blocked; folded onto cursor/prompt-process-evolution-1ce7).",
    shipped: [
      "src/lib/digest/daily-digest.ts — DailyDigest.oldestAbandonedAgeHours + oldestColdLeadAgeHours fields, computed from listAbandonedCheckoutsDue / listColdLeads in buildDailyDigest, rendered in abandoned checkouts header and cold footnote",
      "src/lib/digest/daily-digest.test.ts — compute+null tests for both age mirrors + render header/footnote assertions",
      "NEXT_STEPS: digest-age-mirror-oldest-abandoned-cold (folded done on 1ce7)",
      "PR handoff: Actions token blocked — folded onto cursor/prompt-process-evolution-1ce7",
    ],
    decisions: BUSINESS_DECISIONS.slice(326, 327),
  },
  {
    date: "2026-07-15",
    branch: "cursor/prompt-process-evolution-1ce7",
    summary:
      "Empty-backlog after PR #277 (login-rate-limit). Free NEXT_STEPS stayed operator/legal-gated. Scanned stuck CLI remotes before inventing an audit and found opencode/dev-work-digest-age-mirrors with a complete digest-age-mirror-oldest-abandoned-cold feature body and no open PR (Actions token blocked). Folded that body onto this automation branch that can open/merge rather than re-auditing exhausted axes or inventing an optional aggregate. Closes the last optional PipelineHealth→digest age mirrors listed in AGENT_PROTOCOL. Same-window sibling business-process-evolution-9b1b folded create-path-slug-dns-label-max-length (complementary).",
    shipped: [
      "Fold: stuck opencode/dev-work-digest-age-mirrors feature files (daily-digest.ts + daily-digest.test.ts) — kept opencode ITERATION above",
      "src/lib/digest/daily-digest.ts — oldestAbandonedAgeHours + oldestColdLeadAgeHours on DailyDigest + buildDailyDigest + renderDailyDigestHtml",
      "src/lib/digest/daily-digest.test.ts — +6 regressions (compute+null + HTML header/footnote for both ages)",
      "Docs: architecture.tsx notes the two remaining age mirrors now digest-mirrored",
      "AGENT_PROTOCOL — pipeline-health/digest wiring axis closed for known aggregates; next empty-backlog rotation prefers stuck CLI folds / security / Convex parity over inventing optional digests",
      "NEXT_STEPS: digest-age-mirror-oldest-abandoned-cold done (owner 1ce7)",
      "BUSINESS_DECISIONS — documented why folding these age mirrors beats inventing an optional aggregate (slice 327)",
      "Verified: npm test (1352 passed, +6 digest age-mirror regressions vs 1346 on main) + lint + build",
    ],
    decisions: BUSINESS_DECISIONS.slice(326, 327),
  },
  {
    date: "2026-07-15",
    branch: "grok/continuous-work-slug-dns-label-max",
    summary:
      "Empty-backlog after PR #247 (create-path-slug-edge-dash-normalize). Free NEXT_STEPS stayed operator/legal-gated. Sold-capability audit of Starter preview-subdomain Host→preview found sanitizeLeadSlug stripped edge dashes but never capped length — a long businessName minted CRM slugs >63 chars that cannot be valid DNS labels for suggestedHost. Shipped MAX_LEAD_SLUG_LENGTH=63 inside sanitizeLeadSlug + leadSlugAsDnsLabel reuse + CSV collision suffix capping. No open PR (Actions token blocked; issue #257) — folded onto cursor/business-process-evolution-9b1b.",
    shipped: [
      "src/lib/leads/slug.ts — MAX_LEAD_SLUG_LENGTH=63; sanitizeLeadSlug truncates then re-strips trailing dashes",
      "src/lib/leads/slug-path.ts — leadSlugAsDnsLabel reuses sanitizeLeadSlug (charset + edge + ≤63)",
      "src/lib/leads/csv-import.ts — slugifyBusinessName via sanitizeLeadSlug; slugWithCollisionSuffix keeps ≤63",
      "Tests: slug.test.ts + slug-path.test.ts + csv-import.test.ts max-length regressions",
      "Docs: architecture.tsx notes 63-cap beside edge-dash strip",
      "NEXT_STEPS: create-path-slug-dns-label-max-length (folded done on 9b1b)",
      "PR handoff: Actions token blocked — issue #257; folded onto cursor/business-process-evolution-9b1b",
    ],
    decisions: BUSINESS_DECISIONS.slice(327, 328),
  },
  {
    date: "2026-07-15",
    branch: "grok/dev-work-slug-dns-label-max",
    summary:
      "Same-window dual with continuous-work-slug-dns-label-max on the DNS label length cap. Same feature body; later absorbed into cursor/business-process-evolution-9b1b.",
    shipped: [
      "src/lib/leads/slug.ts — MAX_LEAD_SLUG_LENGTH=63 create-path cap",
      "src/lib/leads/slug-path.ts + csv-import.ts — reuse sanitizer + collision suffix ≤63",
      "NEXT_STEPS: create-path-slug-dns-label-max-length (folded done on 9b1b)",
      "PR handoff: Actions token blocked — issue #255; folded onto cursor/business-process-evolution-9b1b",
    ],
    decisions: BUSINESS_DECISIONS.slice(327, 328),
  },
  {
    date: "2026-07-15",
    branch: "opencode/continuous-work-slug-dns-max-103090",
    summary:
      "Empty-backlog fold of grok/dev-work-slug-dns-label-max onto an opencode continuous-work branch. Complete RFC 1035 DNS label max create-path body with no open PR — folded onto cursor/business-process-evolution-9b1b.",
    shipped: [
      "Fold: grok/dev-work-slug-dns-label-max feature files",
      "src/lib/leads/slug.ts — RFC 1035 63-char create-path cap",
      "NEXT_STEPS: create-path-slug-dns-label-max-length (folded done on 9b1b)",
      "PR handoff: Actions token blocked — folded onto cursor/business-process-evolution-9b1b",
    ],
    decisions: BUSINESS_DECISIONS.slice(327, 328),
  },
  {
    date: "2026-07-15",
    branch: "cursor/business-process-evolution-9b1b",
    summary:
      "Empty-backlog after PR #277 (login-rate-limit). Free NEXT_STEPS stayed operator/legal-gated. Sibling prompt-process-evolution-1ce7 claimed/merged digest-age-mirror-oldest-abandoned-cold (PR #278) in the same window — complementary axis, owns slice 327. Scanned stuck CLI remotes before inventing an audit and found grok/continuous-work-slug-dns-label-max + grok/dev-work-slug-dns-label-max + grok/dev-work-slug-dns-max-86cdf4 + opencode/continuous-work-slug-dns-max-103090 (plus digest-combo remotes whose digest half already merged as #276) with a complete create-path-slug-dns-label-max-length feature body and no open PR (Actions token blocked). Folded that body onto this automation branch that can open/merge rather than re-auditing exhausted axes or inventing an optional aggregate. Merged origin/main mid-PR; kept both digest-mirror + DNS-cap ITERATIONS.",
    shipped: [
      "merge: origin/main (PR #278 digest age-mirror) — 1ce7 owns digest NEXT_STEPS / slice 327; both complementary ITERATIONS kept",
      "Fold: stuck CLI remotes feature files (slug.ts / slug-path.ts / csv-import.ts + tests + architecture docs) — kept grok continuous/dev + opencode ITERATIONS above",
      "src/lib/leads/slug.ts — MAX_LEAD_SLUG_LENGTH=63; sanitizeLeadSlug truncates then re-strips trailing dashes",
      "src/lib/leads/slug-path.ts — leadSlugAsDnsLabel reuses sanitizeLeadSlug so Host→preview identity matches create-path storage including the 63-cap",
      "src/lib/leads/csv-import.ts — slugifyBusinessName via sanitizeLeadSlug; slugWithCollisionSuffix keeps collision suffixes ≤63",
      "src/lib/leads/slug.test.ts + slug-path.test.ts + csv-import.test.ts — max-length + truncation-edge + CSV collision regressions",
      "Docs: architecture.tsx notes 63-cap beside edge-dash strip",
      "AGENT_PROTOCOL — create-path slug rule names MAX_LEAD_SLUG_LENGTH=63 + leadSlugAsDnsLabel reuse; digest age-mirror axis closed on main",
      "NEXT_STEPS: create-path-slug-dns-label-max-length done",
      "BUSINESS_DECISIONS — documented why folding this DNS label cap beats inventing an optional aggregate (slice 328)",
      "Verified after merge: npm test (1357 passed, +5 DNS max-length regressions on top of PR #278's 1352) + lint + build",
    ],
    decisions: BUSINESS_DECISIONS.slice(327, 328),
  },
  {
    date: "2026-07-15",
    branch: "cursor/prompt-process-evolution-38a8",
    summary:
      "Empty-backlog after PR #279 (create-path-slug-dns-label-max-length) + PR #278 (digest age mirrors). Free NEXT_STEPS stayed operator/legal-gated. Sibling business-process-evolution-f844 claimed operator-password-trim (folding opencode password-trim remotes; later merged as PR #280) — pivoted per AGENT_PROTOCOL. Scanned stuck CLI remotes (password-trim owned; other remotes were already-merged as-const/skip/slug/digest bodies behind main). Fresh sold-capability audit of Starter contact CRM found notify↔persist field-length divergence: insertClientInquiry sliced message to 5000 while POST /api/contact/[slug] emailed uncapped request fields under skipSuppression. Soft-capped once via shared normalizeContactFormFields; defense-in-depth inside insertClientInquiry; route + unit tests; tightened prior over-generous decision slices to absolute indices. Merged origin/main (PR #280) before open; kept both contact-field-cap + password-trim ITERATIONS.",
    shipped: [
      "merge: origin/main (PR #280 operator-password-trim) — f844 owns password-trim NEXT_STEPS / slice 330; both complementary ITERATIONS kept",
      "src/lib/inquiries/contact-fields.ts — MAX_CONTACT_* + normalizeContactFormFields",
      "src/lib/inquiries/contact-fields.test.ts — soft-cap regressions",
      "src/app/api/contact/[slug]/route.ts — cap once before persist + notify",
      "src/lib/db.ts — insertClientInquiry uses shared caps for all writers",
      "src/app/api/contact/[slug]/route.test.ts — oversize message/name/email/phone/source regressions",
      "Docs: architecture.tsx notes soft-cap notify↔persist parity",
      "AGENT_PROTOCOL — sold contact-form notify↔persist field-length rule; empty-backlog rotation notes password-trim done + this axis",
      "NEXT_STEPS: contact-form-notify-field-length-caps done",
      "BUSINESS_DECISIONS — soft-cap-once over uncapped notify (slice 329)",
      "Tightened create-path DNS ITERATIONS decisions slices → 328,329 and digest-age-mirror ITERATIONS → 327,328 (absolute indices)",
      "Verified after merge with PR #280: npm test (1373 passed = 1357 main@#279 +10 password-trim +6 contact field-cap) + lint + build",
    ],
    decisions: BUSINESS_DECISIONS.slice(328, 329),
  },
  {
    date: "2026-07-15",
    branch: "opencode/continuous-work-152029",
    summary:
      "Empty-backlog after PR #277 (login-rate-limit). Free NEXT_STEPS stayed operator/legal-gated. Fresh auth-surface audit found OPERATOR_DASHBOARD_PASSWORD whitespace-only ('   ') passed isOperatorAuthConfigured via .length>0 while the sign/verify path used the untrimmed string — silently locking the operator out. Shipped env-side trim in getPassword + isOperatorAuthConfigured. No open PR (Actions token blocked) — folded onto cursor/business-process-evolution-f844 (which also folds form-submit trim from opencode/dev-work-password-trim).",
    shipped: [
      "src/lib/auth/operator.ts — getPassword() / isOperatorAuthConfigured() trim env; whitespace-only → unset",
      "NEXT_STEPS: operator-password-trim (folded done on f844)",
      "PR handoff: Actions token blocked — folded onto cursor/business-process-evolution-f844",
    ],
    decisions: BUSINESS_DECISIONS.slice(329, 330),
  },
  {
    date: "2026-07-15",
    branch: "opencode/dev-work-password-trim",
    summary:
      "Empty-backlog security audit after exhausted digest/sold-skip folds: rotated to operator-password trim as AGENT_PROTOCOL prescribed. Found login form + env read never trimmed — trailing spaces lock the operator out; whitespace-only env falsely reports auth configured. Shipped env trim + form-submit trim + Vitest. No open PR (Actions token blocked) — folded onto cursor/business-process-evolution-f844.",
    shipped: [
      "src/lib/auth/operator.ts — getPassword trim; isOperatorAuthConfigured trimmed length; tryCreateSessionFromPassword trims provided password",
      "src/lib/auth/operator.test.ts — tryCreateSessionFromPassword trim regressions + whitespace-only env treated as unset in requireOperatorAuth",
      "NEXT_STEPS: operator-password-trim (folded done on f844)",
      "PR handoff: Actions token blocked — folded onto cursor/business-process-evolution-f844",
    ],
    decisions: BUSINESS_DECISIONS.slice(329, 330),
  },
  {
    date: "2026-07-15",
    branch: "cursor/business-process-evolution-f844",
    summary:
      "Empty-backlog after PR #279 (create-path-slug-dns-label-max-length). Free NEXT_STEPS stayed operator/legal-gated. Pipeline-health→digest age axis closed on main. Scanned stuck CLI remotes before inventing an audit and found opencode/dev-work-password-trim (complete env+form trim + Vitest) + opencode/continuous-work-152029 (env-only half) with no open PR (Actions token blocked). Folded the fuller body onto this automation branch that can open/merge — assessOperatorAuthEnvReadiness already trimmed for the banner while the live auth path did not, so a paste/secret quirk could lock the operator out of paid CRM work. Improves AGENT_PROTOCOL empty-backlog rotation to mark operator-password trim done and point next security audits at auth cookie / public write routes.",
    shipped: [
      "Fold: stuck opencode/dev-work-password-trim + opencode/continuous-work-152029 feature files — kept both CLI ITERATIONS above",
      "src/lib/auth/operator.ts — getPassword() trims env (whitespace-only → null); isOperatorAuthConfigured checks trimmed length; tryCreateSessionFromPassword trims form input before passwordsMatch",
      "src/lib/auth/operator.test.ts — +10 regressions (leading/trailing/both-side form trim, whitespace-only env/form, env surrounding whitespace, requireOperatorAuth whitespace-only open demo)",
      "Docs: architecture.tsx + launch-checklist note env+form trim beside login rate-limit",
      "AGENT_PROTOCOL — operator-password trim rule + empty-backlog rotation marks trim done; next prefers auth cookie / public write routes",
      "NEXT_STEPS: operator-password-trim done",
      "BUSINESS_DECISIONS — documented why folding this auth hygiene beats inventing an optional aggregate (slice 330)",
      "Verified: npm test (1367 passed, +10 trim regressions on top of PR #279's 1357) + lint + build",
    ],
    decisions: BUSINESS_DECISIONS.slice(329, 330),
  },
  {
    date: "2026-07-16",
    branch: "cursor/business-process-evolution-f926",
    summary:
      "Empty-backlog after PR #280 (operator-password-trim) + PR #281 (contact-form-notify-field-length-caps). Free NEXT_STEPS stayed operator/legal-gated. Claimed operator-auth-proxy-password-trim 8s before sibling prompt-process-evolution-037c claimed proxy-operator-session-getpassword-parity — merged sibling and kept both ITERATIONS / NEXT_STEPS with one implementation. Fresh auth-surface audit of the PR #280 trim found banner + login/action paths trimmed, but src/proxy.ts dashboardAuthGate still passed raw process.env into verifyOperatorSessionToken — a trailing-space secret accepts login then infinite-redirects at the Host gate. Tightened +1-drifted absolute decision slices from digest-age through password-trim.",
    shipped: [
      "merge: origin/cursor/prompt-process-evolution-037c — dual-claim fold; both ITERATIONS kept; f926 owns implementation",
      "src/lib/auth/operator.ts — export getPassword(); isOperatorAuthConfigured delegates to it",
      "src/proxy.ts — dashboardAuthGate verifies with getPassword() (trimmed), never raw env",
      "src/proxy.test.ts — padded-env via tryCreateSessionFromPassword + whitespace-only open-demo regressions",
      "Docs: architecture.tsx + launch-checklist note proxy trim parity with login signing",
      "AGENT_PROTOCOL — proxy must use getPassword(); empty-backlog rotation marks proxy trim done; next prefers auth cookie attributes / session TTL / public write routes",
      "NEXT_STEPS: operator-auth-proxy-password-trim done",
      "BUSINESS_DECISIONS — documented why proxy trim parity beats inventing an optional aggregate (slice 331)",
      "Tightened digest-age / DNS / contact / password-trim ITERATIONS decisions to absolute indices 327–330",
      "Verified: npm test (1377 passed, +4 trim-parity regressions vs 1373 on main) + lint + build",
    ],
    decisions: BUSINESS_DECISIONS.slice(330, 331),
  },
  {
    date: "2026-07-16",
    branch: "cursor/prompt-process-evolution-037c",
    summary:
      "Empty-backlog after PR #281 (contact-form-notify-field-length-caps) + PR #280 (operator-password-trim). Free NEXT_STEPS stayed operator/legal-gated. Scanned stuck CLI remotes for an auth-cookie fix body (none — password-trim remotes already folded). Auth-cookie hardening audit found proxy.ts dashboardAuthGate still verified OPERATOR_SESSION_COOKIE against raw process.env.OPERATOR_DASHBOARD_PASSWORD while login/requireOperatorAuth use trimmed getPassword() — padded env secrets issue a valid cookie that the proxy rejects (infinite redirect to login). Shipped getPassword export + proxy parity + regression; documented path=/ must stay for /api auth twins.",
    shipped: [
      "src/lib/auth/operator.ts — export getPassword(); document as sole sign/verify key",
      "src/proxy.ts — dashboardAuthGate uses getPassword() instead of raw env",
      "src/proxy.test.ts — padded-env + tryCreateSessionFromPassword cookie accepted",
      "AGENT_PROTOCOL — proxy getPassword parity rule; path=/ retained for /api auth twins",
      "NEXT_STEPS: proxy-operator-session-getpassword-parity done",
      "BUSINESS_DECISIONS — proxy/login verify-key parity over cookie Path narrowing (slice 331; shared with f926 dual)",
      "Folded onto cursor/business-process-evolution-f926 (earlier claim + fuller test coverage); both ITERATIONS kept",
      "Verified on 037c: npm test (1374 passed, +1 padded-env proxy regression on top of main@#281's 1373) + lint",
    ],
    decisions: BUSINESS_DECISIONS.slice(330, 331),
  },
  {
    date: "2026-07-16",
    branch: "cursor/prompt-process-evolution-037c",
    summary:
      "Empty-backlog after PR #284 (proxy getPassword parity dual-fold). Free NEXT_STEPS stayed operator/legal-gated. Sibling idle. Scanned stuck CLI remotes (already-merged digest/slug/login/password/proxy bodies). Pivoted to CSV quality — the live lead-volume unlock while Places stays counsel-gated. PR #230 capped businessName/description/services-count but left city/state/address/phone/email/tagline, per-service tokens, and hours segments uncapped. Soft-capped remaining columns (phone/email reuse MAX_CONTACT_*); Vitest; architecture note; restored absolute BUSINESS_DECISIONS slices drifted +1 by the #284 fold.",
    shipped: [
      "src/lib/leads/csv-import.ts — soft-cap city/state/address/tagline/phone/email + per-service token + hours weekday/weekend; export MAX_* constants; align phone/email with MAX_CONTACT_*",
      "src/lib/leads/csv-import.test.ts — +2 regressions (optional-column soft-caps; service/hours segment caps)",
      "Docs: architecture.tsx notes remaining CSV field caps beside PR #230 limits",
      "AGENT_PROTOCOL — CSV remaining-field-cap rule; empty-backlog rotation marks this axis done",
      "NEXT_STEPS: csv-import-remaining-field-length-caps done",
      "BUSINESS_DECISIONS — soft-cap remaining CSV columns over inventing an optional aggregate (slice 331)",
      "Process: restored digest-age→proxy ITERATIONS decision slices to absolute indices 326–330 (undo #284 +1 drift)",
      "Verified: npm test (1379 passed, +2 CSV soft-cap regressions on top of main@#284's 1377) + lint",
    ],
    decisions: BUSINESS_DECISIONS.slice(331, 332),
  },
  {
    date: "2026-07-16",
    branch: "cursor/prompt-process-evolution-b378",
    summary:
      "Empty-backlog after PR #283 (csv-import-remaining-field-length-caps). Free NEXT_STEPS stayed operator/legal-gated. Sibling business-process-evolution-f515 running but no remote tip yet. Scanned stuck remotes (none with a free sold-capability body). Audited other create-path write surfaces after contact+CSV field caps: lead notes / inquiry reply already capped; addLeadAction still accepted uncapped fields that land in public preview / JSON-LD / outreach. Shipped shared normalizeLeadCreateFields + action wiring + Vitest.",
    shipped: [
      "src/lib/leads/create-fields.ts (+ .test.ts) — MAX_* + normalizeLeadCreateFields / softCapLeadField; phone/email reuse MAX_CONTACT_*",
      "src/lib/leads/csv-import.ts — import shared MAX_* / softCapLeadField; re-export MAX_CSV_* aliases for existing tests",
      "src/app/dashboard/leads/actions.ts — addLeadAction soft-caps/hard-rejects via normalizeLeadCreateFields before upsert",
      "src/app/dashboard/leads/add-lead-action.test.ts — +2 regressions (over-long businessName; optional soft-caps)",
      "Docs: architecture.tsx notes Add lead shares create-path caps with CSV",
      "AGENT_PROTOCOL — addLead must share create-fields caps; empty-backlog rotation marks this axis done",
      "NEXT_STEPS: add-lead-action-field-length-caps done",
      "BUSINESS_DECISIONS — shared create-path field caps over inventing an optional aggregate (slice 332)",
      "Verified: npm test (1387 passed, +8 create-fields + addLead soft-cap regressions on top of main@#283's 1379) + lint",
    ],
    decisions: BUSINESS_DECISIONS.slice(332, 333),
  },
  {
    date: "2026-07-16",
    branch: "cursor/business-process-evolution-f515",
    summary:
      "Empty-backlog after PR #285 (add-lead-action-field-length-caps). Free NEXT_STEPS stayed operator/legal-gated. Scanned stuck CLI remotes (clean-audit / auth-cookie process-only; no free feature body). Auth-cookie + Stripe-redirect already clean (opencode/dev-work-20260716). Public-write audit of POST /api/contact/[slug] found null getLeadBySlug still persisted orphan inquiries and skipSuppression-notified brand.supportEmail — inventable-slug support spam while preview-open already soft-rejects unknown_lead. Shipped known-lead gate (CRM or curated DEMO_LEADS) + 404 before persist/notify.",
    shipped: [
      "src/app/api/contact/[slug]/route.ts — require CRM getLeadBySlug or demo-catalog DEMO_LEADS before persist/notify; 404 unknown_lead otherwise",
      "src/app/api/contact/[slug]/route.test.ts — +2 regressions (unknown slug 404; curated example-bakery without CRM row)",
      "Docs: architecture.tsx notes known-lead gate beside contact orchestration",
      "AGENT_PROTOCOL — contact-form-require-known-lead rule; empty-backlog rotation marks this public-write axis done",
      "NEXT_STEPS: contact-form-require-known-lead done",
      "BUSINESS_DECISIONS — known-lead gate over inventable-slug support spam (slice 333)",
      "Verified: npm test (1389 passed, +2 known-lead regressions on top of main@#285's 1387) + lint + build",
    ],
    decisions: BUSINESS_DECISIONS.slice(333, 334),
  },
  {
    date: "2026-07-16",
    branch: "cursor/business-process-evolution-d018",
    summary:
      "Empty-backlog after PR #286 (contact-form-require-known-lead). Free NEXT_STEPS stayed operator/legal-gated. AGENT_PROTOCOL named marketing/generate contentTypes size as the next public-write audit. Sibling prompt-process-evolution-827f saw the claim and pivoted to checkout-customer-email-field-length-cap (complementary public Stripe money route). POST /api/marketing/generate validated type membership but not array length — generators map 1:1 over contentTypes into stub variants / Anthropic prompts, so a rate-limited open-demo caller could still burn quota with thousands of valid-type duplicates. Shipped MAX_MARKETING_CONTENT_TYPES_PER_REQUEST (= monthly pack ceiling), leadId length hard-reject, and normalizeMarketingGenerateBusiness soft-caps (create-fields MAX_*). Docs + process updated; rotation points at remaining public write body-size axes (checkout/billing-portal/unsubscribe).",
    shipped: [
      "src/lib/marketing/generate-limits.ts (+ .test.ts) — MAX_MARKETING_CONTENT_TYPES_PER_REQUEST / MAX_MARKETING_GENERATE_LEAD_ID_LENGTH + normalizeMarketingGenerateBusiness",
      "src/app/api/marketing/generate/route.ts — hard-reject oversize contentTypes/leadId; soft-cap business before generate; bound services.length before .every",
      "src/app/api/marketing/generate/route.test.ts — +3 regressions (contentTypes ceiling, leadId length, business soft-caps)",
      "Docs: architecture.tsx + marketing-automation.tsx note size caps beside rate-limit/validation",
      "AGENT_PROTOCOL — marketing-generate size-cap rule; empty-backlog rotation marks this axis done and points at next public-write body sizes",
      "NEXT_STEPS: marketing-generate-content-types-size-cap done",
      "BUSINESS_DECISIONS — pack-ceiling contentTypes cap over inventing an optional aggregate (slice 334)",
      "Verified: npm test (1396 passed, +7 size-cap regressions on top of main@#286's 1389) + lint + build",
    ],
    decisions: BUSINESS_DECISIONS.slice(334, 335),
  },
  {
    date: "2026-07-16",
    branch: "cursor/prompt-process-evolution-827f",
    summary:
      "Empty-backlog after PR #286 (contact-form-require-known-lead). Free NEXT_STEPS stayed operator/legal-gated. Sibling business-process-evolution-d018 claimed marketing-generate-content-types-size-cap (merged as PR #287) — pivoted per AGENT_PROTOCOL. Public-write audit of Stripe money create routes found uncapped body.customerEmail forwarded to stripe.checkout.sessions.create and recordCheckoutSessionCreated on both bundle and commerce twins. Soft-capped once via shared normalizeCheckoutCustomerEmail (MAX_CONTACT_EMAIL_LENGTH); Vitest on helper + both routes; architecture note; folded origin/main (#287) keeping both ITERATIONS.",
    shipped: [
      "src/lib/checkout/customer-email.ts (+ .test.ts) — normalizeCheckoutCustomerEmail / MAX_CHECKOUT_CUSTOMER_EMAIL_LENGTH alias",
      "src/app/api/stripe/checkout/route.ts — soft-cap customerEmail before Stripe + persist",
      "src/app/api/commerce/checkout/route.ts — same soft-cap on commerce Buy now twin",
      "Route Vitest — +3 regressions (bundle soft-cap + blank omit; commerce soft-cap)",
      "Docs: architecture.tsx notes checkout customerEmail soft-cap beside session tracking",
      "AGENT_PROTOCOL — checkout customerEmail soft-cap rule; empty-backlog rotation marks marketing + checkout public-write size axes done; next billing-portal sessionId / unsubscribe email",
      "NEXT_STEPS: checkout-customer-email-field-length-cap done; marketing-generate-content-types-size-cap done (d018 / PR #287)",
      "BUSINESS_DECISIONS — checkout email soft-cap over inventing an optional aggregate (slice 335)",
      "Verified: npm test (1403 passed after fold of #287's 1396 + our +7) + lint + build",
    ],
    decisions: BUSINESS_DECISIONS.slice(335, 336),
  },
  {
    date: "2026-07-16",
    branch: "cursor/prompt-process-evolution-a938",
    summary:
      "Empty-backlog after PR #288 (checkout-customer-email-field-length-cap) + PR #287 (marketing-generate size). Free NEXT_STEPS stayed operator/legal-gated. Sibling idle this window. Scanned stuck CLI remotes (already-merged marketing/digest/slug/login bodies). Public-write audit of POST /api/stripe/billing-portal found sessionId trimmed but unbounded — multi-KB garbage still reached stripe.checkout.sessions.retrieve and the default return_url query under the existing rate limit. Hard-reject via parseCheckoutSessionId (MAX=255); no soft-cap for opaque ids. Docs + process updated; rotation points at unsubscribe email length next.",
    shipped: [
      "src/lib/billing/checkout-session-id.ts (+ .test.ts) — parseCheckoutSessionId / MAX_STRIPE_CHECKOUT_SESSION_ID_LENGTH",
      "src/app/api/stripe/billing-portal/route.ts — hard-reject over-long sessionId before Stripe",
      "src/app/api/stripe/billing-portal/route.test.ts — +1 regression (too_long 400, no retrieve)",
      "Docs: architecture.tsx notes sessionId length hard-reject beside rate-limit / returnUrl guards",
      "AGENT_PROTOCOL — opaque public-id hard-reject rule; empty-backlog rotation marks billing-portal sessionId size done; next unsubscribe email length",
      "NEXT_STEPS: billing-portal-sessionId-field-length-cap done",
      "BUSINESS_DECISIONS — hard-reject over-long billing-portal sessionId over inventing an optional aggregate (slice 336)",
      "Verified: npm test (1408 passed, +5 parseCheckoutSessionId + route too_long regressions on top of main@#288's 1403) + lint + build",
    ],
    decisions: BUSINESS_DECISIONS.slice(337, 338),
  },
  {
    date: "2026-07-16",
    branch: "cursor/business-process-evolution-8fb7",
    summary:
      "Empty-backlog after PR #288 (checkout-customer-email-field-length-cap). Free NEXT_STEPS stayed operator/legal-gated. Sibling prompt-process-evolution-a938 claimed billing-portal-sessionId-field-length-cap (opaque sessionId hard-reject, merged PR #289) — pivoted per AGENT_PROTOCOL to the complementary public-write size hole. GET /api/unsubscribe still accepted uncapped email query params before HMAC + suppressEmail. Hard-rejected over MAX_CONTACT_EMAIL_LENGTH before verify; Vitest + architecture note; folded origin/main (#289) keeping both ITERATIONS.",
    shipped: [
      "src/app/api/unsubscribe/route.ts — hard-reject email.length > MAX_CONTACT_EMAIL_LENGTH before verifyUnsubscribeToken / suppressEmail",
      "src/app/api/unsubscribe/route.test.ts — +2 regressions (over-long 400; exact-max still suppresses)",
      "Docs: architecture.tsx notes unsubscribe email length hard-reject beside token + rate-limit",
      "AGENT_PROTOCOL — unsubscribe email hard-reject rule; empty-backlog rotation marks billing-portal + unsubscribe public-write size axes done",
      "NEXT_STEPS: unsubscribe-email-field-length-cap done; billing-portal-sessionId-field-length-cap done (a938 / PR #289)",
      "BUSINESS_DECISIONS — unsubscribe email hard-reject over soft-cap / inventing an optional aggregate (slice 337)",
      "Verified: npm test (1410 passed after fold of #289's 1408 + our +2) + lint",
    ],
    decisions: BUSINESS_DECISIONS.slice(337, 338),
  },
  {
    date: "2026-07-16",
    branch: "cursor/prompt-process-evolution-92f3",
    summary:
      "Empty-backlog after PR #290 (unsubscribe-email-field-length-cap) + PR #289 (billing-portal sessionId). Free NEXT_STEPS stayed operator/legal-gated. Sibling business-process-evolution-58d9 claimed contact-form-slug-path-length-cap (complementary public-write size hole on contact path slug) in the same window — both axes kept. Scanned stuck CLI remotes (already-merged marketing/digest/slug/login bodies). Public-write audit of POST /api/commerce/checkout found slug/skuId still uncapped after customerEmail soft-cap while bundle checkout already sanitizes+caps slug. Hard-reject via parseCommerceCheckoutSlug / parseCommerceCheckoutSkuId before DB/Stripe; Vitest + architecture note; rotation points at billing-portal returnUrl / unsubscribe token length next. Dual-fold with 58d9 PR #292 / this #291 — both ITERATIONS kept.",
    shipped: [
      "src/lib/commerce/checkout-fields.ts (+ .test.ts) — parseCommerceCheckoutSlug / parseCommerceCheckoutSkuId + MAX_* ceilings",
      "src/lib/commerce/index.ts — re-export checkout field parsers",
      "src/app/api/commerce/checkout/route.ts — hard-reject over-long slug/skuId before getCommerceCatalog / Stripe",
      "src/app/api/commerce/checkout/route.test.ts — +1 regression (over-long slug + skuId 400, no catalog/Stripe)",
      "Docs: architecture.tsx notes Buy now slug/skuId hard-reject beside server-resolved price",
      "AGENT_PROTOCOL — commerce checkout opaque slug/skuId hard-reject rule; empty-backlog rotation marks this axis done; next residual public body sizes (billing-portal returnUrl / unsubscribe token)",
      "NEXT_STEPS: commerce-checkout-slug-skuId-field-length-cap done",
      "BUSINESS_DECISIONS — hard-reject commerce checkout slug/skuId over inventing an optional aggregate (absolute index 338)",
      "Verified: npm test (1417 passed, +7 checkout-fields + route too_long regressions on top of main@#290's 1410) + lint + build",
    ],
    // Object-parse by decision text: commerce checkout slug/skuId owns BD[338].
    decisions: BUSINESS_DECISIONS.slice(338, 339),
  },
  {
    date: "2026-07-16",
    branch: "cursor/business-process-evolution-58d9",
    summary:
      "Empty-backlog after PR #290 (unsubscribe-email-field-length-cap). Free NEXT_STEPS stayed operator/legal-gated. Sibling prompt-process-evolution-92f3 claimed commerce-checkout-slug-skuId-field-length-cap (Buy now money-route lookup keys) — pivoted per AGENT_PROTOCOL. Public-write residual: POST/GET /api/contact/[slug] charset-validated but uncapped path length while preview-open already rejected >120. Shipped shared MAX_PUBLIC_LEAD_SLUG_PATH_LENGTH + isPublicLeadSlugPathLengthOk; wired contact + preview-open; Vitest + architecture note; folded sibling 92f3 keeping both ITERATIONS.",
    shipped: [
      "merge: origin/cursor/prompt-process-evolution-92f3 — complementary Buy now slug/skuId caps; both ITERATIONS kept",
      "src/lib/leads/slug-path.ts — MAX_PUBLIC_LEAD_SLUG_PATH_LENGTH=120 + isPublicLeadSlugPathLengthOk",
      "src/app/api/contact/[slug]/route.ts — POST/GET hard-reject over-long path slugs before CRM/demo lookup",
      "src/app/api/preview/[slug]/open/route.ts — use shared helper (was magic 120)",
      "Vitest — slug-path length helper + contact POST/GET over-long + exact-max regressions",
      "Docs: architecture.tsx notes contact path-length hard-reject beside known-lead gate",
      "AGENT_PROTOCOL — contact path-length rule; empty-backlog rotation marks commerce + contact path axes done",
      "NEXT_STEPS: contact-form-slug-path-length-cap done; commerce-checkout-slug-skuId-field-length-cap done (92f3 / PR #291)",
      "BUSINESS_DECISIONS — contact path-length hard-reject over inventing an optional aggregate (absolute index 339)",
      "Verified: npm test (1422 passed) + lint; folded with 92f3 on main via #291",
      "Folded onto cursor/prompt-process-evolution-92f3 — both complementary ITERATIONS kept",
    ],
    // Object-parse by decision text: contact path-length hard-reject owns BD[339].
    decisions: BUSINESS_DECISIONS.slice(339, 340),
  },
  {
    date: "2026-07-16",
    branch: "cursor/prompt-process-evolution-98c1",
    summary:
      "Empty-backlog after PR #291/#292 (commerce-checkout-slug-skuId-field-length-cap + contact-form-slug-path-length-cap). Free NEXT_STEPS stayed operator/legal-gated. Same-window sibling business-process-evolution-42a4 claimed unsubscribe-token-field-length-cap — complementary axes kept. Public-write residual: POST /api/stripe/billing-portal same-origin-guarded returnUrl but uncapped length — multi-KB same-origin garbage still reached stripe.billingPortal.sessions.create. Shipped isAcceptableBillingPortalReturnUrl (origin + MAX=2048); over-long falls back like cross-origin/malformed. Docs + process updated.",
    shipped: [
      "src/lib/billing/return-url.ts (+ .test.ts) — isAcceptableBillingPortalReturnUrl / MAX_BILLING_PORTAL_RETURN_URL_LENGTH",
      "src/app/api/stripe/billing-portal/route.ts — use shared helper (replaces inline isSameOriginReturnUrl)",
      "src/app/api/stripe/billing-portal/route.test.ts — +1 regression (over-long same-origin falls back, still opens portal)",
      "Docs: architecture.tsx notes returnUrl length bound beside same-origin / sessionId hard-reject",
      "AGENT_PROTOCOL — optional redirect fall-back-on-over-length rule; empty-backlog rotation marks returnUrl size done",
      "NEXT_STEPS: billing-portal-returnUrl-field-length-cap done",
      "BUSINESS_DECISIONS — fall back over-long billing-portal returnUrl over inventing an optional aggregate (absolute index 340)",
      "Folded onto cursor/business-process-evolution-42a4 — both complementary ITERATIONS kept",
    ],
    // Object-parse by decision text: billing-portal returnUrl length owns BD[340].
    decisions: BUSINESS_DECISIONS.slice(340, 341),
  },
  {
    date: "2026-07-16",
    branch: "cursor/business-process-evolution-42a4",
    summary:
      "Empty-backlog after PR #291/#292. Free NEXT_STEPS stayed operator/legal-gated. Sibling prompt-process-evolution-98c1 claimed billing-portal-returnUrl-field-length-cap (optional redirect length) — pivoted per AGENT_PROTOCOL. Public-write residual: GET /api/unsubscribe hard-rejects over-long email but still accepted uncapped token before HMAC / Buffer.from. Hard-reject over MAX_UNSUBSCRIBE_TOKEN_LENGTH=128 (genuine tokens are 43-char base64url); Vitest + architecture note; folded sibling 98c1 keeping both ITERATIONS.",
    shipped: [
      "merge: origin/cursor/prompt-process-evolution-98c1 — complementary billing-portal returnUrl length bound; both ITERATIONS kept",
      "src/lib/email/unsubscribe-token.ts — MAX_UNSUBSCRIBE_TOKEN_LENGTH + early reject in verifyUnsubscribeToken",
      "src/app/api/unsubscribe/route.ts — hard-reject token.length > MAX before verify / suppressEmail",
      "Vitest — token helper + route over-long / exact-max regressions",
      "Docs: architecture.tsx notes unsubscribe token length hard-reject beside email length + rate-limit",
      "AGENT_PROTOCOL — unsubscribe token hard-reject rule; empty-backlog rotation marks returnUrl + token axes done",
      "NEXT_STEPS: unsubscribe-token-field-length-cap done; billing-portal-returnUrl-field-length-cap done (98c1)",
      "BUSINESS_DECISIONS — unsubscribe token hard-reject over inventing an optional aggregate (absolute index 341)",
      "Verified: npm test (1433 passed) + lint; folded with 98c1 returnUrl length bound",
    ],
    // Object-parse by decision text: unsubscribe token hard-reject owns BD[341].
    decisions: BUSINESS_DECISIONS.slice(341, 342),
  },
  {
    date: "2026-07-16",
    branch: "cursor/business-process-evolution-191d",
    summary:
      "Empty-backlog after PR #293. Free NEXT_STEPS stayed operator/legal-gated. Scanned stuck CLI remotes (Convex order / preview-index / handoff guards already on main). Public-write residual twin: GET /checkout/success?session_id= still retrieved Stripe with an uncapped query id after billing-portal already hard-rejects body.sessionId. Hard-reject via shared parseCheckoutSessionId inside extracted loadCheckoutSuccessSession; Vitest asserts retrieve never runs on over-long.",
    shipped: [
      "src/lib/checkout/success-session.ts — loadCheckoutSuccessSession (parseCheckoutSessionId before retrieve; injectable retrieve for tests)",
      "src/lib/checkout/success-session.test.ts — +9 regressions (missing/whitespace/over-long skip Stripe; complete subscription/starter; exact-max boundary)",
      "src/app/checkout/success/page.tsx — use loadCheckoutSuccessSession instead of inline uncapped retrieve",
      "src/lib/billing/checkout-session-id.ts — docstring names success page beside billing-portal",
      "Docs: architecture.tsx notes /checkout/success session_id hard-reject twin",
      "AGENT_PROTOCOL — opaque-id rule covers success query; empty-backlog rotation marks checkout-success-sessionId done; dedicated success-page rule",
      "NEXT_STEPS: checkout-success-sessionId-field-length-cap done",
      "BUSINESS_DECISIONS — success-page session_id hard-reject over inventing an optional aggregate (absolute index 342)",
      "Verified: npm test + lint",
      "Folded onto cursor/prompt-process-evolution-0eec — complementary login-password length cap; both ITERATIONS kept",
    ],
    // Object-parse by decision text: checkout-success session_id owns BD[342].
    decisions: BUSINESS_DECISIONS.slice(342, 343),
  },
  {
    date: "2026-07-16",
    branch: "cursor/prompt-process-evolution-0eec",
    summary:
      "Empty-backlog after PR #293. Free NEXT_STEPS stayed operator/legal-gated. Sibling business-process-evolution-191d claimed checkout-success-sessionId-field-length-cap (SSR opaque-id twin of billing-portal) — pivoted per AGENT_PROTOCOL. Public-write residual: loginOperatorAction still forwarded uncapped form passwords into tryCreateSessionFromPassword → passwordsMatch → Buffer.from under the 5/60s rate limit. Hard-reject over MAX_OPERATOR_PASSWORD_LENGTH=256 before allocate/compare; Vitest + architecture note; folded sibling 191d keeping both ITERATIONS.",
    shipped: [
      "merge: origin/cursor/business-process-evolution-191d — complementary /checkout/success session_id hard-reject; both ITERATIONS kept",
      "src/lib/auth/operator.ts — MAX_OPERATOR_PASSWORD_LENGTH + early reject in tryCreateSessionFromPassword / passwordsMatch",
      "src/lib/auth/operator.test.ts — +4 regressions (over-long / exact-max on passwordsMatch + tryCreateSessionFromPassword)",
      "Docs: architecture.tsx notes login password length hard-reject beside trim + rate-limit",
      "AGENT_PROTOCOL — login password hard-reject rule; opaque-id rule folded with sibling success-page wording; empty-backlog rotation marks checkout-success + login-password done; next residual login next-path length",
      "NEXT_STEPS: login-password-field-length-cap done; checkout-success-sessionId-field-length-cap done (191d)",
      "BUSINESS_DECISIONS — login password hard-reject over inventing an optional aggregate (absolute index 343)",
      "Verified: npm test (1446 passed; main@#293 1433 + sibling 191d success-session regressions + our +4 password length) + lint + build",
    ],
    // Object-parse by decision text: login password hard-reject owns BD[343].
    decisions: BUSINESS_DECISIONS.slice(343, 344),
  },
  {
    date: "2026-07-16",
    branch: "cursor/prompt-process-evolution-d6b1",
    summary:
      "Empty-backlog after PR #295 (login-password-field-length-cap + checkout-success-sessionId-field-length-cap). Free NEXT_STEPS stayed operator/legal-gated. Claimed login-next-path-field-length-cap (AGENT_PROTOCOL residual public body size) and pushed claim+feature before sibling remote appeared. Same-window sibling business-process-evolution-f0c6 later dual-claimed the same id (claim-only) — earlier remote claim + feature body owns per AGENT_PROTOCOL; sibling should pivot. safeNextPath rejected open redirects but accepted unbounded dashboard-shaped next= into login redirects. Bound via MAX_SAFE_NEXT_PATH_LENGTH=2048 (fall back like returnUrl); Vitest + architecture note; rotation points at Convex parity / clean-audit.",
    shipped: [
      "src/lib/auth/safe-next-path.ts — MAX_SAFE_NEXT_PATH_LENGTH + early reject in isSafeNextPath",
      "src/lib/auth/safe-next-path.test.ts — +3 regressions (over-long reject / exact-max accept / safeNextPath fall-back)",
      "Docs: architecture.tsx notes login next= length fall-back beside password hard-reject + rate-limit",
      "AGENT_PROTOCOL — login next-path length rule; empty-backlog rotation marks public-write body-size sweep closed for known login/money/contact/unsubscribe sinks",
      "NEXT_STEPS: login-next-path-field-length-cap done (owns over later f0c6 dual-claim)",
      "BUSINESS_DECISIONS — fall back over-long login next= over inventing an optional aggregate (absolute index 344)",
      "Verified: npm test (1449 passed, +3 over main@#295's 1446) + lint + build",
    ],
    // Object-parse by decision text: login next= path length owns BD[344].
    decisions: BUSINESS_DECISIONS.slice(344, 345),
  },
  {
    date: "2026-07-16",
    branch: "cursor/business-process-evolution-f0c6",
    summary:
      "Empty-backlog after PR #296 (login-next-path). Free NEXT_STEPS stayed operator/legal-gated. Dual-claimed login-next-path after sibling d6b1 (earlier claim + feature, merged #296) — pivoted per AGENT_PROTOCOL. Scanned stuck CLI remotes (clean-audit-only). Public page GET twin residual: /preview/[slug] still fed uncapped params.slug into getLeadBySlug + resolvePreviewLead while contact/preview-open already hard-reject over MAX_PUBLIC_LEAD_SLUG_PATH_LENGTH=120. Extracted loadPreviewPageLead (length gate before CRM/demo); page + generateMetadata notFound() on null; Vitest asserts deps never run on over-long.",
    shipped: [
      "merge: origin/main (PR #296 login next-path) — keep sibling ITERATION; pivot claim",
      "src/lib/leads/preview-page-lead.ts — loadPreviewPageLead (isPublicLeadSlugPathLengthOk before getLeadBySlug / resolvePreviewLead; injectable deps)",
      "src/lib/leads/preview-page-lead.test.ts — +4 regressions (over-long / empty skip deps; exact-max CRM prefer; demo fall-through)",
      "src/app/preview/[slug]/page.tsx — use loadPreviewPageLead; notFound() when null",
      "src/lib/leads/slug-path.ts — docstring names SSR /preview/[slug] beside contact + preview-open",
      "Docs: architecture.tsx notes preview page path-length twin",
      "AGENT_PROTOCOL — path-length rule covers SSR page; empty-backlog rotation marks preview-page done; page-GET-twin reminder",
      "NEXT_STEPS: preview-page-slug-path-length-cap done",
      "BUSINESS_DECISIONS — preview page slug hard-reject over inventing an optional aggregate (absolute index 345)",
      "Verified: npm test + lint",
    ],
    // Object-parse by decision text: preview page slug hard-reject owns BD[345].
    decisions: BUSINESS_DECISIONS.slice(345, 346),
  },
  {
    date: "2026-07-16",
    branch: "cursor/business-process-evolution-24ff",
    summary:
      "Empty-backlog after PR #298 (preview-page-slug-path-length-cap). Free NEXT_STEPS stayed operator/legal-gated. Scanned stuck CLI remotes (clean-audit-only) and same-window sibling prompt-process-evolution-e309 (no remote claim yet). Public page GET twin residual: optional /checkout?slug= still fed uncapped searchParams.slug into getLeadBySlug + CheckoutPrefill while contact/preview-open/preview page already gate MAX_PUBLIC_LEAD_SLUG_PATH_LENGTH=120. Extracted resolveCheckoutPrefillSlug / loadCheckoutPrefillLead (over-long → missing fall-back); Vitest asserts CRM never runs on over-long.",
    shipped: [
      "src/lib/checkout/prefill-slug.ts (+ .test.ts) — resolveCheckoutPrefillSlug / loadCheckoutPrefillLead (shared path-length gate; injectable getLeadBySlug)",
      "src/app/checkout/page.tsx — use loadCheckoutPrefillLead instead of uncapped trim+getLeadBySlug",
      "src/lib/leads/slug-path.ts — docstring names optional /checkout?slug= fall-back beside path hard-rejects",
      "Docs: architecture.tsx notes checkout prefill length fall-back beside session tracking",
      "AGENT_PROTOCOL — optional checkout slug prefill fall-back rule; empty-backlog rotation marks this axis done; next residual page GET twins / Convex parity / clean-audit",
      "NEXT_STEPS: checkout-slug-prefill-field-length-cap done",
      "BUSINESS_DECISIONS — checkout slug prefill fall-back over inventing an optional aggregate (absolute index 346)",
      "Verified: npm test + lint + build",
    ],
    // Object-parse by decision text: checkout slug prefill owns BD[346].
    decisions: BUSINESS_DECISIONS.slice(346, 347),
  },
  {
    date: "2026-07-16",
    branch: "cursor/prompt-process-evolution-e309",
    summary:
      "Empty-backlog after PR #299 (checkout-slug-prefill). Free NEXT_STEPS stayed operator/legal-gated. Scanned stuck CLI remotes (clean-audit-only / already-merged convex-query-ordering-parity). Public Host→preview residual twin: extractPreviewSubdomainSlug + getLeadSlugByCustomDomain still accepted uncapped spoofed Host while path/query slug sinks already gate length. Gated preview-subdomain labels via isPublicLeadSlugPathLengthOk and custom-domain Hosts via isPlausibleCustomDomainHost before CRM/Convex; Vitest asserts deps never run on over-long.",
    shipped: [
      "src/lib/deploy/custom-domain-routing.ts — extractPreviewSubdomainSlug returns null over MAX_PUBLIC_LEAD_SLUG_PATH_LENGTH",
      "src/lib/db.ts getLeadSlugByCustomDomain — isPlausibleCustomDomainHost gate before Convex/SQLite",
      "src/proxy.ts — isPlausibleCustomDomainHost before custom-domain DB lookup (defense-in-depth)",
      "Tests: custom-domain-routing.test.ts + proxy.test.ts over-long Host regressions",
      "src/lib/leads/slug-path.ts — docstring names Host→preview beside path/query twins",
      "Docs: architecture.tsx notes Host lookup length gates",
      "AGENT_PROTOCOL — Host→preview length rule; empty-backlog rotation marks path/query/Host slug size axis closed for known sinks",
      "NEXT_STEPS: proxy-host-lookup-field-length-cap done",
      "BUSINESS_DECISIONS — Host lookup fall-through over inventing an optional aggregate (absolute index 347)",
      "Verified: npm test (1466 passed) + lint",
    ],
    // Object-parse by decision text: Host→preview lookup gate owns BD[347].
    decisions: BUSINESS_DECISIONS.slice(347, 348),
  },
  {
    date: "2026-07-16",
    branch: "cursor/prompt-process-evolution-e309",
    summary:
      "Empty-backlog after PR #300 (proxy-host-lookup). Free NEXT_STEPS stayed operator/legal-gated. Scanned stuck CLI remotes (clean-audit-only). Residual twin of login-next-path-field-length-cap: src/proxy.ts dashboardAuthGate still set login?next= to the raw request pathname and cloned inherited query into Location before the login page's safeNextPath could fall back. Bound via safeNextPath; clear search/hash on the login URL; Vitest + architecture note.",
    shipped: [
      "src/proxy.ts — dashboardAuthGate uses safeNextPath(pathname); clears search/hash before login redirect",
      "src/proxy.test.ts — +2 regressions (over-long pathname → next=/dashboard; inherited probe query dropped)",
      "Docs: architecture.tsx notes proxy must bound next= before minting Location",
      "AGENT_PROTOCOL — proxy login-redirect next= bound rule; empty-backlog rotation marks proxy-login-redirect done",
      "NEXT_STEPS: proxy-login-redirect-next-bound done",
      "BUSINESS_DECISIONS — proxy login redirect next= fall-back over inventing an optional aggregate (absolute index 348)",
      "Verified: npm test (1468 passed, +2 over main@#300's 1466) + lint",
    ],
    // Object-parse by decision text: proxy login redirect next= owns BD[348].
    decisions: BUSINESS_DECISIONS.slice(348, 349),
  },
  {
    date: "2026-07-16",
    branch: "cursor/business-process-evolution-67b2",
    summary:
      "Empty-backlog after proxy-login-redirect-next-bound. Free NEXT_STEPS stayed operator/legal-gated. Scanned stuck CLI remotes (clean-audit-only / already-merged). Same-window sibling prompt-process-evolution-2662 claimed operator-session-token-field-length-cap (complementary auth cookie size) — both axes kept. Public-write residual: POST /api/preview/[slug]/open path slug already length-gated but optional body.openedAt still fed uncapped strings into Date.parse before persist. Shipped resolvePreviewOpenedAt (over-long → server now); Vitest + architecture note; process rotation now prefers residual optional JSON body fields on public beacons after URL/path size sinks close.",
    shipped: [
      "src/lib/leads/preview-open.ts — resolvePreviewOpenedAt / MAX_PREVIEW_OPENED_AT_LENGTH=64",
      "src/lib/leads/preview-open.test.ts — +5 regressions (missing/over-long/exact/unparseable/normalize)",
      "src/app/api/preview/[slug]/open/route.ts — use resolvePreviewOpenedAt before Date.parse/persist",
      "src/app/api/preview/[slug]/open/route.test.ts — +1 regression (over-long openedAt → short server ISO, still 200)",
      "Docs: architecture.tsx notes beacon openedAt length fall-back beside requireConvex",
      "AGENT_PROTOCOL — preview-open openedAt length rule; empty-backlog rotation marks this axis done; next prefers dated clean-audit / Convex parity / Assign-project id length",
      "NEXT_STEPS: preview-open-openedAt-field-length-cap done",
      "BUSINESS_DECISIONS — fall back over-long preview-open openedAt over inventing an optional aggregate (absolute index 349)",
      "Verified: npm test (1474 passed, +6 over main@proxy-login's 1468) + lint",
      "Folded onto cursor/prompt-process-evolution-2662 — complementary session-token length; both ITERATIONS kept",
    ],
    // Object-parse by decision text: preview-open openedAt owns BD[349].
    decisions: BUSINESS_DECISIONS.slice(349, 350),
  },
  {
    date: "2026-07-16",
    branch: "cursor/prompt-process-evolution-2662",
    summary:
      "Empty-backlog after proxy-login-redirect-next-bound on main. Free NEXT_STEPS stayed operator/legal-gated. Scanned stuck CLI remotes (clean-audit-only / already-merged). Same-window sibling business-process-evolution-67b2 shipped preview-open-openedAt-field-length-cap (PR #302) — complementary axes kept. Auth cookie attributes/TTL already clean; residual opaque-token size: verifyOperatorSessionToken still ran HMAC + Buffer.from on uncapped Cookie values and proxy dashboardAuthGate calls it on every /dashboard/* with no rate limit. Hard-reject over MAX_OPERATOR_SESSION_TOKEN_LENGTH=128 before crypto; Vitest + architecture note.",
    shipped: [
      "merge: origin/main (PR #302 preview-open openedAt) — keep sibling ITERATION; complementary session-token axis",
      "src/lib/auth/operator.ts — MAX_OPERATOR_SESSION_TOKEN_LENGTH + early reject in verifyOperatorSessionToken",
      "src/lib/auth/operator.test.ts — +3 regressions (genuine under max; over-long hard-reject; exact-max still evaluated)",
      "Docs: architecture.tsx notes session cookie length hard-reject beside password + proxy next=",
      "AGENT_PROTOCOL — operator session token length rule; empty-backlog rotation marks openedAt + session-token done",
      "NEXT_STEPS: operator-session-token-field-length-cap done; preview-open-openedAt-field-length-cap done (67b2 / #302)",
      "BUSINESS_DECISIONS — session cookie hard-reject over inventing an optional aggregate (absolute index 350)",
      "Verified: npm test (1477 passed = main@#302's 1474 + 3 session-token regressions) + lint + build",
    ],
    // Object-parse by decision text: operator session token owns BD[350].
    decisions: BUSINESS_DECISIONS.slice(350, 351),
  },
  {
    date: "2026-07-16",
    branch: "cursor/business-process-evolution-1ba2",
    summary:
      "Empty-backlog after PR #303 (operator-session-token-field-length-cap + preview-open-openedAt-field-length-cap). Free NEXT_STEPS stayed operator/legal-gated. Scanned stuck CLI remotes: opencode/dev-work-auth-gated-field-caps had a complete parseVercelProjectId + assignVercelProjectAction bound with no open PR — folded per AGENT_PROTOCOL before inventing a clean-audit. Auth-gated Assign project trimmed vercelProjectId but never length-bounded it before Domains API / Convex write. Shipped MAX_VERCEL_PROJECT_ID_LENGTH=100 + parseVercelProjectId; wired assignVercelProjectAction fail-closed on over-long; added helper Vitest + action-level over-long / exact-max regressions (stuck CLI only mocked the helper). Process rotation now prefers dated clean-audit / Convex parity.",
    shipped: [
      "fold: origin/opencode/dev-work-auth-gated-field-caps — complete auth-gated vercelProjectId length body (no open PR); keep CLI intent + extend with action-level over-long/exact-max Vitest",
      "src/lib/deploy/vercel-project-id.ts — MAX_VERCEL_PROJECT_ID_LENGTH (100) + parseVercelProjectId (trim + hard-reject over-long; blank → null clear)",
      "src/lib/deploy/vercel-project-id.test.ts — 6 helper regressions",
      "src/app/dashboard/leads/actions.ts — assignVercelProjectAction uses parseVercelProjectId before assignVercelProjectAndProvision",
      "src/app/dashboard/leads/assign-vercel-project-action.test.ts — +2 action regressions (over-long hard-reject skips provision; exact-max still assigns)",
      "Docs: architecture.tsx notes Assign-project id length hard-reject beside custom-domain normalize",
      "AGENT_PROTOCOL — auth-gated Assign-project id length rule; empty-backlog rotation marks this axis done; stuck-CLI fold example named",
      "NEXT_STEPS: assign-vercel-project-id-field-length-cap done",
      "BUSINESS_DECISIONS — hard-reject Assign-project vercelProjectId over inventing an optional aggregate (absolute index 351)",
      "Verified: npm test (1486 passed = main@#303's 1477 + 6 helper + 2 action over-long/exact-max + 1 suite bookkeeping) + lint",
    ],
    // Object-parse by decision text: Assign-project vercelProjectId owns BD[351].
    decisions: BUSINESS_DECISIONS.slice(351, 352),
  },
  {
    date: "2026-07-16",
    branch: "cursor/prompt-process-evolution-0c78",
    summary:
      "Empty-backlog after PR #302/#303 (preview-open openedAt + operator-session-token). Free NEXT_STEPS stayed operator/legal-gated. Sibling business-process-evolution-1ba2 claimed assign-vercel-project-id-field-length-cap (merged PR #304) — complementary axes kept. Scanned stuck CLI remotes (clean-audit-only / already-merged). Convex parity residual after leads/checkoutSessions/inquiries: commerceOrders.list + listUnpaid still sorted _creationTime via .order(\"desc\") while SQLite ORDER BY createdAt DESC. Shipped collect + app createdAt ISO desc (+ slice for list limit), sortCommerceOrdersNewestFirst belt-and-suspenders in db.ts, Vitest + architecture note; folded origin/main (#304) keeping both ITERATIONS; rotation points at dated clean-audit / auth-gated Mark-paid-out sessionId length.",
    shipped: [
      "merge: origin/main (PR #304 Assign-project vercelProjectId length) — keep sibling ITERATION; complementary Convex commerceOrders ordering",
      "convex/commerceOrders.ts — list + listUnpaid sort app createdAt ISO desc (collect + sort + slice; not bare .order(\"desc\"))",
      "src/lib/commerce/orders.ts — sortCommerceOrdersNewestFirst (+ index re-export)",
      "src/lib/db.ts — listCommerceOrders / listUnpaidCommerceOrders re-sort Convex path (belt-and-suspenders)",
      "src/lib/commerce/orders.test.ts — +3 newest-first regressions",
      "Docs: architecture.tsx notes commerceOrders createdAt ordering beside dual-backend contract",
      "AGENT_PROTOCOL — dual-backend ordering names commerceOrders; empty-backlog rotation marks Convex commerceOrders residual done",
      "NEXT_STEPS: commerce-orders-convex-createdAt-ordering-parity done; assign-vercel-project-id-field-length-cap done (1ba2 / #304)",
      "BUSINESS_DECISIONS — commerceOrders createdAt sort over inventing an optional aggregate (absolute index 352)",
      "Verified: npm test (1489 passed = main@#304's 1486 + 3 newest-first regressions) + lint + build",
    ],
    // Object-parse by decision text: commerceOrders createdAt sort owns BD[352].
    decisions: BUSINESS_DECISIONS.slice(352, 353),
  },
  {
    date: "2026-07-16",
    branch: "cursor/business-process-evolution-28bd",
    summary:
      "Empty-backlog after PR #305 (commerce-orders-convex-createdAt-ordering-parity). Free NEXT_STEPS stayed operator/legal-gated. Scanned stuck CLI remotes (clean-audit-only / already-merged). Claimed auth-gated-stripe-sessionId-field-length-cap immediately; same-window sibling prompt-process-evolution-c954 later claimed complementary auth-gated-inquiryId-field-length-cap — both axes kept. Auth-gated Mark paid out + abandoned-recovery still accepted uncapped stripeSessionId after public billing-portal/success already hard-reject via parseCheckoutSessionId. Wired the shared helper into all three actions; Vitest + architecture note; process rotation now prefers auth-gated twins of shipped parsers before inventing a clean-audit.",
    shipped: [
      "src/lib/billing/checkout-session-id.ts — docstring names auth-gated Mark paid out + recovery twins beside public sinks",
      "src/app/dashboard/leads/actions.ts — markCommerceOrderPaidOutAction + sendCheckoutRecoveryAction + sendCommerceCheckoutRecoveryAction use parseCheckoutSessionId before DB/email",
      "src/app/dashboard/leads/mark-commerce-order-paid-out-action.test.ts — +2 over-long / exact-max regressions",
      "src/app/dashboard/leads/checkout-recovery-actions.test.ts — +2 over-long regressions (bundle + Buy now)",
      "Docs: architecture.tsx notes auth-gated sessionId hard-reject beside Mark paid out",
      "AGENT_PROTOCOL — auth-gated stripeSessionId rule; empty-backlog rotation prefers auth-gated twins of shipped parsers",
      "NEXT_STEPS: auth-gated-stripe-sessionId-field-length-cap done",
      "BUSINESS_DECISIONS — hard-reject auth-gated stripeSessionId over inventing an optional aggregate (absolute index 353)",
      "Verified: npm test (1493 passed = main@#305's 1489 + 4 over-long/exact-max regressions) + lint",
      "Sibling c954 complementary inquiryId length — folded both ITERATIONS on c954 merge",
    ],
    // Object-parse by decision text: auth-gated stripeSessionId owns BD[353].
    decisions: BUSINESS_DECISIONS.slice(353, 354),
  },
  {
    date: "2026-07-16",
    branch: "cursor/prompt-process-evolution-c954",
    summary:
      "Empty-backlog after PR #305 (commerceOrders createdAt ordering). Free NEXT_STEPS stayed operator/legal-gated. Sibling business-process-evolution-28bd claimed auth-gated-stripe-sessionId-field-length-cap (merged PR #306) — pivoted per AGENT_PROTOCOL to complementary auth-gated opaque id. replyToInquiryAction + updateInquiryStatusAction still accepted uncapped inquiryId before Convex/SQLite / Resend. Shipped parseInquiryId (MAX=128) + action hard-reject + helper/action Vitest + architecture note; folded origin/main (#306) keeping both ITERATIONS; process rotation now prefers remaining auth-gated opaque ids (handoffId / packId / orderId) or a dated clean-audit.",
    shipped: [
      "merge: origin/main (PR #306 auth-gated stripeSessionId length) — keep sibling ITERATION; complementary inquiryId axis",
      "src/lib/inquiries/inquiry-id.ts — MAX_INQUIRY_ID_LENGTH (128) + parseInquiryId (trim + hard-reject over-long; missing/too_long)",
      "src/lib/inquiries/inquiry-id.test.ts — 4 helper regressions",
      "src/app/dashboard/leads/actions.ts — replyToInquiryAction + updateInquiryStatusAction use parseInquiryId before DB/email",
      "src/app/dashboard/leads/reply-to-inquiry-action.test.ts — +2 action regressions (over-long hard-reject skips DB/email; exact-max still looks up)",
      "src/app/dashboard/leads/update-inquiry-status-action.test.ts — +2 action regressions (over-long hard-reject skips write; exact-max still updates)",
      "Docs: architecture.tsx notes inquiryId length hard-reject beside Assign-project id",
      "AGENT_PROTOCOL — auth-gated inquiryId length rule; empty-backlog rotation marks inquiryId + stripeSessionId done; next prefers handoffId/packId/orderId or dated clean-audit",
      "NEXT_STEPS: auth-gated-inquiryId-field-length-cap done; auth-gated-stripe-sessionId-field-length-cap done (28bd / #306)",
      "BUSINESS_DECISIONS — hard-reject inquiryId over inventing an optional aggregate (absolute index 354)",
      "Verified: npm test (1501 passed = main@#306's 1493 + 4 helper + 4 action over-long/exact-max) + lint",
    ],
    // Object-parse by decision text: inquiryId hard-reject owns BD[354].
    decisions: BUSINESS_DECISIONS.slice(354, 355),
  },
  {
    date: "2026-07-16",
    branch: "cursor/prompt-process-evolution-c8f9",
    summary:
      "Empty-backlog after PR #306/#307 (auth-gated stripeSessionId + inquiryId). Free NEXT_STEPS stayed operator/legal-gated. Sibling business-process-evolution-f30c claimed auth-gated-lead-slug-field-length-cap (handoffId/packId/orderId are slug-keyed, not client-submitted) — pivoted per AGENT_PROTOCOL to complementary bulk-ingest body size. importLeadsCsvAction still fed uncapped csvText into parseLeadsCsv before MAX_ROWS. Shipped parseCsvImportText (MAX=512_000) + action hard-reject + helper/action Vitest + architecture note; folded origin/main (#308) keeping both ITERATIONS; process rotation now prefers dated clean-audit after slug+CSV body size close.",
    shipped: [
      "src/lib/leads/csv-import.ts — MAX_CSV_IMPORT_TEXT_LENGTH (512_000) + parseCsvImportText (length-before-trim; missing/too_long; never truncate)",
      "src/lib/leads/csv-import.test.ts — +4 helper regressions (missing/too_long/exact-max/preserve whitespace)",
      "src/app/dashboard/leads/actions.ts — importLeadsCsvAction uses parseCsvImportText before parseLeadsCsv",
      "src/app/dashboard/leads/import-leads-csv-action.test.ts — +2 action regressions (over-long hard-reject skips parse/upsert; exact-max still imports)",
      "Docs: architecture.tsx notes csvText length hard-reject beside per-cell CSV caps",
      "AGENT_PROTOCOL — csv-import-text-length-cap rule; empty-backlog rotation marks handoffId/packId/orderId as slug-keyed + CSV body done; next prefers dated clean-audit",
      "merge: origin/main (PR #308 auth-gated lead-slug length) — keep sibling ITERATION; complementary CSV body axis",
      "NEXT_STEPS: csv-import-text-length-cap done; auth-gated-lead-slug-field-length-cap done (f30c / #308)",
      "BUSINESS_DECISIONS — hard-reject CSV body size over inventing an optional aggregate (absolute index 356)",
      "Verified: npm test (1515 passed = main@#308's 1509 + 4 helper + 2 action over-long/exact-max) + lint",
    ],
    // Object-parse by decision text: csvText hard-reject owns BD[356].
    decisions: BUSINESS_DECISIONS.slice(356, 357),
  },


  {
    date: "2026-07-16",
    branch: "cursor/business-process-evolution-f30c",
    summary:
      "Empty-backlog after PR #306/#307 (auth-gated stripeSessionId + inquiryId). Free NEXT_STEPS stayed operator/legal-gated. Scanned stuck CLI remotes (clean-audit-only / already-merged) and same-window sibling prompt-process-evolution-c8f9 (no remote claim yet). AGENT_PROTOCOL named remaining auth-gated opaque ids (handoffId / packId / orderId), but dashboard actions key handoffs/packs/orders by lead slug — 18 slug-taking actions still accepted uncapped slug after inquiryId/sessionId/vercelProjectId closed. Shipped parseLeadSlugLookup (MAX=63) + wired all 18 actions; commerce Buy now wraps the shared helper; Vitest + architecture note; process rotation now prefers dated clean-audit / free-text soft-caps / stuck CLI fold.",
    shipped: [
      "src/lib/leads/slug.ts — parseLeadSlugLookup + MAX_LEAD_SLUG_LENGTH hard-reject (trim; missing/too_long; never soft-cap)",
      "src/lib/leads/slug.test.ts — +4 parseLeadSlugLookup regressions",
      "src/lib/commerce/checkout-fields.ts — parseCommerceCheckoutSlug wraps shared parseLeadSlugLookup",
      "src/app/dashboard/leads/actions.ts — 18 slug-keyed actions use parseLeadSlugLookup before DB/Stripe/email",
      "src/app/dashboard/leads/mark-handoff-live-action.test.ts — +2 over-long / exact-max regressions",
      "src/app/dashboard/leads/send-follow-up-action.test.ts — +1 over-long regression",
      "src/app/dashboard/leads/update-lead-stage-action.test.ts — +1 over-long regression",
      "Docs: architecture.tsx notes auth-gated lead-slug hard-reject beside inquiryId / Assign-project",
      "AGENT_PROTOCOL — auth-gated lead-slug lookup rule; empty-backlog rotation marks slug residual done",
      "NEXT_STEPS: auth-gated-lead-slug-field-length-cap done",
      "BUSINESS_DECISIONS — hard-reject auth-gated lead slug over inventing an optional aggregate (absolute index 355)",
      "Verified: npm test (1509 passed = main@#307's 1501 + 4 helper + 2 mark-handoff over-long/exact-max + 1 follow-up + 1 stage over-long) + lint",
    ],
    // Object-parse by decision text: auth-gated lead-slug hard-reject owns BD[355].
    decisions: BUSINESS_DECISIONS.slice(355, 356),
  },
  {
    date: "2026-07-16",
    branch: "cursor/prompt-process-evolution-8cf6",
    summary:
      "Empty-backlog after PR #308/#309 (auth-gated lead-slug + CSV body size). Free NEXT_STEPS stayed operator/legal-gated. Same-window sibling business-process-evolution-5d8e had no remote claim yet; stuck CLI remotes were clean-audit-only / already-merged. AGENT_PROTOCOL residual auth-gated free-text after opaque-id + csvText close: importLeadsCsvAction + addLeadAction still persisted uncapped dataSource tags. Shipped normalizeLeadDataSource (MAX=64) + wired CSV parse + Add lead; helper/action Vitest + architecture note; process rotation now prefers dated clean-audit / inquiry-reply body soft-cap / use-server export-type fold.",
    shipped: [
      "src/lib/leads/create-fields.ts — MAX_LEAD_DATA_SOURCE_LENGTH (64) + normalizeLeadDataSource (trim; soft-cap; blank → fallback)",
      "src/lib/leads/create-fields.test.ts — +4 normalizeLeadDataSource regressions",
      "src/lib/leads/csv-import.ts — parseLeadsCsv uses normalizeLeadDataSource for batch tag",
      "src/lib/leads/csv-import.test.ts — +1 over-long dataSource soft-cap regression",
      "src/app/dashboard/leads/actions.ts — addLeadAction soft-caps dataSource before upsert",
      "src/app/dashboard/leads/add-lead-action.test.ts — +1 over-long dataSource soft-cap action regression",
      "src/app/dashboard/leads/import-leads-csv-action.test.ts — +1 over-long dataSource soft-cap action regression",
      "Docs: architecture.tsx notes dataSource soft-cap beside csvText hard-reject",
      "AGENT_PROTOCOL — csv-import-dataSource-field-length-cap rule; empty-backlog rotation marks dataSource done; next prefers dated clean-audit / inquiry-reply body / use-server export-type fold",
      "NEXT_STEPS: csv-import-dataSource-field-length-cap done",
      "BUSINESS_DECISIONS — soft-cap dataSource tag over inventing an optional aggregate (absolute index 357)",
      "Verified: npm test (1522 passed = main@#309's 1515 + 4 helper + 1 csv-import + 1 add-lead + 1 import-csv soft-cap) + lint",
    ],
    // Object-parse by decision text: dataSource soft-cap owns BD[357].
    decisions: BUSINESS_DECISIONS.slice(357, 358),
  },
  {
    date: "2026-07-16",
    branch: "cursor/business-process-evolution-5d8e",
    summary:
      "Empty-backlog after PR #310 (csv-import-dataSource-field-length-cap). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI opencode/dev-work-use-server-export-cleanup had a complete type-only hygiene body with no open PR — folded per AGENT_PROTOCOL before inventing a clean-audit. Dropped inline `export type` aliases from dashboard \"use server\" files (local return annotations only). Complementary free-text audit confirmed inquiry reply / operator notes / commerce SKU / create-path + dataSource already capped. Tightened +1 ITERATIONS decision-slice drift on the openedAt→dataSource chain via object-parse; process rotation now prefers a dated clean-audit on Convex API map / marker-after-unchecked-await / public marketing OUTPUT indexing.",
    shipped: [
      "fold: origin/opencode/dev-work-use-server-export-cleanup — drop inline export type aliases from \"use server\" files (no open PR)",
      "src/app/dashboard/actions.ts — BootstrapStripePricesActionResult export type → type (local return annotation)",
      "src/app/dashboard/leads/actions.ts — ImportLeadsCsvResult export type → type (local return annotation)",
      "Clean free-text audit: normalizeInquiryReply / normalizeOperatorNotes / normalizeCommerceItems / create-path + dataSource already capped — no new soft-cap residual",
      "Process: re-verified ITERATIONS[].decisions ownership via tsx import; tightened +1 drift on 67b2→8cf6 slices so each owns its absolute BUSINESS_DECISIONS index",
      "AGENT_PROTOCOL — inline export type aliases must drop export; empty-backlog rotation marks use-server hygiene + free-text soft-caps done",
      "NEXT_STEPS: use-server-export-type-cleanup done",
      "BUSINESS_DECISIONS — fold use-server export-type hygiene over inventing an optional aggregate (absolute index 358)",
      "Verified: npm test (1522 passed, unchanged — type-only hygiene) + lint",
    ],
    // Object-parse by decision text: use-server export-type cleanup owns BD[358].
    decisions: BUSINESS_DECISIONS.slice(358, 359),
  },
  {
    date: "2026-07-16",
    branch: "cursor/prompt-process-evolution-e626",
    summary:
      "Empty-backlog after PR #311 (use-server-export-type-cleanup). Free NEXT_STEPS stayed operator/legal-gated. Same-window sibling business-process-evolution-7e91 claimed complementary preview-page-uncapped-listOrders — both axes kept. Dated clean-audit of Convex API map + durable-marker-after-unchecked-await + public marketing OUTPUT indexing came back clean. Residual free-text after operator INPUT caps: marketing + client-voice parseVariantsJson still persisted uncapped LLM title/body/cta (hashtags only sliced count). Soft-capped via shared src/lib/packs/variant-fields.ts; Vitest + architecture note; process rotation now prefers LLM OUTPUT soft-caps after INPUT caps + clean axes 1–3 before inventing another dated clean-audit.",
    shipped: [
      "src/lib/packs/variant-fields.ts — MAX_PACK_VARIANT_* + softCap helpers (title 200 / body 8000 / cta 300 / hashtag 64)",
      "src/lib/packs/variant-fields.test.ts — helper regressions",
      "src/lib/marketing/generators.ts — parseVariantsJson soft-caps title/body/cta/hashtags",
      "src/lib/voice/generators.ts — parseVariantsJson soft-caps title/body/cta",
      "src/lib/marketing/generators.test.ts + src/lib/voice/generators.test.ts — +2 over-long soft-cap Anthropic parse regressions",
      "Docs: architecture.tsx notes pack variant soft-caps beside marketing/voice generate",
      "AGENT_PROTOCOL — LLM pack variant soft-cap rule; empty-backlog rotation marks INPUT free-text + pack OUTPUT done; next prefers sibling listOrders fold / dated clean-audit",
      "NEXT_STEPS: marketing-voice-pack-variant-field-length-cap done",
      "BUSINESS_DECISIONS — soft-cap LLM pack variants over inventing an optional aggregate (absolute index 359)",
      "Verified: npm test (1533 passed = main@#311's 1522 + 9 variant-fields helper + 1 marketing soft-cap + 1 voice soft-cap) + lint",
    ],
    // Object-parse by decision text: LLM pack variant soft-cap owns BD[359].
    decisions: BUSINESS_DECISIONS.slice(359, 360),
  },
  {
    date: "2026-07-16",
    branch: "cursor/business-process-evolution-7e91",
    summary:
      "Empty-backlog after PR #311 (use-server-export-type-cleanup). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were clean-audit-only / already-merged / invent-optional-aggregate (opencode workNextCount — rejected). Same-window sibling prompt-process-evolution-e626 shipped complementary marketing-voice-pack-variant-field-length-cap (merged PR #312) — both axes kept via merge. Fresh sold-capability audit found public /preview/[slug] always called listOrders() (full ledger) before leadEligibleForCommerceCatalog's stage short-circuit. Shipped loadPreviewCommerceItems stage gate + listOrdersByLeadSlug (Convex by_leadSlug + SQLite WHERE, static API map registration) + Vitest + architecture note; process rotation now prefers sold SSR hot-path ledger scoping / dated clean-audit over optional aggregates.",
    shipped: [
      "merge: origin/main (PR #312 marketing-voice-pack-variant-field-length-cap) — keep sibling ITERATION; complementary preview listOrders axis",
      "convex/orders.ts — listByLeadSlug query (by_leadSlug + createdAt desc)",
      "src/lib/db.ts — listOrdersByLeadSlug + orders.listByLeadSlug on static API map; mapConvexOrderProps shared with listOrders",
      "src/lib/commerce/preview-commerce.ts (+ test) — loadPreviewCommerceItems stage-gates before slug-scoped orders/catalog",
      "src/app/preview/[slug]/page.tsx — uses loadPreviewCommerceItems (never listOrders full ledger)",
      "Docs: architecture.tsx notes preview commerce stage-gate + slug-scoped orders",
      "AGENT_PROTOCOL — preview must not full-ledger listOrders; dual-backend ordering names orders.listByLeadSlug",
      "NEXT_STEPS: preview-page-uncapped-listOrders done; marketing-voice-pack-variant-field-length-cap done (e626 / #312)",
      "BUSINESS_DECISIONS — stage-gate + slug-scope preview orders over inventing an optional aggregate (absolute index 360)",
      "Verified: npm test (1541 passed = main@#312's 1533 + 8 preview-commerce stage/slug-scope regressions) + lint",
    ],
    // Object-parse by decision text: preview listOrders stage-gate owns BD[360].
    decisions: BUSINESS_DECISIONS.slice(360, 361),
  },
  {
    date: "2026-07-16",
    branch: "cursor/prompt-process-evolution-a070",
    summary:
      "Empty-backlog after PR #312/#313 (LLM pack soft-caps + preview listOrders). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were clean-audit-only / already-merged. Fresh sold-OUTPUT audit found PR #312 closed only Anthropic parseVariantsJson — StubMarketingGenerator / StubClientVoiceGenerator still emitted uncapped title/body/cta/hashtags into upsert + skipSuppression email (voice services.join at create-path max exceeds BODY). Soft-capped stubVariant via the same variant-fields helpers. Build verification also found PR #313 barrel regression: @/lib/commerce re-exported loadPreviewCommerceItems into leads-client's client graph — dropped barrel export; process now requires build after db-touching SSR helpers.",
    shipped: [
      "src/lib/marketing/generators.ts — stubVariant soft-caps title/body/cta/hashtags via variant-fields",
      "src/lib/voice/generators.ts — stubVariant soft-caps title/body/cta (services_faq body overflow path)",
      "src/lib/marketing/generators.test.ts — +1 create-path-max stub soft-cap regression",
      "src/lib/voice/generators.test.ts — +1 services.join body soft-cap regression",
      "src/lib/commerce/index.ts — drop loadPreviewCommerceItems barrel re-export (PR #313 next-build break)",
      "Docs: architecture.tsx notes stub + Anthropic soft-caps on marketing/voice OUTPUT",
      "AGENT_PROTOCOL — stub/fallback twin rule; commerce barrel must not re-export db-touching preview helper",
      "NEXT_STEPS: marketing-voice-pack-stub-variant-field-length-cap + commerce-barrel-preview-commerce-server-only done",
      "BUSINESS_DECISIONS — soft-cap stub pack variants (absolute index 361) + drop commerce barrel re-export (absolute index 362)",
      "Verified: npm test (1543 passed = main@#313's 1541 + 1 marketing stub soft-cap + 1 voice services.join soft-cap) + lint + build",
    ],
    // Object-parse by decision text: stub=361 + barrel=362 (followthrough=363 owned by 338b).
    decisions: BUSINESS_DECISIONS.slice(361, 363),
  },
  {
    date: "2026-07-16",
    branch: "cursor/business-process-evolution-338b",
    summary:
      "Empty-backlog after PR #313 (preview-page-uncapped-listOrders). Free NEXT_STEPS stayed operator/legal-gated. Same-window sibling prompt-process-evolution-a070 shipped complementary stub pack soft-caps + commerce barrel fix (merged PR #314) — both axes kept via merge. Fresh sold-capability audit found createBillingPortalForLead + six per-lead dashboard eligibility actions still full-ledger listOrders().filter(slug) after listOrdersByLeadSlug shipped. Wired the indexed helper on those paths; digest/dashboard aggregates keep listOrders(). Process rotation now prefers followthrough on newly-shipped indexed list* helpers before inventing another dated clean-audit.",
    shipped: [
      "merge: origin/main (PR #314 stub pack soft-caps + commerce barrel) — keep sibling ITERATION; complementary listOrders followthrough",
      "src/lib/billing/create-portal-session.ts — listOrdersByLeadSlug for Manage billing",
      "src/lib/billing/create-portal-session.test.ts — mock + assert slug-scoped fetch",
      "src/app/dashboard/leads/actions.ts — listOrdersByLeadSlug for upsell / marketing / commerce / voice eligibility",
      "Action tests — eligibility suites assert listOrdersByLeadSlug(slug); digest keeps listOrders",
      "Docs: architecture.tsx notes Manage billing + dashboard eligibility slug-scope",
      "AGENT_PROTOCOL — followthrough rule after shipping indexed list* helpers",
      "NEXT_STEPS: slug-scoped-listOrders-followthrough done; stub + commerce-barrel done (a070 / #314)",
      "BUSINESS_DECISIONS — wire listOrdersByLeadSlug on auth-gated slug twins (absolute index 363)",
      "Verified: npm test (1543 passed, unchanged vs main@#314 — eligibility mocks retargeted; no net new cases) + lint",
    ],
    // Object-parse by decision text: listOrdersByLeadSlug followthrough owns BD[363].
    decisions: BUSINESS_DECISIONS.slice(363, 364),
  },
  {
    date: "2026-07-16",
    branch: "cursor/prompt-process-evolution-a3a8",
    summary:
      "Empty-backlog after PR #314/#315 (stub pack soft-caps + slug-scoped listOrders followthrough). Free NEXT_STEPS stayed operator/legal-gated. Same-window sibling business-process-evolution-18d9 claimed complementary preview-jsonld-indexable-only (merged PR #316) — both axes kept via merge. Stuck CLI remotes were clean-audit-only / already-merged. Fresh sold-OUTPUT audit found generate soft-caps closed Anthropic parse + stub before upsert, but Email pack / Email voice pack + Convex-primary get* still emitted already-stored uncapped variants under skipSuppression. Soft-capped via softCapPackVariantFields at deliver HTML + SQLite parse + Convex read; Vitest + architecture note; tightened ITERATIONS slice drift; process rotation now requires deliver/read twin after generate soft-caps.",
    shipped: [
      "merge: origin/main (PR #316 preview-jsonld-indexable-only) — keep sibling ITERATION; complementary pack deliver soft-cap",
      "src/lib/packs/variant-fields.ts — softCapPackVariantFields (+ SoftCappablePackVariantFields)",
      "src/lib/packs/variant-fields.test.ts — helper regressions for persist/read shapes",
      "src/lib/marketing/deliver-pack.ts + voice/deliver-pack.ts — soft-cap at skipSuppression HTML format",
      "src/lib/marketing/sqlite-row-mapping.ts — parsePackVariants + softCapMarketingPack",
      "src/lib/voice/sqlite-row-mapping.ts — parseClientVoiceVariants + softCapClientVoicePack",
      "src/lib/db.ts — Convex get/list pack paths soft-cap (bypass sqlite parsers)",
      "deliver-pack + sqlite-row-mapping tests — over-long persist/read/deliver regressions",
      "Docs: architecture.tsx notes deliver/read soft-caps beside generate soft-caps",
      "AGENT_PROTOCOL — deliver/read twin rule after generate soft-caps; empty-backlog rotation updated",
      "Process: tightened ITERATIONS decision-slice drift (349–364 ownership clean)",
      "NEXT_STEPS: marketing-voice-pack-deliver-variant-field-length-cap done; preview-jsonld-indexable-only done (18d9 / #316)",
      "BUSINESS_DECISIONS — soft-cap pack deliver/read twin (absolute index 364); sibling JSON-LD gate (365)",
      "Verified: npm test (1552 passed on feature body vs main@#315's 1543; +3 JSON-LD from #316 → 1555 after merge) + lint",
    ],
    // Object-parse by decision text: pack deliver/read owns BD[364]; JSON-LD=365.
    decisions: BUSINESS_DECISIONS.slice(364, 365),
  },
  {
    date: "2026-07-16",
    branch: "cursor/business-process-evolution-18d9",
    summary:
      "Empty-backlog after PR #315 (slug-scoped-listOrders-followthrough). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were clean-audit-only / invent-optional-aggregate (workNextCount) / dead Convex orders.createOrder map orphans — rejected. Fresh public marketing OUTPUT audit found /preview/[slug] still always embedded LocalBusiness JSON-LD after sitemap + robots shared isLeadPreviewIndexable. Shipped leadPreviewJsonLdIfIndexable + page gate + Vitest + architecture note; process now treats JSON-LD as a third consent surface beside sitemap/robots.",
    shipped: [
      "src/lib/seo.ts — leadPreviewJsonLdIfIndexable (null when !isLeadPreviewIndexable); predicate docs cover JSON-LD twin",
      "src/app/preview/[slug]/page.tsx — emit JSON-LD script only when indexable",
      "src/lib/seo.test.ts — +3 leadPreviewJsonLdIfIndexable regressions (paid/demo/cold)",
      "Docs: architecture.tsx — sitemap + robots + JSON-LD share isLeadPreviewIndexable",
      "AGENT_PROTOCOL — JSON-LD must share indexable predicate; reject workNextCount + dead orders.* API-map orphans",
      "NEXT_STEPS: preview-jsonld-indexable-only done",
      "BUSINESS_DECISIONS — gate preview JSON-LD on indexable consent (absolute index 365)",
      "Verified: npm test (1546 passed = main@#315's 1543 + 3 leadPreviewJsonLdIfIndexable regressions) + lint",
    ],
    // Object-parse by decision text: JSON-LD indexable owns BD[365]; pack deliver=364.
    decisions: BUSINESS_DECISIONS.slice(365, 366),
  },
  {
    date: "2026-07-16",
    branch: "cursor/prompt-process-evolution-a3a8",
    summary:
      "Empty-backlog after PR #316/#317 (JSON-LD indexable + pack deliver/read soft-caps). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were clean-audit-only / already-merged (preview-index, convex order parity, snooze, optimistic-state). Fresh sold-capability audit found public Buy now hard-rejects skuId over 64, but auth-gated normalizeCommerceItems still trim+slice(0,64) — truncating distinct operator-supplied SKU ids can collide preserveCommerceStripeIds / Sync-to-Stripe. Shipped shared MAX_COMMERCE_SKU_ID_LENGTH + hard-reject on catalog save; Vitest + architecture note; process now requires auditing the auth-gated write twin after a public opaque-id hard-reject.",
    shipped: [
      "src/lib/commerce/types.ts — MAX_COMMERCE_SKU_ID_LENGTH=64 (shared opaque ceiling)",
      "src/lib/commerce/catalog.ts — normalizeCommerceItems hard-rejects over-long ids (never slice)",
      "src/lib/commerce/checkout-fields.ts — MAX_COMMERCE_CHECKOUT_SKU_ID_LENGTH aliases shared constant",
      "src/lib/commerce/catalog.test.ts — +2 hard-reject / mint-under-ceiling regressions",
      "src/app/dashboard/leads/save-commerce-catalog-action.test.ts — +1 action-level over-long id gate",
      "Docs: architecture.tsx notes Save catalog + Buy now share opaque SKU id hard-reject",
      "AGENT_PROTOCOL — public opaque-id hard-reject → audit auth-gated write twin",
      "NEXT_STEPS: commerce-catalog-skuId-field-length-cap done",
      "BUSINESS_DECISIONS — hard-reject over-long catalog SKU ids (absolute index 366)",
      "Verified: npm test (1558 passed = main@#317's 1555 + 2 catalog normalize + 1 save-action regressions) + lint",
    ],
    // Object-parse by decision text: catalog SKU hard-reject owns BD[366]; JSON-LD=365; API src-utm=367.
    decisions: BUSINESS_DECISIONS.slice(366, 367),
  },
  {
    date: "2026-07-16",
    branch: "cursor/business-process-evolution-ba14",
    summary:
      "Empty-backlog after commerce-catalog-skuId-field-length-cap on main. Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were clean-audit-only / already-merged. Fresh public-write residual twin of preview-open-openedAt: POST /api/preview/[slug]/open still fed uncapped src/utm_source query params into shouldRecordPreviewOpen. Bounded via resolvePreviewOpenAttrParam (MAX=32, over-long → missing); Vitest + architecture note; process now requires scanning residual optional query params after bounding an optional beacon body field.",
    shipped: [
      "src/lib/leads/preview-open.ts — MAX_PREVIEW_OPEN_ATTR_PARAM_LENGTH=32 + resolvePreviewOpenAttrParam (over-long → null)",
      "src/app/api/preview/[slug]/open/route.ts — bound src/utm_source before shouldRecordPreviewOpen",
      "src/lib/leads/preview-open.test.ts — +3 attr-param helper regressions",
      "src/app/api/preview/[slug]/open/route.test.ts — +3 over-long src/utm_source route regressions (not_attributed + stage still records)",
      "Docs: architecture.tsx notes src/utm_source bound beside openedAt",
      "AGENT_PROTOCOL — preview-open src/utm fall-back rule; empty-backlog rotation marks src-utm done",
      "NEXT_STEPS: preview-open-src-utm-field-length-cap done",
      "BUSINESS_DECISIONS — bound preview-open src/utm_source over inventing an optional aggregate (absolute index 367)",
      "Verified: npm test (1564 passed = main@a3a8's 1558 + 3 attr-param helper + 3 route regressions) + lint",
    ],
    // Object-parse by decision text: API src/utm owns BD[367]; page twin=368.
    decisions: BUSINESS_DECISIONS.slice(367, 368),
  },
  {
    date: "2026-07-16",
    branch: "cursor/prompt-process-evolution-2607",
    summary:
      "Empty-backlog after PR #318 (preview-open-src-utm API bound). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were clean-audit-only / already-merged. Fresh public-write residual: GET /preview/[slug] still passed uncapped src/utm_source searchParams into PreviewOpenBeacon — trackByStage re-emitted multi-KB attribution on the beacon fetch URL. Bounded via resolvePreviewOpenAttrParam on the page + buildPreviewOpenBeaconPath / shouldFirePreviewOpenBeacon helpers; Vitest + architecture note; restored ITERATIONS decision-slice ownership off-by-one chain (proxy-host→page src-utm) so page owns BD[369], API src-utm BD[368], catalog SKU BD[367], JSON-LD BD[366].",
    shipped: [
      "src/lib/leads/preview-open.ts — shouldFirePreviewOpenBeacon + buildPreviewOpenBeaconPath (omit over-long attrs)",
      "src/app/preview/[slug]/page.tsx — resolvePreviewOpenAttrParam before PreviewOpenBeacon",
      "src/components/preview/preview-open-beacon.tsx — use bounded path builder",
      "src/lib/leads/preview-open.test.ts — +7 page-twin / beacon path regressions",
      "Docs: architecture.tsx notes SSR page + beacon path bound beside API route",
      "AGENT_PROTOCOL — after API query-param bounds, audit SSR page twin that forwards into client beacon/fetch",
      "Process: restored absolute BD ownership off-by-one cascade via decision-text match; page owns BD[368]",
      "AGENT_PROTOCOL — when tightening ITERATIONS slices, verify by decision text / indexOf, never trust prior slice comments",
      "NEXT_STEPS: preview-page-src-utm-field-length-cap done",
      "BUSINESS_DECISIONS — bound preview page src/utm over inventing an optional aggregate / clean-audit skip (absolute index 368)",
      "Verified: npm test (1571 passed on feature body) + slice ownership clean",
    ],
    // Object-parse by decision text: page src/utm owns BD[368]; API src-utm=367.
    decisions: BUSINESS_DECISIONS.slice(368, 369),
  },
  {
    date: "2026-07-16",
    branch: "cursor/prompt-process-evolution-6ba0",
    summary:
      "Empty-backlog after PR #319 (preview-page-src-utm-field-length-cap). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were clean-audit-only / already-merged (use-server, password-trim, vercel-id, digest-age already on main under different SHAs). Fresh audit of Convex API map + durable-marker-after-unchecked-await + public optional query/body + auth-gated free-text + SSR page twins + pack deliver/read soft-caps came back clean. Shipped durable Vitest (convex-api-map-audit) that diffs convex/*.ts public query/mutation exports vs db.ts static `const api` map (allowlisting only deliberate orders.createOrder / getByStripeSessionId orphans) so a missing registration cannot silently split-brain again. Process now prefers that lock over a 3rd identical map/marker prose audit.",
    shipped: [
      "src/lib/db/convex-api-map-audit.ts — listPublicConvexExports / listRegisteredConvexApiPaths / auditConvexApiMap + DELIBERATE_CONVEX_API_ORPHANS",
      "src/lib/db/convex-api-map-audit.test.ts — unit + repo-level map completeness regressions (7 tests)",
      "Docs: architecture.tsx notes durable Convex API map Vitest beside server-only db testability",
      "AGENT_PROTOCOL — after dated map/marker clean pass, lock with Vitest; rotate off identical prose audits",
      "NEXT_STEPS: clean-audit-2026-07-16-convex-map-marker-await done",
      "BUSINESS_DECISIONS — lock Convex API map with Vitest after clean pass (absolute index 369; object-parse)",
      "Verified: npm test (1578 passed = main@#319's 1571 + 7 convex-api-map-audit regressions) + lint",
    ],
    // Object-parse by decision text: map Vitest owns BD[369]; page src-utm=368.
    decisions: BUSINESS_DECISIONS.slice(369, 370),
  },
  {
    date: "2026-07-16",
    branch: "cursor/business-process-evolution-44bd",
    summary:
      "Empty-backlog after PR #319 (preview-page-src-utm). Free NEXT_STEPS stayed operator/legal-gated. Sibling prompt-process-evolution-6ba0 claimed complementary clean-audit-2026-07-16-convex-map-marker-await (merged PR #320) — pivoted to public whole-body JSON byte bounds; both axes kept via merge. Stuck CLI remotes were clean-audit-only / invent-optional-aggregate (workNextCount) / dead orders.createOrder orphans — rejected. Fresh public-write residual: field-level caps still ran after unbounded request.json()/formData(). Shipped readJsonBodyWithByteLimit (MAX=32_768) on stripe/commerce checkout, billing-portal, contact, preview-open, marketing/generate; Vitest + architecture note; process now prefers whole-body byte bounds after per-field sinks close.",
    shipped: [
      "merge: origin/main (PR #320 Convex API map Vitest lock) — keep sibling ITERATION; complementary public JSON body byte cap",
      "src/lib/security/json-body.ts — MAX_PUBLIC_JSON_BODY_BYTES=32768 + contentLengthExceedsLimit + readJsonBodyWithByteLimit",
      "src/lib/security/json-body.test.ts — helper regressions (Content-Length / byteLength / exact-max / empty / invalid)",
      "src/app/api/stripe/checkout/route.ts + commerce/checkout + billing-portal — hard-reject over-long JSON before Stripe",
      "src/app/api/contact/[slug]/route.ts — bound JSON/form Content-Length before CRM lookup",
      "src/app/api/preview/[slug]/open/route.ts — hard-reject over-long beacon JSON (empty still ok)",
      "src/app/api/marketing/generate/route.ts — same bound (auth not a size throttle when password unset)",
      "Route tests — +1 over-long body regression each (checkout / commerce / portal / contact / preview-open / marketing)",
      "Docs: architecture.tsx notes whole-body byte bound beside field-level caps",
      "AGENT_PROTOCOL — public JSON body byte-length rule; empty-backlog rotation marks axis done",
      "NEXT_STEPS: public-json-body-byte-length-cap done; clean-audit-2026-07-16-convex-map-marker-await done (6ba0 / #320)",
      "BUSINESS_DECISIONS — hard-reject over-long public JSON bodies (absolute index 370; sibling map Vitest owns 369)",
      "Verified: npm test (1594 passed = main@#320's 1578 + 16 body-byte-limit regressions) + lint after fold",
    ],
    // Object-parse by decision text: public JSON body owns BD[370]; map Vitest=369.
    decisions: BUSINESS_DECISIONS.slice(370, 371),
  },
  {
    date: "2026-07-16",
    branch: "cursor/prompt-process-evolution-15d6",
    summary:
      "Empty-backlog after PR #321 (public-json-body-byte-length-cap). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were clean-audit-only / invent-optional-aggregate / already-merged — rejected. Fresh public-write residual twin: contact JSON path arrayBuffer-bounds, but form-urlencoded/multipart still only Content-Length-prechecked then unbounded request.formData() when the header was missing or understated. Shipped readFormBodyWithByteLimit (shared MAX_PUBLIC_REQUEST_BODY_BYTES) on contact; Vitest + architecture note; process now requires closing the FormData twin after a public JSON whole-body bound.",
    shipped: [
      "src/lib/security/json-body.ts — readFormBodyWithByteLimit + MAX_PUBLIC_REQUEST_BODY_BYTES alias + shared readBoundedArrayBuffer",
      "src/lib/security/json-body.test.ts — FormData helper regressions (Content-Length / missing-CL byteLength / exact-max / empty)",
      "src/app/api/contact/[slug]/route.ts — form-urlencoded/multipart via readFormBodyWithByteLimit before CRM lookup",
      "src/app/api/contact/[slug]/route.test.ts — +1 over-long form-urlencoded body regression (no Content-Length)",
      "Docs: architecture.tsx notes FormData twin beside JSON whole-body bound",
      "AGENT_PROTOCOL — public FormData body byte-length rule; empty-backlog rotation marks twin done",
      "NEXT_STEPS: public-formdata-body-byte-length-cap done",
      "BUSINESS_DECISIONS — hard-reject over-long public FormData bodies (absolute index 371)",
      "Process: tightened #320/#321/#322 ITERATIONS decision slices via object-parse (map=370, JSON=371, FormData=372)",
      "Verified: npm test (1601 passed = main@#321's 1594 + 7 FormData body-byte regressions) + lint",
    ],
    // Object-parse by decision text: FormData owns BD[371]; JSON=370; map Vitest=369.
    decisions: BUSINESS_DECISIONS.slice(371, 372),
  },
  {
    date: "2026-07-16",
    branch: "cursor/business-process-evolution-7508",
    summary:
      "Empty-backlog after PR #321; sibling prompt-process-evolution-15d6 shipped public-formdata-body-byte-length-cap (merged PR #322). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were clean-audit-only / invent-optional-aggregate / already-merged — rejected. Fresh money-path residual: POST /api/stripe/checkout rejects unknown tiers via getBundle, but checkout.session.completed treated any truthy metadata.tier as valid — recorded payment/handoff and interpolated raw tier into receipt HTML (businessName escaped only). Shipped getBundle gate before recordLeadPayment / handoff (skip like missing slug/tier; no forever-5xx), escapeHtmlForEmail + catalog display name in sendReceiptEmail; Vitest + architecture note; process now requires webhook enum parity with checkout create.",
    shipped: [
      "merge: origin/main (PR #322 public FormData body bound) — keep sibling ITERATION; complementary bundle webhook tier enum guard",
      "src/app/api/stripe/webhook/route.ts — getBundle(tier) before recordLeadPayment / handoff / receipt; unknown tier warns + skips",
      "src/app/api/stripe/webhook/route.test.ts — +2 unknown/wrong-case tier regressions; known-tier asserts canonical id on payment+handoff",
      "src/lib/email/resend.ts — escapeHtmlForEmail on receipt tier; prefer getBundle(tier).name display",
      "src/lib/email/resend.test.ts — free-text tier escape + Growth display-name regressions",
      "Docs: architecture.tsx notes webhook tier enum gate beside checkout create",
      "AGENT_PROTOCOL — bundle webhook must mirror getBundle before fulfillment writes",
      "NEXT_STEPS: bundle-webhook-tier-enum-guard done; public-formdata-body-byte-length-cap done (15d6 / #322)",
      "BUSINESS_DECISIONS — require getBundle(tier) on bundle webhook + escape receipt tier (absolute index 372)",
      "Process: tightened map/JSON/FormData ITERATIONS slices via object-parse (370/371/372) before appending ours",
      "Verified: npm test (1604 passed = main@#322's 1601 + 3 tier-enum/receipt-escape regressions) + lint after fold",
    ],
    // Object-parse by decision text: tier enum owns BD[372]; FormData=371; JSON=370; map=369.
    decisions: BUSINESS_DECISIONS.slice(372, 373),
  },
  {
    date: "2026-07-16",
    branch: "cursor/prompt-process-evolution-ffdb",
    summary:
      "Empty-backlog after PR #323 (bundle-webhook-tier-enum-guard). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were invent-optional-aggregate (workNextCount) / clean-audit-only / already-merged — rejected. Fresh money-path residual twin of bundle getBundle: POST /api/commerce/checkout 404s when skuId is not in the lead catalog, but checkout.session.completed commerce_sku still accepted any truthy skuId and fell back to \"Catalog item\" for ledger/inquiry/client receipt. Shipped parseCommerceCheckoutSkuId + catalog membership gate before insertCommerceOrder / side effects (unknown/over-long skips like missing skuId); Vitest + architecture note; process now requires Commerce webhook catalog parity after Buy now create.",
    shipped: [
      "src/app/api/stripe/webhook/route.ts — parseCommerceCheckoutSkuId + catalog item membership before commerce ledger/inquiry/receipt; no Catalog item fallback",
      "src/app/api/stripe/webhook/route.test.ts — +3 unknown/over-long/missing-catalog regressions; missing skuId asserts catalog not loaded",
      "Docs: architecture.tsx notes Commerce webhook catalog membership beside Buy now create 404",
      "AGENT_PROTOCOL — Commerce webhook must mirror catalog membership (+ skuId length) before fulfillment writes",
      "NEXT_STEPS: commerce-webhook-sku-catalog-gate done",
      "BUSINESS_DECISIONS — require catalog membership on commerce_sku webhook (absolute index 373)",
      "Verified: npm test (1607 passed = main@#323's 1604 + 3 commerce catalog-gate regressions) + lint",
    ],
    // Object-parse by decision text: commerce catalog gate owns BD[373]; tier enum=372.
    decisions: BUSINESS_DECISIONS.slice(373, 374),
  },
  {
    date: "2026-07-16",
    branch: "cursor/business-process-evolution-c135",
    summary:
      "Empty-backlog after PR #324 (commerce-webhook-sku-catalog-gate). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were invent-optional-aggregate / clean-audit-only / already-merged — rejected. Fresh money-path residual: Buy now create resolves Price from catalog stripePriceId (never trusts client amount), but checkout.session.completed still ledgered session.amount_total for any catalog-known skuId. Shipped amount_total (integer cents) === catalogItem.priceCents gate before ledger/inquiry/client receipt (mismatch/missing skips like unknown skuId); Vitest + architecture note; process now requires amount/Price parity after catalog membership.",
    shipped: [
      "merge: origin/main (PR #324 commerce-webhook-sku-catalog-gate) — keep sibling ITERATION; complementary amount↔priceCents axis",
      "src/app/api/stripe/webhook/route.ts — require integer amount_total === catalogItem.priceCents before commerce ledger/inquiry/receipt",
      "src/app/api/stripe/webhook/route.test.ts — catalog mocks include priceCents; +2 amount mismatch / null amount_total regressions",
      "Docs: architecture.tsx notes Commerce webhook amount↔catalog priceCents beside catalog membership",
      "AGENT_PROTOCOL — Commerce webhook must mirror Buy now create Price (amount_total === priceCents)",
      "NEXT_STEPS: commerce-webhook-amount-catalog-parity done; commerce-webhook-sku-catalog-gate done (ffdb / #324)",
      "BUSINESS_DECISIONS — require amount↔priceCents on commerce_sku webhook (absolute index 374)",
      "Verified: npm test (1609 passed = main@#324's 1607 + 2 amount mismatch/null regressions) + lint",
    ],
    // Object-parse by decision text: commerce amount parity owns BD[374]; catalog membership=373.
    decisions: BUSINESS_DECISIONS.slice(374, 375),
  },
  {
    date: "2026-07-16",
    branch: "cursor/prompt-process-evolution-2ecd",
    summary:
      "Empty-backlog after PR #325 (commerce-webhook-amount-catalog-parity). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were invent-optional-aggregate (workNextCount) / clean-audit-only / already-merged use-server+vercel-id under different SHAs — rejected. Fresh money-path residual: Buy now create hard-rejects over-long slug via parseCommerceCheckoutSlug, but checkout.session.completed commerce_sku still accepted any truthy metadata.slug and burned getLeadBySlug / getCommerceCatalog. Shipped parseCommerceCheckoutSlug before catalog/ledger/side effects (over-long/missing skips like missing skuId); Vitest + architecture note; process now requires slug lookup parity after skuId/catalog/amount gates.",
    shipped: [
      "src/app/api/stripe/webhook/route.ts — parseCommerceCheckoutSlug before commerce CRM/catalog/ledger; over-long/missing warn + skip",
      "src/app/api/stripe/webhook/route.test.ts — +2 over-long slug / trim-before-lookup regressions; missing slug asserts catalog not loaded",
      "Docs: architecture.tsx notes Commerce webhook slug length gate beside skuId/catalog/amount",
      "AGENT_PROTOCOL — Commerce webhook must mirror Buy now create slug hard-reject before fulfillment writes",
      "NEXT_STEPS: commerce-webhook-slug-lookup-gate done",
      "BUSINESS_DECISIONS — require parseCommerceCheckoutSlug on commerce_sku webhook (absolute index 375)",
      "Verified: npm test (1611 passed = main@#325's 1609 + 2 slug-gate regressions) + lint",
    ],
    // Object-parse by decision text: commerce slug lookup owns BD[375]; commerce amount=374.
    decisions: BUSINESS_DECISIONS.slice(375, 376),
  },
  {
    date: "2026-07-16",
    branch: "cursor/business-process-evolution-e067",
    summary:
      "Empty-backlog after PR #326 (commerce-webhook-slug-lookup-gate). Dual-claimed commerce slug with 2ecd (earlier remote claim owned; they shipped #326) — merged main and pivoted to the bundle twin. Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were invent-optional-aggregate / clean-audit-only / already-merged — rejected. Fresh money-path residual: POST /api/stripe/checkout sanitizes+caps slug via resolveBundleCheckoutLeadSlug / sanitizeLeadSlug, but checkout.session.completed bundle path still treated any truthy metadata.slug as the CRM key for recordLeadPayment / handoff / receipt. Shipped parseLeadSlugLookup before fulfillment (over-long/missing skips like unknown tier); Vitest + architecture note; process now requires auditing the bundle slug twin after a Commerce webhook slug gate.",
    shipped: [
      "merge: origin/main (PR #326 commerce-webhook-slug-lookup-gate) — keep sibling ITERATION; pivot from dual-claimed commerce slug",
      "src/app/api/stripe/webhook/route.ts — parseLeadSlugLookup before bundle recordLeadPayment / handoff / receipt; over-long warn + skip",
      "src/app/api/stripe/webhook/route.test.ts — +2 over-long slug / trim-before-lookup regressions",
      "Docs: architecture.tsx notes bundle webhook slug length gate beside getBundle tier enum",
      "AGENT_PROTOCOL — bundle webhook must mirror create-path MAX_LEAD_SLUG_LENGTH; after Commerce slug gate, audit bundle twin",
      "NEXT_STEPS: bundle-webhook-slug-lookup-gate done; commerce-webhook-slug-lookup-gate done (2ecd / #326)",
      "BUSINESS_DECISIONS — require parseLeadSlugLookup on bundle webhook (absolute index 376)",
      "Verified: npm test (1613 passed = main@#326's 1611 + 2 bundle slug-gate regressions) + lint",
    ],
    // Object-parse by decision text: bundle slug lookup owns BD[376]; commerce slug=375.
    decisions: BUSINESS_DECISIONS.slice(376, 377),
  },
  {
    date: "2026-07-16",
    branch: "cursor/prompt-process-evolution-5a8c",
    summary:
      "Empty-backlog after PR #327 (bundle-webhook-slug-lookup-gate). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were invent-optional-aggregate / clean-audit-only / already-merged under different SHAs — rejected. Fresh money-path residual twin of commerce-webhook-amount-catalog-parity: POST /api/stripe/checkout charges only catalog Stripe Price IDs from BUNDLES (+ optional COMMERCE_ADDON), but checkout.session.completed still recorded session.amount_total for any getBundle-known tier. Shipped expectedBundleCheckoutAmountCents + amount_total === expectedCents gate before recordLeadPayment / handoff / receipt (mismatch/missing skips like unknown tier); Vitest + architecture note; process now requires auditing the bundle amount twin after Commerce amount↔priceCents.",
    shipped: [
      "src/lib/pricing/bundles.ts — expectedBundleCheckoutAmountCents(bundle, commerceAddon)",
      "src/lib/pricing/bundles.test.ts — locks starter/growth/complete (+ commerce addon) cents",
      "src/app/api/stripe/webhook/route.ts — require amount_total === expectedCents before bundle fulfillment",
      "src/app/api/stripe/webhook/route.test.ts — growth fixtures use 59900¢; +2 amount mismatch / null regressions",
      "Docs: architecture.tsx notes bundle webhook amount↔catalog cents beside tier/slug gates",
      "AGENT_PROTOCOL — bundle webhook must mirror create-path catalog Price amounts; after Commerce amount parity, audit bundle twin",
      "NEXT_STEPS: bundle-webhook-amount-catalog-parity done",
      "BUSINESS_DECISIONS — require amount↔expectedBundleCheckoutAmountCents on bundle webhook (absolute index 377)",
      "Verified: npm test (1616 passed = main@#327's 1613 + 3 amount-parity regressions) + lint",
      "Process: tightened ITERATIONS decision slices via object-parse (bundle slug=376) before appending ours",
    ],
    // Object-parse by decision text: bundle amount parity owns BD[377]; bundle slug=376.
    decisions: BUSINESS_DECISIONS.slice(377, 378),
  },
  {
    date: "2026-07-16",
    branch: "cursor/business-process-evolution-7155",
    summary:
      "Empty-backlog after PR #327; sibling prompt-process-evolution-5a8c shipped bundle-webhook-amount-catalog-parity (merged PR #328) in the same window — folded both ITERATIONS. Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were invent-optional-aggregate / clean-audit-only / already-merged feature bodies under stale SHAs — rejected. Fresh money-path residual: POST /api/stripe/checkout only sets metadata.commerceAddon when COMMERCE_ADDON Price IDs are on line_items, but checkout.session.completed still trusted metadata.commerceAddon === \"true\" into recordLeadPayment / handoff (and into expectedBundleCheckoutAmountCents) — unlocking catalog + Billing Portal without the charge. Shipped resolveCommerceAddonFromLineItems + listLineItems Price ID parity before amount parity + fulfillment (metadata mismatch logged; list failures 5xx); Vitest + architecture note; process now requires auditing the billing-portal metadata.commerceAddon twin next.",
    shipped: [
      "merge: origin/main (PR #328 bundle-webhook-amount-catalog-parity) — keep sibling ITERATION; derive commerceAddon before amount check",
      "src/lib/payments/commerce-addon-line-items.ts — commerceAddonPriceIdsFromEnv + resolveCommerceAddonFromLineItems + priceIdsFromStripeLineItems",
      "src/lib/payments/commerce-addon-line-items.test.ts — env / both-prices / metadata mismatch / fail-closed regressions",
      "src/app/api/stripe/webhook/route.ts — derive commerceAddon from listLineItems before amount parity + recordLeadPayment / handoff; never trust metadata",
      "src/lib/payments/webhook-fulfillment.ts — bundle_commerce_addon_line_items 5xx step when listLineItems fails",
      "src/app/api/stripe/webhook/route.test.ts — +3 metadata-true-without-prices / line-items-true / listLineItems-5xx regressions (amount fixtures aligned)",
      "Docs: architecture.tsx notes commerceAddon↔line-item Price parity beside amount/slug/tier gates",
      "AGENT_PROTOCOL — bundle webhook must derive commerceAddon from line items before amount parity; audit billing-portal metadata twin next",
      "NEXT_STEPS: bundle-webhook-commerceAddon-line-item-parity done; bundle-webhook-amount-catalog-parity done (5a8c / #328)",
      "BUSINESS_DECISIONS — require listLineItems commerceAddon parity on bundle webhook (absolute index 377; amount parity owns 376)",
      "Verified: npm test + lint after fold",
    ],
    // Object-parse by decision text: webhook commerceAddon line-item parity owns BD[378]; amount parity=377; bundle slug=376.
    decisions: BUSINESS_DECISIONS.slice(378, 379),
  },
  {
    date: "2026-07-17",
    branch: "cursor/business-process-evolution-d518",
    summary:
      "Empty-backlog after PR #329 (bundle-webhook-commerceAddon-line-item-parity). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were invent-optional-aggregate / clean-audit-only / already-merged — rejected. Fresh money-path residual twin: createBillingPortalForCheckoutSession still trusted metadata.commerceAddon for orderEligibleForBillingPortal when mode !== subscription. Shipped listLineItems Price ID parity (reuse resolveCommerceAddonFromLineItems) before eligibility; subscription mode skips the round-trip; list failures 502; Vitest + architecture note; process now points next empty-backlog at stuck CLI fold / escapeHtml·webhook·uncapped / commerce-webhook-currency-usd-gate.",
    shipped: [
      "src/lib/billing/create-portal-session.ts — derive commerceAddon from listLineItems when mode !== subscription; StripeBillingPortalClient.listLineItems",
      "src/lib/billing/create-portal-session.test.ts — +4 forged-metadata / line-items-true / listLineItems-502 / subscription-skips-list regressions",
      "src/app/api/stripe/billing-portal/route.test.ts — mock listLineItems; +1 forged-metadata route regression",
      "Docs: architecture.tsx notes billing-portal commerceAddon↔line-item Price parity beside webhook gate",
      "AGENT_PROTOCOL — portal session path must mirror webhook commerceAddon line-item derive; next prefers currency gate / stuck CLI / escapeHtml·webhook·uncapped",
      "NEXT_STEPS: billing-portal-session-commerceAddon-line-item-parity done",
      "BUSINESS_DECISIONS — require listLineItems commerceAddon parity on billing-portal session path (absolute index 378; webhook line-item parity owns 377)",
      "Process: tightened ITERATIONS decision slices via object-parse (webhook line-item=377) before appending ours",
      "Verified: npm test + lint",
    ],
    // Object-parse by decision text: portal commerceAddon line-item parity owns BD[379]; webhook line-item=378.
    decisions: BUSINESS_DECISIONS.slice(379, 380),
  },
  {
    date: "2026-07-17",
    branch: "cursor/prompt-process-evolution-0329",
    summary:
      "Empty-backlog after PR #329; sibling business-process-evolution-d518 claimed+shipped billing-portal-session-commerceAddon-line-item-parity — folded their branch (keep both ITERATIONS). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were invent-optional-aggregate / clean-audit-only / already-merged — rejected. Complementary sold residual: createBillingPortalForCheckoutSession + loadCheckoutSuccessSession still treated metadata.tier growth|complete as portal-eligible on payment mode (create path never emits that combo). Shipped checkoutSessionEligibleForBillingPortal (subscription OR proven commerceAddon; ignore tier); Vitest + architecture note; process now requires auditing payment-mode metadata.tier trust after commerceAddon line-item parity on the same Session path.",
    shipped: [
      "merge: origin/cursor/business-process-evolution-d518 (portal commerceAddon line-item parity) — keep sibling ITERATION; complementary tier-metadata trust",
      "src/lib/billing/portal.ts — checkoutSessionEligibleForBillingPortal (mode=subscription OR commerceAddon; never metadata.tier)",
      "src/lib/billing/portal.test.ts — +3 payment-mode tier-trust / subscription / commerceAddon regressions",
      "src/lib/billing/create-portal-session.ts — payment-mode eligibility via shared helper (line-item commerceAddon already from d518)",
      "src/lib/billing/create-portal-session.test.ts — +1 forged metadata.tier=growth payment-mode regression",
      "src/lib/checkout/success-session.ts — success CTA uses shared helper (ignore payment-mode tier)",
      "src/lib/checkout/success-session.test.ts — +1 forged growth payment-mode CTA regression",
      "Docs: architecture.tsx notes payment-mode tier ignore beside commerceAddon line-item derive",
      "AGENT_PROTOCOL — payment-mode Session path must ignore metadata.tier; audit after commerceAddon line-item parity",
      "NEXT_STEPS: billing-portal-session-payment-mode-tier-metadata-trust done; billing-portal-session-commerceAddon-line-item-parity done (d518)",
      "BUSINESS_DECISIONS — ignore payment-mode metadata.tier for Session portal eligibility (absolute index 379)",
      "Process: tightened 7155/d518 ITERATIONS decision slices via object-parse (webhook line-item=377, portal=378) before appending ours",
      "Verified: npm test (1639 passed) + lint after fold",
    ],
    // Object-parse by decision text: payment-mode tier trust owns BD[380]; portal commerceAddon line-items=379.
    decisions: BUSINESS_DECISIONS.slice(380, 381),
  },
  {
    date: "2026-07-17",
    branch: "cursor/prompt-process-evolution-1924",
    summary:
      "Empty-backlog after PR #331 (billing-portal-session-payment-mode-tier-metadata-trust). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were invent-optional-aggregate / clean-audit-only / already-merged — rejected. Fresh money-path residual twin: loadCheckoutSuccessSession still used metadata.commerceAddon as a soft SSR hint for showBillingPortal on payment mode, while createBillingPortalForCheckoutSession already derived commerceAddon from listLineItems. Shipped listLineItems Price ID parity (reuse resolveCommerceAddonFromLineItems) before checkoutSessionEligibleForBillingPortal; subscription mode skips the round-trip; list failures fail closed to hide the CTA; Vitest + architecture note; process now requires closing SSR twins when an API path hardens Session entitlement flags.",
    shipped: [
      "src/lib/checkout/success-session.ts — derive commerceAddon from listLineItems when mode !== subscription; injectable listLineItems for tests",
      "src/lib/checkout/success-session.test.ts — +3 forged-metadata / line-items-true / listLineItems-fail-closed / subscription-skips-list regressions",
      "Docs: architecture.tsx notes success-page commerceAddon↔line-item Price parity beside portal API gate",
      "AGENT_PROTOCOL — success SSR must mirror portal listLineItems commerceAddon derive; next prefers currency gate / stuck CLI / escapeHtml·webhook·uncapped",
      "NEXT_STEPS: success-page-commerceAddon-line-item-parity done",
      "BUSINESS_DECISIONS — require listLineItems commerceAddon parity on checkout success SSR (absolute index 380)",
      "Process: object-parse by decision text (portal=378, payment-mode=379) before appending ours",
      "Verified: npm test + lint",
    ],
    // Object-parse by decision text: success-page commerceAddon line-item parity owns BD[381]; payment-mode=380; portal=379.
    decisions: BUSINESS_DECISIONS.slice(381, 382),
  },
  {
    date: "2026-07-17",
    branch: "cursor/business-process-evolution-deb8",
    summary:
      "Empty-backlog after PR #331. Sibling prompt-process-evolution-1924 claimed+merged success-page-commerceAddon-line-item-parity (#332) — folded both ITERATIONS. Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were invent-optional-aggregate / clean-audit-only / already-merged — rejected. Fresh residual: amount↔catalog cents already gated, but checkout.session.completed still ledged amount_total/100 as USD without requiring session.currency===\"usd\". Shipped isStripeCheckoutCurrencyUsd + USD gate before amount parity on commerce_sku and bundle twins; Vitest + architecture note; process now requires auditing currency immediately after amount↔catalog parity.",
    shipped: [
      "merge: origin/main (PR #332 success-page-commerceAddon-line-item-parity) — keep sibling ITERATION; complementary currency gate",
      "src/lib/payments/checkout-currency.ts — CHECKOUT_CURRENCY_USD + isStripeCheckoutCurrencyUsd",
      "src/lib/payments/checkout-currency.test.ts — usd / mixed-case / non-usd / missing regressions",
      "src/app/api/stripe/webhook/route.ts — require currency usd before amount parity on commerce + bundle fulfillment",
      "src/app/api/stripe/webhook/route.test.ts — fixtures default currency usd; +3 commerce/bundle non-usd / missing regressions",
      "Docs: architecture.tsx notes currency usd gate beside amount/slug/tier/commerceAddon gates",
      "AGENT_PROTOCOL — webhook must require usd currency after amount↔catalog; apply commerce+bundle twins same pass; next prefers stuck CLI / escapeHtml·webhook·uncapped / next sold residual",
      "NEXT_STEPS: commerce-webhook-currency-usd-gate done; success-page-commerceAddon-line-item-parity done (1924 / #332)",
      "BUSINESS_DECISIONS — require session.currency usd on commerce+bundle webhook (absolute index 382)",
      "Process: tightened 7155→1924 ITERATIONS decision slices via object-parse by decision text (webhook line-item=378 … success-page=381) before appending ours",
      "Verified: npm test (1649 passed = main@#332's suite + 4 checkout-currency unit + 3 webhook currency regressions) + lint after fold",
    ],
    // Object-parse by decision text: currency usd gate owns BD[382]; success-page=381; payment-mode=380.
    decisions: BUSINESS_DECISIONS.slice(382, 383),
  },
  {
    date: "2026-07-17",
    branch: "cursor/business-process-evolution-cd9c",
    summary:
      "Empty-backlog after PR #333 (commerce-webhook-currency-usd-gate). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were invent-optional-aggregate / clean-audit-only / already-merged (handoff-marker #226, use-server #311, vercel-id #304) — rejected. Fresh money-path residual: amount+currency already gated, but checkout.session.completed never required create-path catalog Price IDs on listLineItems — a Dashboard-minted session with matching amount_total+usd but a different Price could still ledger. Shipped sessionLineItemsIncludePriceId + bundleCatalogPriceIdsFromEnv + sessionLineItemsMatchBundleCatalogPrices; commerce_sku requires catalog.stripePriceId on line items (5xx on list failure); bundle requires setup(+monthly) env Prices on the same listLineItems pass as commerceAddon; Vitest + architecture note; process now requires Price ID line-item parity after amount+currency.",
    shipped: [
      "src/lib/payments/checkout-price-line-items.ts — sessionLineItemsIncludePriceId + bundleCatalogPriceIdsFromEnv + sessionLineItemsMatchBundleCatalogPrices",
      "src/lib/payments/checkout-price-line-items.test.ts — include / env / starter+growth match regressions",
      "src/lib/payments/webhook-fulfillment.ts — commerce_sku_price_line_items 5xx step",
      "src/app/api/stripe/webhook/route.ts — require catalog Price IDs on listLineItems before currency/amount on commerce + bundle",
      "src/app/api/stripe/webhook/route.test.ts — fixtures include Growth/Commerce Prices; +5 wrong-Price / missing stripePriceId / missing monthly env / list-5xx regressions",
      "Docs: architecture.tsx notes Price ID line-item parity beside currency/amount/commerceAddon gates",
      "AGENT_PROTOCOL — after amount+currency, require create-path Price IDs on line items; apply commerce+bundle twins same pass; next prefers stuck CLI / escapeHtml·webhook·uncapped / next sold residual",
      "NEXT_STEPS: commerce-webhook-price-id-line-item-parity + bundle-webhook-price-id-line-item-parity done",
      "BUSINESS_DECISIONS — require create-path Price IDs on listLineItems (absolute index 383)",
      "Process: tightened deb8 ITERATION decision slice via object-parse (currency=382) before appending ours",
      "Verified: npm test (1661 passed) + lint",
    ],
    // Object-parse by decision text: Price ID line-item parity owns BD[383]; currency=382; success-page=381.
    decisions: BUSINESS_DECISIONS.slice(383, 384),
  },
  {
    date: "2026-07-17",
    branch: "cursor/prompt-process-evolution-9030",
    summary:
      "Empty-backlog after PR #333. Sibling business-process-evolution-cd9c shipped create-path Price ID line-item parity (merged #334) — folded both ITERATIONS. Free NEXT_STEPS stayed operator/legal-gated. Fresh money-path residual: checkout.session.completed fulfilled ledger/handoff/receipt without payment_status===paid — async ACH completes unpaid while amount/currency/Price IDs still match catalog. Shipped isStripeCheckoutSessionPaid gate before commerce+bundle fulfillment; unpaid completed still markCheckoutSessionComplete; async_payment_succeeded shares the paid fulfillment path; loadCheckoutSuccessSession mirrors paid before confirming UI; Vitest + architecture note.",
    shipped: [
      "merge: origin/main (PR #334 commerce+bundle Price ID line-item parity) — keep sibling ITERATION; complementary payment_status gate",
      "src/lib/payments/checkout-payment-status.ts — isStripeCheckoutSessionPaid",
      "src/lib/payments/checkout-payment-status.test.ts — paid / unpaid / no_payment_required / missing regressions",
      "src/app/api/stripe/webhook/route.ts — gate ledger on paid; handle async_payment_succeeded; mark complete on unpaid completed",
      "src/app/api/stripe/webhook/route.test.ts — fixtures default payment_status paid; +3 unpaid-skip / async-succeed regressions",
      "src/lib/checkout/success-session.ts — require payment_status paid before confirmed UI",
      "src/lib/checkout/success-session.test.ts — fixtures include paid; +1 complete+unpaid unconfirmed regression",
      "Docs: architecture.tsx notes payment_status paid gate beside Price ID / currency / amount gates",
      "AGENT_PROTOCOL — webhook + success SSR must require payment_status paid after amount/currency/Price ID catalog parity",
      "NEXT_STEPS: webhook-checkout-payment-status-paid-gate done; commerce/bundle-webhook-price-id-line-item-parity done (cd9c / #334)",
      "BUSINESS_DECISIONS — require payment_status paid on checkout.session.completed / async_payment_succeeded + success SSR (absolute index 384)",
      "Process: object-parse by decision text (currency=382, Price ID=383) before appending ours",
      "Verified: npm test (1667 passed) + lint after fold with #334",
    ],
    // Object-parse by decision text: payment_status paid gate owns BD[384]; Price ID=383; currency=382.
    decisions: BUSINESS_DECISIONS.slice(384, 385),
  },
  {
    date: "2026-07-17",
    branch: "cursor/prompt-process-evolution-9f34",
    summary:
      "Empty-backlog after PR #335 (webhook-checkout-payment-status-paid-gate). Sibling business-process-evolution-cc45 was running same-minute — claimed billing-portal-checkout-payment-status-paid-gate and pushed immediately (sibling later claimed the same surface as billing-portal-session-payment-status-paid-gate; claim-only, folded). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were invent-optional-aggregate / clean-audit-only / already-merged — rejected. Fresh money-path residual twin: createBillingPortalForCheckoutSession still opened Billing Portal on status===complete without payment_status===paid — async ACH complete+unpaid could reach Manage billing via client-supplied session_id even though success SSR hides the CTA. Shipped isStripeCheckoutSessionPaid gate before eligibility; Vitest helper + route regressions; architecture note; process now requires closing the public billing-portal Session twin after webhook + success SSR share a Session gate.",
    shipped: [
      "merge: sibling business-process-evolution-cc45 claim-only (billing-portal-session-payment-status-paid-gate) — keep both NEXT_STEPS; feature body on 9f34",
      "src/lib/billing/create-portal-session.ts — require isStripeCheckoutSessionPaid after status===complete; MinimalStripeCheckoutSession.payment_status",
      "src/lib/billing/create-portal-session.test.ts — fixtures default payment_status paid; +1 complete+unpaid 400 regression",
      "src/app/api/stripe/billing-portal/route.test.ts — completeSubscriptionSession defaults paid; +1 unpaid passthrough 400",
      "Docs: architecture.tsx notes billing-portal Session payment_status paid gate beside webhook + success SSR",
      "AGENT_PROTOCOL — after webhook + success SSR share a Session gate, immediately close public billing-portal Session twin",
      "NEXT_STEPS: billing-portal-checkout-payment-status-paid-gate + billing-portal-session-payment-status-paid-gate done",
      "BUSINESS_DECISIONS — require payment_status paid on createBillingPortalForCheckoutSession (absolute index 385)",
      "Process: object-parse by decision text (payment_status webhook/SSR=384, Price ID=383) before appending ours",
      "Verified: npm test (1669 passed) + lint after fold with cc45",
    ],
    // Object-parse by decision text: billing-portal payment_status owns BD[385]; webhook/SSR paid=384.
    decisions: BUSINESS_DECISIONS.slice(385, 386),
  },
  {
    date: "2026-07-17",
    branch: "cursor/business-process-evolution-cc45",
    summary:
      "After #336 folded the billing-portal payment_status paid gate (9f34 feature + cc45 claim), free NEXT_STEPS stayed operator/legal-gated. This process-only pass folds leftover e23f3b8 BD slice tighten and object-parse remaps ITERATIONS[].decisions ownership from commerce checkout slug/skuId through commerce amount so each absolute BUSINESS_DECISIONS index has a single owner (catalog=373, amount=374, tier=372, Host=347, …). No product code change — prevents future +1 drift from dual-claiming decision rows.",
    shipped: [
      "merge: origin/main (PR #336 billing-portal payment_status paid) — keep 9f34 ITERATION; complementary process polish",
      "src/lib/process/prompt_process.tsx — object-parse BD ownership cascade (92f3→c135 / e23f3b8) so ITERATIONS[].decisions match decision text",
      "NEXT_STEPS: billing-portal-session-payment-status-paid-gate done (feature on 9f34 / #336)",
      "Process improvement: after appending BUSINESS_DECISIONS, verify unique ownership with object-parse across the recent cascade — comments alone rubber-stamp +1 drift",
      "Verified: npm test (1669 passed on main@#336) + lint; ownership unique for BD[338]–BD[385]",
    ],
    // Process-only polish; portal paid gate decision owned by 9f34 at BD[385].
    decisions: BUSINESS_DECISIONS.slice(385, 386),
  },
  {
    date: "2026-07-17",
    branch: "cursor/business-process-evolution-fd10",
    summary:
      "Empty-backlog after PR #337 (portal payment_status paid + BD ownership polish). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were invent-optional-aggregate / clean-audit-only / already-merged — rejected. Sibling prompt-process-evolution-919a had not claimed. Fresh money-path residual: unpaid completed→markComplete stopped abandoned recovery while ACH cleared, but checkout.session.async_payment_failed was unhandled — failed async payments left status=complete forever and permanently dropped Finish-checkout / Buy now retry revenue. Shipped markCheckoutSessionOpen (Convex markOpen + SQLite, requireConvex) + webhook handler + 5xx on reopen failure; Vitest + architecture note; process now requires closing the async_failed twin after unpaid-completed→markComplete.",
    shipped: [
      "convex/checkoutSessions.ts — markOpen mutation (status → open; safe no-op when missing)",
      "src/lib/db.ts — markCheckoutSessionOpen + static API map checkoutSessions.markOpen",
      "src/lib/payments/webhook-fulfillment.ts — checkout_session_mark_open 5xx step",
      "src/app/api/stripe/webhook/route.ts — handle async_payment_failed → reopen (no fulfillment)",
      "src/app/api/stripe/webhook/route.test.ts — +2 reopen / reopen-5xx regressions",
      "src/lib/payments/webhook-fulfillment.test.ts — +1 mark-open step regression",
      "Docs: architecture.tsx notes async_payment_failed reopen beside unpaid completed→markComplete",
      "AGENT_PROTOCOL — after unpaid-completed→markComplete, immediately reopen on async_payment_failed; next prefers stuck CLI / subscription-mode catalog Price portal / escapeHtml·webhook·uncapped",
      "NEXT_STEPS: webhook-async-payment-failed-reopen-checkout-session done",
      "BUSINESS_DECISIONS — require markCheckoutSessionOpen on async_payment_failed (absolute index 386)",
      "Verified: npm test (1672 passed = main@#337's 1669 + 2 webhook reopen + 1 fulfillment step) + lint",
    ],
    // Object-parse by decision text: async_payment_failed reopen owns BD[386]; portal paid=385.
    decisions: BUSINESS_DECISIONS.slice(386, 387),
  },
  {
    date: "2026-07-17",
    branch: "cursor/prompt-process-evolution-919a",
    summary:
      "Empty-backlog after PR #338 (async_payment_failed reopen). Same-minute dual claim: 919a claimed webhook-async-payment-failed-reopen-recovery while fd10 shipped markCheckoutSessionOpen (#338) — folded both NEXT_STEPS onto the single implementation. Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were invent-optional-aggregate / clean-audit-only / already-merged — rejected. Fresh money-path residual: createBillingPortalForCheckoutSession + loadCheckoutSuccessSession treated mode===subscription as eligible without listLineItems — Dashboard-minted foreign recurring Prices could open Manage billing / show the CTA. Shipped catalogRecurringPriceIdsFromEnv + sessionLineItemsIncludeCatalogRecurringPrice; subscription mode requires catalog recurring on listLineItems (portal 502 / SSR fail closed); checkoutSessionEligibleForBillingPortal(catalogRecurringProven); Vitest + architecture note; process now requires closing the subscription-mode catalog-recurring twin after payment-mode commerceAddon parity.",
    shipped: [
      "fold: webhook-async-payment-failed-reopen-recovery → feature body on fd10 / #338 (keep both NEXT_STEPS)",
      "src/lib/payments/checkout-price-line-items.ts — catalogRecurringPriceIdsFromEnv + sessionLineItemsIncludeCatalogRecurringPrice",
      "src/lib/payments/checkout-price-line-items.test.ts — recurring Price env / membership regressions",
      "src/lib/billing/portal.ts — checkoutSessionEligibleForBillingPortal requires catalogRecurringProven on subscription",
      "src/lib/billing/create-portal-session.ts — subscription mode listLineItems catalog recurring gate (502 on list fail)",
      "src/lib/checkout/success-session.ts — same catalog recurring gate before showBillingPortal (fail closed)",
      "Vitest: portal + success-session + billing-portal route fixtures updated for catalog monthly",
      "Docs: architecture.tsx notes subscription catalog-recurring beside payment-mode commerceAddon",
      "AGENT_PROTOCOL — after payment-mode commerceAddon line-item parity, close subscription catalog-recurring twin",
      "NEXT_STEPS: subscription-mode-billing-portal-catalog-recurring-price-gate + webhook-async-payment-failed-reopen-recovery done",
      "BUSINESS_DECISIONS — require catalog recurring Price on subscription portal/success (absolute index 387)",
    ],
    // Object-parse by decision text: subscription catalog recurring owns BD[387]; async_failed reopen=386.
    decisions: BUSINESS_DECISIONS.slice(387, 388),
  },
  {
    date: "2026-07-17",
    branch: "cursor/prompt-process-evolution-bd71",
    summary:
      "Empty-backlog after PR #339 (subscription-mode catalog recurring Price gate). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were already-merged under prior NEXT_STEPS — rejected. Fresh money-path residual twin: createBillingPortalForLead still trusted CRM orderEligibleForBillingPortal + stored stripeCustomerId without Session re-proof. Shipped require stripeSessionId + reuse createBillingPortalForCheckoutSession; Vitest CRM-foreign-Price / unpaid / catalog-recurring / Session-customer regressions; architecture note; process now requires closing the lead Manage-billing twin after Session catalog-recurring.",
    shipped: [
      "src/lib/billing/create-portal-session.ts — createBillingPortalForLead requires stripeSessionId and reuses Session-path gates (no CRM-only portal)",
      "src/lib/billing/create-portal-session.test.ts — lead-path foreign Price / unpaid / catalog recurring / Session customer / listLineItems-502 regressions",
      "Docs: architecture.tsx notes lead Manage billing reuses Session entitlement",
      "AGENT_PROTOCOL — after Session catalog-recurring, close lead Manage-billing twin",
      "NEXT_STEPS: billing-portal-lead-catalog-recurring-price-gate done",
      "BUSINESS_DECISIONS — require Session re-proof on createBillingPortalForLead (absolute index 388)",
      "Verified: npm test (1679 passed — lead-path regressions replaced CRM-only portal cases 1:1 vs main@#339) + lint",
    ],
    // Object-parse by decision text: lead Manage billing Session re-proof owns BD[388]; subscription catalog=387.
    decisions: BUSINESS_DECISIONS.slice(388, 389),
  },
  {
    date: "2026-07-17",
    branch: "cursor/business-process-evolution-d5f3",
    summary:
      "Empty-backlog after PR #339 (subscription catalog recurring portal gate). Sibling prompt-process-evolution-bd71 shipped billing-portal-lead-catalog-recurring-price-gate (#340) same window — complementary pivot; folded both ITERATIONS. Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were invent-optional-aggregate / clean-audit-only / already-merged — rejected. Fresh sold residual: paid bundle fulfillment only markComplete'd the paid stripeSessionId, so earlier abandoned open bundle checkout_sessions for the same leadSlug stayed in Finish-checkout / digest / pipeline-health. Shipped markCompleteOpenBundleForLead + db helper + webhook call (5xx on failure); never closes commerce_sku; Vitest + architecture note; process now requires orphan-open cleanup after paid Session markComplete.",
    shipped: [
      "merge: origin/main (PR #340 lead Manage-billing Session re-proof) — keep sibling ITERATION; complementary orphan cart cleanup",
      "convex/checkoutSessions.ts — markCompleteOpenBundleForLead (by_leadSlug; skip commerce_sku)",
      "src/lib/db.ts — markCompleteOpenBundleCheckoutSessionsForLead + static API map registration",
      "src/lib/checkout/abandoned-recovery.ts — openBundleCheckoutSessionsToClose pure helper",
      "src/lib/payments/webhook-fulfillment.ts — checkout_session_orphan_bundle_cleanup 5xx step",
      "src/app/api/stripe/webhook/route.ts — close orphan open bundle sessions after paid bundle markComplete",
      "Vitest: abandoned-recovery + webhook + fulfillment step regressions",
      "Docs: architecture.tsx notes orphan open bundle cleanup beside async_payment_failed reopen",
      "AGENT_PROTOCOL — after paid Session markComplete, close orphan open bundle siblings; next prefers stuck CLI / escapeHtml·webhook·uncapped / next sold residual",
      "NEXT_STEPS: bundle-paid-orphan-open-checkout-session-cleanup done; billing-portal-lead-catalog-recurring-price-gate done (bd71 / #340)",
      "BUSINESS_DECISIONS — require orphan open bundle cleanup after paid bundle Session (absolute index 389)",
      "Process: object-parse by decision text (lead portal=388, subscription catalog=387) before appending ours",
      "Verified: npm test (1685 passed pre-fold; re-run after #340 merge) + lint",
    ],
    // Object-parse by decision text: orphan open bundle cleanup owns BD[389]; lead portal=388.
    decisions: BUSINESS_DECISIONS.slice(389, 390),
  },
  ];
