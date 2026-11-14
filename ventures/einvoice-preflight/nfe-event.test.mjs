import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkNfeEvent, convertCredPresEvent, looksLikeNfeEvent, LAYOUTS } from "./nfe-event.mjs";
import { looksLikeNfe } from "./nfe.mjs";
import { preflightDocuments } from "./report.mjs";

const clean = readFileSync(new URL("./fixtures/nfe-event-211110.xml", import.meta.url), "utf8");
const nfe = readFileSync(new URL("./fixtures/nfe-4.00-reform.xml", import.meta.url), "utf8");
const swap = (from, to, text = clean) => { assert.ok(text.includes(from), from); return text.replace(from, to); };
const rules = (text, opts) => checkNfeEvent(text, opts).findings.map((f) => f.rule);
const msgs = (text, opts) => checkNfeEvent(text, opts).findings.map((f) => `${f.rule} ${f.message}`).join("\n");

// The v1.20/v1.30 layout, as Unimake's Uninfe example (Evento_211110-ped-eve.xml) writes it,
// with a valid key so only the layout is at issue.
const OLD = swap(/<gCredPresOper nItem="1">[\s\S]*<\/gCredPresOper>/.exec(clean)[0], `<gCredPres nItem="1">
          <vBC>1500.00</vBC>
          <gIBS>
            <cCredPres>01</cCredPres>
            <pCredPres>1.0000</pCredPres>
            <vCredPres>15.00</vCredPres>
          </gIBS>
          <gCBS>
            <cCredPres>01</cCredPres>
            <pCredPres>1.0000</pCredPres>
            <vCredPres>15.00</vCredPres>
          </gCBS>
        </gCredPres>`);

test("the made-up v1.40 event is clean, alone and with its NF-e", () => {
  const r = checkNfeEvent(clean);
  assert.deepEqual(r.findings, []);
  assert.equal(r.meta.layout, "1.40");
  assert.equal(r.meta.tpAutor, "2");
  assert.match(r.skipped.join(" "), /NF-e for chNFe was not given/);
  const both = checkNfeEvent(clean, { nfe });
  assert.deepEqual(both.findings, []);
  assert.deepEqual(both.skipped, []);
  assert.ok(looksLikeNfeEvent(clean));
  assert.ok(!looksLikeNfe(clean));
  assert.ok(!looksLikeNfeEvent(nfe));
  assert.deepEqual(LAYOUTS["1.40"].tpAutor, ["1", "2"]);
});

test("envelope: the Id, verEvento, the key's check digit, model and state", () => {
  assert.match(msgs(swap("926101\">", "926102\">")), /BRE-010.*cStat 572/);
  assert.match(msgs(swap("<verEvento>1.00", "<verEvento>1.01")), /BRE-010.*cStat 492/);
  const key = "35261112345678000195550010000042171314159261";
  const bad = clean.replaceAll(key, key.slice(0, 43) + "2");
  assert.match(msgs(bad), /BRE-011.*check digit is 2; the other 43 digits give 1.*cStat 236/);
  const k65 = key.slice(0, 20) + "65" + key.slice(22);
  assert.match(msgs(clean.replaceAll(key, k65)), /NFC-e key \(model 65\).*cStat 1049/);
  assert.match(msgs(clean.replaceAll(key, key.slice(0, 20) + "00" + key.slice(22))), /model digits are 00/);
  assert.match(msgs(swap("<chNFe>3526", "<chNFe>3526x")), /not a 44-character/);
});

