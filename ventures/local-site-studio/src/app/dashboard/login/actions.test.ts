import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Action-level orchestration for loginOperatorAction / logoutOperatorAction —
 * the operator session write/clear path that seeds every dashboard mutation.
 *
 * operator.test.ts covers token crypto + passwordsMatch; proxy.test.ts covers
 * the Host gate when a cookie is missing. This suite locks the login form glue:
 * unconfigured redirect, invalid password redirect, safeNextPath open-redirect
 * guard, cookie set with sessionMaxAgeSeconds options, and logout clear
 * (maxAge 0) + redirect to /dashboard/login.
 */

const cookieSet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    set: (...args: unknown[]) => cookieSet(...args),
    get: vi.fn(),
  })),
}));

const redirect = vi.fn((url: string): never => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => redirect(...(args as [string])),
}));

const isOperatorAuthConfigured = vi.fn();
const tryCreateSessionFromPassword = vi.fn();
const operatorSessionCookieOptions = vi.fn((maxAgeSeconds: number) => ({
  httpOnly: true,
  secure: false,
  sameSite: "lax" as const,
  path: "/",
  maxAge: maxAgeSeconds,
}));
const sessionMaxAgeSeconds = vi.fn(() => 43200);

vi.mock("@/lib/auth/operator", () => ({
  OPERATOR_SESSION_COOKIE: "lss_operator_session",
  isOperatorAuthConfigured: (...args: unknown[]) =>
    isOperatorAuthConfigured(...args),
  tryCreateSessionFromPassword: (...args: unknown[]) =>
    tryCreateSessionFromPassword(...args),
  operatorSessionCookieOptions: (...args: unknown[]) =>
    operatorSessionCookieOptions(...(args as [number])),
  sessionMaxAgeSeconds: (...args: Parameters<typeof sessionMaxAgeSeconds>) =>
    sessionMaxAgeSeconds(...args),
}));

function formData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    fd.set(key, value);
  }
  return fd;
}

async function expectRedirect(
  run: () => Promise<void>,
  url: string,
): Promise<void> {
  await expect(run()).rejects.toThrow(`NEXT_REDIRECT:${url}`);
  expect(redirect).toHaveBeenCalledWith(url);
}

describe("loginOperatorAction", () => {
  beforeEach(() => {
    vi.resetModules();
    cookieSet.mockReset();
    redirect.mockClear();
    isOperatorAuthConfigured.mockReset().mockReturnValue(true);
    tryCreateSessionFromPassword.mockReset().mockReturnValue("signed.token.value");
    operatorSessionCookieOptions.mockClear();
    sessionMaxAgeSeconds.mockClear().mockReturnValue(43200);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to unconfigured when OPERATOR_DASHBOARD_PASSWORD is unset", async () => {
    isOperatorAuthConfigured.mockReturnValue(false);
    const { loginOperatorAction } = await import("./actions");

    await expectRedirect(
      () => loginOperatorAction(formData({ password: "anything" })),
      "/dashboard?auth=unconfigured",
    );
    expect(tryCreateSessionFromPassword).not.toHaveBeenCalled();
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it("redirects to login with error=invalid on wrong password", async () => {
    tryCreateSessionFromPassword.mockReturnValue(null);
    const { loginOperatorAction } = await import("./actions");

    await expectRedirect(
      () =>
        loginOperatorAction(
          formData({ password: "wrong", next: "/dashboard/leads" }),
        ),
      "/dashboard/login?error=invalid&next=%2Fdashboard%2Fleads",
    );
    expect(tryCreateSessionFromPassword).toHaveBeenCalledWith("wrong");
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it("defaults next to /dashboard when missing on invalid password", async () => {
    tryCreateSessionFromPassword.mockReturnValue(null);
    const { loginOperatorAction } = await import("./actions");

    await expectRedirect(
      () => loginOperatorAction(formData({ password: "wrong" })),
      "/dashboard/login?error=invalid&next=%2Fdashboard",
    );
  });

  it("sets the session cookie and redirects to sanitized next on success", async () => {
    const { loginOperatorAction } = await import("./actions");

    await expectRedirect(
      () =>
        loginOperatorAction(
          formData({ password: "correct-horse", next: "/dashboard/leads" }),
        ),
      "/dashboard/leads",
    );

    expect(tryCreateSessionFromPassword).toHaveBeenCalledWith("correct-horse");
    expect(sessionMaxAgeSeconds).toHaveBeenCalledOnce();
    expect(operatorSessionCookieOptions).toHaveBeenCalledWith(43200);
    expect(cookieSet).toHaveBeenCalledWith(
      "lss_operator_session",
      "signed.token.value",
      {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        path: "/",
        maxAge: 43200,
      },
    );
  });

  it("rejects protocol-relative next (open redirect) and falls back to /dashboard", async () => {
    const { loginOperatorAction } = await import("./actions");

    await expectRedirect(
      () =>
        loginOperatorAction(
          formData({ password: "correct-horse", next: "//evil.example" }),
        ),
      "/dashboard",
    );
    expect(cookieSet).toHaveBeenCalledOnce();
  });

  it("rejects non-path next values and falls back to /dashboard", async () => {
    const { loginOperatorAction } = await import("./actions");

    await expectRedirect(
      () =>
        loginOperatorAction(
          formData({
            password: "correct-horse",
            next: "https://evil.example/phish",
          }),
        ),
      "/dashboard",
    );
  });
});

describe("logoutOperatorAction", () => {
  beforeEach(() => {
    vi.resetModules();
    cookieSet.mockReset();
    redirect.mockClear();
    operatorSessionCookieOptions.mockClear();
  });

  it("clears the session cookie (maxAge 0) and redirects to login", async () => {
    const { logoutOperatorAction } = await import("./actions");

    await expectRedirect(() => logoutOperatorAction(), "/dashboard/login");

    expect(operatorSessionCookieOptions).toHaveBeenCalledWith(0);
    expect(cookieSet).toHaveBeenCalledWith("lss_operator_session", "", {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  });
});
