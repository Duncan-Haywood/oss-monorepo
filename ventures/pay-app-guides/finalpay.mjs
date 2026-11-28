// Final payment papers: the exceptions a contractor lists on a final payment affidavit (AIA
// G706, "Contractor's Affidavit of Payment of Debts and Claims", or the owner's or GC's own form),
// the final lien waivers it should hold from its lower tiers (what a G706A, "Contractor's
// Affidavit of Release of Liens", swears are attached), and the attachments the package needs.
//
// What the forms say is read from AIA's own previews and help pages (sources/aia-g706-family.txt,
// read 2026-11-28). This module does not reproduce the forms or their wording: it works out, from
// the contractor's own list of subcontractors and suppliers, what is still unpaid or claimed,
// so nothing goes on a sworn statement that the books contradict.
//
// Pure functions, no I/O. Money is integer cents.
import { fmt, csvCell } from "./calc.mjs";
import { parseCsv, parseMoney } from "./colog.mjs";

// The worked example on final-payment-affidavit.html: an electrical sub's lower tiers at close-out.
export const EXAMPLE = `Name,Role,Contract with change orders,Paid to date,Final waiver,Open claim,Note
Valley Electric Supply,Supplier,150000,150000,Unconditional,,
Lowvolt Systems LLC,Subcontractor,52000,46800,Conditional,,retainage held
Metro Lift Rentals,Equipment rental,8400,8400,None,,
Ace Trenching,Subcontractor,18000,18000,Unconditional,2500,disputed extra for rock`;

// States with their own statutory lien waiver forms, each with a page here. Kept in step with
// STATES in state-forms.mjs (finalpay.test.mjs checks), copied so the page needs no Node import.
export const WAIVER_FORM_STATES = {
  AZ: "Arizona", NV: "Nevada", TX: "Texas", UT: "Utah", FL: "Florida", MI: "Michigan", WY: "Wyoming",
  GA: "Georgia", MS: "Mississippi", MO: "Missouri", MA: "Massachusetts", CA: "California",
};
export const formPage = (name) => `${name.toLowerCase().replace(/ /g, "-")}-lien-waiver-forms.html`;

const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

// Header words -> field; first match wins, so the more specific patterns come first.
const HEADERS = [
  ["waiver", /waiver|release/],
  ["claim", /claim|dispute/],
  ["paid", /paid/],
  ["contract", /contract|price|amount|value/],
  ["role", /role|type|kind|trade/],
  ["note", /note|comment|memo/],
  ["name", /name|sub|supplier|vendor|company|party/],
];

export function parseParties(text) {
  const rows = parseCsv(text);
  if (!rows.length) return { lines: [], errors: [] };
  const cols = {};
  rows[0].forEach((h, i) => {
    const n = norm(h);
    for (const [key, re] of HEADERS) if (re.test(n)) { if (cols[key] === undefined) cols[key] = i; break; }
  });
  const errors = [];
  for (const [key, label] of [["name", "name"], ["contract", "contract"], ["paid", "paid to date"]]) {
    if (cols[key] === undefined) errors.push(`No "${label}" column found in the header row.`);
  }
  if (errors.length) return { lines: [], errors };
  const lines = [];
  for (const r of rows.slice(1)) {
    const get = (k) => (cols[k] === undefined ? "" : (r[cols[k]] ?? "").trim());
    if (r.every((c) => !String(c).trim()) || /^totals?$/i.test(get("name"))) continue;
    lines.push({ name: get("name"), role: get("role"), contract: get("contract"), paid: get("paid"), waiver: get("waiver"), claim: get("claim"), note: get("note") });
  }
  return { lines, errors };
}

// "Unconditional final", "unconditional", "UF" -> "unconditional"; "conditional", "CF" ->
// "conditional"; blank, "none", "no", "progress only" -> "none". Anything else is an error.
export function readWaiver(s) {
  const t = norm(s);
  if (t === "" || /^(none|no|n|-|missing|progress( only)?|not yet)$/.test(t)) return "none";
  if (/^(unconditional|uncond\.?|uf|u)( final)?( waiver)?$/.test(t)) return "unconditional";
  if (/^(conditional|cond\.?|cf|c)( final)?( waiver)?$/.test(t)) return "conditional";
  return null;
}

