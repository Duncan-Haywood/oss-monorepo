// The four new mandatory mentions page: its table is bound to mentions-2026-bench.mjs, so a change to
// the creator or the checker that moves a result fails here until the page is updated.
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { caseTable, pageRows, ublResult, draft } from "./mentions-2026-bench.mjs";
import { generateInvoice } from "./generate.mjs";

const read = (f) => fs.readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
const html = read("nouvelles-mentions-obligatoires-facture-2026.html");
const rows = await caseTable();
const official = rows[0].result.official !== null;

test("French page with the disclaimer and the licence line", () => {
  assert.match(html, /<html lang="fr">/);
  assert.match(html, /Sans garantie \(no warranty\)/);
  assert.match(html, /ne constitue pas un conseil juridique, fiscal, financier ou comptable/);
  assert.match(html, /FSL-1\.1-MIT/);
  assert.ok(html.match(/<title>(.*?)<\/title>/)[1].length <= 100);
});

test("the complete invoice carries the four mentions in CII and in UBL", () => {
  const cii = generateInvoice(draft(), { format: "cii", profile: "france" });
  assert.equal(cii.ok, true);
  assert.match(cii.xml, /<ram:BuyerTradeParty>[\s\S]*?<ram:ID schemeID="0002">987654324<\/ram:ID>/);
  assert.match(cii.xml, /<ram:BusinessProcessSpecifiedDocumentContextParameter>\s*<ram:ID>M1<\/ram:ID>/);
  assert.match(cii.xml, /<ram:CategoryCode>S<\/ram:CategoryCode>\s*<ram:DueDateTypeCode>5<\/ram:DueDateTypeCode>\s*<ram:RateApplicablePercent>/);
  assert.match(cii.xml, /<ram:ShipToTradeParty><ram:Name>Chantier Les Tilleuls<\/ram:Name><ram:PostalTradeAddress><ram:PostcodeCode>69570<\/ram:PostcodeCode><ram:LineOne>8 chemin des Vignes<\/ram:LineOne><ram:CityName>Dardilly<\/ram:CityName><ram:CountryID>FR<\/ram:CountryID>/);
  const ubl = generateInvoice(draft(), { format: "ubl", profile: "france" });
  assert.equal(ubl.ok, true);
  assert.match(ubl.xml, /<cac:InvoicePeriod>\s*<cbc:DescriptionCode>3<\/cbc:DescriptionCode>\s*<\/cac:InvoicePeriod>/);
  assert.match(ubl.xml, /<cac:DeliveryLocation><cac:Address><cbc:StreetName>8 chemin des Vignes<\/cbc:StreetName><cbc:CityName>Dardilly<\/cbc:CityName><cbc:PostalZone>69570<\/cbc:PostalZone><cac:Country><cbc:IdentificationCode>FR<\/cbc:IdentificationCode><\/cac:Country><\/cac:Address><\/cac:DeliveryLocation><cac:DeliveryParty><cac:PartyName><cbc:Name>Chantier Les Tilleuls<\/cbc:Name>/);
  assert.match(ubl.xml, /<cac:PartyLegalEntity>[\s\S]*?<cbc:CompanyID schemeID="0002">987654324<\/cbc:CompanyID>/);
});

test("the creator refuses what the rules refuse, and warns on a missing buyer SIREN", () => {
  const byLabel = Object.fromEntries(rows.map((r) => [r.label, r]));
  assert.deepEqual(byLabel["SIREN du client absent (BT-47)"].creator, { wrote: true, warnings: ["buyer.legal_id"] });
  assert.equal(byLabel["SIRET du client (14 chiffres) au lieu du SIREN"].creator.wrote, false);
  assert.equal(byLabel["cadre de facturation absent (BT-23)"].creator.wrote, false);
  assert.equal(byLabel["adresse de livraison sans pays"].creator.wrote, false);
  assert.deepEqual(byLabel["SIRET du client (14 chiffres) au lieu du SIREN"].result.builtin.blocking, ["FR-009"]);
  assert.deepEqual(byLabel["SIREN du client absent (BT-47)"].result.builtin.blocking, ["FR-004"]);
});

