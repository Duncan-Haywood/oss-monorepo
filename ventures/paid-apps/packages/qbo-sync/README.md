# @private-monorepo/qbo-sync

An `AccountingSync` port with two implementations:

- `QuickBooksOnlineSync`: the QuickBooks Online Accounting API v3, using `fetch` only (no
  dependencies). It runs on Cloudflare Workers and Node 22+.
- `FakeAccountingSync`: an in-memory store for tests and offline demos.

It also includes Intuit OAuth 2.0 helpers (authorization-code flow, token refresh, revoke, and a
token manager) and a retainage pattern that turns a pay application into ordinary invoice lines.

Money is integer cents everywhere in the port. Amounts are converted to QuickBooks decimals at the
adapter boundary.

```
src/port.ts       AccountingSync interface, domain types, input validation
src/oauth.ts      authorize URL, callback parsing, code exchange, refresh, revoke, token manager
src/qbo.ts        QboClient (auth, minorversion, Fault parsing, 401 retry) + QuickBooksOnlineSync
src/retainage.ts  planPayAppInvoice(): pay app -> invoice lines; retainage balance helper
src/fake.ts       FakeAccountingSync
```

## Commands

Run these from `packages/qbo-sync`:

```sh
pnpm typecheck        # tsc, strict
pnpm test             # node:test with --experimental-strip-types; no network, no secrets
pnpm exec biome check --write .
```

The tests use Node's built-in runner, so the package adds no dev dependencies. `test/node-test-shim.d.ts`
types the few `node:` APIs the tests call. The HTTP tests replay hand-written fixtures from
`test/fixtures/`; see the README in that folder.

## Owner-only secrets

Nothing in this package holds a credential. An app needs the following, set by the owner:

| Name | Kind | What it is |
| --- | --- | --- |
| `QBO_CLIENT_ID` | Worker secret | Client ID of the owner's Intuit developer app (sandbox or production keys) |
| `QBO_CLIENT_SECRET` | Worker secret | Client secret of the same app |
| `QBO_TOKEN_KEY` | Worker secret | Key the app uses to encrypt stored tokens at rest. The app owns this encryption, not this package |
| `QBO_REDIRECT_URI` | var | The callback URL. It must exactly match a redirect URI registered on the Intuit app |
| `QBO_ENVIRONMENT` | var | `sandbox` or `production`. It selects the API host. Sandbox and production use different keys |

```sh
wrangler secret put QBO_CLIENT_ID
wrangler secret put QBO_CLIENT_SECRET
wrangler secret put QBO_TOKEN_KEY
```

## Wiring it into an app (Hono Worker sketch)

```ts
import {
  buildAuthorizeUrl, parseCallback, exchangeCode, createTokenManager,
  QuickBooksOnlineSync, FakeAccountingSync, type AccountingSync, type TokenStore,
} from "@private-monorepo/qbo-sync";

const oauth = (env: Env) => ({
  clientId: env.QBO_CLIENT_ID, clientSecret: env.QBO_CLIENT_SECRET, redirectUri: env.QBO_REDIRECT_URI,
});

// 1. Connect: redirect to Intuit with an unguessable state. Keep the state in a signed,
//    short-lived cookie bound to the org.
app.get("/integrations/qbo/connect", (c) => {
  const state = crypto.randomUUID();
  setSignedCookie(c, "qbo_state", state);
  return c.redirect(buildAuthorizeUrl({ ...oauth(c.env), state }));
});

// 2. Callback: check state, exchange the code, store the tokens under this tenant.
app.get("/integrations/qbo/callback", async (c) => {
  const r = parseCallback(c.req.url, await getSignedCookie(c, "qbo_state"));
  if (!r.ok) return c.text(`QuickBooks connection failed: ${r.error}`, 400);
  const tokens = await exchangeCode(oauth(c.env), r.code, r.realmId);
  await tokenStoreFor(c.env, c.var.tenant.orgId).save(tokens); // encrypt with QBO_TOKEN_KEY
  return c.redirect("/settings/integrations");
});

// 3. Use the port. Tests and the offline demo pass `new FakeAccountingSync()` instead.
function accountingFor(env: Env, orgId: string, realmId: string): AccountingSync {
  const tokens = createTokenManager({ config: oauth(env), store: tokenStoreFor(env, orgId), realmId });
  return new QuickBooksOnlineSync({ tokens, environment: env.QBO_ENVIRONMENT });
}
```

