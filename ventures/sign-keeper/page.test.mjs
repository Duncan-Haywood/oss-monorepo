import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { renderSign, renderAdmin, esc } from "./page.mjs";

test("the signing page escapes the document, title and company, and hostile colours fall back", () => {
  const r = { title: "<b>T</b>", body: "<script>x</script> terms", docHash: "a".repeat(64), signerName: "" };
  const h = renderSign({ r, company: "A&B <i>", color: "red;}</style><script>x", token: "t" });
  assert.ok(!h.includes("<b>T</b>") && !h.includes("<script>x") && !h.includes("<i>"));
  assert.match(h, /name="consent"/); assert.match(h, /class="hp"/); assert.match(h, /Decline/);
});

test("the admin page builds its list with textContent and never embeds a secret", () => {
  const h = renderAdmin({ company: "Acme", color: "#112233" });
  assert.ok(!/innerHTML/.test(h)); assert.match(h, /textContent/); assert.match(h, /type="password"/);
});

test("landing page: no-warranty and not-legal-advice, canonical, FAQ, sponsor link, no third-party scripts", () => {
  const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
  for (const re of [/No warranty/, /not legal advice/i, /rel="canonical"/, /FAQPage/, /github\.com\/sponsors\/Duncan-Haywood/, /sample data/]) assert.match(html, re);
  assert.ok(!/<script[^>]+src="https?:/.test(html));
  assert.equal(esc("<&>"), "&lt;&amp;&gt;");
});
