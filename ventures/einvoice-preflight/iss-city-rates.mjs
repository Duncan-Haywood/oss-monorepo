// A city's own ISS (ISSQN) rate for each service, shared by the ABRASF (ABR-025) and national
// NFS-e (NFSE-037) checkers. iss-rate.mjs judges a rate against LC 116's national 2% to 5%
// band; this module asks the narrower question: is the stated rate one the city's own law
// sets for that service?
//
// São Paulo (IBGE 3550308), Lei 13.701/2003, art. 16 as amended up to Lei 18.270/2025 (the
// consolidated text on legislacao.prefeitura.sp.gov.br, read 2026-11-15; its list of amending
// laws ends with 18.095/2024 and 18.270/2025, neither of which touches art. 16). The current
// wording of art. 16:
//   I   2%   a) items 4 and 5; subitems 1.09, 2.01, 6.04, 8.01, 11.02, 11.03, 11.05, 12.01,
//               12.03, 12.05, 13.04, 15.09, 15.14, 16.01, 17.05, 19.01 (Lei 18.066/2023);
//            b)-r) named parts of other subitems (cleaning of buildings in 7.10, insurance
//               brokerage in 10.01, ballet and concerts in 12.07, 12.11 whole, school transport
//               and taxis in 16.02, cobblers in 14.01, unestablished individuals in 7.10, 7.11,
//               11.02, 14.01, 14.09, 17.02, 37.01, fund and card administration in 15.01, the
//               exchange's 15.12, 15.15, 15.16, 21.01 whole, meal vouchers and platform
//               administration in 17.11, payment facilitators in 15.10, tourism in 9.02,
//               platform intermediation in 10.05, franchise brokerage in 10.04, visual
//               communication in 23.01, 13.01-13.03 except notaries, and 17.07 whole);
//   II  2.5% a) stands and convention centres in 3.02; b) 17.09 whole;
//   III 2.9% item 1 except 1.09, and 17.24;
//   IV  5%   every other service.
//
// The numbers above are São Paulo's own list (art. 1), not LC 116's. LC 116 vetoed 3.01,
// 7.14, 7.15, 13.01 and 17.07 and kept the gaps; São Paulo closed them. Matching the two lists'
// texts (eval/iss-city-rates-2026-11-15.md) shows exactly four shifted runs, every other
// subitem keeping its number:
//   SP 3.01-3.04  = LC 3.02-3.05      SP 13.01-13.04 = LC 13.02-13.05
//   SP 7.14-7.20  = LC 7.16-7.22      SP 17.07-17.24 = LC 17.08-17.25
// An NFS-e's ItemListaServico and the national cTribNac use LC 116's numbers, so the table is
// keyed by LC numbers: São Paulo's 2.9% for "17.24" is advertising insertion, LC 17.25.
//
// A rate set for only part of a subitem ("relacionados a ...") is accepted beside the
// subitem's general rate, since the file does not say which part the service is. Judged only
// for competence years 2024 to 2028: Lei 18.066/2023 moved 1.09 from 2.9% to 2%, and from 2029
// LC 116 art. 8-B cuts every municipal rate. An offline observation, not tax advice.

/** São Paulo's (and Rio de Janeiro's) subitem numbers to LC 116's (the four shifted runs above). */
export function spToLc(code) {
  const [a, b] = code.split(".").map(Number);
  const shift = (a === 3 && b >= 1 && b <= 4) || (a === 13 && b >= 1 && b <= 4) || (a === 17 && b >= 7 && b <= 24) ? 1 : a === 7 && b >= 14 && b <= 20 ? 2 : 0;
  return `${a}.${String(b + shift).padStart(2, "0")}`;
}

