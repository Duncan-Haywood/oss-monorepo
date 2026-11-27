import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  describeSecretField,
  isEndpointSecret,
  type PaddleNotificationSetting,
  PaddleWebhookClient,
  planWebhookDestination,
  syncWebhookDestination,
  WEBHOOK_EVENTS,
  webhookUrl,
} from "./paddle-webhook.ts";

const APP_URL = "https://payapps.marisstella.app";
const HOOK = "https://payapps.marisstella.app/api/billing/webhook";
const SECRET = "pdl_ntfset_01jabcdefghijklmnop_SecretPart0123456789";

function setting(over: Partial<PaddleNotificationSetting> = {}): PaddleNotificationSetting {
  return {
    id: "ntfset_1",
    description: "x",
    type: "url",
    destination: HOOK,
    active: false,
    api_version: 1,
    include_sensitive_fields: false,
    traffic_source: "all",
    subscribed_events: WEBHOOK_EVENTS.map((name) => ({ name })),
    endpoint_secret_key: SECRET,
    ...over,
  };
}

describe("webhookUrl", () => {
  it("adds the webhook path to a bare https origin", () => {
    assert.equal(webhookUrl(APP_URL), HOOK);
    assert.equal(webhookUrl(`${APP_URL}/`), HOOK);
    assert.equal(webhookUrl(" HTTPS://PayApps.MarisStella.app "), HOOK);
  });
  it("accepts every digit and hyphens in host labels", () => {
    // Labels may hold any digit 0-9 (a workers.dev account or a numbered staging host).
    for (const host of ["app0123456789.example.com", "pay-apps-2.acme-9.workers.dev"]) {
      assert.equal(webhookUrl(`https://${host}`), `https://${host}${HOOK.slice(APP_URL.length)}`);
    }
  });
  it("refuses http, paths, queries, credentials and odd hosts", () => {
    for (const bad of [
      "http://payapps.marisstella.app",
      `${APP_URL}/app`,
      `${APP_URL}/?x=1`,
      "https://user:pw@payapps.marisstella.app",
      // Each credential part alone is refused too, not only the pair.
      "https://user@payapps.marisstella.app",
      "https://:pw@payapps.marisstella.app",
      `${APP_URL}/#frag`,
      "https://localhost",
      "https://127.0.0.1",
      "https://[::1]",
      "not a url",
    ]) {
      assert.throws(() => webhookUrl(bad), /app URL/);
    }
  });
});

describe("planWebhookDestination", () => {
  it("creates one inactive destination when none points at the app", () => {
    const other = setting({
      id: "ntfset_other",
      destination: "https://books.example.com/api/billing/webhook",
    });
    const a = planWebhookDestination([other], { app: "payapps", appUrl: APP_URL, active: false });
    assert.equal(a.kind, "create");
    if (a.kind !== "create") return;
    assert.equal(a.body.destination, HOOK);
    assert.equal(a.body.type, "url");
    assert.equal(a.body.active, false);
    assert.equal(a.body.include_sensitive_fields, false);
    assert.equal(a.body.api_version, 1);
    assert.deepEqual(a.body.subscribed_events, [...WEBHOOK_EVENTS]);
  });

  it("leaves a matching destination alone", () => {
    const a = planWebhookDestination([setting()], {
      app: "payapps",
      appUrl: APP_URL,
      active: false,
    });
    assert.deepEqual(a, { kind: "none", id: "ntfset_1" });
  });

  it("activates when checkout turns on, and deactivates when it turns off", () => {
    const on = planWebhookDestination([setting()], {
      app: "payapps",
      appUrl: APP_URL,
      active: true,
    });
    assert.equal(on.kind, "update");
    if (on.kind === "update") assert.deepEqual(on.body, { active: true });
    const off = planWebhookDestination([setting({ active: true })], {
      app: "payapps",
      appUrl: APP_URL,
      active: false,
    });
    if (off.kind === "update") assert.deepEqual(off.body, { active: false });
    else throw new Error("expected an update");
  });

  it("moves a destination on another API version back to version 1", () => {
    const a = planWebhookDestination([setting({ api_version: 2 })], {
      app: "payapps",
      appUrl: APP_URL,
      active: false,
    });
    assert.equal(a.kind, "update");
    if (a.kind !== "update") return;
    assert.deepEqual(a.body, { api_version: 1 });
    assert.deepEqual(a.reasons, ["api_version 2 -> 1"]);
  });

  it("adds missing events and keeps ones added by hand", () => {
    const s = setting({
      subscribed_events: [{ name: "subscription.created" }, { name: "adjustment.created" }],
    });
    const a = planWebhookDestination([s], { app: "payapps", appUrl: APP_URL, active: false });
    assert.equal(a.kind, "update");
    if (a.kind !== "update") return;
    const ev = a.body.subscribed_events as string[];
    assert.ok(ev.includes("adjustment.created"));
    for (const e of WEBHOOK_EVENTS) assert.ok(ev.includes(e), e);
    assert.equal(ev.length, WEBHOOK_EVENTS.length + 1);
    assert.equal(a.body.active, undefined);
  });

  it("prefers the active one of two destinations for the same URL, and ignores email ones", () => {
    const a = planWebhookDestination(
      [
        setting({ id: "ntfset_mail", type: "email", destination: HOOK }),
        setting({ id: "ntfset_old" }),
        setting({ id: "ntfset_live", active: true }),
      ],
      { app: "payapps", appUrl: APP_URL, active: true },
    );
    assert.deepEqual(a, { kind: "none", id: "ntfset_live" });
  });
});

