// Reproduce eval/iss-city-rates-2026-11-15.md: node eval/iss-city-rates-corpus.mjs <dir of downloaded NFS-e XML>.
// Prints one row per file: layout, city of incidence, rate, item, year, Simples flag and any ABR-025/NFSE-037 message.
import { readFileSync, readdirSync } from "node:fs";
const V = new URL("../", import.meta.url).href;
const { checkAbrasf } = await import(V + "abrasf.mjs");
const { checkNfse } = await import(V + "nfse.mjs");
const dir = process.argv[2];
const rows = [];
for (const f of readdirSync(dir)) {
  const t = readFileSync(`${dir}/${f}`, "utf8");
  const nat = /sped\.fazenda\.gov\.br\/nfse/.test(t);
  let r; try { r = nat ? checkNfse(t) : checkAbrasf(t); } catch (e) { rows.push({ f, err: String(e) }); continue; }
  const city = (t.match(/<cLocIncid>(\d+)/) || t.match(/<MunicipioIncidencia>(\d+)/) || [])[1];
  const rate = (t.match(/<pAliqAplic>([\d.]+)/) || t.match(/<pAliq>([\d.]+)/) || t.match(/<(?:\w+:)?Aliquota>([\d.]+)/) || [])[1];
  const item = (t.match(/<cTribNac>(\d+)/) || t.match(/<ItemListaServico>([^<]+)/) || [])[1];
  const year = (t.match(/<dCompet>(\d{4})/) || t.match(/<Competencia>(\d{4})/) || t.match(/<DataEmissao>(\d{4})/) || [])[1];
  const simples = (t.match(/<opSimpNac>(\d)/) || t.match(/<OptanteSimplesNacional>(\d)/) || [])[1];
  const city37 = r.findings.filter((x) => x.rule === "NFSE-037" || x.rule === "ABR-025");
  rows.push({ f: f.slice(0, 10), nat, city, rate, item, year, simples, hit: city37.map((x) => x.message).join(" | "), skippedCity: (r.skipped || []).filter((s) => /rate table/.test(s)).length });
}
console.log(JSON.stringify(rows, null, 0).replace(/\},\{/g, "},\n{"));