// Art. 16 in São Paulo's numbering: [rate, clause, whole items, whole subitems, part-of subitems].
const SP_ART16 = [
  [2, "I, a", ["4", "5"], ["1.09", "2.01", "6.04", "8.01", "11.02", "11.03", "11.05", "12.01", "12.03", "12.05", "13.04", "15.09", "15.14", "16.01", "17.05", "19.01"], []],
  [2, "I, b", [], [], [["7.10", "cleaning, maintenance and upkeep of buildings (including septic tanks)"]]],
  [2, "I, c", [], [], [["10.01", "insurance brokerage"]]],
  [2, "I, d", [], [], [["12.07", "ballet, dance, opera, concerts and recitals"]]],
  [2, "I, e", [], ["12.11"], []],
  [2, "I, f", [], [], [["16.02", "school transport and taxis (including fleets)"]]],
  [2, "I, g", [], [], [["14.01", "cobblers working alone on their own account"]]],
  [2, "I, h", [], [], ["7.10", "7.11", "11.02", "14.01", "14.09", "17.02", "37.01"].map((s) => [s, "an individual with no establishment (sewer cleaner, gardener, night watchman, ...)"])],
  [2, "I, i", [], [], [["15.01", "administration of funds, credit or debit cards and client portfolios"]]],
  [2, "I, j", [], [], ["15.12", "15.15", "15.16"].map((s) => [s, "the stock, commodities and futures exchange (BM&FBOVESPA)"])],
  [2, "I, k", [], ["21.01"], []],
  [2, "I, l", [], [], [["17.11", "meal, food and transport vouchers, and health-plan benefit administration"]]],
  [2, "I, m", [], [], [["15.10", "electronic payments by payment facilitators"]]],
  [2, "I, n", [], [], [["9.02", "organising tourism programmes, trips and stays"]]],
  [2, "I, o", [], [], [["10.05", "intermediation through a digital platform (rentals, rides, deliveries, marketplace)"], ["17.11", "property administration through a digital platform"]]],
  [2, "I, p", [], [], [["10.04", "franchise brokerage"]]],
  [2, "I, q", [], [], [["23.01", "visual programming and visual communication"]]],
  [2, "I, r", [], ["17.07"], ["13.01", "13.02", "13.03"].map((s) => [s, "the service when not rendered by a notary or registrar"])],
  [2.5, "II, a", [], [], [["3.02", "stands and convention centres for fairs, exhibitions and congresses"]]],
  [2.5, "II, b", [], ["17.09"], []],
  [2.9, "III", ["1"], ["17.24"], []],
];

function buildSaoPaulo() {
  // Whole-subitem rates (later clauses never overlap earlier whole ones; item 1's 2.9% yields
  // to 1.09's 2%, which the text says: "item 1 (exceto o subitem 1.09)").
  const whole = new Map(), items = new Map(), parts = new Map();
  for (const [rate, clause, its, subs, prt] of SP_ART16) {
    for (const i of its) items.set(i, { rate, clause });
    for (const s of subs) whole.set(spToLc(s), { rate, clause });
    for (const [s, what] of prt) {
      const k = spToLc(s);
      if (!parts.has(k)) parts.set(k, []);
      parts.get(k).push({ rate, clause, what, sp: s });
    }
  }
  return { whole, items, parts };
}

const SP = buildSaoPaulo();

// Rio de Janeiro (IBGE 3304557), Lei 691/1984 (Código Tributário Municipal) art. 33, caput as
// worded by Lei 8.467/2024 (the consolidated text on legisweb.com.br, read 2026-11-15, checked
// against the city's own table, carioca.rio "Aliquotas-de-ISS-atualizado2025.pdf"):
//   I   5%   every service not named in II;
//   II  item by item, each tied to a kind of service or provider rather than a whole subitem:
//       3%   1 dredging, construction, hydraulic works, consulting engineering, repair and
//              renovation of buildings, roads and bridges; 3 advertising carried only on the
//              internet; 21 logistics for oil and gas exploration (4, cinema exhibition, ended
//              31 Dec 2022);
//       0.5% 7 subitems 7.02 and 7.05 in licensed hotel works;
//       2%   the other 25 items: some name subitems (1.09, 4.03 hospitals, 15.01 funds, and,
//              in the port area or the UFRJ technology park, 6.04, 8.01, 8.02, 9.01, 12.01-12.11,
//              item 1, item 2, 30.01), others a kind of provider for any service: item 5 (an
//              established self-employed professional or professional partnership under Lei
//              3.720/2004) and item 8 (research institutions, junior companies, technology
//              companies in incubators). So 2% is a rate Rio's law sets for every subitem.
//   § 3 (LC 235/2021): item 10's hospitals pay 0.6 points more (2.6%) unless they prove
//       investment in the city of 2% of revenue.
// Rio's list (art. 8) closed LC 116's vetoed gaps exactly as São Paulo's did (all 200 subitem
// texts matched, eval/iss-city-rates-rio-2026-11-15.md), so its own 7.16 (dredging) is LC 7.18
// and its 17.24 (advertising insertion) LC 17.25; art. 33 items 32 and 33 cite Rio's 17.11
// (administração em geral, LC 17.12) and 17.19 (economic consulting, LC 17.20).
// Item 21 names no subitem; 3% is accepted where a logistics service is filed (11.01, 11.04,
// 16.02, 20.01-20.03), which is this tool's reading.

const RJ_ART33 = [
  // [rate, item, subitems in Rio's numbering, what]
  [3, "II, 1", ["7.01", "7.02", "7.03", "7.04", "7.05", "7.15", "7.16", "7.17", "7.18"], "dredging, construction, hydraulic works, consulting engineering, repair and renovation of buildings, roads and bridges"],
  [3, "II, 3", ["17.24"], "advertising carried only on the internet"],
  [3, "II, 21", ["11.01", "11.04", "16.02", "20.01", "20.02", "20.03"], "logistics for oil and gas exploration (the item names no subitem)"],
  [0.5, "II, 7", ["7.02", "7.05"], "works on a licensed hotel project"],
  [2.6, "art. 33 § 3", ["4.03"], "hospitals and clinics able to admit patients that do not prove the investment § 3 asks"],
];

