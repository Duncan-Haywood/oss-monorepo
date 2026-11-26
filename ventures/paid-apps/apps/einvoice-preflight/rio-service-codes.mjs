// Rio de Janeiro's own service codes (ABR-026). A Nota Carioca NFS-e names its service twice:
// ItemListaServico, the LC 116 subitem (four digits, "0102"), and CodigoTributacaoMunicipio,
// one of the six-digit codes of Rio's Tabela de Códigos de Serviços (Portaria F/SUBTF/CIS
// 256/2018, art. 1: the issuer "deverá ... utilizar, para identificar o serviço, um dos códigos
// da Tabela"). The table's first four digits are LC 116's subitem numbers, not the renumbered
// list of Rio's own Lei 691/1984 art. 8 (it has 03.05, 07.22, 13.05 and 17.25, which that list
// lacks), so a code must start with the file's ItemListaServico.
//
// The table changed four times: 269/2020 and 282/2021 added five codes, 286/2022 excluded the
// eighteen hotel-works codes (in force 14 Jul 2022), and 321/2025 added thirty and excluded
// nineteen from 1 Jan 2026 (among them fourteen of
// 07.06's floor, wall and window finishes; it adds 07.02 codes "quando vinculada a obra de
// construção civil"). rio-service-codes-data.mjs holds every code with the
// day it came on and went off the table; build-rio-codes.mjs reads the acts.
//
// An offline observation, not the municipality's acceptance and not tax advice. An act after
// 321/2025 that this file has not read would show here as a code "not on the table".
import TABLE, { SOURCE, COUNTS } from "./rio-service-codes-data.mjs";

export { SOURCE, COUNTS };
export const RIO = "3304557";
export const TABLE_FROM = "2018-08-01";

const CODES = new Map();
for (const line of TABLE.split("\n")) {
  const [code, desc, from, to] = line.split("\t");
  CODES.set(code.replace(/\./g, ""), { code, desc, from, to });
}

/** Six digits from "010201" or "01.02.01"; null for anything else. */
export function rioCode(raw) {
  const s = String(raw ?? "").trim();
  if (/^\d{6}$/.test(s)) return s;
  const m = /^(\d{2})\.(\d{2})\.(\d{2})$/.exec(s);
  return m ? m[1] + m[2] + m[3] : null;
}

const dotted = (six) => `${six.slice(0, 2)}.${six.slice(2, 4)}.${six.slice(4)}`;
const lcOf = (six) => `${Number(six.slice(0, 2))}.${six.slice(2, 4)}`;

/** The table's entry for a code, or undefined. */
export function rioEntry(raw) {
  const six = rioCode(raw);
  return six ? CODES.get(six) : undefined;
}

/** The codes on the table on a day (YYYY-MM-DD) for an LC 116 subitem ("1.02"). */
export function rioCodesFor(item, day) {
  const out = [];
  for (const [six, e] of CODES) if (lcOf(six) === item && (!e.from || e.from <= day) && (!e.to || day <= e.to)) out.push(e);
  return out;
}

function suggest(item, day) {
  const list = item ? rioCodesFor(item, day) : [];
  if (!list.length) return "";
  const shown = list.slice(0, 6).map((e) => `${e.code.replace(/\./g, "")} (${e.desc.length > 60 ? `${e.desc.slice(0, 57).replace(/\s+\S*$/, "")} ...` : e.desc})`);
  return ` The table's codes for subitem ${item}${day ? ` on ${day}` : ""}: ${shown.join("; ")}${list.length > 6 ? `; and ${list.length - 6} more` : ""}.`;
}

/**
 * Judge CodigoTributacaoMunicipio on a file issued by Rio's system.
 * code: the element's text; item: the LC 116 subitem from ItemListaServico ("1.02") or null;
 * day: the competence or issue date (YYYY-MM-DD) or "".
 * Returns { message, fix } for a finding, { note } when only part could be judged, or null.
 */
export function rioCodeProblem({ code, item, day }) {
  const raw = String(code ?? "").trim();
  if (!raw) return null;
  const six = rioCode(raw);
  if (!six) {
    return {
      message: `CodigoTributacaoMunicipio is "${raw}"; Rio de Janeiro's Nota Carioca takes a six-digit code from its Tabela de Códigos de Serviços (Portaria F/SUBTF/CIS 256/2018), such as 010201.${suggest(item, day || "9999-12-31").replace(/^ The table's/, " Its")}`,
      fix: "Write the six-digit code from Rio's table, digits only (the first four are the LC 116 subitem in ItemListaServico), not the subitem itself or the national cTribNac.",
    };
  }
  const e = CODES.get(six);
  if (!e) {
    return {
      message: `CodigoTributacaoMunicipio ${six} is not on Rio de Janeiro's Tabela de Códigos de Serviços (Portaria F/SUBTF/CIS 256/2018 as amended to 321/2025; ${COUNTS.rows} codes read).${suggest(item, day || "9999-12-31")}`,
      fix: "Pick the code that describes the service from Rio's table; Nota Carioca checks the code against it. If the code is newer than Portaria 321/2025, the table read here is out of date.",
    };
  }
  const label = `${six} (${e.code}, "${e.desc.length > 90 ? `${e.desc.slice(0, 87).replace(/\s+\S*$/, "")} ...` : e.desc}")`;
  if (item && lcOf(six) !== item) {
    return {
      message: `CodigoTributacaoMunicipio ${label} belongs to LC 116 subitem ${lcOf(six)}, but ItemListaServico is ${item}.${suggest(item, day || "9999-12-31")}`,
      fix: `Rio's codes start with the subitem: either ItemListaServico is ${lcOf(six).replace(".", "").padStart(4, "0")} or the code is one of subitem ${item}'s.`,
    };
  }
  if (!day) return { note: `CodigoTributacaoMunicipio ${six}: on Rio's table; the file states no date, so whether it was on the table then is not judged` };
  if (day < TABLE_FROM) return { note: `CodigoTributacaoMunicipio ${six}: dated ${day}, before Rio's 2018 table (Portaria 256/2018, 1 Aug 2018); the older table is not read, so only the subitem is compared` };
  if (e.from && day < e.from) {
    return {
      message: `CodigoTributacaoMunicipio ${label} came onto Rio's table on ${e.from}${e.from === "2026-01-01" ? " (Portaria 321/2025)" : ""}, after this file's date ${day}.${suggest(lcOf(six), day)}`,
      fix: "Use a code that was on the table on the competence date, or check the date.",
    };
  }
  if (e.to && day > e.to) {
    const act = e.to === "2022-07-13" ? "Portaria 286/2022 excluded it from 14 Jul 2022" : "Portaria 321/2025 excluded it from 1 Jan 2026";
    return {
      message: `CodigoTributacaoMunicipio ${label} is no longer on Rio's table: ${act}, and this file is dated ${day}.${suggest(lcOf(six), day)}`,
      fix: "Pick the code on the table at the competence date that describes the service (the codes listed above are the subitem's).",
    };
  }
  return null;
}