// lines: [{ name, role, contract, paid, waiver, claim, note }]
// settings: { finalPayment, bonded, state }
//   finalPayment: what your final pay application asks for (retainage included), optional.
//   bonded: true when a payment or performance bond covers your contract.
//   state: two-letter code of the job's state, optional.
// Returns { errors, findings, rows, totals, exceptions, waivers, attachments }.
export function finalPapers(lines, settings = {}) {
  const errors = [];
  const findings = [];
  const add = (level, text) => findings.push({ level, text });
  const given = (v) => String(v ?? "").trim() !== "";
  const finalPayment = given(settings.finalPayment) ? parseMoney(settings.finalPayment) : null;
  if (given(settings.finalPayment) && (finalPayment === null || finalPayment < 0)) errors.push("The final payment must be a number, zero or more.");
  const state = String(settings.state ?? "").trim().toUpperCase();
  const bonded = settings.bonded === true || settings.bonded === "yes";

  const rows = [];
  lines.forEach((l, i) => {
    const who = l.name?.trim() || `Row ${i + 2}`;
    if (!l.name?.trim()) errors.push(`${who}: name is missing.`);
    const v = {};
    for (const [k, label] of [["contract", "contract"], ["paid", "paid to date"], ["claim", "open claim"]]) {
      v[k] = parseMoney(l[k]);
      if (v[k] === null) { errors.push(`${who}: ${label} "${l[k]}" is not a number.`); v[k] = 0; }
      else if (v[k] < 0) { errors.push(`${who}: ${label} cannot be negative.`); v[k] = 0; }
    }
    const waiver = readWaiver(l.waiver);
    if (waiver === null) errors.push(`${who}: final waiver "${l.waiver}" is not one of: unconditional, conditional, none.`);
    const unpaid = Math.max(0, v.contract - v.paid);
    rows.push({ name: l.name?.trim() ?? "", role: l.role?.trim() ?? "", note: l.note?.trim() ?? "", ...v, unpaid, overpaid: Math.max(0, v.paid - v.contract), waiver: waiver ?? "none" });
  });
  if (errors.length) return { errors, findings: [], rows: [], totals: null, exceptions: [], waivers: [], attachments: [] };

  const exceptions = [];
  const waivers = [];
  for (const r of rows) {
    const label = r.role ? `${r.name} (${r.role})` : r.name;
    if (r.unpaid > 0) exceptions.push({ name: r.name, kind: "unpaid", amount: r.unpaid, text: `${label}: ${fmt(r.unpaid)} unpaid of its ${fmt(r.contract)} contract${r.note ? ` (${r.note})` : ""}, to be paid from the final payment.` });
    if (r.claim > 0) exceptions.push({ name: r.name, kind: "claim", amount: r.claim, text: `${label}: claims ${fmt(r.claim)} beyond the amount above${r.note ? ` (${r.note})` : ""}; not paid and not settled.` });

    if (r.overpaid > 0) add("medium", `${r.name}: paid ${fmt(r.paid)}, ${fmt(r.overpaid)} more than its contract of ${fmt(r.contract)}. A change order is probably missing from the contract figure; fix it so the unpaid balances are right.`);
    if (r.unpaid > 0) {
      if (r.waiver === "unconditional") add("medium", `${r.name}: you hold an unconditional final waiver, but your list shows ${fmt(r.unpaid)} still unpaid. Check your books; if it signed before being paid, pay it as agreed and keep the waiver with the payment record. It is still listed as an exception, because the affidavit is about payment, not paperwork.`);
      waivers.push({ name: r.name, now: r.waiver === "none" ? "conditional" : null, after: r.waiver === "unconditional" ? null : "unconditional", text: r.waiver === "none"
        ? `${r.name}: get a conditional final waiver for ${fmt(r.unpaid)} now; an unconditional final waiver once its payment clears.`
        : r.waiver === "conditional"
          ? `${r.name}: conditional final waiver in hand; get the unconditional final waiver once its ${fmt(r.unpaid)} clears.`
          : `${r.name}: unconditional final waiver in hand, ${fmt(r.unpaid)} still unpaid (see the check above).` });
    } else {
      waivers.push({ name: r.name, now: r.waiver === "unconditional" ? null : "unconditional", after: null, text: r.waiver === "unconditional"
        ? `${r.name}: paid in full, unconditional final waiver in hand.`
        : `${r.name}: paid in full; get its unconditional final waiver before you sign${r.waiver === "conditional" ? " (you hold only a conditional one)" : ""}.` });
    }
    if (r.claim > 0) add("high", `${r.name}: an open claim of ${fmt(r.claim)}. List it as an exception. A final payment affidavit says every known claim is paid or listed; leaving a known claim off makes the sworn statement false, and the owner may ask you to bond it.`);
  }

  const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
  const totals = { contract: sum("contract"), paid: sum("paid"), unpaid: sum("unpaid"), claims: sum("claim") };
  totals.exceptions = totals.unpaid + totals.claims;

  if (finalPayment !== null && totals.unpaid > finalPayment) add("high", `You still owe your lower tiers ${fmt(totals.unpaid)}, ${fmt(totals.unpaid - finalPayment)} more than the ${fmt(finalPayment)} final payment you expect. Each unpaid balance is an exception on the affidavit, and AIA's own instructions say the owner can require a lien bond or indemnity bond to cover each one. Plan where the difference comes from before you send the package.`);
  else if (finalPayment !== null && totals.unpaid > 0) add("low", `Your lower tiers are owed ${fmt(totals.unpaid)} of the ${fmt(finalPayment)} final payment, leaving ${fmt(finalPayment - totals.unpaid)} for you. Pay them promptly once it arrives and collect their unconditional final waivers.`);
  const missingNow = waivers.filter((w) => w.now).length;
  if (missingNow) add("medium", `${missingNow} final waiver${missingNow === 1 ? "" : "s"} to collect before the package goes in (listed below). A G706A swears the attached waivers cover everyone who may have lien rights, except as listed; a party with no waiver attached belongs on its exceptions.`);
  if (bonded) add("low", "Your contract is bonded: the package needs your surety's consent to final payment (AIA G707 or the surety's own form). Ask your bond agent now; the surety signs it, not you, and it can be the slowest paper in the stack.");
  const stateName = WAIVER_FORM_STATES[state];
  if (stateName) add("low", `${stateName} has statutory lien waiver forms. The waivers you attach, yours and your lower tiers', should be on that state's forms, not a generic release: see ${formPage(stateName)}.`);
  const order = { high: 0, medium: 1, low: 2 };
  findings.sort((a, b) => order[a.level] - order[b.level]);

  const attachments = [
    { doc: "Final payment affidavit (AIA G706, or the owner's or GC's own form)", needed: true, why: "Signed by the contractor's authorized representative before a notary. The exceptions box lists each exception above, or \"None\"." },
    { doc: "Your own final lien waiver, conditional upon receipt of final payment", needed: true, why: stateName ? `On ${stateName}'s statutory form.` : "Conditional, so it only takes effect when the final check clears." },
    { doc: "Final lien waivers from your subcontractors and suppliers, with a list of them", needed: rows.length > 0, why: rows.length ? `${rows.length} part${rows.length === 1 ? "y" : "ies"} on your list.` : "No lower tiers listed." },
    { doc: "Affidavit of release of liens (AIA G706A), if the owner asks for it", needed: rows.length > 0, why: "Swears the attached waivers cover everyone who may have lien rights, except the ones listed." },
    { doc: "Consent of surety to final payment (AIA G707 or the surety's form)", needed: bonded, why: bonded ? "Your contract is bonded." : "Not needed: no bond on your contract." },
  ];
  return { errors, findings, rows, totals, exceptions, waivers, attachments };
}

