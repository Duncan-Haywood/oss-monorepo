import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const read = (f) => fs.readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
const html = read("verifier-facture-electronique.html");

test("French page with the disclaimer and the licence line", () => {
  assert.match(html, /<html lang="fr">/);
  assert.match(html, /Sans garantie \(no warranty\)/);
  assert.match(html, /ne constitue pas un conseil juridique, fiscal, financier ou comptable/);
  assert.match(html, /Free to use and source available/);
  assert.match(html, /FSL-1\.1-MIT/);
});

test("states the DGFiP dates the einvoice-site deadline file checked, with the same sources", () => {
  for (const d of ["1er septembre 2026", "1er septembre 2027 au plus tard", "plateforme agréée", "Quatre nouvelles mentions"]) assert.ok(html.includes(d), d);
  const deadlines = read("../einvoice-pro/apps/einvoice-site/content/deadlines.mjs");
  for (const url of [
    "https://www.impots.gouv.fr/professionnel/je-decouvre-la-facturation-electronique",
    "https://www.impots.gouv.fr/sites/default/files/media/1_metier/2_professionnel/EV/2_gestion/290_facturation_electronique/faq---fe_je-decouvre-la-facturation-electronique.pdf",
  ]) {
    assert.ok(html.includes(url), url);
    assert.ok(deadlines.includes(url), `deadlines.mjs still cites ${url}`);
  }
  // The French sentences are the deadline file's own, so a re-check there shows up here.
  for (const sentence of [
    "Toutes les entreprises, quelle que soit leur taille, doivent être en capacité de",
    "Elles peuvent entrer volontairement plus tôt.",
    "UBL, CII ou un format mixte composé d'un fichier de données structurées et d'un fichier image (c'est le cas de Factur-X)",
  ]) {
    assert.ok(deadlines.includes(sentence), `deadlines.mjs: ${sentence}`);
    assert.ok(html.includes(sentence), sentence);
  }
});

test("its links open the checker with the rules preset, and the checker honours them", () => {
  assert.match(html, /href="\.\/\?profil=france#drop"/);
  assert.match(html, /href="\.\/\?profil=en16931#drop"/);
  const index = read("index.html");
  assert.match(index, /q\.get\("profil"\)/);
  assert.match(index, /france: 1/);
  for (const id of ["france", "official"]) assert.match(index, new RegExp(`<input id="${id}" type="checkbox"`));
});

test("only claims checks the French profile runs", () => {
  const profile = read("profile.mjs");
  for (const id of ["FR-002", "FR-003", "FR-004", "FR-005", "FR-006", "FR-007", "FR-008"]) assert.match(profile, new RegExp(`"${id}"`));
  // The debits option and the delivery address are not checked, and the page says so.
  assert.match(html, /Non vérifié : [^<]*débits[^<]*adresse de livraison/);
});

test("every rule it links has a French page", () => {
  const links = [...html.matchAll(/href="rules\/fr\/([\w-]+)\.html"/g)].map((m) => m[1]);
  assert.ok(links.length >= 9);
  for (const s of links) assert.ok(fs.existsSync(new URL(`./rules/fr/${s}.html`, import.meta.url)), s);
  assert.ok(fs.existsSync(new URL("./br-fr-error-codes.html", import.meta.url)));
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

test("linked from the checker, the English France page, the sitemap and llms.txt", () => {
  assert.match(read("index.html"), /href="verifier-facture-electronique\.html"/);
  assert.match(read("france-e-invoice-mandate.html"), /href="verifier-facture-electronique\.html"/);
  assert.match(read("sitemap.xml"), /verifier-facture-electronique\.html/);
  assert.match(read("llms.txt"), /verifier-facture-electronique\.html/);
});
