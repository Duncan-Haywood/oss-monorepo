import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type CatalogFile,
  type CatalogPlan,
  catalogFromPlans,
  PaddleCatalogClient,
  type PaddlePrice,
  type PaddleProduct,
  planCatalogSync,
  priceIdsFromPaddle,
  syncCatalog,
  validateCatalog,
} from "./paddle-catalog.ts";

const STARTER: CatalogPlan = {
  key: "starter",
  name: "Starter",
  description: "Small team.",
  monthlyCents: 500,
  annualCents: 5400,
};
const PRO: CatalogPlan = {
  key: "pro",
  name: "Pro",
  description: "Big team.",
  monthlyCents: 10_000,
  annualCents: null,
};
const CATALOG: CatalogFile = {
  app: "grants",
  productName: "Grant Autopilot",
  currency: "USD",
  taxCategory: "saas",
  plans: [STARTER, PRO],
};

/** In-memory Paddle: products and prices, with the endpoints the client uses. */
function fakePaddle(seed: { products?: PaddleProduct[]; prices?: PaddlePrice[] } = {}) {
  const products = [...(seed.products ?? [])];
  const prices = [...(seed.prices ?? [])];
  const calls: string[] = [];
  let n = 0;
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const auth = new Headers(init?.headers).get("authorization");
    calls.push(`${method} ${url.pathname}`);
    if (auth !== "Bearer pdl_sdbx_apikey_test")
      return Response.json({ error: { code: "forbidden" } }, { status: 403 });
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const active = (xs: { status: string }[]) =>
      xs.filter((x) => x.status === url.searchParams.get("status"));
    if (method === "GET" && url.pathname === "/products")
      return Response.json({ data: active(products), meta: { pagination: { has_more: false } } });
    if (method === "GET" && url.pathname === "/prices")
      return Response.json({ data: active(prices), meta: { pagination: { has_more: false } } });
    if (method === "POST" && url.pathname === "/products") {
      const p: PaddleProduct = {
        id: `pro_${++n}`,
        status: "active",
        description: null,
        custom_data: null,
        ...body,
      };
      products.push(p);
      return Response.json({ data: p }, { status: 201 });
    }
    if (method === "POST" && url.pathname === "/prices") {
      const p: PaddlePrice = { id: `pri_${++n}`, status: "active", ...body };
      prices.push(p);
      return Response.json({ data: p }, { status: 201 });
    }
    const m = url.pathname.match(/^\/(products|prices)\/(.+)$/);
    if (method === "PATCH" && m) {
      const list = (m[1] === "products" ? products : prices) as { id: string }[];
      const item = list.find((x) => x.id === m[2]);
      if (!item) return Response.json({ error: { code: "not_found" } }, { status: 404 });
      Object.assign(item, body);
      return Response.json({ data: item });
    }
    return Response.json({ error: { code: "unexpected" } }, { status: 400 });
  }) as typeof fetch;
  return {
    products,
    prices,
    calls,
    client: new PaddleCatalogClient("pdl_sdbx_apikey_test", { fetch: fetchFn }),
  };
}

describe("validateCatalog", () => {
  it("accepts a good catalog and rejects zero, fractional or duplicate prices", () => {
    assert.equal(validateCatalog(CATALOG).app, "grants");
    const bad = (patch: object) => () => validateCatalog({ ...CATALOG, ...patch });
    assert.throws(bad({ plans: [{ ...STARTER, monthlyCents: 0 }] }), /positive integer/);
    assert.throws(bad({ plans: [{ ...STARTER, monthlyCents: 4.99 }] }), /positive integer/);
    assert.throws(bad({ plans: [STARTER, STARTER] }), /duplicate/);
    assert.throws(bad({ currency: "GBP" }), /USD or EUR/);
    assert.equal(validateCatalog({ ...CATALOG, currency: "EUR" }).currency, "EUR");
    assert.throws(bad({ app: "Grants App" }), /app id/);
  });

  it("catalogFromPlans leaves out plans that are not for sale", () => {
    const c = catalogFromPlans(
      { app: "grants", productName: "Grant Autopilot", currency: "USD", taxCategory: "saas" },
      [
        {
          key: "comp",
          name: "Pilot",
          description: "",
          priceCents: 0,
          annualPriceCents: null,
          purchasable: false,
        },
        {
          key: "starter",
          name: "Starter",
          description: "x",
          priceCents: 500,
          annualPriceCents: 5400,
          purchasable: true,
        },
      ],
    );
    assert.deepEqual(
      c.plans.map((p) => p.key),
      ["starter"],
    );
  });
});