test("author: CNPJ check digits, issuer in the key (574), buyer on the NF-e (575)", () => {
  assert.match(msgs(swap("<CNPJ>98765432000198", "<CNPJ>98765432000199")), /BRE-012.*cStat 489/);
  // tpAutor 1 but sent by the buyer: the key names the issuer 12345678000195.
  assert.match(msgs(swap("<tpAutor>2", "<tpAutor>1")), /BRE-012.*not the issuer in chNFe \(12345678000195\).*cStat 574/);
  assert.deepEqual(rules(swap("<CNPJ>98765432000198", "<CNPJ>12345678000195").replace("<tpAutor>2", "<tpAutor>1")), []);
  // tpAutor 2 from someone who is not the NF-e's dest: needs the NF-e.
  const other = swap("<CNPJ>98765432000198", "<CNPJ>11222333000181");
  assert.deepEqual(rules(other), []);
  assert.match(msgs(other, { nfe }), /cStat 575/);
});

test("with the NF-e: item numbers (1096) and the event date (577)", () => {
  assert.match(msgs(swap('nItem="1"', 'nItem="7"'), { nfe }), /BRE-014.*no det with nItem 7.*cStat 1096/);
  assert.deepEqual(rules(swap('nItem="1"', 'nItem="2"'), { nfe }), []);
  assert.match(msgs(swap("2027-01-15T09:00:00-03:00", "2026-11-11T09:00:00-03:00"), { nfe }), /BRE-013.*cStat 577/);
  // An NF-e with another key is not compared, and says so.
  const r = checkNfeEvent(swap('nItem="1"', 'nItem="7"'), { nfe: nfe.replace("314159261\"", "314159262\"") });
  assert.deepEqual(r.findings.map((f) => f.rule), []);
  assert.match(r.skipped.join(" "), /not the event's chNFe/);
});

test("detEvento schema: description, codes, order, counts and number patterns", () => {
  assert.match(msgs(swap("Solicitação de Apropriação", "Solicitacao de Apropriacao")), /BRE-002.*descEvento/);
  assert.match(msgs(swap("<cOrgaoAutor>33", "<cOrgaoAutor>99")), /BRE-002.*cOrgaoAutor 99/);
  assert.match(msgs(swap("<tpAutor>2", "<tpAutor>3")), /BRE-002.*tpAutor 3/);
  assert.match(msgs(swap("<verAplic>einvoice-preflight", "<verAplic> einvoice")), /BRE-002.*verAplic/);
  assert.match(msgs(swap("<vBCCredPres>1500.00", "<vBCCredPres>1500.5")), /BRE-002.*TDec_1302/);
  assert.match(msgs(swap("<pCredPres>1.0000", "<pCredPres>1.00000")), /BRE-002.*TDec_0302_04/);
  assert.match(msgs(swap('nItem="1"', 'nItem="991"')), /BRE-002.*1 to 990/);
  assert.match(msgs(swap("<cCredPres>01", "<cCredPres> 01")), /BRE-002.*not two digits/);
  const item = /<gCredPresOper[\s\S]*?<\/gCredPresOper>/.exec(clean)[0];
  assert.match(msgs(swap(item, item + item)), /nItem 1 appears twice.*2P24-05/);
  assert.match(msgs(swap(item, "")), /gCredPresOper is missing/);
  assert.match(msgs(swap("<vBCCredPres>1500.00</vBCCredPres>\n          <cCredPres>01</cCredPres>", "<cCredPres>01</cCredPres>\n          <vBCCredPres>1500.00</vBCCredPres>")), /out of order/);
});

test("the cCredPres table: unknown code (1055), groups the code takes (1050/1053/1054/1058)", () => {
  assert.match(msgs(swap("<cCredPres>01", "<cCredPres>14")), /BRE-020.*cCredPres 14 is not in.*cStat 1055/);
  // 05 is CBS only: the IBS group is refused (1053).
  assert.match(msgs(swap("<cCredPres>01", "<cCredPres>05")), /BRE-020.*takes no IBS.*cStat 1053.*2P26-10/);
  // 08 is IBS only: the CBS group is refused (1050).
  assert.match(msgs(swap("<cCredPres>01", "<cCredPres>08")), /BRE-020.*takes no CBS.*cStat 1050/);
  const noCbs = swap(/\s*<gCBSCredPres>[\s\S]*?<\/gCBSCredPres>/.exec(clean)[0], "");
  assert.match(msgs(noCbs), /requires the CBS.*cStat 1058.*2P30-20/);
  const noIbs = swap(/\s*<gIBSCredPres>[\s\S]*?<\/gIBSCredPres>/.exec(clean)[0], "");
  assert.match(msgs(noIbs), /requires the IBS.*cStat 1054/);
});

test("warnings: code not appropriated by event, date before the credit starts, value off its base", () => {
  const w = checkNfeEvent(swap("<cCredPres>01", "<cCredPres>04")).findings;
  assert.ok(w.some((f) => f.rule === "BRE-022" && f.severity === "warning" && /not mark cCredPres 04 as appropriated by event/.test(f.message)));
  const early = checkNfeEvent(swap("2027-01-15", "2026-12-15")).findings;
  assert.equal(early.filter((f) => f.rule === "BRE-022").length, 2);
  assert.ok(early.every((f) => f.severity === "warning"));
  const off = checkNfeEvent(swap("<vCredPres>15.00", "<vCredPres>16.00")).findings;
  assert.deepEqual(off.map((f) => [f.rule, f.severity]), [["BRE-021", "warning"]]);
  // a cent of rounding is allowed
  assert.deepEqual(rules(swap("<vCredPres>15.00", "<vCredPres>15.01")), []);
});

test("the old v1.20/v1.30 layout is named, and the converter rewrites it to v1.40", () => {
  const r = checkNfeEvent(OLD);
  assert.deepEqual(r.findings.map((f) => f.rule), ["BRE-003"]);
  assert.equal(r.meta.layout, "1.20/1.30");
  const c = convertCredPresEvent(OLD);
  assert.equal(c.changed, 1);
  assert.deepEqual(c.problems, []);
  assert.deepEqual(rules(c.xml), []);
  assert.equal(c.xml.replace(/\s+/g, ""), clean.replace(/\s+/g, ""));
  // two different codes in one item cannot be held by v1.40
  const mixed = convertCredPresEvent(OLD.replace(/(<gCBS>\s*<cCredPres>)01/, "$102"));
  assert.equal(mixed.changed, 0);
  assert.match(mixed.problems[0], /gIBS gives cCredPres 01 and gCBS 02/);
  assert.match(checkNfeEvent(OLD.replace(/(<gCBS>\s*<cCredPres>)01/, "$102")).findings[0].fix, /one code per item/);
});

test("other events and roots: skipped or refused, not misread", () => {
  const cce = swap("<tpEvento>211110", "<tpEvento>110110");
  const r = checkNfeEvent(cce);
  assert.match(r.skipped.join(" "), /110110 is not 211110/);
  assert.deepEqual(r.findings, []);
  assert.match(msgs("<Invoice/>"), /BRE-001/);
  assert.match(msgs("<envEvento xmlns='http://www.portalfiscal.inf.br/nfe'/>"), /BRE-002.*no evento/);
  const proc = `<procEventoNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">${/<evento [\s\S]*<\/evento>/.exec(clean)[0]}<retEvento versao="1.00"><infEvento><cStat>135</cStat></infEvento></retEvento></procEventoNFe>`;
  const p = checkNfeEvent(proc);
  assert.deepEqual(p.findings, []);
  assert.equal(p.meta.registered, true);
});

test("the main report reads the event and pairs it with its NF-e from the same batch", async () => {
  const alone = await preflightDocuments([{ name: "event.xml", source: clean }]);
  assert.match(alone.reports[0].envelope, /presumed-credit appropriation event \(211110\)/);
  assert.deepEqual(alone.reports[0].errors, []);
  const pair = await preflightDocuments([{ name: "nfe.xml", source: nfe }, { name: "event.xml", source: swap('nItem="1"', 'nItem="7"') }]);
  const ev = pair.reports.find((r) => r.file === "event.xml");
  assert.match(ev.errors.map((f) => f.message).join(), /cStat 1096/);
  assert.match(ev.envelope, /with nfe\.xml/);
});
