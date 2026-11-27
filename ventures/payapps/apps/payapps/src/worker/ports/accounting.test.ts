import { describe, expect, it } from "vitest";
import type { Env } from "../env";
import { createQboGateway } from "./accounting";

const env = (vars: Partial<Env>) => ({ APP_URL: "https://app.example", ...vars }) as Env;
const live = {
  QBO_CLIENT_ID: "id",
  QBO_CLIENT_SECRET: "secret",
  QBO_REDIRECT_URI: "https://app.example/api/integrations/quickbooks/callback",
  QBO_TOKEN_KEY: "k".repeat(32),
  QBO_ENVIRONMENT: "sandbox",
};

describe("createQboGateway", () => {
  it("is dark in production until every setting is present", () => {
    expect(createQboGateway(env({ APP_ENV: "production" }))).toBeNull();
    expect(
      createQboGateway(env({ APP_ENV: "production", ...live, QBO_TOKEN_KEY: "short" })),
    ).toBeNull();
    expect(
      createQboGateway(env({ APP_ENV: "production", ...live, QBO_ENVIRONMENT: "prod" })),
    ).toBeNull();
    expect(createQboGateway(env({ APP_ENV: "production", ...live }))?.mode).toBe("sandbox");
  });

  it("never uses the fake in production, even with FAKE_EXTERNALS", () => {
    expect(createQboGateway(env({ APP_ENV: "production", FAKE_EXTERNALS: "true" }))).toBeNull();
    expect(createQboGateway(env({ APP_ENV: "development", FAKE_EXTERNALS: "true" }))?.mode).toBe(
      "fake",
    );
  });

  it("sends the admin to Intuit with the state and the registered redirect", () => {
    const g = createQboGateway(env({ APP_ENV: "production", ...live }));
    const u = new URL(g?.authorizeUrl("st4te") ?? "");
    expect(u.origin).toBe("https://appcenter.intuit.com");
    expect(u.searchParams.get("state")).toBe("st4te");
    expect(u.searchParams.get("redirect_uri")).toBe(live.QBO_REDIRECT_URI);
    expect(u.searchParams.get("scope")).toBe("com.intuit.quickbooks.accounting");
  });
});
