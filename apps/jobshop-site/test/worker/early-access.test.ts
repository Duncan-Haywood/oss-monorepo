import { env, exports } from "cloudflare:workers";
import { CONSENT_VERSION } from "@shared/early-access";
import { beforeEach, describe, expect, it } from "vitest";

const worker = (exports as unknown as { default: Fetcher }).default;
const ORIGIN = "https://marisstella.app";

interface Row {
  email: string;
  name: string;
  processes: string;
  consent_text_version: string;
  consent_ip_hash: string | null;
  submit_count: number;
  notes: string;
}

function form(overrides: Record<string, string | string[] | undefined> = {}): URLSearchParams {
  const fields: Record<string, string | string[] | undefined> = {
    name: "Sam Rivera",
    email: "sam@example-shop.test",
    shop: "Example Precision",
    role: "owner",
    processes: ["milling", "sheet_metal"],
    rfqsPerWeek: "20_50",
    quotingToday: "Spreadsheet",
    notes: "",
    consent: "yes",
    website: "",
    ...overrides,
  };
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    for (const one of Array.isArray(v) ? v : [v]) body.append(k, one);
  }
  return body;
}

/** Posts like a browser form. Pass FormData to send multipart (the boundary header is set for it). */
function post(body: BodyInit, headers: Record<string, string> = {}) {
  const h = new Headers({ Origin: ORIGIN, "CF-Connecting-IP": "203.0.113.7", ...headers });
  if (!(body instanceof FormData) && !h.has("Content-Type"))
    h.set("Content-Type", "application/x-www-form-urlencoded");
  return worker.fetch(`${ORIGIN}/api/early-access`, {
    method: "POST",
    redirect: "manual",
    headers: h,
    body,
  });
}

const rows = async () =>
  (await env.DB.prepare("select * from early_access_requests order by email").all<Row>()).results;

beforeEach(async () => {
  await env.DB.prepare("delete from early_access_requests").run();
});

describe("POST /api/early-access", () => {
  it("stores a valid request and redirects to the thank-you page", async () => {
    const res = await post(form());
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe(`${ORIGIN}/early-access/thanks`);
    expect(res.headers.get("Content-Security-Policy")).toContain("default-src 'self'");
    const [row, ...rest] = await rows();
    expect(rest).toHaveLength(0);
    expect(row?.email).toBe("sam@example-shop.test");
    expect(JSON.parse(row?.processes ?? "[]")).toEqual(["milling", "sheet_metal"]);
    expect(row?.consent_text_version).toBe(CONSENT_VERSION);
    // Salted hash only: never the raw IP.
    expect(row?.consent_ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain("203.0.113.7");
  });

  it("accepts multipart form posts too", async () => {
    const fd = new FormData();
    for (const [k, v] of form()) fd.append(k, v);
    const res = await post(fd);
    expect(res.status).toBe(303);
    expect(await rows()).toHaveLength(1);
  });

  it("answers a repeat address the same way and updates the row", async () => {
    const first = await post(form());
    const second = await post(form({ email: "SAM@example-shop.test", notes: "Updated" }));
    expect(second.status).toBe(first.status);
    expect(second.headers.get("Location")).toBe(first.headers.get("Location"));
    const all = await rows();
    expect(all).toHaveLength(1);
    expect(all[0]?.submit_count).toBe(2);
    expect(all[0]?.notes).toBe("Updated");
  });

  it("re-renders the form with errors and the visitor's values, storing nothing", async () => {
    const res = await post(
      form({ email: "not-an-email", consent: undefined, name: '<b>"Sam"</b>' }),
    );
    expect(res.status).toBe(400);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain('role="alert"');
    expect(html).toContain("Enter one email address");
    expect(html).toContain("Tick the box");
    expect(html).toContain('value="not-an-email"');
    // Escaped, never injected.
    expect(html).toContain("&lt;b&gt;&quot;Sam&quot;&lt;/b&gt;");
    expect(html).not.toContain('<b>"Sam"</b>');
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(await rows()).toHaveLength(0);
  });

  it("silently drops honeypot submissions with the normal response", async () => {
    const res = await post(form({ website: "https://spam.example" }));
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe(`${ORIGIN}/early-access/thanks`);
    expect(await rows()).toHaveLength(0);
  });

  it("rejects cross-site posts", async () => {
    const res = await post(form(), { Origin: "https://evil.example" });
    expect(res.status).toBe(403);
    const noOrigin = await worker.fetch(`${ORIGIN}/api/early-access`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form(),
    });
    expect(noOrigin.status).toBe(403);
    expect(await rows()).toHaveLength(0);
  });

  it("allows a same-origin post without Origin when Sec-Fetch-Site says so", async () => {
    const res = await worker.fetch(`${ORIGIN}/api/early-access`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Sec-Fetch-Site": "same-origin",
      },
      body: form(),
    });
    expect(res.status).toBe(303);
  });

  it("rejects JSON, oversized bodies and other methods", async () => {
    expect((await post(JSON.stringify({}), { "Content-Type": "application/json" })).status).toBe(
      415,
    );
    expect((await post(form({ notes: "x".repeat(20_000) }))).status).toBe(413);
    const get = await worker.fetch(`${ORIGIN}/api/early-access`);
    expect(get.status).toBe(405);
    expect(await rows()).toHaveLength(0);
  });

  it("404s other API paths and serves static assets for everything else", async () => {
    expect((await worker.fetch(`${ORIGIN}/api/other`)).status).toBe(404);
    const home = await worker.fetch(`${ORIGIN}/`);
    expect(home.status).toBe(200);
    expect(await home.text()).toContain("static page");
  });
});