`TokenStore` is the app's own code: `load()` and `save()` read and write one row keyed by
`(orgId, realmId)`. On tenant tables, every query filters by `c.var.tenant.orgId`. The token manager
refuses tokens whose `realmId` differs from the one it was created for.

The app needs to keep these behaviours in place:

- **Refresh tokens rotate.** `refreshTokens`/`createTokenManager` always save the newest token set.
  Intuit's client README says previous refresh tokens expire 24 hours after a new one is issued.
  Concurrent refreshes in one isolate are merged into one request. Refreshes across isolates can
  still race; a Durable Object or a D1 row lock removes that race if it matters.
- **Idempotent retries.** Give every invoice a `docNumber` (for example `PA-0003`). Before you retry
  a create that may have reached QuickBooks, call `findInvoiceByDocNumber`.
- **Errors.** `QboApiError` carries `status`, `faultType`, `errors[]` and `intuitTid` (quote that ID
  to Intuit support). Retry with backoff when `.retryable` is true (429/5xx). An `IntuitOAuthError`
  with `invalid_grant`, or "refresh token expired", means the customer must reconnect.
- **Disconnect.** Call `revokeToken(config, refreshToken)` and delete the stored row.

## Retainage pattern

This pattern is built from standard QuickBooks parts: one asset account and one item.

**Setup.** `ensureRetainageSetup()` is idempotent. It creates:

- an account named `Retainage Receivable`, with `AccountType: "Other Current Asset"` and
  `AccountSubType: "OtherCurrentAssets"`;
- a `Service` item named `Retainage` whose `IncomeAccountRef` points at that account.

If a `Retainage` item already exists and posts somewhere else, setup throws instead of reusing it.

**Holding retainage on a pay app.** `planPayAppInvoice()` takes the period's work lines (work
completed plus stored materials) and a retainage rate in basis points. A line can override the
rate, for example to hold less on stored materials. It returns invoice lines:

| Line | Item | Amount | Posting |
| --- | --- | --- | --- |
| Work completed this period | contract / SOV item | `+W` | credit income `W` |
| Retainage held (10%), pay application #n | Retainage | `-R` | debit Retainage Receivable `R` |
| invoice total | | `W - R` | debit Accounts Receivable `W - R` |

Income is recognised in full when the work is billed. The customer owes `W - R` now. `R` stays in
Retainage Receivable, so that account's balance is retainage held to date. Rounding is per line,
half away from zero, to whole cents. Held lines are grouped by rate.

**Releasing retainage.** Pass `retainageReleasedCents` together with `retainageHeldToDateCents`.
The release can go on a later pay app, or on a release-only invoice with no work lines. The plan
adds a positive line on the Retainage item: credit Retainage Receivable `L`, debit Accounts
Receivable `L`. The planner refuses to release more than is held, and refuses to produce an
invoice whose total is negative.

**Example.** A $100,000 contract at 10% billed over three pay apps of $40k, $35k and $25k, where
the last one releases all retainage. The nets are $36k, $31.5k and $32.5k, which sum to $100,000,
and Retainage Receivable ends at $0. `test/retainage.test.ts` checks this case.
`retainageBalanceFromLines()` recomputes the balance from posted invoice lines.

Payments are applied to these invoices as usual with `recordPayment`. An invoice's `Balance` covers
only the net billed amount, so the retainage that is held never appears as overdue.

