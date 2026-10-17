import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { renderForm, renderAdmin, esc } from "./page.mjs";

test("the collection form escapes titles and company, and hostile colours fall back", () => {
  const h = renderForm({ form: { slug: "x", title: "<b>T</b>", prompt: "p" }, company: "A&B <i>", color: "red;}</style><script>x" });
  assert.ok(!h.includes("<b>T</b>") && !h.includes("<script>x") && !h.includes("<i>"));
  assert.match(h, /required/); assert.match(h, /name="consent"/); assert.match(h, /class="hp"/);
});

test("the admin page never embeds a secret and builds the list with textContent", () => {
  const h = renderAdmin({ company: "Acme", color: "#112233" });
  assert.ok(!/innerHTML/.test(h)); assert.match(h, /textContent/); assert.match(h, /type="password"/);
});

test("landing page: no-warranty clause, sample data is labelled, canonical, FAQ, sponsor link, no third-party scripts", () => {
  const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
  for (const re of [/No warranty/, /sample data/, /rel="canonical"/, /FAQPage/, /github\.com\/sponsors\/Duncan-Haywood/]) assert.match(html, re);
  assert.ok(!/<script[^>]+src="https?:/.test(html));
  assert.equal(esc("<&>"), "&lt;&amp;&gt;");
});
