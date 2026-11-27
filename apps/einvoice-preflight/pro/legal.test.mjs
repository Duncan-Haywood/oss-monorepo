// The legal pages and the terms version recorded at sign-up. Proprietary (see ../LICENSE).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { test } from "node:test";
import { legalMeta, loadLegal, renderMarkdown } from "./legal.mjs";
import { createProHandler } from "./server.mjs";
import { openSqliteStore } from "./sql-store.mjs";
import { MemoryStore } from "./store.mjs";

const NOW = () => new Date("2026-11-26T10:00:00Z");

async function serve(store = new MemoryStore({ now: NOW })) {
  const server = createServer(createProHandler({ store, env: {}, now: NOW }));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, { key, body } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {}
    return { status: res.status, headers: res.headers, text, json };
  };
  return { store, call, close: () => server.close() };
}

test("renderMarkdown escapes text and renders the subset the legal files use", () => {
  const html = renderMarkdown("# T <x>\n\nA **b** & c\nd\n\n- one\n  two\n- <script>\n\n| A | B |\n| --- | --- |\n| 1 | **2** |\n");
  assert.equal(
    html,
    "<h1>T &lt;x&gt;</h1>\n<p>A <strong>b</strong> &amp; c d</p>\n<ul><li>one two</li><li>&lt;script&gt;</li></ul>\n<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td><strong>2</strong></td></tr></tbody></table>",
  );
  assert.throws(() => renderMarkdown("| A |\n| B |\n"), /separator/);
});

test("legalMeta needs a title and a version line", () => {
  assert.deepEqual(legalMeta("# Terms\n\n**Version 2026-11-26** · X\n"), { title: "Terms", version: "2026-11-26" });
  assert.throws(() => legalMeta("# Terms\n"), /Version/);
});

