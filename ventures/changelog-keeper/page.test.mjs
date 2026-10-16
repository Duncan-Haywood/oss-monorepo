import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { renderChangelog, renderAdmin, esc } from "./page.mjs";

test("the public page escapes company and entries, and hostile colours fall back", () => {
  const h = renderChangelog({ entries: [{ id: "a1", tag: "new", publishAt: 0, title: "<b>T</b>", body: "x <script>y</script>" }], company: "A&B <i>", color: "red;}</style><script>x", publicUrl: "https://c.example" });
  assert.ok(!h.includes("<b>T</b>") && !h.includes("<script>") && !h.includes("<i>"));
  assert.match(h, /feed\.xml/); assert.match(h, /rel="canonical"/);
});

test("the admin page never embeds a secret and builds the list with textContent", () => {
  const h = renderAdmin({ company: "Acme", color: "#112233" });
  assert.ok(!/innerHTML/.test(h)); assert.match(h, /textContent/); assert.match(h, /type="password"/);
});

test("landing page: no-warranty clause, sample data is labelled, canonical, FAQ, sponsor link, no third-party scripts, uses the shared renderer", () => {
  const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
  for (const re of [/No warranty/, /sample data/, /rel="canonical"/, /FAQPage/, /github\.com\/sponsors\/Duncan-Haywood/, /from "\.\/store\.mjs"/]) assert.match(html, re);
  assert.ok(!/<script[^>]+src="https?:/.test(html));
  assert.equal(esc("<&>"), "&lt;&amp;&gt;");
});
