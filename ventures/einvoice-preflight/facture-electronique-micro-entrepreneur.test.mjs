// The French micro-entrepreneur page: its table is bound to micro-entrepreneur-bench.mjs, so a
// change to the creator or the checker that moves a result fails here until the page is updated.
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { caseTable, pageRows, ublResult, withoutFranceProfile } from "./micro-entrepreneur-bench.mjs";

const read = (f) => fs.readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
const html = read("facture-electronique-micro-entrepreneur.html");
const rows = await caseTable();
const official = rows[0].result.official !== null;

test("French page with the disclaimer and the licence line", () => {
  assert.match(html, /<html lang="fr">/);
  assert.match(html, /Sans garantie \(no warranty\)/);
  assert.match(html, /ne constitue pas un conseil juridique, fiscal, financier ou comptable/);
  assert.match(html, /FSL-1\.1-MIT/);
});

test("the creator writes the correct invoice and refuses each mistake the rules reject", () => {
  assert.equal(rows[0].creator.wrote, true);
  assert.deepEqual(rows[0].result.builtin.blocking, []);
  for (const r of rows.slice(1, -1)) assert.equal(r.creator.wrote, false, r.label);
  assert.deepEqual(rows.at(-1).creator, { wrote: true, warnings: ["buyer.endpoint"] });
});

test("the official rules give what the page's table prints", { skip: !official && "slimdom/fontoxpath not installed" }, () => {
  const want = [[], ["BR-E-02"], ["BR-FR-10_BT-30"], ["BR-FR-10_BT-30", "BR-FR-32-LEGALID"], ["BR-E-10"], ["BR-S-05"],
    ["BR-FR-05_BT-22_PMD"], ["BR-FR-05_BT-22_PMT"], ["BR-FR-08_BT-23"], ["BR-FR-12_BT-49"]];
  rows.forEach((r, i) => assert.deepEqual(r.result.official.blocking, want[i], r.label));
  for (const tr of pageRows(rows)) assert.ok(html.includes(tr), tr);
});

test("the UBL file passes too, and the EN 16931 profile alone fails the five BR-FR rules the page names", { skip: !official && "slimdom/fontoxpath not installed" }, async () => {
  assert.deepEqual((await ublResult()).official.blocking, []);
  const e = (await withoutFranceProfile()).official.blocking.sort();
  assert.deepEqual(e, ["BR-FR-05_BT-22_AAB", "BR-FR-05_BT-22_PMD", "BR-FR-05_BT-22_PMT", "BR-FR-08_BT-23", "BR-FR-10_BT-30"]);
  assert.match(html, /elle en déclenche cinq : le SIREN \(BR-FR-10\), le cadre de facturation \(BR-FR-08\) et les trois notes codées \(BR-FR-05\)/);
});

test("every rule it links exists", () => {
  for (const [, a] of html.matchAll(/href="br-fr-error-codes\.html#([\w-]+)"/g)) assert.match(read("br-fr-error-codes.html"), new RegExp(`id="${a}"`), a);
  for (const [, s] of html.matchAll(/href="rules\/fr\/([\w-]+)\.html"/g)) assert.ok(fs.existsSync(new URL(`./rules/fr/${s}.html`, import.meta.url)), s);
});

const DEADLINES = new URL("../einvoice-pro/apps/einvoice-site/content/deadlines.mjs", import.meta.url);

test("the dates are the deadline file's own sentences, with its DGFiP sources", { skip: !fs.existsSync(DEADLINES) && "einvoice-site not in this checkout" }, () => {
  const deadlines = fs.readFileSync(DEADLINES, "utf8");
  for (const sentence of [
    "Toutes les entreprises, quelle que soit leur taille, doivent être en capacité de recevoir des factures électroniques, par l'intermédiaire d'une plateforme agréée.",
    "Les PME et les micro-entreprises doivent émettre leurs factures au format électronique, et transmettre leur e-reporting, au plus tard à cette date. Elles peuvent entrer volontairement plus tôt.",
    "UBL, CII ou un format mixte composé d'un fichier de données structurées et d'un fichier image (c'est le cas de Factur-X)",
  ]) {
    assert.ok(deadlines.includes(sentence), `deadlines.mjs: ${sentence}`);
    assert.ok(html.includes(sentence), sentence);
  }
  for (const url of [...html.matchAll(/href="(https:\/\/www\.impots\.gouv\.fr[^"]+)"/g)].map((m) => m[1])) assert.ok(deadlines.includes(url), url);
});

test("its buttons open the creator and the checker with the France profile, and both honour it", () => {
  assert.match(html, /href="create\.html\?profile=france"/);
  assert.match(html, /href="\.\/\?profil=france#drop"/);
  const create = read("create.html");
  assert.match(create, /<option value="france">/);
  assert.match(create, /new URLSearchParams\(location\.search\)\.get\("profile"\)/);
  assert.match(create, /function frenchExample\(\)/);
});

test("FAQPage schema matches the visible questions and answers", () => {
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(ld["@type"], "FAQPage");
  for (const q of ld.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(q.acceptedAnswer.text), q.name);
  }
});

test("no price claim, no validity claim, and the paid service is described as not on sale", () => {
  assert.doesNotMatch(html, /[$€]\s?\d/);
  assert.doesNotMatch(html, /est valide|est conforme|garantit|certifiée? conforme/);
  assert.match(html, /Rien n'est encore en vente/);
});

test("linked from the French checker page, the France guide, the creator, the sitemap and llms.txt", () => {
  for (const f of ["verifier-facture-electronique.html", "france-e-invoice-mandate.html", "create.html", "sitemap.xml", "llms.txt"]) {
    assert.match(read(f), /facture-electronique-micro-entrepreneur\.html/, f);
  }
});
