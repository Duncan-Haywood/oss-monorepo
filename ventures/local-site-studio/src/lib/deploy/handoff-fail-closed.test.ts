/**
 * Go-live instructions must never name a domain the project was not told it
 * owns. `./handoff` and `./dns-email` — the modules the fix lives in — are
 * imported for real; only `@/lib/db` is stubbed (it imports "server-only"), and
 * the stub is a plain recorder that cannot decide any assertion here.
 *
 * The specific defect: `previewRootDomain()` used to default to
 * `preview.localsitestudio.com`. localsitestudio.com is registered to an
 * unrelated third party with live Zoho MX records, so a paying customer was
 * told to point DNS at, and expect their site on, someone else's domain.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getDeployHandoffBySlug = vi.fn();
const insertDeployHandoff = vi.fn();

vi.mock("@/lib/db", () => ({
  getDeployHandoffBySlug: (...args: unknown[]) => getDeployHandoffBySlug(...args),
  insertDeployHandoff: (...args: unknown[]) => insertDeployHandoff(...args),
  listDeployHandoffs: vi.fn(),
  updateDeployHandoffCustomDomain: vi.fn(),
  updateDeployHandoffStatus: vi.fn(),
  updateDeployHandoffVercelProject: vi.fn(),
  updateLeadStage: vi.fn(),
}));

const MANAGED_ENV = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_PREVIEW_DOMAIN",
  "NEXT_PUBLIC_PRODUCTION_DOMAIN",
  "VERCEL_TOKEN",
  "VERCEL_PROJECT_ID",
  "VERCEL_TEAM_ID",
] as const;

const originalEnv: Record<string, string | undefined> = {};

function setEnv(values: Record<string, string | undefined>) {
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

/** What the Kubernetes Deployment provides today: nothing. */
function unconfiguredEnv() {
  setEnv({
    NEXT_PUBLIC_APP_URL: undefined,
    NEXT_PUBLIC_PREVIEW_DOMAIN: undefined,
    NEXT_PUBLIC_PRODUCTION_DOMAIN: undefined,
    VERCEL_TOKEN: undefined,
    VERCEL_PROJECT_ID: undefined,
    VERCEL_TEAM_ID: undefined,
  });
}

async function enqueue() {
  const { enqueueProductionHandoff } = await import("./handoff");
  return enqueueProductionHandoff({
    leadSlug: "joes-auto",
    businessName: "Joe's Auto",
    tier: "starter",
    commerceAddon: false,
    stripeSessionId: "cs_test_1",
    customerEmail: "owner@joes-auto.test",
  });
}

beforeEach(() => {
  for (const name of MANAGED_ENV) originalEnv[name] = process.env[name];
  getDeployHandoffBySlug.mockReset().mockResolvedValue(null);
  insertDeployHandoff.mockReset().mockResolvedValue(undefined);
  unconfiguredEnv();
});

afterEach(() => {
  setEnv(originalEnv);
  vi.resetModules();
});

describe("productionRootDomain", () => {
  it("returns no root at all when nothing is configured", async () => {
    const { productionRootDomain } = await import("./handoff");
    expect(productionRootDomain()).toBe("");
  });

  it("never returns localsitestudio.com without being told to", async () => {
    const { productionRootDomain } = await import("./handoff");
    expect(productionRootDomain()).not.toContain("localsitestudio");
  });

  it("does not turn an unusable preview root into a production root", async () => {
    setEnv({ NEXT_PUBLIC_PREVIEW_DOMAIN: "preview.localhost" });
    const { productionRootDomain } = await import("./handoff");
    expect(productionRootDomain()).toBe("");
  });

  it("uses the explicit production root when set", async () => {
    setEnv({ NEXT_PUBLIC_PRODUCTION_DOMAIN: "harbor.studio" });
    const { productionRootDomain } = await import("./handoff");
    expect(productionRootDomain()).toBe("harbor.studio");
  });

  it("still derives the root by stripping preview. from a configured preview domain", async () => {
    setEnv({ NEXT_PUBLIC_PREVIEW_DOMAIN: "preview.harbor.studio" });
    const { productionRootDomain } = await import("./handoff");
    expect(productionRootDomain()).toBe("harbor.studio");
  });
});

