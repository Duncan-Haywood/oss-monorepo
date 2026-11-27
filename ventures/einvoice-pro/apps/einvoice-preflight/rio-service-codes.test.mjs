import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rioCode, rioEntry, rioCodesFor, rioCodeProblem, COUNTS } from "./rio-service-codes.mjs";
import { checkAbrasf } from "./abrasf.mjs";

const read = (f) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");
const judge = (code, item, day = "2026-03-10") => rioCodeProblem({ code, item, day });

test("the table: 963 codes in 2018, five acts applied", () => {
  assert.deepEqual(COUNTS, { base: 963, added: 35, excluded: 37, rows: 998 });
  assert.equal(rioEntry("010201").desc, "programação");
  assert.equal(rioEntry("01.07.01").desc, "suporte técnico em informática");
  // LC 116's numbers, not Rio's art. 8 list (which has no 17.25 or 07.22).
  assert.ok(rioCodesFor("17.25", "2026-01-01").length > 0);
  assert.ok(rioCodesFor("7.22", "2026-01-01").length > 0);
  assert.equal(rioCode("0102"), null);
  assert.equal(rioCode("16.02"), null);
});

test("a code on the table for the file's subitem passes", () => {
  assert.equal(judge("010201", "1.02"), null);
  assert.equal(judge("01.07.01", "1.07"), null);
  assert.equal(judge("170205", "17.02", "2021-11-03"), null);
});

test("a code from another subitem, a short code and an unknown code", () => {
  const other = judge("010201", "1.07");
  assert.match(other.message, /belongs to LC 116 subitem 1\.02, but ItemListaServico is 1\.07/);
  assert.match(other.message, /010701 \(suporte técnico em informática\)/);
  assert.match(judge("0107", "1.07").message, /six-digit code/);
  assert.match(judge("16.02", "1.01").message, /six-digit code/);
  assert.match(judge("019999", "1.07").message, /not on Rio de Janeiro's Tabela/);
});

test("the dates: 286/2022's and 321/2025's exclusions, 321/2025's additions", () => {
  // Hotel works, excluded from 14 Jul 2022.
  assert.equal(judge("070202", "7.02", "2022-07-13"), null);
  assert.match(judge("070202", "7.02", "2022-07-14").message, /Portaria 286\/2022 excluded it from 14 Jul 2022/);
  // 07.02.47 out, 07.02.87 in, from 1 Jan 2026.
  assert.equal(judge("070247", "7.02", "2025-12-31"), null);
  assert.match(judge("070247", "7.02", "2026-01-01").message, /Portaria 321\/2025 excluded it/);
  assert.match(judge("070287", "7.02", "2025-12-01").message, /came onto Rio's table on 2026-01-01/);
  assert.equal(judge("070287", "7.02", "2026-01-01"), null);
  // 269/2020 and 282/2021's additions.
  assert.match(judge("160205", "16.02", "2019-05-01").message, /2020-02-04/);
  assert.equal(judge("110501", "11.05", "2022-01-01"), null);
  // Before the 2018 table, and with no date: the subitem is still compared.
  assert.match(judge("010201", "1.02", "2010-01-01").note, /before Rio's 2018 table/);
  assert.ok(judge("010201", "1.07", "2010-01-01").message);
  assert.match(judge("010201", "1.02", "").note, /states no date/);
});

test("ABR-026 on an ABRASF file issued by Rio's system, not elsewhere", () => {
  const sp = read("abrasf-compnfse-204.xml");
  const rio = sp.split("<CodigoMunicipio>3550308").join("<CodigoMunicipio>3304557").split("<Uf>SP</Uf>").join("<Uf>RJ</Uf>");
  const withCode = (base, code) => base.replace("<CodigoCnae>6201501</CodigoCnae>", `<CodigoCnae>6201501</CodigoCnae>\n            <CodigoTributacaoMunicipio>${code}</CodigoTributacaoMunicipio>`);
  const abr026 = (t) => checkAbrasf(t).findings.filter((f) => f.rule === "ABR-026");
  assert.equal(abr026(withCode(rio, "010701")).length, 0);
  const f = abr026(withCode(rio, "010201"));
  assert.equal(f.length, 1);
  assert.match(f[0].path, /\/Servico\/CodigoTributacaoMunicipio$/);
  assert.match(f[0].message, /ItemListaServico is 1\.07/);
  // São Paulo's own codes are not Rio's: a São Paulo file is not judged.
  assert.equal(abr026(withCode(sp, "010201")).length, 0);
  assert.equal(checkAbrasf(withCode(rio, "010701")).meta.issuer, "3304557");
});
