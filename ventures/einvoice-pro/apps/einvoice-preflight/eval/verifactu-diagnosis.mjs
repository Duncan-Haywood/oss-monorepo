// Seeded-fault check for verifactu.mjs: build N random RegistroAlta records whose
// stored Huella was computed the way a buggy billing system would (one known slip
// each), and count how often the checker (a) flags VF-001 and (b) names the slip.
// node eval/verifactu-diagnosis.mjs [N]
import { huellaOf, huellaPayload, readVerifactu, recordFindings } from "../verifactu.mjs";

const N = Number(process.argv[2] || 500);
let seed = 20261115;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const NS = "https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd";
const pad = (n) => String(n).padStart(2, "0");

// Each slip: how the XML is written vs how the buggy system hashed it.
const SLIPS = {
  "amounts-2dp": (f) => ({ xml: { ...f, importe: String(Number(f.importe)) }, hashed: { ...f, importe: Number(f.importe).toFixed(2), cuota: Number(f.cuota).toFixed(2) } }),
  "amounts-short": (f) => ({ xml: f, hashed: { ...f, importe: String(Number(f.importe)), cuota: String(Number(f.cuota)) } }),
  "no-prev": (f) => ({ xml: f, hashed: { ...f, prev: "" } }),
  "prev-lower": (f) => ({ xml: f, hashed: { ...f, prev: f.prev.toLowerCase() } }),
  "tz-z": (f) => ({ xml: { ...f, generated: f.generated.replace(/[+-]\d{2}:\d{2}$/, "+00:00") }, hashed: { ...f, generated: f.generated.replace(/[+-]\d{2}:\d{2}$/, "Z") } }),
  "tz-none": (f) => ({ xml: f, hashed: { ...f, generated: f.generated.replace(/[+-]\d{2}:\d{2}$/, "") } }),
  "ms": (f) => ({ xml: f, hashed: { ...f, generated: f.generated.replace(/(T\d{2}:\d{2}:\d{2})/, "$1.000") } }),
  "iso-date": (f) => ({ xml: f, hashed: { ...f, date: f.date.replace(/^(\d{2})-(\d{2})-(\d{4})$/, "$3-$2-$1") } }),
  "url-encoded": (f) => ({ xml: f, hashed: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, encodeURIComponent(v)])) }),
  "value-changed": (f) => ({ xml: f, hashed: { ...f, number: f.number + "X" } }),
};

function record(f, huella) {
  return `<sum1:RegistroAlta xmlns:sum1="${NS}"><sum1:IDFactura><sum1:IDEmisorFactura>${f.issuer}</sum1:IDEmisorFactura><sum1:NumSerieFactura>${f.number.replace(/&/g, "&amp;")}</sum1:NumSerieFactura><sum1:FechaExpedicionFactura>${f.date}</sum1:FechaExpedicionFactura></sum1:IDFactura><sum1:TipoFactura>${f.type}</sum1:TipoFactura><sum1:CuotaTotal>${f.cuota}</sum1:CuotaTotal><sum1:ImporteTotal>${f.importe}</sum1:ImporteTotal><sum1:Encadenamiento><sum1:RegistroAnterior><sum1:IDEmisorFactura>${f.issuer}</sum1:IDEmisorFactura><sum1:NumSerieFactura>P</sum1:NumSerieFactura><sum1:FechaExpedicionFactura>${f.date}</sum1:FechaExpedicionFactura><sum1:Huella>${f.prev}</sum1:Huella></sum1:RegistroAnterior></sum1:Encadenamiento><sum1:FechaHoraHusoGenRegistro>${f.generated}</sum1:FechaHoraHusoGenRegistro><sum1:TipoHuella>01</sum1:TipoHuella><sum1:Huella>${huella}</sum1:Huella></sum1:RegistroAlta>`;
}

const rows = {};
for (let i = 0; i < N; i++) {
  const base = Math.round(rnd() * 500000) / 100;
  const cuota = Math.round(base * pick([0.04, 0.1, 0.21]) * 100) / 100;
  const d = 1 + Math.floor(rnd() * 28), m = 1 + Math.floor(rnd() * 12), h = Math.floor(rnd() * 24);
  const f = {
    issuer: pick(["A39200019", "89890001K", "B12345674"]),
    number: `${pick(["FV", "A", "2026/", "S&R-"])}${Math.floor(rnd() * 99999)}`,
    date: `${pad(d)}-${pad(m)}-2026`, type: pick(["F1", "F2", "R1"]),
    cuota: cuota.toFixed(2), importe: (base + cuota).toFixed(2),
    prev: huellaOf(String(rnd())),
    generated: `2026-${pad(m)}-${pad(d)}T${pad(h)}:${pad(Math.floor(rnd() * 60))}:${pad(Math.floor(rnd() * 60))}${pick(["+01:00", "+02:00", "+00:00"])}`,
  };
  for (const [slip, make] of Object.entries(SLIPS)) {
    const { xml, hashed } = make(f);
    const r = readVerifactu(record(xml, huellaOf(huellaPayload("alta", hashed))))[0];
    const hit = recordFindings(r).find((x) => x.rule === "VF-001");
    const row = (rows[slip] ||= { n: 0, flagged: 0, named: 0, unchanged: 0, other: 0 });
    row.n++;
    if (JSON.stringify(xml) === JSON.stringify(hashed)) { row.unchanged++; continue; }
    if (hit) row.flagged++;
    if (hit?.diagnosis?.includes(slip)) row.named++;
    else if (hit?.diagnosis) row.other++;
  }
}
console.log(`| slip | records | slip left the string unchanged | VF-001 raised | slip named | other variant named |`);
console.log(`| --- | ---: | ---: | ---: | ---: | ---: |`);
for (const [k, r] of Object.entries(rows)) console.log(`| ${k} | ${r.n} | ${r.unchanged} | ${r.flagged} | ${r.named} | ${r.other} |`);