### Native retainage fields in Intuit's schema

The project brief says QuickBooks has no native retainage. However, Intuit's current published
schema (QuickBooks-V3-PHP-SDK `Finance.xsd`, read 2026-11-24) does define retainage fields:

- `Invoice.TxnRetainageDetail` with `RetainageAmount` and a read-only `RetainageOpenBalance`, described as
  "Retainage accounting summary for the invoice … system-derived";
- `SalesItemLineDetail.RetainageAmount`, described as "Retainage amount withheld on this sales line";
- `TxnSubTypeEnum` value `RetainageRelease`, and an `AccountSubTypeEnum` value `Retainage`.

I could not verify which QuickBooks editions or regions expose these fields, or how they behave.
This package does **not** use them. The item/account pattern above works in any company. Test the
native fields in a sandbox company before relying on them. `ensureRetainageSetup({ accountSubType })`
lets an app try the `Retainage` account subtype.

## Sources

Intuit's developer documentation site (developer.intuit.com) could not be reached from the
environment this package was built in, because the network policy blocked it. So the API facts
here come from Intuit's **official SDK repositories on GitHub**, read on 2026-11-24:

- [intuit/oauth-jsclient `src/OAuthClient.js`](https://github.com/intuit/oauth-jsclient/blob/master/src/OAuthClient.js):
  authorize endpoint `https://appcenter.intuit.com/connect/oauth2`; token endpoint
  `https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer`; revoke endpoint
  `https://developer.api.intuit.com/v2/oauth2/tokens/revoke` (JSON body `{token}`); scope
  `com.intuit.quickbooks.accounting`; authorize params `response_type=code`, `client_id`,
  `redirect_uri`, `scope`, `state`; callback params `code`, `state`, `realmId`; token requests
  use HTTP Basic `client_id:client_secret` with a form body (`grant_type=authorization_code` with
  `code` and `redirect_uri`, or `grant_type=refresh_token` with `refresh_token`); the `intuit_tid`
  response header; API hosts `https://quickbooks.api.intuit.com/` and
  `https://sandbox-quickbooks.api.intuit.com/`.
- [intuit/oauth-jsclient `README.md`](https://github.com/intuit/oauth-jsclient/blob/master/README.md):
  access tokens last 3600 s; always use the most recent refresh token, because earlier ones expire
  24 h after a new one is issued; token response fields `access_token`, `refresh_token`,
  `expires_in`, `x_refresh_token_expires_in`, `token_type`.
- [intuit/QuickBooks-V3-PHP-SDK `src/Core/CoreConstants.php`](https://github.com/intuit/QuickBooks-V3-PHP-SDK/blob/master/src/Core/CoreConstants.php):
  `DEFAULT_SDK_MINOR_VERSION = "75"`, and the production and sandbox base URLs.
- [intuit/QuickBooks-V3-PHP-SDK `src/XSD/Finance.xsd`](https://github.com/intuit/QuickBooks-V3-PHP-SDK/blob/master/src/XSD/Finance.xsd):
  `AccountTypeEnum` (`Other Current Asset`), `AccountSubTypeEnum` (`OtherCurrentAssets`,
  `Retainage`), `ItemTypeEnum` (`Service`, `NonInventory`), `LineDetailTypeEnum`
  (`SalesItemLineDetail`, `SubTotalLineDetail`), and the retainage elements quoted above.
- [intuit/QuickBooks-V3-PHP-SDK `src/Data/`](https://github.com/intuit/QuickBooks-V3-PHP-SDK/tree/master/src/Data):
  field names on `IPPIntuitEntity` (`Id`, `SyncToken`, `sparse`), `IPPNameBase`
  (`DisplayName`, `CompanyName`, `PrimaryEmailAddr`), `IPPEmailAddress` (`Address`), `IPPItem`
  (`Name`, `Type`, `IncomeAccountRef`), `IPPAccount` (`Name`, `AccountType`, `AccountSubType`),
  `IPPTransaction`/`IPPSalesTransaction`/`IPPInvoice` (`DocNumber`, `TxnDate`, `DueDate`,
  `CustomerRef`, `Line`, `TotalAmt`, `Balance`, `PrivateNote`), `IPPLine` (`Amount`, `Description`,
  `DetailType`, `SalesItemLineDetail`, `LinkedTxn`), `IPPSalesItemLineDetail` (`ItemRef`, `Qty`,
  `UnitPrice`), `IPPPayment` (`TotalAmt`, `UnappliedAmt`, `PaymentRefNum`), `IPPLinkedTxn`
  (`TxnId`, `TxnType`), `IPPFault`/`IPPError` (`Error[]`, `type`, `Message`, `Detail`, `code`).

Intuit's canonical reference pages, worth reading once the network allows `developer.intuit.com`:

- OAuth 2.0: https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0
- Minor versions: https://developer.intuit.com/app/developer/qbo/docs/learn/explore-the-quickbooks-online-api/minor-versions
- Queries: https://developer.intuit.com/app/developer/qbo/docs/learn/explore-the-quickbooks-online-api/data-queries
- Entities: https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/invoice
  (and `/payment`, `/customer`, `/item`, `/account`)
- Errors: https://developer.intuit.com/app/developer/qbo/docs/develop/troubleshooting/error-codes

### Not yet verified against Intuit, so check these in a sandbox company first

- The REST paths `POST /v3/company/{realmId}/{entity}` (lowercase entity) and
  `GET /v3/company/{realmId}/query?query=…`, and the `QueryResponse.{Entity}[]` response shape.
  These are the long-standing v3 conventions, but this package did not confirm them against the
  pages above.
- Query literal escaping (`escapeQueryValue` backslash-escapes `'` and `\`).
- Whether QuickBooks accepts a `Service` item whose `IncomeAccountRef` is an Other Current Asset
  account. The retainage pattern depends on this.
- How QuickBooks treats a negative invoice total. This package rejects one before sending.
- Rate limits. `QboApiError.retryable` covers 429/5xx, and the caller decides the backoff.
- `PaymentInput.requestId`, sent as the `requestid` query parameter. Intuit's Java SDK appends
  `requestid=<32 hex>` to every create ([`PrepareRequestInterceptor.java`](https://github.com/intuit/QuickBooks-V3-Java-SDK/blob/develop/ipp-v3-java-devkit/src/main/java/com/intuit/ipp/interceptors/PrepareRequestInterceptor.java),
  read 2026-11-25), so the parameter exists; that a repeated id returns the first result instead
  of a second payment is how the fake behaves and is still to confirm in a sandbox. Callers should
  not rely on it alone (PayApps also checks the invoice balance before each payment).
- Credit memos (`createCreditMemo`, `applyCreditMemo`, added 2026-11-25). The `CreditMemo` entity
  with `SalesItemLineDetail` lines and its `RemainingCredit` field follow the PHP SDK's
  `IPPCreditMemo`. Applying one to a chosen invoice is sent as a `Payment` with `TotalAmt: 0` and
  two lines, one linking the invoice and one linking the credit memo for the same amount: the
  pattern Intuit's developer community describes for this, not yet run against a sandbox. A company
  with "Automatically apply credits" on may apply a new credit memo itself, oldest open invoice
  first; `FakeAccountingSync.autoApplyCredits` models that, and callers should read the invoice
  back rather than assume where the credit went (PayApps does).
- The length limit of `PaymentRefNum` (taken as 21 characters, like `DocNumber`).
- `listSaleItems` and `getItem` rely on two query behaviours: that `Type IN ('Service',
  'NonInventory')` is accepted in an Item query, and that queries return active entities only
  unless `Active` is named (so `getItem` reads an inactive item as gone). `IncomeAccountRef.name`
  is read for display only and may be absent; nothing depends on it.
