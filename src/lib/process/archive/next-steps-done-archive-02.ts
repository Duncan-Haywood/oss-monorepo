/**
 * Archived NextStep entries — see src/lib/process/prompt_process.tsx for
 * why this exists (process-log-archive-scalability-split in
 * BUSINESS_DECISIONS) and for the live, editable tail. Part 2 of 2 of the pre-2026-07-21-archive done backlog.
 *
 * Append-only, like the live arrays it was split from — never edit an entry
 * here, and never append new entries directly to an archive file. New
 * entries always go in the live array in prompt_process.tsx (or
 * business-decisions.ts for BUSINESS_DECISIONS); a future maintenance pass
 * moves the oldest live entries into a new archive file (or a new numbered
 * file in this directory) once the live file grows large again.
 */
import type { NextStep } from "../types";

export const NEXT_STEPS_DONE_ARCHIVE_02: NextStep[] = [
  {
    id: "create-path-slug-dns-label-max-length",
    summary:
      "Empty-backlog after PR #277 (login-rate-limit) + PR #247 (create-path-slug-edge-dash-normalize): sanitizeLeadSlug strips edge dashes but does not cap length, so a long businessName / operator slug / CSV collision suffix can mint a CRM slug >63 chars. Hostnames cannot percent-encode — RFC 1035 DNS labels max at 63 — so suggestedHost becomes an invalid label and Starter preview-subdomain Host→preview cannot resolve. Cap sanitizeLeadSlug + leadSlugAsDnsLabel + CSV collision suffixes at MAX_LEAD_SLUG_LENGTH=63 (truncate then re-strip edge dashes). Stuck feature body: grok/continuous-work-slug-dns-label-max + grok/dev-work-slug-dns-label-max + grok/dev-work-slug-dns-max-86cdf4 + opencode/continuous-work-slug-dns-max-103090 (+ digest-combo remotes whose digest half already merged as #276). Sibling prompt-process-evolution-1ce7 claimed/merged digest-age-mirror-oldest-abandoned-cold (PR #278) in the same window — complementary axis.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner:
      "cursor/business-process-evolution-9b1b (folded from grok/continuous-work-slug-dns-label-max + grok/dev-work-slug-dns-label-max + grok/dev-work-slug-dns-max-86cdf4 + opencode/continuous-work-slug-dns-max-103090)",
  },
  {
    id: "contact-form-notify-field-length-caps",
    summary:
      "Empty-backlog after PR #279 (create-path-slug-dns-label-max-length) + PR #278 (digest age mirrors). Sibling business-process-evolution-f844 claimed operator-password-trim (whitespace trim on OPERATOR_DASHBOARD_PASSWORD / tryCreateSessionFromPassword) — pivot (later merged as PR #280). Sold-capability audit of Starter contact CRM found insertClientInquiry silently slices message to 5000 chars while POST /api/contact/[slug] builds the skipSuppression notify from the uncapped request body (name/email/phone/message/source). A public rate-limited form can force multi-MB escaped HTML into Resend toward lead.email/support while the inbox row only stores 5k — CRM and sold notify diverge; abuse burns Resend quota on a paid path. Soft-cap once via shared normalizeContactFormFields and reuse the same strings for persist + notify; export MAX_CONTACT_* constants; cap name/email/phone/source too (db previously only sliced message).",
    status: "done",
    phase: "Phase 5 — Production deploy",
    owner: "cursor/prompt-process-evolution-38a8",
  },
  {
    id: "operator-password-trim",
    summary:
      "Security audit: loginOperatorAction does not trim the submitted password, and getPassword() returns the raw env var untrimmed. A trailing space in OPERATOR_DASHBOARD_PASSWORD or the login form silently locks the operator out — whitespace-only env values also falsely report auth as configured (isOperatorAuthConfigured returns true for spaces) while login is impossible. Trim both the env var (in getPassword) and the form password (in tryCreateSessionFromPassword) so accidental whitespace never blocks access, and whitespace-only env values are treated as unset. Stuck feature body: opencode/dev-work-password-trim + opencode/continuous-work-152029 (Actions token blocked; no open PR).",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner:
      "cursor/business-process-evolution-f844 (folded from opencode/dev-work-password-trim + opencode/continuous-work-152029)",
  },
  {
    id: "operator-auth-proxy-password-trim",
    summary:
      "Empty-backlog after PR #280 (operator-password-trim) + PR #281 (contact-form-notify-field-length-caps). Banner/path twin drift residual: getPassword / tryCreateSessionFromPassword / requireOperatorAuth trim OPERATOR_DASHBOARD_PASSWORD, but src/proxy.ts dashboardAuthGate still passes the raw process.env value into verifyOperatorSessionToken. Login signs the session with the trimmed secret; the proxy then verifies with the untrimmed env string — a trailing space in the deployment secret (common secret-manager paste) accepts login at the action layer then infinite-redirects /dashboard/* → /dashboard/login at the Host gate. Export getPassword and verify sessions through the same trimmed secret the cookie was signed with. Same-window dual with proxy-operator-session-getpassword-parity (037c); earlier claim f926 owns implementation.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "cursor/business-process-evolution-f926 (+ dual cursor/prompt-process-evolution-037c)",
  },
  {
    id: "proxy-operator-session-getpassword-parity",
    summary:
      "Auth-cookie audit after PR #280 (operator-password-trim): login / requireOperatorAuth sign and verify with trimmed getPassword(), but src/proxy.ts dashboardAuthGate still passes raw process.env.OPERATOR_DASHBOARD_PASSWORD into verifyOperatorSessionToken. Surrounding whitespace in the env secret (the exact case #280 fixed for login) makes a freshly issued session cookie verify on server actions and fail in the proxy gate — infinite redirect to /dashboard/login and a locked-out operator. Export getPassword and use it as the sole verify key in the proxy gate; add a regression that sets a padded env and asserts a tryCreateSessionFromPassword cookie is accepted. Same-window dual with operator-auth-proxy-password-trim (f926 claimed 8s earlier) — folded onto f926; keep both ITERATIONS, one implementation.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "cursor/prompt-process-evolution-037c (folded onto cursor/business-process-evolution-f926)",
  },
  {
    id: "csv-import-remaining-field-length-caps",
    summary:
      "Empty-backlog after PR #284 (proxy getPassword parity). CSV import (PR #230) already hard-rejects over-long businessName and soft-caps description + services count, but city/state/address/phone/email/tagline, each service token, and hours weekday/weekend still accept unbounded strings that land in CRM → public preview / JSON-LD / outreach. Soft-cap remaining columns (align phone/email with MAX_CONTACT_*), keep visitor/operator UX (no row skip on long optional fields), and add Vitest. Live lead-volume unlock while Places stays counsel-gated.",
    status: "done",
    phase: "Phase 4 — Data ingestion",
    owner: "cursor/prompt-process-evolution-037c",
  },
  {
    id: "add-lead-action-field-length-caps",
    summary:
      "Empty-backlog after PR #283 (csv-import-remaining-field-length-caps). Manual addLeadAction still accepts uncapped businessName/city/state/address/phone/email/tagline/description/services/hours while CSV soft-caps the same fields — operator (or compromised session) can push multi-KB strings into public preview / JSON-LD / outreach via the dashboard form. Soft-cap/hard-reject via shared normalizeLeadCreateFields (same MAX_* as CSV + MAX_CONTACT phone/email); Vitest on helper + action.",
    status: "done",
    phase: "Phase 4 — Data ingestion",
    owner: "cursor/prompt-process-evolution-b378",
  },
  {
    id: "contact-form-require-known-lead",
    summary:
      "Empty-backlog after PR #285 (add-lead-action-field-length-caps). POST /api/contact/[slug] still persists + skipSuppression-notifies when getLeadBySlug returns null — any syntactically valid slug becomes an orphan inquiry (businessName=slug) emailed to brand.supportEmail. Preview-open already soft-rejects unknown_lead; contact must require a CRM row or curated DEMO_LEADS showcase before persist/notify (404 otherwise). Rate limits blunt volume, not inventable-slug support spam.",
    status: "done",
    phase: "Phase 5 — Production deploy",
    owner: "cursor/business-process-evolution-f515",
  },
  {
    id: "marketing-generate-content-types-size-cap",
    summary:
      "Empty-backlog after PR #286 (contact-form-require-known-lead). AGENT_PROTOCOL empty-backlog rotation named marketing/generate contentTypes size next. POST /api/marketing/generate validates contentTypes membership but not array length — a rate-limited (20/min) open-demo or compromised-session caller can POST thousands of valid-type duplicates and burn Anthropic quota / OOM the stub map (generators map 1:1 over contentTypes). Cap contentTypes at MONTHLY_MARKETING_PACK_TYPES.length (sold pack ceiling), hard-reject oversize leadId, and soft-cap business.services + string fields (align create-fields MAX_*) before generate.",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "cursor/business-process-evolution-d018",
  },
  {
    id: "checkout-customer-email-field-length-cap",
    summary:
      "Empty-backlog after PR #286 (contact-form-require-known-lead). Sibling business-process-evolution-d018 claimed marketing-generate-content-types-size-cap (contentTypes + business payload) — pivot. Public Stripe money routes POST /api/stripe/checkout and POST /api/commerce/checkout still pass uncapped body.customerEmail into stripe.checkout.sessions.create and recordCheckoutSessionCreated — a rate-limited public caller can force multi-KB strings into Stripe + checkout_sessions (abandoned-recovery + dashboard). Soft-cap once via shared normalizeCheckoutCustomerEmail (MAX_CONTACT_EMAIL_LENGTH) before Stripe + persist on both twins.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/prompt-process-evolution-827f",
  },
  {
    id: "billing-portal-sessionId-field-length-cap",
    summary:
      "Empty-backlog after PR #288 (checkout-customer-email-field-length-cap) + PR #287 (marketing-generate size). AGENT_PROTOCOL empty-backlog rotation named billing-portal sessionId length next. POST /api/stripe/billing-portal trims sessionId but does not bound length — a rate-limited public caller can POST multi-KB garbage into stripe.checkout.sessions.retrieve (and the default return_url query). Hard-reject over MAX_STRIPE_CHECKOUT_SESSION_ID_LENGTH before Stripe; soft-cap is wrong for opaque ids (truncation wastes a Stripe call on a guaranteed miss).",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/prompt-process-evolution-a938",
  },
  {
    id: "unsubscribe-email-field-length-cap",
    summary:
      "Empty-backlog after PR #288 (checkout-customer-email-field-length-cap). Sibling prompt-process-evolution-a938 claimed billing-portal-sessionId-field-length-cap — pivot. GET /api/unsubscribe still accepts an uncapped email query param before HMAC verify + suppressEmail — a rate-limited public caller can force multi-KB strings through crypto and into the suppressions table (CAN-SPAM global gate). Hard-reject over MAX_CONTACT_EMAIL_LENGTH before verify (soft-cap would break signed footer tokens).",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "cursor/business-process-evolution-8fb7",
  },
  {
    id: "commerce-checkout-slug-skuId-field-length-cap",
    summary:
      "Empty-backlog after PR #290 (unsubscribe-email-field-length-cap) + PR #289 (billing-portal sessionId). Free NEXT_STEPS stayed operator/legal-gated. Public POST /api/commerce/checkout soft-caps customerEmail but still accepts uncapped body.slug + body.skuId before getCommerceCatalog / Stripe metadata / checkout_sessions / cancel_url — bundle checkout already sanitizes+caps slug via sanitizeLeadSlug; commerce Buy now does not. Hard-reject slug over MAX_LEAD_SLUG_LENGTH and skuId over catalog save ceiling (64) before any DB/Stripe work (opaque lookup keys — never soft-cap).",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "cursor/prompt-process-evolution-92f3",
  },
  {
    id: "contact-form-slug-path-length-cap",
    summary:
      "Empty-backlog after PR #290. Sibling prompt-process-evolution-92f3 claimed commerce-checkout-slug-skuId-field-length-cap — pivot. POST /api/contact/[slug] validates charset ([a-z0-9-]+) but not length; preview-open already hard-rejects slug.length > 120. A multi-KB valid-charset path param still reaches getLeadBySlug and is echoed on 404/success JSON. Hard-reject over MAX_PUBLIC_LEAD_SLUG_PATH_LENGTH (shared with preview-open) before CRM/demo lookup.",
    status: "done",
    phase: "Phase 5 — Production deploy",
    owner: "cursor/business-process-evolution-58d9",
  },
  {
    id: "billing-portal-returnUrl-field-length-cap",
    summary:
      "Empty-backlog after PR #291/#292 (commerce slug/skuId + contact path length). Free NEXT_STEPS stayed operator/legal-gated. AGENT_PROTOCOL residual public body sizes named billing-portal returnUrl length next. POST /api/stripe/billing-portal already same-origin-guards returnUrl but does not bound length — a rate-limited public caller can POST a multi-KB same-origin URL into stripe.billingPortal.sessions.create. Treat over-MAX like cross-origin/malformed (fall back to derived default) before Stripe; hard-reject would strand legitimate portal opens over an optional field.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/prompt-process-evolution-98c1",
  },
  {
    id: "unsubscribe-token-field-length-cap",
    summary:
      "Empty-backlog after PR #292 (contact path-length) + PR #291 (commerce slug/skuId). Sibling prompt-process-evolution-98c1 claimed billing-portal-returnUrl-field-length-cap — pivot. GET /api/unsubscribe hard-rejects over-long email but still accepts uncapped token query params before HMAC verify — a rate-limited public caller can force multi-KB Buffer.from work. Hard-reject over MAX_UNSUBSCRIBE_TOKEN_LENGTH before verify (HMAC-SHA256 base64url is 43 chars; soft-cap/truncate would break every genuine footer link).",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "cursor/business-process-evolution-42a4",
  },
  {
    id: "checkout-success-sessionId-field-length-cap",
    summary:
      "Empty-backlog after PR #293 (billing-portal returnUrl + unsubscribe token). Free NEXT_STEPS stayed operator/legal-gated. Public-write residual twin of billing-portal-sessionId-field-length-cap: GET /checkout/success?session_id= still passes uncapped query session_id into stripe.checkout.sessions.retrieve before confirming payment. Hard-reject via shared parseCheckoutSessionId (MAX=255) before any Stripe call — same opaque-id class as POST /api/stripe/billing-portal.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/business-process-evolution-191d",
  },
  {
    id: "login-password-field-length-cap",
    summary:
      "Empty-backlog after PR #293 (billing-portal returnUrl + unsubscribe token). Free NEXT_STEPS stayed operator/legal-gated. Sibling business-process-evolution-191d claimed checkout-success-sessionId-field-length-cap (SSR twin of billing-portal sessionId hard-reject) — pivot. loginOperatorAction still passes uncapped form password into tryCreateSessionFromPassword → passwordsMatch → Buffer.from before the length-mismatch short-circuit; a rate-limited public caller (5/60s) can still force multi-MB allocations per attempt. Hard-reject / early-return null over MAX_OPERATOR_PASSWORD_LENGTH before Buffer.from (soft-cap would change the secret).",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "cursor/prompt-process-evolution-0eec",
  },
  {
    id: "login-next-path-field-length-cap",
    summary:
      "Empty-backlog after PR #295 (login password + checkout-success sessionId). Free NEXT_STEPS stayed operator/legal-gated. AGENT_PROTOCOL residual public body sizes named login next= path length via safeNextPath. safeNextPath already rejects open redirects / non-dashboard / login self-loops but does not bound length — a rate-limited public caller can POST a multi-KB same-app path into loginOperatorAction redirects and the login page hidden field / already-authenticated redirect. Treat over-MAX like unsafe (fall back to /dashboard); soft-cap would change the destination; hard-reject 400 would strand login.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "cursor/prompt-process-evolution-d6b1",
  },
  {
    id: "preview-page-slug-path-length-cap",
    summary:
      "Empty-backlog after PR #296 (login-next-path). Free NEXT_STEPS stayed operator/legal-gated. Public-write residual twin of contact-form-slug-path-length-cap / preview-open: GET /preview/[slug] still feeds uncapped params.slug into getLeadBySlug + resolvePreviewLead (+ listOrders / commerce catalog) while contact API and preview-open already hard-reject over MAX_PUBLIC_LEAD_SLUG_PATH_LENGTH=120. Soft-cap would change the lookup key; fail closed with notFound() before CRM/demo work.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "cursor/business-process-evolution-f0c6",
  },
  {
    id: "checkout-slug-prefill-field-length-cap",
    summary:
      "Empty-backlog after PR #298 (preview-page-slug-path-length-cap). Free NEXT_STEPS stayed operator/legal-gated. AGENT_PROTOCOL residual public page GET twin: optional /checkout?slug= still feeds uncapped searchParams.slug into getLeadBySlug and CheckoutPrefill (cancelled-banner leadPreviewPath, form slug→bundle checkout). Soft-cap would change the lookup key; hard-reject 400 would strand checkout — treat over-MAX like missing (fall back to un-prefilling checkout) via shared isPublicLeadSlugPathLengthOk.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "cursor/business-process-evolution-24ff",
  },
  {
    id: "proxy-host-lookup-field-length-cap",
    summary:
      "Empty-backlog after PR #299 (checkout-slug-prefill). Free NEXT_STEPS stayed operator/legal-gated. Sibling 24ff closed optional /checkout?slug=; residual Host→preview twin: src/proxy.ts still feeds uncapped extractPreviewSubdomainSlug labels into getLeadBySlug and uncapped custom-domain Hosts into getLeadSlugByCustomDomain while path/query slug sinks already gate MAX_PUBLIC_LEAD_SLUG_PATH_LENGTH / isPlausibleCustomDomainHost. Soft-cap would change the lookup key; treat over-long like unrecognized (fall through to marketing homepage) before CRM/Convex work.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "cursor/prompt-process-evolution-e309",
  },
  {
    id: "proxy-login-redirect-next-bound",
    summary:
      "Empty-backlog after PR #300 (proxy-host-lookup). Free NEXT_STEPS stayed operator/legal-gated. Residual twin of login-next-path-field-length-cap: src/proxy.ts dashboardAuthGate still sets login?next= to the raw request pathname (and clones the full nextUrl search) before safeNextPath runs on the login page — a multi-KB /dashboard/... probe mints an over-long Location header even though the login page would later fall back. Bound via safeNextPath before redirect; drop inherited query params on the login URL.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "cursor/prompt-process-evolution-e309",
  },
  {
    id: "preview-open-openedAt-field-length-cap",
    summary:
      "Empty-backlog after proxy-login-redirect-next-bound. Free NEXT_STEPS stayed operator/legal-gated. Scanned stuck CLI remotes (clean-audit-only / already-merged). Public-write residual: POST /api/preview/[slug]/open path slug is length-gated but optional body.openedAt still feeds uncapped strings into Date.parse before persist — a rate-limited public caller can force multi-KB parse work per beacon. Treat over-MAX like missing (fall back to server now); soft-cap would change the timestamp; hard-reject 400 would strand a fire-and-forget beacon over an optional field.",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "cursor/business-process-evolution-67b2",
  },
  {
    id: "operator-session-token-field-length-cap",
    summary:
      "Empty-backlog after proxy-login-redirect-next-bound on main. Free NEXT_STEPS stayed operator/legal-gated. Auth cookie attributes/TTL already clean; residual opaque-token size hole: verifyOperatorSessionToken still runs HMAC + Buffer.from on uncapped Cookie values, and src/proxy.ts dashboardAuthGate calls it on every /dashboard/* with no rate limit (unlike login 5/60s). Hard-reject over MAX_OPERATOR_SESSION_TOKEN_LENGTH before crypto (genuine tokens ~66 chars; soft-cap would change the opaque token).",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "cursor/prompt-process-evolution-2662",
  },
  {
    id: "assign-vercel-project-id-field-length-cap",
    summary:
      "Empty-backlog after PR #303 (operator-session-token + preview-open openedAt). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI opencode/dev-work-auth-gated-field-caps has a complete feature body (parseVercelProjectId + assignVercelProjectAction bound) with no open PR — fold per AGENT_PROTOCOL before inventing a clean-audit. Auth-gated Assign project still trims vercelProjectId but never length-bounds it before assignVercelProjectAndProvision / Domains API.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "cursor/business-process-evolution-1ba2 (fold opencode/dev-work-auth-gated-field-caps)",
  },
  {
    id: "commerce-orders-convex-createdAt-ordering-parity",
    summary:
      "Empty-backlog after PR #302/#303 (preview-open openedAt + operator-session-token). Free NEXT_STEPS stayed operator/legal-gated. Sibling business-process-evolution-1ba2 claimed assign-vercel-project-id-field-length-cap — pivoted per AGENT_PROTOCOL. Convex parity residual after convex-query-ordering-parity (leads/checkoutSessions/inquiries): commerceOrders.list + listUnpaid still .order(\"desc\") on _creationTime while SQLite ORDER BY createdAt DESC — payout panel / digest row order can diverge when app createdAt ≠ insert clock. Sort by app createdAt ISO descending (collect + sort + slice for list limit) to match SQLite.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "cursor/prompt-process-evolution-0c78",
  },
  {
    id: "auth-gated-stripe-sessionId-field-length-cap",
    summary:
      "Empty-backlog after PR #305 (commerceOrders createdAt ordering). Free NEXT_STEPS stayed operator/legal-gated. AGENT_PROTOCOL named auth-gated Mark-paid-out / recovery stripeSessionId length next. markCommerceOrderPaidOutAction + sendCheckoutRecoveryAction + sendCommerceCheckoutRecoveryAction still accept uncapped stripeSessionId before Convex/SQLite lookup — requireOperatorAuth is not a payload-size throttle (same class as assign-vercel-project-id). Hard-reject via shared parseCheckoutSessionId (MAX=255) before any DB/email work.",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "cursor/business-process-evolution-28bd",
  },
  {
    id: "auth-gated-lead-slug-field-length-cap",
    summary:
      "Empty-backlog after PR #306/#307 (auth-gated stripeSessionId + inquiryId). Free NEXT_STEPS stayed operator/legal-gated. AGENT_PROTOCOL named remaining auth-gated opaque ids next — dashboard actions look up handoffs/packs/orders by lead slug (not handoffId/packId/orderId). 18 slug-taking dashboard actions still accept uncapped slug before Convex/SQLite / Stripe / Resend — requireOperatorAuth is not a payload-size throttle. Hard-reject via parseLeadSlugLookup (MAX_LEAD_SLUG_LENGTH=63) before any DB/email/Stripe work (opaque CRM lookup keys — never soft-cap).",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "cursor/business-process-evolution-f30c",
  },
  {
    id: "auth-gated-inquiryId-field-length-cap",
    summary:
      "Empty-backlog after PR #305. Free NEXT_STEPS stayed operator/legal-gated. Sibling business-process-evolution-28bd claimed auth-gated-stripe-sessionId-field-length-cap — pivoted per AGENT_PROTOCOL. Memory named inquiryId length on reply/status as the complementary free residual. replyToInquiryAction + updateInquiryStatusAction still accept uncapped inquiryId before Convex/SQLite lookup / Resend — requireOperatorAuth is not a payload-size throttle. Hard-reject via parseInquiryId (MAX=128) before any DB/email work (opaque app-owned inq_* keys — never soft-cap).",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "cursor/prompt-process-evolution-c954",
  },
  {
    id: "csv-import-text-length-cap",
    summary:
      "Empty-backlog after PR #306/#307. Free NEXT_STEPS stayed operator/legal-gated. Sibling business-process-evolution-f30c claimed auth-gated-lead-slug-field-length-cap (handoffId/packId/orderId are slug-keyed, not client-submitted) — pivoted per AGENT_PROTOCOL. CSV column/create-path field caps are shipped, but importLeadsCsvAction still feeds uncapped csvText into parseLeadsCsv (splitCsvIntoLines + per-row work) before MAX_ROWS — requireOperatorAuth is not a payload-size throttle. Hard-reject over MAX_CSV_IMPORT_TEXT_LENGTH before parse (soft-cap would truncate mid-row and mint corrupt leads).",
    status: "done",
    phase: "Phase 4 — Data ingestion",
    owner: "cursor/prompt-process-evolution-c8f9",
  },
  {
    id: "csv-import-dataSource-field-length-cap",
    summary:
      "Empty-backlog after PR #308/#309 (auth-gated lead-slug + CSV body size). Free NEXT_STEPS stayed operator/legal-gated. Scanned stuck CLI remotes (clean-audit-only / already-merged / password-trim already on main). AGENT_PROTOCOL residual auth-gated free-text: importLeadsCsvAction + addLeadAction still persist uncapped dataSource tags after per-cell + csvText caps — requireOperatorAuth is not a payload-size throttle. Soft-cap via shared normalizeLeadDataSource (MAX=64) before upsert (compliance tag, not an opaque lookup key — hard-reject would strand legitimate custom batch labels).",
    status: "done",
    phase: "Phase 4 — Data ingestion",
    owner: "cursor/prompt-process-evolution-8cf6",
  },
  {
    id: "use-server-export-type-cleanup",
    summary:
      "Empty-backlog after PR #310 (csv-import-dataSource-field-length-cap). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI opencode/dev-work-use-server-export-cleanup has a complete type-only hygiene body (drop inline `export type` aliases from \"use server\" files) with no open PR — fold per AGENT_PROTOCOL before inventing a clean-audit. src/app/dashboard/actions.ts + leads/actions.ts still export BootstrapStripePricesActionResult / ImportLeadsCsvResult as `export type` (local return annotations only).",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "cursor/business-process-evolution-5d8e",
  },
  {
    id: "preview-page-uncapped-listOrders",
    summary:
      "Empty-backlog after PR #311 (use-server-export-type-cleanup). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were clean-audit-only / already-merged / invent-optional-aggregate (workNextCount). Public /preview/[slug] still calls listOrders() (full ledger) for every cold outreach preview before leadEligibleForCommerceCatalog short-circuits on stage — schema already has orders.by_leadSlug. Gate on leadStageEligibleForCommerceCatalog, add listOrdersByLeadSlug (Convex index + SQLite WHERE), register on the static API map.",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "cursor/business-process-evolution-7e91",
  },
  {
    id: "marketing-voice-pack-variant-field-length-cap",
    summary:
      "Empty-backlog after PR #311 (use-server-export-type-cleanup). Free NEXT_STEPS stayed operator/legal-gated. Dated clean-audit of Convex API map + marker-after-unchecked-await + public marketing OUTPUT indexing came back clean. Residual free-text after operator INPUT caps: marketing + client-voice parseVariantsJson still persist uncapped LLM title/body/cta (hashtags only slice count, not string length) into packs emailed under skipSuppression — soft-cap at parse before upsert/email.",
    status: "done",
    phase: "Phase 6 — Marketing automation",
    owner: "cursor/prompt-process-evolution-e626",
  },
  {
    id: "marketing-voice-pack-stub-variant-field-length-cap",
    summary:
      "Empty-backlog after PR #312/#313 (LLM pack soft-caps + preview listOrders). Free NEXT_STEPS stayed operator/legal-gated. PR #312 soft-capped Anthropic parseVariantsJson only — StubMarketingGenerator / StubClientVoiceGenerator (default without ANTHROPIC_API_KEY + Anthropic fallback) still persist uncapped title/body/cta/hashtags. Worst case: voice services.join at MAX_SERVICES×MAX_SERVICE_ITEM_LENGTH exceeds MAX_PACK_VARIANT_BODY_LENGTH. Soft-cap stubVariant via the same variant-fields helpers.",
    status: "done",
    phase: "Phase 6 — Marketing automation",
    owner: "cursor/prompt-process-evolution-a070",
  },
  {
    id: "commerce-barrel-preview-commerce-server-only",
    summary:
      "Found while verifying stub soft-caps build: PR #313 re-exported loadPreviewCommerceItems from @/lib/commerce barrel; leads-client.tsx (use client) imports that barrel, so Turbopack pulled server-only db into the client graph and broke next build even with a dynamic import inside preview-commerce. Drop barrel re-export; keep Server Component import from @/lib/commerce/preview-commerce.",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "cursor/prompt-process-evolution-a070",
  },
  {
    id: "slug-scoped-listOrders-followthrough",
    summary:
      "Empty-backlog after PR #313 (preview-page-uncapped-listOrders). Free NEXT_STEPS stayed operator/legal-gated. listOrdersByLeadSlug shipped for /preview but createBillingPortalForLead + per-lead dashboard eligibility actions (upsell / marketing pack / commerce catalog / client voice) still full-ledger listOrders() then filter by slug. Wire listOrdersByLeadSlug on those sold/operator slug-keyed paths; keep full listOrders() for digest + dashboard ledger aggregates.",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "cursor/business-process-evolution-338b",
  },
  {
    id: "marketing-voice-pack-deliver-variant-field-length-cap",
    summary:
      "Empty-backlog after PR #314/#315 (stub pack soft-caps + slug-scoped listOrders followthrough). Free NEXT_STEPS stayed operator/legal-gated. PR #312/#314 soft-capped generate paths (Anthropic parse + stub) before upsert, but Email pack / Email voice pack still format + skipSuppression-send whatever is already stored — pre-cap rows and Convex-primary reads bypass sqlite parsers. Soft-cap variant fields at deliver HTML + pack read/parse so sold client email cannot emit uncapped LLM OUTPUT.",
    status: "done",
    phase: "Phase 6 — Marketing automation",
    owner: "cursor/prompt-process-evolution-a3a8",
  },
  {
    id: "preview-jsonld-indexable-only",
    summary:
      "Empty-backlog after PR #315 (slug-scoped-listOrders-followthrough). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were clean-audit-only / invent-optional-aggregate (workNextCount) / dead Convex orders.createOrder map orphans — rejected. Public marketing OUTPUT residual: /preview/[slug] always embeds LocalBusiness JSON-LD even when generateMetadata emits robots noindex and sitemap excludes the slug — crawlers that parse structured data still see cold-prospected business fields. Gate JSON-LD on the same isLeadPreviewIndexable predicate as sitemap + robots.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "cursor/business-process-evolution-18d9",
  },
  {
    id: "commerce-catalog-skuId-field-length-cap",
    summary:
      "Empty-backlog after PR #316/#317 (JSON-LD indexable + pack deliver/read soft-caps). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were clean-audit-only / already-merged (preview-index, convex order parity, snooze, optimistic-state). Public Buy now hard-rejects skuId over 64, but auth-gated normalizeCommerceItems still trim+slice(0,64) — truncating distinct operator-supplied SKU ids can collide preserveCommerceStripeIds / Sync-to-Stripe Product keys. Hard-reject over MAX_COMMERCE_SKU_ID_LENGTH (never truncate opaque ids).",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "cursor/prompt-process-evolution-a3a8",
  },
  {
    id: "preview-open-src-utm-field-length-cap",
    summary:
      "Empty-backlog after PR #a3a8 (commerce-catalog-skuId-field-length-cap). Free NEXT_STEPS stayed operator/legal-gated. Public-write residual twin of preview-open-openedAt-field-length-cap: POST /api/preview/[slug]/open already bounds path slug + body.openedAt, but src / utm_source query params still feed uncapped strings into shouldRecordPreviewOpen. Cap ~32 chars and treat over-long as missing (fall-back class — soft-cap would invent attribution; hard-reject 400 would strand a fire-and-forget beacon).",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "cursor/business-process-evolution-ba14",
  },
  {
    id: "preview-page-src-utm-field-length-cap",
    summary:
      "Empty-backlog after PR #318 (preview-open-src-utm-field-length-cap). Free NEXT_STEPS stayed operator/legal-gated. API route bounds src/utm_source, but GET /preview/[slug] still passes uncapped searchParams into PreviewOpenBeacon — when trackByStage, the client re-emits multi-KB attribution on the beacon fetch URL. Bound via shared resolvePreviewOpenAttrParam before the beacon (and in the beacon as defense-in-depth). Also tighten ITERATIONS decision-slice drift off-by-one (proxy-host→page): catalog SKU BD[367], API src-utm BD[368], page BD[369].",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "cursor/prompt-process-evolution-2607",
  },
  {
    id: "clean-audit-2026-07-16-convex-map-marker-await",
    summary:
      "Empty-backlog after PR #319 (preview-page-src-utm-field-length-cap). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were clean-audit-only / already-merged. Fresh audit of Convex API map + durable-marker-after-unchecked-await + public optional query/body + auth-gated free-text + SSR page twins + pack deliver/read soft-caps came back clean. Document the dated clean pass and lock the Convex API map with a durable Vitest so a missing registration cannot silently split-brain again.",
    status: "done",
    phase: "Phase 0 — Process",
    owner: "cursor/prompt-process-evolution-6ba0",
  },
  {
    id: "public-json-body-byte-length-cap",
    summary:
      "Empty-backlog after PR #319 (preview-page-src-utm). Free NEXT_STEPS stayed operator/legal-gated. Sibling prompt-process-evolution-6ba0 claimed clean-audit-2026-07-16-convex-map-marker-await — complementary pivot. Field-level caps close after request.json()/formData() allocate; public money + contact + preview-open (+ auth-gated marketing/generate when password unset) still parse unbounded raw bodies under the rate limit. Hard-reject over MAX_PUBLIC_JSON_BODY_BYTES before JSON.parse; Content-Length pre-check + arrayBuffer byteLength. Skip Stripe webhook (signed raw text).",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "cursor/business-process-evolution-44bd",
  },
  {
    id: "public-formdata-body-byte-length-cap",
    summary:
      "Empty-backlog after PR #321 (public-json-body-byte-length-cap). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were clean-audit-only / invent-optional-aggregate / already-merged — rejected. Public JSON routes now arrayBuffer-bound, but POST /api/contact/[slug] form-urlencoded/multipart still only Content-Length-prechecks then unbounded request.formData() when Content-Length is missing or understated. Complete the FormData twin with the same MAX_PUBLIC_JSON_BODY_BYTES ceiling (arrayBuffer + rebuild → formData).",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "cursor/prompt-process-evolution-15d6",
  },
  {
    id: "bundle-webhook-tier-enum-guard",
    summary:
      "Empty-backlog after PR #321; sibling prompt-process-evolution-15d6 claimed/shipped public-formdata-body-byte-length-cap (PR #322). Free NEXT_STEPS stayed operator/legal-gated. Bundle checkout create rejects unknown tiers via getBundle, but checkout.session.completed still treats any truthy metadata.tier as valid — records payment/handoff and interpolates raw tier into receipt HTML (escapeHtmlForEmail on businessName only). Require getBundle(tier) before recordLeadPayment / handoff (skip like missing slug/tier); escape tier in sendReceiptEmail.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/business-process-evolution-7508",
  },
  {
    id: "commerce-webhook-sku-catalog-gate",
    summary:
      "Empty-backlog after PR #323 (bundle-webhook-tier-enum-guard). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were invent-optional-aggregate (workNextCount) / clean-audit-only / already-merged — rejected. Fresh money-path residual twin of bundle getBundle gate: POST /api/commerce/checkout 404s when skuId is not in the lead catalog, but checkout.session.completed commerce_sku still accepted any truthy skuId and fell back to \"Catalog item\" for ledger/inquiry/client receipt. Require catalog membership (and parseCommerceCheckoutSkuId length) before insertCommerceOrder / side effects; unknown/over-long skips like missing skuId.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/prompt-process-evolution-ffdb",
  },
  {
    id: "commerce-webhook-amount-catalog-parity",
    summary:
      "Empty-backlog after PR #324 (commerce-webhook-sku-catalog-gate). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were invent-optional-aggregate / clean-audit-only / already-merged — rejected. Fresh money-path residual: Buy now create resolves Price from catalog stripePriceId (never trusts client amount), but checkout.session.completed still ledgered session.amount_total for any catalog-known skuId — a Dashboard-minted session with a valid skuId and a different Stripe Price could skew Commerce payouts totals and client receipt amounts. Require session.amount_total (integer cents) === catalogItem.priceCents before insertCommerceOrder / inquiry / client receipt; mismatch/missing skips like unknown skuId.",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "cursor/business-process-evolution-c135",
  },
  {
    id: "commerce-webhook-slug-lookup-gate",
    summary:
      "Empty-backlog after PR #325 (commerce-webhook-amount-catalog-parity). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were invent-optional-aggregate (workNextCount) / clean-audit-only / already-merged use-server+vercel-id under different SHAs — rejected. Fresh money-path residual: Buy now create hard-rejects over-long slug via parseCommerceCheckoutSlug before getCommerceCatalog, but checkout.session.completed commerce_sku still accepted any truthy metadata.slug and burned getLeadBySlug / getCommerceCatalog (and could ledger under a multi-KB key). Require parseCommerceCheckoutSlug before catalog/ledger/side effects; over-long/missing skips like missing skuId.",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "cursor/prompt-process-evolution-2ecd",
  },
  {
    id: "bundle-webhook-slug-lookup-gate",
    summary:
      "Empty-backlog after PR #326 (commerce-webhook-slug-lookup-gate). Dual-claimed commerce slug with 2ecd (earlier remote claim owned; they shipped #326). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were invent-optional-aggregate / clean-audit-only / already-merged — rejected. Fresh money-path residual twin: POST /api/stripe/checkout sanitizes+caps slug via resolveBundleCheckoutLeadSlug / sanitizeLeadSlug (MAX_LEAD_SLUG_LENGTH=63), but checkout.session.completed bundle path still treated any truthy metadata.slug as the CRM key for recordLeadPayment / handoff / receipt — a Dashboard-minted or tampered session with a multi-KB slug could mint an oversized paid stub lead and burn fulfillment. Require parseLeadSlugLookup before recordLeadPayment; missing/over-long skips like unknown tier.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/business-process-evolution-e067",
  },
  {
    id: "bundle-webhook-amount-catalog-parity",
    summary:
      "Empty-backlog after PR #327 (bundle-webhook-slug-lookup-gate). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were invent-optional-aggregate / clean-audit-only / already-merged under different SHAs — rejected. Fresh money-path residual twin of commerce-webhook-amount-catalog-parity: POST /api/stripe/checkout charges only catalog Stripe Price IDs from BUNDLES (+ optional COMMERCE_ADDON), but checkout.session.completed still recorded session.amount_total for any getBundle-known tier — a Dashboard-minted session with tier=growth and a $1 Price could skew revenueTotalUsd and receipt amounts. Require session.amount_total (integer cents) === expectedBundleCheckoutAmountCents(bundle, commerceAddon) before recordLeadPayment / handoff / receipt; mismatch/missing skips like unknown tier.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/prompt-process-evolution-5a8c",
  },
  {
    id: "bundle-webhook-commerceAddon-line-item-parity",
    summary:
      "Empty-backlog after PR #327/#328 (bundle slug + amount catalog parity). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were invent-optional-aggregate / clean-audit-only / already-merged feature bodies under stale SHAs — rejected. Fresh money-path residual: POST /api/stripe/checkout only sets metadata.commerceAddon when COMMERCE_ADDON Price IDs are on line_items, but checkout.session.completed still trusts metadata.commerceAddon === \"true\" into recordLeadPayment / handoff (and into expectedBundleCheckoutAmountCents) — unlocking catalog + Billing Portal + blocking Starter upsell without the $300+$49/mo charge (or withholding a paid add-on). Derive commerceAddon from listLineItems Price IDs before amount parity; do not trust metadata.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/business-process-evolution-7155",
  },
  {
    id: "billing-portal-session-commerceAddon-line-item-parity",
    summary:
      "Empty-backlog after PR #329 (bundle-webhook-commerceAddon-line-item-parity). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were invent-optional-aggregate / clean-audit-only / already-merged — rejected. Fresh money-path residual twin: createBillingPortalForCheckoutSession (customer self-serve from /checkout/success) still trusts metadata.commerceAddon === \"true\" for orderEligibleForBillingPortal when mode !== subscription — a Dashboard-minted payment-mode Starter session with forged commerceAddon metadata could open Billing Portal without the Commerce Prices on line_items. Derive commerceAddon from listLineItems Price IDs (reuse resolveCommerceAddonFromLineItems) before eligibility; do not trust metadata.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/business-process-evolution-d518",
  },
  {
    id: "billing-portal-session-payment-mode-tier-metadata-trust",
    summary:
      "Empty-backlog after PR #329; sibling d518 claimed billing-portal-session-commerceAddon-line-item-parity. Free NEXT_STEPS stayed operator/legal-gated. Complementary sold residual: createBillingPortalForCheckoutSession + loadCheckoutSuccessSession still treat metadata.tier growth|complete as portal-eligible when mode===payment — create path never emits that combo (Growth/Complete/Starter+Commerce always mode=subscription via hasRecurring). Trusting metadata.tier on payment mode only helps Dashboard-minted/tampered sessions open Billing Portal (and show Manage subscription on /checkout/success) without a recurring Price. For payment mode, eligibility must ignore metadata.tier (commerceAddon only; sibling hardens commerceAddon via line items).",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/prompt-process-evolution-0329",
  },
  {
    id: "success-page-commerceAddon-line-item-parity",
    summary:
      "Empty-backlog after PR #331 (billing-portal-session-payment-mode-tier-metadata-trust). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were invent-optional-aggregate / clean-audit-only / already-merged — rejected. Fresh money-path residual twin: loadCheckoutSuccessSession still uses metadata.commerceAddon === \"true\" as the soft SSR hint for showBillingPortal on payment mode, while createBillingPortalForCheckoutSession already derives commerceAddon from listLineItems. A Dashboard-minted payment-mode Starter session with forged commerceAddon metadata can surface Manage billing on /checkout/success even though the portal API would 400. Derive commerceAddon from listLineItems Price IDs (reuse resolveCommerceAddonFromLineItems) before checkoutSessionEligibleForBillingPortal; do not trust metadata.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/prompt-process-evolution-1924",
  },
  {
    id: "commerce-webhook-currency-usd-gate",
    summary:
      "Empty-backlog after PR #331 (billing-portal-session-payment-mode-tier-metadata-trust). Sibling prompt-process-evolution-1924 claimed+merged success-page-commerceAddon-line-item-parity (#332) — folded both ITERATIONS. Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were invent-optional-aggregate / clean-audit-only / already-merged — rejected. Fresh money-path residual: Buy now create charges only USD Stripe Prices (stripe-sync currency:\"usd\"), and amount_total===catalogItem.priceCents already gates cents, but checkout.session.completed still ledgers amount_total/100 as USD dollars without requiring session.currency===\"usd\". A Dashboard-minted session in another currency with a coincidentally equal minor-unit amount would skew commerceOrdersRevenueUsd and client receipts. Require currency usd (case-insensitive) before amount parity + ledger; mismatch/missing skips like amount mismatch. Apply the same USD gate on the bundle webhook twin in the same pass.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/business-process-evolution-deb8",
  },
  {
    id: "commerce-webhook-price-id-line-item-parity",
    summary:
      "Empty-backlog after PR #333 (commerce-webhook-currency-usd-gate). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were invent-optional-aggregate / clean-audit-only / already-merged (handoff-marker #226, use-server #311, vercel-id #304) — rejected. Fresh money-path residual: Buy now create charges catalog.stripePriceId, and amount+currency already gate cents/USD, but checkout.session.completed never requires that Price ID on session line_items — a Dashboard-minted session with matching amount_total+usd but a different Price can still ledger. Require catalog.stripePriceId ∈ listLineItems Price IDs before currency/amount + ledger; missing stripePriceId / mismatch skips like unknown skuId; listLineItems failures 5xx. Apply the bundle twin (setup + monthly env Prices) in the same pass.",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "cursor/business-process-evolution-cd9c",
  },
  {
    id: "bundle-webhook-price-id-line-item-parity",
    summary:
      "Empty-backlog after PR #333. Twin of commerce-webhook-price-id-line-item-parity: POST /api/stripe/checkout charges only BUNDLES setup (+ monthly) env Price IDs on line_items, but checkout.session.completed only used listLineItems for commerceAddon entitlement — not for verifying the bundle catalog Prices themselves. Require env setup (+ monthly when present) Price IDs ∈ listLineItems before currency/amount + recordLeadPayment; missing env / mismatch skips like unknown tier. Ship with commerce twin in the same pass.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/business-process-evolution-cd9c",
  },
  {
    id: "webhook-checkout-payment-status-paid-gate",
    summary:
      "Empty-backlog after PR #333 (commerce-webhook-currency-usd-gate). Sibling business-process-evolution-cd9c shipped create-path Price ID line-item parity (#334) — folded both ITERATIONS. Free NEXT_STEPS stayed operator/legal-gated. Fresh money-path residual: checkout.session.completed fulfills ledger/handoff/receipt without requiring session.payment_status===\"paid\". Async methods (ACH/bank transfer) complete the Session with payment_status unpaid while amount_total/currency/Price IDs still match catalog — false sold capability (deploy handoff, commerce order, receipts) before money clears. Gate fulfillment on paid; markCheckoutSessionComplete still runs on unpaid completed (stop abandoned recovery); handle checkout.session.async_payment_succeeded with the same fulfillment. Twin: loadCheckoutSuccessSession must not show Payment received until paid.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/prompt-process-evolution-9030",
  },
  {
    id: "billing-portal-checkout-payment-status-paid-gate",
    summary:
      "Empty-backlog after PR #335 (webhook-checkout-payment-status-paid-gate). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were invent-optional-aggregate / clean-audit-only / already-merged — rejected. Fresh money-path residual twin: createBillingPortalForCheckoutSession (public POST /api/stripe/billing-portal from /checkout/success) still opens Billing Portal when status===complete without requiring payment_status===paid — async ACH complete+unpaid can reach Manage billing via a client-supplied session_id even though success SSR hides the CTA. Require isStripeCheckoutSessionPaid before eligibility / portal create.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/prompt-process-evolution-9f34",
  },
  {
    id: "billing-portal-session-payment-status-paid-gate",
    summary:
      "Empty-backlog after PR #335 (webhook-checkout-payment-status-paid-gate). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were invent-optional-aggregate / clean-audit-only / already-merged (convex order parity #222, preview-index #217/#316, as-const #235) — rejected. Fresh money-path residual twin: createBillingPortalForCheckoutSession still opens Manage billing on status===complete without requiring payment_status===paid — async ACH/bank sessions that are complete+unpaid can open Billing Portal while /checkout/success stays unconfirmed and webhook has not fulfilled. Require isStripeCheckoutSessionPaid after complete; fail closed 400 when unpaid. Same-minute dual claim with billing-portal-checkout-payment-status-paid-gate (9f34) — feature body folded onto 9f34 / #336; keep both NEXT_STEPS. cc45 follow-up: object-parse BD slice cascade polish (e23f3b8 + Host→amount).",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/business-process-evolution-cc45",
  },
  {
    id: "webhook-async-payment-failed-reopen-checkout-session",
    summary:
      "Empty-backlog after PR #337 (portal payment_status paid + BD ownership polish). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were invent-optional-aggregate / clean-audit-only / already-merged — rejected. Fresh money-path residual after webhook-checkout-payment-status-paid-gate: unpaid completed correctly markCheckoutSessionComplete (stop abandoned recovery while ACH clears), but checkout.session.async_payment_failed is never handled — failed async ACH leaves the local checkout_sessions row status=complete forever, so Finish-checkout / Buy now recovery never runs and retry revenue is permanently lost. Reopen via markCheckoutSessionOpen (Convex + SQLite, requireConvex) on async_payment_failed; do not fulfill; 5xx on write failure so Stripe retries.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/business-process-evolution-fd10",
  },
  {
    id: "webhook-async-payment-failed-reopen-recovery",
    summary:
      "Same-minute dual claim with webhook-async-payment-failed-reopen-checkout-session (fd10 / #338). 919a claimed reopen-for-recovery under this id while fd10 shipped markCheckoutSessionOpen feature body + merge. Fold: keep both NEXT_STEPS; single implementation on main (#338).",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/prompt-process-evolution-919a",
  },
  {
    id: "subscription-mode-billing-portal-catalog-recurring-price-gate",
    summary:
      "Empty-backlog after PR #338 (async_payment_failed reopen). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were invent-optional-aggregate / clean-audit-only / already-merged — rejected. Fresh money-path residual: createBillingPortalForCheckoutSession + loadCheckoutSuccessSession treat mode===subscription as eligible without listLineItems — a Dashboard-minted subscription Session with a non-catalog recurring Price can open Manage billing / show the CTA. Require a create-path catalog recurring Price ID (Growth/Complete/Commerce monthly env) on listLineItems for subscription mode; portal 502 on list failure; success SSR fail closed to hide CTA. Twin both surfaces same pass.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/prompt-process-evolution-919a",
  },
  {
    id: "billing-portal-lead-catalog-recurring-price-gate",
    summary:
      "Empty-backlog after PR #339 (subscription-mode catalog recurring Price gate on Session portal + success SSR). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes (redirect-url / custom-domain / mark-live / handoff-marker / optimistic-state) already on main — rejected. Fresh money-path residual twin: createBillingPortalForLead (operator Manage billing) still trusts CRM orderEligibleForBillingPortal (tier/commerceAddon) + stored stripeCustomerId without re-proving payment_status paid + catalog recurring / Commerce Prices on the Checkout Session listLineItems. A stale/forged CRM row can mint a Billing Portal session while the public Session path would 400. Require stripeSessionId and reuse Session-path gates before portal create.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/prompt-process-evolution-bd71",
  },
  {
    id: "bundle-paid-orphan-open-checkout-session-cleanup",
    summary:
      "Empty-backlog after PR #339 (subscription catalog recurring portal gate). Sibling prompt-process-evolution-bd71 claimed/shipped billing-portal-lead-catalog-recurring-price-gate (#340) — complementary pivot. Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were invent-optional-aggregate / clean-audit-only / already-merged — rejected. Fresh sold residual: paid bundle checkout.session.completed / async_payment_succeeded only markComplete the paid stripeSessionId, so earlier abandoned open bundle checkout_sessions for the same leadSlug stay open and Finish-checkout / digest / pipeline-health can nudge an already-paid customer. On paid bundle fulfillment, markComplete other open bundle rows for that leadSlug (never commerce_sku siblings — multi-shopper carts). Starter→Growth upsell after pay mints a new Session.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/business-process-evolution-d5f3",
  },
  {
    id: "bundle-orphan-cleanup-after-catalog-fulfillment",
    summary:
      "Empty-backlog after PR #341 (bundle-paid-orphan-open-checkout-session-cleanup). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were invent-optional-aggregate / clean-audit-only / already-merged — rejected. Fresh residual twin: webhook called markCompleteOpenBundleCheckoutSessionsForLead as soon as parseLeadSlugLookup succeeded — before getBundle / catalog Price line-items / currency usd / amount parity / recordLeadPayment. A paid Session that later skips fulfillment (unknown tier, wrong Prices, non-USD, amount mismatch) still closed sibling open bundle carts and ACKed 200, permanently killing Finish-checkout / digest recovery without recording payment. Run orphan cleanup only after durable recordLeadPayment (+ handoff enqueue) succeeds.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/business-process-evolution-0c15",
  },
  {
    id: "commerce-paid-orphan-open-checkout-session-cleanup",
    summary:
      "Empty-backlog after PR #341 (bundle-paid-orphan-open-checkout-session-cleanup). Sibling business-process-evolution-0c15 claimed/shipped bundle-orphan-cleanup-after-catalog-fulfillment (#342) — complementary pivot. Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes already-merged — rejected. Fresh sold residual twin: paid commerce_sku fulfillment only markComplete's the paid stripeSessionId, so earlier abandoned open Buy now carts for the same leadSlug+skuId+customerEmail stay in digest / pipeline-health / Send Buy now recovery. On paid commerce ledger write, markComplete matching open commerce_sku siblings scoped by leadSlug+skuId+normalized customerEmail (skip when email missing — never close by lead+sku alone; multi-shopper). Run only after insertCommerceOrder succeeds (mirror #342 after-fulfillment ordering).",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "cursor/prompt-process-evolution-ff47",
  },
  {
    id: "customer-subscription-deleted-crm-sync",
    summary:
      "Empty-backlog after PR #343 (commerce-paid-orphan-open-checkout-session-cleanup). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes invent-optional-aggregate / clean-audit-only / already-merged — rejected. Fresh money-path residual: customer.subscription.deleted is acknowledged but never syncs CRM — canceled Growth/Complete/Commerce subscribers keep marketing-pack / voice-pack / commerce-catalog entitlement forever. On deleted, mark matching orders.recurringCanceledAt by stripeCustomerId (requireConvex); gate sold recurring eligibility on !recurringCanceledAt. Keep stage=paid/live + Billing Portal (invoices/resubscribe). Do not unlock Starter upsell for prior Growth/Complete.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/business-process-evolution-a654",
  },
  {
    id: "customer-subscription-reactivated-crm-sync",
    summary:
      "Empty-backlog after PR #344 (customer-subscription-deleted-crm-sync). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes invent-optional-aggregate / clean-audit-only / already-merged — rejected. Fresh twin residual: Billing Portal / new Checkout can create an active Stripe Subscription for a previously canceled customer, but CRM leaves orders.recurringCanceledAt set — marketing/voice/catalog stay withheld after they pay again. On customer.subscription.created|updated with status active|trialing, clearRecurringCanceledByCustomer (requireConvex). Missing customer / non-active status skips. Write failures return 5xx (orders_recurring_reactivated). invoice.payment_failed / past_due pause stays a later residual.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/prompt-process-evolution-9a1a",
  },
  {
    id: "invoice-payment-failed-past-due-crm-pause",
    summary:
      "Empty-backlog after PR #345 (customer-subscription-reactivated-crm-sync). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes invent-optional-aggregate / clean-audit-only / already-merged — rejected. Fresh twin residual: active|trialing clear restores packs, but customer.subscription.updated past_due|unpaid and invoice.payment_failed never set recurringCanceledAt — failed renewals keep marketing/voice/catalog entitlement until subscription.deleted. On past_due|unpaid subscription.updated (and invoice.payment_failed for subscription invoices), markOrdersRecurringCanceledByCustomer (requireConvex). Keep stage=paid|live + Billing Portal. active|trialing clear twin already restores after recovery.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/prompt-process-evolution-8b08",
  },
  {
    id: "subscription-pause-collection-crm-pause",
    summary:
      "Empty-backlog after PR #345 (customer-subscription-reactivated-crm-sync). Sibling prompt-process-evolution-8b08 claimed invoice-payment-failed-past-due-crm-pause — complementary pivot. Fresh residual: Stripe pause_collection keeps status=active|trialing while collection is paused, so the #345 clear path (and 8b08 grants-first branch) restores/keeps marketing/voice/catalog entitlement for non-paying paused subscribers. On customer.subscription.created|updated when pause_collection is set, markOrdersRecurringCanceledByCustomer before the active|trialing clear; when pause_collection clears and status grants, existing clear restores. Keep stage=paid|live + Billing Portal. past_due|unpaid|invoice.payment_failed stays on 8b08.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/business-process-evolution-13bc",
  },
  {
    id: "recurring-entitlement-paused-pipeline-digest",
    summary:
      "Empty-backlog after PR #347 (subscription-pause-collection-crm-pause). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes invent-optional-aggregate / clean-audit-only / already-merged — rejected. Fresh wiring residual: #344–#347 persist orders.recurringCanceledAt and gate packs/catalog, but paused/canceled MRR customers silently drop out of marketingPacksDue / voice / catalog panels with no recovery queue — operators cannot chase Billing Portal payment recovery. Wire listRecurringEntitlementPaused (paid|live + had recurring + no active entitlement) into pipeline-health count/age + daily digest action section + dashboard metric card; reuse Manage billing / Billing Portal (do not invent a second scorer).",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/business-process-evolution-4b2e",
  },
  {
    id: "commerce-buy-now-create-path-entitlement-gate",
    summary:
      "Empty-backlog after PR #347 (subscription-pause-collection-crm-pause). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes invent-optional-aggregate / clean-audit-only / already-merged — rejected. Fresh residual after #344–#347 CRM entitlement triad: preview + saveCommerceCatalogAction gate on leadEligibleForCommerceCatalog (!recurringCanceledAt), but POST /api/commerce/checkout still mints Buy now Sessions from catalog+stripePriceId alone — canceled/paused Commerce subscribers keep a create-path for end-customer carts. Before stripe.checkout.sessions.create: getLeadBySlug + listOrdersByLeadSlug + leadEligibleForCommerceCatalog; 403 when ineligible (404 when lead missing). syncCommerceCatalogToStripeAction twin claimed in same run.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/prompt-process-evolution-716e",
  },
  {
    id: "commerce-sync-recurring-entitlement-gate",
    summary:
      "Auth-gated twin of commerce-buy-now-create-path-entitlement-gate: syncCommerceCatalogToStripeAction loads lead + catalog but skips leadEligibleForCommerceCatalog, so an operator can re-sync Stripe Prices after CRM pause/cancel and keep Buy now Price ids live while create-path is closed. Gate with the same predicate (listOrdersByLeadSlug) before syncCommerceCatalogToStripe; return success:false when ineligible.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/prompt-process-evolution-716e",
  },
  {
    id: "commerce-webhook-recurring-entitlement-gate",
    summary:
      "Empty-backlog after PR #348/#349 (Buy now create/sync entitlement + paused MRR digest). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes invent-optional-aggregate / clean-audit-only / already-merged (email-href #238, redirect-url #218) — rejected. Fresh residual twin: #348 gates mint + Sync on leadEligibleForCommerceCatalog, but checkout.session.completed commerce_sku still fulfills from catalog+Price alone — Dashboard-minted or pre-pause Sessions still insertCommerceOrder / inquiry / client receipt for paused/canceled Commerce subscribers. Before insertCommerceOrder: getLeadBySlug + listOrdersByLeadSlug + leadEligibleForCommerceCatalog; missing lead or ineligible → skip like unknown sku (session already markComplete; no 5xx forever).",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/business-process-evolution-19f7",
  },
  {
    id: "invoice-paid-recurring-entitlement-restore",
    summary:
      "Empty-backlog after PR #348/#349 (Buy now create/sync entitlement + paused MRR digest). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes invent-optional-aggregate / clean-audit-only / already-merged — rejected. Sibling business-process-evolution-19f7 claimed/shipped commerce-webhook-recurring-entitlement-gate (#350) — complementary pivot. Fresh CRM restore asymmetry: #346 pauses packs on invoice.payment_failed so entitlement does not lag delayed subscription.updated past_due, but invoice.paid is a no-op — restore still waits only on customer.subscription.created|updated active|trialing. When invoice.paid wins the race (or the clear event is delayed/lost), a paying customer stays recurringCanceledAt-paused (Generate/Email pack, voice, Buy now withheld). On invoice.paid for subscription invoices: subscriptions.retrieve; clearOrdersRecurringCanceledByCustomer only when stripeSubscriptionShouldRestoreRecurringEntitlement (blind clear would reopen #347 pause_collection). One-time invoices skip. Write failures return 5xx (orders_recurring_reactivated / subscription_retrieve).",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/prompt-process-evolution-f273",
  },
  {
    id: "invoice-payment-failed-stale-repause-guard",
    summary:
      "Twin of invoice-paid-recurring-entitlement-restore: after clear on recovery, a late/out-of-order invoice.payment_failed previously markOrdersRecurringCanceledByCustomer unconditionally (subscription membership only) — no further subscription.updated leaves packs stuck paused despite payment. Before mark on payment_failed, subscriptions.retrieve; mark only when stripeSubscriptionShouldPauseRecurringEntitlement; skip when grants and not paused. Retrieve failures return 5xx (subscription_retrieve).",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/prompt-process-evolution-f273",
  },
  {
    id: "commerce-abandoned-recovery-entitlement-gate",
    summary:
      "Empty-backlog after PR #350/#351 (commerce webhook entitlement + invoice.paid restore). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes invent-optional-aggregate / clean-audit-only / already-merged — rejected. Fresh residual twin: #348–#350 gate Buy now create/sync/webhook on leadEligibleForCommerceCatalog, but sendCommerceCheckoutRecoveryAction + listCommerceAbandonedCheckoutsDue / digest / pipeline-health still nudge end-customer carts for paused/canceled Commerce subscribers (create-path 403s; webhook skips). Gate recovery send + due queues on the same predicate.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/business-process-evolution-cbcb",
  },
  {
    id: "commerce-abandoned-recovery-require-entitlement-set",
    summary:
      "Empty-backlog after PR #352 (commerce-abandoned-recovery-entitlement-gate). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes invent-optional-aggregate / clean-audit-only / already-merged — rejected. Sibling cbcb/#352 left listCommerceAbandonedCheckoutsDue.eligibleLeadSlugs optional (omit → allow-all), so a future digest/dashboard caller can silently reopen paused-Commerce recovery debt. Make eligibleLeadSlugs required at the type level; update call sites + Vitest. Dated clean-audit on escapeHtml / webhook idempotency / uncapped-list + pack entitlement twins came back clean.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/prompt-process-evolution-d772",
  },
  {
    id: "best-marketing-order-tier-active-entitlement",
    summary:
      "Empty-backlog after PR #353 (commerce-abandoned-recovery-require-entitlement-set). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes invent-optional-aggregate / clean-audit-only / already-merged — rejected. Fresh residual: leadEligibleForMarketingPack gates generate on !recurringCanceledAt, but bestMarketingOrderTier still prefers any Complete row (including paused/canceled) over an active Growth — downgraded/canceled Complete + still-active Growth wrongly mints full_marketing / generate_schedule_optimize. Prefer Complete among active-entitlement Growth/Complete rows only.",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "cursor/business-process-evolution-6b9c",
  },
  {
    id: "entitlement-order-arg-recurring-canceled-type-parity",
    summary:
      "Empty-backlog after PR #353 (commerce-abandoned-recovery-require-entitlement-set). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes invent-optional-aggregate / clean-audit-only / already-merged — rejected. Sibling business-process-evolution-6b9c claimed best-marketing-order-tier-active-entitlement — complementary pivot. Fresh type-level residual twin of #353: leadEligibleForMarketingPackDelivery / leadEligibleForClientVoicePackDelivery / listCommerceCatalogsUnsynced still type orders as {tier} or {commerceAddon} without recurringCanceledAt, so a future caller can pass tier/addon-only rows and TypeScript will not require the CRM pause field even though the callees check it (structural omit → silent reopen of paused entitlement). Align order arg types with leadEligibleFor* predicates; Vitest paused-delivery + unsynced exclusion.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/prompt-process-evolution-203f",
  },
  {
    id: "marketing-voice-build-request-business-context-soft-cap",
    summary:
      "Empty-backlog after PR #354/#355 (bestMarketingOrderTier active entitlement + wrapper order-arg type parity). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes invent-optional-aggregate / clean-audit-only / already-merged — rejected. Fresh residual twin: POST /api/marketing/generate soft-caps business via normalizeMarketingGenerateBusiness, but businessContextFromLead / clientVoiceBusinessContextFromLead (operator Generate pack / Generate voice → Anthropic/stub) still pass raw lead fields — a pre-cap CRM row or Convex-hydrated oversize can burn LLM tokens and inflate pack variants. Soft-cap both lead→request builders with the same create-fields MAX_* policy before generate.",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "cursor/business-process-evolution-3811",
  },
  {
    id: "marketing-voice-commerce-action-entitlement-regression",
    summary:
      "Empty-backlog after PR #355 (entitlement-order-arg-recurring-canceled-type-parity). Free NEXT_STEPS stayed operator/legal-gated. Sibling business-process-evolution-3811 claimed marketing-voice-build-request-business-context-soft-cap — complementary pivot. Lib predicates + commerce sync/recovery already cover recurringCanceledAt, but generateMarketingPackAction / sendMarketingPackToClientAction / generateClientVoicePackAction / sendClientVoicePackToClientAction / saveCommerceCatalogAction lack action-level paused Vitest — a future glue regression could regenerate/email packs or save catalogs for paused MRR without TypeScript noticing. Add action-level regressions that assert generate/send/save do not call LLM/persist/email when orders carry recurringCanceledAt.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/prompt-process-evolution-b43f",
  },
  {
    id: "marketing-voice-pack-hours-join-soft-cap",
    summary:
      "Empty-backlog after PR #356/#357 (lead→request soft-cap + action entitlement Vitest). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes invent-optional-aggregate / clean-audit-only / already-merged — rejected. Fresh residual: #356 soft-caps joined Weekdays/Weekends hours via normalizeMarketingGenerateBusiness at MAX_HOURS_SEGMENT_LENGTH (120) — a valid create-path lead with two max segments joins to ~260 chars and truncates to 120, wiping weekend hours from Growth/Complete pack + Complete voice prompts. Soft-cap each CRM segment before join and raise the joined hours ceiling to MAX_PACK_BUSINESS_HOURS_LENGTH.",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "cursor/prompt-process-evolution-3a51",
  },
  {
    id: "subscription-items-crm-entitlement-sync",
    summary:
      "Empty-backlog after PR #356/#357 (lead→request soft-cap + action-level paused entitlement Vitest). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes invent-optional-aggregate / clean-audit-only / already-merged — rejected. Fresh money-path residual: customer.subscription.created|updated / invoice.paid only clear/mark recurringCanceledAt by stripeCustomerId — they never re-derive orders.tier / commerceAddon from live Subscription items vs catalog Price IDs. Billing Portal / Dashboard plan changes (Complete→Growth, remove Commerce monthly) leave CRM unlocking Complete voice / Commerce catalog / full_marketing while Stripe no longer charges those Prices. On grants restore: require a create-path catalog recurring Price on subscription.items; sync tier+commerceAddon onto recurring-entitlement orders; active foreign-Price subscriptions must pause (not clear).",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/business-process-evolution-516f",
  },
  {
    id: "commerce-order-refund-clawback-tracking",
    summary:
      "Empty-backlog after PR #357 (action-level paused MRR entitlement Vitest). Stripe charge.refunded/disputes were entirely unhandled — grep found zero references to refunds anywhere in the webhook despite an early BUSINESS_DECISIONS note that operators must 'reconcile Stripe for disputes/refunds' manually. Concretely, an operator could Mark paid out a Commerce Buy now order that Stripe had already refunded to the shopper, losing that money twice. Shipped: charge.refunded resolves the Checkout Session (stripe.checkout.sessions.list({payment_intent})), marks commerceOrders.refundedAt when it backs a ledgered order (idempotent), excludes refunded orders from the 'owed to client' total (pipeline-health commerceOrdersRevenueUsd, Commerce payouts panel, digest), rejects Mark paid out on a refunded order, and surfaces refund-after-payout as a distinct clawback (new uncapped listCommerceOrdersRefunded() feeding pipeline-health commerceOrdersRefundClawbackCount/Usd + a new digest 'Refund clawback needed' section) — listUnpaidCommerceOrders alone cannot see this case since it drops any row once paidOutAt is set. Bundle order refunds are a follow-up (lower severity: no payout-panel double-loss risk on that ledger today).",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "claude/nice-euler-0x1k8a",
  },
  {
    id: "commerce-order-dispute-clawback-tracking",
    summary:
      "Natural follow-up flagged by commerce-order-refund-clawback-tracking: charge.dispute.created (a Stripe chargeback) was entirely unhandled — Stripe debits the disputed amount from the platform the moment a dispute opens, same payout-safety exposure as a refund. Shipped: mirrors the refund clawback shape end to end (commerceOrders.disputedAt, exclude from owed total, reject Mark paid out, dedicated 'Dispute clawback needed' pipeline-health card + digest section, payouts-panel UI). Dispute resolution (charge.dispute.closed — won/lost) is a follow-up, not handled here.",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "claude/nice-euler-x13feb",
  },
  {
    id: "commerce-order-dispute-closed-resolution",
    summary:
      "Natural follow-up flagged by commerce-order-dispute-clawback-tracking: charge.dispute.closed (won/lost/warning_closed) was entirely unhandled — a dispute the operator later won left commerceOrders.disputedAt set forever, so Mark paid out stayed rejected and Dispute clawback needed kept counting a false clawback after Stripe reinstated the funds. On charge.dispute.closed: resolve Checkout Session via payment_intent (same as created); when status is won or warning_closed, clearCommerceOrderDisputed (Convex replace omit disputedAt + SQLite NULL); when status is lost, ensure disputedAt is set (created may have been missed). Bundle disputes stay out of scope.",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "cursor/business-process-evolution-f01f",
  },
  {
    id: "preview-lead-description-read-soft-cap",
    summary:
      "Create-path soft-caps lead.description (MAX_DESCRIPTION_LENGTH) on CSV/Add lead, but public /preview meta + JSON-LD + CategoryPreview still emit uncapped description (and sibling free-text fields) for pre-cap Convex/SQLite rows. Soft-cap at read via softCapLeadForPublicSurface so outreach HTML / search snippets / page HTML cannot grow unbounded from legacy rows.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "cursor/prompt-process-evolution-50d3",
  },
  {
    id: "commerce-payouts-panel-clawback-visibility",
    summary:
      "Found while auditing the fresh dispute-closed-resolution merge: the live /dashboard/leads 'Commerce payouts (manual)' panel's own per-order UI already renders 'Refunded after payout — claw back from client' / 'Disputed after payout — claw back from client' text, but that branch is dead code — its data source is listUnpaidCommerceOrders() (paidOutAt IS NULL only), so a clawback-needed order (paidOutAt set, then refunded/disputed) never reaches the client at all, and even if it did, commercePayoutsByLead's `.filter(unpaidCount > 0)` would hide any lead whose only orders are clawback-needed (unpaidCount is 0 for those). Today clawback-needed orders are visible ONLY via the aggregate pipeline-health count/$ card (no lead names) and the daily-digest EMAIL (batch, not always-on) — the always-on dashboard has zero row-level detail. Shipped: merge unpaid + refunded + disputed commerce orders (deduped by id, mergeCommerceOrdersForReview) into the panel's data source, and widen the per-lead filter (commerceOrdersByLeadSummaryNeedsAttention) to keep any lead with a clawback-needed order even when unpaidCount is 0. Verified live: inserted a paid-out + refunded test row and confirmed 'Refunded after payout — claw back from client' now renders on /dashboard/leads.",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "claude/upbeat-dijkstra-cd2ftu",
  },
  {
    id: "bundle-order-refund-tracking",
    summary:
      "AGENT_PROTOCOL and the commerce-order-refund-clawback-tracking decision both flagged bundle (Starter/Growth/Complete/Commerce-addon) order refunds as a deliberately-deferred, lower-severity follow-up: charge.refunded only ever resolved to a commerceOrders row, so a refunded bundle purchase kept counting in pipeline-health revenueTotalUsd forever with zero operator visibility (no payout-panel double-loss risk on this ledger, since it is never manually disbursed to a third party — the gap is pure revenue-accuracy + awareness, not a clawback). Shipped: orders.refundedAt (Convex + SQLite migration), getOrderByStripeSessionId/markOrderRefunded mirroring the commerce twins, a bundle-order fallback branch on the charge.refunded webhook handler (checked only when the Session backs no commerceOrders row), revenueTotalUsd excludes refunded orders, and a new pipeline-health 'Bundle revenue refunded' card + matching daily-digest section (visibility only — no Mark-paid-out reject, no clawback UI, since nothing was ever paid out to a client on this ledger).",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "claude/nice-euler-98urq3",
  },
  {
    id: "bundle-order-dispute-tracking",
    summary:
      "Natural twin of bundle-order-refund-tracking (#368): charge.dispute.created/closed still skipped bundle (Starter/Growth/Complete/Commerce-addon) orders entirely, so a disputed bundle purchase kept counting in revenueTotalUsd and never surfaced for operator awareness (same revenue-accuracy gap refunds just closed; no payout-panel double-loss risk). Shipped: orders.disputedAt (Convex + SQLite), markOrderDisputed / clearOrderDisputed, webhook fallback on created/closed (won/warning_closed clear; lost ensure), revenueTotalUsd excludes disputed, Bundle revenue disputed pipeline-health card + digest section. Visibility only — no Mark-paid-out reject / clawback UI.",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "cursor/business-process-evolution-19a4",
  },
  {
    id: "digest-clawback-oldest-age",
    summary:
      "pipeline-health.ts computes oldestCommerceOrdersRefundClawbackAgeHours / oldestCommerceOrdersDisputeClawbackAgeHours / oldestBundleOrdersRefundedAgeHours / oldestBundleOrdersDisputedAgeHours and the dashboard panel renders each as an 'oldest Xh/Xd' hint, but daily-digest.ts computes the matching row lists/totals for all four sections and never an oldest-age aggregate — an operator who only reads the digest email has no staleness signal for money that needs clawing back, while the always-on dashboard does. Shipped: oldestCommerceOrdersRefundClawbackAgeHours / oldestCommerceOrdersDisputeClawbackAgeHours / oldestBundleOrdersRefundedAgeHours / oldestBundleOrdersDisputedAgeHours on DailyDigest (same min-refundedAt/disputedAt-scan pattern already used for oldestFollowUpDueAgeHours etc.), each section title in renderDailyDigestHtml now appends ' · oldest Xh' matching the dashboard hint text exactly.",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "claude/upbeat-dijkstra-yd6du5",
  },
  {
    id: "starter-upsell-pipeline-health-metric",
    summary:
      "Empty-backlog after PR #370 (digest-clawback-oldest-age). paid-starter-upsell-nudge shipped listStarterUpsellCandidates, wired into daily-digest.ts (email section) and its own dashboard panel — but never into pipeline-health.ts, so the always-on dashboard summary-card grid at the top of /dashboard/leads (every other due-queue: marketing packs due, voice packs due, catalogs missing/unsynced, follow-ups due, recurring-entitlement-paused) had no 'Starter upsell due' card and no staleness signal, unlike every sibling MRR-conversion queue. Shipped: starterUpsellCandidatesCount + oldestStarterUpsellCandidateAgeHours on PipelineHealth (new oldestStarterUpsellCandidateAgeHours helper in src/lib/billing/starter-upsell.ts, same list+age-helper-pair pattern as oldestRecurringEntitlementPausedAgeHours) + a 'Starter → MRR upsell' MetricCard on the dashboard panel.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "claude/nice-euler-ivhr57",
  },
  {
    id: "due-queue-oldest-age-parity",
    summary:
      "Empty-backlog after PR #371 (starter-upsell-pipeline-health-metric). Free NEXT_STEPS stayed fully operator/legal-gated (4 items: stripe-price-objects, lead-ingestion, marketing-content-scheduling, commerce-payouts-stripe-connect). Fetched every remote branch and diffed the ones with real commits ahead of main: only #365/#366 (already-open CI/scheduled-agent-auth PRs, unrelated infra) and a handful of already-superseded 1–13-commit docs/bookkeeping branches turned up — no genuine fold candidate. Read PipelineHealth's field list end to end (tier-1 empty-backlog fallback: wire an already-shipped due-queue signal that's missing a sibling's pattern) and found an asymmetry: every due-queue on the dashboard/digest (abandoned checkouts, unreplied inquiries, cold leads, follow-ups due, recurring-entitlement-paused, refund/dispute clawback, bundle refunded/disputed, Starter upsell) carries an 'oldest Xh' staleness signal — except marketingPacksDue, commerceCatalogsMissing, commerceCatalogsUnsynced, and clientVoicePacksDue, the four monthly/one-time fulfillment-debt queues, which had none anywhere (not pipeline-health, not the digest, not the dashboard panel). An operator staring at 'Marketing packs due: 3' has no way to tell whether that's a fresh signup or a week-old fulfillment failure.",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "claude/upbeat-dijkstra-fofwgy",
  },
  {
    id: "starter-upsell-digest-oldest-age",
    summary:
      "due-queue-oldest-age-parity's own writeup flagged this as the remaining smaller gap: oldestStarterUpsellCandidateAgeHours shipped on PipelineHealth (starter-upsell-pipeline-health-metric) and renders on the dashboard MetricCard, but daily-digest.ts's Starter → MRR upsell section never got the same 'oldest Xh' treatment the other due-queue sections (marketing packs due, catalogs missing/unsynced, voice packs due, clawback sections) all have. Shipped: oldestStarterUpsellCandidateAgeHours widened to accept optional orders[].createdAt (reused as-is by both PipelineHealth and DailyDigest, no second helper), wired into DailyDigest + the Starter → MRR upsell section title's ' · oldest Xh' suffix.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "claude/nice-euler-eojcaa",
  },
  {
    id: "commerce-abandoned-checkout-oldest-age-parity",
    summary:
      "Empty-backlog after PR #373 (starter-upsell-digest-oldest-age). Reading pipeline-health.ts / daily-digest.ts / pipeline-health-panel.tsx side by side (tier-1 empty-backlog fallback) found one due-queue whose oldest-age never made it anywhere: bundle abandoned checkouts have oldestAbandonedAgeHours on PipelineHealth, DailyDigest, AND the dashboard MetricCard hint, but the sibling Commerce Buy now abandoned-cart queue (commerceAbandonedCheckoutCount / commerceRecoveryDueCount, kind=commerce_sku) had no oldest-age field on PipelineHealth, no field on DailyDigest, and the dashboard 'Abandoned Buy now' section title had no ' · oldest Xh' suffix. Shipped oldestCommerceAbandonedAgeHours computed independently on all three surfaces, mirroring the bundle twin's pattern exactly.",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "claude/upbeat-dijkstra-czjurd",
  },
  {
    id: "refund-dispute-entitlement-gate",
    summary:
      "Empty-backlog after PR #374 (commerce-abandoned-checkout-oldest-age-parity); the tier-1 pipeline-health/digest/dashboard oldest-age parity axis was fully closed, so a subagent-assisted audit widened scope to tier-2/3 (Convex/SQLite parity, security). Found a real, verified entitlement gap distinct from the already-shipped revenue-visibility work (bundle-order-refund-tracking / bundle-order-dispute-tracking, #368/#369): orders.refundedAt/disputedAt only ever fed PipelineHealth.revenueTotalUsd and the Commerce payout clawback surfaces — every sold recurring-capability gate (leadEligibleForMarketingPack, leadEligibleForClientVoicePack, leadEligibleForCommerceCatalog, bestMarketingOrderTier, and isStarterOnlyOrder for the Starter upsell nudge) checked only recurringCanceledAt. A Stripe refund or dispute does not always cancel the underlying Subscription (a single charge can be returned/disputed while the Subscription itself stays active), so a refunded/disputed Growth/Complete/Commerce customer kept indefinite service delivery: Generate/Email pack, Sync to Stripe, and Buy now checkout (POST /api/commerce/checkout + the commerce webhook, both call leadEligibleForCommerceCatalog) all stayed live, and a refunded Starter customer could still receive a paid-upgrade upsell pitch.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "claude/nice-euler-igqi67",
  },
  {
    id: "refund-dispute-oldest-age-parity",
    summary:
      "Empty-backlog after PR #375 (refund-dispute-entitlement-gate). That fix wired orderGrantsSoldCapabilityEntitlement into every eligibility predicate (leadEligibleForMarketingPack, leadEligibleForClientVoicePack, leadEligibleForCommerceCatalog) but left their sibling oldest-age helpers (oldestMarketingPacksDueAgeHours, oldestCommerceCatalogCandidateAgeHours, oldestClientVoicePacksDueAgeHours) reimplementing the old recurringCanceledAt-only inline check — so a lead with an older refunded/disputed Growth/Complete/Commerce order alongside a newer active one could show a misleadingly old 'oldest Xh' figure on the dashboard MetricCard and daily-digest email, even though the correctly-fixed eligibility gate only counted the lead as due because of the newer, still-entitled order. Fixed all three age helpers to gate on orderGrantsSoldCapabilityEntitlement instead, matching oldestStarterUpsellCandidateAgeHours (which already reused isStarterOnlyOrder rather than reimplementing).",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "claude/upbeat-dijkstra-gipcyc",
  },
  {
    id: "rate-limiter-bucket-bounds",
    summary:
      "Security audit of the shared public-write limiter: bound its process-local client bucket map by purging expired windows and evicting the oldest key at MAX_RATE_LIMIT_BUCKETS, so rotating forwarded IPs cannot grow memory without bound.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "codex/dev-work-rate-limit-bounds",
  },
  {
    id: "webhook-email-send-failure-retry",
    summary:
      "Stripe checkout webhooks must return 5xx when a transactional receipt, DNS handoff, or Commerce client receipt send fails, so Stripe redelivery can exercise the existing per-email recovery markers instead of acknowledging a permanently lost paid notification.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "codex/dev-work-webhook-email-retry",
  },
  {
    id: "bundle-email-unexpected-error-retry",
    summary:
      "The bundle webhook's outer receipt/DNS email catch now returns 5xx on unexpected formatter/import errors instead of acknowledging Stripe with both sent-markers absent; transactional email recovery remains fail-closed for every failure shape.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "codex/continuous-work-bundle-email-unexpected-error",
  },
  {
    id: "email-subject-control-character-sanitization",
    summary:
      "Security audit: strip CR/LF and other control characters from outbound email subjects before handing them to the provider, so client-controlled business and SKU names cannot create malformed or deceptive subject lines.",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "codex/dev-work-email-subject-control",
  },
  {
    id: "process-doc-unbounded-history-pagination",
    summary:
      "The public /docs/process page rendered every ITERATIONS, BUSINESS_DECISIONS, and done NEXT_STEPS entry unconditionally — an append-only, ever-growing set (365 iterations / 428 decisions / 336 NEXT_STEPS as of this audit) with no display cap, so the page's SSR HTML grew without bound on every single agent PR (1.33MB before this fix). Capped the doc page to the most recent N of each (iterations/decisions) or done-only N (NEXT_STEPS), with a visible 'showing X of Y, full history in source/git' note — the underlying arrays and AGENT_PROTOCOL's append-only discipline are unchanged, only the live page's render is bounded.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/nice-euler-9vrw23",
  },
  {
    id: "agent-protocol-narrative-consolidation",
    summary:
      "AGENT_PROTOCOL (the live, must-read rulebook every agent loads before starting work) had grown to 121 entries / ~100KB — not from new invariants, but from an accumulated chain of narrow 'after X ships, close Y twin' audit-trail entries across the field-length-cap and Stripe entitlement/webhook hardening series, each individually correct but collectively duplicating what BUSINESS_DECISIONS + ITERATIONS + git history already record (the file's own header says the audit trail belongs there, not here). Consolidated the ~35 most narrative/chained entries down to ~13 general, still-binding invariant statements (request/field size-bound classes, Stripe webhook + recurring-entitlement rules, pipeline-health/digest aggregation pitfalls), dropped one stale residual-gap callout that a later PR (#373) had already closed, verified no distinct technical fact was lost by reading every entry end to end first, and left every entry outside this cluster (cooperation workflow, dual-backend invariants, money/ledger integrity, security/injection, testing, product data-model, docs/stack, and several compact still-current specific rules like lead-slug sanitization and the Convex API map lock) untouched.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/upbeat-dijkstra-cc9bke",
  },
  {
    id: "payment-recovered-confirmation-notice",
    summary:
      "recurring-payment-failed-dunning-notice shipped a customer-facing email when invoice.payment_failed pauses Growth/Complete/Commerce CRM entitlement, but the invoice.paid restore path stayed silent — a paying customer who fixed their card had no confirmation their service resumed. Added sendPaymentRecoveredNotice (skipSuppression: true, same /checkout/success Manage-billing link pattern), fired from invoice.paid only when clearOrdersRecurringCanceledByCustomer actually cleared a prior pause (cleared > 0) so an ordinary healthy renewal stays silent.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "claude/nice-euler-uvmq9u",
  },
  {
    id: "subscription-pause-collection-notice",
    summary:
      "recurring-payment-failed-dunning-notice / payment-recovered-confirmation-notice covered invoice.payment_failed/invoice.paid, but Stripe pause_collection (billing paused on an otherwise active|trialing Subscription — settable from the Stripe Dashboard or a support agent, with no invoice event at all) had zero customer-facing signal even though customer.subscription.updated already paused/restored CRM entitlement for it internally. Added sendSubscriptionPausedNotice/sendSubscriptionResumedNotice (skipSuppression: true; deliberately separate copy from the payment-failed pair, since 'your card was declined' is false for a pause with no failed charge) fired from customer.subscription.updated, gated on Stripe's own event.data.previous_attributes containing a pause_collection key for that specific event — this stops both a repeat notify on every later unrelated update while a pause persists and a double-email of an ordinary past_due/unpaid pause/restore already covered by the invoice.* pair.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "claude/nice-euler-65qs5d",
  },
  {
    id: "billing-notice-entitlement-selection",
    summary:
      "The four Stripe webhook billing notices (sendPaymentFailedNotice, sendPaymentRecoveredNotice, sendSubscriptionPausedNotice, sendSubscriptionResumedNotice) all selected their recipient order via orderHadRecurringEntitlement — 'ever carried a Growth/Complete/Commerce Price' — instead of orderGrantsSoldCapabilityEntitlement, the active+non-refunded+non-disputed predicate every sold-capability eligibility gate already uses. A customer with an older refunded or disputed Growth/Complete order alongside unrelated history could surface a misleading recipient/stale Manage-billing link, or (for a customer whose only historical recurring order was refunded/disputed) send a false 'billing paused/resumed/failed/recovered' notice for an order they were never entitled to and got their money back on. Switched all four call sites to orderGrantsSoldCapabilityEntitlement; CRM pause/restore writes (markOrdersRecurringCanceledByCustomer/clearOrdersRecurringCanceledByCustomer) are unaffected — this is a notice-recipient-selection fix only, not an entitlement-gate change.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "claude/upbeat-dijkstra-74a30g (folded codex/dev-work-billing-notice-entitlement + codex/continuous-work-20260718-luna-fold)",
  },
  {
    id: "post-billing-notice-entitlement-clean-audit-0718",
    summary:
      "Empty-backlog audit after PR #389 (billing-notice-entitlement-selection): re-verify skipSuppression correctness, href escaping, Convex/SQLite ORDER BY parity, existence-check-before-write, `as const` on success literals, orchestration test coverage, and pipeline-health/digest wiring from source. No defect found; fixed one stale doc comment (sendCommerceBuyNowClientReceipt said 'Honors suppression' when it correctly bypasses it).",
    status: "done",
    owner: "claude/nice-euler-fuhf7h",
  },
  {
    id: "starter-upsell-exclusion-refund-dispute-aware",
    summary:
      "leadEligibleForStarterUpsell's 'already has Growth/Complete/Commerce' exclusion reused orderEligibleForBillingPortal raw (tier/commerceAddon only) — refund-dispute-entitlement-gate (#375) made the Starter-order side of this same check (isStarterOnlyOrder) refund/dispute-aware but missed this sibling exclusion, so a lead with a live Starter order plus a separate refunded/disputed Growth/Complete/Commerce order was permanently blocked from the Starter→MRR upsell nudge even though that order grants zero live entitlement. Added isLiveRecurringOrder (orderEligibleForBillingPortal && !isOrderRefunded && !isOrderDisputed) for this exclusion only — deliberately not orderGrantsSoldCapabilityEntitlement, which also excludes a merely-canceled order and would wrongly un-block the upsell for a former (not refunded) subscriber.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "claude/upbeat-dijkstra-ooowlb",
  },
  {
    id: "billing-notice-pause-recipient-write-before-read-fix",
    summary:
      "Regression from billing-notice-entitlement-selection (#389): that PR switched all four Stripe webhook billing-notice recipient lookups from orderHadRecurringEntitlement to orderGrantsSoldCapabilityEntitlement uniformly, but two of the four call sites (customer.subscription.updated pause_collection branch, invoice.payment_failed dunning) call markOrdersRecurringCanceledByCustomer (which SETS recurringCanceledAt on the matching order) and only THEN re-read that same order via getOrdersByStripeCustomerId to pick a recipient. orderGrantsSoldCapabilityEntitlement requires recurringCanceledAt to be unset, so it always rejected the very order the pause write had just touched — orders.find always returned undefined and sendSubscriptionPausedNotice/sendPaymentFailedNotice silently never fired in production, even though both features were merged, unit-tested, and marked status=done. The two resume-direction sites (subscription.updated grants branch, invoice.paid) are unaffected — they call clearOrdersRecurringCanceledByCustomer before the same re-read, so recurringCanceledAt is correctly unset by the time orderGrantsSoldCapabilityEntitlement runs. Existing tests passed anyway because route.test.ts mocks @/lib/db wholesale — the pause-notice test fixtures for getOrdersByStripeCustomerId omitted recurringCanceledAt entirely, a state that can never occur immediately after the pause write in real SQLite/Convex usage. Added orderEligibleForPauseNotice (src/lib/orders/recurring.ts) — orderHadRecurringEntitlement + refund/dispute exclusion, deliberately ignoring recurringCanceledAt — and swapped it in at the two pause-direction call sites only; the two resume-direction call sites keep orderGrantsSoldCapabilityEntitlement unchanged. Fixed the four affected route.test.ts fixtures to include a realistic recurringCanceledAt (matching what the preceding write actually produces) so this regression class cannot silently reappear.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "claude/nice-euler-fnq49q",
  },
  {
    id: "post-pause-recipient-fix-clean-audit-0718",
    summary:
      "Empty-backlog audit after PR #392 (billing-notice-pause-recipient-write-before-read-fix, tip of main). Re-verified from source (not ITERATIONS prose): all four webhook billing-notice recipient-selection sites use the correct predicate for their read timing (orderEligibleForPauseNotice on the two pause-direction sites, orderGrantsSoldCapabilityEntitlement on the two resume-direction sites); Convex/SQLite parity for getOrdersByStripeCustomerId (index, ordering, API map registration); refund/dispute clawback wiring into pipeline-health + daily digest; sold-capability helper wiring; and orchestration test coverage. Also fetched all remotes — no branch pushed after main's tip, and the sole open PR (#202) remains the same unrelated human-authored draft. No defect found; ran a fresh npm ci + npm test (2013/2013) + npm run lint + npm run build, all clean. Recorded as a clean audit rather than manufactured work, per AGENT_PROTOCOL's own guidance.",
    status: "done",
    owner: "claude/upbeat-dijkstra-q7wwna",
  },
  {
    id: "post-393-sibling-fold-scan-and-audit-0718",
    summary:
      "Empty-backlog audit after PR #393 (tip of main). Unlike prior single-pass fold checks, did a wide manual sibling scan first: fetched every remote (300+ branches across claude/codex/cursor/grok/opencode families) and diffed the ~15 branches whose only commits ahead of main touched real (non-process-log) files. Every one was fully superseded — either main already contains the identical fix via a different convergent commit (webhook bundle/commerce-client-receipt email-send-failure retry in claude/upbeat-dijkstra-ftu6jk + codex/dev-work-webhook-email-retry; oldestMarketingPacksDueAgeHours/oldestClientVoicePacksDueAgeHours refund-dispute gating in claude/upbeat-dijkstra-gipcyc, already covered by #375/#376; billing-notice-entitlement swap in codex/dev-work-billing-notice-entitlement, which would have *reintroduced* the #392 write-before-read bug had it been applied; rate-limit bucket bound in claude/nice-euler-mdquyc + codex/dev-work-rate-limit-bounds; dunning notice in claude/upbeat-dijkstra-yqw6f4; bundle-order dispute tracking in cursor/prompt-process-evolution-67e8) — or the leftover diff was pure speculative type-loosening for a state that cannot occur (claude/nice-euler-eojcaa made OrderRecord.createdAt optional in a helper even though OrderRecord.createdAt is `string`, never optional, in src/lib/orders/types.ts; skipped per this project's no-defensive-code-for-impossible-states convention). The sole open PR (#202) remains the same unrelated human-authored draft. Also skipped claude/relaxed-archimedes-9r5fq6's Gemini→Antigravity CLI workflow migration (CI/CD change requiring a new ANTIGRAVITY_OAUTH_TOKEN secret that hasn't been provisioned — operator-gated, not something to fold blind). With nothing to fold, dispatched a subagent audit scoped to AGENT_PROTOCOL's empty-backlog priority order, explicitly steered away from the axes the last two iterations already re-verified (billing-notice predicate correctness, getOrdersByStripeCustomerId parity specifically, refund/dispute clawback wiring, 'every sold-capability helper is consumed', 'every non-trivial module has tests'). It instead checked: every oldestX/listX helper's wiring into pipeline-health + daily-digest + the dashboard panel (not just getOrdersByStripeCustomerId) — fully consumed; Convex/SQLite parity for commerceOrders.list/listUnpaid/listRefunded/listDisputed, orders.markRecurringCanceledByCustomer/clearRecurringCanceledByCustomer/syncRecurringEntitlementByCustomer, inquiries.listBySlug/listCommerceCheckoutBySlug, checkoutSessions.markCompleteOpenBundleForLead/markCompleteOpenCommerceForLeadSkuCustomer, leads.applyColdDisposition/markLeadPaid — all matched; the security/injection surface (rate-limit coverage on all 9 write endpoints, HTML-escaping coverage in resend.ts/contact route/pack delivery, JSON-LD safety, safeNextPath redirect hardening, the HMAC unsubscribe token, CSV import caps, centralized subject sanitization, no dynamic SQL string interpolation) — clean; and untested-module candidates (db.ts has no direct test but deliberately so — it's server-only and its testable logic is extracted into tested sqlite-row-mapping.ts siblings, documented in /docs/architecture; dashboard/leads/actions.ts is covered by ~20 per-action test files that import it directly; remaining hits are trivial framework-convention files; the repo has zero .test.tsx files anywhere, a uniform existing convention rather than a new gap). No defect found on any axis.",
    status: "done",
    owner: "claude/nice-euler-2p6914",
  },
  {
    id: "post-394-scalability-security-audit-0718",
    summary:
      "Empty-backlog audit after PR #394 (tip of main), same starting point as the prior iteration. Fold scan: fetched all 350+ remote branches and checked merge-base-relative diffs for the branches with real (non-process-log) content — including the two the task brief specifically flagged as plausible unmerged fixes, codex/dev-work-rate-limit-bounds and codex/dev-work-rate-limit-cleanup (bound the in-memory rate-limit bucket Map with MAX_RATE_LIMIT_BUCKETS=10_000 + evictExpiredBuckets/evictOldestBucketIfFull) — both fully superseded, already on main verbatim via PR #378 (fix(security): bound rate limiter state). codex/dev-work-webhook-email-retry (turn best-effort bundle/commerce-client-receipt email sends into required 5xx-on-failure so Stripe redelivers) is also fully superseded — main's route.ts already has emailSendFailed/clientReceiptSendFailed wired to bundle_email_send/commerce_client_receipt_send on both the try and outer-catch paths, a superset of the branch's version (independently convergent, matching #394's finding for the same branch). Every other 0717/0718-dated branch (dev-work-post-dunning-audit-0718, dev-work-empty-backlog-audit-0718, continuous-work-public-input-audit-0717, dev-work-starter-upsell-digest-age, continuous-work-billing-portal-parity) is docs-only (claim/clean-audit entries, no product diff). Nothing to fold. With no fold candidate, picked fresh angles explicitly not covered by #393/#394's audits: (1) rate-limit memory bound — confirmed already fixed and tested (getRateLimiterBucketCountForTests, MAX_RATE_LIMIT_BUCKETS); (2) N+1/index scalability in pipeline-health + daily-digest — every loop in both builders iterates already-bulk-fetched arrays (leads/orders/sessions/inquiries loaded once by sendDailyDigestAction / computePipelineHealth callers), no per-row awaited DB/Stripe call found; (3) CSRF surface — every state-changing dashboard action is a Next.js Server Action, and this fork's own node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverActions.md confirms same-origin enforcement is on by default (next.config.ts sets no experimental.serverActions.allowedOrigins override); the one cookie-authenticated surface (requireOperatorAuth via OPERATOR_SESSION_COOKIE) is sameSite:'lax', which browsers never attach on a cross-site POST, so a forged cross-site form POST cannot ride the operator session; every public route.ts POST (contact, checkout, commerce checkout, billing-portal, preview-open, unsubscribe) is either unauthenticated-by-design + rate-limited or Stripe-signature-verified; (4) SSRF — grepped every fetch() call in src/lib and src/app; the only one with a non-literal URL segment (tryProvisionVercelDomain in src/lib/deploy/handoff.ts) targets a fixed host (https://api.vercel.com/v10/projects/${encodeURIComponent(projectId)}/domains) where only the URL-encoded path segment is operator/lead-adjacent, never the host — no attacker-controlled destination; (5) /docs/launch-checklist accuracy — spot-checked a sample of its referenced action test files, env-readiness function names, and behavioral claims (bootstrap-prices dual path, Commerce SKU cap, per-action fail-closed list) against current source; all match, no stale reference found. No defect found on any axis.",
    status: "done",
    owner: "claude/upbeat-dijkstra-2icoid",
  },
  {
    id: "branded-error-not-found-pages",
    summary:
      "Every prior empty-backlog audit (#392-#395) scoped to money/security/parity/orchestration-test axes and explicitly found those clean; none checked App Router UX-resilience file conventions. grep confirmed zero error.tsx/not-found.tsx/global-error.tsx anywhere under src/app — a stale outreach/preview link, a mistyped custom domain, or any uncaught render exception on this unattended revenue site fell through to Next's generic unbranded 404/error UI with no path back to checkout. Shipped src/app/not-found.tsx (Server Component; handles both notFound() throws — e.g. an unknown /preview/[slug] — and any unmatched URL, since a single root layout means this root file covers the whole app per Next's 'root app/not-found handles global unmatched URLs' convention) and src/app/error.tsx (Client Component error boundary using the Next.js 16.2 unstable_retry API, read from node_modules/next/dist/docs per AGENTS.md before writing — 'reset' still exists but unstable_retry is the now-current documented recovery path). Both reuse the homepage's zinc/rounded-full visual language and link back to / and /checkout so a lost visitor always has a path back to conversion instead of a dead end. No new secrets, no schema change — verified via npm run build (both routes compile, /_not-found included in the route list) + npm run dev (curled an unknown slug and a nonexistent path, confirmed the branded copy and correct link hrefs render, then confirmed the port was freed).",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/nice-euler-ragsj2",
  },
  {
    id: "global-error-root-layout-boundary",
    summary:
      "branded-error-not-found-pages (PR #396) shipped src/app/error.tsx and reasoned that 'a single root layout means one root not-found.tsx/error.tsx covers the entire app' — true for not-found.tsx, but this fork's own node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md is explicit that error.tsx 'does not wrap the layout.js ... above it in the same segment. To handle errors in the root layout, use global-error.js.' src/app/layout.tsx renders SiteHeader/SiteFooter (which call brand.ts / marketingFooterLine()) on every request outside any error.tsx boundary, so a root-layout render throw fell through to Next's generic unbranded fallback — the exact UX-resilience gap #396 otherwise closed. Added src/app/global-error.tsx (Client Component, its own <html>/<body>, imports ./globals.css directly since it fully replaces the root layout while active) reusing the same branded copy/CTA style. Verified live, not just by reading docs: temporarily forced src/app/layout.tsx to throw behind a one-off env flag, confirmed the SSR payload tagged the boundary as {\"type\":\"global-error\",\"pagePath\":\"global-error.tsx\"} (proving Next wired it in) and returned HTTP 500 with the branded markup, then reverted layout.tsx to its exact prior state and re-ran the full suite.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/nice-euler-3zie69",
  },
  {
    id: "test-typecheck-drift-plus-pr-ci-gate",
    summary:
      "Empty-backlog audit after PR #398 (tip of main). npm test/lint/build all green, but a direct npx tsc --noEmit -p tsconfig.json (nothing in this repo runs that — next build's own TypeScript pass and vitest's esbuild transform both skip full-strict test-file checking) surfaced 25 real type errors across 10 *.test.ts files: stale 'new' LeadPipelineStage literals (renamed to 'discovered' long ago), a stale 'social_post' MarketingContentType, object literals with excess/mismatched properties against narrowed helper param types (commerceCatalogs items, orderEligibleForPauseNotice), a vi.fn<[string], Promise<T>>() two-type-argument call using a signature Vitest 4 no longer accepts, and a fakeStripe() test helper whose Partial<StripeBillingPortalClient> override type wasn't deep-partial so passing checkout.sessions.retrieve alone (without listLineItems) type-errored despite the runtime merge already handling it correctly. All 2015 runtime tests passed throughout — this was pure type-level drift, invisible to every command this repo's agents actually run before calling an iteration done. Fixed every test file at the source of the drift, not by loosening any production type. Root cause: no CI ever runs `tsc --noEmit` (or even `npm run build`/`npm test`) on a PR — every other workflow in .github/workflows/ is a scheduled agent run, not a check — so a swarm of concurrent agents each running only their own local sanity pass had no shared gate catching this. Added .github/workflows/pr-checks.yml (lint + typecheck + test + build on every PR/push to main) so this class of drift fails visibly instead of silently accumulating across dozens of concurrent agent branches.",
    status: "done",
    owner: "claude/upbeat-dijkstra-obken3",
  },
  {
    id: "homepage-social-share-metadata",
    summary:
      "Empty-backlog audit after PR #399 (tip of main). src/app/layout.tsx's static metadata export (used by the homepage and every page that doesn't define its own generateMetadata — /checkout, /docs/*, /privacy, /terms, /dashboard/*) had title + description only, no openGraph/twitter/canonical — unlike /preview/[slug], the only other metadata-exporting file, which already sets all three. Sharing the homepage or checkout link on social/chat apps (Slack, iMessage, X, LinkedIn) unfurled with no title, no description, no link preview at all — a real, previously-unaudited drag on organic/word-of-mouth growth for a site meant to acquire paying customers directly, not only via cold outreach.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/nice-euler-megcqq",
  },
  {
    id: "db-convex-sqlite-not-found-parity",
    summary:
      "db.ts's updateLeadStage and recordLeadOutreach SQLite fallbacks now throw `Lead with slug ${slug} not found` on an unknown slug, matching their convex/leads.ts twins (updateStage, recordOutreach) and every sibling lead-mutation helper in db.ts (updateLeadNotes, updateLeadSnooze, applyColdLeadDisposition) that already did. Not reachable via the dashboard today (every caller pre-checks lead existence), but the two backends must agree on what \"success\" means for any future caller.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/upbeat-dijkstra-xyl3dp",
  },
  {
    id: "marketing-automation-docs-content-type-sync",
    summary:
      "Flagged by claude/upbeat-dijkstra-xyl3dp's db-convex-sqlite-not-found-parity iteration but deliberately left unfixed: /docs/marketing-automation's Content types table and Automation levels list were stale against src/lib/marketing/monthly-pack.ts and src/lib/pricing/bundles.ts. Shipped: table now lists the exact MONTHLY_MARKETING_PACK_TYPES set (2 GBP posts, 3 Facebook captions, 3 Instagram captions, 1 email campaign, 1 review-request email) instead of a generic/undercounted 'Social captions 4/mo' + a nonexistent 'Seasonal promos' row; Automation levels no longer claims a nonexistent 'Generate-only $49 one-time copy pack' tier or that Growth/Complete already auto-schedule/optimize (Buffer/GBP/Meta posting is still OAuth-gated per marketing-content-scheduling for both tiers alike).",
    status: "done",
    phase: "Phase 6 — Marketing automation",
    owner: "claude/nice-euler-wrym4s",
  },
  {
    id: "ci-nvmrc-node22-sqlite-fix",
    summary:
      "Bug found via audit subagent: .nvmrc pinned Node 20, and pr-checks.yml / claude-scheduled.yml / codex-scheduled.yml all resolve their Setup Node step from node-version-file: .nvmrc — but src/lib/db.ts imports node:sqlite, which does not exist before Node 22.5. At least 8 prior ITERATIONS entries independently rediscovered 'Node 20 cannot load node:sqlite' and manually re-ran build/test under a locally-available Node 22 runtime, without ever fixing the root pin. This was low-stakes while it only cost an agent a manual nvm switch, but pr-checks.yml (added in test-typecheck-drift-plus-pr-ci-gate) is the first PR-blocking check in this repo — once github-actions-runner-unavailable (still failing as of this iteration, reverified) is resolved by the operator, every PR's CI would hard-fail on `node:sqlite` module-not-found regardless of code correctness. Shipped: bumped .nvmrc to 22 and package.json engines.node to >=22.5.0 (package-lock.json's root engines block regenerated via `npm install` to match — no dependency version changes). No other workflow file runs setup-node.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/upbeat-dijkstra-veu460",
  },
  {
    id: "docs-canonical-self-reference-fix",
    summary:
      "Bug found via direct source read (not a subagent audit this time): every sitemap-listed static page except the homepage (all 12 /docs/* sub-pages, /docs itself, /checkout, /privacy, /terms — 16 of the 17 STATIC_ROUTES entries) exported no generateMetadata of its own, so it silently inherited the root layout's homepageMetadata() verbatim — not just a duplicate/generic <title>, but alternates.canonical pointing at siteUrl() (the bare homepage root) on every single one of those 16 pages. A wrong self-canonical is worse than a missing one: it actively tells crawlers 'index the homepage instead of me,' directly undermining sitemap-docs-route-sync (PR #397), whose entire point was getting docs pages indexed.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/nice-euler-cpjie0",
  },
  {
    id: "post-canonical-fix-fold-scan-and-audit-0718",
    summary:
      "Empty-backlog audit after PR #405 (docs-canonical-self-reference-fix, tip of main). Fold scan re-confirmed the five newest remote branches are the exact source branches of already-merged PRs #401-#405, and the three lingering codex/* branches remain either fully superseded or unsafe-to-fold (would reintroduce the #392 write-before-read regression). Hit and documented a real process gotcha along the way: this session's local `main` git ref was stale by dozens of commits, which made every recently-merged sibling branch falsely look like a huge divergent diff during the fold scan — fixed via `git fetch origin main:main` and recorded as a new AGENT_PROTOCOL bullet so future sessions don't burn budget on the same false positive. Direct-source-read audit (as const success literals, dangerouslySetInnerHTML sink, rate-limit bucket bound, unsubscribe HMAC token, SQLite/Convex schema field parity across 5 money-adjacent tables) found no defect. Recorded as a clean audit.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/upbeat-dijkstra-xlmcnf",
  },
  {
    id: "csv-import-error-message-misattribution-fix",
    summary:
      "A dedicated research subagent (dispatched during the same empty-backlog run as post-canonical-fix-fold-scan-and-audit-0718, after exhaustively checking CSV parsing itself, voice-pack delivery parity, and money/float handling as clean) found a real, previously-unaudited bug adjacent to csv-lead-import: importLeadsCsvAction's upsertErrors array already carries each row's specific, correct reason (invalid category, missing/over-long businessName, existing-slug collision, per-row write failure — each worded distinctly by parseLeadsCsv / existingLeadSlugConflictMessage / the upsert catch branch), but leads-client.tsx's success-path summary collapsed the whole array down to a single hardcoded sentence — '{N} row warning(s) — existing slugs are not overwritten' — regardless of what actually happened. A CSV row rejected for a typo'd category or a missing businessName was reported to the operator using the same, factually wrong 'existing slugs are not overwritten' explanation as an actual slug collision. The operator has no way to distinguish 'a duplicate was correctly protected' (nothing lost, safe to ignore) from 'a fixable typo silently dropped a row' (lead permanently lost unless re-uploaded) — and the displayed text actively asserts the wrong one for every non-collision error.",
    status: "done",
    phase: "Phase 4 — Data ingestion",
    owner: "claude/upbeat-dijkstra-xlmcnf",
  },
  {
    id: "convex-orders-recurring-entitlement-duplicate-fix",
    summary:
      "After all three targeted audits below came back clean (sold-capability wiring, Convex/SQLite parity on the dunning-notice code, security on the newest webhook/email code), a fourth pass on the 'untested orchestration modules' axis found that convex/orders.ts defined its own private, unexported copy of orderHadRecurringEntitlement instead of importing the canonical, unit-tested version from src/lib/orders/recurring.ts — a real drift risk (vitest.config.ts's test.include never covers convex/*.ts at all, so a future fix to the canonical predicate that wasn't hand-mirrored into this duplicate would silently desync Convex from SQLite/webhook behavior with no test ever catching it). Fixed by deleting the duplicate and importing the shared function via a relative path (Convex's bundler supports importing plain, Node-API-free TS from outside convex/ — recurring.ts and its sole dependency ./types have no server-only/Node imports). This is the more durable fix than adding a regression test asserting the two copies match, since there is now only one implementation to drift.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/nice-euler-wz2vv2",
  },
  {
    id: "convex-server-side-test-coverage",
    summary:
      "Follow-up flagged (not attempted) by convex-orders-recurring-entitlement-duplicate-fix: convex/*.ts's own idempotency/entitlement logic had zero direct test coverage — vitest.config.ts's test.include never touched convex/. Shipped: convex-test devDependency, vitest.config.ts widened to convex/**/*.test.ts, and direct coverage for the two money-critical modules (orders.ts, commerceOrders.ts) — createOrder/insert idempotency on stripeSessionId, markRecurringCanceledByCustomer/clearRecurringCanceledByCustomer/syncRecurringEntitlementByCustomer's entitlement-gating + idempotency, and markRefunded/markDisputed/clearDisputed/markPaidOut's independence + idempotency. Discovered en route: convex/_generated/api.ts's hand-rolled `api` proxy (function-typed Proxy target) is not a faithful stand-in for real Convex codegen output — convex-test's `typeof functionReference === \"function\"` branch mistook it for an inline test handler and silently invoked the empty proxy stub instead of the real convex/*.ts handler, so every assertion silently saw `null`/`undefined` with zero thrown error. Confirmed this file has no production consumer (src/lib/db.ts keeps its own separate plain-string \"leads:list\"-style API map, which convex/browser's ConvexHttpClient already accepts directly) before touching it, so the fix (swap the hand-rolled proxy for the real `anyApi` from convex/server) is test-tooling-only, not a production behavior change.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/upbeat-dijkstra-qsuf3a",
  },
  {
    id: "convex-deploy-handoff-status-rank-duplicate-fix",
    summary:
      "Audit subagent scoped to the 8 still-untested convex/*.ts modules (checkoutSessions, deployHandoffs, inquiries, leads, marketingPacks, clientVoicePacks, commerceCatalogs, suppressions — everything except orders.ts/commerceOrders.ts, which got direct convex-test coverage in convex-server-side-test-coverage) found the same duplication bug class convex-orders-recurring-entitlement-duplicate-fix fixed once already: convex/deployHandoffs.ts forked its own private copy of HANDOFF_STATUS_RANK + preferAdvancedHandoffStatus instead of importing the canonical, unit-tested version from src/lib/deploy/handoff-preserve.ts, with an inline comment claiming 'Convex cannot import src/lib' — disproven by convex/orders.ts's own precedent (a relative import of a pure, `@/`-alias-free module). handoff-preserve.ts and its sole dependency (./types, zero imports) fit that same shape. The two copies were byte-identical at audit time (no live divergence yet), but this is exactly the drift-risk pattern flagged before: vitest.config.ts's test.include only reaches convex/*.test.ts files that exist, so a future change to the canonical rank table (a new DeployHandoffStatus value, a reordered rank) would silently desync the never-downgrade guard that handoff-email-marker-status-no-downgrade depends on, with nothing to catch it. Fixed by deleting the duplicate and importing preferAdvancedHandoffStatus from src/lib/deploy/handoff-preserve (casting the plain-string Convex schema field to DeployHandoffStatus at the call boundary only, since Convex's status column is v.string() not a literal union) — same durable single-implementation fix as the orders.ts precedent, not a new regression test asserting two copies match.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/nice-euler-bp1wqz",
  },
  {
    id: "convex-leads-checkout-sessions-test-coverage",
    summary:
      "Second slice of the convex-server-side-test-coverage follow-up: shipped convex/leads.test.ts (11 cases) and convex/checkoutSessions.test.ts (6 cases) — the CRM backbone and abandoned-cart-recovery backing store, the two most revenue-core of the 7 convex/*.ts modules still left untested after convex-orders/commerceOrders and convex/deployHandoffs got direct coverage. Cross-checking every exported mutation/query against its src/lib/db.ts SQLite twin found full behavioral parity (existence-check-then-throw on updateStage/recordOutreach/updateNotes/updateSnooze/applyColdDisposition; no-op-not-throw on recordPreviewOpen; empty-string-clears-optional-field semantics; list newest-first / listOpen oldest-first ordering) — but also found a third instance of the exact duplicate-logic drift class convex-orders-recurring-entitlement-duplicate-fix and convex-deploy-handoff-status-rank-duplicate-fix already fixed once each: convex/leads.ts's markLeadPaid forked its own private copy of the payment-stub businessName-from-slug derivation and the full stub lead field defaults, with a comment explicitly flagging (but never resolving) that it must be hand-kept in sync with src/lib/leads/payment-stub.ts's buildPaymentStubLeadFields — the exact canonical helper src/lib/db.ts's own SQLite fallback (recordLeadPayment) already imports and calls directly. Fixed by importing buildPaymentStubLeadFields into convex/leads.ts (a relative import; the module has zero imports of its own, the same @/-alias-free, server-only-free shape as the two prior precedents) and replacing the inline stub-object literal with a direct call to it.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/upbeat-dijkstra-6xtpuq",
  },
  {
    id: "convex-inquiries-suppressions-test-coverage",
    summary:
      "Third slice of the convex-server-side-test-coverage follow-up: shipped convex/inquiries.test.ts (8 cases) and convex/suppressions.test.ts (3 cases), leaving marketingPacks, clientVoicePacks, and commerceCatalogs as the only convex/*.ts modules still without direct coverage. Cross-checked every exported query/mutation against its src/lib/db.ts SQLite twin: inquiries.ts correctly returns null (never throws) from updateStatus/recordReply on an unknown inquiryId, matching db.ts's updateClientInquiryStatus/recordClientInquiryReply — a deliberate divergence from leads.ts's throw-on-not-found convention, not a bug, since db.ts callers for this surface already treat null as the not-found signal. List ordering confirmed to match db.ts's ORDER BY createdAt DESC across list/listUnreplied/listBySlug/listCommerceCheckoutBySlug. suppressions.ts's email normalization (lowercase+trim) happens once in db.ts before either backend is called, so both convex/suppressions.ts and the SQLite fallback correctly receive pre-normalized input with no duplicated normalization logic to drift. Checked for the inline-reimplementation drift class (convex-orders-recurring-entitlement-duplicate-fix / convex-deploy-handoff-status-rank-duplicate-fix / convex-leads-checkout-sessions-test-coverage's markLeadPaid fix) and found none in either module — no canonical src/lib/ helper is being hand-copied.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/nice-euler-d4yhls",
  },
  {
    id: "convex-marketing-voice-commerce-catalog-test-coverage",
    summary:
      "Fourth and final slice of the convex-server-side-test-coverage follow-up chain: shipped convex/marketingPacks.test.ts (4 cases), convex/clientVoicePacks.test.ts (4 cases), and convex/commerceCatalogs.test.ts (4 cases) — every convex/*.ts module now has direct test coverage. Cross-checked all three against their src/lib/db.ts SQLite twins: month-keyed upsert-replace for marketing packs vs. lead-keyed upsert-replace for client voice packs and commerce catalogs, generatedAt/updatedAt DESC list ordering on all three, and commerce catalog upsert round-tripping stripeProductId/stripePriceId when the caller passes them through (preserveCommerceStripeIds lives one layer up in saveCommerceCatalogAction, not duplicated in the Convex handler itself) — full parity, no divergence found. Checked for the inline-reimplementation drift class found 3 times already in this chain (orders.ts, deployHandoffs.ts, leads.ts) and found none: all three of these modules are thin CRUD handlers with no derivation/business logic to hand-copy from src/lib/.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/upbeat-dijkstra-au9gso",
  },
  {
    id: "stage-change-optimistic-revert-race",
    summary:
      "Dashboard leads-client.tsx's handleStageChange has no in-flight guard: an operator can trigger a second stage change on the same row before the first call's server response lands. If responses resolve out of order and the FIRST call fails after the SECOND already succeeded and persisted, the unconditional revert stomped the row back to the first call's stale pre-update snapshot — discarding the real, already-committed stage in the UI. Because updateLeadStageAction unconditionally re-sends Email 1 + resets outreachStep whenever stage is set to outreach_sent, an operator trusting a clobbered-stale UI could re-trigger a real duplicate send. Fixed: revertSingleLeadOptimisticUpdate now takes the exact optimistic Lead object reference this call wrote into state and only reverts when the row still holds that same reference (i.e. nothing else has touched it since) — a later, overlapping call's success is preserved instead of clobbered.",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "claude/nice-euler-v78s2l",
  },
  {
    id: "convex-deploy-handoffs-test-coverage",
    summary:
      "Empty-backlog audit (all product-facing NEXT_STEPS gated) dispatched 3 parallel audit passes — sold-capability wiring (clean), security on the newest ~30 commits (clean) — and a Convex/SQLite parity + untested-orchestration pass, which found that convex/deployHandoffs.ts was the one remaining convex/*.ts module with zero direct test coverage after convex-server-side-test-coverage's 4-slice chain covered every other module. It also carries the highest-risk logic in convex/ untouched by any test: preferAdvancedHandoffStatus's atomic never-downgrade merge (updateStatus), replace-based optional-field clearing on updateVercelProject/updateCustomDomain, and a private inline host-normalizer in updateCustomDomain that looks like the same duplication-drift bug class fixed 3 times already (orders.ts, deployHandoffs status-rank, leads.ts markLeadPaid) — but isn't: the canonical normalizeOperatorCustomDomainHost (src/lib/deploy/custom-domain-routing.ts) transitively imports the `@/` alias via slug-path.ts, which convex/tsconfig.json does not map, so the inline copy is the only option (verified before touching it). Shipped convex/deployHandoffs.test.ts (10 cases) covering upsert insert/replace-keeps-handoffId/clears-omitted-optionals, getByLeadSlug/list ordering, getByCustomDomain (empty-string no-match, unknown-host miss), updateStatus's never-downgrade + advance + unknown-lead-null, and updateVercelProject/updateCustomDomain's set/clear/normalize/unknown-lead-null paths.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/upbeat-dijkstra-7eexm4",
  },
  {
    id: "commerce-payouts-panel-order-count-drift",
    summary:
      "Empty-backlog audit after PR #415 (daily-digest-button-item-count-drift, tip of main). Dispatched a research subagent seeded toward the standing client-side (no @testing-library/react) blind spot after the other cooperation-priority tiers (sold-capability wiring, Convex/SQLite parity, security, untested orchestration) had each been exhaustively re-audited clean across dozens of prior iterations today. Found the same bug class daily-digest-button-item-count-drift had just fixed in a different component: the dashboard's Commerce payouts (manual) panel header (src/app/dashboard/leads/leads-client.tsx) showed `({commerceOrders.length} orders)`, where commerceOrders is the raw mergeCommerceOrdersForReview(unpaid, refunded, disputed) feed across every lead — but the list actually rendered below it only shows commercePayoutsByLead, the subset of per-lead summaries that pass commerceOrdersByLeadSummaryNeedsAttention (unpaidCount > 0 OR a clawback-needed order). A Buy now order refunded or disputed before it was ever marked paid out owes the client nothing and is correctly excluded from both unpaidCount and clawback, so its lead's summary is filtered out of the visible list — but the order itself still arrived via listCommerceOrdersRefunded()/listCommerceOrdersDisputed() into the merged feed, so the header count kept growing forever from ordinary, fully-resolved refunds/disputes while the list below showed only leads actually needing action, eroding operator trust in the exact widget meant to prevent double-pay or a missed clawback.",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "claude/upbeat-dijkstra-kn4pn8",
  },
  {
    id: "subscription-pause-collection-notice-redelivery-dedup",
    summary:
      "Empty-backlog audit after PR #416 (commerce-payouts-panel-order-count-drift, tip of main). With the client-side header-count-drift blind spot re-audited clean across all 10 'use client' components, dispatched a research subagent through the cooperation-priority fallback tiers (sold-capability wiring, security, untested orchestration) toward tier 2 (Convex/SQLite parity + webhook idempotency), which found that customer.subscription.updated's pause_collection customer notice (subscription-pause-collection-notice) was not redelivery-idempotent: unlike its resume-direction sibling (gated on `cleared > 0`) and invoice.paid's payment-recovered notice (gated on `cleared > 0`), the pause-direction sendSubscriptionPausedNotice call was gated only on Stripe's own event.data.previous_attributes containing a pause_collection key — which stays true on every redelivery of the identical event (previous_attributes is baked into the event payload, not re-derived per delivery attempt). Stripe redelivers an event verbatim when our handler is slow or errors before returning 200 (up to 3 days of retries), so a slow first delivery that nonetheless completed the durable CRM pause write would double-email 'your billing is now paused' on redelivery even though markOrdersRecurringCanceledByCustomer's own WHERE-recurringCanceledAt-IS-NULL clause made the write itself correctly idempotent (0 rows updated on replay). Deliberately did NOT apply the same fix to invoice.payment_failed's dunning notice (recurring-payment-failed-dunning-notice) — that path's existing comment documents an intentional design choice (Stripe fires a new invoice.payment_failed per Smart Retry attempt, so it resends once per attempt with no dedup marker by design); gating it on `updated > 0` would have been a regression, silently dropping the notice on a legitimate second/third retry attempt once the order was already paused from the first attempt in the same dunning sequence.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "claude/nice-euler-nsuymo",
  },
  {
    id: "recurring-entitlement-paused-dashboard-panel",
    summary:
      "Empty-backlog audit after PR #417 (subscription-pause-collection-notice-redelivery-dedup, tip of main). Dispatched a research subagent through the cooperation-priority tiers with explicit instructions to avoid every axis already covered today (sold-capability wiring, security, the completed convex-server-side-test-coverage chain, and the header-count-vs-rendered-list bug class fixed twice already). It found a real, previously-unaudited gap in the sold-capability three-surface rollout pattern this codebase otherwise follows consistently (pipeline-health card + daily-digest section + leads-client.tsx per-lead panel — see e.g. commerceCatalogsMissing, starterUpsellCandidates, abandonedCheckoutsDue, followUpsDue, coldLeads): listRecurringEntitlementPaused (src/lib/orders/recurring.ts) — paid/live Growth/Complete/Commerce leads whose recurring entitlement is paused/canceled and need Billing Portal MRR recovery — was wired into pipeline-health.ts (aggregate MetricCard, count + oldest-age only) and daily-digest.ts (a real per-lead list, but capped at 5 and only reaches the operator via the emailed digest), but had zero references anywhere in leads-client.tsx. An operator viewing the live dashboard after a card decline saw '2 subscribers have paused or canceled recurring entitlement' with no way to identify which two without waiting for or digging up the daily digest email — every sibling due-queue gets a persistent, live, per-lead panel with an action button; this was the only one that didn't. Independently re-verified before fixing: confirmed via grep that leads-client.tsx had no recurringCanceledAt/recurringEntitlementPaused reference, confirmed listRecurringEntitlementPaused already returns full per-lead detail (slug, businessName, stage, pausedAtMs, hasStripeCustomerId) suitable for direct rendering with no new derivation needed, and confirmed orderEligibleForBillingPortal (the existing Manage billing gate) checks only tier/commerceAddon — not pause state — so the existing handleOpenBillingPortal action Just Works for a paused lead with no change needed on the action side.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "claude/upbeat-dijkstra-3w0yyt",
  },
  {
    id: "commerce-catalogs-unsynced-dashboard-panel",
    summary:
      "Picked up as a scheduled routine after PR #418 (recurring-entitlement-paused-dashboard-panel, tip of main). All five NEXT_STEPS items stayed operator/legal/infra-gated (stripe-price-objects, lead-ingestion, marketing-content-scheduling, commerce-payouts-stripe-connect, github-actions-runner-unavailable). Dispatched a research subagent through the cooperation-priority tiers, seeded to check the sold-capability three-surface rollout pattern (pipeline-health card + daily-digest section + leads-client.tsx per-lead panel) against every due-queue helper, the same axis recurring-entitlement-paused-dashboard-panel just closed one gap on. It found the exact same bug class recurring-entitlement-paused-dashboard-panel had just fixed, on a different helper: listCommerceCatalogsUnsynced (src/lib/commerce/catalog.ts) — paid/live Commerce leads whose saved catalog has ≥1 SKU still missing a Stripe Price, meaning Buy now silently doesn't work for that item — was wired into pipeline-health.ts (commerceCatalogsUnsyncedCount metric card) and daily-digest.ts (a real per-lead 'Commerce Sync to Stripe due' section), but had zero references in leads-client.tsx, unlike its sibling listCommerceCatalogsMissing which already gets a full per-lead panel there. The pipeline-health-panel copy for this metric even said 'open the catalog editor on /dashboard/leads' with no named panel to point to, unlike the missing-catalog copy which names its panel explicitly. Independently re-verified before fixing: grepped leads-client.tsx for 'unsync' (zero matches) to confirm the gap was real, read listCommerceCatalogsUnsynced's signature and confirmed it returns full lead objects needing no new derivation, and confirmed the existing handleSyncCommerceCatalogToStripe(slug) action handler (already used inside the per-lead catalog editor) works standalone without requiring the editor to be open first — so the new panel's Sync to Stripe button could call it directly.",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "claude/nice-euler-rqnhsw",
  },
  {
    id: "marketing-voice-packs-due-dashboard-panels",
    summary:
      "Picked up as a scheduled routine after PR #420 (agent-protocol-current-state-fifth-gated-item, tip of main). All five NEXT_STEPS items stayed operator/legal/infra-gated. Dispatched a research subagent seeded toward the sold-capability three-surface rollout pattern (pipeline-health card + daily-digest section + leads-client.tsx per-lead panel) that the two prior iterations had each closed one gap on. It found two more instances at once: listMarketingPacksDue (src/lib/marketing/monthly-pack.ts) and listClientVoicePacksDue (src/lib/voice/faq-pack.ts) each had the pipeline-health card and the daily-digest section, but zero references in leads-client.tsx — unlike every sibling due-queue. The pipeline-health-panel footnote for marketing packs due even already said 'generate from the Marketing packs panel on /dashboard/leads', naming a panel that did not exist. Independently re-verified before fixing: grepped leads-client.tsx for both helper names (zero matches), read both signatures and confirmed neither needs new derivation (leads already have marketingPacks/clientVoicePacks state in scope), and confirmed the existing standalone handleGenerateMarketingPack(slug)/handleGenerateClientVoicePack(slug) action handlers (already used inline on the leads table) work without requiring any other UI to be open first.",
    status: "done",
    phase: "Phase 6 — Marketing automation",
    owner: "claude/nice-euler-cydtkl",
  },
  {
    id: "bundle-order-refund-dispute-dashboard-panel",
    summary:
      "Bundle (Starter/Growth/Complete) order refunds/disputes had a pipeline-health MetricCard and a daily-digest section, but zero per-lead visibility in leads-client.tsx — unlike their Commerce Buy now twin. Added a read-only, rose-themed panel naming the affected lead/tier/amount, mirroring the existing per-lead due-queue panels. Visibility only, no clawback UI (bundle revenue is never manually disbursed).",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "claude/upbeat-dijkstra-j1pxt2",
  },
  {
    id: "stripe-webhook-rate-limit",
    summary:
      "/api/stripe/webhook was the one public write route with no checkRateLimit gate, despite AGENT_PROTOCOL documenting the rollout as covering every public write route (contact, checkout create, commerce checkout create, billing portal, bootstrap-prices, unsubscribe). It's also the one route deliberately exempt from the whole-body byte ceiling (Stripe signs the raw payload — see src/lib/security/json-body.ts), and that documented size-cap exception appears to have been mistaken for a blanket 'out of scope' on this route, so the rate-limit half of the hardening pass never landed here. Net effect: any caller (not just Stripe — this is a signature-verified but otherwise public endpoint at a conventional, documented path) could flood it with unbounded POSTs, each fully buffered via request.text() and HMAC-checked, before rejection. Added the same checkRateLimit/clientIpFromHeaders gate every sibling route uses, checked right after the env-config check and before request.text() so a flood 429s before any body buffering or signature work. Sized generously (120/60s, vs. DEFAULT_RATE_LIMIT's 20/60s) since a real merchant can burst many legitimate events at once and a false-positive 429 is safe here — Stripe retries failed webhook deliveries with backoff.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "claude/nice-euler-2xh6wc",
  },
  {
    id: "paid-not-live-dashboard-panel-and-remedy",
    summary:
      "pipeline-health's paidNotLiveCount and the daily digest's paidNotLive section (leads at stage=paid) had zero per-lead visibility or remedy in leads-client.tsx, unlike every sibling due-queue that already got a per-lead panel (recurringEntitlementPaused, commerceCatalogsUnsynced, marketingPacksDue/clientVoicePacksDue, bundle order refunds/disputes). Worse than a missing list: a lead promoted to paid via the stage dropdown or CSV import (not a Stripe checkout) has no deploy_handoffs row at all, and enqueueProductionHandoff is otherwise only ever invoked from the Stripe webhook — markHandoffLiveAction explicitly requires a pre-existing handoff and no-ops otherwise, so there was no in-app path to fulfillment for that lead. Added the per-lead panel (derived from existing leads+handoffs props, no new data load) plus a new createDeployHandoffForLeadAction that reuses enqueueProductionHandoff (with DEPLOY_HANDOFF_CONVEX_PRIMARY, matching the Mark live/assign-project/assign-domain operator-action precedent) to create the missing handoff from the lead's own recommendedTier/email when none exists yet.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "claude/upbeat-dijkstra-qaj4qg",
  },
  {
    id: "stripe-product-price-reactivate-on-resync",
    summary:
      "src/lib/commerce/stripe-sync.ts's findProductByKey/findMatchingPrice scoped their idempotency lookup to active: true only. Any Product or Price that ever goes inactive by a means outside this module's control — an operator archiving it directly in the Stripe Dashboard (a normal Stripe workflow), or this app's own Archive orphan Stripe products action archiving a SKU id that later gets reintroduced — becomes permanently invisible to that same lookup on every future Sync to Stripe re-run, so re-syncing silently mints a duplicate Product/Price under the identical 'stable' local_site_studio_key metadata this codebase documents as a unique idempotency key, rather than reactivating the original. Worse: the orphaned inactive original is also invisible to listOrphanCommerceStripeProducts (same active:true scope), so it can never be cleaned up either — every archive-then-resync cycle for that key mints another permanent zombie Product. syncCommerceCatalogToStripeAction's own Convex-write-failure error message even tells the operator to 'Retry Sync to Stripe (idempotent)', a guarantee this bug silently broke. Fixed by listing both active and inactive Products/Prices when matching by key/amount and reactivating (products.update/prices.update with active: true) a matched-but-inactive result instead of creating a new one; listOrphanCommerceStripeProducts deliberately keeps its active:true scope (archiving candidates must already be active).",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "claude/nice-euler-hi2hsg",
  },
  {
    id: "commerce-draft-items-cross-lead-clobber",
    summary:
      "leads-client.tsx's Commerce catalog editor draft (commerceDraftItems) is a single non-keyed useState slot shared across every lead row, paired with commerceEditSlug to say which lead currently owns it. handleSyncCommerceCatalogToStripe(slug) is called from two places: inside the open editor (always the owning lead, safe by construction) and from the standalone 'Commerce catalogs unsynced' panel (shipped in commerce-catalogs-unsynced-dashboard-panel), which can sync a *different* lead than whichever one's editor happens to be open — and it unconditionally overwrote commerceDraftItems on success with no check that the synced slug matched the open editor. Concrete failure: operator opens Lead A's catalog editor with unsaved edits, then clicks Sync to Stripe for Lead B from the unsynced panel without closing A's editor; B's items silently load into the still-open, still-labeled-A editor, and a subsequent Save catalog persists Lead B's SKU names/prices under Lead A's slug — silent cross-tenant storefront corruption visible to Lead A's own end customers, with no error at any step. Fixed by only applying the synced items to the draft when the synced slug matches commerceEditSlug.",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "claude/upbeat-dijkstra-3bbyox",
  },
  {
    id: "csv-import-stray-quote-field-start-guard",
    summary:
      "csv-lead-import's splitCsvIntoLines/parseCsvLine (src/lib/leads/csv-import.ts) toggled quote-mode on ANY '\"' character, not only one at the start of a field, contrary to RFC 4180 §2(5). A single unescaped mid-field quote — a completely ordinary value like a business name of 72\" TV Mounting Pros or a 6' Fence Co with an inch mark, no surrounding quotes — left inQuotes stuck true for the rest of the file: splitCsvIntoLines then swallowed that row's own trailing newline as 'inside a quoted field', silently concatenating the NEXT lead's entire row onto the corrupted one, shifting/absorbing that row's commas and dropping the merged lead from the import with no operator-visible error (parseCategory/parseLeadHours degrade gracefully on missing/garbled fields rather than raising). CSV import is the only lead-ingestion path not legal/infra-gated (Places API ingestion stays todo), making this the platform's primary at-scale lead-volume path. Fixed by only entering quote mode when '\"' is the first character of a field (immediately after a comma or at row start) in both functions — a later mid-field '\"' is now a literal character in the output, matching what a human pasting a hand-typed or spreadsheet-exported CSV actually intends.",
    status: "done",
    phase: "Phase 4 — Data ingestion",
    owner: "claude/upbeat-dijkstra-3bbyox",
  },
  {
    id: "open-deploy-handoff-staleness-signal",
    summary:
      "pipeline-health's openHandoffCount and the daily digest's 'Production handoffs open' section rendered a bare count with no 'oldest Xh' staleness signal — the only two due-queues on the summary-card grid (alongside paidNotLive) violating the AGENT_PROTOCOL invariant that every fulfillment/money due-queue carries an oldest-age signal on both dashboard and digest (every sibling: abandoned checkouts, cold leads, follow-ups, marketing/voice packs, commerce catalogs, recurring-entitlement pause, starter upsell, refund/dispute clawbacks, bundle refunds/disputes, unreplied inquiries already do). Without it, an operator triaging fulfillment debt could not see whether a paid site had been awaiting DNS/Mark live for 3 hours or 3 weeks — the exact signal that ranks post-payment SLA breaches (refund/chargeback risk) against fresher work. Added oldestOpenHandoffAgeHours to PipelineHealth + DailyDigest, anchored to the oldest open (status !== live) deploy_handoffs row's createdAt (every handoff row has createdAt; live rows are excluded from the anchor even when older, since they are no longer open debt), surfaced on the 'Open deploy handoffs' MetricCard hint and the digest section header. paidNotLive was deliberately left for a separate iteration: its natural anchor is 'time since payment', but a lead can reach stage=paid via the dashboard stage dropdown / CSV backfill with no order and no stage-transition timestamp, so its anchor needs a design decision this narrow fix does not.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/nice-euler-iiim3y",
  },
  {
    id: "paid-not-live-staleness-signal",
    summary:
      "Deferred half of open-deploy-handoff-staleness-signal: pipeline-health's paidNotLiveCount and the daily digest's paidNotLive section were the last due-queue on the summary-card grid still rendering a bare count with no 'oldest Xh' staleness signal, after openHandoffs closed its half. The open design question was what anchors 'time since payment' for a stage=paid lead with no order row (created via the dashboard stage dropdown or a CSV backfill) — Lead itself carries no createdAt/updatedAt/stage-transition timestamp (checked src/lib/leads/types.ts directly; confirmed no such field exists). Resolved by NOT inventing a fake anchor: added oldestPaidNotLiveAgeHours(candidates, orders, nowMs) which anchors to the oldest bundle order among the paid-not-live lead set (by leadSlug match) and silently skips a candidate lead with no matching order from the age computation — the same skip-if-no-anchor contract oldestColdLeadAgeHours already uses for a lead with no lastOutreachAt, and oldestMarketingPacksDueAgeHours/oldestStarterUpsellCandidateAgeHours already use for a lead with no qualifying order. paidNotLiveCount itself is unaffected — every stage=paid lead is still counted; only the staleness signal is order-anchored. Surfaced on the 'Paid, not live' MetricCard hint and the digest's 'Paid, not yet live (N · oldest Xh)' section header, matching the exact suffix format open-deploy-handoff-staleness-signal established. Deliberately did not touch leads-client.tsx's per-lead paid-not-live panel (paid-not-live-dashboard-panel-and-remedy) — the sibling openHandoffs fix also stayed scoped to pipeline-health.ts + daily-digest.ts + the MetricCard hint only, not the per-lead dashboard panel, so this stays symmetric with that precedent rather than scope-creeping into new panel UI.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "claude/upbeat-dijkstra-j50vht",
  },
  {
    id: "stripe-webhook-rate-limit-post-verify",
    summary:
      "Security audit found stripe-webhook-rate-limit (PR #423) checked checkRateLimit(`stripe-webhook:${clientIp}`) BEFORE stripe.webhooks.constructEvent — and clientIpFromHeaders derives its key from the attacker-controllable x-forwarded-for/x-real-ip headers. Stripe publishes its webhook-sending IP ranges, so an attacker could impersonate one of those IPs, flood garbage POSTs that fail signature verification, exhaust the `stripe-webhook:<that ip>` bucket, and have Stripe's own real redeliveries from that same IP land in the identical already-exhausted bucket and get 429'd before their valid signature was ever checked — turning a volumetric-abuse guard into an on-demand denial of real fulfillment (checkout completion, deploy handoff, receipts). Fixed by moving the rate-limit check to after constructEvent succeeds: an attacker without STRIPE_WEBHOOK_SECRET can never reach the gate no matter what IP header they send, so the bucket a real Stripe IP's traffic lands in can no longer be written to by anyone else. The route still pays one request.text() + constructEvent per request before any throttling applies, unchanged from this route's pre-existing documented unbounded-body trade-off (Stripe signs the raw payload; a byte ceiling isn't viable per src/lib/security/json-body.ts's own doc comment).",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "claude/nice-euler-q6zexu",
  },
  {
    id: "commerce-sku-price-resync-metadata-match",
    summary:
      "Money-correctness audit found the commerce_sku webhook branch validated a Checkout Session's charged Price by exact match against the catalog's *current* stripePriceId/priceCents. Stripe Prices are immutable — an operator editing a Commerce SKU's price and clicking Sync to Stripe mints a brand-new Price id and overwrites the catalog row, but a Checkout Session created before that resync still legitimately references the OLD Price. Completing that session charges real money at the old price, but the webhook rejected it (line items didn't include the *current* catalogPriceId, and amount_total no longer equaled the *current* priceCents), silently dropping a genuinely paid sale from the ledger with no ledger row, no operator inquiry, no client receipt, and no abandoned-recovery retry (the session was already marked complete). Fixed by validating via the stable per-SKU metadata key every Price this platform ever mints for a SKU carries (commerceSkuStripeKey, src/lib/commerce/stripe-sync.ts) instead of the catalog's current Price id, and recording amountPaidUsd from the Session's actual session.amount_total rather than catalogItem.priceCents.",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "claude/nice-euler-q6zexu",
  },
  {
    id: "starter-upsell-billing-portal-mutual-exclusion-restore",
    summary:
      "Money-correctness audit found leadEligibleForStarterUpsell's isLiveRecurringOrder predicate (added by starter-upsell-exclusion-refund-dispute-aware) treated a refunded/disputed Growth/Complete/Commerce order as no longer blocking the Starter upsell, on the theory that it 'grants zero live entitlement.' That reasoning doesn't hold for THIS check: a Stripe refund/dispute is a single-charge event that does not always cancel the underlying Subscription (same fact orderGrantsSoldCapabilityEntitlement already documents for fulfillment gating), and orderEligibleForBillingPortal (which gates 'Manage billing' in the dashboard) never excludes refunded/disputed orders either — so a lead with a live Starter order plus a Growth order disputed WITHOUT canceling the subscription showed both 'Manage billing' and the Starter-upsell CTA simultaneously, and an operator sending that upsell risked creating two simultaneously active recurring subscriptions billing the same customer. Reverted the carve-out — leadEligibleForStarterUpsell now reuses orderEligibleForBillingPortal directly and unmodified, restoring the mutual exclusivity AGENT_PROTOCOL's cooperation rule already mandates.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "claude/nice-euler-q6zexu",
  },
  {
    id: "checkout-session-close-kind-allowlist-parity",
    summary:
      "convex/checkoutSessions.ts's markCompleteOpenBundleForLead closed any row whose kind !== \"commerce_sku\" (a blocklist), while its SQLite twin (db.ts's markCompleteOpenBundleCheckoutSessionsForLead) and its own sibling markCompleteOpenCommerceForLeadSkuCustomer both allowlist. Fixed to allowlist (kind is undefined/\"\"/\"bundle\") on both backends, matching checkoutSessions.kind's actual schema type (a loose v.optional(v.string()), not the closed CheckoutSessionKind union).",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "claude/upbeat-dijkstra-e2icrc",
  },
  {
    id: "inquiry-id-collision-guard",
    summary:
      "Audit found insertClientInquiry's id generator (src/lib/db.ts) was `inq_${leadSlug}_${Date.now()}` — no random component, unlike every sibling app-owned id generator (newCommerceOrderId, newCommerceSkuId both add a Math.random() suffix). Two inquiries for the same lead created in the same millisecond (a contact-form double-submit/retry, or two near-simultaneous commerce_checkout webhook inquiries) mint an identical id; Convex's by_inquiryId `.unique()` lookups (getById/updateStatus/recordReply) throw on the resulting duplicate, permanently orphaning both rows from mark-read/reply/archive. Fixed by extracting newClientInquiryId(leadSlug) into src/lib/inquiries/inquiry-id.ts with the same timestamp+random pattern as its siblings.",
    status: "done",
    phase: "Phase 5 — Production deploy",
    owner: "claude/upbeat-dijkstra-26crsx",
  },
  {
    id: "notes-editor-cross-lead-clobber",
    summary:
      "Audit found leads-client.tsx's notesEditSlug/notesDraft (the operator notes editor's single non-keyed draft-state slot, same shape commerceEditSlug/commerceDraftItems had before commerce-draft-items-cross-lead-clobber) was overwritten unconditionally by openNotesEditor — safe at its manual open/click call site but not at its two soft auto-prompt call sites (handleStageChange on entering discovery_call, handleSendFollowUp on Email 3 landing), which fire on WHATEVER lead the operator just acted on, discarding another lead's in-progress unsaved notes with no warning. Fixed with shouldAutoOpenNotesEditor(currentEditSlug, targetSlug) — the same editingSlug-must-match guard shape as commerceDraftItemsAfterSync — gating both auto-prompt call sites so an action on lead B never steals lead A's open editor.",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "claude/upbeat-dijkstra-26crsx",
  },
  {
    id: "paid-not-live-refund-dispute-age-guard",
    summary:
      "Audit found oldestPaidNotLiveAgeHours (shipped by paid-not-live-staleness-signal) took the minimum createdAt across every order matching a paid-not-live lead's slug with no refund/dispute exclusion — unlike its sibling oldest-age helpers (oldestStarterUpsellCandidateAgeHours via isStarterOnlyOrder) and unlike the revenueTotalUsd loop 27 lines above in the same file, which already gates on orderCountsTowardRevenue. A lead with an old refunded/disputed order plus a genuinely fresh later payment (refunds/disputes are visibility-only and never revert stage) reported a false decades-old staleness signal on both the dashboard MetricCard and the daily digest header instead of the real, recent age. Fixed by widening the function's orders param to carry refundedAt/disputedAt and skipping any order that fails orderCountsTowardRevenue.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "claude/nice-euler-djopck",
  },
  {
    id: "orders-createdat-non-iso-sqlite-fallback",
    summary:
      "Empty-backlog audit (Convex/SQLite parity tier) found recordLeadPayment's SQLite-fallback INSERT INTO orders omitted createdAt entirely, relying on the column's SQL-level default (datetime('now')) — every sibling insert (recordCheckoutSessionCreated, insertClientInquiry, insertCommerceOrder) instead computes new Date().toISOString() in JS and binds it explicitly. SQLite's datetime('now') produces a naive, non-ISO string (\"2026-07-19 12:00:00\", no T/Z) that V8's Date parser reads as LOCAL time rather than UTC — verified directly (TZ=America/New_York: the naive string round-tripped ~4h off from the equivalent ISO string). mapConvexOrderRow already normalizes the Convex numeric epoch via new Date(...).toISOString(), so this was a Convex/SQLite parity gap, not just a formatting nit: every oldest-age staleness signal that reads order.createdAt (pipeline-health, daily digest, starter-upsell, monthly-pack, catalog, faq-pack — 14+ call sites) was silently wrong by the server process's UTC offset whenever a payment was recorded through the SQLite-fallback path (Convex unset, or a Convex failure allowed to fall back). db.ts is \"server-only\" and untestable directly under Vitest (see AGENT_PROTOCOL) and recordLeadPayment is fully mocked in webhook route.test.ts, so no existing test exercised the real INSERT — verified by temporarily neutralizing node_modules/server-only (scratch-only, reverted) to run recordLeadPayment against a throwaway local.db via tsx, confirming the non-ISO string pre-fix and a correct Z-suffixed ISO string post-fix. Fixed by computing createdAt once and binding it into the INSERT alongside the other columns, matching every sibling insert.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "claude/nice-euler-h86qp5",
  },
  {
    id: "marketing-voice-pack-generate-rate-limit-parity",
    summary:
      "Empty-backlog security audit found generateMarketingPackAction and generateClientVoicePackAction (src/app/dashboard/leads/actions.ts) call requireOperatorAuth then an LLM generator with no checkRateLimit — the same auth-alone-is-not-a-throttle gap already fixed for their API-route twin (marketing-generate-rate-limit / POST /api/marketing/generate) but never carried over to these dashboard-native actions performing the identical Anthropic-cost-bearing call. When OPERATOR_DASHBOARD_PASSWORD is unset (a supported open-demo config) and ANTHROPIC_API_KEY is set, any caller who knows a paid lead's slug could invoke either action directly in an unthrottled loop and burn Anthropic quota with no cost to themselves. Fixed by adding the same per-IP checkRateLimit(`<action>:${clientIp}`) check used by loginOperatorAction/marketing-generate-rate-limit right after requireOperatorAuth in both actions, returning the same `{ success: false, error: \"Too many requests — please try again shortly.\" }` shape as every other action-level failure. Added direct rate-limit coverage to both actions' existing test suites (generate-marketing-pack-action.test.ts, generate-client-voice-pack-action.test.ts), exercising the real (unmocked) checkRateLimit module per test via vi.resetModules(), mirroring login/actions.test.ts's approach.",
    status: "done",
    phase: "Phase 6 — Marketing automation",
    owner: "claude/nice-euler-h86qp5",
  },
  {
    id: "social-share-og-images",
    summary:
      "Empty-backlog audit found homepage-social-share-metadata (2026-07-18) and docs-canonical-self-reference-fix had only ever added openGraph/twitter TEXT metadata (title/description/canonical) — every page on the site, including the homepage, docs, checkout, and every /preview/[slug] link sent cold in outreach, still unfurled on Slack/iMessage/X/LinkedIn with zero image, same as a bare unstyled link. Shipped: src/app/opengraph-image.tsx + twitter-image.tsx (a branded, statically-generated 1200x630 card — brand monogram + name + tagline, applies to every page that doesn't ship its own image via segment inheritance) and src/app/preview/[slug]/opengraph-image.tsx + twitter-image.tsx (a per-lead dynamic card — category label + business name + city/state + brand footer, category-accented color, reuses softCapLeadForPublicSurface + getCategoryTheme's label so the image can't drift from the page's own text metadata or the public-surface read cap). Also fixed a correctness bug this surfaced: root layout's metadata never set metadataBase, so Next.js resolved every file-convention image's relative URL against a hardcoded \"http://localhost:3000\" in every environment including production (the build even warns about this) — a real customer's shared preview link would have unfurled a broken localhost image URL. metadataBase now set once in homepageMetadata() via siteUrl(), inherited by every descendant route.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/nice-euler-ypiypv",
  },
  {
    id: "preview-og-image-rate-limit",
    summary:
      "Follow-up security audit on social-share-og-images (PR #463): src/app/preview/[slug]/opengraph-image.tsx and twitter-image.tsx are public, unauthenticated, and take an arbitrary attacker-chosen slug, yet had zero per-IP rate limiting — unlike every other public data-driven route in the codebase (contact form, checkout create, preview-open beacon, unsubscribe). loadPreviewPageLead resolves ANY slug to a real or synthetic lead (no cheap existence short-circuit), so every request paid a DB round trip plus a full satori layout + PNG raster — the most CPU-expensive operation any public route performs, with no throttle bounding a scripted loop over random slugs. Shipped: planLeadOgImageResponse (src/lib/og/lead-preview-image.tsx) checks checkRateLimit(`preview-og-image:${clientIp}`) BEFORE the DB lookup (mirrors preview-open's ordering); a rate-limited request falls back to the already-existing site-wide renderSiteOgImage() instead of doing the per-lead DB+render work, so a throttled crawler/scraper still gets a valid (if generic) image rather than an error or broken unfurl. Both route files now derive clientIp via `clientIpFromHeaders(await headers())` (next/headers, same pattern as the dashboard server actions) since these Next.js Image-convention files receive no Request object.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/nice-euler-lnt4wv",
  },
  ];
