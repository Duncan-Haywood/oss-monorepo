import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkNfeEvent } from "./nfe-event.mjs";
import { nfeItemTaxes, RTC_EVENTS } from "./nfe-rtc-events.mjs";
import { parseCfdiXml } from "./cfdi-xml.mjs";
import { preflightDocuments } from "./report.mjs";

const read = (f) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");
const batch = read("nfe-events-rtc.xml");
const nfe = read("nfe-4.00-reform.xml");
const proc = read("nfe-event-211130-proc.xml");
const cancel = read("nfe-event-110001.xml");
const KEY = "35261112345678000195550010000042171314159261";

// One event of the batch, alone in an envEvento.
function one(code) {
  const m = new RegExp(`<evento versao="1\\.00">(?:(?!</evento>)[\\s\\S])*<tpEvento>${code}</tpEvento>[\\s\\S]*?</evento>`).exec(batch);
  assert.ok(m, code);
  return `<envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><idLote>1</idLote>${m[0]}</envEvento>`;
}
const swap = (text, from, to) => { assert.ok(text.includes(from), from); return text.replace(from, to); };
const msgs = (text, opts) => checkNfeEvent(text, opts).findings.map((f) => `${f.rule} ${f.message}`).join("\n");

test("every made-up reform event is clean, alone and with its NF-e", () => {
  const codes = Object.keys(RTC_EVENTS).filter((c) => c !== "110001");
  assert.equal(codes.length, 11);
  for (const c of codes) {
    const t = one(c);
    assert.deepEqual(checkNfeEvent(t).findings, [], c);
    const both = checkNfeEvent(t, { nfe });
    assert.deepEqual(both.findings, [], c);
    assert.equal(both.meta.tpEvento, c);
    assert.equal(both.meta.name, RTC_EVENTS[c].desc);
  }
  const all = checkNfeEvent(batch, { nfe });
  assert.deepEqual(all.findings, []);
  assert.deepEqual(all.skipped, []);
  assert.equal(all.meta.events, 11);
  assert.equal(all.meta.types.length, 11);
});

