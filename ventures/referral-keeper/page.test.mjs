import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { renderDashboard, renderJoin, esc } from "./page.mjs";

const stats = { visits: 3, referred: 2, paying: 1, recent: [{ at: Date.UTC(2026, 0, 2), kind: "commission", cents: 2000, currency: "usd", paid: false }], balances: { usd: { earned: 2000, pending: 2000, payable: 0, paid: 0, due: 0 } } };

test("escaping covers the five HTML metacharacters", () => assert.equal(esc(`<a href="x">'&`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;"));

test("dashboard shows the link, counts and money, and never a customer id or email", () => {
  const h = renderDashboard({ company: "Acme", color: "#112233", affiliate: { name: "Ada" }, link: "https://p.example/r/ada", stats, policyText: "Earn 20%." });
  assert.match(h, /https:\/\/p\.example\/r\/ada/); assert.match(h, /\$20\.00/); assert.match(h, /2026-01-02/);
  assert.ok(!/cus_|@/.test(h));
  assert.match(h, /noindex/);
});

test("a hostile brand colour falls back to the default instead of injecting CSS", () => {
  const h = renderJoin({ company: "Acme", color: "red;}</style><script>x", policyText: "p" });
  assert.ok(!h.includes("<script>x"));
});

test("the landing page carries the no-warranty clause, a canonical link, FAQ data and a sponsor link", () => {
  const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /No warranty/); assert.match(html, /rel="canonical"/); assert.match(html, /FAQPage/); assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.ok(!/<script[^>]+src="https?:/.test(html), "no third-party scripts");
});
