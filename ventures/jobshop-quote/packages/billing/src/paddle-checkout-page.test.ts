import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clientTokenEnvironment,
  describeCheckoutPage,
  isClientToken,
  PaddleCheckoutClient,
  payPageUrl,
  pickClientToken,
  planDefaultLink,
  syncCheckoutPage,
} from "./paddle-checkout-page.ts";

// Built at run time so no token-shaped literal sits in the tree.
const tok = (env: "live" | "test", n: string) => `${env}_${n.repeat(26).slice(0, 26)}`;

describe("payPageUrl", () => {
  it("adds /pay to a bare https origin", () => {
    assert.equal(
      payPageUrl("https://payapps.marisstella.app"),
      "https://payapps.marisstella.app/pay",
    );
    assert.equal(
      payPageUrl("https://payapps.marisstella.app/"),
      "https://payapps.marisstella.app/pay",
    );
  });
  it("refuses http, IPs, paths, queries and credentials", () => {
    for (const bad of [
      "http://payapps.marisstella.app",
      "https://127.0.0.1",
      "https://localhost",
      "https://a.example/app",
      "https://a.example/?x=1",
      "https://u:p@a.example",
      "not a url",
    ]) {
      assert.throws(() => payPageUrl(bad), Error);
    }
  });
});

describe("client-side tokens", () => {
  it("knows the shape and the environment", () => {
    assert.ok(isClientToken(tok("live", "a1")));
    assert.ok(isClientToken(tok("test", "b2")));
    assert.ok(!isClientToken("pdl_live_apikey_x"));
    assert.ok(!isClientToken("live_"));
    assert.ok(!isClientToken(`live_${"a".repeat(20)}<script>`));
    assert.ok(!isClientToken(undefined));
    assert.equal(clientTokenEnvironment(tok("test", "c")), "sandbox");
    assert.equal(clientTokenEnvironment(tok("live", "c")), "production");
  });
  it("picks the active token with the app's name only", () => {
    const list = [
      { id: "ctkn_3", token: tok("live", "x"), name: "seller-books checkout", status: "active" },
      { id: "ctkn_2", token: tok("live", "y"), name: "payapps checkout", status: "revoked" },
      { id: "ctkn_1", token: tok("live", "z"), name: "payapps checkout", status: "active" },
    ];
    assert.equal(pickClientToken(list, "payapps")?.id, "ctkn_1");
    assert.equal(pickClientToken(list, "cmmc"), null);
  });
});

describe("planDefaultLink", () => {
  const pay = "https://payapps.marisstella.app/pay";
  it("sets the link only when the account has none", () => {
    assert.deepEqual(planDefaultLink(null, pay), { kind: "set", url: pay });
    assert.deepEqual(planDefaultLink(pay, pay), { kind: "keep", url: pay, ours: true });
    assert.deepEqual(planDefaultLink("https://other.example/pay", pay), {
      kind: "keep",
      url: "https://other.example/pay",
      ours: false,
    });
  });
});

type Call = { method: string; path: string; body: unknown };
function fakePaddle(state: {
  tokens: { id: string; token: string; name: string; status: string }[];
  defaultUrl: string | null;
  patchError?: { status: number; code: string };
  denyTokens?: boolean;
}) {
  const calls: Call[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    const u = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ method, path: u.pathname + u.search, body });
    assert.match(
      String((init?.headers as Record<string, string> | undefined)?.Authorization),
      /^Bearer /,
    );
    if (u.pathname === "/client-tokens") {
      if (state.denyTokens) return Response.json({ error: { code: "forbidden" } }, { status: 403 });
      if (method === "GET") return Response.json({ data: state.tokens, meta: { pagination: {} } });
      const made = { id: "ctkn_new", token: tok("live", "n"), name: body.name, status: "active" };
      state.tokens.unshift(made);
      return Response.json({ data: made }, { status: 201 });
    }
    if (u.pathname === "/settings/checkout-url") {
      if (method === "GET") return Response.json({ data: { default_url: state.defaultUrl } });
      if (state.patchError)
        return Response.json(
          { error: { code: state.patchError.code } },
          { status: state.patchError.status },
        );
      state.defaultUrl = body.default_url;
      return Response.json({ data: { default_url: state.defaultUrl } });
    }
    return new Response("{}", { status: 404 });
  };
  return {
    calls,
    client: new PaddleCheckoutClient("pdl_live_apikey_k", {
      fetch: fetchFn,
      baseUrl: "https://api.paddle.com",
    }),
  };
}

describe("syncCheckoutPage", () => {
  const want = { app: "payapps", appUrl: "https://payapps.marisstella.app" };

  it("creates the token and sets the default link on a fresh account", async () => {
    const state = { tokens: [], defaultUrl: null };
    const { client, calls } = fakePaddle(state);
    const r = await syncCheckoutPage(client, want, { apply: true });
    assert.equal(r.tokenAction, "created");
    assert.ok(isClientToken(r.token));
    assert.equal(state.defaultUrl, "https://payapps.marisstella.app/pay");
    const post = calls.find((c) => c.method === "POST");
    assert.equal((post?.body as { name?: string } | undefined)?.name, "payapps checkout");
    assert.equal(r.defaultLinkError, null);
  });

  it("only reads without apply", async () => {
    const state = { tokens: [], defaultUrl: null };
    const { client, calls } = fakePaddle(state);
    const r = await syncCheckoutPage(client, want, { apply: false });
    assert.equal(r.tokenAction, "would create");
    assert.equal(r.token, null);
    assert.equal(state.defaultUrl, null);
    assert.ok(calls.every((c) => c.method === "GET"));
    assert.match(describeCheckoutPage(r, false).join("\n"), /would be set to/);
  });

  it("reuses an existing token and keeps another app's default link", async () => {
    const existing = {
      id: "ctkn_1",
      token: tok("live", "e"),
      name: "payapps checkout",
      status: "active",
    };
    const state = { tokens: [existing], defaultUrl: "https://sellerbooks.example/pay" };
    const { client, calls } = fakePaddle(state);
    const r = await syncCheckoutPage(client, want, { apply: true });
    assert.equal(r.tokenAction, "found");
    assert.equal(r.token, existing.token);
    assert.equal(state.defaultUrl, "https://sellerbooks.example/pay");
    assert.ok(!calls.some((c) => c.method !== "GET"));
    assert.match(describeCheckoutPage(r, true).join("\n"), /another page/);
  });

  it("reports an unapproved domain without failing (the token still comes back)", async () => {
    const state = {
      tokens: [],
      defaultUrl: null,
      patchError: { status: 400, code: "checkout_url_domain_not_approved" },
    };
    const { client } = fakePaddle(state);
    const r = await syncCheckoutPage(client, want, { apply: true });
    assert.ok(isClientToken(r.token));
    assert.match(String(r.defaultLinkError), /checkout_url_domain_not_approved.*Website approval/);
  });

  it("throws with the permission to add when the key cannot read tokens", async () => {
    const { client } = fakePaddle({ tokens: [], defaultUrl: null, denyTokens: true });
    await assert.rejects(syncCheckoutPage(client, want, { apply: true }), /client_token\.read/);
  });

  it("never logs the token in its description", async () => {
    const { client } = fakePaddle({ tokens: [], defaultUrl: null });
    const r = await syncCheckoutPage(client, want, { apply: true });
    assert.ok(!describeCheckoutPage(r, true).join("\n").includes(String(r.token)));
  });
});