/** In-memory Paddle notification settings. */
function fakePaddle(
  seed: PaddleNotificationSetting[] = [],
  opts: { forbidWrite?: boolean; secretById?: string } = {},
) {
  const items = [...seed];
  const calls: string[] = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    calls.push(`${method} ${url.pathname}`);
    if (new Headers(init?.headers).get("authorization") !== "Bearer pdl_sdbx_apikey_test")
      return Response.json({ error: { code: "authentication_malformed" } }, { status: 401 });
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (method !== "GET" && opts.forbidWrite)
      return Response.json({ error: { code: "forbidden" } }, { status: 403 });
    if (method === "GET" && url.pathname === "/notification-settings")
      return Response.json({ data: items, meta: { pagination: { has_more: false } } });
    if (method === "POST" && url.pathname === "/notification-settings") {
      const s = setting({
        ...body,
        id: `ntfset_${items.length + 1}`,
        subscribed_events: body.subscribed_events.map((name: string) => ({ name })),
        endpoint_secret_key: `pdl_ntfset_created${items.length + 1}_abcdefghijklmnop`,
      });
      items.push(s);
      return Response.json({ data: s }, { status: 201 });
    }
    const m = url.pathname.match(/^\/notification-settings\/(.+)$/);
    if (method === "GET" && m) {
      const s = items.find((x) => x.id === m[1]);
      if (!s) return Response.json({ error: { code: "not_found" } }, { status: 404 });
      return Response.json({
        data: { ...s, endpoint_secret_key: opts.secretById ?? s.endpoint_secret_key },
      });
    }
    if (method === "PATCH" && m) {
      const i = items.findIndex((s) => s.id === m[1]);
      if (i < 0) return Response.json({ error: { code: "not_found" } }, { status: 404 });
      const ev = body.subscribed_events?.map((name: string) => ({ name }));
      items[i] = { ...items[i], ...body, ...(ev ? { subscribed_events: ev } : {}) };
      return Response.json({ data: items[i] });
    }
    return Response.json({ error: { code: "not_found" } }, { status: 404 });
  }) as typeof fetch;
  return { items, calls, fetchFn };
}

const client = (f: ReturnType<typeof fakePaddle>) =>
  new PaddleWebhookClient("pdl_sdbx_apikey_test", { fetch: f.fetchFn });

