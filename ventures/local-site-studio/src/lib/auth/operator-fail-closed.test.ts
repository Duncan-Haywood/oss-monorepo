import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The gate must fail CLOSED on a production build with no usable password.
 *
 * Before this suite, requireOperatorAuth returned { ok: true } whenever
 * OPERATOR_DASHBOARD_PASSWORD was unset — in every environment. .env.example
 * ships that variable commented out, so the single most likely deploy mistake
 * left all 28 dashboard server actions and /api/stripe/bootstrap-prices
 * world-callable: marking client payouts settled, archiving live Stripe
 * Products, minting a billing-portal URL for any lead. The only thing shipped
 * against it was a banner on the dashboard, which renders to whoever already
 * reached the open dashboard.
 *
 * requireOperatorAuth is the chokepoint every mutation funnels through, so
 * these cases are the ones that decide whether a misconfigured deploy is
 * world-writable. operator.test.ts covers session crypto and the jar read.
 */

const cookieGet = vi.fn();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (...args: unknown[]) => cookieGet(...args),
  })),
}));

import {
  OPERATOR_AUTH_LOCKED_OUT_MESSAGE,
  OPERATOR_SESSION_COOKIE,
  createOperatorSessionToken,
  isOperatorAuthConfigured,
  isOperatorAuthenticated,
  operatorAuthMode,
  requireOperatorAuth,
} from "./operator";

const PASSWORD = "correct-horse-battery-staple";

const originalPassword = process.env.OPERATOR_DASHBOARD_PASSWORD;
const originalNodeEnv = process.env.NODE_ENV;

/** NODE_ENV is typed read-only; these tests need to simulate a production build. */
function setNodeEnv(value: string | undefined): void {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) {
    delete env.NODE_ENV;
  } else {
    env.NODE_ENV = value;
  }
}

function restoreEnv(): void {
  if (originalPassword === undefined) {
    delete process.env.OPERATOR_DASHBOARD_PASSWORD;
  } else {
    process.env.OPERATOR_DASHBOARD_PASSWORD = originalPassword;
  }
  setNodeEnv(originalNodeEnv);
}

describe("operatorAuthMode", () => {
  it("is enforced when a usable password is set, in any environment", () => {
    for (const nodeEnv of ["production", "development", "test"]) {
      expect(
        operatorAuthMode({ NODE_ENV: nodeEnv, OPERATOR_DASHBOARD_PASSWORD: PASSWORD }),
      ).toBe("enforced");
    }
  });

  it("is open-demo outside a production build when no password is set", () => {
    expect(operatorAuthMode({ NODE_ENV: "development" })).toBe("open-demo");
    expect(operatorAuthMode({ NODE_ENV: "test" })).toBe("open-demo");
    expect(operatorAuthMode({})).toBe("open-demo");
  });

  it("is locked-out on a production build when no password is set", () => {
    expect(operatorAuthMode({ NODE_ENV: "production" })).toBe("locked-out");
    expect(
      operatorAuthMode({ NODE_ENV: "production", OPERATOR_DASHBOARD_PASSWORD: "" }),
    ).toBe("locked-out");
    expect(
      operatorAuthMode({ NODE_ENV: "production", OPERATOR_DASHBOARD_PASSWORD: "   " }),
    ).toBe("locked-out");
  });

  it("treats a documented paste placeholder as no password at all", () => {
    // The banner already calls these unusable; the gate now agrees with it.
    for (const placeholder of ["changeme", "CHANGEME", "password", "secret", "operator"]) {
      expect(
        operatorAuthMode({
          NODE_ENV: "production",
          OPERATOR_DASHBOARD_PASSWORD: placeholder,
        }),
      ).toBe("locked-out");
      expect(
        isOperatorAuthConfigured({
          NODE_ENV: "production",
          OPERATOR_DASHBOARD_PASSWORD: placeholder,
        }),
      ).toBe(false);
    }
  });

  it("has no environment variable that re-opens a production deploy", () => {
    // Guards against an escape hatch being added back later: nothing except a
    // real password may move production out of locked-out.
    const withEveryPlausibleOptOut = {
      NODE_ENV: "production",
      OPERATOR_DASHBOARD_OPEN_DEMO: "true",
      OPERATOR_DASHBOARD_AUTH_DISABLED: "1",
      DISABLE_OPERATOR_AUTH: "true",
      ALLOW_OPEN_DASHBOARD: "1",
      DEMO_MODE: "true",
    };
    expect(operatorAuthMode(withEveryPlausibleOptOut)).toBe("locked-out");
    expect(
      operatorAuthMode({ ...withEveryPlausibleOptOut, OPERATOR_DASHBOARD_PASSWORD: PASSWORD }),
    ).toBe("enforced");
  });
});

describe("requireOperatorAuth in a production build", () => {
  beforeEach(() => {
    cookieGet.mockReset();
    cookieGet.mockReturnValue(undefined);
    setNodeEnv("production");
    delete process.env.OPERATOR_DASHBOARD_PASSWORD;
  });

  afterEach(restoreEnv);

  it("denies every mutation when the password is unset", async () => {
    const result = await requireOperatorAuth();
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBe(OPERATOR_AUTH_LOCKED_OUT_MESSAGE);
  });

  it("denies without even reading the session cookie", async () => {
    // Nothing an unauthenticated caller can send should be consulted.
    await requireOperatorAuth();
    expect(cookieGet).not.toHaveBeenCalled();
  });

  it("names the remedy in the error, so the deploy is diagnosable", async () => {
    const result = await requireOperatorAuth();
    expect(result.ok === false && result.error).toContain("OPERATOR_DASHBOARD_PASSWORD");
  });

  it("denies when the password is still a placeholder", async () => {
    process.env.OPERATOR_DASHBOARD_PASSWORD = "changeme";
    expect((await requireOperatorAuth()).ok).toBe(false);
  });

  it("reports the dashboard as unauthenticated rather than open", async () => {
    expect(await isOperatorAuthenticated()).toBe(false);
  });

  it("still admits a valid session once a real password is set", async () => {
    process.env.OPERATOR_DASHBOARD_PASSWORD = PASSWORD;
    cookieGet.mockImplementation((name: string) =>
      name === OPERATOR_SESSION_COOKIE
        ? { value: createOperatorSessionToken(PASSWORD) }
        : undefined,
    );
    expect((await requireOperatorAuth()).ok).toBe(true);
    expect(await isOperatorAuthenticated()).toBe(true);
  });

  it("still rejects a session signed with a different password", async () => {
    process.env.OPERATOR_DASHBOARD_PASSWORD = PASSWORD;
    cookieGet.mockImplementation((name: string) =>
      name === OPERATOR_SESSION_COOKIE
        ? { value: createOperatorSessionToken("some-other-password") }
        : undefined,
    );
    expect((await requireOperatorAuth()).ok).toBe(false);
  });
});

describe("requireOperatorAuth outside a production build", () => {
  beforeEach(() => {
    cookieGet.mockReset();
    cookieGet.mockReturnValue(undefined);
    setNodeEnv("development");
    delete process.env.OPERATOR_DASHBOARD_PASSWORD;
  });

  afterEach(restoreEnv);

  it("keeps the open demo working for `next dev`", async () => {
    // The reason the fail-open existed. It survives, scoped to non-production.
    expect((await requireOperatorAuth()).ok).toBe(true);
    expect(await isOperatorAuthenticated()).toBe(true);
  });
});