test("the shipped Terms, Privacy Policy and DPA load, name the operator and say what the code does", () => {
  const legal = loadLegal();
  for (const k of ["terms", "privacy", "dpa"]) {
    assert.match(legal[k].version, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(legal[k].markdown, /Maris Stella Labs LLC/);
    assert.match(legal[k].markdown, /hello@marisstella\.app/);
    assert.doesNotMatch(legal[k].markdown, /attorney|lawyer|counsel|certif/i, "no claim of legal review or certification");
    assert.doesNotMatch(legal[k].page, /<script/i);
  }
  // Facts the privacy page states that the code must keep true.
  assert.match(legal.privacy.markdown, /Invoice contents are not stored/);
  assert.match(legal.privacy.markdown, /first 12 characters/);
  assert.match(legal.privacy.markdown, /Anthropic/);
  assert.match(legal.terms.markdown, /30 days/);
});

test("the DPA is incorporated by the Terms and Privacy Policy and matches the code it describes", () => {
  const { terms, privacy, dpa } = loadLegal();
  assert.equal(dpa.title, "Data Processing Agreement");
  assert.match(terms.markdown, /Data Processing Agreement\*\* published at \/app\/dpa forms part of these Terms/);
  assert.match(privacy.markdown, /published at \/app\/dpa/);
  // Article 28(3) points (a) to (g) are each there, and the SCC modules for a controller or processor customer.
  for (const point of ["(a)", "(b)", "(c)", "(d)", "(e)", "(f)", "(g)"]) assert.ok(dpa.markdown.includes(`\n${point} `), point);
  assert.match(dpa.markdown, /Module Two\*\* \(controller to processor\)/);
  assert.match(dpa.markdown, /Module Three\*\* \(processor to processor\)/);
  assert.match(dpa.markdown, /2021\/914/);
  // Every sub-processor the DPA names is in the Privacy Policy's list too.
  const annex3 = dpa.markdown.split("## Annex III")[1];
  assert.ok(annex3);
  const names = [...annex3.matchAll(/^\| ([^|]+?) \|/gm)].map((r) => r[1]).filter((n) => !/^(Sub-processor|---)/.test(n));
  assert.ok(names.length >= 2);
  for (const n of names) assert.ok(privacy.markdown.includes(n.replace(/ \(.*$/, "")), `${n} missing from the privacy page`);
  // Facts the DPA states that the code must keep true.
  assert.match(dpa.markdown, /Invoice contents are not stored/);
  const server = readFileSync(new URL("./server.mjs", import.meta.url), "utf8");
  assert.match(dpa.markdown, /at most 5,000 entries/);
  assert.match(server, /cache\.size > 5000/, "the DPA says the explanation cache holds at most 5,000 entries");
  assert.match(server, /new Map\(\);[^\n]*\n[^\n]*cache\.set\.bind/, "the explanation cache is in memory only");
  assert.match(dpa.markdown, /not in place yet/, "backups are not claimed before they exist");
});

test("GET /app/terms and /app/privacy serve the pages under the workspace CSP; /v1/legal names the versions", async (t) => {
  const s = await serve();
  t.after(s.close);
  const terms = await s.call("GET", "/app/terms");
  assert.equal(terms.status, 200);
  assert.match(terms.headers.get("content-type"), /text\/html/);
  assert.match(terms.headers.get("content-security-policy"), /default-src 'none'/);
  assert.match(terms.text, /<h1>Terms of Service<\/h1>/);
  assert.match(terms.text, /href="\/app\/privacy"/);
  const privacy = await s.call("GET", "/app/privacy/");
  assert.equal(privacy.status, 200);
  assert.match(privacy.text, /<h1>Privacy Policy<\/h1>/);
  const meta = await s.call("GET", "/v1/legal");
  assert.equal(meta.status, 200);
  const legal = loadLegal();
  assert.deepEqual(meta.json.terms, {
    title: "Terms of Service",
    version: legal.terms.version,
    url: "/app/terms",
    translations: { de: { title: "Nutzungsbedingungen", url: "/app/de/terms" }, fr: { title: "Conditions d'utilisation", url: "/app/fr/terms" } },
  });
  assert.equal(meta.json.privacy.url, "/app/privacy");
  assert.equal(meta.json.dpa.title, "Data Processing Agreement");
  assert.equal(meta.json.dpa.version, legal.dpa.version);
  assert.equal(meta.json.dpa.url, "/app/dpa");
  assert.deepEqual(meta.json.dpa.translations.de, { title: "Auftragsverarbeitungsvertrag", url: "/app/de/dpa" });
  const dpa = await s.call("GET", "/app/dpa");
  assert.equal(dpa.status, 200);
  assert.match(dpa.headers.get("content-security-policy"), /default-src 'none'/);
  assert.match(dpa.text, /<h1>Data Processing Agreement<\/h1>/);
  assert.match(dpa.text, /href="\/app\/terms"/);
  assert.doesNotMatch((await s.call("GET", "/app/dpa.md")).text, /Data Processing Agreement/, "the raw Markdown is not served");
});

test("sign-up records the Terms version accepted, and a stale version is refused with 409", async (t) => {
  const s = await serve();
  t.after(s.close);
  const version = loadLegal().terms.version;
  const ok = await s.call("POST", "/v1/signup", { body: { name: "Kanzlei A", acceptTerms: true, termsVersion: version } });
  assert.equal(ok.status, 201);
  assert.equal(ok.json.account.termsVersion, version);
  assert.equal((await s.store.getAccount(ok.json.account.id)).termsVersion, version);
  const old = await s.call("POST", "/v1/signup", { body: { name: "Kanzlei B", acceptTerms: true, termsVersion: "2020-01-01" } });
  assert.equal(old.status, 409);
  assert.equal(old.json.error.code, "terms_changed");
  // an older page that sends no version still gets the version the server serves
  const plain = await s.call("POST", "/v1/signup", { body: { name: "Kanzlei C", acceptTerms: true } });
  assert.equal(plain.json.account.termsVersion, version);
  const acct = await s.call("GET", "/v1/account", { key: plain.json.apiKey });
  assert.equal(acct.json.account.termsVersion, version);
});

test("SqlStore keeps the terms version (column added on start), null for admin-made accounts", async () => {
  const store = await openSqliteStore(":memory:", { now: NOW });
  const a = await store.createAccount({ name: "A", termsVersion: "2026-11-26" });
  const b = await store.createAccount({ name: "B" });
  assert.equal((await store.getAccount(a.id)).termsVersion, "2026-11-26");
  assert.equal((await store.getAccount(b.id)).termsVersion, null);
  store.close();
});

test("the German and French translations are current, complete and say the English text governs", () => {
  const legal = loadLegal();
  assert.deepEqual(legal.staleTranslations, [], "update the translations when the English text changes (same version date)");
  const governs = { de: /Verbindlich ist allein die englische Fassung/, fr: /Seule la version anglaise .* fait foi/ };
  for (const k of ["terms", "privacy", "dpa"]) {
    const en = legal[k];
    const headings = (md) => md.split("\n").filter((l) => /^#{1,3} /.test(l)).length;
    const tableRows = (md) => md.split("\n").filter((l) => /^\|/.test(l)).length;
    for (const lang of ["de", "fr"]) {
      const tr = en.translations[lang];
      assert.ok(tr, `${lang}/${k}.md is missing`);
      assert.equal(tr.version, en.version);
      assert.match(tr.markdown, governs[lang]);
      assert.ok(tr.markdown.includes(`/app/${k}`), `${lang}/${k}.md points at the English text`);
      assert.match(tr.markdown, /Maris Stella Labs LLC/);
      assert.match(tr.markdown, /hello@marisstella\.app/);
      assert.doesNotMatch(tr.markdown, /attorney|lawyer|counsel|certif|Anwalt|avocat/i, "no claim of legal review or certification");
      // Same structure as the English text: every heading and every table row has its counterpart.
      assert.equal(headings(tr.markdown), headings(en.markdown), `${lang}/${k}.md headings`);
      assert.equal(tableRows(tr.markdown), tableRows(en.markdown), `${lang}/${k}.md table rows`);
      // Every number the English text commits to (days, months, characters, entries, clauses) is there too.
      const nums = (md) => [...md.replace(/\b(\d+)[.,\u00a0 ](\d{3})\b/g, "$1$2").matchAll(/\b\d+\b/g)].map((x) => x[0]).sort();
      assert.deepEqual(nums(tr.markdown.replace(/\*\*Verbindlich.*|\*\*Unverbindliche.*|\*\*Traduction.*/g, "")), nums(en.markdown), `${lang}/${k}.md numbers`);
      assert.match(tr.page, new RegExp(`<html lang="${lang}">`));
      assert.match(tr.page, /href="\/app\/terms" hreflang="en"|hreflang="en"/);
      assert.doesNotMatch(tr.page, /<script/i);
    }
    assert.match(en.page, /href="\/app\/de\/[a-z]+" hreflang="de"/);
    assert.match(en.page, /href="\/app\/fr\/[a-z]+" hreflang="fr"/);
  }
  // The DPA translations keep the Article 28(3) points and both SCC modules.
  for (const point of ["(a)", "(b)", "(c)", "(d)", "(e)", "(f)", "(g)"]) {
    assert.ok(legal.dpa.translations.de.markdown.includes(`\n${point} `), `de ${point}`);
    assert.ok(legal.dpa.translations.fr.markdown.includes(`\n${point} `), `fr ${point}`);
  }
  assert.match(legal.dpa.translations.de.markdown, /Modul Zwei\*\*[^|]*; \*\*Modul Drei/);
  assert.match(legal.dpa.translations.fr.markdown, /Module deux\*\*[^|]*; \*\*module trois/);
  assert.match(legal.privacy.translations.de.markdown, /Rechnungsinhalte werden nicht gespeichert/);
  assert.match(legal.privacy.translations.fr.markdown, /Le contenu des factures n'est pas conservé/);
});

test("a translation left behind by a change to the English text is not served", () => {
  const read = (key, lang) => {
    const md = `# ${lang ?? "en"} ${key}\n\n**Version ${lang === "fr" ? "2020-01-01" : "2026-11-26"}** · Maris Stella Labs LLC\n\nText.\n`;
    if (lang === "de" && key === "dpa") return null;
    return md;
  };
  const legal = loadLegal(read);
  assert.deepEqual(Object.keys(legal.terms.translations), ["de"]);
  assert.deepEqual(Object.keys(legal.dpa.translations), []);
  assert.equal(legal.staleTranslations.length, 3);
  assert.match(legal.staleTranslations[0], /fr\/terms\.md is version 2020-01-01/);
  assert.doesNotMatch(legal.dpa.page, /hreflang/);
});

test("GET /app/de/* and /app/fr/* serve the translations; an unknown language is not routed", async (t) => {
  const s = await serve();
  t.after(s.close);
  const de = await s.call("GET", "/app/de/terms");
  assert.equal(de.status, 200);
  assert.match(de.headers.get("content-security-policy"), /default-src 'none'/);
  assert.match(de.text, /<html lang="de">/);
  assert.match(de.text, /<h1>Nutzungsbedingungen<\/h1>/);
  assert.match(de.text, /href="\/app\/de\/privacy"/);
  assert.match(de.text, /href="\/app\/terms" hreflang="en"/);
  const fr = await s.call("GET", "/app/fr/dpa/");
  assert.equal(fr.status, 200);
  assert.match(fr.text, /<h1>Accord de sous-traitance<\/h1>/);
  assert.match(fr.text, /Annexe III/);
  assert.notEqual((await s.call("GET", "/app/es/terms")).status, 200);
});