describe("syncWebhookDestination", () => {
  it("creates the destination and returns its secret; a second run changes nothing", async () => {
    const f = fakePaddle();
    const want = { app: "payapps", appUrl: APP_URL, active: false };
    const r = await syncWebhookDestination(client(f), want, { apply: true });
    assert.equal(r.action.kind, "create");
    assert.equal(r.id, "ntfset_1");
    assert.ok(isEndpointSecret(r.secret));
    assert.equal(f.items.length, 1);
    assert.equal(f.items[0]?.active, false);
    const again = await syncWebhookDestination(client(f), want, { apply: true });
    assert.equal(again.action.kind, "none");
    assert.equal(again.secret, r.secret);
    assert.equal(f.items.length, 1);
    assert.equal(f.calls.filter((c) => c.startsWith("POST")).length, 1);
  });

  it("plan only never writes, and has no secret for a destination it would create", async () => {
    const f = fakePaddle();
    const r = await syncWebhookDestination(
      client(f),
      { app: "payapps", appUrl: APP_URL, active: true },
      { apply: false },
    );
    assert.equal(r.action.kind, "create");
    assert.equal(r.secret, null);
    assert.equal(r.id, "");
    assert.deepEqual(f.calls, ["GET /notification-settings"]);
  });

  it("activates the existing destination and keeps its secret", async () => {
    const f = fakePaddle([setting()]);
    const r = await syncWebhookDestination(
      client(f),
      { app: "payapps", appUrl: APP_URL, active: true },
      { apply: true },
    );
    assert.equal(r.action.kind, "update");
    assert.equal(f.items[0]?.active, true);
    assert.equal(r.active, true);
    assert.equal(r.secret, SECRET);
  });

  it("names the permission when Paddle refuses the write, and never puts the key in the error", async () => {
    const f = fakePaddle([], { forbidWrite: true });
    const err = await syncWebhookDestination(
      client(f),
      { app: "payapps", appUrl: APP_URL, active: false },
      { apply: true },
    ).then(
      () => null,
      (e: Error) => e,
    );
    assert.match(
      String(err?.message),
      /403 forbidden \(give the key notification_setting\.write\)/,
    );
    assert.ok(!String(err?.message).includes("pdl_sdbx_apikey_test"));
  });

  it("plan only reports a destination it would create as inactive, whatever is wanted", async () => {
    const f = fakePaddle();
    const r = await syncWebhookDestination(
      client(f),
      { app: "payapps", appUrl: APP_URL, active: true },
      { apply: false },
    );
    assert.equal(r.action.kind, "create");
    assert.equal(r.active, false);
  });

  it("plan only reports the destination's current active state, not the wanted one", async () => {
    const f = fakePaddle([setting({ active: false })]);
    const r = await syncWebhookDestination(
      client(f),
      { app: "payapps", appUrl: APP_URL, active: true },
      { apply: false },
    );
    assert.equal(r.action.kind, "update");
    assert.equal(r.active, false);
    assert.equal(f.items[0]?.active, false);
    assert.ok(f.calls.every((c) => c.startsWith("GET")));
  });

  it("follows Paddle's next page but stops after 20 pages", async () => {
    const base = "https://sandbox-api.paddle.com";
    const calls: string[] = [];
    const fetchFn = (async (input: string | URL | Request) => {
      const url = new URL(String(input));
      calls.push(`${url.pathname}${url.search}`);
      return Response.json({
        data: [setting({ id: `ntfset_p${calls.length}` })],
        meta: {
          pagination: {
            has_more: true,
            next: `${base}/notification-settings?after=ntfset_p${calls.length}`,
          },
        },
      });
    }) as typeof fetch;
    const all = await new PaddleWebhookClient("pdl_sdbx_apikey_test", {
      fetch: fetchFn,
      baseUrl: base,
    }).list();
    assert.equal(calls.length, 20);
    assert.equal(all.length, 20);
    assert.equal(calls[1], "/notification-settings?after=ntfset_p1");
  });

  it("never follows a next page on another host with the API key", async () => {
    const base = "https://sandbox-api.paddle.com";
    const seen: string[] = [];
    const fetchFn = (async (input: string | URL | Request) => {
      seen.push(String(input));
      return Response.json({
        data: [setting()],
        meta: {
          pagination: { has_more: true, next: "https://evil.example/notification-settings" },
        },
      });
    }) as typeof fetch;
    const c = new PaddleWebhookClient("pdl_sdbx_apikey_test", { fetch: fetchFn, baseUrl: base });
    await assert.rejects(c.list(), /next page outside/);
    assert.deepEqual(seen, [`${base}/notification-settings`]);
  });

  it("reads the destination by id when the list leaves the secret out", async () => {
    const f = fakePaddle([setting({ endpoint_secret_key: undefined })], { secretById: SECRET });
    const r = await syncWebhookDestination(
      client(f),
      { app: "payapps", appUrl: APP_URL, active: false },
      { apply: true },
    );
    assert.equal(r.secret, SECRET);
    assert.deepEqual(f.calls, [
      "GET /notification-settings",
      "GET /notification-settings/ntfset_1",
    ]);
  });

  it("accepts a secret whose body has characters beyond letters, digits and underscores", () => {
    assert.equal(isEndpointSecret("pdl_ntfset_01jabc_Ab-c+d/e=f0123456789"), true);
    assert.equal(isEndpointSecret("pdl_ntfset_x"), false);
    // The length floor is strict: 20 characters is too short, 21 is enough.
    assert.equal(isEndpointSecret(`pdl_ntfset_${"a".repeat(9)}`), false);
    assert.equal(isEndpointSecret(`pdl_ntfset_${"a".repeat(10)}`), true);
    assert.equal(isEndpointSecret("pdl_ntfset_01jabc_with space_0123456789"), false);
    assert.equal(isEndpointSecret(`pdl_live_${"apikey"}_${"x".repeat(20)}`), false);
  });

  it("says what the secret field held without printing it", () => {
    assert.equal(describeSecretField(undefined), "field absent");
    assert.equal(
      describeSecretField(SECRET),
      `a string of ${SECRET.length} characters, prefix pdl_ntfset_`,
    );
    assert.ok(!describeSecretField(SECRET).includes(SECRET.slice(11)));
  });

  it("refuses a destination that comes back without a notification secret", async () => {
    const f = fakePaddle([setting({ endpoint_secret_key: undefined })]);
    await assert.rejects(
      syncWebhookDestination(
        client(f),
        { app: "payapps", appUrl: APP_URL, active: false },
        { apply: true },
      ),
      /without a usable notification secret \(write\/list response: field absent; GET by id: field absent\)/,
    );
  });
});
