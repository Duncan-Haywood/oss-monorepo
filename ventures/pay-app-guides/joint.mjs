// Joint check splitter: who gets what from a check payable to a subcontractor AND its
// supplier(s), what each should sign, and how much a supplier puts at risk by endorsing
// without a written split.
//
// The "joint check rule" (Post Bros. Constr. Co. v. Yoder (1977) 20 Cal.3d 1): when a
// subcontractor and its supplier are joint payees and there is no agreement on how the
// proceeds are split, the supplier's endorsement is treated as payment of what it was owed,
// to the extent of the check, even if the sub kept the money. The court's remedy for the
// supplier: refuse to endorse until it is assured of its share. Where the rule applies, and
// whether it reaches the surety, varies by state (STATES below, from a surety's 2018 summary).
//
// Pure functions; no I/O. Money is rounded to cents.

const cents = (n) => Math.round(n * 100) / 100;
const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

// What the 2018 Travelers handout (hosted by AGC) says, grouped. Each state appears under
// every group the handout names it in. Not checked against each state's own cases here.
export const GROUPS = {
  rule_both: { label: "Follows the joint check rule, for the contractor and its surety", states: ["California", "Iowa", "Louisiana", "Missouri", "South Carolina", "Texas", "Washington"] },
  surety_unclear: { label: "Unclear or silent on whether the rule reaches the surety", states: ["Arizona", "Arkansas", "Nevada", "Oklahoma", "Utah"] },
  surety_no: { label: "Rule does not extend to the surety", states: ["Maryland", "Ohio"] },
  waiver_yes: { label: "Endorsement is an effective lien waiver", states: ["California", "Montana", "Oklahoma"] },
  waiver_more: { label: "Endorsement waives liens only with additional circumstances", states: ["Alabama", "Colorado", "Connecticut", "Idaho", "Indiana", "Kansas", "Massachusetts", "Michigan", "Minnesota", "South Dakota"] },
  waiver_no: { label: "Endorsement is not recognized as a lien waiver", states: ["Arizona", "Arkansas", "Oregon"] },
  waiver_void: { label: "Any such waiver is void and unenforceable", states: ["Delaware", "Maryland"] },
};

export const STATES = [...new Set(Object.values(GROUPS).flatMap((g) => g.states))].sort();

export function stateNotes(state) {
  if (state === "federal") {
    return ["Federal project (Miller Act bond): the handout says the joint check rule does not apply and endorsement alone does not release or waive Miller Act rights; a joint check agreement that says endorsement is payment in full can."];
  }
  const hits = Object.values(GROUPS).filter((g) => g.states.includes(state)).map((g) => g.label);
  if (!hits.length) return ["The handout does not name this state; it says over half the states are silent on joint checks or reject the rule, so endorsement alone has an unknown effect. Get the split in writing either way."];
  return hits;
}

// Items a joint check agreement should cover, from the same handout's drafting checklist.
export const AGREEMENT_ITEMS = [
  ["parties", "Names all three parties: the payer (GC or owner), the subcontractor and the supplier"],
  ["project", "Names the project and says the arrangement is limited to it"],
  ["maximum", "States the maximum amount paid or to be paid by joint check"],
  ["allocation", "Says which invoices or how much of each check is the supplier's"],
  ["waivers", "Says which lien waivers each payee gives in exchange for each check"],
  ["no_duty", "Says the payer has no continuing duty to issue joint checks beyond what it lists"],
  ["convenience", "Says the agreement is made only as a convenience"],
  ["no_rights", "Says it creates no direct contract or payment obligation between the payer and the supplier"],
  ["signed_first", "Is signed by all three before the first check is issued"],
  ["and_payee", "Has checks made payable to sub AND supplier (not OR), so neither can cash it alone"],
];

/**
 * @param {object} input
 * @param {number} input.check  amount of the joint check
 * @param {{name:string, owed:number, agreed?:number|null}[]} input.suppliers
 *   owed: what the sub owes this supplier for material or work on THIS job;
 *   agreed: the supplier's share written in an agreement or on the check stub (optional)
 * @param {boolean} [input.writtenSplit] the split is written down (agreement, stub, letter) before endorsing
 * @param {string} [input.state] project state name, or "federal"
 * @param {string[]} [input.agreementHas] keys of AGREEMENT_ITEMS the agreement covers
 */
