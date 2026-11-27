// node --test scripts/email-routing.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  canonical,
  changes,
  desiredRule,
  plan,
  RULE_PREFIX,
  run,
  validateConfig,
} from "./email-routing.mjs";

const CFG = {
  zone: "example.org",
  domain: "rfq.example.org",
  local: "rfq",
  worker: "jobshop-quote",
};
const READY = { enabled: true, support_subaddress: true };
const ours = (over = {}) => ({ id: "r1", ...desiredRule(CFG), ...over });

test("the checked-in config is valid and asks for rfq@ on a subdomain", () => {
  const cfg = JSON.parse(readFileSync(new URL("../email-routing.json", import.meta.url), "utf8"));
  assert.deepEqual(validateConfig(cfg), []);
  assert.equal(cfg.local, "rfq");
  assert.equal(cfg.worker, "jobshop-quote");
});

test("validateConfig names each problem", () => {
  assert.deepEqual(validateConfig(CFG), []);
  assert.deepEqual(validateConfig({ ...CFG, domain: "rfq.other.org" }), [
    "domain rfq.other.org is not in zone example.org",
  ]);
  assert.match(validateConfig({ ...CFG, local: "quotes" })[0], /local must be "rfq"/);
  assert.match(validateConfig({ ...CFG, worker: "Bad Name" })[0], /worker/);
  assert.equal(validateConfig({}).length, 4);
});

test("the rule is a literal match on rfq@<domain> to the worker", () => {
  assert.deepEqual(desiredRule(CFG), {
    name: `${RULE_PREFIX}rfq@rfq.example.org`,
    enabled: true,
    matchers: [{ type: "literal", field: "to", value: "rfq@rfq.example.org" }],
    actions: [{ type: "worker", value: ["jobshop-quote"] }],
  });
});

test("a fresh zone gets every step, in order", () => {
  const steps = plan(CFG, { settings: { enabled: false }, subdomainOn: false, rules: [] });
  assert.deepEqual(
    steps.map((s) => s.op),
    ["enable-zone", "enable-subdomain", "subaddressing", "create-rule"],
  );
});

test("a zone that already matches needs nothing, whatever Cloudflare's key order", () => {
  const reordered = ours({
    matchers: [{ value: "rfq@rfq.example.org", field: "to", type: "literal" }],
    actions: [{ value: ["jobshop-quote"], type: "worker" }],
  });
  assert.deepEqual(plan(CFG, { settings: READY, subdomainOn: true, rules: [reordered] }), []);
});

test("an apex domain never asks to enable a subdomain", () => {
  const apex = { ...CFG, domain: "example.org" };
  assert.ok(
    !plan(apex, { settings: READY, subdomainOn: false, rules: [] }).some(
      (s) => s.op === "enable-subdomain",
    ),
  );
});

test("our rule disabled or pointing elsewhere is updated in place", () => {
  for (const r of [
    ours({ enabled: false }),
    ours({ actions: [{ type: "worker", value: ["other"] }] }),
  ]) {
    const steps = plan(CFG, { settings: READY, subdomainOn: true, rules: [r] });
    assert.deepEqual(steps, [{ op: "update-rule", id: "r1", rule: desiredRule(CFG) }]);
  }
});

test("a hand-made rule for the same address is warned about, never edited", () => {
  const hand = {
    id: "h1",
    name: "dashboard rule",
    enabled: true,
    matchers: [{ type: "literal", field: "to", value: "RFQ@rfq.example.org" }],
    actions: [],
  };
  const steps = plan(CFG, { settings: READY, subdomainOn: true, rules: [hand] });
  assert.deepEqual(
    steps.map((s) => s.op),
    ["warn", "create-rule"],
  );
  assert.deepEqual(
    changes(steps).map((s) => s.op),
    ["create-rule"],
  );
});

test("canonical ignores key order only", () => {
  assert.equal(canonical([{ a: 1, b: 2 }]), canonical([{ b: 2, a: 1 }]));
  assert.notEqual(canonical([{ a: 1 }]), canonical([{ a: 2 }]));
});

/** A fake Cloudflare: records calls, answers from a small state. */
function fakeCf({ settings = { enabled: false }, mx = [], rules = [], dnsRefused = false } = {}) {
  const calls = [];
  const cf = async (method, path, body) => {
    calls.push([method, path.replace(/\?.*$/, ""), body]);
    if (path.startsWith("/zones?")) return [{ id: "z1" }];
    if (method === "GET" && path === "/zones/z1/email/routing") return settings;
    if (method === "GET" && path.startsWith("/zones/z1/dns_records")) {
      if (dnsRefused) throw Object.assign(new Error("HTTP 403"), { status: 403 });
      return mx;
    }
    if (method === "GET" && path.startsWith("/zones/z1/email/routing/rules")) return rules;
    return {};
  };
  return { cf, calls };
}

test("a dry run reads but writes nothing, and does not claim the zone matches", async () => {
  const { cf, calls } = fakeCf();
  const { matches } = await run({ cfg: CFG, cf, write: false, log: () => {} });
  assert.equal(matches, false);
  assert.ok(calls.every(([m]) => m === "GET"));
});

test("APPLY makes the four writes with the API's shapes", async () => {
  const { cf, calls } = fakeCf();
  const { matches } = await run({ cfg: CFG, cf, write: true, log: () => {} });
  assert.equal(matches, true);
  assert.deepEqual(
    calls.filter(([m]) => m !== "GET"),
    [
      ["POST", "/zones/z1/email/routing/dns", {}],
      ["POST", "/zones/z1/email/routing/dns", { name: "rfq.example.org" }],
      ["PATCH", "/zones/z1/email/routing", { support_subaddress: true }],
      ["POST", "/zones/z1/email/routing/rules", desiredRule(CFG)],
    ],
  );
});

test("a subdomain whose MX already points at Cloudflare is not enabled again", async () => {
  const { cf, calls } = fakeCf({
    settings: READY,
    mx: [{ content: "route1.mx.cloudflare.net" }],
    rules: [ours()],
  });
  const { matches, steps } = await run({ cfg: CFG, cf, write: false, log: () => {} });
  assert.deepEqual(steps, []);
  assert.equal(matches, true);
  assert.ok(calls.every(([m]) => m === "GET"));
});

test("unreadable DNS: enabling is tried and an 'already' answer accepted; other errors fail", async () => {
  const already = fakeCf({ settings: READY, rules: [ours()], dnsRefused: true });
  const cf = async (m, p, b) => {
    if (m === "POST" && p.endsWith("/email/routing/dns"))
      throw new Error("POST: HTTP 400 2010 subdomain already enabled");
    return already.cf(m, p, b);
  };
  assert.equal((await run({ cfg: CFG, cf, write: true, log: () => {} })).matches, true);

  const broken = fakeCf({ settings: READY, rules: [ours()], dnsRefused: true });
  const cf2 = async (m, p, b) => {
    if (m === "POST" && p.endsWith("/email/routing/dns"))
      throw new Error("POST: HTTP 403 not allowed");
    return broken.cf(m, p, b);
  };
  await assert.rejects(run({ cfg: CFG, cf: cf2, write: true, log: () => {} }), /403/);
});

test("50 rules on the zone stop the run before any write", async () => {
  const many = Array.from({ length: 50 }, (_, i) => ({
    id: `x${i}`,
    name: `r${i}`,
    matchers: [],
    actions: [],
  }));
  const { cf, calls } = fakeCf({ settings: READY, rules: many });
  await assert.rejects(run({ cfg: CFG, cf, write: true, log: () => {} }), /50 or more/);
  assert.ok(calls.every(([m]) => m === "GET"));
});
