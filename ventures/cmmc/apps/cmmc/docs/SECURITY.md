# Security and data handling

## Tenant isolation

- Every org route is under `/api/orgs/:orgId/*` behind `requireOrg()`: non-members get **404** (ids cannot be probed).
  Writes need `editor`; profile and members need `admin`; owner changes need `owner`; the last owner cannot be removed.
- Every query on a tenant table filters by `c.var.tenant.orgId`; lookups by id also match `orgId`. Control owners
  must be members of the same org. SSP owner names come only from the org's members. Personnel records reach the SSP
  only as counts per requirement (3.2.x, 3.9.x), never a person's name or email (`personnelLine`).
- `test/worker/cmmc.test.ts` ("tenant isolation") checks reads, writes, drafting, evidence download/delete and
  POA&M changes across two orgs, including using org B's ids inside org A.

## Evidence files

- R2 keys are generated: `orgs/{orgId}/evidence/{evidenceId}`. The user's file name never reaches the key;
  `assertOrgKey` refuses any key outside the org prefix before every read/delete.
- Size cap 25 MB; types limited to PDF, PNG, JPEG, TXT, CSV, DOCX, XLSX. SHA-256 stored for integrity.
- Downloads: `Content-Disposition: attachment`, `Content-Security-Policy: default-src 'none'; sandbox`,
  `nosniff`, `Cache-Control: private, no-store`. Each download is written to the audit log.
- Cloudflare R2 encrypts objects at rest by default, and so does D1, where evidence is kept while no R2
  bucket is bound (`ports/file-store.ts`). File contents are never logged.

## Spreadsheet import

- A workbook (.xlsx) chosen for "Import spreadsheet" is parsed in the browser (`src/shared/xlsx.ts`,
  no library); the workbook itself is never uploaded or stored. Only the chosen sheet goes to
  `POST /controls/import` as CSV text, where the existing caps apply (1 MB, 3,000 rows, 8,000
  characters per text cell) and nothing but the parsed fields is written.
- The reader is bounded: rows past 100,000 and columns past 200 are ignored, ZIP64, encrypted and old
  OLE .xls files are refused with a message, and entries are inflated only on demand.

## Calendar subscription link

- `GET /api/calendar/<token>.ics` is the only org data served without a session
  (`src/worker/routes/calendar.ts`, `services/affirmations/calendar-feed.ts`). The token is
  `cmcal_` plus 32 random bytes (base64url); only its SHA-256 is stored, so the link is shown once.
- It serves only what the downloadable `.ics` holds: due dates, labels and the eCFR basis, plus each
  approved security policy's next review date under its NIST family's fixed name (never the
  policy's title, text or owner), and training refresher dates as one event per training and date
  with a count of people (`trainingDueDates` in `src/shared/personnel.ts`; never a person's name),
  and suppliers' "current through" dates as one event per date and part (status or affirmation)
  with a count of suppliers (`supplierDueDates` in `src/shared/suppliers.ts`; never a supplier's
  name, so the link does not list the shop's supply chain), and ISO 9001 dates as one event per
  date with a count: controlled documents' review dates (`documentReviewDates` in
  `src/shared/document-control.ts`), and planned internal audits and each open corrective action's
  due or effectiveness-check date per kind (`qualityDueDates` in `src/shared/internal-audits.ts`;
  never a document's or audit's title or a nonconformity's text, which can name a customer, part
  or person). No names, contacts or scores.
- Admins make, reset (the old token stops at once) and delete it; each is audited. Malformed, unknown
  and revoked tokens all answer the same 404. `last_fetched_at` is written at most hourly.
- The token sits in the URL path, so Cloudflare's request logs for this Worker can hold it; anyone
  with those logs can already read the database. Responses are `no-store` and `X-Robots-Tag: noindex`.
- Tests: `test/worker/calendar-feed.test.ts` (roles, reset, delete, cross-tenant, 404s).

## Personnel records

The People tab holds names, job titles, an optional email and dates (screening, access, training,
departure), plus the screening *method*. It is not an HR system: the form and the privacy policy
say never to record background check results or other sensitive personnel details. Rows are
tenant-scoped like every other table (`person.org_id`, cross-tenant worker tests), every write is
an audit row, the CSV export carries the same formula guard as the other exports and
`Cache-Control: private, no-store`, and nothing on the tab is sent to the AI model.

## Not a CUI enclave

This app is a preparation workspace. It is not assessed, authorized or configured to store, process or transmit
CUI (no FedRAMP Moderate equivalency, no FIPS-validated-crypto claim, no DFARS 252.204-7012 incident reporting).
Every upload requires an explicit "contains no CUI" attestation (`noCui=true`). The system profile hints ask users
to describe their systems, not paste CUI.

## LLM use

- All calls go through `ctx.llm` with purpose `cmmc.implementation_statement`; tests and offline mode use FakeLlm.
- Only the org's own profile, the control's notes/status and evidence **titles** are sent; never file contents.
- User text is wrapped as data and the prompt tells the model to ignore instructions inside it.
- Output is stored as an unreviewed draft; numbers not present in the inputs are flagged; the UI blocks
  accepting while `[CONFIRM: …]` placeholders remain. Only accepted text reaches the SSP.

## Web hardening

Same as `apps/grants`: security headers and an API CSP on every response, Origin check on state-changing
requests, HttpOnly + SameSite=Lax cookies (Secure on HTTPS), Better Auth rate limits on sign-in/up when hardened,
PBKDF2 password hashing, the `x-test-user-id` header honoured only when `APP_ENV=test`.

## Launch blockers (not built yet)

- Emailed invitations (members are added by an existing, confirmed account's address). Email
  verification and password reset by email are built (docs/EMAIL.md) and need only the sender
  domain onboarded.
- MFA for app accounts (expected by this audience; Better Auth's two-factor plugin is the likely route).
- Per-org LLM spend caps and a rate limiter on drafting/uploads (grants has both; port them).
- Org deletion / data export.
- Proofreading the control library (docs/SOURCES.md).
- Deploy workflow, production `APP_URL`, `AUTH_SECRET` and `ANTHROPIC_API_KEY` secrets.