function buildRio() {
  const parts = new Map();
  for (const [rate, clause, subs, what] of RJ_ART33) for (const s of subs) {
    const k = spToLc(s);
    if (!parts.has(k)) parts.set(k, []);
    parts.get(k).push({ rate, clause, what });
  }
  return parts;
}

const RJ = buildRio();

// Curitiba (IBGE 4106902), Lei Complementar 40/2001 art. 4. Read from the city's consolidated
// text (mid.curitiba.pr.gov.br/2020/00293800.pdf, which carries every change up to LC 112/2018)
// and the three later laws that touch the tax code: LC 119/2020 (00348657.pdf, not art. 4),
// LC 134/2022 (2022/00361219.pdf: adds I, n "franquia (franchising)" and revokes V, the 5% for
// withholding) and LC 146/2025 of 9 June 2025 (legisweb.com.br id 479376: III, b now reads
// "cooperativas de serviços de saúde"); all read 2026-11-16. No amendment to art. 4 from 2023
// or 2024 was found, which is not proof there is none (eval/iss-city-rates-curitiba-2026-11-16.md).
//   I   2%   a) collective transport; b) leasing; c) services for a recipient abroad (§ 2: work
//            done in Brazil whose result is felt here, paid from abroad); d) schools; e) call
//            centres and remote technical support (§ 1: by phone, e-mail, chat or fax);
//            f)-m) theatre, circus, auditorium programmes, shows, fairs, animal races,
//            competitions and event production (LC 112/2018); n) franchising (LC 134/2022);
//   II  2.5% cleaning and upkeep, security, insurance brokerage, commercial representation,
//            typesetting, tyre retreading;
//   III 4%   hospitals and the like, health plans and health-service cooperatives, registries
//            and notaries;
//   IV  5%   every other activity;
//   VI  2%   medicine, diagnostics, hospitals and clinics, care homes, blood and tissue banks
//            and collection, when rendered to the SUS (LC 106/2017).
// Art. 4-A sets a 2% floor. Curitiba's list (Anexo I) keeps LC 116's numbers and its vetoed
// gaps (3.01, 7.14, 7.15, 13.01, 17.07 read "(VETADO)"), so no renumbering. A clause whose words
// are the subitem's whole text sets that subitem's general rate; one that covers part of it
// (hospitals within 4.03, insurance within 10.01) is accepted beside 5%. I, c and e name no
// subitem, so 2% is a rate the law can set for any service, as in Rio (VI's 2% for the SUS,
// on 4.01-4.03, 4.17, 4.19 and 4.20, is inside that). Before LC 146/2025 III, b
// read "cooperativas de serviços", any cooperative, so for 2024 and 2025 competences 4% is
// accepted on every subitem.
const CWB_WHOLE = [
  // [rate, clause, LC 116 subitems whose whole text the clause names]
  [2, "I, a", ["16.01"]], [2, "I, b", ["15.09"]], [2, "I, d", ["8.01"]],
  [2, "I, f", ["12.01"]], [2, "I, g", ["12.03"]], [2, "I, h", ["12.04"]], [2, "I, i", ["12.07"]],
  [2, "I, j", ["12.08"]], [2, "I, k", ["12.10"]], [2, "I, l", ["12.11"]], [2, "I, m", ["12.13"]],
  [2, "I, n", ["17.08"]],
  [2.5, "II, b", ["11.02"]], [2.5, "II, e", ["13.05"]], [2.5, "II, f", ["14.04"]],
  [4, "III, b", ["4.22", "4.23"]], [4, "III, c", ["21.01"]],
];
const CWB_PARTS = [
  // [rate, clause, subitems, what]
  [2.5, "II, a", ["7.10"], "cleaning and upkeep (limpeza e conservação)"],
  [2.5, "II, c", ["10.01"], "insurance agency and brokerage"],
  [2.5, "II, d", ["10.09"], "commercial representation"],
  [4, "III, a", ["4.03"], "hospitals, sanatoriums, asylums, nursing homes and emergency rooms"],
];
const CWB = (() => {
  const whole = new Map(), parts = new Map();
  for (const [rate, clause, subs] of CWB_WHOLE) for (const s of subs) whole.set(s, { rate, clause });
  for (const [rate, clause, subs, what] of CWB_PARTS) for (const s of subs) {
    if (!parts.has(s)) parts.set(s, []);
    parts.get(s).push({ rate, clause, what });
  }
  return { whole, parts };
})();