test("schema: description, author type, state code, order and number formats (cStat 493)", () => {
  const t = one("211130");
  assert.match(msgs(swap(t, "<descEvento>Imobilização de Item", "<descEvento>Imobilizacao de Item")), /BRE-030 descEvento is "Imobilizacao de Item"; the schema allows only "Imobilização de Item"/);
  assert.match(msgs(swap(t, "<tpAutor>2", "<tpAutor>1")), /BRE-030 tpAutor is "1"; event 211130 is sent by the NF-e's buyer, tpAutor 2/);
  assert.match(msgs(swap(t, "<cOrgaoAutor>33", "<cOrgaoAutor>91")), /cOrgaoAutor "91" is not a state's IBGE code/);
  assert.match(msgs(swap(t, "<vIBS>0.13</vIBS>", "<vIBS>0.130</vIBS>")), /vIBS "0.130" is not a decimal with two places/);
  assert.match(msgs(swap(t, "<qImobilizado>5.0000", "<qImobilizado>5.00")), /qImobilizado "5.00" is not a quantity with four decimals/);
  assert.match(msgs(swap(t, "<uImobilizado>UN", "<uImobilizado>UNIDADE")), /uImobilizado "UNIDADE" has 7 characters; the schema takes 1 to 6/);
  assert.match(msgs(swap(t, "<vIBS>0.13</vIBS><vCBS>1.17</vCBS>", "<vCBS>1.17</vCBS><vIBS>0.13</vIBS>")), /BRE-030 vIBS is missing \(or out of order: vCBS comes first\)/);
  assert.match(msgs(swap(t, '<gImobilizacao nItem="2"', '<gImobilizacao nItem="1"')), /nItem 1 appears twice/);
  assert.match(msgs(swap(one("112150"), "<dPrevEntrega>2027-02-15", "<dPrevEntrega>2027-02-30")), /dPrevEntrega "2027-02-30" is not a date/);
  assert.match(msgs(swap(one("211128"), "<indAceitacao>1", "<indAceitacao>2")), /indAceitacao "2" is not one of 0, 1/);
  assert.match(msgs(swap(one("112110"), "<indQuitacao>1", "<indQuitacao>0")), /indQuitacao "0" is not 1/);
  // A missing versao is allowed (the attribute is optional in every RTC schema); a wrong one is not.
  assert.deepEqual(checkNfeEvent(swap(t, '<detEvento versao="1.00">', "<detEvento>")).findings, []);
  assert.match(msgs(swap(t, '<detEvento versao="1.00">', '<detEvento versao="1.01">')), /detEvento\/@versao is "1.01"/);
});

test("the succession events: the NT's own description is not the schema's", () => {
  const t = one("212110");
  const nt = swap(t, "em Operação de Sucessão", "em Operações de Sucessão");
  const m = msgs(nt);
  assert.match(m, /BRE-030 descEvento .*NT 2025.002 section 8.9 prints \("Operações"\); the v1.40 schema says "Operação"/);
  assert.match(msgs(swap(t, "<tpAutor>8", "<tpAutor>2")), /sent by the successor company, tpAutor 8/);
});

test("with the NF-e: item numbers, IBS and CBS values, quantities (1096-1101)", () => {
  const t = one("211130");
  assert.match(msgs(swap(t, '<gImobilizacao nItem="2"', '<gImobilizacao nItem="7"'), { nfe }), /BRE-014 Item 7: the NF-e has no det with nItem 7 \(SEFAZ cStat 1096, rule 2P24-10\)/);
  assert.match(msgs(swap(t, "<vIBS>0.13</vIBS>", "<vIBS>0.27</vIBS>"), { nfe }), /BRE-031 Item 1: vIBS 0.27 is more than the NF-e item's IBS, 0.26 \(gIBSCBS\) \(SEFAZ cStat 1097, rule 2P25-10\)/);
  assert.match(msgs(swap(t, "<vCBS>1.17</vCBS>", "<vCBS>2.35</vCBS>"), { nfe }), /BRE-031 Item 1: vCBS 2.35 is more than the NF-e item's CBS, 2.34 .*cStat 1098/);
  assert.match(msgs(swap(t, "<qImobilizado>5.0000", "<qImobilizado>11.0000"), { nfe }), /BRE-032 Item 1: qImobilizado 11.0000 UN is more than the NF-e item's qCom 10 UN \(SEFAZ cStat 1100, rule 2P29-10\)/);
  // In another unit the rule does not compare.
  const kg = checkNfeEvent(swap(swap(t, "<qImobilizado>5.0000", "<qImobilizado>11.0000"), "<uImobilizado>UN", "<uImobilizado>KG"), { nfe });
  assert.deepEqual(kg.findings, []);
  assert.match(kg.skipped.join(" "), /unit KG is not the NF-e item's uCom UN/);
  assert.match(msgs(swap(one("211140"), "<qComb>5.0000", "<qComb>10.0001"), { nfe }), /qComb 10.0001 UN is more than .*cStat 1101, rule 2P28-10/);
  assert.match(msgs(swap(one("211150"), "<vCredIBS>0.26", "<vCredIBS>0.27"), { nfe }), /vCredIBS 0.27 is more than the NF-e item's IBS, 0.26 .*1097/);
  // An event whose section lists no item rule: a missing item is a warning.
  const w = checkNfeEvent(swap(one("211124"), 'nItem="1"', 'nItem="9"'), { nfe }).findings;
  assert.equal(w.length, 1);
  assert.equal(w[0].severity, "warning");
  assert.match(w[0].message, /Section 8.15 lists no rule/);
  // Values above the item's are not checked where the NT lists no such rule (perishing, 211124).
  assert.deepEqual(checkNfeEvent(swap(one("211124"), "<vIBS>0.13", "<vIBS>9.99"), { nfe }).findings, []);
});

test("with the NF-e: the author and the date", () => {
  assert.match(msgs(swap(one("211128"), "<CNPJ>98765432000198", "<CNPJ>11222333000181"), { nfe }), /BRE-012 tpAutor is 2 \(buyer\), but the author 11222333000181 is not the NF-e's dest 98765432000198 \(SEFAZ cStat 575/);
  assert.match(msgs(swap(one("112110"), "<CNPJ>12345678000195", "<CNPJ>98765432000198")), /BRE-012 tpAutor is 1 \(issuer\), but the author CNPJ 98765432000198 is not the issuer in chNFe .*cStat 574/);
  assert.match(msgs(swap(one("211130"), "<dhEvento>2027-01-20", "<dhEvento>2026-11-01"), { nfe }), /BRE-013 dhEvento 2026-11-01T10:00:00-03:00 is before the NF-e's dhEmi.*577/);
  const d = checkNfeEvent(swap(one("112150"), "<dPrevEntrega>2027-02-15", "<dPrevEntrega>2026-11-01"), { nfe }).findings;
  assert.equal(d[0].rule, "BRE-034");
  assert.equal(d[0].severity, "warning");
  assert.match(checkNfeEvent(one("211130")).skipped.join(" "), /the buyer as author \(575\), the event date \(577\) and each item against the NF-e were not checked/);
});

test("the key: year, month and number (615, 616, 619)", () => {
  const t = one("211128");
  const k = (to) => t.replaceAll(KEY, to);
  assert.match(msgs(k(KEY.slice(0, 2) + "05" + KEY.slice(4))), /year digits are 05.*cStat 615/);
  assert.match(msgs(k(KEY.slice(0, 4) + "13" + KEY.slice(6))), /month digits are 13.*cStat 616/);
  assert.match(msgs(k(KEY.slice(0, 25) + "000000000" + KEY.slice(34))), /NF-e number .* is zero.*cStat 619/);
  assert.match(msgs(k(KEY.slice(0, 20) + "65" + KEY.slice(22))), /NFC-e key \(model 65\); the event 211128 .* is for a model 55 NF-e only/);
});

test("a duplicate event in one batch (573)", () => {
  const ev = /<evento versao="1\.00">[\s\S]*?<\/evento>/.exec(one("211128"))[0];
  const twice = one("211128").replace(ev, ev + ev);
  assert.match(msgs(twice), /BRE-015 Event 2 repeats event 1.*cStat 573/);
  const next = one("211128").replace(ev, ev + ev.replace("<nSeqEvento>1", "<nSeqEvento>2").replace(`${KEY}01"`, `${KEY}02"`));
  assert.ok(!/BRE-015/.test(msgs(next)));
});

test("the cancellation (110001) alone and against the event it cancels (459, 1113, 1178, 460)", () => {
  const alone = checkNfeEvent(cancel);
  assert.deepEqual(alone.findings, []);
  assert.match(alone.skipped.join(" "), /event this cancellation cancels was not given/);
  const both = checkNfeEvent(cancel, { cancelled: proc });
  assert.deepEqual(both.findings, []);
  assert.deepEqual(both.skipped, []);
  assert.match(msgs(swap(cancel, "<nSeqEvento>1", "<nSeqEvento>2").replace(`${KEY}01"`, `${KEY}02"`), { cancelled: proc }), /BRE-033 .*nSeqEvento 2.*nSeqEvento 1.*cStat 459, rule 1P06-10/);
  assert.match(msgs(swap(cancel, "<tpEventoAut>211130", "<tpEventoAut>211140"), { cancelled: proc }), /BRE-033 The cancellation names event 211140.*459/);
  assert.match(msgs(swap(cancel, "<CNPJ>98765432000198", "<CNPJ>11222333000181"), { cancelled: proc }), /BRE-033 The cancellation is sent by 11222333000181; the event it cancels was sent by 98765432000198 \(SEFAZ cStat 1113/);
  assert.match(msgs(swap(cancel, "<cOrgaoAutor>33", "<cOrgaoAutor>35"), { cancelled: proc }), /BRE-033 cOrgaoAutor is 35; the event it cancels gave 33 \(SEFAZ cStat 1178/);
  assert.match(msgs(swap(cancel, "<nProtEvento>135270000012345", "<nProtEvento>135270000012346"), { cancelled: proc }), /BRE-033 nProtEvento 135270000012346 is not the protocol SEFAZ gave the event, 135270000012345 \(SEFAZ cStat 460/);
  assert.match(msgs(swap(cancel, "<tpEventoAut>211130", "<tpEventoAut>110001")), /BRE-030 tpEventoAut .* A cancellation cannot itself be cancelled \(rule P23-10\)/);
  assert.match(msgs(swap(cancel, "<nProtEvento>135270000012345", "<nProtEvento>1352700000123")), /nProtEvento "1352700000123" is not a protocol number of 15 or 17 digits/);
});

test("types the package has no schema for are named, not misread", () => {
  const t = swap(swap(one("211128"), "<tpEvento>211128", "<tpEvento>112120"), `ID211128${KEY}`, `ID112120${KEY}`);
  const r = checkNfeEvent(t);
  assert.deepEqual(r.findings, []);
  assert.match(r.skipped.join(" "), /112120 \(Importação em ALC\/ZFM não convertida em isenção\) has no schema in the NT 2025.002 v1.40 events package/);
  for (const odd of ["constructor", "toString", "__proto__"]) {
    const o = checkNfeEvent(swap(one("211128"), "<tpEvento>211128", `<tpEvento>${odd}`));
    assert.deepEqual(o.findings, [], odd);
    assert.match(o.skipped.join(" "), /is not one of the NT 2025.002 reform events/);
  }
});

test("a monophase (fuel) item's IBS and CBS come from gIBSCBSMono", () => {
  const det = parseCfdiXml(`<det xmlns="http://www.portalfiscal.inf.br/nfe" nItem="1"><prod><uCom>L</uCom><qCom>1000.0000</qCom></prod><imposto><IBSCBS><CST>620</CST><cClassTrib>620001</cClassTrib><gIBSCBSMono><vTotIBSMonoItem>123.45</vTotIBSMonoItem><vTotCBSMonoItem>234.56</vTotCBSMonoItem></gIBSCBSMono></IBSCBS></imposto></det>`).root;
  assert.deepEqual(nfeItemTaxes(det), { qCom: 1000, uCom: "L", ibs: 12345, cbs: 23456, source: "gIBSCBSMono" });
});

test("the main report: a batch with its NF-e, and a cancellation with the event it cancels", async () => {
  const r = await preflightDocuments([{ name: "events.xml", source: batch }, { name: "nfe.xml", source: nfe }]);
  const ev = r.reports.find((x) => x.file === "events.xml");
  assert.match(ev.envelope, /batch of 11 reform events/);
  assert.match(ev.envelope, /with nfe\.xml/);
  assert.deepEqual(ev.errors, []);
  const c = await preflightDocuments([{ name: "cancel.xml", source: swap(cancel, "<cOrgaoAutor>33", "<cOrgaoAutor>35") }, { name: "imob.xml", source: proc }]);
  const cr = c.reports.find((x) => x.file === "cancel.xml");
  assert.match(cr.envelope, /event 110001 \("Cancelamento de Evento"\).*the cancelled event imob\.xml/);
  assert.match(cr.errors.map((e) => e.message).join(" "), /cStat 1178/);
  const single = await preflightDocuments([{ name: "imob.xml", source: proc }]);
  assert.match(single.reports[0].envelope, /event 211130 \("Imobilização de Item"\).*registered \(cStat 135\/136\)/);
});