describe("syncCatalog against a fake Paddle", () => {
  it("creates products and prices from nothing, then is idempotent", async () => {
    const paddle = fakePaddle();
    const first = await syncCatalog(paddle.client, CATALOG, { apply: true });
    assert.equal(paddle.products.length, 2);
    assert.equal(paddle.prices.length, 3); // starter month + year, pro month
    assert.deepEqual(Object.keys(first.priceIds).sort(), ["pro", "starter", "starter:annual"]);
    const starter = paddle.prices.find((p) => p.id === first.priceIds["starter:annual"]);
    assert.equal(starter?.unit_price.amount, "5400");
    assert.equal(starter?.billing_cycle?.interval, "year");

    const writesBefore = paddle.calls.filter((c) => !c.startsWith("GET")).length;
    const second = await syncCatalog(paddle.client, CATALOG, { apply: true });
    assert.equal(second.applied.length, 0);
    assert.equal(paddle.calls.filter((c) => !c.startsWith("GET")).length, writesBefore);
    assert.deepEqual(second.priceIds, first.priceIds);
  });

  it("plan mode never writes", async () => {
    const paddle = fakePaddle();
    const r = await syncCatalog(paddle.client, CATALOG, { apply: false });
    assert.ok(r.applied.length > 0);
    assert.ok(paddle.calls.every((c) => c.startsWith("GET")));
  });

  it("a price change creates a new price and archives the old one (subscribers keep theirs)", async () => {
    const paddle = fakePaddle();
    const before = await syncCatalog(paddle.client, CATALOG, { apply: true });
    const raised = { ...CATALOG, plans: [{ ...STARTER, monthlyCents: 700 }, PRO] };
    const after = await syncCatalog(paddle.client, raised, { apply: true });
    assert.notEqual(after.priceIds.starter, before.priceIds.starter);
    const old = paddle.prices.find((p) => p.id === before.priceIds.starter);
    assert.equal(old?.status, "archived");
    assert.equal(old?.unit_price.amount, "500"); // never edited in place
    assert.equal(after.priceIds["starter:annual"], before.priceIds["starter:annual"]);
  });

  it("never touches another app's products or prices", async () => {
    const other: PaddleProduct = {
      id: "pro_other",
      name: "Other",
      description: null,
      status: "active",
      custom_data: { app: "payapps", plan: "starter" },
    };
    const otherPrice: PaddlePrice = {
      id: "pri_other",
      product_id: "pro_other",
      status: "active",
      description: "",
      unit_price: { amount: "999", currency_code: "USD" },
      billing_cycle: { interval: "month", frequency: 1 },
      custom_data: { app: "payapps", plan: "starter", interval: "month" },
    };
    const untagged: PaddleProduct = {
      id: "pro_hand",
      name: "Grant Autopilot Starter",
      description: null,
      status: "active",
      custom_data: null,
    };
    const paddle = fakePaddle({ products: [other, untagged], prices: [otherPrice] });
    await syncCatalog(paddle.client, CATALOG, { apply: true });
    assert.ok(
      !paddle.calls.some(
        (c) => c.includes("pro_other") || c.includes("pri_other") || c.includes("pro_hand"),
      ),
    );
    assert.equal(otherPrice.status, "active");
  });

  it("refuses to archive many prices at once (a broken catalog cannot empty the store)", async () => {
    const paddle = fakePaddle();
    await syncCatalog(paddle.client, CATALOG, { apply: true });
    const gutted = {
      ...CATALOG,
      plans: [
        { key: "solo", name: "Solo", description: "x", monthlyCents: 100, annualCents: null },
      ],
    };
    await assert.rejects(
      syncCatalog(paddle.client, gutted, { apply: true, maxArchive: 2 }),
      /refusing to archive 3/,
    );
    assert.ok(paddle.prices.every((p) => p.status === "active"));
  });

  it("dropping annual billing archives only the annual price", () => {
    const products: PaddleProduct[] = [
      {
        id: "pro_1",
        name: "Grant Autopilot Starter",
        description: "Small team.",
        status: "active",
        custom_data: { app: "grants", plan: "starter" },
      },
    ];
    const mk = (id: string, interval: "month" | "year", amount: string): PaddlePrice => ({
      id,
      product_id: "pro_1",
      status: "active",
      description: "",
      unit_price: { amount, currency_code: "USD" },
      billing_cycle: { interval, frequency: 1 },
      custom_data: { app: "grants", plan: "starter", interval },
    });
    const only = { ...CATALOG, plans: [{ ...STARTER, annualCents: null }] };
    const actions = planCatalogSync(only, products, [
      mk("pri_m", "month", "500"),
      mk("pri_y", "year", "5400"),
    ]);
    assert.deepEqual(
      actions.map((a) => (a.kind === "archive-price" ? a.priceId : a.kind)),
      ["pri_y"],
    );
  });

  it("an API error never echoes the key", async () => {
    const wrong = new PaddleCatalogClient("pdl_sdbx_apikey_wrong", {
      fetch: ((i: string, init: RequestInit) => fetch(i, init)) as typeof fetch,
      baseUrl: "http://127.0.0.1:9",
    });
    const err = await wrong.listProducts().then(
      () => null,
      (e: unknown) => e,
    );
    assert.ok(err instanceof Error);
    assert.ok(!err.message.includes("pdl_sdbx_apikey_wrong"));
  });
});

describe("priceIdsFromPaddle", () => {
  it("maps only active prices whose amount matches the catalog", () => {
    const pr = (
      id: string,
      plan: string,
      interval: string,
      amount: string,
      status = "active",
    ): PaddlePrice => ({
      id,
      product_id: "p",
      status,
      description: "",
      unit_price: { amount, currency_code: "USD" },
      billing_cycle: { interval, frequency: 1 },
      custom_data: { app: "grants", plan, interval },
    });
    const ids = priceIdsFromPaddle(CATALOG, [
      pr("pri_old", "starter", "month", "400"),
      pr("pri_new", "starter", "month", "500"),
      pr("pri_arch", "starter", "year", "5400", "archived"),
      pr("pri_pro", "pro", "month", "10000"),
    ]);
    assert.deepEqual(ids, { starter: "pri_new", pro: "pri_pro" });
  });
});
