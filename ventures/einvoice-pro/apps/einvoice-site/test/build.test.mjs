import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { build, frTypo } from "../build.mjs";
import { COUNTRIES, OFFICIAL_HOSTS, SOURCES } from "../content/deadlines.mjs";
import { CONSENT_VERSION, longDate } from "../content/format.mjs";
import { PAGES, pathOf } from "../content/routes.mjs";
import { LANGS } from "../site.config.mjs";

const SITE = "https://einvoice.test";
const ENV = {
  SITE_URL: SITE,
  CONTROLLER_NAME: "Test Controller GmbH",
  CONTROLLER_ADDRESS: "Teststraße 1, 10115 Berlin",
  CONTROLLER_EMAIL: "privacy@einvoice.test",
};
const out = mkdtempSync(join(tmpdir(), "einvoice-site-"));
const manifest = build({ outDir: out, env: ENV, prod: true });
const read = (rel) => readFileSync(join(out, rel), "utf8");
const fileOf = (path) => `${path.slice(1)}index.html`;
const htmlOf = (id, lang) => read(fileOf(pathOf(id, lang)));
const all = (html, re) => [...html.matchAll(re)].map((m) => m[1]);
// The visible text of a page we built ourselves. Script blocks go first (any case, any
// attributes, an unclosed one runs to the end), then tags; entities are decoded in one pass so
// `&amp;quot;` reads as the six characters `&quot;`, as a browser shows it.
const ENTITIES = { "&amp;": "&", "&#39;": "'", "&quot;": '"' };
const text = (html) =>
  html
    .replace(/<script\b[^>]*>[\s\S]*?(?:<\/script\s*>|$)/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;|&#39;|&quot;/g, (m) => ENTITIES[m]);

test("builds every page in every language", () => {
  assert.equal(manifest.pages.length, PAGES.length * LANGS.length);
  for (const p of manifest.pages) assert.ok(existsSync(join(out, fileOf(p.path))), p.path);
  for (const f of ["index.html", "404.html", "sitemap.xml", "robots.txt", "llms.txt", "_headers"]) {
    assert.ok(existsSync(join(out, f)), f);
  }
});

test("each page: lang, one title, description, one h1, banner; titles unique per language", () => {
  for (const lang of LANGS) {
    const titles = new Set();
    for (const p of PAGES) {
      const html = htmlOf(p.id, lang);
      assert.match(html, new RegExp(`<html lang="${lang}">`), `${p.id}/${lang}`);
      const t = all(html, /<title>([^<]+)<\/title>/g);
      assert.equal(t.length, 1, `${p.id}/${lang} title`);
      assert.ok(!titles.has(t[0]), `duplicate title ${t[0]}`);
      titles.add(t[0]);
      const min = p.index ? 40 : 10;
      assert.match(html, new RegExp(`<meta name="description" content="[^"]{${min},}">`), p.id);
      assert.equal(all(html, /<h1>([\s\S]*?)<\/h1>/g).length, 1, `${p.id}/${lang} h1`);
      assert.match(html, /class="banner"/, `${p.id}/${lang} early-access banner`);
    }
  }
});

test("indexable pages: canonical plus reciprocal hreflang for de, fr, en, nl and x-default", () => {
  for (const p of PAGES.filter((x) => x.index)) {
    for (const lang of LANGS) {
      const html = htmlOf(p.id, lang);
      const canon = all(html, /<link rel="canonical" href="([^"]+)">/g);
      assert.deepEqual(canon, [`${SITE}${pathOf(p.id, lang)}`], `${p.id}/${lang} canonical`);
      const alts = Object.fromEntries(
        [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)].map((m) => [
          m[1],
          m[2],
        ]),
      );
      assert.deepEqual(Object.keys(alts).sort(), [...LANGS, "x-default"].sort());
      assert.equal(alts["x-default"], `${SITE}/`);
      for (const other of LANGS) {
        assert.equal(alts[other], `${SITE}${pathOf(p.id, other)}`);
        // reciprocity: the other language's page points back here
        const back = htmlOf(p.id, other);
        assert.ok(
          back.includes(`hreflang="${lang}" href="${SITE}${pathOf(p.id, lang)}"`),
          `${p.id}: ${other} -> ${lang}`,
        );
      }
    }
  }
});

test("form flow pages are noindex and stay out of the sitemap", () => {
  const sm = read("sitemap.xml");
  for (const p of PAGES.filter((x) => x.flow)) {
    for (const lang of LANGS) {
      assert.match(htmlOf(p.id, lang), /<meta name="robots" content="noindex">/);
      assert.ok(!sm.includes(`${SITE}${pathOf(p.id, lang)}<`), `${p.id}/${lang} in sitemap`);
    }
  }
});

