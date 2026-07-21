/**
 * Archived BusinessDecision entries — see src/lib/process/prompt_process.tsx for
 * why this exists (process-log-archive-scalability-split in
 * BUSINESS_DECISIONS) and for the live, editable tail. Part 2 of 7, oldest-first (chronological order preserved across all archive files + the live tail).
 *
 * Append-only, like the live arrays it was split from — never edit an entry
 * here, and never append new entries directly to an archive file. New
 * entries always go in the live array in prompt_process.tsx (or
 * business-decisions.ts for BUSINESS_DECISIONS); a future maintenance pass
 * moves the oldest live entries into a new archive file (or a new numbered
 * file in this directory) once the live file grows large again.
 */
import type { BusinessDecision } from "../types";

export const BUSINESS_DECISIONS_ARCHIVE_02: BusinessDecision[] = [
  {
    date: "2026-07-14",
    decision:
      "Ship action-level Vitest for archiveOrphanCommerceStripeProductsAction (Commerce Archive orphans) when Save catalog / Sync to Stripe action coverage is done — stripe-sync helper suites alone do not lock auth, STRIPE_SECRET_KEY gate, lead lookup, catalog?.items ?? [] pass-through, success archivedCount/skuIds + revalidate, or Stripe throw surfaces. Leave open-billing-portal-action-test-coverage free for siblings. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
    rationale:
      "Archive orphans is the operator path that keeps Stripe Product inventory aligned after SKU churn (active=false, never auto-delete on save/sync). A future missing-secret soft-pass / wrong catalog items / skipped revalidate / swallowed Stripe error regression would not fail Vitest without action glue coverage — the same class of gap Sync to Stripe / Save catalog action suites already closed. Prefer locking that cleanup path, then Manage billing action glue, over inventing optional aggregates while remaining NEXT_STEPS stay secrets/OAuth/counsel-gated.",
  },
  {
    date: "2026-07-14",
    decision:
      "Ship action-level Vitest for openBillingPortalAction (Manage billing) when archive-orphan-commerce-stripe-products-action-test-coverage is claimed by a sibling — create-portal-session helper + billing-portal route suites alone do not lock auth, empty slug, STRIPE_SECRET_KEY gate, returnUrl derivation (NEXT_PUBLIC_APP_URL > forwarded host > localhost), or createBillingPortalForLead success/error passthrough. Queue send-starter-upsell-action-test-coverage + send-follow-up-action-test-coverage as sibling-friendly MRR / outreach twins next. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
    rationale:
      "Manage billing is the operator path that opens Stripe Customer Portal for Growth/Complete/Commerce subscribers from /dashboard/leads. A future missing-secret soft-pass, wrong returnUrl, skipped auth, or swallowed helper error would not fail Vitest without action glue coverage — the same class of gap Save catalog / Sync to Stripe / Archive orphans action suites already closed — and would strand paid subscribers without self-serve card/cancel. Prefer locking that billing path, then Starter upsell / Email 2/3 follow-up action glue, over inventing optional aggregates while remaining NEXT_STEPS stay secrets/OAuth/counsel-gated.",
  },
  {
    date: "2026-07-14",
    decision:
      "Ship action-level Vitest for sendStarterUpsellAction (Starter → MRR Upsell) when open-billing-portal-action-test-coverage is done — starter-upsell helper suites alone do not lock auth, empty slug, missing lead, paid/live Starter-only + email eligibility (rejects Growth/Complete/Commerce), Growth default vs Complete recommendedTier, suppression / Resend failure (no revalidate), or leadSlug order filtering. Leave send-follow-up-action-test-coverage free for siblings. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
    rationale:
      "Upsell is the operator path that converts one-time $500 Starter customers into Growth/Complete MRR from /dashboard/leads. A future eligibility soft-pass (Billing + Upsell both firing), wrong target tier, suppressed-email revalidate, or unfiltered cross-lead orders regression would not fail Vitest without action glue coverage — the same class of gap Manage billing / Archive orphans / Email pack action suites already closed — and would either spam ineligible leads or miss the highest-leverage MRR unlock. Prefer locking that upsell path, then Email 2/3 follow-up action glue, over inventing optional aggregates while remaining NEXT_STEPS stay secrets/OAuth/counsel-gated.",
  },
  {
    date: "2026-07-14",
    decision:
      "Ship action-level Vitest for sendFollowUpAction (Email 2/3 outreach) when send-starter-upsell-action-test-coverage is claimed/done by a sibling — outreach-followups helper suites alone do not lock auth, empty slug, missing lead/email, paid/live/closed stage gates, Email 1 prerequisite / sequence-complete, OUTREACH_CADENCE_CONVEX_PRIMARY mark-before-Resend, ConvexPrimaryWriteError skip-send, Email 2 vs Email 3 dispatch, or suppression / Resend failure after durable mark (returns outreachStep; no revalidate). Queue reply-to-inquiry-action-test-coverage + dispose-cold-lead-action-test-coverage as sibling-friendly CRM twins next. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
    rationale:
      "Follow-up is the operator path that advances Email 2/3 from /dashboard/leads — the top-of-funnel conversion step after Email 1. A future soft-fallback that sends before marking, skipped requireConvex, wrong Email 2/3 dispatch, or revalidate-on-suppression regression would not fail Vitest without action glue coverage — the same class of gap Starter upsell / checkout-recovery / Email pack action suites already closed — and would risk duplicate outreach (CAN-SPAM) or silent stage desync across Convex-first instances. Prefer locking that outreach path, then inquiry-reply / cold-disposition action glue, over inventing optional aggregates while remaining NEXT_STEPS stay secrets/OAuth/counsel-gated.",
  },
  {
    date: "2026-07-14",
    decision:
      "Ship action-level Vitest for replyToInquiryAction (Starter inquiry Reply) when send-follow-up-action-test-coverage is done — reply.test.ts / reply-persist helpers alone do not lock auth, empty inquiry id, empty / over-long body, missing inquiry, archived / no-email gates, INQUIRY_REPLY_CONVEX_PRIMARY mark-before-Resend, email trim, ConvexPrimaryWriteError skip-send, null-mark not-found, or suppression / Resend failure after durable mark (returns inquiry; no revalidate). Leave dispose-cold-lead-action-test-coverage free for siblings; queue update-inquiry-status-action-test-coverage as the mark-read/Archive twin. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
    rationale:
      "Reply is the operator path that closes the Starter contact-form CRM loop from /dashboard/leads — unrepliedInquiryCount / digest / oldestUnrepliedInquiryAgeHours all read Convex-first. A future soft-fallback that sends before marking, skipped requireConvex, archived soft-pass, or revalidate-on-suppression regression would not fail Vitest without action glue coverage — the same class of gap Email 2/3 follow-up / Starter upsell action suites already closed — and would risk duplicate visitor replies or silent unreplied debt across instances. Prefer locking that inbox path, then cold Re-engage/Close / inquiry-status action glue, over inventing optional aggregates while remaining NEXT_STEPS stay secrets/OAuth/counsel-gated.",
  },
  {
    date: "2026-07-14",
    decision:
      "Ship action-level Vitest for disposeColdLeadAction (cold Re-engage/Close + optional Email 1) when reply-to-inquiry-action-test-coverage is done — cold-archive helper suites alone do not lock auth, empty slug, invalid disposition, missing lead, not-cold / paid / closed gates, COLD_DISPOSITION_CONVEX_PRIMARY Close + Re-engage patches, Email 1 mark-before-Resend (OUTREACH_CADENCE_CONVEX_PRIMARY), ConvexPrimaryWriteError skip-send on disposition and outreach mark, email trim, or suppression / Resend failure after durable marks (returns stage/outreachStep; no revalidate). Leave update-inquiry-status-action-test-coverage free for siblings. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
    rationale:
      "Re-engage/Close is the operator path that clears cold inventory after Email 1–3 silence — getLeads / cold badges / pipeline-health cold counts / the stage funnel all read Convex-first, and optional Email 1 is the same persist-then-notify CAN-SPAM surface as follow-up. A future soft-fallback that claims Close after a SQLite-only write, sends Email 1 before the outreach mark, or revalidates on suppression would not fail Vitest without action glue coverage — the same class of gap Reply / Email 2/3 follow-up action suites already closed — and would leave cold inventory looking open elsewhere or risk a duplicate Email 1. Prefer locking that cold-disposition path, then inquiry mark-read/Archive action glue, over inventing optional aggregates while remaining NEXT_STEPS stay secrets/OAuth/counsel-gated.",
  },
  {
    date: "2026-07-14",
    decision:
      "Ship action-level Vitest for updateInquiryStatusAction (mark-read on composer open / Archive) when reply-to-inquiry-action-test-coverage is done and dispose-cold-lead-action-test-coverage is claimed by a sibling — reply helper + replyToInquiryAction suites alone do not lock auth, empty inquiry id, invalid status, INQUIRY_REPLY_CONVEX_PRIMARY on updateClientInquiryStatus, ConvexPrimaryWriteError fail-closed (no revalidate), null update not-found, or success revalidate for read/archived/replied/new. Queue update-lead-stage-action-test-coverage + snooze-lead-action-test-coverage as sibling-friendly CRM twins next. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
    rationale:
      "Mark-read / Archive is the operator path that keeps unrepliedInquiryCount / digest honest when the composer opens or an inquiry is shelved — the same INQUIRY_REPLY_CONVEX_PRIMARY surface as Reply, but without Resend. A future soft-fallback that claims read after a SQLite-only write, accepts an invalid status, or revalidates after ConvexPrimaryWriteError would not fail Vitest without action glue coverage — the same class of gap Reply / Email 2/3 follow-up action suites already closed — and would leave unreplied debt looking open (or silently archived) on other instances. Prefer locking that status-only glue, then stage dropdown / snooze park action Vitest, over inventing optional aggregates while remaining NEXT_STEPS stay secrets/OAuth/counsel-gated.",
  },
  {
    date: "2026-07-14",
    decision:
      "Ship action-level Vitest for updateLeadStageAction (dashboard stage dropdown + optional Email 1 on outreach_sent) when update-inquiry-status-action-test-coverage is done — stage-persist / outreach-persist helper suites alone do not lock auth, LEAD_STAGE_CONVEX_PRIMARY fail-closed, non-outreach success revalidate, outreach_sent mark-before-Resend (OUTREACH_CADENCE_CONVEX_PRIMARY), missing-email skip send, or outreach-mark ConvexPrimaryWriteError (stage saved; Email 1 not sent). Leave snooze-lead-action-test-coverage free for siblings. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
    rationale:
      "The stage dropdown is the operator path that moves funnel state on /dashboard/leads — getLeads / pipeline-health / the stage funnel read Convex-first, and outreach_sent is the same persist-then-notify CAN-SPAM surface as Follow-up / cold Re-engage Email 1. A future soft-fallback that claims a stage move after a SQLite-only write, sends Email 1 before the outreach mark, or revalidates after ConvexPrimaryWriteError would not fail Vitest without action glue coverage — the same class of gap inquiry status / cold disposition / Email 2/3 action suites already closed — and would leave funnel state invisible elsewhere or risk a duplicate Email 1. Prefer locking that stage dropdown glue, then Work next snooze park action Vitest, over inventing optional aggregates while remaining NEXT_STEPS stay secrets/OAuth/counsel-gated.",
  },
  {
    date: "2026-07-14",
    decision:
      "Ship action-level Vitest for snoozeLeadAction (Work next 1d/3d/7d park + Unsnooze) when update-lead-stage-action-test-coverage is claimed by a sibling — snooze / snooze-persist helper suites alone do not lock auth, empty slug, missing lead, invalid preset, missing preset/clear, LEAD_SNOOZE_CONVEX_PRIMARY on updateLeadSnooze, clear-over-preset precedence, ConvexPrimaryWriteError fail-closed (no revalidate), success revalidate, or Error / non-Error throws. Queue update-lead-notes-action-test-coverage + add-lead-action-test-coverage as sibling-friendly CRM twins next. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
    rationale:
      "Snooze / Unsnooze is the operator path that parks a hot lead off Work next without wiping quality-score history — isFollowUpDue (follow-ups-due-exclude-snoozed) / pipeline-health snoozed count / the daily digest footnote all read Convex-first. A future soft-fallback that claims park after a SQLite-only write, accepts an invalid preset, or revalidates after ConvexPrimaryWriteError would not fail Vitest without action glue coverage — the same class of gap stage dropdown / inquiry-status action suites already closed — and would leave a lead looking due (or still parked) on other instances, risking an unwanted Email 2/3 send right after the operator asked to park it (CAN-SPAM). Prefer locking that Work next park glue, then notes / Add lead action Vitest, over inventing optional aggregates while remaining NEXT_STEPS stay secrets/OAuth/counsel-gated.",
  },
  {
    date: "2026-07-14",
    decision:
      "Ship action-level Vitest for updateLeadNotesAction (discovery-call / Email 3 notes Save) when update-lead-stage / snooze-lead action coverage is done — notes / notes-persist helper suites alone do not lock auth, empty slug, soft-cap reject before lead lookup, missing lead, LEAD_NOTES_CONVEX_PRIMARY on updateLeadNotes (save + clear), trim, ConvexPrimaryWriteError fail-closed (no revalidate), or Error / non-Error throws. Leave add-lead-action-test-coverage free for siblings; queue import-leads-csv-action-test-coverage + mark-handoff-live-action-test-coverage as sibling-friendly inventory / fulfill twins next. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
    rationale:
      "Save notes is the operator path that keeps discovery-call / Email 3 outcomes durable on /dashboard/leads — getLeads / Work next search-over-notes read Convex-first. A future soft-fallback that claims Save after a SQLite-only write, accepts over-long notes, or revalidates after ConvexPrimaryWriteError would not fail Vitest without action glue coverage — the same class of gap stage dropdown / snooze park action suites already closed — and would leave call outcomes invisible on other instances (operator loses the warm handoff into paid). Prefer locking that notes glue, then Add lead / CSV import / Mark live action Vitest, over inventing optional aggregates while remaining NEXT_STEPS stay secrets/OAuth/counsel-gated.",
  },
  {
    date: "2026-07-14",
    decision:
      "Ship action-level Vitest for addLeadAction (manual create + optional Email 1) when update-lead-notes-action-test-coverage is claimed by a sibling — upsert-persist / outreach-persist / csv-import helper suites alone do not lock auth, missing slug/businessName, slug sanitize, default stage/dataSource, existing-slug conflict (no upsert), LEAD_UPSERT_CONVEX_PRIMARY on upsertLead, ConvexPrimaryWriteError fail-closed (no revalidate), success revalidate, outreach_sent mark-before-Resend, missing-email skip send, outreach-mark ConvexPrimaryWriteError (lead saved; Email 1 not sent), or Error / non-Error throws. Queue import-leads-csv-action-test-coverage + mark-handoff-live-action-test-coverage as sibling-friendly inventory / fulfill twins next. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
    rationale:
      "Add lead is the operator path that seeds CRM inventory on /dashboard/leads — getLeads / Work next / pipeline-health / digest / outreach eligibility all read Convex-first. A future soft-fallback that claims create after a SQLite-only write, clobbers an existing slug via upsertLead, or sends Email 1 before a durable outreach mark would not fail Vitest without action glue coverage — the same class of gap notes Save / stage dropdown action suites already closed — and would leave new inventory invisible elsewhere (empty CRM + false funnel) or risk a duplicate Email 1. Prefer locking that create-path glue, then CSV import / Mark live action Vitest, over inventing optional aggregates while remaining NEXT_STEPS stay secrets/OAuth/counsel-gated.",
  },
  {
    date: "2026-07-14",
    decision:
      "After notes + Add lead action Vitest land (PR #165), prefer import-leads-csv-action-test-coverage ↔ mark-handoff-live-action-test-coverage as the next empty-backlog twin pair — and claim them separately in the same cron window. CSV import locks bulk inventory create (LEAD_UPSERT_CONVEX_PRIMARY per row); Mark live locks sold Starter/Growth/Complete fulfill (DEPLOY_HANDOFF_CONVEX_PRIMARY + stage live). Do not invent optional aggregates while Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
    rationale:
      "Both twins close multi-instance regression gaps on paths operators click every day (bulk lead load vs Mark live after DNS). A dual-claim rule matching prior notes/add and stage/snooze twins prevents same-minute thrash; each suite touches different action surfaces so folding stays cheap. Prefer that inventory/fulfill glue over inventing optional metrics.",
  },
  {
    date: "2026-07-14",
    decision:
      "Ship action-level Vitest for importLeadsCsvAction (bulk inventory create) when add-lead-action-test-coverage is done — csv-import / upsert-persist helper suites alone do not lock auth, empty CSV, no-valid-leads parse failure, LEAD_UPSERT_CONVEX_PRIMARY per row, existing-slug skip, in-batch duplicate slug auto-suffix, ConvexPrimaryWriteError per-row retry with partial success, all-fail / all-collision → success:false, or Error / non-Error throws. Leave mark-handoff-live-action-test-coverage free for siblings; queue assign-vercel-project-action-test-coverage + assign-custom-domain-action-test-coverage as sibling-friendly fulfill twins next. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
    rationale:
      "Import CSV is the operator path that seeds CRM inventory at volume on /dashboard/leads — getLeads / Work next / pipeline-health / digest / outreach eligibility all read Convex-first. A future soft-fallback that claims import after a SQLite-only write, upserts over an existing slug, or treats a per-row ConvexPrimaryWriteError as a silent skip without a retry message would not fail Vitest without action glue coverage — the same class of gap Add lead / notes Save action suites already closed — and would leave bulk inventory invisible elsewhere (empty CRM + false funnel) or clobber pipeline state. Prefer locking that bulk-create glue, then Mark live / Assign Vercel project / Assign custom domain action Vitest, over inventing optional aggregates while remaining NEXT_STEPS stay secrets/OAuth/counsel-gated.",
  },
  {
    date: "2026-07-14",
    decision:
      "Ship action-level Vitest for markHandoffLiveAction (sold Starter/Growth/Complete fulfill) when import-leads-csv-action-test-coverage is claimed by a sibling — handoff-persist / handoff helper suites alone do not lock auth, empty slug, no-handoff null, DEPLOY_HANDOFF_CONVEX_PRIMARY fail-closed (ConvexPrimaryWriteError; no revalidate), success revalidate, or Error / non-Error throws. Queue assign-vercel-project-action-test-coverage + assign-custom-domain-action-test-coverage as sibling-friendly fulfill twins next. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
    rationale:
      "Mark live is the operator path that closes paid-not-live debt on /dashboard/leads — listDeployHandoffs / pipeline-health / getLeads stage funnel read Convex-first. A future soft-fallback that claims Mark live after a SQLite-only write, revalidates after ConvexPrimaryWriteError, or treats a missing handoff as success would not fail Vitest without action glue coverage — the same class of gap CSV import / Add lead action suites already closed — and would leave paid clients looking pre-live elsewhere (open handoff debt + false funnel). Prefer locking that fulfill glue, then Assign Vercel project / Assign custom domain action Vitest, over inventing optional aggregates while remaining NEXT_STEPS stay secrets/OAuth/counsel-gated.",
  },
  {
    date: "2026-07-14",
    decision:
      "Ship action-level Vitest for assignCustomDomainAction (Save domain Host→preview) when import-leads-csv / mark-handoff-live action coverage is done — handoff / custom-domain-routing helper suites alone do not lock auth, empty slug, trim-to-null clear, no-handoff null, DEPLOY_HANDOFF_CONVEX_PRIMARY fail-closed (ConvexPrimaryWriteError; no revalidate), success revalidate (/dashboard/leads only), trimmed domain pass-through, or Error / non-Error throws. Leave assign-vercel-project-action-test-coverage free for siblings. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
    rationale:
      "Save domain is the operator path that closes the Starter preview-subdomain → custom-domain handoff promise on /dashboard/leads — src/proxy.ts Host→preview and other instances read Convex-first. A future soft-fallback that claims Save after a SQLite-only write, revalidates after ConvexPrimaryWriteError, or treats whitespace as a literal domain would not fail Vitest without action glue coverage — the same class of gap Mark live / CSV import action suites already closed — and would leave client domains routing to the wrong preview (or nowhere) on other instances. Prefer locking that Host→preview glue, then Assign Vercel project action Vitest, over inventing optional aggregates while remaining NEXT_STEPS stay secrets/OAuth/counsel-gated.",
  },
  {
    date: "2026-07-14",
    decision:
      "Ship action-level Vitest for assignVercelProjectAction (Assign Vercel project isolation) when assign-custom-domain-action-test-coverage is claimed by a sibling — handoff helper suites alone do not lock auth, empty slug, trim project id, whitespace-only clear (→ null), no-handoff null, DEPLOY_HANDOFF_CONVEX_PRIMARY fail-closed (ConvexPrimaryWriteError; no revalidate), success revalidate (/dashboard/leads only), or Error / non-Error throws. Queue get-commerce-catalog-action-test-coverage as the next thin free todo after both Assign twins land. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
    rationale:
      "Assign Vercel project is the operator path that isolates a paid client's Domains API target on /dashboard/leads — tryProvisionVercelDomain and other instances read Convex-first. A future soft-fallback that claims Assign after a SQLite-only write, revalidates after ConvexPrimaryWriteError, or treats whitespace as a literal project id would not fail Vitest without action glue coverage — the same class of gap Save domain / Mark live action suites already closed — and would leave dedicated-project isolation missing elsewhere (shared-project Domains API targeting + false provision state). Prefer locking that isolation glue, then getCommerceCatalogAction read-path Vitest or empty-backlog audits, over inventing optional aggregates while remaining NEXT_STEPS stay secrets/OAuth/counsel-gated.",
  },
  {
    date: "2026-07-14",
    decision:
      "Ship action-level Vitest for getCommerceCatalogAction (Commerce catalog read path seeding Save/Sync) when Assign Vercel / Save domain action coverage is done — save/sync action suites alone do not lock auth, empty slug, getCommerceCatalog pass-through (row or null), or Error / non-Error throws. After this, prefer login-operator-action-test-coverage (session write/clear + safeNextPath) or empty-backlog sold-capability / multi-instance regression audits while Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
    rationale:
      "getCommerceCatalogAction is the thin operator read that seeds the Commerce Save/Sync panel on /dashboard/leads — Buy now / unsynced debt / preserveCommerceStripeIds all depend on the same Convex-first catalog row. A future auth skip, empty-slug fallthrough, or swallowed read error that returns a fake empty catalog would not fail Vitest without action glue coverage — the same class of gap Save catalog / Sync to Stripe action suites already closed for writes — and would leave operators editing against a missing or stale catalog while preview Buy now still reads Convex-first. Prefer locking that read glue, then login/logout action Vitest or empty-backlog audits, over inventing optional aggregates while remaining NEXT_STEPS stay secrets/OAuth/counsel-gated.",
  },
  {
    date: "2026-07-14",
    decision:
      "Ship action-level Vitest for loginOperatorAction / logoutOperatorAction (operator session write/clear + safeNextPath) when get-commerce-catalog action coverage is done — operator.test.ts token crypto and proxy.test.ts Host gate alone do not lock unconfigured redirect, invalid-password redirect (encoded next), success cookie set via operatorSessionCookieOptions(sessionMaxAgeSeconds()), open-redirect rejection (// and non-path next → /dashboard), or logout clear (maxAge 0) + redirect to /dashboard/login. After this, free backlog returns to requireOperatorAuth cookie-read coverage or empty-backlog sold-capability / multi-instance regression audits while Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
    rationale:
      "Login/logout is the last untested dashboard action module after the CRM/fulfill/Commerce action Vitest chain — every mutation suite mocks requireOperatorAuth, but the form path that establishes the signed httpOnly cookie (launch-checklist step 2) had zero action glue coverage. A future open-redirect regression in safeNextPath, skipped cookie set on success, or logout that fails to clear maxAge would not fail Vitest without this suite — and would leave production operator sessions insecure or stuck while proxy.ts still gates /dashboard/*. Prefer locking that session glue over inventing optional aggregates while remaining NEXT_STEPS stay secrets/OAuth/counsel-gated.",
  },
  {
    date: "2026-07-14",
    decision:
      "Ship cookie-read Vitest for requireOperatorAuth / isOperatorAuthenticated when login-operator-action-test-coverage is done — login/logout action Vitest locks cookie write/clear and safeNextPath; token crypto alone does not lock jar read (open demo when OPERATOR_DASHBOARD_PASSWORD unset/empty with no cookies() call, Unauthorized reject on missing/invalid/expired session, accept valid signed OPERATOR_SESSION_COOKIE). After this, prefer operator-dashboard-password-env-readiness (amber open-dashboard banner) or empty-backlog sold-capability / multi-instance regression audits while Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
    rationale:
      "Every dashboard mutation suite mocks requireOperatorAuth, so a future open-demo regression (password unset still reading/rejecting the jar), skipped Unauthorized message, or accept-invalid-cookie path would not fail those suites — and would leave production lead mutations reachable without a valid session while proxy.ts still expects a signed cookie. Prefer locking that shared cookie-read helper over inventing optional aggregates while remaining NEXT_STEPS stay secrets/OAuth/counsel-gated.",
  },
  {
    date: "2026-07-14",
    decision:
      "Ship assessOperatorAuthEnvReadiness + OperatorAuthEnvBanner when require-operator-auth-cookie-read-coverage is done — login/cookie Vitest locks session crypto and jar read, but operators still get no early dashboard signal when OPERATOR_DASHBOARD_PASSWORD is unset, whitespace-only, or a changeme/password/secret-style placeholder (open demo while CRM/outreach mutations are world-reachable). Env presence only; distinct from Stripe / Resend / Anthropic / digest banners; show first among readiness banners. Queue app-url-env-readiness (NEXT_PUBLIC_APP_URL) as the sibling-friendly twin next. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
    rationale:
      "An open dashboard with live lead inventory and outbound sends is the worst CRM risk after auth plumbing ships — launch checklist step 2 already requires the password, but every other launch secret (Stripe core, Price IDs, Resend, Anthropic, digest destination) already has an operator-visible banner while OPERATOR_DASHBOARD_PASSWORD did not. Prefer that early lock signal, then APP_URL readiness or empty-backlog sold-capability / multi-instance regression audits, over inventing optional aggregates while remaining NEXT_STEPS stay secrets/OAuth/counsel-gated.",
  },
  {
    date: "2026-07-14",
    decision:
      "Ship assessAppUrlEnvReadiness + AppUrlEnvBanner when operator-dashboard-password-env-readiness is done — auth/Stripe/Resend banners already cover lock + payment + outreach transport, but operators still get no early dashboard signal when NEXT_PUBLIC_APP_URL is missing, whitespace-only, still localhost (.env.example default), or an example.com placeholder while other secrets are live (checkout cancel/success, digest links, unsubscribe footers, pack preview links, and SEO siteUrl() silently fall back to request origin or localhost). Env presence only; distinct orange banner. Queue production-domain-env-readiness (NEXT_PUBLIC_PRODUCTION_DOMAIN) as the sibling-friendly twin next. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
    rationale:
      "Wrong canonical origin after Stripe/Resend go live is a silent revenue + reputation leak — buyers land on broken cancel URLs, digest/Work-next links point at localhost, and Starter SEO canonicals advertise the wrong host — while every other launch secret already has an operator-visible banner. Prefer that early APP_URL signal, then production-domain readiness or empty-backlog sold-capability / multi-instance regression audits, over inventing optional aggregates while remaining NEXT_STEPS stay secrets/OAuth/counsel-gated.",
  },
  {
    date: "2026-07-14",
    decision:
      "Ship assessBrandNameEnvReadiness + BrandNameEnvBanner when app-url-env-readiness is claimed/done by a sibling — APP_URL readiness locks canonical checkout/digest/SEO origins, but operators still get no early dashboard signal when NEXT_PUBLIC_BRAND_NAME is missing, whitespace-only, or a Your Brand/Brand Name-style placeholder (brand.name fallback 'Your Brand' on every outreach From / marketing footer / voice intro / CAN-SPAM sender line). Env presence only; distinct rose banner; legacy NEXT_PUBLIC_APP_NAME does not count (matches brand.isConfigured). Leave production-domain-env-readiness free for siblings. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
    rationale:
      "Unbranded outreach after Resend/Stripe/APP_URL go live is a silent conversion leak — Email 1–3 and pack delivery can look 'send-ready' while every customer-facing surface still reads as an unconfigured placeholder. Prefer that early brand signal, then production-domain readiness or empty-backlog sold-capability / multi-instance regression audits, over inventing optional aggregates while remaining NEXT_STEPS stay secrets/OAuth/counsel-gated.",
  },
  {
    date: "2026-07-14",
    decision:
      "Ship assessProductionDomainEnvReadiness + ProductionDomainEnvBanner when brand-name-env-readiness is done — APP_URL/brand banners already cover canonical origin + outreach copy, but operators still get no early dashboard signal when NEXT_PUBLIC_PRODUCTION_DOMAIN is missing, whitespace-only, localhost, an example.com/yourdomain.com placeholder, or a preview.* root (productionRootDomain() silently falls back to stripping preview. from NEXT_PUBLIC_PREVIEW_DOMAIN / localsitestudio.com default — handoff suggestedHost + DNS counseling advertise the wrong root). Env presence only; distinct cyan banner; PREVIEW_DOMAIN alone does not count as ready. Queue empty-backlog sold-capability / multi-instance regression audits next. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
    rationale:
      "Wrong suggestedHost after APP_URL goes live is a silent Starter fulfillment leak — paid handoffs email clients a platform-default subdomain while wildcard DNS counseling points at the wrong root, and every other launch secret already has an operator-visible banner. Prefer that early production-root signal, then empty-backlog sold-capability / multi-instance regression audits, over inventing optional aggregates while remaining NEXT_STEPS stay secrets/OAuth/counsel-gated.",
  },
  {
    date: "2026-07-14",
    decision:
      "Ship assessVercelTokenEnvReadiness + VercelTokenEnvBanner when production-domain-env-readiness is claimed/done by a sibling — production-domain readiness locks suggestedHost root, but operators still get no early dashboard signal when VERCEL_TOKEN is missing, whitespace-only, or a changeme/token/xxx-style placeholder (tryProvisionVercelDomain skips Domains API; paid handoffs stay awaiting_dns with manual notes). Env presence only; distinct blue banner; do not require VERCEL_PROJECT_ID here (per-handoff Assign project covers that). Same-minute dual claim on production-domain: earlier remote claim owns; later pivots to this twin. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
    rationale:
      "Manual-only Phase 5 after PRODUCTION_DOMAIN/APP_URL go live is a silent fulfillment drag — every paid checkout queues a handoff that never attempts Domains API registration while other launch secrets already have operator-visible banners. Prefer that early Vercel-token signal, then empty-backlog sold-capability / multi-instance regression audits, over inventing optional aggregates while remaining NEXT_STEPS stay secrets/OAuth/counsel-gated.",
  },
  {
    date: "2026-07-14",
    decision:
      "Ship assessCompanyAddressEnvReadiness + CompanyAddressEnvBanner when vercel-token-env-readiness is claimed/done — Vercel Domains API readiness is live, but operators still get no early dashboard signal when NEXT_PUBLIC_COMPANY_ADDRESS is missing, whitespace-only, or the documented bracket stub (brand.postalAddress ships '[Registered business address — Colorado, USA]' on every outreach CAN-SPAM footer). Env presence only; distinct yellow banner; does not geocode. Same-minute dual claim on vercel-token: earlier remote claim owns; later pivots to this twin. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
    rationale:
      "Non-compliant outreach footers are a silent launch blocker and reputation risk — Resend/brand banners can look green while every Email 1 still discloses a placeholder address. Prefer that early CAN-SPAM postal signal, then vercel-project-id or empty-backlog sold-capability / multi-instance regression audits, over inventing optional aggregates while remaining NEXT_STEPS stay secrets/OAuth/counsel-gated.",
  },
  {
    date: "2026-07-14",
    decision:
      "Ship assessVercelProjectIdEnvReadiness + VercelProjectIdEnvBanner when vercel-token-env-readiness is done — token readiness locks Domains API auth, but operators still get no early dashboard signal when shared VERCEL_PROJECT_ID is missing, whitespace-only, or a changeme/project/prj_xxx-style placeholder (tryProvisionVercelDomain still skips unless every handoff gets Assign project). Env presence only; distinct indigo banner; per-handoff Assign project still wins when set. Same-window sibling 01fb shipped company-address-env-readiness (CAN-SPAM postal). Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
    rationale:
      "Token-only Phase 5 after VERCEL_TOKEN goes live is still a silent fulfillment drag — Domains API needs a project target (shared env or Assign project), and every other launch secret already has an operator-visible banner. Prefer that early shared-project signal, then empty-backlog sold-capability / multi-instance regression audits, over inventing optional aggregates while remaining NEXT_STEPS stay secrets/OAuth/counsel-gated.",
  },
  {
    date: "2026-07-14",
    decision:
      "Ship assessConvexUrlEnvReadiness + ConvexUrlEnvBanner when vercel-project-id-env-readiness is done — operators still get no early dashboard signal when NEXT_PUBLIC_CONVEX_URL is missing, whitespace-only, or an example.convex.cloud/changeme-style placeholder (multi-instance / serverless stays SQLite-only while Stripe/Resend/Vercel look ready). Also gate db.ts ConvexHttpClient construction through resolveConvexDeploymentUrl so whitespace-only no longer counts as configured. Env presence only; distinct pink banner; local solo SQLite demos stay fine. Same-window sibling b901 owns email-from-env-readiness. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
    rationale:
      "SQLite-only on Vercel is a silent multi-instance revenue killer — payments and CRM can ACK on one instance and never appear elsewhere. Prefer that early Convex URL signal (and the trim gate bugfix), then fold email-from or empty-backlog sold-capability / multi-instance regression audits, over inventing optional aggregates while remaining NEXT_STEPS stay secrets/OAuth/counsel-gated.",
  },
  {
    date: "2026-07-14",
    decision:
      "Ship email-from-env-readiness (wire brand.emailFrom into Resend from + assessEmailFromEnvReadiness banner) when vercel-project-id-env-readiness is done — Vercel/Stripe/Resend-key banners already cover Domains API + transport, but sendEmail / sendOperatorDailyDigest still hardcoded outreach@updates.localsitestudio.com while launch checklist required EMAIL_FROM and brand.emailFrom already existed. Operators could configure SPF/DKIM on their domain and still send from the wrong From address (silent deliverability + brand leak). Env presence only; distinct lime banner; formatResendFromHeader(brand.name, brand.emailFrom). Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
    rationale:
      "A documented but unused EMAIL_FROM is worse than a missing banner — Resend API-key readiness can look green while every automated send ignores the operator's verified domain. Prefer wiring the From header + early lime readiness signal, then empty-backlog sold-capability / multi-instance regression audits, over inventing optional aggregates while remaining NEXT_STEPS stay secrets/OAuth/counsel-gated.",
  },
  {
    date: "2026-07-14",
    decision:
      "Drop NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY from the required-secret set in assessStripeCoreEnvReadiness / STRIPE_CORE_ENV_NAMES. Verified by grepping the whole repo for loadStripe / @stripe/stripe-js: zero call sites. Both checkout flows (bundle and Commerce Buy now) create a server-side Stripe Checkout Session and redirect the browser to session.url — no client bundle ever constructs a Stripe.js instance, so the publishable key does nothing today. Moved it to a commented-optional .env.example line and updated launch-checklist / architecture docs to stop telling operators it's required.",
    rationale:
      "After 9 consecutive env-readiness-banner iterations (operator-password → app-url → brand-name → production-domain → vercel-token → company-address → vercel-project-id → email-from → convex-url), an empty-backlog audit should also re-examine the banners already shipped, not only look for new missing ones — the class of bug 'we require a var nothing reads' is just as much launch friction as 'we don't warn about a var everything needs,' and is easier to miss because the banner it powers looks like it is doing something useful (StripeCoreEnvBanner still correctly gates on STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET, which ARE load-bearing). Removing a false requirement is a direct reduction in the number of secrets an operator must chase down before the first paid order — the same 'unblock revenue' priority as the readiness banners themselves, achieved by deleting a check instead of adding one.",
  },
  {
    date: "2026-07-14",
    decision:
      "Consolidate AGENT_PROTOCOL from ~198 append-only entries down to ~31 (now ~50 after folding the publishable-key lesson above), organized by concern (cooperation workflow, dual-backend invariants, money/ledger integrity, security/injection, testing, product data-model, docs/stack, current state) instead of a chronological 'X done: prefer Y next' chain. No NEXT_STEPS/BUSINESS_DECISIONS/ITERATIONS entries were touched — those stay strictly append-only per existing protocol; only AGENT_PROTOCOL (already documented as a living rulebook, not an audit trail) was rewritten.",
    rationale:
      "Every free NEXT_STEPS item, every env-readiness banner, and every dashboard action's Vitest coverage is now shipped (verified via a fresh empty-backlog audit: 1091 tests / lint / build all green, no missing Convex-table id column beyond the two known-dead orders.ts exports already reviewed twice, no missing action test file, no un-registered Convex API map entry). AGENT_PROTOCOL had grown into a duplicate historical log of that same completed work — each entry narrating one shipped item plus a now-stale 'prefer X next' pointer chain that no longer reflects reality, since X is done too. That duplication cost every future agent real context-window budget to read before starting, with no cooperation value left (the chain's guidance on which item a sibling should claim next was superseded the moment the referenced item shipped). The full narrative history is preserved verbatim in ITERATIONS (each entry's `shipped` list) and in git history, so nothing is lost — only the now-redundant second copy in AGENT_PROTOCOL is compacted back to the durable, still-actionable rules (Convex/SQLite invariants, money-ledger separation, webhook idempotency, escaping, testing conventions, data-model shapes) a new agent actually needs before writing code.",
  },
  {
    date: "2026-07-14",
    decision:
      "Fix the bundle checkout.session.completed webhook so it only writes bundleReceiptEmailSentNote / bundleDnsHandoffEmailSentNote when sendReceiptEmail / sendEmail resolve { success: true } — never unconditionally after the await, since both functions resolve { success: false, reason/error } (suppression-list hit, Resend API/network failure) rather than throwing. Update route.test.ts's default mocks to resolve { success: true } (the real contract) and add two regression tests asserting each marker stays unwritten on a success:false resolution.",
    rationale:
      "The env-readiness banner chain and per-action test-coverage backlog are both fully exhausted (all remaining NEXT_STEPS are operator/legal-gated). A multi-instance/sold-capability regression audit found a real revenue-integrity bug instead: because the sent-marker was written unconditionally, a suppressed or transiently-failed buyer receipt / DNS handoff email got marked 'sent' forever, and planBundleWebhookSideEffects — the exact mechanism built to let Stripe redelivery recover a missed send — would see that note and skip retrying permanently. A paying customer whose address is on the suppression list (plausible: a cold-outreach lead who unsubscribed, then converted later with the same email) or who hits a Resend outage at checkout time would never receive their receipt or go-live instructions, with no operator visibility since the webhook still returns 200. Fixing a silent, permanent loss of paid-customer fulfillment email beats inventing another optional aggregate while the free backlog stays gated.",
  },
  {
    date: "2026-07-14",
    decision:
      "Add checkRateLimit to POST /api/stripe/billing-portal (key `billing-portal:<clientIp>`, same DEFAULT_RATE_LIMIT/429+Retry-After shape as every other public route) — the only public, state-changing, externally-billed route left without it.",
    rationale:
      "Two consecutive empty-backlog audits (claude/relaxed-galileo-j64ij9, claude/agent-protocol-consolidation) found no new gap, so this run re-swept the already-shipped security invariants instead of hunting for a tenth env-readiness banner. billing-portal is public, keyed only by a client-supplied sessionId (leakable via browser history / Referer off /checkout/success?session_id=), and fires two live Stripe API calls per request once STRIPE_SECRET_KEY is set — structurally identical to contact / checkout / commerce-checkout / preview-open / unsubscribe, all five of which the rate-limit module's own docstring already named as its guard set, yet billing-portal was missing from both the code and that docstring. Unthrottled it lets a scripted client burn Stripe API quota/cost indefinitely or brute-force-probe sessionId values with no backoff — a real, if modest, cost/abuse exposure on a route that already ships real code, not a manufactured metric. Fixing an overlooked instance of an existing, already-proven pattern beats inventing a new optional aggregate just to have something to ship this run.",
  },
  {
    date: "2026-07-14",
    decision:
      "Decouple Commerce Buy now client-receipt redelivery from operator-inquiry presence: add commerceOrders.clientReceiptEmailSentAt (SQLite migration + Convex, mirror paidOutAt) and teach planCommerceWebhookSideEffects to recover inquiry and receipt independently. Write the marker only when sendCommerceBuyNowClientReceipt resolves { success: true }; marker-write failures return 5xx (commerce_client_receipt_sent_marker).",
    rationale:
      "Free NEXT_STEPS stayed fully gated after PR #184/#185. Empty-backlog audit of webhook recovery found the inverse of the bundle false-success-marker bug: commerce never wrote a receipt sent-marker at all, and once a commerce_checkout inquiry existed, planCommerceWebhookSideEffects skipped BOTH inquiry and receipt forever — so a first delivery that wrote the inbox then hit Resend suppression/outage permanently lost the sold order-notification email to lead.email, with Stripe redelivery unable to recover it. Bundle already solved the independent-marker pattern for receipt/DNS; Commerce is the sold twin of that promise. Fixing permanent loss of a paid Commerce client's order notification beats inventing another optional aggregate while remaining NEXT_STEPS stay secrets/OAuth/counsel-gated.",
  },
  {
    date: "2026-07-14",
    decision:
      "Make updateLeadStageAction + addLeadAction inspect sendOutreachEmail's `{ success }` result after the durable Email 1 mark (persist-then-notify stays; never roll back the mark) and return success:false with an operator-visible suppression/Resend error — same contract as sendFollowUpAction / disposeColdLeadAction / replyToInquiryAction. Sibling business-process-evolution-6445 owns the complementary commerce-client-receipt-redelivery-recovery webhook twin.",
    rationale:
      "Free NEXT_STEPS stayed fully gated after PR #184/#185; sibling 6445 already claimed the Commerce Buy now receipt-redelivery twin of the bundle marker bug. A complementary sold-capability audit found the top-of-funnel twin: stage/add paths treated a resolved `{ success: false }` as a successful send, so operators saw a green UI while Email 1 never left Resend and the lead looked outreach_sent in Work next. That silently stalls the discovery→preview funnel without inventing a new metric — surface the failure, keep the mark, leave commerce receipt recovery to the earlier remote claim.",
  },
  {
    date: "2026-07-14",
    decision:
      "Ship no code this run — document a clean audit instead of re-running the same 5 bug classes a 3rd/4th consecutive time or manufacturing a new optional metric. Add one AGENT_PROTOCOL clarification: once 2+ consecutive audits confirm a bug class clean, the next agent should rotate to an unchecked axis (sold-vs-shipped doc reconciliation, a different orchestrator's test coverage, a different security surface) rather than re-verifying the same invariants a marginal-value 3rd time.",
    rationale:
      "Delegated a fresh sweep of the 5 bug classes this log tracks (durable-marker-after-unchecked-await, Convex API map gaps, uncapped debt lists, escapeHtmlForEmail/safeJsonLdScript, webhook idempotency) across every call site named in AGENT_PROTOCOL and found nothing new at the time this audit ran — this branch's own audit missed the updateLeadStageAction/addLeadAction Email 1 gap that sibling email-1-outreach-send-success-check (the decision immediately above) found and fixed the same day, so treat this as a clean pass on the webhook/ledger call sites actually inspected, not a guarantee the whole bug class was exhaustive. Independently cross-checked that every list*Due/Missing/Unsynced helper (marketing packs, client voice packs, commerce catalogs missing/unsynced, follow-ups due, cold leads, abandoned checkouts, unpaid commerce orders, unreplied inquiries) is wired into both src/lib/metrics/pipeline-health.ts and src/lib/digest/daily-digest.ts — no orphaned sold-capability helper missing from either surface. Also confirmed /docs/product-bundles' per-bundle promises already cite the exact implementing module and test file for each claim (catalog sync, archive-orphans, commerce order-notification email, payout tracking), so a manual sold-vs-shipped reconciliation pass would just be re-reading that doc. Shipping a fake feature or repeating an already-clean check a further time to have a diff would cost sibling agents more (thrash, wasted audit cycles) than an honest 'still clean' entry costs them (a few minutes reading this decision before picking their own axis). Worth noting in AGENT_PROTOCOL so the audit rotation itself becomes a repeatable practice instead of every agent re-deriving 'what's already been checked' from ITERATIONS prose — with the caveat above, that rotation should still expect near-miss gaps like this one rather than treat 'clean' as absolute.",
  },
  {
    date: "2026-07-14",
    decision:
      "Validate POST /api/stripe/billing-portal's body.returnUrl against the derived appUrl's origin before passing it to stripe.billingPortal.sessions.create — any missing, malformed, or cross-origin value now falls back to the existing derived default instead of being trusted verbatim, mirroring the safeNextPath pattern already used for the operator-login redirect.",
    rationale:
      "Two remote siblings (cursor/business-process-evolution-6445, cursor/prompt-process-evolution-b16c) had already claimed the two known bugs from the prior audit window before this run started, so duplicating either would have wasted a full iteration on work already in flight. A fresh sweep of different angles found that billing-portal — public, keyed only by a client-supplied Checkout Session id that is not truly secret — forwarded an attacker-controlled returnUrl straight into a live Stripe API call with no validation, letting anyone with a valid session id get Stripe to mint a real billing.stripe.com URL that redirects to an attacker's page on exit. That is a genuine open-redirect using the merchant's own trusted Stripe domain as cover for phishing, not a stylistic nitpick — and the fix is cheap (a same-origin check the codebase already had a template for) with zero behavior change for every legitimate caller, since the only real caller (manage-billing-button.tsx) always sends window.location.origin. Shipping a concrete, verifiable security fix beats inventing an optional aggregate or waiting idle while siblings finish their claimed items. This audit run also independently re-checked the open-redirect surface the prior clean-audit pass (decision above) did not cover — that pass rotated to sold-capability wiring, not security surfaces, so this is a genuinely new axis rather than a re-derivation.",
  },
  {
    date: "2026-07-14",
    decision:
      "Extract the pure SQLite row<->Lead mapping (hours/services serialize+parse, category/tier/default fallbacks) out of src/lib/db.ts into src/lib/leads/sqlite-row-mapping.ts (no `server-only` import) and give it direct Vitest coverage, rather than attempting a full db.ts fallback-path test harness or leaving the gap undocumented.",
    rationale:
      "Delegated a fresh empty-backlog audit rotated to two axes not yet explicitly checked (CSV import/export injection, orchestrator test-coverage completeness) per the audit-rotation rule. CSV came back clean (no export sink exists at all; import already quote/comma-escapes correctly). Test-coverage did not: db.ts is the single module every Convex-primary/SQLite-fallback write funnels through, yet has zero direct test file, and confirmed (by trying to import it in Vitest) that it throws under `server-only` exactly like resend.ts already documents — every existing test instead mocks `@/lib/db` wholesale, so the fallback logic AGENT_PROTOCOL itself names as risky (Convex API map gaps, hours/services round-trip) has never actually executed under test. Rather than reshape db.ts's Convex/SQLite branch structure itself — a much larger, riskier change with no clear stopping point for one iteration — pulled out just the pure, side-effect-free mapping functions the row round-trips through, following the same testability pattern the codebase already established for stripe-sync.ts. This closes a real, narrowly-scoped coverage gap in a payment/lead-critical path (import-leads-csv and addLeadAction both flow through upsertLead's SQLite fallback) with a small, low-risk diff, and incidentally fixed a genuine inconsistency: upsertLead's update/insert path always appended a '· ' hours separator even with no weekend hours, unlike the demo-seed path's conditional format (both round-tripped correctly on read, so not data loss, just needless stored noise and a second source of truth for the same format). Verified via `npm run dev` that /dashboard/leads still renders demo lead hours/services correctly after the refactor.",
  },
  {
    date: "2026-07-14",
    decision:
      "Wire pipeline-health openHandoffCount into the operator daily digest as a Production handoffs open action section (status !== live, same predicate; listDeployHandoffs in sendDailyDigestAction) rather than inventing a new metric or re-running the list*Due/Missing/Unsynced wiring audit that already declared clean.",
    rationale:
      "Free NEXT_STEPS stayed fully gated after PR #190. Empty-backlog audit rotated to pipeline-health/digest wiring completeness and found that PR #188's clean pass only checked named list*Due/Missing/Unsynced helpers — it missed openHandoffCount, which is computed inline from handoffs on the dashboard but never loaded into buildDailyDigest. Paid sites awaiting DNS / Mark live are the highest-urgency post-payment fulfillment debt; a single-operator business that relies on Send daily digest would never see them. Closing that sold-capability visibility gap beats another identical bug-class re-audit or a manufactured optional aggregate. Sibling business-process-evolution-c966 had not pushed a remote claim when this was claimed.",
  },
  {
    date: "2026-07-14",
    decision:
      "Make POST /api/contact/[slug] inspect sendEmail's `{ success }` after the durable inquiry persist (visitor ok:true stays persist-required) — log inquiryId + reason/error on success:false, return notifySent on the response, and fix route tests to mock the real `{ success: true }` contract plus a success:false regression. Queue bootstrap-prices-operator-auth-rate-limit for siblings. Same-window sibling e73c / PR #192 owns open-handoffs-in-digest.",
    rationale:
      "Free NEXT_STEPS stayed gated after PR #190; sibling e73c rotated to digest wiring and shipped open handoffs. A complementary re-check of the durable-marker-after-unchecked-await class on public routes found the Starter sold contact notify still treated a bare await as delivery — sendEmail never throws on suppression/Resend failure, so business owners could miss inquiry alerts with only a CRM row and no operator-visible signal. Closing that silent notify gap (and queuing the bootstrap-prices auth/rate-limit twin) beats inventing an optional aggregate while remaining NEXT_STEPS stay secrets/OAuth/counsel-gated.",
  },
  {
    date: "2026-07-14",
    decision:
      "Add requireOperatorAuth as the first check in POST /api/stripe/bootstrap-prices, plus checkRateLimit per client IP for defense-in-depth, exactly mirroring bootstrapStripePricesAction and the existing src/app/api/marketing/generate/route.ts / billing-portal precedents, rather than relying solely on the ALLOW_STRIPE_BOOTSTRAP env gate for that route.",
    rationale:
      "Delegated a fresh empty-backlog audit that swept pipeline-health/digest wiring (clean — every list*Due/Missing/Unsynced helper and inline aggregate is wired into both surfaces) and Convex/SQLite parity (clean — full 1:1 match between convex/*.ts exports and the static API map in db.ts, every requireConvex-eligible write path already covered) before finding a real authorization-parity gap: the API route and its dashboard-action twin were documented as sharing 'the same gate,' but only the action ever checked requireOperatorAuth. Since proxy.ts scopes its auth gate to /dashboard/* only, the API route's actual protection during an operator's bootstrap window (ALLOW_STRIPE_BOOTSTRAP=1 set on a live, password-protected deployment, per /docs/launch-checklist) was a single shared env flag with no per-caller check — anyone who requested the publicly-documented path during that window could trigger live Stripe Product/Price creation and read back the envSnippet, with no session cookie required. Rebasing onto sibling business-process-evolution-c966's merge found they had already diagnosed this exact gap during their own audit and queued it (bootstrap-prices-operator-auth-rate-limit, explicitly asking for both requireOperatorAuth and checkRateLimit) rather than build it themselves — folded that queued item into this fix by shipping both halves, matching the rate-limit pattern billing-portal already established, instead of shipping auth alone and leaving rate-limiting queued a second time.",
  },
  {
    date: "2026-07-14",
    decision:
      "Extract all 7 remaining private SQLite row-mapping/JSON-parsing helpers left in src/lib/db.ts (deploy handoff, marketing pack, commerce catalog, commerce order, client voice pack, client inquiry, checkout session) into per-domain sqlite-row-mapping.ts modules with direct Vitest coverage, and fix a missing Array.isArray guard on deploy handoff's dnsInstructions/notes JSON.parse found while doing so — rather than leave the gap sqlite-row-mapping-test-coverage's scope note implicitly left open, or invent an unrelated feature.",
    rationale:
      "Free NEXT_STEPS backlog stayed fully gated after PR #194; the one fresh finding from this run's audit (leads-client.tsx optimistic-state desync) was already claimed in-progress by sibling claude/upbeat-dijkstra-yrtt98 before this run started. Rather than duplicate that work or run yet another identical pass of the already-clean bug-class sweep (durable-marker-after-unchecked-await, Convex API map, uncapped lists, escaping, webhook idempotency), completing the SQLite row-mapping extraction db.ts's earlier pass (sqlite-row-mapping-test-coverage, PR #189) started for Lead but left undone for every other table closes a well-scoped, low-risk gap: these helpers round-trip exactly the kind of stored JSON (dnsInstructions, notes, marketing/voice pack variants, commerce catalog items) that a future migration or hand-edited row could corrupt, and none of them had ever executed under test — every existing test mocks @/lib/db wholesale, same server-only blocker sqlite-row-mapping-test-coverage documented. Finding and fixing the missing Array.isArray guard on deploy handoff's two parsers (which the other three JSON-parsing siblings in the same file already had) is exactly the kind of latent defensive-correctness gap this extraction work is designed to surface — a concrete instance of 'this exact bug class is NOT fully exhausted yet,' just found on data-shape guards rather than the send-success-check class that phrase originally flagged.",
  },
  {
    date: "2026-07-14",
    decision:
      "Add a paidNotLive action section to the operator daily digest (leads with stage=\"paid\", same predicate as pipeline-health's paidNotLiveCount) rather than treating openHandoffs as sufficient coverage for post-payment fulfillment debt.",
    rationale:
      "Delegated a fresh empty-backlog audit after PR #194 (bootstrap-prices-operator-auth-rate-limit). Re-checked route/action auth-parity first (the exact bug class just fixed) and found it clean across all 28 dashboard actions and every public API route. Rotated to pipeline-health/digest wiring and found a real gap PR #192's openHandoffs fix didn't cover: a lead can be moved to stage=paid via the dashboard stage dropdown or CSV import (e.g. an operator migrating pre-existing paying clients into the CRM) with no deploy_handoffs row ever created for it — so it counts toward paidNotLiveCount on the dashboard forever, but can never appear in the digest's openHandoffs section, which filters the handoffs table, not lead stage. Revenue collected with no fulfillment reminder is one of the highest-stakes operator-visibility gaps this app can have (broken delivery promise, refund/chargeback risk) — worse than the handoff-row case because it can persist with zero record in the deploy pipeline. The fix needed no new data load (leads is already a buildDailyDigest input) and follows the exact pattern openHandoffs established, so it carries the same low implementation risk while closing a materially different failure mode.",
  },
  {
    date: "2026-07-14",
    decision:
      "Add an uncapped *Count field to DailyDigest for every capped action section (Follow-ups due, Abandoned checkouts, Abandoned Buy now, Unreplied inquiries, Marketing packs due, Starter upsell, Commerce catalogs missing/unsynced, Complete voice packs due, Commerce payouts owed, Production handoffs open, Paid not yet live) and repoint every section header in renderDailyDigestHtml to it, rather than leave section titles reading the capped display array's .length.",
    rationale:
      "Delegated a fresh empty-backlog audit after PR #196 (paid-not-live-in-digest). Re-checked the disjoint-aggregate trap across every remaining pipeline-health/daily-digest field pair (clean — the rest all share one underlying list*/is* helper each, so they can't diverge) before finding a different bug in the digest's rendering layer: every action-section title used its capped display array's .length as the header count, so once a queue naturally exceeds its hardcoded 5-row LIMIT, the header silently freezes at '(5)' forever regardless of true volume — e.g. 12 leads actually due for a follow-up email would show 'Follow-ups due (5)' with 7 completely invisible. This is the exact 'silently undercounts once volume exceeds the page window' failure mode AGENT_PROTOCOL already flags for uncapped data-layer debt lists, just recurring one layer up in the digest's own display logic rather than a raw Convex/SQLite query. commercePayoutsOwedTotalUsd already avoided this by computing its dollar sum before the slice; the fix generalizes that same pattern (capture the filtered array once, take .length before .slice(0, LIMIT)) to every other section rather than leaving it as a one-off. A single-operator business trusting the digest email to gauge urgency without opening the dashboard is exactly the audience this bug silently fails.",
  },
  {
    date: "2026-07-14",
    decision:
      "Wire pipeline-health leadsMissingEmailCount into the operator daily digest as a Leads missing email action section (same leadIsMissingCriticalEmail predicate — email-critical stages with empty/whitespace email), exporting the shared helper from pipeline-health rather than forking a parallel stage list in the digest, and following the digest-section-counts-uncapped *Count header pattern. Same-minute sibling business-profitability-process-8f90 owns marketing-generate-rate-limit + list-unpaid-empty-string-parity.",
    rationale:
      "Free NEXT_STEPS stayed fully gated after PR #196 (paid-not-live-in-digest). Continuing the pipeline-health/digest wiring axis found a third distinct inline aggregate still dashboard-only: leadsMissingEmailCount. Unlike openHandoffs (deploy_handoffs table) and paidNotLive (stage=paid fulfillment debt), this is top-of-funnel contact debt — without a usable email, Email 1 / follow-ups / abandoned-checkout recovery / receipts cannot leave Resend at all, so revenue motion stops before payment. A single-operator business that relies on Send daily digest would never see those rows. Exporting leadIsMissingCriticalEmail keeps the digest and dashboard on one predicate (no silent drift if EMAIL_CRITICAL_STAGES changes). Closing that sold-capability visibility gap beats inventing an optional metric or re-running an already-clean auth/marker audit while remaining NEXT_STEPS stay secrets/OAuth/counsel-gated.",
  },
  {
    date: "2026-07-14",
    decision:
      "Add checkRateLimit to POST /api/marketing/generate (key `marketing-generate:<clientIp>`, after requireOperatorAuth, same DEFAULT_RATE_LIMIT/429+Retry-After shape as bootstrap-prices) rather than treating auth alone as sufficient throttling.",
    rationale:
      "Free NEXT_STEPS stayed fully gated after PR #196 (paid-not-live-in-digest). Empty-backlog audit rotated off digest wiring (just closed) onto the rate-limit guard-set axis that previously caught billing-portal and bootstrap-prices. marketing/generate already had requireOperatorAuth — and PR #196's auth-parity pass therefore marked it 'clean' — but when OPERATOR_DASHBOARD_PASSWORD is unset (documented open demo), auth returns ok for every caller, so the route could burn Anthropic quota (or hammer the stub path) with no backoff. Auth-gated /api twins still need the same per-IP limiter the public write routes share; shipping that before inventing another optional aggregate protects Growth/Complete AI pack cost while the remaining NEXT_STEPS stay secrets/OAuth/counsel-gated. Sibling prompt-process-evolution-2101 claimed leads-missing-email-in-digest; yrtt98 still only owns leads-client-optimistic-state-desync (claim-only). Folded PR #197 digest-section-counts-uncapped.",
  },
  {
    date: "2026-07-14",
    decision:
      "Make Convex commerceOrders.listUnpaid treat falsy/blank paidOutAt as unpaid (matching SQLite `IS NULL OR = ''` and isCommerceOrderPaidOut's Boolean), and normalize empty strings to undefined in mapOrderRow / mapCommerceOrderRow.",
    rationale:
      "Same empty-backlog audit that found the marketing-generate rate-limit gap also found a latent Convex/SQLite owed-total parity bug: listUnpaid filtered `paidOutAt === undefined` only, so an empty-string marker would drop out of Convex owed totals while SQLite and TS still counted it unpaid — multi-instance split-brain on Commerce payout liability (double-pay or missed-pay risk). Closing both findings in one iteration keeps money-ledger and cost-abuse axes moving without inventing a new metric; Connect remains operator/legal-gated.",
  },
  {
    date: "2026-07-14",
    decision:
      "Fix leads-client.tsx to key the just-added lead's local-state row on addLeadAction's server-returned (normalized) slug instead of the raw form input, and to revert only the affected row — not the entire leads list back to the page-load snapshot — when an optimistic stage change fails; extract both as pure, directly-testable helpers in src/lib/leads/optimistic-updates.ts rather than leaving the logic inline and untested.",
    rationale:
      "Free NEXT_STEPS stayed fully gated after PR #198 (leads-missing-email-in-digest). Sibling claude/upbeat-dijkstra-yrtt98 had pushed only a claim commit for this id over an hour earlier with no follow-up feature code, so per AGENT_PROTOCOL's stale-claim rule this run re-claimed and independently re-verified the diagnosis by reading the current leads-client.tsx / actions.ts before fixing, rather than trusting the stale branch's prose. Both bugs are real, sold-capability-affecting defects an operator would hit directly: a mistyped Slug field on manual Add Lead silently orphans a dashboard row from its DB record, and any single failed stage change (e.g. a transient Convex hiccup) would previously roll back every other change made in the browser tab that session, including leads added minutes earlier — a severe, surprising data-loss-looking UX bug with no error message explaining why. This codebase has no React component test infrastructure (no @testing-library/react anywhere), so rather than skip coverage or bolt on a new testing framework for one fix, the two behaviors were extracted into pure functions mirroring the notes.ts pattern this same file already uses, giving the fix real regression coverage without expanding the test stack.",
  },
  {
    date: "2026-07-14",
    decision:
      "Ship no code this run — re-confirm the two axes AGENT_PROTOCOL's rotation note lists as unchecked (sold-vs-shipped /docs/product-bundles reconciliation; orchestration module test-coverage gaps) are still clean after 9 more merged PRs since claude/upbeat-dijkstra-3duvyp (PR #188) first checked them, rather than re-run the marker-after-unchecked-await/Convex-map/uncapped-list/escaping/webhook-idempotency sweep a further time or manufacture a feature. Narrow AGENT_PROTOCOL's rotation-note wording so it no longer offers these two axes as fresh options to the next agent — they're now 2x-confirmed, same threshold the rule itself uses to retire an axis.",
    rationale:
      "Free NEXT_STEPS backlog stayed fully gated after PR #197 (digest-section-counts-uncapped); the 4 remaining items (stripe-price-objects, lead-ingestion, marketing-content-scheduling, commerce-payouts-stripe-connect) are unchanged and still operator/legal-gated. Three siblings (cursor/prompt-process-evolution-2101 leads-missing-email-in-digest, cursor/business-profitability-process-8f90 marketing-generate-rate-limit, claude/upbeat-dijkstra-yrtt98 leads-client-optimistic-state-desync) had already claimed the freshest known gaps within the hour before this run started, so duplicating any of them would have wasted a full implementation cycle on one side once the claims resolved. Delegated a genuinely independent re-check of the two axes PR #188 opened but no run since has revisited: (a) read /docs/product-bundles line by line and verified ~20 specific capability claims (requireConvex fail-closed gates on Generate pack/voice/catalog, archive-orphans never auto-triggered from save/sync, Mark paid out and the dashboard 'Commerce sales' card sharing one !paidOutAt filter, the independent clientReceiptEmailSentAt recovery marker wired end-to-end, commerce checkout resolving price server-side only, full HTML-escaping on the Buy now client receipt, the exact monthly-pack content-type list, Email 2/3 cadence constants, and every named test file actually existing with matching assertions) against current code — all still true; the doc's voice-agent-flow webhook-routing section is explicitly labeled Phase 7 future-state, not drift; (b) enumerated every non-test, non-type, non-page file under src/lib/{digest,leads,marketing,voice,commerce,checkout,billing,pricing,email,payments,security,stripe}, all three \"use server\" actions files, and all 9 API route.ts handlers, confirming every exported function with real branching logic has a sibling *.test.ts — the only gaps are pure-type files and db.ts's documented server-only exception (whose logic is already extracted into tested sqlite-row-mapping.ts modules). Both axes came back clean a second time, past the '2 consecutive clean passes' bar the rotation rule itself uses to retire a bug-class set — so narrowed the rotation note's axis list rather than leave the next empty-backlog agent re-deriving the same 'already checked twice' conclusion from ITERATIONS prose. A dated 'still clean' entry plus a corrected rotation pointer is worth more to sibling agents right now than a 3rd read-through of a doc that hasn't drifted, or a feature invented solely to have a diff.",
  },
  {
    date: "2026-07-14",
    decision:
      "Add a getLeadBySlug existence check to updateLeadStageAction before the stage write, returning { success: false, error: \"Lead not found\" } on an unknown slug instead of letting a SQLite UPDATE silently match zero rows and still return success:true.",
    rationale:
      "Empty-backlog audit after PR #203/#199. A same-minute duplicate diagnosis of the exact leads-client-optimistic-state-desync bug PR #203 had just fixed was independently found and immediately discarded once confirmed superseded (PR #203's fix was a strict superset — it also caught an addLeadAction slug-normalization bug this run's independent finding had missed), rather than shipped as a second competing implementation per the dual-claim protocol. Rotated to client-submitted-id existence checks and found updateLeadStageAction was the one write action in actions.ts that skipped the getLeadBySlug-then-404 pattern every sibling action already follows — it called updateLeadStage(slug, ...) directly on the raw parameter. Confirmed via db.ts that the SQLite fallback's UPDATE ... WHERE slug = ? matches zero rows and never throws on an unknown slug, so a mistyped/stale/scripted slug returned a false-positive success:true with nothing written — untested by the existing suite, which only exercised a 'lead missing' scenario for the later outreach-email branch, never for the write itself. The fix reuses the one lookup for both the existence check and the outreach_sent branch's email decision (no second fetch), so it carries zero added latency over the previous code path.",
  },
  {
    date: "2026-07-14",
    decision:
      "Extract resolveTrustedAppUrl (src/lib/security/app-url.ts) to validate the x-forwarded-host/host header-derived appUrl fallback as a well-formed absolute URL before use, wire it into both openBillingPortalAction and sendDailyDigestAction, and add escapeHtmlForEmail around the digest's baseUrl as defense-in-depth — rather than continue trusting a raw header value into an outbound email href and a Stripe return_url.",
    rationale:
      "Empty-backlog audit after PR #205 (update-lead-stage-action-existence-check) and PR #199 (re-confirmed clean twice). With route/action auth, digest wiring, db.ts test coverage, sold-vs-shipped docs, and leads/actions.ts existence checks all exhaustively covered today, rotated to the two remaining unchecked candidates the brief specified: a separate dashboard/actions.ts existence-check sweep (clean — every action there already fetch-then-404s or has no client-submitted id) and a fresh pass over header-derived values used in security-relevant decisions. Found that both openBillingPortalAction and sendDailyDigestAction build an appUrl fallback directly from x-forwarded-host/host with zero validation when NEXT_PUBLIC_APP_URL is unset, and that value flows unescaped into the digest's outbound email link (violating the same escapeHtmlForEmail invariant already enforced everywhere else in that file) and into a genuine Stripe billing-portal return_url with no same-origin/well-formedness check — the public billing-portal route's isSameOriginReturnUrl protects a client-body returnUrl against a derived appUrl, but nobody had considered the derived appUrl itself untrusted when it falls back to headers. Both actions are operator-authenticated, so the practical blast radius is narrower than the already-fixed public open-redirect case, but the fix is cheap, mirrors an established pattern exactly (parse-or-reject, fall back to a safe default), and closes a real gap against the protocol's own escaping rule regardless of how exploitable the header-spoofing threat model is in any given deployment.",
  },
  {
    date: "2026-07-14",
    decision:
      "Extract shared safeNextPath into src/lib/auth/safe-next-path.ts and use it from both the login page (already-authenticated redirect + hidden next field) and loginOperatorAction — rejecting protocol-relative //, backslash host tricks, control chars, scheme-smuggled paths, non-dashboard paths, and /dashboard/login self-loops — rather than leave the page on a weaker startsWith('/') twin that accepted //evil.example. Fold the complete fix already on grok/dev-work-login-open-redirect (no open PR) onto the automation branch that can merge.",
    rationale:
      "Empty-backlog after PR #206: free NEXT_STEPS stayed operator/legal-gated. Security audit of client-supplied redirect surfaces found a real page/action twin gap: loginOperatorAction already blocked // via a private safeNextPath, but DashboardLoginPage used params.next.startsWith('/') for the already-authenticated redirect and the form hidden field — so any operator with a live session who opened /dashboard/login?next=//evil.example was open-redirected off-origin (and the hidden field would re-submit the same value on re-login). Billing-portal already closed its absolute-URL return_url twin (PR #189); this closes the relative-path next twin the protocol names as the mirror pattern. Sibling CLI branches already had the full fix with no open PR (Actions token blocked) — folding beats leaving a live open-redirect while inventing an optional aggregate or re-running a 2x-confirmed clean axis.",
  },
  {
    date: "2026-07-14",
    decision:
      "In syncCommerceCatalogToStripeAction, re-read the Commerce catalog immediately before the final upsertCommerceCatalog write and merge in only the freshly-created Stripe ids via preserveCommerceStripeIds(freshItems, synced), instead of writing the pre-sync-loop items array verbatim.",
    rationale:
      "Seventh consecutive empty-backlog audit today, explicitly instructed to accept a documented clean pass given how exhaustively the day's surface (auth, rate-limiting, digest wiring, db.ts coverage, sold-vs-shipped docs, existence checks, header trust) had already been swept — a real, previously-undetected bug was getting genuinely harder to find, and the protocol prefers an honest clean report over a manufactured one. Checked N+1 query patterns (clean) and re-verified BUSINESS_DECISIONS/ITERATIONS slice bookkeeping against a stale unmerged draft's claimed drift (clean, no actual mismatch). Found one real issue: syncCommerceCatalogToStripeAction reads the catalog once, then runs a sequential per-SKU Stripe API loop (up to 50 SKUs) — a materially long, genuinely concurrency-relevant window, not a theoretical one-tick race — before writing the entire items array back with no version/CAS guard. A concurrent saveCommerceCatalogAction landing in that window (a second tab, or an operator editing again right after clicking Sync) would be silently discarded, losing a price change, added SKU, or removed SKU on the exact data that drives Buy now checkout pricing. The fix reuses preserveCommerceStripeIds — already tested and already the established pattern for merging Stripe ids onto a fresher item set — just with its two argument roles swapped from how saveCommerceCatalogAction calls it, so it required no new merge logic, only recognizing that the existing helper already does exactly what's needed for the other side of the read-then-write window.",
  },
  {
    date: "2026-07-14",
    decision:
      "Add resolveStripeRedirectAppUrl (NEXT_PUBLIC_APP_URL > VERCEL_URL > localhost, never request Host/origin) and wire it into POST /api/stripe/checkout, /api/commerce/checkout, /api/stripe/billing-portal, and openBillingPortalAction — keep resolveTrustedAppUrl for operator-facing digest links only.",
    rationale:
      "Empty-backlog after PR #206. Sibling business-process-evolution-07e5 claimed login-authenticated-open-redirect first, so this run pivoted to the complementary Host-trust gap on public Stripe money routes: they still used `NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin`, which lets an unauthenticated Host-spoof mint Checkout success/cancel URLs (and bypass billing-portal isSameOriginReturnUrl) on an attacker origin when APP_URL is unset. resolveTrustedAppUrl alone is the wrong tool — it still trusts well-formed attacker hosts. VERCEL_URL preserves preview deploys without trusting request Host. Shipping this beats inventing an optional aggregate or re-auditing sold-vs-shipped/orchestration (2x-clean).",
  },
  {
    date: "2026-07-14",
    decision:
      "Split archiveCommerceStripeProducts (archive-only, no listing) out of archiveOrphanCommerceStripeProducts (kept as an unchanged list+archive convenience wrapper for existing callers), and have archiveOrphanCommerceStripeProductsAction re-read the catalog between the list and archive steps, dropping any candidate whose skuId reappeared in the fresh read.",
    rationale:
      "Eighth consecutive empty-backlog audit today. Sibling PR #209 (stripe-redirect-app-url-no-host-trust) merged mid-window on the exact appUrl/Host-trust territory this run was told to leave alone, confirming that steering clear of active sibling work was the right call rather than risking a duplicate or conflicting change. Checked the same TOCTOU pattern (already fixed once today for syncCommerceCatalogToStripeAction) against the LLM-generation actions and found it doesn't apply there — regenerating a marketing/voice pack always writes a fresh, complete object with nothing carried over from a prior read, so two concurrent regenerations just resolve last-write-wins, which is the intended behavior for a 'replace this month's pack' action, not a lost-update. Found the identical bug class in a different action instead: archiveOrphanCommerceStripeProductsAction's orphan set is computed once, before a real, paginated account-wide Stripe products.list scan and a sequential archive loop — a concurrent re-add of a SKU during that window would have its live Stripe Product silently archived, breaking that SKU's Buy now checkout with the action still reporting success. The fix mirrors the exact re-read-before-mutate pattern the sync-to-Stripe fix established earlier today, generalizing it from 'stale snapshot overwrites a DB write' to 'stale snapshot drives an external-API mutation' — the same root cause, a different write target.",
  },
  {
    date: "2026-07-14",
    decision:
      "Add a containsDotDotSegment(path) check inside isSafeNextPath (src/lib/auth/safe-next-path.ts) that fully percent-decodes the pathname (failing closed on a malformed escape) and rejects any `/`-split segment equal to `..` — covering both a literal /dashboard/../checkout and its percent-encoded twin /dashboard/%2e%2e/checkout — rather than leave the existing startsWith(\"/dashboard/\") prefix check as the only structural gate.",
    rationale:
      "Ninth consecutive empty-backlog audit today; only one unrelated open PR (#202, draft) existed, so no sibling-collision risk. Reviewed the newest sibling-authored security code (safe-next-path.ts, PR #208) instead of re-running an already-exhaustively-covered axis, since a freshly-landed file is exactly where a new agent hasn't yet had a chance to double-check every branch. Found that isSafeNextPath's prefix check (`path === \"/dashboard\" || path.startsWith(\"/dashboard/\")`) is satisfied by /dashboard/../checkout?ref=x even though every browser normalizes that to /checkout?ref=x before ever issuing the redirect — a real, verified contract violation (same-origin escape from the documented /dashboard/*-only restriction, not a cross-domain open redirect) with zero existing test coverage for any dot-segment shape. Verified both by manual trace of every existing conditional against the exploit string and by empirically confirming the exact normalization behavior with Node's `new URL()` (literal .. and percent-encoded %2e%2e both collapse; a harmless single dot does not escape the prefix). The fix's percent-decode-then-split approach is deliberately conservative rather than exactly mirroring browser behavior: because decodeURIComponent turns %2f into a literal slash before the segment split, an escaped-slash variant like /dashboard/..%2fcheckout also gets rejected even though real browsers keep %2f as an inert literal within one segment (not a path separator) and never actually escape /dashboard/* through that specific string. Over-rejecting an ambiguous encoding is the standard, safer posture for a security gate — no legitimate dashboard next-path needs a literal %2f — so accepting a handful of harmless false rejections in exchange for closing every real decode-then-traverse variant is the right tradeoff over trying to precisely replicate one browser's undocumented escaping quirks.",
  },
  {
    date: "2026-07-14",
    decision:
      "Sanitize a client-supplied checkout slug to [a-z0-9-]+ inside resolveBundleCheckoutLeadSlug (src/lib/checkout/organic-attribution.ts), falling back to minting an organic-* slug when sanitization leaves nothing — rather than continue trimming-only and persisting an unrestricted slug straight from an unauthenticated POST /api/stripe/checkout body.",
    rationale:
      "Tenth consecutive empty-backlog audit today. Dispatched a background review agent specifically to look for a fresh instance of the dot-segment-traversal class just fixed on the login-redirect surface (PR #213), reasoning that any other input surface feeding path/host construction was worth re-checking against that exact class rather than re-running a fully-covered axis. It found that resolveBundleCheckoutLeadSlug — the one lead-slug-creation path this session hadn't yet checked — only trims a client-supplied slug, unlike slugifyBusinessName / addLeadAction / CSV import's slug-column sanitize, which all already normalize to [a-z0-9-]+. Independently re-verified the finding: an unauthenticated, real-payment-gated POST to /api/stripe/checkout with an arbitrary slug value flows through session.metadata.slug into the webhook's recordLeadPayment/markLeadPaid (which persists it verbatim as a brand-new paid lead — no existing-lead gate on this path), then into suggestedHost/previewUrl/contactFormUrl (src/lib/deploy/handoff.ts) and proxy.ts's preview-subdomain rewrite, where a `..`-segment slug collapses the rewrite target via WHATWG URL path normalization while proxy.ts's dashboard auth gate only inspects the ORIGINAL incoming pathname, not the post-rewrite destination — and dashboard/leads/page.tsx has no independent auth check of its own, relying entirely on the proxy gate for rendering (only its server actions separately call requireOperatorAuth). Separately checked the sibling public route POST /api/commerce/checkout, which also accepts a client-supplied slug with no sanitization, and confirmed it is NOT exploitable the same way — it requires getCommerceCatalog(slug) to match an existing catalog before anything is persisted, so a malformed slug there just 404s — left it unchanged per 'don't add validation for scenarios that can't happen.' The exact network-layer reachability of the proxy.ts rewrite-based auth bypass specifically is narrowed by Host headers not syntactically supporting `/` or `..` at the DNS/TLS layer, but the underlying violation — an unauthenticated, payment-gated path able to persist a lead slug that isn't a safe [a-z0-9-]+ token at all, an invariant every other lead-slug-creation path already enforces — is real regardless of that one specific downstream chain's practical reach, and the fix is cheap and consistent with the established pattern.",
  },
  {
    date: "2026-07-14",
    decision:
      "Gate /preview/[slug] sitemap inclusion and robots indexability on a shared isLeadPreviewIndexable predicate (curated DEMO_LEADS showcases + paid|live customers only) — rather than list every persisted lead slug in sitemap.xml with no page-level robots directive.",
    rationale:
      "Free NEXT_STEPS stayed fully gated after PR #216. Sibling remotes claude/dev-work-preview-index-consent and grok/continuous-work-preview-index already had a complete, tested feature body for this consent/SEO defect but no mergeable PR (Actions token blocked; handoff issue #214). On main the bug was still live: sitemap.ts invited every cold-prospected local business into Google's index under the platform domain, and /preview emitted no noindex — the same consent concern the repo legal-gates on Places ingestion, plus duplicate-thin-content SEO risk that hurts the marketing site's own rankings. Folding the stuck body onto the automation branch that can open/merge unblocks safe SEO growth for demos + paying customers without inventing an optional aggregate or re-running a 2x-confirmed clean axis. Shared predicate keeps sitemap and generateMetadata from drifting.",
  },
  {
    date: "2026-07-14",
    decision:
      "Harden the two newest redirect/URL validators together: (1) isSafeNextPath normalizes pathname (strip query/hash, percent-decode, collapse `.`, reject `..`) before both the /dashboard prefix and login self-loop checks; (2) resolveTrustedAppUrl uses tryHeaderDerivedAppOrigin to accept only host-only http(s) origins from headers — rejecting non-http(s) schemes and path/userinfo smuggling that bare new URL() still accepts. Folded from stuck grok/dev-work-redirect-url-hardening rather than rebuilding.",
    rationale:
      "Empty-backlog after PR #216/#217. Sibling business-process-evolution-7bfa claimed and merged preview-indexing-consent-guard (PR #217) first, and explicitly noted grok/dev-work-redirect-url-hardening as the remaining fold target. This run folded that stuck CLI body: verified empirically on main that isSafeNextPath('/dashboard/login#x'), '/dashboard/./login', and '/dashboard/%6cogin' all returned true (authenticated-operator redirect loop); new URL('javascript://evil.example') and new URL('https://evil.com/phish') both succeed, so a spoofed x-forwarded-proto/host pair could still produce a digest base URL that escapeHtmlForEmail does not neutralize as a javascript: href. Folding beats inventing an optional aggregate, re-auditing 2x-clean axes, or leaving a live validator gap while a complete fix sits unmerged.",
  },
  {
    date: "2026-07-14",
    decision:
      "Make three Convex list queries return the same row order as their SQLite twins (leads.list newest-first via _creationTime desc; checkoutSessions.listOpen oldest-first via app createdAt ASC; inquiries.listBySlug newest-first via app createdAt DESC before limit) — rather than leave bare .collect() / index-_creationTime .order() drift that reverses /dashboard/leads and mis-prioritizes abandoned-cart recovery between backends. Folded from stuck grok/claude/opencode convex-order-parity remotes.",
    rationale:
      "Empty-backlog after PR #218. Free NEXT_STEPS stayed operator/legal-gated. Prior sibling (business-process-evolution-7bfa) explicitly queued opencode/dev-work-7qz1k9 as the next fold target; scanning stuck CLI remotes found six remotes with the same complete feature body and no open PR (Actions token blocked). On main the bug was still live: Convex leads.list returned oldest-first while SQLite getLeads is newest-first — operators see a reversed CRM table depending on whether NEXT_PUBLIC_CONVEX_URL is set. Abandoned-recovery (listOpenCheckoutSessions) and per-lead inquiry inbox order also drifted. Folding the stuck body onto the automation branch that can open/merge unblocks dual-backend UX parity without inventing an optional aggregate or re-running a 2x-confirmed clean axis. Added an AGENT_PROTOCOL dual-backend ordering rule so future list* twins mirror SQLite ORDER BY in the same commit.",
  },
  {
    date: "2026-07-14",
    decision:
      "Re-read the deploy handoff and mergeProvisionOntoFreshHandoff after tryProvisionVercelDomain before the final insertDeployHandoff upsert — rather than persist the pre-Vercel snapshot verbatim from assignCustomDomainAndProvision / assignVercelProjectAndProvision / enqueueProductionHandoff.",
    rationale:
      "Empty-backlog after PR #222 (convex-query-ordering-parity, owned/merged by sibling prompt-process-evolution-7291). Free NEXT_STEPS stayed operator/legal-gated. Rotated to the TOCTOU axis already proven on commerce catalog sync + orphan archive: handoff assign/enqueue paths perform a real Vercel Domains API fetch then full-row upsert the pre-call snapshot, so a concurrent Mark live during that window silently reverts status/notes to provisioned/awaiting_dns — breaking paidNotLive / Production handoffs open / operator trust on the fulfillment path that converts paid buyers into live sites. Same merge-after-re-read pattern as preserveCommerceStripeIds(fresh, synced); never invent an optional aggregate when a live concurrency bug remains.",
  },
  {
    date: "2026-07-14",
    decision:
      "updateDeployHandoffStatus never downgrades status (preferAdvancedHandoffStatus: live > provisioned > awaiting_dns > pending/failed) when appending notes — rather than trust the caller's status snapshot after a long Resend await. Fold stuck grok/dev-work-handoff-marker-status (complete feature body, Actions token blocked from gh pr create) onto an automation branch that can open/merge rather than leave a live Mark-live regression unmerged.",
    rationale:
      "Empty-backlog after PR #223 (handoff-provision-lost-update-guard). Free NEXT_STEPS stayed operator/legal-gated. Bundle webhook receipt/DNS sent-markers must append a durable note after send success, but they pass the pre-Resend handoff.status into updateDeployHandoffStatus — a concurrent Mark live during Resend was overwritten back to awaiting_dns, undoing operator fulfillment and desyncing handoff status from lead stage=live. Re-read-at-call-site is still racy; the rank merge inside the Convex mutation / SQLite write is atomic with the existing-row read. Mark live still upgrades (live is max rank). Prefer folding a stuck CLI remote with a complete security/fulfillment fix over inventing an optional aggregate or re-auditing already-clean axes.",
  },
  {
    date: "2026-07-14",
    decision:
      "Isolate Vitest client-voice factory generate() from process.env.ANTHROPIC_API_KEY (clear/restore around the call; assert StubClientVoiceGenerator) — rather than leave faq-pack.test.ts env-dependent while generators.test.ts already clears the key. Fold stuck grok/continuous-work-voice-test-env.",
    rationale:
      "Empty-backlog after PR #226 (sibling owned handoff-email-marker-status-no-downgrade). Same-minute dual claim: this branch first claimed the handoff-marker fold, sibling claimed+merged it first — pivoted per AGENT_PROTOCOL. Next stuck CLI remote with feature body and no open PR was grok/continuous-work-voice-test-env. On main, faq-pack's default-factory test called getClientVoiceGenerator().generate() without clearing ANTHROPIC_API_KEY; scheduled agents/CI that inject the secret can hit the live Anthropic Messages API (or a flaky network fallback) mid-suite and assert a fragile variants.length===6. Closing that CI/agent flakiness keeps Growth sold voice-pack generation trustworthy under automation; beats inventing an optional aggregate or re-auditing 2x-clean sold-vs-shipped / orchestration axes. Residual next: encode-at-use slug path-safety for legacy payment_stub rows (PR #216 closed create-path).",
  },
  {
    date: "2026-07-14",
    decision:
      "Ship CSV import hours column + RFC 4180 multiline line-splitting + field-length caps, and make parseLeadHours split on the first '·' only — rather than leave operator-owned lead ingest on hardcoded hours / naive newline splits while Places API stays counsel-gated. Fold stuck opencode/dev-work-f3k8p1.",
    rationale:
      "Empty-backlog after PR #227. Sibling business-process-evolution-2d7a already claimed legacy-slug-encode-at-use-path-safety (claim pushed) — pivoted per AGENT_PROTOCOL. Next stuck CLI remote with a complete feature body and no open PR was opencode/dev-work-f3k8p1. On main, parseLeadsCsv ignored real business hours (hardcoded default whose weekend itself contained '·'), splitCsv was a raw .split('\\n') that broke quoted multiline descriptions, and parseLeadHours used .split('·') so any weekend middot truncated the stored value on SQLite round-trip. Closing that path improves preview fidelity and CSV throughput for the only live lead-volume channel until Places clears counsel — higher leverage than inventing an optional aggregate or dual-building the sibling's encode-at-use fold.",
  },
  {
    date: "2026-07-14",
    decision:
      "Encode lead slugs at every path-construction use-site via src/lib/leads/slug-path.ts (encodeURIComponent for path segments; leadSlugAsDnsLabel for suggestedHost) — rather than rely only on create-path sanitizeCheckoutLeadSlug (PR #216) which cannot rewrite legacy payment_stub / pre-sanitize rows already in the CRM. Fold stuck grok/continuous-work-slug-path-encode (complete feature body; Actions token blocked from gh pr create; issues #228/#229).",
    rationale:
      "Empty-backlog after PR #227 (client-voice-factory-test-env-isolation) and PR #230 (csv-import-hours-multiline-limits, sibling-owned after this branch claimed encode-at-use). Free NEXT_STEPS stayed operator/legal-gated. Prior iteration explicitly queued encode-at-use path-safety as the residual after checkout create-path sanitize. On main, outreach Email 1–3, deploy handoff previewUrl/contactFormUrl, proxy rewrites, sitemap, and commerce cancel_url still interpolated raw lead.slug into /preview/{slug} — a free-form slug with `/` becomes multi-segment and can collapse via WHATWG path normalization, the same traversal class create-path sanitize closed for new paid leads. Defense-in-depth keeps stored identity intact for DB lookup (Next decodes route params) while forcing a single path segment at every sink. Prefer folding this queued residual over inventing an optional aggregate, re-running 2x-clean audit axes, or registering dead Convex API map entries (opencode/dev-work-convex-api-map) with no live consumer.",
  },
  {
    date: "2026-07-14",
    decision:
      "Restore as const on updateLeadStageAction, importLeadsCsvAction, bootstrapStripePricesAction, and sendEmail/sendOperatorDailyDigest success literals after PR #231 silently re-widened them by merging a pre-fix actions.ts — keep discriminated-union narrowing accurate for every multi-return server action / send helper. Fold stuck grok/continuous-work-as-const-restore (issues #232/#233).",
    rationale:
      "Empty-backlog after PR #231 (legacy-slug-encode-at-use-path-safety). Free NEXT_STEPS stayed operator/legal-gated. Same-minute sibling business-process-evolution-9ced was starting — claimed this fold first per AGENT_PROTOCOL. Scanned stuck CLI remotes before inventing an audit and found opencode/dev-work-9k2m4x + opencode/continuous-work-062115 (folded onto grok/dev-work-as-const-restore + grok/continuous-work-as-const-restore) with a complete as-const restore and no open PR (Actions token blocked). Without as const, TypeScript widens success to boolean so if (res.success) does not narrow — callers lose compile-time enforcement of success-only fields (envSnippet/imported/slugs) even when runtime is correct. Folding that body beats a clean re-audit of already-clean axes or inventing an optional aggregate. Corrected the stuck remote's duplicate success key on bootstrapStripePricesAction while folding. Next empty-backlog agents: skip already-folded as-const remotes; prefer a fresh sold-capability / security axis or operator launch checklist work over dead Convex API map entries. Sibling 9ced follow-up documents architecture as-const merge-fold hygiene after PR #234 absorbed the feature.",
  },
  {
    date: "2026-07-14",
    decision:
      "Escape every dynamic href URL in src/lib/email/resend.ts via escapeHtmlForEmail (preview / checkout / catalog / unsubscribe / privacy), matching client-receipt, deliver-pack, dns-email, and daily-digest — do not leave env-sourced APP_URL unescaped inside attributes. Fold stuck grok/continuous-work-email-href-escape (issue #236).",
    rationale:
      "Empty-backlog after PR #235 (as-const restore). Free NEXT_STEPS stayed operator/legal-gated; stuck as-const/slug-path remotes already on main; recent audits re-confirmed send-success + Convex API map clean. Scanned stuck CLI remotes before inventing an audit and found grok/continuous-work-email-href-escape with a complete href-escape fix and no open PR (Actions token blocked; issue #236). Rotated to the escapeHtmlForEmail axis with a finer lens than body-text fields: resend.ts still interpolated raw URLs into href attributes while every sibling email template already escaped them. A NEXT_PUBLIC_APP_URL value containing a quote or ampersand (mis-paste, env-injection, or future header-derived base) breaks out of href=\"...\". Closing this asymmetry beats inventing an optional aggregate or re-auditing exhausted marker axes. Next empty-backlog fold target: grok/dev-work-mark-live-null-guard (markHandoffLive advances lead stage even when updateDeployHandoffStatus returns null; issue #237) — skip already-folded email-href / as-const / encode / CSV remotes.",
  },
  {
    date: "2026-07-14",
    decision:
      "Guard markHandoffLive so a null updateDeployHandoffStatus result never advances lead stage to live, and route dashboard preview revalidatePath through leadPreviewPath — rather than leave a race that desyncs stage=live from handoff status / paid-not-live metrics. Fold stuck grok/dev-work-mark-live-null-guard (issue #237).",
    rationale:
      "Empty-backlog after PR #234/#235 (as-const restore). Free NEXT_STEPS stayed operator/legal-gated. Sibling business-process-evolution-266d already claimed email-href-url-html-escape — pivoted per AGENT_PROTOCOL to the next stuck CLI remote with feature body and no open PR. On main, markHandoffLive called updateLeadStage(..., \"live\") even when the status write returned null, so a vanished handoff row left the CRM looking fulfilled while the action returned failure and open-handoff / paid-not-live diverged. Closing that fulfillment race beats inventing an optional aggregate or re-auditing 2x-clean sold-vs-shipped / orchestration axes. Encode-at-use for revalidatePath aligns dashboard cache invalidation with the same path-segment rule browser/proxy URLs already follow.",
  },

  {
    date: "2026-07-15",
    decision:
      "Normalize operator Save domain input to a bare hostname (strip scheme/path/port/trailing FQDN dot; reject invalid and platform-owned hosts) on assignCustomDomainAction + updateDeployHandoffCustomDomain + getLeadSlugByCustomDomain rather than trim+lowercase alone — so Host→preview routing and Vercel Domains API registration match what operators paste from a browser address bar.",
    rationale:
      "Empty-backlog after PR #238/#239 (email-href fold + mark-live null guard). Free NEXT_STEPS stayed operator/legal-gated; stuck CLI remotes for already-merged fixes scanned first. Fresh sold-capability audit of the Starter custom-domain handoff found Save domain only lowercased and trimmed, so pasting https://client.com/ or host:443 stored a value that never equals normalizeRequestHost(Host) — proxy.ts Host→preview and Vercel domain name registration silently failed after a green Save. Closing that is higher leverage than a third clean re-audit or dead Convex orders.createOrder API map busywork. Stripe Prices / Places / Buffer OAuth / Connect stay operator/legal-gated.",
  },
  {
    date: "2026-07-15",
    decision:
      "Also reject when another handoff already owns the same custom domain before assignCustomDomainAndProvision — rather than rely on getByCustomDomain first-match (which silently serves the wrong client). Fold continuous-work bare-host normalize with dev-work uniqueness into one implementation.",
    rationale:
      "Same-window dual with grok/continuous-work-custom-domain-normalize (custom-domain-host-normalize) and grok/dev-work-custom-domain-normalize (custom-domain-normalize-and-unique). Both pushed feature body; continuous-work owned bare-host normalize + db/convex re-normalize; uniqueness is the complement. Keep a single parseOperatorCustomDomain + collision reject path rather than two normalizers. Folded onto cursor/business-process-evolution-57f2 (issues #240/#241).",
  },
  {
    date: "2026-07-15",
    decision:
      "Pass skipSuppression: true on sendReceiptEmail, the Stripe webhook DNS go-live sendEmail, and sendCommerceBuyNowClientReceipt — rather than leave post-payment fulfillment blocked by the marketing CAN-SPAM suppression list (marker-only gating left Stripe redelivering forever against the same suppress).",
    rationale:
      "Empty-backlog after PR #242 (custom-domain normalize, sibling-owned). Free NEXT_STEPS stayed operator/legal-gated. Sibling business-process-evolution-57f2 claimed custom-domain first — pivoted. Fresh sold-capability audit found sendEmail always checks isEmailSuppressed, so a lead who unsubscribed from cold outreach then later paid never receives receipt/DNS/Commerce order notification; bundle-webhook-receipt-marker-requires-send-success already named the suppressed-buyer scenario but only gated the durable marker. Closing the actual delivery gap beats inventing an optional aggregate or re-auditing 2x-clean axes. Outreach, abandoned recovery, upsell, and marketing/voice packs keep suppression.",
  },
  {
    date: "2026-07-15",
    decision:
      "Pass skipSuppression: true on POST /api/contact/[slug]'s business/operator inquiry notify — rather than leave Starter sold contact-form alerts permanently blocked when the lead unsubscribed from cold-outreach marketing (CRM trail still succeeds).",
    rationale:
      "Empty-backlog after PR #243 (transactional-email-skip-marketing-suppression). Free NEXT_STEPS stayed operator/legal-gated. Scanned stuck CLI remotes before inventing an audit and found grok/continuous-work-contact-notify-skip with a complete contact-form skipSuppression feature body and no open PR (Actions token blocked; issue #244). Folding that Starter sold product-notify fix beats inventing an optional aggregate. AGENT_PROTOCOL now says: after shipping skipSuppression for one product surface, check sibling lead.email product notifies next. Same-minute dual: business-process-evolution-fbad claimed ~2s earlier and also folded; prompt-process-evolution-63b3 merged as PR #246; fbad pivoted to create-path-slug-edge-dash-normalize. Outreach, abandoned recovery, upsell, and marketing/voice packs keep suppression.",
  },
  {
    date: "2026-07-15",
    decision:
      "Share sanitizeLeadSlug across addLeadAction, CSV explicit-slug columns, and resolveBundleCheckoutLeadSlug so every create-path collapses non-token runs AND strips leading/trailing dashes — matching leadSlugAsDnsLabel / slugifyBusinessName rather than leaving edge dashes that desync CRM identity from suggestedHost DNS labels.",
    rationale:
      "Empty-backlog after PR #246 (contact-form-notify-skip, sibling-owned merge). Free NEXT_STEPS stayed operator/legal-gated; fbad pivoted from the dual-claim contact-notify race. Fresh sold-capability audit of Starter preview-subdomain Host→preview found addLead/CSV kept edge dashes (Demo Cafe! → demo-cafe-) while leadSlugAsDnsLabel strips them for suggestedHost, so extractPreviewSubdomainSlug → getLeadBySlug misses the lead and the sold Host→preview path silently serves the marketing homepage. Closing that identity desync beats inventing an optional aggregate. Folded onto cursor/business-process-evolution-fbad from grok/dev-work-slug-edge-dash (issue #245; Actions token blocked).",
  },
  {
    date: "2026-07-15",
    decision:
      "Pass skipSuppression: true on sendInquiryReply (operator Reply to website contact-form visitors) — rather than leave the Reply half of the Starter sold CRM loop permanently blocked when the visitor address is on the marketing CAN-SPAM list while persist-then-notify already marked the inquiry replied.",
    rationale:
      "Empty-backlog after PR #247 (create-path-slug-edge-dash-normalize + contact-form notify fold). Free NEXT_STEPS stayed operator/legal-gated. Scanned stuck CLI remotes (already folded) first; lead.email product notifies already skip. Fresh sold-capability audit of the contact-form CRM loop found sendInquiryReply still honored suppression — a cold-outreach unsub who later writes a paying client's site gets a durable replied inquiry the visitor never receives. Closing that notify↔reply asymmetry beats inventing an optional aggregate. Outreach, abandoned recovery, upsell, and marketing/voice packs keep suppression. AGENT_PROTOCOL now names the CRM-loop sibling check explicitly.",
  },
  {
    date: "2026-07-15",
    decision:
      "Treat www↔apex as the same custom domain for Host→preview lookup, Save domain uniqueness, and Vercel Domains API registration (customDomainHostAliases; exact host stored) — rather than leave exact-only normalize+unique still failing when operators paste www.client.com and visitors hit client.com (or two leads split the twin).",
    rationale:
      "Empty-backlog after PR #247 (create-path-slug-edge-dash). Free NEXT_STEPS stayed operator/legal-gated; stuck CLI remotes for already-merged fixes scanned first. Sibling prompt-process-evolution-f037 claimed/shipped inquiry-reply-skip-marketing-suppression (PR #248) in the same window — complementary CRM-loop skip, not a collision. Fresh sold-capability audit of Starter custom-domain handoff found bare-host normalize + uniqueness still exact-match only — Save www.client.com never equals Host client.com, uniqueness does not block the twin on another lead, and Vercel only registered the saved form. Closing that Host→preview alias gap beats inventing an optional aggregate or a clean re-audit. Stripe Prices / Places / Buffer OAuth / Connect stay operator/legal-gated.",
  },
  {
    date: "2026-07-15",
    decision:
      "Pass skipSuppression: true on sendMarketingPackToClientEmail and sendClientVoicePackToClientEmail — sold Growth/Complete feature delivery (monthly marketing content, AI phone scripts) to lead.email must not be permanently blocked by a cold-outreach CAN-SPAM unsubscribe that pre-dates conversion. Keep suppression for outreach Email 1–3, abandoned recovery, and Starter upsell.",
    rationale:
      "Empty-backlog after PR #248/#249 (inquiry-reply skip + www↔apex aliases). Free NEXT_STEPS stayed operator/legal-gated. Scanned stuck CLI remotes before inventing an audit and found opencode/dev-work-marketing-voice-skip-suppression + grok/continuous-work-marketing-voice-skip + grok/dev-work-marketing-voice-skip with a complete feature body and no open PR (Actions token blocked). AGENT_PROTOCOL's empty-backlog scan rule says after shipping skipSuppression for one product surface, check sibling sold lead.email notifies — marketing/voice pack delivery are paid-for features on lead.email, the same bug class transactional + contact-form + inquiry-reply skip closed. Migrates packs from the 'keep suppression' bucket to skipSuppression: true. Folded onto cursor/prompt-process-evolution-ea8d as PR #252; same-window dual claim by cursor/business-process-evolution-d2b8 kept as process record (no second implementation).",
  },
  {
    date: "2026-07-15",
    decision:
      "Wire pipeline-health age/count fields already on the dashboard (newInquiryCount, oldestUnrepliedInquiryAgeHours, oldestFollowUpDueAgeHours, closedLeadCount) into the operator daily digest headers/footnotes — rather than invent a new optional aggregate or re-audit 2x-clean skipSuppression / Convex / send-success axes while free NEXT_STEPS stay operator/legal-gated.",
    rationale:
      "AGENT_PROTOCOL empty-backlog rotation prefers pipeline-health/daily-digest wiring completeness after consecutive clean security audits. These four fields are direct maps of existing PipelineHealth predicates (not new metrics): unreplied-header new+age, follow-ups-header oldest age, and closed settled-inventory footnote (cold/snoozed class). Folding stuck opencode/dev-work-20260715 + grok/continuous-work-digest-age-counts + codex/continuous-work-6a36ae (complete body, no open PR; Actions token blocked) onto a mergeable automation branch beats a clean-audit-only run. Stale claim-only remotes (8fc4/3fe8) with no feature body do not own the todo.",
  },
  {
    date: "2026-07-15",
    decision:
      "Rate-limit loginOperatorAction at 5 attempts / 60s per client IP (checkRateLimit key login:<clientIp>) before tryCreateSessionFromPassword — rather than leave the public unauthenticated password-check unbounded while every other public write route already throttles. Rate-limited attempts redirect to error=rate_limited (page alert) instead of a JSON 429 so the login form stays usable.",
    rationale:
      "Empty-backlog after PR #253 (marketing-voice-pack-skip-suppression). Free NEXT_STEPS stayed operator/legal-gated. Sibling prompt-process-evolution-7d49 claimed digest-pipeline-health-age-and-count-wiring in the same window (merged as PR #276 — complementary axis, not a collision). Scanned stuck CLI remotes before inventing an audit and found grok/continuous-work-login-rate-limit + grok/dev-work-login-rate-limit + opencode/dev-work-login-rate-limit* with a complete login throttle feature body and no open PR (Actions token blocked). Folding that public password-guessing throttle beats inventing an optional aggregate or a clean re-audit of 2x-confirmed axes. Reuses the tested checkRateLimit / clientIpFromHeaders helpers; tighter 5/60s window is appropriate for credential stuffing vs the default 20/60s used on contact/checkout. Stripe Prices / Places / Buffer OAuth / Connect stay operator/legal-gated.",
  },
  {
    date: "2026-07-15",
    decision:
      "Wire the last two PipelineHealth age mirrors (oldestAbandonedAgeHours, oldestColdLeadAgeHours) into the operator daily digest — abandoned-checkouts header and cold footnote — rather than invent a new optional aggregate or re-audit 2x-clean axes while free NEXT_STEPS stay operator/legal-gated.",
    rationale:
      "AGENT_PROTOCOL empty-backlog rotation listed these two ages as the only remaining optional digest mirrors after PR #276/#277. Folding stuck opencode/dev-work-digest-age-mirrors (complete body, no open PR; Actions token blocked) onto a mergeable automation branch closes the pipeline-health→digest age/count wiring axis and beats a clean-audit-only run. Direct maps of existing PipelineHealth predicates (not new metrics). Stripe Prices / Places / Buffer OAuth / Connect stay operator/legal-gated.",
  },
  {
    date: "2026-07-15",
    decision:
      "Cap create-path lead slugs at MAX_LEAD_SLUG_LENGTH=63 (RFC 1035 DNS label max) inside shared sanitizeLeadSlug — truncate then re-strip trailing dashes — and reuse that sanitizer from leadSlugAsDnsLabel + CSV slugifyBusinessName / collision suffixes, rather than mint over-length CRM slugs that cannot be valid suggestedHost labels.",
    rationale:
      "Empty-backlog after PR #277 (login-rate-limit). Free NEXT_STEPS stayed operator/legal-gated. Sibling prompt-process-evolution-1ce7 claimed/merged digest-age-mirror-oldest-abandoned-cold (PR #278) in the same window (complementary axis — owns slice 327). Scanned stuck CLI remotes before inventing an audit and found grok/continuous-work-slug-dns-label-max + grok/dev-work-slug-dns-label-max + grok/dev-work-slug-dns-max-86cdf4 + opencode/continuous-work-slug-dns-max-103090 (and digest-combo remotes whose digest half already merged as #276) with a complete create-path-slug-dns-label-max-length feature body and no open PR (Actions token blocked). Folding that Starter Host→preview identity fix beats inventing an optional aggregate — edge-dash strip (#247) alone still left >63 labels invalid for DNS. Stripe Prices / Places / Buffer OAuth / Connect stay operator/legal-gated.",
  },
  {
    date: "2026-07-15",
    decision:
      "Soft-cap Starter contact-form visitor fields once via shared normalizeContactFormFields (MAX_CONTACT_MESSAGE_LENGTH=5000 + name/email/phone/source caps) and reuse those strings for both insertClientInquiry persist and the skipSuppression notify HTML — rather than silently truncate only at the DB layer while emailing the uncapped request body.",
    rationale:
      "Empty-backlog after PR #279 (create-path-slug-dns-label-max-length) + PR #278 (digest age mirrors). Sibling business-process-evolution-f844 claimed operator-password-trim — pivoted. Sold-capability audit found POST /api/contact/[slug] built the business/operator notify from uncapped request fields while insertClientInquiry sliced message to 5000 for CRM storage. Rate limits (20/min) bound request count, not payload size; escapeHtmlForEmail prevents XSS but can expand size. Divergent CRM vs notify breaks the Starter sold promise and lets a public form burn Resend quota toward lead.email/support. Soft-cap-once keeps visitor UX (no 400 on long messages) and defense-in-depth inside insertClientInquiry for webhook writers. Stripe Prices / Places / Buffer OAuth / Connect stay operator/legal-gated.",
  },
  {
    date: "2026-07-15",
    decision:
      "Trim OPERATOR_DASHBOARD_PASSWORD on both env read (getPassword / isOperatorAuthConfigured) and form submit (tryCreateSessionFromPassword) — whitespace-only env is unset/open-demo; surrounding spaces on either side must not lock the operator out of a paid CRM after a paste or secret-manager quirk.",
    rationale:
      "Empty-backlog after PR #279 (create-path-slug-dns-label-max-length). Free NEXT_STEPS stayed operator/legal-gated. Pipeline-health→digest age axis is closed; AGENT_PROTOCOL next prefers stuck CLI security folds then fresh auth-surface audits. Scanned remotes and found opencode/dev-work-password-trim (complete env+form trim + Vitest) and opencode/continuous-work-152029 (env-only half) with no open PR (Actions token blocked). assessOperatorAuthEnvReadiness already trimmed for the banner, so the dashboard could look 'ready' while login compared untrimmed strings — a silent operator lockout blocks outreach and fulfillment at the exact moment revenue work starts. Folding that auth hygiene beats inventing an optional aggregate. Stripe Prices / Places / Buffer OAuth / Connect stay operator/legal-gated.",
  },
  {
    date: "2026-07-16",
    decision:
      "Verify operator sessions in src/proxy.ts dashboardAuthGate with exported getPassword() (trimmed), never raw process.env.OPERATOR_DASHBOARD_PASSWORD — so login-signed cookies survive a secret-manager trailing space instead of infinite-redirecting /dashboard/* → login. Keep session cookie path=/ for auth-gated /api twins.",
    rationale:
      "Empty-backlog after PR #280 (operator-password-trim) + PR #281 (contact-form field caps). Free NEXT_STEPS stayed operator/legal-gated. Same-window dual: business-process-evolution-f926 claimed operator-auth-proxy-password-trim 8s before prompt-process-evolution-037c claimed proxy-operator-session-getpassword-parity — both shipped the same getPassword proxy verify; folded onto f926 with both ITERATIONS kept (no second implementation). PR #280 trimmed login/action paths but the Host gate still HMAC-verified with the raw env string, so login succeeds then every /dashboard navigation bounces to login. Cookie Path narrowing would break bootstrap-prices / marketing/generate auth twins — trim-key parity is the fix. Next empty-backlog rotation: auth cookie attributes / session TTL, public write routes, or Convex parity. Stripe Prices / Places / Buffer OAuth / Connect stay operator/legal-gated.",
  },
  {
    date: "2026-07-16",
    decision:
      "Soft-cap remaining CSV import columns (city/state/address/tagline, each service token, hours weekday/weekend segments, phone/email aligned with MAX_CONTACT_*) after parse — rather than leave unbounded optional cells that land in public preview / JSON-LD / outreach, or invent an optional digest aggregate while Places stays counsel-gated.",
    rationale:
      "Empty-backlog after PR #284 (proxy getPassword parity). Free NEXT_STEPS stayed operator/legal-gated. CSV quality is the live lead-volume unlock (AGENT_PROTOCOL). PR #230 capped businessName/description/services-count but left the rest uncapped — an operator (or compromised CSV) could still push multi-KB strings into every sold surface that renders lead fields. Soft-cap (not row-skip) matches description's UX so one bad optional cell does not drop a whole prospect. Reusing MAX_CONTACT_PHONE/EMAIL keeps CRM length policy one source of truth across contact-form and CSV ingest. Also restored absolute BUSINESS_DECISIONS slices drifted +1 by the #284 fold (digest-age=326 … proxy=330). Stripe Prices / Places / Buffer OAuth / Connect stay operator/legal-gated.",
  },
  {
    date: "2026-07-16",
    decision:
      "Share create-path lead field length caps between CSV import and manual addLeadAction via normalizeLeadCreateFields (src/lib/leads/create-fields.ts) — hard-reject over-long businessName; soft-cap city/state/address/phone/email/tagline/description/services/hours — rather than leave the dashboard Add lead form as an uncapped bypass of CSV policy into public preview / JSON-LD / outreach.",
    rationale:
      "Empty-backlog after PR #283 (csv-import-remaining-field-length-caps). Free NEXT_STEPS stayed operator/legal-gated. AGENT_PROTOCOL's empty-backlog rotation after contact notify↔persist + CSV remaining caps names other create-path write surfaces next; addLeadAction was still uncapped while CSV soft-capped the identical fields. One shared helper prevents ingest-path drift. Soft-cap optional fields (hard-reject only businessName) matches CSV UX. Stripe Prices / Places / Buffer OAuth / Connect stay operator/legal-gated.",
  },
  {
    date: "2026-07-16",
    decision:
      "POST /api/contact/[slug] requires a known lead (CRM getLeadBySlug or curated DEMO_LEADS) before persist or skipSuppression notify — return 404 unknown_lead for inventable/slug-inferred tokens rather than orphan-persist with businessName=slug and email brand.supportEmail.",
    rationale:
      "Empty-backlog after PR #285 (addLead create-path field caps). Free NEXT_STEPS stayed operator/legal-gated. Auth-cookie / Stripe-redirect axes already clean (opencode/dev-work-20260716). Public-write audit found contact still accepted null leads while preview-open soft-rejects unknown_lead — with skipSuppression on the notify path, any syntactically valid slug becomes free support spam + CRM pollution (rate limits only blunt volume). Curated DEMO_LEADS stay accepted so showcase previews work on a fresh DB; resolvePreviewLead invents are not. Stripe Prices / Places / Buffer OAuth / Connect stay operator/legal-gated.",
  },
  {
    date: "2026-07-16",
    decision:
      "Cap POST /api/marketing/generate contentTypes at MONTHLY_MARKETING_PACK_TYPES.length (sold pack ceiling), hard-reject overlong leadId, and soft-cap business context via normalizeMarketingGenerateBusiness before stub/LLM generate — membership-only validation is not a size bound.",
    rationale:
      "Empty-backlog after PR #286 (contact known-lead gate). Free NEXT_STEPS stayed operator/legal-gated. AGENT_PROTOCOL rotation named marketing/generate contentTypes size next: generators map 1:1 over contentTypes into stub variants and Anthropic prompt array length, so a rate-limited open-demo or compromised-session caller can still burn quota with thousands of valid-type duplicates. Aligning the ceiling with the sold monthly pack keeps ad-hoc generation inside product promise; create-fields soft-caps keep business payloads from becoming a second uncapped token vector. Stripe Prices / Places / Buffer OAuth / Connect stay operator/legal-gated.",
  },
  {
    date: "2026-07-16",
    decision:
      "Soft-cap optional customerEmail on POST /api/stripe/checkout and POST /api/commerce/checkout via shared normalizeCheckoutCustomerEmail (MAX_CONTACT_EMAIL_LENGTH) before Stripe session create and recordCheckoutSessionCreated — rather than leave uncapped public body emails in Stripe + checkout_sessions, or invent an optional aggregate while sibling owns marketing/generate size caps.",
    rationale:
      "Empty-backlog after PR #286 (contact-form-require-known-lead). Sibling business-process-evolution-d018 claimed marketing-generate-content-types-size-cap first (merged PR #287) — pivoted per AGENT_PROTOCOL. Public money create routes already rate-limit but still forwarded raw customerEmail to Stripe and abandoned-recovery tracking. Aligning with contact-form / create-path email policy closes the next public-write size hole without competing with the sibling's Anthropic-cost fix. Stripe Prices / Places / Buffer OAuth / Connect stay operator/legal-gated.",
  },
  {
    date: "2026-07-16",
    decision:
      "Hard-reject over-long sessionId on POST /api/stripe/billing-portal via parseCheckoutSessionId (MAX_STRIPE_CHECKOUT_SESSION_ID_LENGTH=255) before any Stripe retrieve — rather than soft-cap/truncate an opaque id (guaranteed miss that still burns quota) or invent an optional aggregate while free NEXT_STEPS stay operator/legal-gated.",
    rationale:
      "Empty-backlog after PR #288 (checkout customerEmail soft-cap) + PR #287 (marketing/generate size). Free NEXT_STEPS stayed operator/legal-gated. AGENT_PROTOCOL rotation named billing-portal sessionId length next: rate limits blunt request count, not payload size, and the public portal route still forwarded unbounded sessionId into checkout.sessions.retrieve + the default return_url query. Soft-cap fits emails/free-text; opaque retrieve keys must fail closed with 400. Next residual public body-size hole: unsubscribe email length. Stripe Prices / Places / Buffer OAuth / Connect stay operator/legal-gated.",
  },
  {
    date: "2026-07-16",
    decision:
      "Hard-reject GET /api/unsubscribe email query params longer than MAX_CONTACT_EMAIL_LENGTH before HMAC verify and suppressEmail — rather than soft-cap (would break signed footer tokens) or leave uncapped public CAN-SPAM writes burning crypto and growing the suppressions table.",
    rationale:
      "Empty-backlog after PR #288 (checkout customerEmail soft-cap). Sibling prompt-process-evolution-a938 claimed billing-portal-sessionId-field-length-cap (opaque-id hard-reject, merged PR #289) — complementary pivot to the remaining public-write size hole on unsubscribe. Rate limits blunt request count only; a multi-KB email query still reaches verifyUnsubscribeToken + suppressEmail. Soft-cap is wrong for signed links: footer tokens bind the full address. Aligning the ceiling with contact/create-path MAX_CONTACT_EMAIL_LENGTH keeps one email-length policy. Stripe Prices / Places / Buffer OAuth / Connect stay operator/legal-gated.",
  },
  {
    date: "2026-07-16",
    decision:
      "Hard-reject uncapped body.slug / body.skuId on POST /api/commerce/checkout via parseCommerceCheckoutSlug (MAX_LEAD_SLUG_LENGTH) and parseCommerceCheckoutSkuId (catalog-save ceiling 64) before getCommerceCatalog or Stripe — rather than soft-cap opaque lookup keys or invent an optional aggregate while free NEXT_STEPS stay operator/legal-gated.",
    rationale:
      "Empty-backlog after PR #290 (unsubscribe email hard-reject) + PR #289 (billing-portal sessionId). Free NEXT_STEPS stayed operator/legal-gated. Bundle checkout already sanitizes+caps slug via sanitizeLeadSlug; commerce Buy now still forwarded unbounded slug/skuId into catalog lookup, Stripe metadata, checkout_sessions, and cancel_url after customerEmail soft-cap. Soft-cap is wrong for opaque keys: truncation looks up the wrong row and can still burn quota. Aligning slug with create-path DNS max and skuId with normalizeCommerceItems' 64-char save slice closes the residual public money-route size hole. Complementary same-window: business-process-evolution-58d9 contact path-length. Next residual public body sizes: billing-portal returnUrl length / unsubscribe token length. Stripe Prices / Places / Buffer OAuth / Connect stay operator/legal-gated.",
  },
  {
    date: "2026-07-16",
    decision:
      "Hard-reject public lead slug path params over MAX_PUBLIC_LEAD_SLUG_PATH_LENGTH (120) via shared isPublicLeadSlugPathLengthOk on POST/GET /api/contact/[slug] (and preview-open) before CRM/demo lookup — charset-only validation is not a size bound; soft-cap would change the lookup key.",
    rationale:
      "Empty-backlog after PR #290 (unsubscribe email hard-reject). Sibling prompt-process-evolution-92f3 claimed commerce-checkout-slug-skuId-field-length-cap first — pivoted per AGENT_PROTOCOL. Contact already required [a-z0-9-]+ and known-lead, but a multi-KB valid-charset path still reached getLeadBySlug and was echoed on 404/success/GET JSON while preview-open already capped at 120. Sharing one path-length helper closes the residual public size hole without competing with the sibling's Buy now money-route caps. Stripe Prices / Places / Buffer OAuth / Connect stay operator/legal-gated.",
  },
  {
    date: "2026-07-16",
    decision:
      "Bound optional body.returnUrl on POST /api/stripe/billing-portal via isAcceptableBillingPortalReturnUrl (same-origin AND ≤ MAX_BILLING_PORTAL_RETURN_URL_LENGTH=2048) and fall back to the derived default on over-length — rather than hard-reject 400 (would strand portal opens over an optional field), soft-cap (would change the redirect), or invent an optional aggregate while free NEXT_STEPS stay operator/legal-gated.",
    rationale:
      "Empty-backlog after PR #291/#292 (commerce slug/skuId + contact path length). Free NEXT_STEPS stayed operator/legal-gated. AGENT_PROTOCOL residual public body sizes named billing-portal returnUrl length next: sessionId already hard-rejects, but returnUrl was only same-origin-checked — a multi-KB same-origin string still reached stripe.billingPortal.sessions.create under the rate limit. Optional redirect fields share the fall-back path with cross-origin/malformed; opaque lookup keys stay hard-reject. Complementary same-window: business-process-evolution-42a4 unsubscribe token length. Stripe Prices / Places / Buffer OAuth / Connect stay operator/legal-gated.",
  },
  {
    date: "2026-07-16",
    decision:
      "Hard-reject GET /api/unsubscribe token query params longer than MAX_UNSUBSCRIBE_TOKEN_LENGTH (128; HMAC-SHA256 base64url is 43 chars) before verifyUnsubscribeToken / Buffer.from — rather than soft-cap (would break every genuine footer link) or leave uncapped public CAN-SPAM token probes allocating multi-KB buffers under the rate limit.",
    rationale:
      "Empty-backlog after PR #291/#292. Sibling prompt-process-evolution-98c1 claimed billing-portal-returnUrl-field-length-cap (optional redirect fall-back-on-over-length) — complementary pivot to the remaining public-write size hole on unsubscribe token. Email length already hard-rejects; token was still uncapped before HMAC. Opaque signed tokens fail closed with 400 (same class as billing-portal sessionId); optional redirect URLs fall back. Stripe Prices / Places / Buffer OAuth / Connect stay operator/legal-gated.",
  },
  {
    date: "2026-07-16",
    decision:
      "Hard-reject over-long session_id on GET /checkout/success via shared parseCheckoutSessionId (MAX_STRIPE_CHECKOUT_SESSION_ID_LENGTH=255) before stripe.checkout.sessions.retrieve — rather than leave the post-payment confirmation page as an uncapped twin of billing-portal sessionId, soft-cap (guaranteed miss that still burns quota), or invent an optional aggregate while free NEXT_STEPS stay operator/legal-gated.",
    rationale:
      "Empty-backlog after PR #293 (returnUrl + unsubscribe token). Billing-portal already hard-rejects body.sessionId, but /checkout/success still passed raw searchParams.session_id into retrieve — same leakable opaque id, same Stripe quota burn, no rate limit on the page GET. Extract loadCheckoutSuccessSession so Vitest asserts retrieve is skipped on over-long; over-long renders the unconfirmed UI (same as missing). Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-16",
    decision:
      "Hard-reject client-supplied operator login passwords longer than MAX_OPERATOR_PASSWORD_LENGTH (256) in tryCreateSessionFromPassword / passwordsMatch before Buffer.from — rather than soft-cap (would change the secret), leave uncapped public form input allocating multi-MB buffers under the 5/60s rate limit, or invent an optional aggregate while free NEXT_STEPS stay operator/legal-gated.",
    rationale:
      "Empty-backlog after PR #293. Sibling business-process-evolution-191d claimed checkout-success-sessionId-field-length-cap (SSR opaque-id twin) — complementary pivot to the public login form size hole. Rate limits blunt attempt count only; passwordsMatch previously allocated Buffer.from(provided) before the length-mismatch short-circuit. Treating over-long as wrong password keeps login UX identical for abuse while protecting the compare path. Next residual public body size: safeNextPath length on login next=. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-16",
    decision:
      "Bound login next= path length via MAX_SAFE_NEXT_PATH_LENGTH (2048) inside safeNextPath / isSafeNextPath and fall back to /dashboard on over-length — rather than soft-cap (would change the redirect), hard-reject 400 (would strand login), or invent an optional aggregate while free NEXT_STEPS stay operator/legal-gated.",
    rationale:
      "Empty-backlog after PR #295 (login password + checkout-success sessionId). Free NEXT_STEPS stayed operator/legal-gated. AGENT_PROTOCOL residual public body sizes named login next-path length next: password already hard-rejects, but safeNextPath still accepted unbounded dashboard-shaped paths into encodeURIComponent redirects and Location headers under the 5/60s login rate limit. Optional redirect fields share the fall-back path with open-redirect/malformed (same class as billing-portal returnUrl); opaque lookup keys stay hard-reject. Public-write body-size sweep for known login/money/contact/unsubscribe sinks is now closed — next empty-backlog prefers Convex parity or a dated clean-audit. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-16",
    decision:
      "Hard-reject over-long path slugs on the sold SSR GET /preview/[slug] via shared isPublicLeadSlugPathLengthOk (MAX_PUBLIC_LEAD_SLUG_PATH_LENGTH=120) inside loadPreviewPageLead before getLeadBySlug / resolvePreviewLead — rather than leave the page as an uncapped twin of contact/preview-open, soft-cap (would change the lookup key / mint a truncated synthetic lead), or invent an optional aggregate while free NEXT_STEPS stay operator/legal-gated.",
    rationale:
      "Empty-backlog after PR #296 (login-next-path). Sibling d6b1 owned that claim (earlier remote + feature); this run dual-claimed then pivoted per AGENT_PROTOCOL. Contact API + preview-open already capped path length, but /preview/[slug] still called getLeadBySlug and resolvePreviewLead (which mints a synthetic lead for any token) so multi-KB paths still rendered full preview HTML/JSON-LD and burned listOrders/commerce. Page GET twins of API hard-rejects remain the highest-leverage empty-backlog axis after login/money/contact/unsubscribe body-size sinks close. Next residual: optional /checkout?slug= prefill fall-back / Convex parity / clean-audit. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-16",
    decision:
      "Bound optional /checkout?slug= prefill via shared isPublicLeadSlugPathLengthOk (MAX_PUBLIC_LEAD_SLUG_PATH_LENGTH=120) inside resolveCheckoutPrefillSlug / loadCheckoutPrefillLead and treat over-long as missing (un-prefilling checkout) — rather than soft-cap (would change the CRM lookup key), hard-reject 400 (would strand a buyer on an optional attribution field), leave uncapped getLeadBySlug + cancelled-banner leadPreviewPath, or invent an optional aggregate while free NEXT_STEPS stay operator/legal-gated.",
    rationale:
      "Empty-backlog after PR #298 (preview-page slug path). Contact/preview-open/preview page already gate path slug length; /checkout?slug= was the residual optional query twin — multi-KB searchParams still reached getLeadBySlug and flowed into CheckoutPrefill (form slug→bundle checkout + cancelled preview link). Optional redirect/attribution fields share the fall-back path with returnUrl / login next=; opaque lookup keys and required path slugs stay hard-reject. Next empty-backlog: residual page GET twins / Convex parity / clean-audit / stuck CLI scan. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-16",
    decision:
      "Gate Host→preview lookups before CRM/Convex: extractPreviewSubdomainSlug returns null when the label fails isPublicLeadSlugPathLengthOk (MAX_PUBLIC_LEAD_SLUG_PATH_LENGTH=120); custom-domain Host must pass isPlausibleCustomDomainHost (≤253 + label shape) in proxy.ts and getLeadSlugByCustomDomain — treat over-long spoofed Host like unrecognized (marketing homepage fall-through) rather than soft-cap (wrong lookup key), invent an optional aggregate, or leave path/query slug caps with an uncapped Host twin.",
    rationale:
      "Empty-backlog after PR #299 (checkout-slug-prefill). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were clean-audit-only or already-merged Convex ordering parity. Path/query slug sinks (contact, preview-open, preview page, checkout prefill) already gated length, but src/proxy.ts Host→preview still called getLeadBySlug / getLeadSlugByCustomDomain on uncapped spoofed Host labels — HTTP Host is not DNS-bounded at the app layer. Fall-through matches unrecognized-slug UX; opaque path keys stay hard-reject. Next empty-backlog: dated clean-audit of remaining public sinks / Convex parity residuals. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },

  {
    date: "2026-07-16",
    decision:
      "Bound proxy dashboardAuthGate login redirect next= via safeNextPath(pathname) and clear inherited query/hash on the login URL before minting Location — rather than set next= to the raw request pathname (login-page safeNextPath alone is too late for the redirect header), soft-cap (would change the destination), or invent an optional aggregate while free NEXT_STEPS stay operator/legal-gated.",
    rationale:
      "Empty-backlog after PR #300 (proxy-host-lookup). Free NEXT_STEPS stayed operator/legal-gated. login-next-path-field-length-cap already falls back over-long next= on the login page / loginOperatorAction, but src/proxy.ts still cloned nextUrl and set next=pathname verbatim — a multi-KB /dashboard/… probe (or inherited ?probe=) minted an over-long Location before the page gate ran. Same optional-redirect fall-back class as returnUrl / login next=. Next empty-backlog: dated clean-audit of remaining public sinks / Convex parity residuals. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-16",
    decision:
      "Bound optional POST /api/preview/[slug]/open body.openedAt via resolvePreviewOpenedAt / MAX_PREVIEW_OPENED_AT_LENGTH (64) and treat over-long / non-string / unparseable as missing (server now) — rather than leave Date.parse uncapped after path-slug length gates, soft-cap (would change the timestamp), hard-reject 400 (would strand a fire-and-forget beacon), or invent an optional aggregate while free NEXT_STEPS stay operator/legal-gated.",
    rationale:
      "Empty-backlog after proxy-login-redirect-next-bound. Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were clean-audit-only / already-merged. Path/query/Host/proxy-login size sinks closed, but the public preview-open beacon still fed uncapped openedAt into Date.parse before persist — rate limits blunt count, not per-request parse work. Optional JSON timestamp shares the fall-back class with returnUrl / login next= / checkout?slug=; opaque lookup keys and required path slugs stay hard-reject. Process improvement: after public URL/path size gates close, scan residual optional JSON body fields on public beacons before a dated clean-audit. Next empty-backlog: dated clean-audit / Convex parity / auth-gated Assign-project id length. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-16",
    decision:
      "Hard-reject OPERATOR_SESSION_COOKIE values longer than MAX_OPERATOR_SESSION_TOKEN_LENGTH (128) in verifyOperatorSessionToken before HMAC / Buffer.from — rather than soft-cap (would change the opaque token), leave uncapped Cookie probes allocating multi-KB crypto on every /dashboard/* proxy gate with no rate limit, or invent an optional aggregate while free NEXT_STEPS stay operator/legal-gated.",
    rationale:
      "Empty-backlog after proxy-login-redirect-next-bound on main (+ PR #302 preview-open openedAt). Free NEXT_STEPS stayed operator/legal-gated. Sibling 67b2 closed optional beacon openedAt; complementary residual: auth cookie attributes/TTL already clean 2026-07-16, but value size was not — verifyOperatorSessionToken always signed + Buffer.from the client Cookie, and dashboardAuthGate calls it on every /dashboard/* without the login 5/60s throttle. Genuine tokens are ~66 chars (expiry.operator.hmac43); MAX=128 mirrors unsubscribe-token headroom. Next empty-backlog: dated clean-audit / Convex parity / auth-gated Assign-project id length. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-16",
    decision:
      "Hard-reject over-long assignVercelProjectAction vercelProjectId via parseVercelProjectId / MAX_VERCEL_PROJECT_ID_LENGTH (100) before assignVercelProjectAndProvision — rather than soft-cap (would change the opaque Domains API key), leave auth-gated Assign project uncapped after public size sinks closed, invent an optional aggregate, or leave a stuck CLI feature body unmerged while free NEXT_STEPS stay operator/legal-gated.",
    rationale:
      "Empty-backlog after PR #303 (operator-session-token + preview-open openedAt). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI opencode/dev-work-auth-gated-field-caps already shipped the helper + action wire with no open PR — fold that body (plus action-level over-long / exact-max Vitest) before a dated clean-audit. assignCustomDomainAction already bounds via parseOperatorCustomDomain; Assign project was the residual auth-gated id gap. Process improvement: when AGENT_PROTOCOL names a stuck-CLI fold target explicitly, prefer that remote over inventing the same audit from scratch. Next empty-backlog: dated clean-audit on an undated axis / Convex parity residual. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-16",
    decision:
      "Sort Convex commerceOrders.list / listUnpaid by app createdAt ISO descending (collect + sort + slice for list limit) to match SQLite ORDER BY createdAt DESC, and re-apply sortCommerceOrdersNewestFirst in db.ts on the Convex path as belt-and-suspenders — rather than leave bare .order(\"desc\") (_creationTime) as a residual after convex-query-ordering-parity, invent an optional aggregate, or dual-build Assign-project id length already claimed by sibling 1ba2.",
    rationale:
      "Empty-backlog after PR #302/#303. Free NEXT_STEPS stayed operator/legal-gated. Sibling business-process-evolution-1ba2 claimed (then shipped as PR #304) assign-vercel-project-id-field-length-cap — complementary axes kept. Stuck CLI remotes were clean-audit-only / already-merged. Memory + AGENT_PROTOCOL named the commerceOrders createdAt vs _creationTime residual after leads/checkoutSessions/inquiries were folded — payout panel and unpaid digest order can diverge when app createdAt ≠ insert clock. Closing that dual-backend money-ledger axis beats a repeated public-size re-audit. Next empty-backlog: dated clean-audit / auth-gated Mark-paid-out or recovery stripeSessionId length via parseCheckoutSessionId. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-16",
    decision:
      "Hard-reject over-long stripeSessionId on markCommerceOrderPaidOutAction + sendCheckoutRecoveryAction + sendCommerceCheckoutRecoveryAction via shared parseCheckoutSessionId (MAX_STRIPE_CHECKOUT_SESSION_ID_LENGTH=255) before any Convex/SQLite lookup or email work — rather than leave auth-gated Mark paid out / abandoned-recovery as uncapped twins of the public billing-portal + success-page sessionId sinks, soft-cap (wrong opaque key), invent an optional aggregate, or jump to a dated clean-audit while free NEXT_STEPS stay operator/legal-gated.",
    rationale:
      "Empty-backlog after PR #305 (commerceOrders createdAt ordering). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were clean-audit-only / already-merged (auth-gated Assign-project already folded as #304). AGENT_PROTOCOL + the prior BUSINESS_DECISION named Mark-paid-out / recovery stripeSessionId length next — closing that auth-gated twin of an already-shipped opaque-id parser is higher leverage than a 3rd re-audit of a clean axis. Process improvement: after a public size/opaque-id helper lands, prefer wiring its auth-gated dashboard twins in the next empty-backlog window before inventing a clean-audit. Same-window sibling c954 shipped complementary inquiryId length. Next empty-backlog: remaining auth-gated opaque ids (handoffId / packId / orderId) or dated clean-audit. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-16",
    decision:
      "Hard-reject over-long replyToInquiryAction / updateInquiryStatusAction inquiryId via parseInquiryId / MAX_INQUIRY_ID_LENGTH (128) before Convex/SQLite or Resend — rather than soft-cap (would change the opaque app-owned inq_* key), dual-build Mark-paid-out/recovery stripeSessionId already claimed by sibling 28bd, invent an optional aggregate, or leave auth-gated inquiry reply/status uncapped after Assign-project id length closed.",
    rationale:
      "Empty-backlog after PR #305 (commerceOrders createdAt ordering). Free NEXT_STEPS stayed operator/legal-gated. Sibling business-process-evolution-28bd claimed auth-gated-stripe-sessionId-field-length-cap first (merged PR #306) — complementary axis kept. Memory named inquiryId on reply/status as the next free residual. Genuine ids are inq_<leadSlug>_<Date.now()> (≤ ~81 with MAX_LEAD_SLUG_LENGTH=63); MAX=128 mirrors other opaque token headroom. Process improvement: after auth-gated Assign-project + stripeSessionId land, scan remaining auth-gated opaque app-owned ids (inquiryId, then handoffId / packId / orderId) before a dated clean-audit. Next empty-backlog: remaining auth-gated opaque ids or dated clean-audit. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },


  {
    date: "2026-07-16",
    decision:
      "Hard-reject over-long slug on all 18 slug-keyed auth-gated dashboard actions via parseLeadSlugLookup / MAX_LEAD_SLUG_LENGTH (63) before Convex/SQLite / Stripe / Resend — rather than soft-cap (would change the opaque CRM key), invent an optional aggregate, leave handoff/pack/order surfaces uncapped after inquiryId + stripeSessionId closed, or assume handoffId/packId/orderId are client-submitted when the dashboard keys those rows by lead slug.",
    rationale:
      "Empty-backlog after PR #306/#307 (auth-gated stripeSessionId + inquiryId). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were clean-audit-only / already-merged. AGENT_PROTOCOL named remaining auth-gated opaque ids (handoffId / packId / orderId), but auditing the action surface found those ids are not client-submitted — Mark live / packs / catalog / Billing / stage / notes all take slug. Closing that residual opaque-id class (and DRY-ing commerce Buy now onto the same helper) beats a dated re-audit. Process improvement: when protocol names handoffId/packId/orderId, verify the dashboard actually submits those ids before inventing parsers — slug is often the real lookup key. Same-window sibling c8f9 shipped complementary CSV body size. Next empty-backlog: dated clean-audit on an undated axis / residual free-text soft-caps / stuck CLI fold. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-16",
    decision:
      "Hard-reject over-long importLeadsCsvAction csvText via parseCsvImportText / MAX_CSV_IMPORT_TEXT_LENGTH (512_000) before parseLeadsCsv / splitCsvIntoLines — rather than soft-cap (would truncate mid-row and mint corrupt leads), rely on MAX_ROWS=100 alone (line-splitting still runs first), dual-build auth-gated-lead-slug already claimed by sibling f30c, invent an optional aggregate, or leave the live Places-gated lead-volume unlock uncapped on payload size.",
    rationale:
      "Empty-backlog after PR #306/#307. Free NEXT_STEPS stayed operator/legal-gated. Sibling f30c claimed auth-gated-lead-slug after scanning handoffId/packId/orderId (slug-keyed, not client-submitted) — complementary axis kept (merged PR #308). Per-cell CSV/create-path caps were already shipped, but the bulk body itself was not. Process improvement: when the auth-gated opaque-id scan finds those ids are slug-keyed, prefer bulk-ingest body size (CSV) as the next free residual before a dated clean-audit. Next empty-backlog: dated clean-audit / remaining auth-gated free-text residuals. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-16",
    decision:
      "Soft-cap Lead.dataSource on importLeadsCsvAction + addLeadAction via shared normalizeLeadDataSource / MAX_LEAD_DATA_SOURCE_LENGTH (64) before upsert — rather than hard-reject (would strand legitimate custom batch labels), leave the compliance tag uncapped after csvText + per-cell caps closed, invent an optional aggregate, or jump straight to a dated clean-audit while free NEXT_STEPS stay operator/legal-gated.",
    rationale:
      "Empty-backlog after PR #308/#309 (auth-gated lead-slug + CSV body size). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were clean-audit-only / already-merged (password-trim already on main; use-server export-type cleanup is type-only hygiene deferred). AGENT_PROTOCOL named residual auth-gated free-text after opaque-id + body-size close — dataSource was the live Places-gated lead-volume residual still unbounded. Soft-cap fits free-text tags; opaque keys stay hard-reject. Process improvement: after bulk csvText hard-reject lands, scan residual optional batch metadata tags on the same create-path before inventing a clean-audit. Next empty-backlog: dated clean-audit / inquiry-reply body soft-cap if uncapped / use-server export-type fold. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-16",
    decision:
      "Drop inline `export type` aliases from \"use server\" files (BootstrapStripePricesActionResult / ImportLeadsCsvResult → non-exported `type`) by folding stuck opencode/dev-work-use-server-export-cleanup — rather than leave a Turbopack async-fn-only surface violation, invent an optional aggregate, or jump to a dated clean-audit while free NEXT_STEPS stay operator/legal-gated.",
    rationale:
      "Empty-backlog after PR #310 (dataSource soft-cap). Free NEXT_STEPS stayed operator/legal-gated. AGENT_PROTOCOL named the stuck use-server export-type hygiene fold next; both aliases are local return annotations with zero external importers. Complementary free-text audit confirmed inquiry reply (MAX=4000), operator notes (MAX=2000), commerce SKU name/description, and create-path + dataSource caps already closed — no further soft-cap residual on those sinks. Process improvement: after opaque-id + CSV body + dataSource close, prefer folding a named stuck CLI hygiene body before inventing a 3rd re-audit; also re-verify ITERATIONS[].decisions ownership via object-parse (tsx import) and tighten +1 drift on recent slices. Next empty-backlog: dated clean-audit on Convex API map / marker-after-unchecked-await / public marketing OUTPUT indexing. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-16",
    decision:
      "Soft-cap marketing + client-voice LLM pack variant title/body/cta (and per-hashtag string length) via shared src/lib/packs/variant-fields.ts at parseVariantsJson before upsert/email — rather than invent an optional aggregate, re-document a 3rd clean pass on already-green Convex API map / marker-after-await / preview-index axes, hard-reject (would fail Generate pack on a long but usable model response), or leave sold skipSuppression pack delivery unbounded after operator INPUT free-text caps closed.",
    rationale:
      "Empty-backlog after PR #311 (use-server-export-type-cleanup). Free NEXT_STEPS stayed operator/legal-gated. Same-window sibling business-process-evolution-7e91 claimed complementary preview-page-uncapped-listOrders — both axes kept. Dated audit of Convex API map + durable-marker-after-unchecked-await + public marketing OUTPUT indexing came back clean; residual free-text was LLM OUTPUT (parseVariantsJson) not operator INPUT. Soft-cap fits free-text pack fields; hashtags already sliced to count 8 but not string length. Process improvement: after 2+ clean passes on axes 1–3 and operator INPUT soft-caps close, rotate free-text scans to sold LLM OUTPUT sinks (marketing/voice parseVariantsJson) before inventing another dated clean-audit. Next empty-backlog: fold sibling preview listOrders work if still ahead, or a dated clean-audit on an undated axis. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-16",
    decision:
      "Stage-gate + slug-scope public /preview/[slug] Commerce order reads via loadPreviewCommerceItems + listOrdersByLeadSlug (orders.by_leadSlug / SQLite WHERE) — rather than keep listOrders() full-ledger collect on every cold outreach preview, invent an optional digest aggregate (workNextCount), fold clean-audit-only stuck remotes, or jump to a 3rd identical clean-audit while free NEXT_STEPS stay operator/legal-gated.",
    rationale:
      "Empty-backlog after PR #311 (use-server-export-type-cleanup). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were clean-audit-only / already-merged / invent-optional-aggregate (opencode/dev-work-empty-backlog-072516 workNextCount — rejected per AGENT_PROTOCOL). Same-window sibling prompt-process-evolution-e626 shipped complementary marketing-voice-pack-variant-field-length-cap (merged PR #312) — both axes kept. Fresh sold-capability audit found /preview/[slug] always awaited listOrders() before leadEligibleForCommerceCatalog's stage short-circuit — waste that scales with every paid order on the high-volume cold-preview path. Schema already had by_leadSlug unused. Process improvement: after field-length + use-server hygiene close, audit sold SSR hot paths for uncapped list* before inventing another dated re-audit; reject workNextCount-style optional aggregates even when a stuck remote claims them. Next empty-backlog: dated clean-audit on an undated axis, or the next sold hot-path residual. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-16",
    decision:
      "Soft-cap StubMarketingGenerator / StubClientVoiceGenerator stubVariant title/body/cta/hashtags via the same src/lib/packs/variant-fields.ts helpers as parseVariantsJson — rather than leave the default/fallback pack path uncapped after PR #312 closed only the Anthropic parse sink, invent an optional aggregate, or jump to a 3rd clean-audit of already-green axes 1–3 while free NEXT_STEPS stay operator/legal-gated.",
    rationale:
      "Empty-backlog after PR #312/#313 (LLM pack soft-caps + preview listOrders). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were clean-audit-only / already-merged. Fresh sold-OUTPUT audit found stubVariant still interpolated create-path-max business fields into uncapped pack strings that upsert + skipSuppression email — voice services.join at MAX_SERVICES×MAX_SERVICE_ITEM_LENGTH alone exceeds BODY=8000. Process improvement: after closing an LLM parse soft-cap, always check the stub/fallback twin before declaring the OUTPUT axis done. Next empty-backlog: auth-gated listOrders→listOrdersByLeadSlug twins, dated clean-audit on an undated axis, or the next sold OUTPUT residual. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-16",
    decision:
      "Drop loadPreviewCommerceItems from the `@/lib/commerce` barrel and keep Server Component imports on `@/lib/commerce/preview-commerce` — rather than leave next build broken after PR #313, try to make the dynamic db import client-safe, or invent an optional aggregate while free NEXT_STEPS stay gated.",
    rationale:
      "Verifying the stub soft-cap iteration with npm run build (not just test/lint) surfaced a PR #313 regression: re-exporting a helper that lazy-imports server-only db through a barrel imported by leads-client.tsx still pulls db into the client graph under Turbopack. Process improvement: after shipping a sold SSR helper that touches db, run build and confirm the barrel is not on a client import path before claiming done. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-16",
    decision:
      "Wire listOrdersByLeadSlug into createBillingPortalForLead + per-lead dashboard sold-capability gates (Starter upsell / marketing pack generate+email / commerce catalog save / client voice generate+email) after preview #313 shipped the helper — rather than leave Manage billing and operator eligibility on full-ledger listOrders().filter(slug), invent an optional aggregate, or jump to a 3rd clean-audit while free NEXT_STEPS stay operator/legal-gated.",
    rationale:
      "Empty-backlog after PR #313/#314 (preview listOrders + stub pack soft-caps). Free NEXT_STEPS stayed operator/legal-gated. Same-window sibling a070 closed the stub/fallback OUTPUT twin + commerce barrel regression; complementary followthrough kept. Fresh sold-capability audit found six auth-gated slug-keyed actions + Manage billing still collected the full order ledger then filtered — the exact anti-pattern preview just fixed. Digest + dashboard page aggregates correctly keep listOrders(). Process improvement: when a new indexed list* helper ships for one hot path, immediately scan auth-gated / sold slug-keyed twins before inventing another dated clean-audit. Next empty-backlog: dated clean-audit on Convex API map / marker-after-unchecked-await / public marketing OUTPUT indexing. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-16",
    decision:
      "Soft-cap marketing + client-voice pack variant fields at Email pack / Email voice pack HTML format and on pack read/parse (SQLite parsers + Convex-primary softCap* helpers) via shared softCapPackVariantFields — rather than leave already-stored pre-cap rows and Convex reads able to bypass generate-time soft-caps under skipSuppression, invent an optional aggregate, or jump to a 3rd clean-audit while free NEXT_STEPS stay operator/legal-gated.",
    rationale:
      "Empty-backlog after PR #314/#315 (stub pack soft-caps + slug-scoped listOrders followthrough). Free NEXT_STEPS stayed operator/legal-gated. Same-window sibling business-process-evolution-18d9 claimed complementary preview-jsonld-indexable-only (merged PR #316) — both axes kept via merge. Stuck CLI remotes were clean-audit-only / already-merged. Fresh sold-OUTPUT audit found generate soft-caps (#312/#314) closed Anthropic parse + stub before upsert, but formatMarketingPackEmailHtml / formatClientVoicePackEmailHtml + Convex get* still emitted uncapped persisted variants. Process improvement: after closing a sold OUTPUT soft-cap at generate (parse + stub), always check the deliver/read twin before declaring the axis done. Also tightened ITERATIONS slice drift (349–364 ownership clean). Next empty-backlog: dated clean-audit on Convex API map / marker-after-unchecked-await. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-16",
    decision:
      "Emit LocalBusiness JSON-LD on /preview/[slug] only when isLeadPreviewIndexable is true (via leadPreviewJsonLdIfIndexable) — rather than keep structured data on every cold-prospect noindex preview, invent an optional digest aggregate (workNextCount), register dead Convex orders.createOrder / getByStripeSessionId API-map orphans, or jump to a 3rd clean-audit of already-green Convex/marker-await axes while free NEXT_STEPS stay operator/legal-gated.",
    rationale:
      "Empty-backlog after PR #315 (slug-scoped-listOrders-followthrough). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were clean-audit-only / invent-optional-aggregate (opencode workNextCount — rejected) / dead Convex map orphans (rejected — order writes go through leads.markLeadPaid). Fresh public marketing OUTPUT audit found sitemap + robots already share isLeadPreviewIndexable, but the page still always embedded LocalBusiness JSON-LD — crawlers that parse structured data still saw cold-prospected business fields under robots=noindex. Process improvement: after robots/sitemap consent gating ships, always check the JSON-LD twin before declaring the public marketing OUTPUT axis closed. Next empty-backlog: dated clean-audit on Convex API map / marker-after-unchecked-await, or the next sold hot-path residual. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-16",
    decision:
      "Hard-reject operator-supplied Commerce SKU ids longer than MAX_COMMERCE_SKU_ID_LENGTH (64) in normalizeCommerceItems / saveCommerceCatalogAction — rather than keep trim+slice(0,64) after public Buy now already hard-rejects the same ceiling, invent an optional aggregate, or jump to a 3rd clean-audit of already-green Convex/marker-await axes while free NEXT_STEPS stay operator/legal-gated.",
    rationale:
      "Empty-backlog after PR #316/#317 (JSON-LD indexable + pack deliver/read soft-caps). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were clean-audit-only / already-merged (preview-index, convex order parity, snooze, optimistic-state). Fresh sold-capability audit found auth-gated catalog save still truncated opaque SKU ids while POST /api/commerce/checkout hard-rejected — truncating distinct over-long ids can collide preserveCommerceStripeIds / Sync-to-Stripe Product keys. Process improvement: after a public opaque-id hard-reject ships, immediately audit the auth-gated write twin that mints/persists the same key. Next empty-backlog: dated clean-audit on Convex API map / marker-after-unchecked-await, or the next sold residual. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-16",
    decision:
      "Bound optional preview-open attribution query params (src / utm_source) via resolvePreviewOpenAttrParam / MAX_PREVIEW_OPEN_ATTR_PARAM_LENGTH (32) and treat over-long as missing — rather than leave them uncapped after openedAt + path slug were gated, soft-cap/truncate into a fake attribution token, hard-reject 400 a fire-and-forget beacon, or invent an optional aggregate while free NEXT_STEPS stay operator/legal-gated.",
    rationale:
      "Empty-backlog after catalog SKU id hard-reject on main. Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were clean-audit-only / already-merged. Fresh public-write residual twin of preview-open-openedAt-field-length-cap: POST /api/preview/[slug]/open still fed uncapped src/utm_source into shouldRecordPreviewOpen (toLowerCase/trim) — rate limits blunt request count, not per-request string work on multi-KB attribution probes. Genuine values are short (outreach/email/resend). Process improvement: after bounding an optional beacon body field, always scan residual optional query params on the same public route before declaring the size axis closed. Next empty-backlog: dated clean-audit on Convex API map / marker-after-unchecked-await, or the next sold residual. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-16",
    decision:
      "Bound GET /preview/[slug] src/utm_source searchParams via resolvePreviewOpenAttrParam before PreviewOpenBeacon (and buildPreviewOpenBeaconPath inside the beacon) — rather than leave the SSR page as an uncapped twin of the API route bound in PR #318, invent an optional aggregate, or jump to a dated clean-audit while trackByStage still re-emits multi-KB attribution onto the beacon fetch URL.",
    rationale:
      "Empty-backlog after PR #318 (preview-open-src-utm-field-length-cap). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were clean-audit-only / already-merged. Fresh public-write residual: API route bounds src/utm_source, but the sold SSR preview page still passed raw searchParams into PreviewOpenBeacon — when trackByStage (outreach_sent/discovery_call), the client set uncapped values on URLSearchParams before fetch. Process improvement: after an API route bounds optional query params, immediately audit the SSR page twin that forwards those params into a client beacon/fetch. Also restored absolute BUSINESS_DECISIONS ownership drifted by the #318 fold (catalog SKU=366, API src-utm=367; slice(368,369) was past length). Next empty-backlog: dated clean-audit on Convex API map / marker-after-unchecked-await. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-16",
    decision:
      "Lock the static Convex API map with Vitest (convex-api-map-audit) after a dated clean pass on map completeness + marker-after-unchecked-await — rather than re-prose the same clean axes, invent an optional aggregate, or register the deliberate dead orders.createOrder / orders.getByStripeSessionId orphans.",
    rationale:
      "Empty-backlog after PR #319 (preview-page-src-utm). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were clean-audit-only / already-merged. Fresh audit confirmed Convex API map, send-success markers, public optional query/body caps, auth-gated free-text soft-caps, SSR page twins, and pack deliver/read soft-caps all clean. A missing map registration is a silent multi-instance split-brain (call throws → SQLite fallback while list* reads Convex-first); a durable Vitest that diffs convex/*.ts public exports vs db.ts `const api` catches that class before merge. Process improvement: after documenting a clean map/marker pass, ship the regression test instead of a third identical prose audit. Next empty-backlog: stuck CLI fold / sold residual / escapeHtml·webhook·uncapped axes not dated this week. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-16",
    decision:
      "Hard-reject public (and open-demo auth-gated) JSON POST bodies over MAX_PUBLIC_JSON_BODY_BYTES (32_768) via readJsonBodyWithByteLimit / contentLengthExceedsLimit before JSON.parse or formData — rather than leave field-level caps as the only size gate after unbounded request.json() allocation, invent an optional aggregate, or skip to a 3rd identical Convex/marker clean-audit while free NEXT_STEPS stay operator/legal-gated.",
    rationale:
      "Empty-backlog after PR #319 (preview-page-src-utm). Free NEXT_STEPS stayed operator/legal-gated. Sibling prompt-process-evolution-6ba0 claimed complementary clean-audit-2026-07-16-convex-map-marker-await (merged PR #320) — both axes kept. Stuck CLI remotes were clean-audit-only / invent-optional-aggregate (workNextCount) / dead orders.createOrder map orphans — rejected. Fresh public-write residual: per-field caps (openedAt, src/utm, sessionId, contact MAX_CONTACT_*, etc.) still run after request.json() has decoded the full body; rate limits blunt request count, not multi-MB parse work. Process improvement: after per-field size sinks close, prefer whole-body byte bounds on public money/contact/beacon (+ marketing/generate when password unset) before inventing another dated clean-audit; skip Stripe webhook (signed raw text). Next empty-backlog: residual auth-gated FormData twins / stuck CLI fold / escapeHtml·webhook·uncapped axes not dated this week. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-16",
    decision:
      "Hard-reject public contact form-urlencoded/multipart bodies over MAX_PUBLIC_REQUEST_BODY_BYTES (same 32_768 ceiling as JSON) via readFormBodyWithByteLimit (arrayBuffer + rebuild → formData) — rather than leave Content-Length-only pre-checks as the FormData gate after public-json-body-byte-length-cap, invent an optional aggregate, or skip to a 3rd identical Convex/marker clean-audit while free NEXT_STEPS stay operator/legal-gated.",
    rationale:
      "Empty-backlog after PR #321 (public-json-body-byte-length-cap). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were clean-audit-only / invent-optional-aggregate / already-merged — rejected. Fresh public-write residual twin: contact JSON path arrayBuffer-bounds, but form-urlencoded/multipart still called unbounded request.formData() when Content-Length was missing or understated. Login server-action FormData stays field-capped (password/next) because Next parses multipart before the action runs. Process improvement: after a public JSON whole-body bound ships, immediately close the FormData twin before inventing another dated clean-audit. Next empty-backlog: stuck CLI fold / escapeHtml·webhook·uncapped axes not dated this week / next sold residual. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-16",
    decision:
      "Require getBundle(tier) on checkout.session.completed before recordLeadPayment / deploy handoff / receipt, and escapeHtmlForEmail the receipt tier label (prefer catalog display name) — rather than treat any truthy metadata.tier as a valid Local Site Studio bundle, invent an optional aggregate, or leave receipt tier unescaped while businessName is escaped.",
    rationale:
      "Empty-backlog after PR #322 (public-formdata-body-byte-length-cap). Free NEXT_STEPS stayed operator/legal-gated. Sibling FormData twin closed; stuck CLI remotes were clean-audit-only / invent-optional-aggregate / already-merged — rejected. Fresh money-path residual: POST /api/stripe/checkout already rejects unknown tiers via getBundle, but the webhook only checked truthy slug+tier — a Dashboard-minted or tampered Checkout Session with tier=enterprise (or wrong-cased Growth) would still mark payment, enqueue handoff, and render raw tier into skipSuppression receipt HTML. Unknown tier skips like missing slug/tier (session already marked complete; do not 5xx forever). Process improvement: after checkout create enum-gates a metadata field, audit the webhook consumer for the same gate before inventing another dated clean-audit. Next empty-backlog: stuck CLI fold / escapeHtml·webhook·uncapped axes not dated this week / next sold residual. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-16",
    decision:
      "Require commerce catalog membership (and parseCommerceCheckoutSkuId length) on checkout.session.completed kind=commerce_sku before insertCommerceOrder / inquiry / client receipt — rather than accept any truthy metadata.skuId with a \"Catalog item\" name fallback, invent an optional aggregate, or leave Buy now create's 404 as the only catalog gate while free NEXT_STEPS stay operator/legal-gated.",
    rationale:
      "Empty-backlog after PR #323 (bundle-webhook-tier-enum-guard). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were invent-optional-aggregate (workNextCount) / clean-audit-only / already-merged — rejected. Fresh money-path residual twin of bundle getBundle: POST /api/commerce/checkout 404s unknown catalog SKUs, but the webhook still ledgered + notified for any truthy skuId (Dashboard-minted or tampered sessions). Unknown/over-long skuId now skips like missing skuId (session already marked complete; do not 5xx forever). Process improvement: after shipping a create-path ↔ webhook enum gate for one metadata field, immediately audit the sibling money path's matching create gate (Commerce catalog membership after bundle getBundle). Next empty-backlog: stuck CLI fold / escapeHtml·webhook·uncapped axes not dated this week / next sold residual. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-16",
    decision:
      "Require checkout.session.completed commerce_sku amount_total (integer cents) === catalogItem.priceCents before insertCommerceOrder / inquiry / client receipt — rather than trust any Stripe amount once skuId is catalog-known, invent an optional aggregate, or leave Buy now create's catalog stripePriceId as the only price gate while free NEXT_STEPS stay operator/legal-gated.",
    rationale:
      "Empty-backlog after PR #324 (commerce-webhook-sku-catalog-gate). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were invent-optional-aggregate / clean-audit-only / already-merged — rejected. Fresh money-path residual: Buy now create never takes a client amount (Price from catalog.stripePriceId), but the webhook still ledgered session.amount_total for any catalog-known skuId — a Dashboard-minted session with a valid skuId and a different Stripe Price could skew Commerce payouts totals and client receipts. Amount mismatch / missing / non-integer now skips like unknown skuId (session already marked complete; do not 5xx forever). Mid-checkout catalog reprice can skip ledger for a legitimate paid session — operator reconciles from Stripe; wrong payouts bookkeeping is worse. Process improvement: after create↔webhook catalog membership ships, immediately audit amount/Price parity on the same money path. Next empty-backlog: stuck CLI fold / commerce-webhook-slug-lookup-gate / escapeHtml·webhook·uncapped axes not dated this week. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-16",
    decision:
      "Require parseCommerceCheckoutSlug on checkout.session.completed kind=commerce_sku before getLeadBySlug / getCommerceCatalog / insertCommerceOrder — rather than accept any truthy metadata.slug, invent an optional aggregate, or leave Buy now create's slug hard-reject as the only length gate while free NEXT_STEPS stay operator/legal-gated.",
    rationale:
      "Empty-backlog after PR #325 (commerce-webhook-amount-catalog-parity). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were invent-optional-aggregate (workNextCount) / clean-audit-only / already-merged use-server+vercel-id under different SHAs — rejected. Fresh money-path residual: Buy now create hard-rejects over-long slug via parseCommerceCheckoutSlug, but the webhook still burned CRM/catalog lookups (and could ledger) for any truthy slug including multi-KB Dashboard-minted metadata. Over-long/missing slug now skips like missing skuId (session already marked complete; do not 5xx forever). Process improvement: after create↔webhook skuId length + catalog + amount gates ship, immediately audit the matching slug lookup gate on the same money path. Next empty-backlog: stuck CLI fold / escapeHtml·webhook·uncapped axes not dated this week / next sold residual. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-16",
    decision:
      "Require parseLeadSlugLookup on checkout.session.completed bundle fulfillment before recordLeadPayment / handoff / receipt — rather than accept any truthy metadata.slug, invent an optional aggregate, or leave Commerce webhook's slug length gate as the only money-path twin while free NEXT_STEPS stay operator/legal-gated.",
    rationale:
      "Empty-backlog after PR #326 (commerce-webhook-slug-lookup-gate). Dual-claimed that todo with 2ecd (earlier remote claim owned; they shipped #326) — pivoted to the bundle twin. Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were invent-optional-aggregate / clean-audit-only / already-merged — rejected. Fresh money-path residual: POST /api/stripe/checkout sanitizes+caps slug via resolveBundleCheckoutLeadSlug / sanitizeLeadSlug (MAX_LEAD_SLUG_LENGTH=63), but the bundle webhook still treated any truthy metadata.slug as the CRM key — a Dashboard-minted multi-KB slug could mint an oversized paid stub lead and burn fulfillment emails. Over-long/missing now skips like unknown tier (session already marked complete; do not 5xx forever). Process improvement: after a Commerce webhook slug length gate ships, immediately audit the bundle webhook slug twin before inventing another dated clean-audit. Next empty-backlog: stuck CLI fold / escapeHtml·webhook·uncapped axes not dated this week / next sold residual. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-16",
    decision:
      "Require checkout.session.completed bundle amount_total (integer cents) === expectedBundleCheckoutAmountCents(bundle, commerceAddon) before recordLeadPayment / handoff / receipt — rather than trust any Stripe amount once tier is getBundle-known, invent an optional aggregate, or leave Commerce webhook's amount↔priceCents gate as the only money-path Price twin while free NEXT_STEPS stay operator/legal-gated.",
    rationale:
      "Empty-backlog after PR #327 (bundle-webhook-slug-lookup-gate). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were invent-optional-aggregate / clean-audit-only / already-merged under different SHAs — rejected. Fresh money-path residual twin of commerce-webhook-amount-catalog-parity: POST /api/stripe/checkout charges only catalog Stripe Price IDs from BUNDLES (+ optional COMMERCE_ADDON), but the bundle webhook still recorded session.amount_total for any getBundle-known tier — a Dashboard-minted session with tier=growth and a different Price could skew revenueTotalUsd and skipSuppression receipt amounts. Amount mismatch / missing / non-integer now skips like unknown tier (session already marked complete; do not 5xx forever). Operator Stripe Price edits that drift from BUNDLES USD can skip ledger for a legitimate paid session — reconcile from Stripe; wrong revenue bookkeeping is worse. Process improvement: after Commerce amount↔priceCents ships, immediately audit the bundle amount↔catalog twin. Next empty-backlog: stuck CLI fold / escapeHtml·webhook·uncapped axes not dated this week / next sold residual. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-16",
    decision:
      "Bundle checkout.session.completed must derive commerceAddon from Checkout listLineItems Price IDs (both COMMERCE_ADDON setup+monthly env Prices present via resolveCommerceAddonFromLineItems) before amount parity + recordLeadPayment / handoff — never trust metadata.commerceAddon. Missing Commerce Price env fails closed to false; listLineItems failures return 500 so Stripe retries. After the ledger gate ships, audit createBillingPortalForCheckoutSession's metadata.commerceAddon twin.",
    rationale:
      "Empty-backlog after PR #328 (bundle-webhook-amount-catalog-parity). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were invent-optional-aggregate / clean-audit-only / already-merged feature bodies under stale SHAs — rejected. Fresh money-path residual: POST /api/stripe/checkout only sets metadata.commerceAddon when COMMERCE_ADDON Price IDs are on line_items, but the webhook still trusted metadata.commerceAddon === \"true\" into the paid-order ledger (and into expectedBundleCheckoutAmountCents) — unlocking catalog + Billing Portal and blocking Starter upsell without the $300+$49/mo charge (or withholding a paid add-on when metadata lied false). Same create↔webhook metadata-trust class as tier/slug/sku/amount gates. Process improvement: derive entitlement flags from charged line items before amount/catalog parity that depends on those flags; then audit sold twin readers of the same metadata (billing portal session path). Next empty-backlog: portal commerceAddon twin / stuck CLI fold / escapeHtml·webhook·uncapped axes not dated this week. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-17",
    decision:
      "createBillingPortalForCheckoutSession must derive commerceAddon from Checkout listLineItems Price IDs (reuse resolveCommerceAddonFromLineItems) when mode !== subscription before orderEligibleForBillingPortal — never trust metadata.commerceAddon. Missing Commerce Price env fails closed to false; listLineItems failures return 502 so the customer can retry.",
    rationale:
      "Empty-backlog after PR #329 (bundle-webhook-commerceAddon-line-item-parity). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were invent-optional-aggregate / clean-audit-only / already-merged — rejected. Fresh money-path residual twin of the webhook ledger gate: customer self-serve Billing Portal from /checkout/success still trusted metadata.commerceAddon === \"true\" for Starter+Commerce eligibility when mode was payment — a Dashboard-minted session could open Manage billing without the Commerce Prices on the charge. mode === subscription stays eligible without a line-item round-trip (Growth/Complete/real Commerce create already set subscription). Process improvement: after a webhook derives an entitlement flag from charged line items, immediately audit every sold reader of the same metadata (billing portal session path). Next empty-backlog: stuck CLI fold / escapeHtml·webhook·uncapped / commerce-webhook-currency-usd-gate. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-17",
    decision:
      "Checkout-Session Billing Portal eligibility (createBillingPortalForCheckoutSession + loadCheckoutSuccessSession) must use checkoutSessionEligibleForBillingPortal — subscription mode OR proven commerceAddon only — never metadata.tier on payment mode. Create path never emits payment+growth/complete (hasRecurring); trusting tier only helped Dashboard-minted/tampered sessions open Manage billing / show the success CTA without a recurring Price.",
    rationale:
      "Empty-backlog after PR #329; sibling d518 shipped billing-portal-session-commerceAddon-line-item-parity (folded). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were invent-optional-aggregate / clean-audit-only / already-merged — rejected. Fresh complementary residual: payment-mode path still called orderEligibleForBillingPortal({ tier, commerceAddon }), so forged metadata.tier=growth|complete opened portal (and surfaced Manage subscription on /checkout/success) even with commerceAddon=false and no Commerce Prices. Process improvement: after hardening one Session metadata flag (commerceAddon↔line items), immediately audit the sibling metadata.tier trust on the same payment-mode branch — and mirror the helper on the success SSR twin. Next empty-backlog: stuck CLI fold / escapeHtml·webhook·uncapped / commerce-webhook-currency-usd-gate / success-page commerceAddon line-item SSR twin. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-17",
    decision:
      "loadCheckoutSuccessSession must derive commerceAddon from Checkout listLineItems Price IDs (reuse resolveCommerceAddonFromLineItems) when mode !== subscription before checkoutSessionEligibleForBillingPortal / showBillingPortal — never trust metadata.commerceAddon as an SSR soft hint. Missing Commerce Price env fails closed to false; listLineItems failures hide the Manage billing CTA (buyer can refresh; portal API returns 502 on the same failure).",
    rationale:
      "Empty-backlog after PR #331 (billing-portal-session-payment-mode-tier-metadata-trust). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were invent-optional-aggregate / clean-audit-only / already-merged — rejected. Fresh money-path residual twin: portal API already line-item-gates commerceAddon, but /checkout/success still surfaced Manage billing from forged metadata.commerceAddon on payment mode — UI/API entitlement drift. mode === subscription skips the round-trip (same as portal). Process improvement: after hardening a Session entitlement flag on the API path, immediately close the SSR twin that decides whether to show the CTA — soft hints that disagree with the API are false affordances. Next empty-backlog: stuck CLI fold / escapeHtml·webhook·uncapped / commerce-webhook-currency-usd-gate. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-17",
    decision:
      "checkout.session.completed must require session.currency === \"usd\" (isStripeCheckoutCurrencyUsd) on both commerce_sku and bundle fulfillment before amount↔catalog parity + ledger writes — create path charges only USD Stripe Prices (stripe-sync / bootstrap), and amount_total/100 is recorded as USD dollars. Non-USD / missing currency skips like amount mismatch (session already marked complete; do not 5xx forever).",
    rationale:
      "Empty-backlog after PR #331/#332. Sibling prompt-process-evolution-1924 shipped success-page-commerceAddon-line-item-parity (merged #332) — folded both ITERATIONS. Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were invent-optional-aggregate / clean-audit-only / already-merged — rejected. Fresh residual: amount↔priceCents / expectedBundleCheckoutAmountCents already gated minor units, but currency was unchecked — a Dashboard-minted EUR/JPY session with coincidentally equal minor units would skew commerceOrdersRevenueUsd / revenueTotalUsd and client receipts. Process improvement: after amount↔catalog parity ships, immediately audit currency before inventing another dated clean-audit; apply commerce + bundle twins in the same pass. Next empty-backlog: stuck CLI fold / escapeHtml·webhook·uncapped / next sold residual. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-17",
    decision:
      "checkout.session.completed must require create-path catalog Price IDs on Checkout listLineItems before currency/amount parity + ledger writes — commerce_sku via sessionLineItemsIncludePriceId(catalog.stripePriceId); bundle via sessionLineItemsMatchBundleCatalogPrices(bundleCatalogPriceIdsFromEnv). Amount+currency alone do not prove which Price was charged. Missing/unsynced stripePriceId or missing env Prices / mismatch skips like unknown skuId/tier; listLineItems failures return 5xx (commerce_sku_price_line_items / bundle_commerce_addon_line_items).",
    rationale:
      "Empty-backlog after PR #333 (commerce-webhook-currency-usd-gate). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were invent-optional-aggregate / clean-audit-only / already-merged — rejected. Fresh residual: amount↔catalog + currency usd already gated, but a Dashboard-minted session with matching minor units + usd and a different Stripe Price could still ledger. Process improvement: after amount+currency gates ship, immediately require create-path Price ID membership on line items; apply commerce + bundle twins in the same pass. Next empty-backlog: payment_status paid gate / stuck CLI fold / escapeHtml·webhook·uncapped. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-17",
    decision:
      "checkout.session.completed and checkout.session.async_payment_succeeded must require session.payment_status === \"paid\" (isStripeCheckoutSessionPaid) before commerce/bundle ledger, deploy handoff, and receipts. Unpaid completed still markCheckoutSessionComplete (stop abandoned recovery) and ACK 200; fulfillment runs when paid (same completed event for cards, or async_payment_succeeded for ACH/bank). loadCheckoutSuccessSession must mirror the paid gate so /checkout/success does not confirm UI while unpaid.",
    rationale:
      "Empty-backlog after PR #333/#334 (currency usd + create-path Price ID line-item parity). Free NEXT_STEPS stayed operator/legal-gated. Fresh residual: amount/currency/Price ID gates were shipped, but checkout.session.completed still fulfilled whenever those matched — async methods complete the Session with payment_status unpaid while amount_total still equals catalog cents, creating false sold capability (handoff emails, commerce orders, success-page Payment received) before funds clear. Process improvement: after amount/currency/Price ID catalog parity, immediately audit payment_status before inventing another dated clean-audit; close the success SSR twin in the same pass. Next empty-backlog: stuck CLI fold / escapeHtml·webhook·uncapped / next sold residual. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-17",
    decision:
      "createBillingPortalForCheckoutSession (public POST /api/stripe/billing-portal) must require session.payment_status === \"paid\" (isStripeCheckoutSessionPaid) after status===complete — same gate as webhook fulfillment and loadCheckoutSuccessSession. Complete+unpaid async ACH must 400 before eligibility / listLineItems / portal create so a client-supplied session_id cannot open Manage billing before funds clear.",
    rationale:
      "Empty-backlog after PR #335 (webhook-checkout-payment-status-paid-gate). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were invent-optional-aggregate / clean-audit-only / already-merged — rejected. Fresh residual: webhook + success SSR already required paid, but the public billing-portal Session twin still opened on status===complete alone — hiding the CTA on /checkout/success is not enough when the API accepts a pasted session_id. Process improvement: after webhook + success SSR share a Session gate, immediately close the public billing-portal Session twin before inventing another dated clean-audit; same-window dual claim with cc45 folded onto 9f34 / #336. Next empty-backlog: stuck CLI fold / escapeHtml·webhook·uncapped / next sold residual — and keep ITERATIONS[].decisions ownership unique via object-parse (e23f3b8 cascade). Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-17",
    decision:
      "checkout.session.async_payment_failed must reopen the local checkout_sessions row via markCheckoutSessionOpen (Convex markOpen + SQLite, requireConvex) so Finish-checkout / Buy now recovery can nudge a retry after a failed async ACH/bank payment. Do not fulfill; reopen write failures return 5xx (checkout_session_mark_open).",
    rationale:
      "Empty-backlog after PR #337 (portal payment_status paid + BD ownership polish). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were invent-optional-aggregate / clean-audit-only / already-merged — rejected. Fresh residual after unpaid completed→markComplete: async_payment_failed was unhandled, so failed ACH left status=complete forever and permanently dropped retry revenue. Process improvement: after unpaid-completed→markComplete, immediately close the async_failed reopen twin; next empty-backlog prefers stuck CLI fold / subscription-mode catalog recurring Price portal gate / escapeHtml·webhook·uncapped. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-17",
    decision:
      "createBillingPortalForCheckoutSession + loadCheckoutSuccessSession must require a create-path catalog recurring Price ID (Growth/Complete/Commerce monthly via catalogRecurringPriceIdsFromEnv + sessionLineItemsIncludeCatalogRecurringPrice) on listLineItems when mode===subscription before checkoutSessionEligibleForBillingPortal(catalogRecurringProven) / showBillingPortal — mode===subscription alone is not enough. Portal list failures return 502; success SSR list failures fail closed to hide the CTA. Payment-mode commerceAddon derive is unchanged.",
    rationale:
      "Empty-backlog after PR #338 (async_payment_failed reopen). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were invent-optional-aggregate / clean-audit-only / already-merged — rejected. Same-minute dual claim on async_payment_failed reopen folded onto fd10 / #338 (keep both NEXT_STEPS). Fresh residual: payment-mode portal/success already required Commerce line-item Prices, but subscription mode still trusted mode alone — a Dashboard-minted subscription with a foreign recurring Price could open Manage billing / show the CTA. Process improvement: after payment-mode commerceAddon line-item parity, immediately close the subscription-mode catalog-recurring twin on both portal API + success SSR. Next empty-backlog: stuck CLI fold / escapeHtml·webhook·uncapped / next sold residual. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-17",
    decision:
      "createBillingPortalForLead (operator Manage billing) must require stripeSessionId and reuse createBillingPortalForCheckoutSession (payment_status paid + catalog recurring / Commerce Prices on listLineItems; Session customer preferred) — CRM orderEligibleForBillingPortal (tier/commerceAddon) + stored stripeCustomerId alone must not mint a Billing Portal session.",
    rationale:
      "Empty-backlog after PR #339 (subscription-mode catalog recurring on Session portal + success SSR). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes (redirect-url / custom-domain / mark-live / handoff-marker / optimistic-state) already on main — rejected. Fresh residual: #339 closed the public Session path, but operator Manage billing still trusted CRM cache fields without re-proving Stripe entitlement — a stale/forged CRM row could open portal while the Session path would 400. Process improvement: after Session catalog-recurring ships, immediately close the lead Manage-billing twin before inventing another dated clean-audit. Next empty-backlog: stuck CLI fold / escapeHtml·webhook·uncapped / next sold residual. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-17",
    decision:
      "After a paid bundle Checkout Session is marked complete, markCompleteOpenBundleCheckoutSessionsForLead (Convex markCompleteOpenBundleForLead + SQLite, requireConvex) must also close other open bundle checkout_sessions for that leadSlug so Finish-checkout / digest / pipeline-health cannot nudge an already-paid customer. Never close commerce_sku siblings. Orphan cleanup write failures return 5xx (checkout_session_orphan_bundle_cleanup). Starter→Growth upsell after pay mints a new Session — do not blanket-skip stage===paid on recovery.",
    rationale:
      "Empty-backlog after PR #339/#340 (subscription catalog recurring + lead Manage-billing Session re-proof). Sibling prompt-process-evolution-bd71 shipped #340 same window — complementary pivot; fold both ITERATIONS. Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were invent-optional-aggregate / clean-audit-only / already-merged — rejected. Fresh residual: markComplete only flipped the paid stripeSessionId, leaving earlier abandoned open bundle carts live in recovery queues. Process improvement: after paid Session markComplete, immediately close orphan open bundle siblings for the lead; next empty-backlog prefers stuck CLI fold / escapeHtml·webhook·uncapped / next sold residual. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-17",
    decision:
      "markCompleteOpenBundleCheckoutSessionsForLead must run only after durable recordLeadPayment (+ handoff enqueue) succeeds on the paid bundle webhook path — never immediately after parseLeadSlugLookup or Session markComplete. A paid Session that later skips fulfillment (unknown tier, wrong catalog Prices, non-USD, amount≠catalog) must leave sibling open bundle carts in Finish-checkout / digest recovery.",
    rationale:
      "Empty-backlog after PR #341 (bundle-paid-orphan-open-checkout-session-cleanup). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were invent-optional-aggregate / clean-audit-only / already-merged — rejected. Fresh residual twin: #341 closed orphan carts, but the webhook called cleanup as soon as the slug parsed — before catalog Price / currency / amount gates and before recordLeadPayment. A Dashboard-minted or mismatched paid Session could ACK 200 after closing recovery carts without ever writing payment/handoff. Process improvement: after shipping orphan-open cleanup, immediately gate it behind durable fulfillment (same pass as amount/tier skip regressions). Next empty-backlog: stuck CLI fold / escapeHtml·webhook·uncapped / next sold residual. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-17",
    decision:
      "After a paid commerce_sku Checkout Session durable insertCommerceOrder, markCompleteOpenCommerceCheckoutSessionsForLeadSkuCustomer (Convex markCompleteOpenCommerceForLeadSkuCustomer + SQLite, requireConvex) must close other open commerce_sku checkout_sessions for the same leadSlug+skuId+normalized customerEmail so Buy now recovery / digest / pipeline-health cannot nudge the same shopper after pay. Skip when customerEmail is missing — never close by leadSlug+skuId alone (multi-shopper). Run only after ledger write succeeds. Orphan cleanup write failures return 5xx (checkout_session_orphan_commerce_cleanup).",
    rationale:
      "Empty-backlog after PR #341/#342 (bundle orphan open-cart cleanup + after-fulfillment gate). Sibling business-process-evolution-0c15 shipped #342 same window — complementary pivot; fold both ITERATIONS. Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes already-merged — rejected. Fresh residual: commerce_sku only markComplete'd the paid stripeSessionId, leaving earlier abandoned Buy now carts live. Process improvement: after bundle orphan-open cleanup (+ after-fulfillment gate), immediately audit the commerce twin with the same after-ledger ordering. Next empty-backlog: stuck CLI / escapeHtml·webhook·uncapped / customer.subscription.deleted CRM sync. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  ];