// The text for the affidavit's exceptions box.
export function exceptionsText(result) {
  if (!result.exceptions.length) return "None.";
  return result.exceptions.map((e, i) => `${i + 1}. ${e.text}`).join("\n");
}

// A cover email for the package. Lists what is enclosed and what is excepted; no legal wording.
export function coverEmail(result, s = {}) {
  const enclosed = result.attachments.filter((a) => a.needed).map((a) => `- ${a.doc}`);
  const lines = [
    `Subject: Final payment documents${s.project ? `: ${s.project}` : ""}`,
    "",
    "Hello,",
    "",
    `Enclosed with our final pay application${s.project ? ` for ${s.project}` : ""}:`,
    ...enclosed,
    "",
    result.exceptions.length
      ? `The affidavit lists ${result.exceptions.length} exception${result.exceptions.length === 1 ? "" : "s"} (${fmt(result.totals.exceptions)} in all):`
      : "The affidavit lists no exceptions.",
    ...result.exceptions.map((e) => `- ${e.text}`),
    "",
    "Please let us know if you need anything else to release final payment and retainage.",
    "",
    s.from ? s.from : "",
  ];
  return lines.join("\n").replace(/\n+$/, "\n");
}

const money = (c) => (c / 100).toFixed(2);
export function toCsv(result) {
  const head = ["Name", "Role", "Contract", "Paid to date", "Unpaid", "Open claim", "Final waiver held", "Waiver to collect now", "Note"];
  const byName = new Map(result.waivers.map((w) => [w.name, w]));
  const line = (r) => [r.name, r.role, money(r.contract), money(r.paid), money(r.unpaid), money(r.claim), r.waiver, byName.get(r.name)?.now ?? "", r.note];
  const t = result.totals;
  return [head, ...result.rows.map(line), ["Totals", "", money(t.contract), money(t.paid), money(t.unpaid), money(t.claims), "", "", ""]].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}