test("sitemap lists exactly the indexable pages with alternates, robots points at it", () => {
  const sm = read("sitemap.xml");
  const locs = all(sm, /<loc>([^<]+)<\/loc>/g).sort();
  const want = [
    `${SITE}/`,
    ...PAGES.filter((p) => p.index).flatMap((p) => LANGS.map((l) => `${SITE}${pathOf(p.id, l)}`)),
  ].sort();
  assert.deepEqual(locs, want);
  assert.match(sm, /xhtml:link rel="alternate" hreflang="x-default"/);
  assert.match(read("robots.txt"), new RegExp(`Sitemap: ${SITE}/sitemap.xml`));
  assert.match(read("robots.txt"), /User-agent: ClaudeBot\nAllow: \/\nDisallow: \/api\//);
});

test("llms.txt: H1, summary, a link for every indexable page in every language", () => {
  const llms = read("llms.txt");
  assert.match(llms, /^# .+\n\n> Early access/);
  assert.match(llms, /Not tax advice/);
  for (const p of PAGES.filter((x) => x.index)) {
    for (const l of LANGS) assert.ok(llms.includes(`](${SITE}${pathOf(p.id, l)})`), `${p.id}/${l}`);
  }
});

test("every source is an official page with a check date", () => {
  for (const [k, s] of Object.entries(SOURCES)) {
    assert.ok(OFFICIAL_HOSTS.includes(new URL(s.url).host), `${k}: ${s.url}`);
    assert.match(s.checked, /^\d{4}-\d{2}-\d{2}$/, k);
    assert.ok(["direct", "search-excerpt"].includes(s.checkedVia), k);
  }
  for (const c of COUNTRIES) {
    for (const d of [...c.deadlines, ...c.rules]) {
      assert.ok(SOURCES[d.source], `${c.key}: unknown source ${d.source}`);
      for (const l of LANGS) assert.ok(d.text[l]?.length > 20, `${c.key} ${d.date} ${l}`);
    }
  }
});

test("country pages cite every source with its URL and check date", () => {
  for (const c of COUNTRIES) {
    for (const lang of LANGS) {
      const html = htmlOf(`deadlines-${c.key}`, lang);
      for (const d of [...c.deadlines, ...c.rules]) {
        const s = SOURCES[d.source];
        assert.ok(html.includes(s.url.replace(/&/g, "&amp;")), `${c.key}/${lang} ${s.url}`);
        assert.ok(html.includes(`<time datetime="${s.checked}">`), `${c.key}/${lang} checked`);
      }
      for (const d of c.deadlines) assert.ok(html.includes(`<time datetime="${d.date}">`));
    }
  }
});

test("no page states a date that is not in the sourced table", () => {
  const iso = new Set([
    ...COUNTRIES.flatMap((c) => c.deadlines.map((d) => d.date)),
    ...Object.values(SOURCES).map((s) => s.checked),
    CONSENT_VERSION,
  ]);
  const MONTHS = {
    de: "Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember",
    fr: "janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre",
    en: "January|February|March|April|May|June|July|August|September|October|November|December",
    nl: "januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december",
  };
  const DAY = { de: "\\d{1,2}\\.", fr: "(?:1er|\\d{1,2})", en: "\\d{1,2}", nl: "\\d{1,2}" };
  for (const lang of LANGS) {
    const allowed = new Set([...iso].map((d) => longDate(d, lang)));
    const re = new RegExp(`${DAY[lang]}[\\s\\u00a0](?:${MONTHS[lang]})[\\s\\u00a0]\\d{4}`, "g");
    for (const p of PAGES) {
      const html = htmlOf(p.id, lang);
      for (const dt of all(html, /<time datetime="([^"]+)"/g)) assert.ok(iso.has(dt), dt);
      for (const m of text(html).matchAll(re)) {
        const found = m[0].replace(/ /g, " ");
        // Rule texts may quote a date inside a sourced sentence (e.g. the BMF letter's own date);
        // those come from deadlines.mjs, so accept any date that appears verbatim there.
        const inData = COUNTRIES.some((c) =>
          [...c.deadlines, ...c.rules].some((d) => d.text[lang].includes(found)),
        );
        assert.ok(allowed.has(found) || inData, `${p.id}/${lang}: unsourced date "${found}"`);
      }
    }
  }
});

test("production build: no placeholders, controller filled in, refuses without it", () => {
  for (const p of manifest.pages) {
    const html = read(fileOf(p.path));
    assert.ok(!/localhost|\[Controller|\[Name, Anschrift|\[Nom, adresse/.test(html), p.path);
  }
  assert.match(htmlOf("privacy", "de"), /Test Controller GmbH/);
  assert.throws(
    () => build({ outDir: join(out, "x"), env: { SITE_URL: SITE }, prod: true }),
    /CONTROLLER_NAME/,
  );
});

test("privacy pages list what the database stores, and no IP", () => {
  const sql = readFileSync(new URL("../migrations/0001_early_access.sql", import.meta.url), "utf8");
  assert.ok(!/\bip\b/i.test(sql.replace(/--.*$/gm, "")), "no IP column");
  const must = {
    en: [
      "email address",
      "role",
      "consent text",
      "hash of the confirmation link",
      "7 days",
      "24 months",
      "Art. 6(1)(a)",
      "Cloudflare",
    ],
    de: [
      "E-Mail-Adresse",
      "Rolle",
      "Einwilligungstextes",
      "Hashwert",
      "7 Tagen",
      "24 Monate",
      "Art. 6 Abs. 1 lit. a",
      "Cloudflare",
    ],
    fr: [
      "adresse e-mail",
      "profil",
      "consentement",
      "hachage",
      "7 jours",
      "24 mois",
      "art. 6, paragraphe 1, point a)",
      "Cloudflare",
    ],
    nl: [
      "e-mailadres",
      "rol",
      "toestemmingstekst",
      "hash van de bevestigingslink",
      "7 dagen",
      "24 maanden",
      "art. 6, lid 1, punt a)",
      "Cloudflare",
    ],
  };
  for (const lang of LANGS) {
    const t = text(htmlOf("privacy", lang)).replace(/ /g, " ");
    for (const w of must[lang]) assert.ok(t.includes(w), `${lang}: "${w}"`);
  }
});

test("early-access form posts to the worker with consent version and a honeypot", () => {
  for (const lang of LANGS) {
    const html = htmlOf("early-access", lang);
    assert.match(html, /<form class="signup" method="post" action="\/api\/early-access">/);
    assert.ok(html.includes(`name="consentVersion" value="${CONSENT_VERSION}"`));
    assert.ok(html.includes(`name="lang" value="${lang}"`));
    assert.match(html, /name="consent" value="yes" required/);
    assert.match(html, /name="website"/);
  }
});

test("the API page asks vendors directly: the early-access form with the vendor role chosen", () => {
  for (const lang of LANGS) {
    const html = htmlOf("api", lang);
    assert.match(html, /<form class="signup" method="post" action="\/api\/early-access">/);
    assert.match(html, /name="role" value="vendor" checked>/);
    assert.equal((html.match(/ checked>/g) ?? []).length, 1, `${lang}: one role pre-selected`);
    assert.ok(html.includes("explain=0"), `${lang}: names validation-only mode`);
    assert.ok(html.includes("x-usage-amount-cents"), `${lang}: says how to read the bill`);
    assert.ok(html.includes("/v1/billing/usage"), `${lang}: names the usage endpoint`);
  }
  // The early-access page itself pre-selects nothing.
  for (const lang of LANGS) assert.ok(!/ checked>/.test(htmlOf("early-access", lang)));
});

test("French typography: no ordinary space before : ; ? ! in French pages", () => {
  assert.equal(frTypo("Détails : x ; « y » ?"), "Détails : x ; « y » ?");
  for (const p of PAGES) {
    const t = text(htmlOf(p.id, "fr"));
    assert.ok(!/ [:;?!»]/.test(t), `${p.id}: ${/.{20} [:;?!»].{0,20}/.exec(t)?.[0]}`);
  }
});

test("no script on any page (CSP script-src 'none')", () => {
  for (const p of manifest.pages) {
    const html = read(fileOf(p.path));
    assert.ok(!/<script(?![^>]*application\/ld\+json)/.test(html), p.path);
  }
  assert.match(read("_headers"), /script-src 'none'/);
});

test("Poland: KSeF dates read directly from the Ministry's site, linked from every page, no KSeF sending claimed", () => {
  const pl = COUNTRIES.find((c) => c.key === "pl");
  assert.deepEqual(
    pl.deadlines.map((d) => `${d.date} ${d.kind}`),
    [
      "2026-02-01 receive",
      "2026-02-01 issue",
      "2026-04-01 issue",
      "2026-12-31 issue",
      "2027-01-01 issue",
    ],
  );
  for (const d of [...pl.deadlines, ...pl.rules]) {
    const s = SOURCES[d.source];
    assert.equal(new URL(s.url).host, "ksef.podatki.gov.pl", d.source);
    assert.equal(s.checkedVia, "direct", d.source);
  }
  const notSending = {
    en: "We do not send invoices to KSeF",
    de: "Wir senden keine Rechnungen an KSeF",
    fr: "Nous n'envoyons pas de factures à KSeF",
    nl: "Wij sturen geen facturen naar KSeF",
  };
  for (const lang of LANGS) {
    const html = htmlOf("deadlines-pl", lang);
    assert.ok(text(html).includes(notSending[lang]), lang);
    assert.ok(
      !html.includes("search-excerpt") && !/<p class="small">\* /.test(html),
      `${lang}: no * note`,
    );
    // Every page's nav and the home page's "checked" list link to the Poland page.
    assert.ok(htmlOf("pricing", lang).includes(`href="${pathOf("deadlines-pl", lang)}"`), lang);
    assert.ok(htmlOf("home", lang).includes("FA(3)"), lang);
  }
  assert.match(read("llms.txt"), /Poland, 2026-04-01 \(issue\).*ksef\.podatki\.gov\.pl/);
  assert.match(read("llms.txt"), /does not send invoices to KSeF/);
});

test("Belgium: Peppol dates read directly from efacture.belgium.be, linked from every page, no Peppol sending claimed", () => {
  const be = COUNTRIES.find((c) => c.key === "be");
  assert.deepEqual(
    be.deadlines.map((d) => `${d.date} ${d.kind}`),
    [
      "2024-03-01 issue",
      "2026-01-01 receive",
      "2026-01-01 issue",
      "2026-03-31 issue",
      "2026-06-30 issue",
    ],
  );
  for (const d of [...be.deadlines, ...be.rules]) {
    const s = SOURCES[d.source];
    assert.equal(new URL(s.url).host, "efacture.belgium.be", d.source);
    assert.equal(s.checkedVia, "direct", d.source);
  }
  // E-reporting has no date in law yet: it must stay a rule, never a dated deadline.
  assert.ok(!be.deadlines.some((d) => d.date.startsWith("2028")));
  const notSending = {
    en: "We are not a Peppol access point",
    de: "Wir sind kein Peppol-Access-Point",
    fr: "Nous ne sommes pas un point d'accès Peppol",
    nl: "Wij zijn geen Peppol-toegangspunt",
  };
  for (const lang of LANGS) {
    const html = htmlOf("deadlines-be", lang);
    assert.ok(text(html).includes(notSending[lang]), lang);
    assert.ok(text(html).includes("0208"), `${lang}: names the scheme it checks`);
    assert.ok(!html.includes("search-excerpt") && !/<p class="small">\* /.test(html), lang);
    assert.ok(htmlOf("pricing", lang).includes(`href="${pathOf("deadlines-be", lang)}"`), lang);
    assert.ok(htmlOf("home", lang).includes(`href="${pathOf("deadlines-be", lang)}"`), lang);
    assert.ok(htmlOf("early-access", lang).includes('name="countries" value="be"'), lang);
  }
  assert.match(read("llms.txt"), /Belgium, 2026-01-01 \(issue\).*efacture\.belgium\.be/);
  assert.match(read("llms.txt"), /not a Peppol access point/);
});

test("Dutch: every page in Dutch for Belgian readers, Belgium first, dates and prices in nl-BE form", () => {
  assert.ok(LANGS.includes("nl"));
  for (const p of PAGES) assert.ok(p.slug.nl !== undefined, `${p.id}: no Dutch slug`);
  assert.equal(pathOf("deadlines-be", "nl"), "/nl/termijnen/belgie/");
  assert.equal(longDate("2026-01-01", "nl"), "1 januari 2026");
  const home = text(htmlOf("home", "nl")).replace(/\s+/g, " ");
  // The lead names the Belgian date from the sourced table, not typed text.
  assert.ok(home.includes("Sinds 1 januari 2026 moeten Belgische btw-plichtige ondernemingen"), "lead");
  assert.ok(home.indexOf("schema 0208") < home.indexOf("CII-XSD-schema"), "Belgium listed first");
  assert.match(htmlOf("pricing", "nl"), /€\u00a0\d+/, "euro sign first with a no-break space");
  assert.match(htmlOf("home", "nl"), /<meta property="og:locale" content="nl_BE">/);
  // KSeF rules have no Dutch templates (einvoice-preflight ROADMAP, "Dutch explanations, part 1"),
  // so the Polish page must not promise a Dutch explanation.
  assert.ok(text(htmlOf("deadlines-pl", "nl")).includes("nog geen Nederlandse uitleg"));
  assert.match(read("llms.txt"), /## Pagina's \(Nederlands\)/);
  assert.match(read("index.html"), /hreflang="nl"/);
});
