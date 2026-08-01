import { expect, test } from "@playwright/test";

/**
 * Direct URL and direct API access by someone who is not signed in.
 *
 * `src/proxy.ts` matches `/api/:path*` but only enforces origin and body size
 * — it is not an authorization layer, and no page route is behind it at all.
 * Every guard that matters here is inside a handler, which means the only way
 * to know the guard is reachable is to be an anonymous browser and ask.
 *
 * `src/lib/routeAuthPosture.test.ts` declares what each handler is supposed to
 * do. This is the other half: proof that a real request gets that answer.
 */

/**
 * Every admin handler that reads participant data, with the method it
 * actually implements. Sending the wrong verb is not a security test — a
 * `GET /api/admin/report` answers 405 from the framework before the guard in
 * the handler is ever consulted, so a list that got the method wrong would
 * pass while proving nothing.
 */
const ADMIN_API = [
  { path: "/api/admin/overview", method: "get" as const },
  { path: "/api/admin/report", method: "post" as const },
  { path: "/api/admin/export", method: "get" as const },
];

test.describe("anonymous authorization", () => {
  test("the admin screen shows a key prompt, never the dashboard", async ({ page }) => {
    await page.goto("/admin");

    await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();
    await expect(page.getByPlaceholder("Admin key")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    // The signed-in view's own control. Its absence is the assertion.
    await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
  });

  test("admin endpoints refuse an unauthenticated caller", async ({ request }) => {
    for (const { path, method } of ADMIN_API) {
      const response = await request[method](path, method === "post" ? { data: {} } : undefined);
      expect(response.status(), `${path} answered an anonymous ${method.toUpperCase()}`).toBe(401);
      expect(await response.text()).not.toMatch(/participant|answers|export/i);
    }
  });

  test("the account endpoint reports no session rather than inventing one", async ({ request }) => {
    const response = await request.get("/api/auth/me");
    expect(response.ok()).toBe(true);
    const body = (await response.json()) as { user?: unknown };
    expect(body.user ?? null).toBe(null);
  });

  test("a cross-origin write is blocked by the proxy", async ({ request }) => {
    // The check `src/lib/originCheck.ts` exists to make. Asserted through a
    // real request because a proxy matcher that stops covering `/api` is a
    // one-line change that no unit test of `checkOrigin` would notice.
    const response = await request.post("/api/session/start", {
      headers: { origin: "https://not-pairwise.example", "content-type": "application/json" },
      data: { firstName: "Anonymous", perspective: "PARTNER" },
    });
    expect(response.status()).toBe(403);
  });

  test("the signed-out product never links a visitor into the admin surface", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('a[href^="/admin"]')).toHaveCount(0);
  });
});