export function splitJointCheck(input) {
  const errors = [];
  const check = num(input.check);
  if (check === null || Number.isNaN(check) || check <= 0) errors.push("Enter the check amount (more than zero).");
  const suppliers = (input.suppliers || []).filter((s) => s && (String(s.name || "").trim() || s.owed !== "" && s.owed != null));
  if (!suppliers.length) errors.push("Add at least one supplier or lower-tier sub named on the check.");
  const rows = suppliers.map((s, i) => {
    const name = String(s.name || "").trim() || `Supplier ${i + 1}`;
    const owed = num(s.owed);
    const agreed = num(s.agreed);
    if (owed === null || Number.isNaN(owed) || owed < 0) errors.push(`${name}: enter what is owed on this job (zero or more).`);
    if (Number.isNaN(agreed) || (agreed !== null && agreed < 0)) errors.push(`${name}: the agreed share must be a number, zero or more.`);
    return { name, owed, agreed };
  });
  if (errors.length) return { ok: false, errors };

  const flags = [];
  // A supplier's share: the agreed amount if written, else what it is owed on this job.
  let shares = rows.map((r) => (r.agreed !== null ? r.agreed : r.owed));
  const asked = shares.reduce((a, b) => a + b, 0);
  let prorated = false;
  if (asked > check + 0.005) {
    if (rows.some((r) => r.agreed !== null)) {
      flags.push(`The suppliers' shares add up to ${fmt(asked)}, more than the ${fmt(check)} check. Fix the written split before anyone endorses.`);
    } else {
      flags.push(`The suppliers are owed ${fmt(asked)} on this job, more than the ${fmt(check)} check. Shares below are pro rata to what each is owed; agree the split in writing, and the balance stays owed.`);
      shares = shares.map((s) => (s * check) / asked);
      prorated = true;
    }
  }
  shares = shares.map(cents);
  // Rounding: keep the pro-rata shares summing to the check exactly.
  if (prorated) {
    const diff = cents(check - shares.reduce((a, b) => a + b, 0));
    if (diff !== 0) shares[shares.length - 1] = cents(shares[shares.length - 1] + diff);
  }
  const supplierTotal = cents(shares.reduce((a, b) => a + b, 0));
  const toSub = cents(Math.max(0, check - supplierTotal));

  const written = Boolean(input.writtenSplit);
  const out = rows.map((r, i) => {
    const share = shares[i];
    const unpaidAfter = cents(Math.max(0, r.owed - share));
    // Where the rule applies and nothing is written, endorsing can count as payment of what
    // was owed up to the check amount, even if the supplier got less.
    const deemed = cents(Math.min(r.owed, check));
    const atRisk = written ? 0 : cents(Math.max(0, deemed - share));
    if (r.agreed !== null && r.agreed < r.owed - 0.005) flags.push(`${r.name}: the agreed share is ${fmt(r.agreed)} of ${fmt(r.owed)} owed; ${fmt(cents(r.owed - r.agreed))} stays owed after this check. Say so in the waiver's exceptions.`);
    return {
      name: r.name,
      owed: cents(r.owed),
      share,
      unpaidAfter,
      atRisk,
      waiver: `${r.name} signs a conditional progress waiver for ${fmt(share)} on this job, and an unconditional one only after its ${fmt(share)} has cleared${unpaidAfter > 0 ? `, listing the ${fmt(unpaidAfter)} still owed as an exception` : ""}.`,
    };
  });
  if (!written && out.some((r) => r.atRisk > 0)) {
    flags.push("Nothing written says how the check is split. Where the joint check rule applies, a supplier that endorses can be treated as paid what it was owed, up to the check amount, even if it received less. Supplier: do not endorse until you are paid your share or it is in writing.");
  }

  const items = new Set(input.agreementHas || []);
  const missing = AGREEMENT_ITEMS.filter(([k]) => !items.has(k)).map(([, text]) => text);

  const steps = [
    "Before the check is cut: the joint check agreement is signed by all three, and the payee line reads sub AND supplier.",
    `At endorsement: the supplier endorses only when its ${fmt(supplierTotal)} is paid to it (its own cashier's check from the sub, a wire, or the GC handing the endorsed check straight to the supplier), or held in escrow.`,
    `The subcontractor keeps ${fmt(toSub)}${toSub === 0 ? "; the whole check goes to suppliers" : ""}.`,
    `The subcontractor signs a conditional waiver for the full ${fmt(check)} the payer paid on its subcontract; unconditional once the check clears.`,
    "Each supplier's unconditional waiver goes to the payer after its share clears; the payer files them with the pay application.",
  ];

  return {
    ok: true,
    check: cents(check),
    supplierTotal,
    toSub,
    prorated,
    suppliers: out,
    flags,
    missing,
    steps,
    stateNotes: input.state ? stateNotes(input.state) : [],
  };
}

export function fmt(n) {
  const v = cents(n);
  return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// A plain-text split letter the three parties can sign before the check is endorsed.
export function splitLetter(result, { project = "", payer = "", sub = "", checkNo = "", date = "" } = {}) {
  if (!result || !result.ok) return "";
  const p = (s, d) => (String(s || "").trim() || d);
  const lines = [
    `Joint check split${date ? `, ${date}` : ""}`,
    "",
    `Project: ${p(project, "[project]")}`,
    `Check ${p(checkNo, "[number]")} from ${p(payer, "[payer]")}, payable to ${p(sub, "[subcontractor]")} and ${result.suppliers.map((s) => s.name).join(" and ")}: ${fmt(result.check)}`,
    "",
    "The payees agree the proceeds of this check are divided as follows:",
    ...result.suppliers.map((s) => `  ${s.name}: ${fmt(s.share)}${s.unpaidAfter > 0 ? ` (leaving ${fmt(s.unpaidAfter)} still owed by ${p(sub, "the subcontractor")})` : ""}`),
    `  ${p(sub, "Subcontractor")}: ${fmt(result.toSub)}`,
    "",
    "No payee endorses until it has received its share above or the share is held in escrow.",
    "Endorsement is payment only of the share above, and only for this project.",
    "",
    ...[p(payer, "Payer"), p(sub, "Subcontractor"), ...result.suppliers.map((s) => s.name)].map((n) => `${n}: ______________________  Date: ________`),
  ];
  return lines.join("\n");
}

const MONEYISH = /^-?\$?\s*[\d,]*\.?\d*$/;
// One supplier per line: "name, owed, agreed share". Fields are separated by a tab or a comma
// followed by a space, so "18,250" stays one number; a name may itself contain ", " ("Acme, Inc.")
// because the money fields are taken from the right.
export function parseSuppliers(text) {
  return String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((line) => {
    const parts = line.split(/\t|,\s+/).map((x) => x.trim());
    const money = [];
    while (parts.length > 1 && money.length < 2 && MONEYISH.test(parts[parts.length - 1])) money.unshift(parts.pop());
    const name = parts.join(", ");
    if (money.length === 2 && money[1] === "") money.pop();
    return { name, owed: money[0] ?? "", agreed: money.length === 2 ? money[1] : null };
  });
}
