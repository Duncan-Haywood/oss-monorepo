// QuickBooks Online behind one small gateway (docs/QUICKBOOKS.md). Three states:
//   real:  QBO_CLIENT_ID, QBO_CLIENT_SECRET, QBO_REDIRECT_URI, QBO_TOKEN_KEY and QBO_ENVIRONMENT
//          (sandbox | production) are all set: Intuit OAuth and the Accounting API via
//          packages/qbo-sync;
//   fake:  tests and the offline demo (FAKE_EXTERNALS), never production: the "Intuit" consent
//          page is our own callback and the books are an in-memory FakeAccountingSync;
//   null:  anything else. The feature is dark and the UI says QuickBooks is not available yet.
import {
  type AccountingSync,
  buildAuthorizeUrl,
  createTokenManager,
  exchangeCode,
  FakeAccountingSync,
  type IntuitOAuthConfig,
  type QboEnvironment,
  QuickBooksOnlineSync,
  revokeToken,
  type TokenSet,
  type TokenStore,
} from "@qbo-sync";
import type { Env } from "../env";

export type QboMode = QboEnvironment | "fake";

export interface QboGateway {
  readonly mode: QboMode;
  /** Secret the stored tokens are encrypted under (lib/token-box.ts). */
  readonly tokenKey: string;
  /** Where to send the admin to grant access; `state` is single use (services/quickbooks.ts). */
  authorizeUrl(state: string): string;
  exchange(code: string, realmId: string): Promise<TokenSet>;
  revoke(refreshToken: string): Promise<void>;
  /** The company's books, refreshing and persisting tokens through `store`. */
  books(store: TokenStore, realmId: string): AccountingSync;
}

export const CALLBACK_PATH = "/api/integrations/quickbooks/callback";
/** Not a secret: only used when no real key exists and the gateway is the fake one. */
const FAKE_TOKEN_KEY = "jobshop-fake-qbo-token-key-not-a-secret-0000";

/** Per-isolate fake books, one per realm, so the demo and tests keep what they wrote. */
const fakeBooks = new Map<string, FakeAccountingSync>();
export const fakeQuickBooks = {
  books(realmId: string): FakeAccountingSync {
    let b = fakeBooks.get(realmId);
    if (!b) {
      b = new FakeAccountingSync();
      fakeBooks.set(realmId, b);
    }
    return b;
  },
  revoked: [] as string[],
};

/** A new fake company per connection, so tests and demo companies never share books. */
const fakeRealmId = () =>
  `9130${Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b % 10).join("")}`;

/** Every fake company keeps its books in US dollars unless a test says otherwise. */
const fakeHomeCurrency = { value: "USD" as string | undefined };
export const fakeQuickBooksSettings = fakeHomeCurrency;

function fakeGateway(env: Env): QboGateway {
  const base = (env.APP_URL ?? "http://localhost:5173").replace(/\/$/, "");
  return {
    mode: "fake",
    tokenKey: env.QBO_TOKEN_KEY || FAKE_TOKEN_KEY,
    authorizeUrl: (state) =>
      `${base}${CALLBACK_PATH}?${new URLSearchParams({ code: "fake-code", state, realmId: fakeRealmId() })}`,
    async exchange(code, realmId) {
      if (code !== "fake-code") throw new Error("fake QuickBooks: unknown authorization code");
      const now = Date.now();
      return {
        realmId,
        accessToken: `fake-access-${crypto.randomUUID()}`,
        refreshToken: `fake-refresh-${crypto.randomUUID()}`,
        accessTokenExpiresAt: now + 3_600_000,
        refreshTokenExpiresAt: now + 100 * 86_400_000,
      };
    },
    async revoke(refreshToken) {
      fakeQuickBooks.revoked.push(refreshToken);
    },
    books: (_store, realmId) => {
      const b = fakeQuickBooks.books(realmId);
      if (fakeHomeCurrency.value) b.trackingPrefs.homeCurrency = fakeHomeCurrency.value;
      else delete b.trackingPrefs.homeCurrency;
      return b;
    },
  };
}

function realGateway(env: Env, environment: QboEnvironment, tokenKey: string): QboGateway {
  const config: IntuitOAuthConfig = {
    clientId: env.QBO_CLIENT_ID ?? "",
    clientSecret: env.QBO_CLIENT_SECRET ?? "",
    redirectUri: env.QBO_REDIRECT_URI ?? "",
  };
  return {
    mode: environment,
    tokenKey,
    authorizeUrl: (state) => buildAuthorizeUrl({ ...config, state }),
    exchange: (code, realmId) => exchangeCode(config, code, realmId),
    revoke: (refreshToken) => revokeToken(config, refreshToken),
    books: (store, realmId) =>
      new QuickBooksOnlineSync({
        tokens: createTokenManager({ config, store, realmId }),
        environment,
      }),
  };
}

const isQboEnvironment = (v: string | undefined): v is QboEnvironment =>
  v === "sandbox" || v === "production";

export function createQboGateway(env: Env): QboGateway | null {
  const fake =
    env.APP_ENV !== "production" && (env.APP_ENV === "test" || env.FAKE_EXTERNALS === "true");
  if (fake) return fakeGateway(env);
  const key = env.QBO_TOKEN_KEY ?? "";
  if (
    env.QBO_CLIENT_ID &&
    env.QBO_CLIENT_SECRET &&
    env.QBO_REDIRECT_URI &&
    key.length >= 32 &&
    isQboEnvironment(env.QBO_ENVIRONMENT)
  ) {
    return realGateway(env, env.QBO_ENVIRONMENT, key);
  }
  return null;
}
