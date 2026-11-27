// Reproduce eval/iss-city-rates-curitiba-2026-11-16.md: node eval/iss-city-rates-rio-corpus.mjs <dir of downloaded NFS-e XML>.
// One row per file that names Curitiba (4106902): layout, environment, rate, item, year,
// Simples flag, special regime and any ABR-025/NFSE-037 message; then counts.
import { readFileSync, readdirSync } from "node:fs";
const V = new URL("../", import.meta.url).href;
const { checkAbrasf } = await import(V + "abrasf.mjs");
const { checkNfse } = await import(V + "nfse.mjs");
const dir = process.argv[2];
const rows = [];
const g = (t, re) => (t.match(re) || [])[1];
for (const f of readdirSync(dir).sort()) {
  const t = readFileSync(`${dir}/${f}`, "utf8");
  if (!/4106902/.test(t)) continue;
  const nat = /sped\.fazenda\.gov\.br\/nfse/.test(t);
  let r; try { r = nat ? checkNfse(t) : checkAbrasf(t); } catch (e) { rows.push({ f: f.slice(0, 10), err: String(e).slice(0, 80) }); continue; }
  const hit = r.findings.filter((x) => x.rule === "NFSE-037" || x.rule === "ABR-025");
  rows.push({
    f: f.slice(0, 10), nat,
    incid: g(t, /<cLocIncid>(\d+)/) || g(t, /<(?:\w+:)?MunicipioIncidencia>(\d+)/) || "",
    rate: g(t, /<pAliqAplic>([\d.]+)/) || g(t, /<pAliq>([\d.]+)/) || g(t, /<(?:\w+:)?Aliquota>([\d.]+)/) || "",
    item: g(t, /<cTribNac>(\d+)/) || g(t, /<(?:\w+:)?ItemListaServico>([^<]+)/) || "",
    year: g(t, /<dCompet>(\d{4})/) || g(t, /<(?:\w+:)?Competencia>(\d{4})/) || g(t, /<(?:\w+:)?DataEmissao>(\d{4})/) || "",
    simples: g(t, /<opSimpNac>(\d)/) || g(t, /<(?:\w+:)?OptanteSimplesNacional>(\d)/) || "",
    regime: g(t, /<regEspTrib>(\d)/) || g(t, /<(?:\w+:)?RegimeEspecialTributacao>(\d)/) || "",
    hit: hit.map((x) => `${x.rule}: ${x.message.slice(0, 140)}`).join(" | "),
    notes: (r.skipped || []).filter((s) => /rate table/.test(s)).join(" | "),
  });
}
for (const row of rows) console.log(JSON.stringify(row));
console.log(`files naming 4106902: ${rows.length}; flagged: ${rows.filter((r) => r.hit).length}`);