describe("enqueueProductionHandoff with no domain configured", () => {
  it("withholds the hostname, links and DNS records rather than inventing them", async () => {
    const handoff = await enqueue();

    expect(handoff.suggestedHost).toBe("");
    expect(handoff.previewUrl).toBe("");
    expect(handoff.contactFormUrl).toBe("");
    expect(handoff.dnsInstructions).toEqual([]);
  });

  it("puts nothing about a third-party domain anywhere in the record", async () => {
    const handoff = await enqueue();
    expect(JSON.stringify(handoff)).not.toContain("localsitestudio");
    expect(JSON.stringify(handoff)).not.toContain("localhost");
  });

  it("names the env vars an operator must set", async () => {
    const handoff = await enqueue();
    const blocked = handoff.notes.find((n) =>
      n.startsWith("Go-live instructions withheld:"),
    );
    expect(blocked).toBeDefined();
    expect(blocked).toContain("NEXT_PUBLIC_APP_URL");
    expect(blocked).toContain("NEXT_PUBLIC_PRODUCTION_DOMAIN");
  });

  it("still records the paid order — an env gap must not lose fulfillment", async () => {
    const handoff = await enqueue();
    expect(insertDeployHandoff).toHaveBeenCalledTimes(1);
    expect(handoff.stripeSessionId).toBe("cs_test_1");
    expect(handoff.status).toBe("awaiting_dns");
  });

  it("does not ask Vercel to register an empty domain", async () => {
    setEnv({ VERCEL_TOKEN: "vc_real_token", VERCEL_PROJECT_ID: "prj_123" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      const handoff = await enqueue();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(handoff.vercelDomainStatus).toBe("skipped_no_domain");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("enqueueProductionHandoff once configured", () => {
  it("advertises only the configured root and origin", async () => {
    setEnv({
      NEXT_PUBLIC_APP_URL: "https://studio.marisstella.dev",
      NEXT_PUBLIC_PRODUCTION_DOMAIN: "harbor.studio",
    });

    const handoff = await enqueue();

    expect(handoff.suggestedHost).toBe("joes-auto.harbor.studio");
    expect(handoff.previewUrl).toBe(
      "https://studio.marisstella.dev/preview/joes-auto",
    );
    expect(handoff.contactFormUrl).toBe(
      "https://studio.marisstella.dev/api/contact/joes-auto",
    );
    expect(handoff.dnsInstructions.length).toBeGreaterThan(0);
    expect(
      handoff.notes.some((n) => n.startsWith("Go-live instructions withheld:")),
    ).toBe(false);
  });
});

describe("formatDnsInstructionsForEmail", () => {
  it("refuses to render instructions for a withheld handoff", async () => {
    const handoff = await enqueue();
    const { formatDnsInstructionsForEmail, DeployInstructionsBlockedError } =
      await import("./handoff");

    expect(() => formatDnsInstructionsForEmail(handoff)).toThrow(
      DeployInstructionsBlockedError,
    );
    expect(() => formatDnsInstructionsForEmail(handoff)).toThrow(
      /NEXT_PUBLIC_PRODUCTION_DOMAIN/,
    );
  });

  it("names which customer-facing fields were empty", async () => {
    const handoff = await enqueue();
    const { assertDeployInstructionsReady, DeployInstructionsBlockedError } =
      await import("./handoff");

    try {
      assertDeployInstructionsReady(handoff);
      expect.unreachable("should have refused");
    } catch (error) {
      expect(error).toBeInstanceOf(DeployInstructionsBlockedError);
      expect((error as InstanceType<typeof DeployInstructionsBlockedError>).missingFields).toEqual([
        "suggestedHost",
        "previewUrl",
        "contactFormUrl",
        "dnsInstructions",
      ]);
    }
  });

  it("gives the operator dashboard the reason instead of blank fields", async () => {
    const handoff = await enqueue();
    const { deployHandoffWithheldReason } = await import("./handoff");

    const reason = deployHandoffWithheldReason(handoff);
    expect(reason).toContain("NEXT_PUBLIC_APP_URL");
    expect(reason).toContain("NEXT_PUBLIC_PRODUCTION_DOMAIN");
  });

  it("reports no reason once the handoff is complete", async () => {
    setEnv({
      NEXT_PUBLIC_APP_URL: "https://studio.marisstella.dev",
      NEXT_PUBLIC_PRODUCTION_DOMAIN: "harbor.studio",
    });
    const handoff = await enqueue();
    const { deployHandoffWithheldReason } = await import("./handoff");

    expect(deployHandoffWithheldReason(handoff)).toBeNull();
  });

  it("renders once the handoff carries real values", async () => {
    setEnv({
      NEXT_PUBLIC_APP_URL: "https://studio.marisstella.dev",
      NEXT_PUBLIC_PRODUCTION_DOMAIN: "harbor.studio",
    });
    const handoff = await enqueue();
    const { formatDnsInstructionsForEmail } = await import("./handoff");

    const html = formatDnsInstructionsForEmail(handoff);
    expect(html).toContain("joes-auto.harbor.studio");
    expect(html).not.toContain("localsitestudio");
  });
});