test("the creator explains a SIRET given as the buyer's SIREN and the delivery address's missing parts", () => {
  const d = draft(); d.buyer.legal_id = "98765432400019";
  const r = generateInvoice(d, { format: "cii", profile: "france" });
  assert.equal(r.ok, false);
  assert.match(r.errors.find((e) => e.path === "buyer.legal_id").message, /use 987654324/);
  const e = draft(); e.delivery_address = { country: "FR" };
  assert.ok(generateInvoice(e, { format: "cii", profile: "france" }).errors.some((x) => x.path === "delivery_address"));
  const f = draft(); f.vat_on_debits = "oui";
  assert.ok(generateInvoice(f, { format: "cii", profile: "france" }).errors.some((x) => x.path === "vat_on_debits"));
  const g = draft(); g.delivery_country = "BE";
  assert.ok(generateInvoice(g, { format: "cii", profile: "france" }).errors.some((x) => x.path === "delivery_country"));
});

test("the official rules give what the page's table prints", { skip: !official && "slimdom/fontoxpath not installed" }, () => {
  const want = [[], [], ["BR-FR-11_BT-47"], ["BR-FR-32-LEGALID"], ["BR-FR-11_BT-47", "BR-FR-21_BT-49", "BR-FR-32-LEGALID"],
    ["BR-FR-08_BT-23"], [], [], [], ["BR-CL-06"], [], [], ["BR-57"]];
  assert.equal(rows.length, want.length);
  rows.forEach((r, i) => assert.deepEqual(r.result.official.blocking, want[i], r.label));
  for (const tr of pageRows(rows)) assert.ok(html.includes(tr), tr);
  assert.match(html, /Sans cette note, une facture sans SIREN du client passe toutes les règles officielles/);
});

test("the UBL file passes too", { skip: !official && "slimdom/fontoxpath not installed" }, async () => {
  assert.deepEqual((await ublResult()).result.official.blocking, []);
});

test("every rule it links exists", () => {
  for (const [, a] of html.matchAll(/href="br-fr-error-codes\.html#([\w-]+)"/g)) assert.match(read("br-fr-error-codes.html"), new RegExp(`id="${a}"`), a);
});

test("it quotes DGFiP's FAQ and cites the field table, both official hosts", () => {
  assert.match(html, /« Quatre nouvelles mentions sont cependant rendues obligatoires à des fins de gestion des données »/);
  assert.match(html, /« à compter du 1er septembre 2026 »/);
  assert.match(html, /href="https:\/\/www\.impots\.gouv\.fr\/sites\/default\/files\/media\/1_metier\/2_professionnel\/EV\/2_gestion\/290_facturation_electronique\/faq---fe_je-decouvre-la-facturation-electronique\.pdf"/);
  assert.match(html, /href="https:\/\/www\.impots\.gouv\.fr\/facturation-electronique-donnees-de-facture-et-correspondance-des-flux-de-donnees"/);
  for (const bt of ["BT-47", "BT-23", "BT-8", "BT-75 à BT-80"]) assert.ok(html.includes(bt), bt);
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

test("its buttons open the creator and the checker with the France profile; the creator has the fields", () => {
  assert.match(html, /href="create\.html\?profile=france"/);
  assert.match(html, /href="\.\/\?profil=france#drop"/);
  const create = read("create.html");
  for (const id of ["vat_on_debits", "da_street", "da_city", "da_postal_code", "da_country", "da_name"]) assert.match(create, new RegExp(`id="${id}"`), id);
  assert.match(create, /d\.delivery_address = da/);
});

test("linked from the French checker page, the micro-entrepreneur page, the France guide, the creator, the sitemap and llms.txt", () => {
  for (const f of ["verifier-facture-electronique.html", "facture-electronique-micro-entrepreneur.html", "france-e-invoice-mandate.html", "create.html", "sitemap.xml", "llms.txt"]) {
    assert.match(read(f), /nouvelles-mentions-obligatoires-facture-2026\.html/, f);
  }
});