export const CITIES = {
  "3550308": {
    name: "São Paulo",
    law: "Lei 13.701/2003 art. 16",
    years: [2024, 2028],
    /** The rates the law allows for an LC 116 subitem: [{rate, clause, what?}], general rate first. */
    rates(lcItem) {
      const item = lcItem.split(".")[0];
      const general = SP.whole.get(lcItem) || SP.items.get(item) || { rate: 5, clause: "IV" };
      return [general, ...(SP.parts.get(lcItem) || [])];
    },
  },
  "3304557": {
    name: "Rio de Janeiro",
    law: "Lei 691/1984 art. 33",
    years: [2024, 2028],
    rates(lcItem) {
      return [
        { rate: 5, clause: "I" },
        { rate: 2, clause: "II, 5 and 8", what: "a qualifying provider of any service (an established self-employed professional or professional partnership under Lei 3.720/2004, a research institution, junior company or incubated technology company) or a service II names" },
        ...(RJ.get(lcItem) || []),
      ];
    },
  },
  "4106902": {
    name: "Curitiba",
    law: "Lei Complementar 40/2001 art. 4",
    years: [2024, 2028],
    ownNumbers: false,
    rates(lcItem, year) {
      const general = CWB.whole.get(lcItem) || { rate: 5, clause: "IV" };
      const out = [general];
      if (general.rate !== 2) out.push({ rate: 2, clause: "I, c and e", what: "a service for a recipient abroad, or a call-centre or remote technical support service" });
      out.push(...(CWB.parts.get(lcItem) || []));
      const coop = Number(year) <= 2025 && general.rate !== 4 && !out.some((p) => p.rate === 4);
      if (coop) out.push({ rate: 4, clause: "III, b before LC 146/2025", what: "a services cooperative (any kind until 9 June 2025)" });
      return out;
    },
  },
};

const pct = (x) => `${Number(x.toFixed(3))}%`;

/**
 * Judge a stated rate against the city's own law.
 *   city: the IBGE code of the municipality where the ISS is due; item: the LC 116 subitem;
 *   rate, fraction: as in iss-rate.mjs (a value under 1 is tried both ways unless fraction is
 *   true or false); year: the competence year.
 * Returns null when the city has no table here, the year is outside it, the item or rate is
 * unreadable, or the rate is one the law sets; else {message, fix}.
 */
export function cityRateProblem({ city, rate, item, year, fraction = "maybe" }) {
  const c = CITIES[String(city ?? "").trim()];
  if (!c || !item) return null;
  const y = Number(year);
  if (!Number.isFinite(y) || y < c.years[0] || y > c.years[1]) return null;
  const a = Number(String(rate ?? "").trim());
  if (!String(rate ?? "").trim() || !Number.isFinite(a) || a <= 0) return null;
  const readings = fraction === true ? [a * 100] : fraction === false || a >= 1 ? [a] : [a, a * 100];
  const allowed = c.rates(item, y);
  if (readings.some((p) => allowed.some((r) => Math.abs(p - r.rate) < 1e-6))) return null;
  const [general, ...parts] = allowed;
  const shown = readings.length > 1 ? `${rate} (read as ${pct(readings[0])} or ${pct(readings[1])})` : `${rate} (${pct(readings[0])})`;
  const partText = parts.length ? `, or ${parts.map((p) => `${pct(p.rate)} for ${p.what} (${p.clause})`).join("; ")}` : "";
  const spNote = c.ownNumbers === false ? "" : spToLcNote(item, c.name);
  return {
    message: `The ISS rate is ${shown}, but ${c.name}'s ${c.law} sets ${pct(general.rate)} for LC 116 subitem ${item} (${general.clause})${partText}.${spNote}`,
    fix: `Check the service item and the rate against ${c.name}'s law. A rate the city does not set for this service is usually a wrong ItemListaServico/cTribNac or a rate copied from another city; where the city is not the one where the ISS is due, check MunicipioIncidencia/cLocIncid instead. A Simples Nacional provider, a fixed-amount professional partnership and ISS not due here are not judged.`,
  };
}

// Where the city's own number differs from LC 116's, say so: a provider copying São Paulo's or
// Rio's list writes 17.24 for advertising insertion, which LC 116 numbers 17.25.
function spToLcNote(lcItem, city) {
  const [a, b] = lcItem.split(".").map(Number);
  const back = (a === 3 && b >= 2 && b <= 5) || (a === 13 && b >= 2 && b <= 5) || (a === 17 && b >= 8 && b <= 25) ? 1 : a === 7 && b >= 16 && b <= 22 ? 2 : 0;
  return back ? ` (${city}'s own list numbers it ${a}.${String(b - back).padStart(2, "0")}; LC 116 numbers it ${lcItem}.)` : "";
}
