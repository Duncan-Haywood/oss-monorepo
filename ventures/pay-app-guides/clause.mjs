// Pay-if-paid / pay-when-paid clause reader.
//
// Reads the payment clause a subcontractor pastes from a subcontract and
// says which kind of wording it contains, quoting the words that decided
// it. It is a wording check, not a legal opinion: courts read the whole
// contract, and a state's own rule (STATES below, each linked to the
// statute or opinion it comes from) can override the words.
//
// The two kinds, as the courts cited below describe them:
// - pay-when-paid: the owner's payment sets *when* the sub is paid. If the
//   owner never pays, the GC still owes the sub within a reasonable time
//   (Thos. J. Dyer Co. v. Bishop International Engineering, 6th Cir. 1962;
//   Peacock Construction v. Modern Air Conditioning, Fla. 1977).
// - pay-if-paid: the owner's payment is a *condition* of the sub being paid
//   at all, so the sub carries the risk that the owner never pays. Courts
//   that enforce one want that said unambiguously (Peacock), usually with
//   words such as "condition precedent" (West-Fair, N.Y. 1995).

// Wording that shifts the risk of owner non-payment onto the sub.
const IF_PAID = [
  { re: /conditions? precedent/i, means: "Calls the owner's payment a condition precedent: the usual words of a pay-if-paid clause." },
  { re: /\bif,? and only if\b/i, means: "\"If and only if\" makes payment conditional, not just timed." },
  { re: /\b(?:only|solely) (?:if|when|upon|after|to the extent)\b/i, means: "\"Only if / only upon\" limits payment to the case where the GC is paid." },
  { re: /\b(?:assumes?|bears?|accepts?|shall bear) (?:all |the )?(?:risk|risks)\b/i, means: "Puts a risk on the subcontractor; read whether it is the risk of the owner not paying." },
  { re: /\brisk of (?:the )?(?:owner'?s? )?(?:non-?payment|insolvency|failure to pay|default)\b/i, means: "Names the risk of the owner not paying." },
  { re: /\bsole (?:source|means) of (?:payment|funds)\b/i, means: "Makes the owner's payment the only source of the sub's payment." },
  { re: /\bcontingent (?:up)?on\b/i, means: "\"Contingent on\" can make payment conditional; courts read it with the rest of the clause." },
  { re: /\b(?:no|not be) (?:obligat\w*|liable|required) to (?:make )?pay\w*\b[^.]{0,80}\bunless\b/i, means: "Says the GC owes nothing unless something happens first." },
  { re: /\b(?:never|in no event)\b[^.]{0,60}\b(?:pay|payment)\b/i, means: "\"In no event\" wording can be read as a condition." },
];

// Wording that only sets the time for payment.
const WHEN_PAID = [
  { re: /\bwithin\s+(\w+(?:-\w+)?|\d+)\s*(?:\(\d+\)\s*)?(?:calendar |business |working )?days?\s+(?:after|of|following|from)\b/i, means: "Sets a number of days for payment: timing wording." },
  { re: /\b(?:after|upon|following|on)\s+(?:the\s+)?(?:contractor'?s?\s+|general contractor'?s?\s+)?receipt\s+of\s+(?:\w+\s+){0,3}payment\b/i, means: "Ties the payment date to the GC's receipt of payment: on its own this reads as pay-when-paid." },
  { re: /\bwhen\s+(?:and\s+if\s+)?(?:the\s+)?(?:contractor|general contractor|gc)\s+(?:is|has been)\s+paid\b/i, means: "\"When the contractor is paid\" is timing wording, unless the clause adds a condition." },
  { re: /\breasonable (?:time|period)\b/i, means: "A reasonable time for payment: the reading courts give a pay-when-paid clause." },
];

const WHEN_AND_IF = /\bwhen\s+and\s+if\b|\bif\s+and\s+when\b/i;
const OWNER_LINK = /\bowner\b|\breceipt of (?:\w+\s+){0,3}payment\b|\bpaid by\b|\bhigher[- ]tier/i;

const NUM_WORDS = { one: 1, two: 2, three: 3, five: 5, seven: 7, ten: 10, fifteen: 15, twenty: 20, thirty: 30, "forty-five": 45, sixty: 60, ninety: 90 };

function quote(text, m) {
  let start = Math.max(0, m.index - 30);
  let end = Math.min(text.length, m.index + m[0].length + 30);
  // Widen to whole words so a quote never starts or ends mid-word.
  while (start > 0 && /\S/.test(text[start - 1])) start--;
  while (end < text.length && /\S/.test(text[end])) end++;
  return (start ? "…" : "") + text.slice(start, end).replace(/\s+/g, " ").trim() + (end < text.length ? "…" : "");
}

function scan(text, rules) {
  const out = [];
  for (const r of rules) {
    const m = r.re.exec(text);
    if (m) out.push({ words: m[0], context: quote(text, m), means: r.means });
  }
  return out;
}

// readClause(text) -> { kind, ifPaid, whenPaid, days, linked, summary }
// kind: "empty" | "no-owner-link" | "pay-if-paid" | "pay-when-paid" | "unclear"
export function readClause(text) {
  const t = String(text ?? "").trim();
  if (!t) return { kind: "empty", ifPaid: [], whenPaid: [], days: null, linked: false, summary: "Paste the payment clause from your subcontract." };
  const ifPaid = scan(t, IF_PAID);
  const whenPaid = scan(t, WHEN_PAID);
  const both = WHEN_AND_IF.exec(t);
  if (both) ifPaid.push({ words: both[0], context: quote(t, both), means: "\"When and if\" joins timing and a condition; courts split on it, so it is not plain timing wording." });
  const linked = OWNER_LINK.test(t);
  let days = null;
  const d = /\bwithin\s+(\w+(?:-\w+)?|\d+)\s*(?:\((\d+)\)\s*)?(?:calendar |business |working )?days?/i.exec(t);
  if (d) days = d[2] ? Number(d[2]) : /^\d+$/.test(d[1]) ? Number(d[1]) : NUM_WORDS[d[1].toLowerCase()] ?? null;

  let kind;
  let summary;
  // The strong signals: an express condition, "if and only if", a named risk of non-payment, sole source.
  const strong = ifPaid.filter((s) => /condition|if,? and only|risk of|sole |only|unless|when and if|if and when/i.test(s.words));
  if (!linked && !ifPaid.length) {
    kind = "no-owner-link";
    summary = "This clause does not tie your payment to the owner paying the GC, so it is neither pay-if-paid nor pay-when-paid on its face. Check the rest of the subcontract for another payment clause.";
  } else if (strong.length) {
    kind = "pay-if-paid";
    summary = "This reads as pay-if-paid: the wording makes the owner's payment a condition of you being paid, so if the owner never pays, the GC may argue it never owes you. Whether that holds depends on your state (below).";
  } else if (ifPaid.length) {
    kind = "unclear";
    summary = "This clause has wording a GC could argue makes payment conditional, but not the clear words most courts that enforce pay-if-paid ask for. Treat it as disputed and get it read before you sign.";
  } else {
    kind = "pay-when-paid";
    summary = "This reads as pay-when-paid: the owner's payment sets when you are paid, not whether. If the owner never pays, courts reading such a clause have held the GC still owes you within a reasonable time.";
  }
  return { kind, ifPaid, whenPaid, days, linked, summary };
}

// State rules, each from the statute or court opinion linked, read on
// 2026-11-25 through search results limited to the official legislature
// sites and to Justia / CourtListener for the opinions (direct page loads
// were blocked from the session that wrote this). `effect` is what the rule
// does to a pay-if-paid clause:
//   "void"      - the condition is unenforceable between GC and sub
//   "delay-ok"  - a condition is void, a delay until the GC is paid is allowed
//   "lien-only" - the clause cannot defeat your lien or bond claim; the statute does not say it is void for everything
//   "timing"    - your state's rule on when the sub must be paid even if the GC has not been
//   "clear-words" - enforced only if the contract shifts the risk unambiguously
export const STATES = {
  ca: { state: "California", effect: "void", source: "case law", cite: "Wm. R. Clarke Corp. v. Safeco Ins. Co. (1997) 15 Cal.4th 882", url: "https://law.justia.com/cases/california/supreme-court/4th/15/882.html", rule: "The California Supreme Court held pay-if-paid provisions contrary to public policy and unenforceable, because in practice they waive the sub's mechanics lien rights. They do not shield the GC or its payment bond surety." },
  fl: { state: "Florida", effect: "clear-words", source: "case law", cite: "Peacock Construction Co. v. Modern Air Conditioning, 353 So. 2d 840 (Fla. 1977)", url: "https://law.justia.com/cases/florida/supreme-court/1977/50758-0.html", rule: "A clause tying payment to the owner's payment is read as setting the time for payment, so the GC owes the sub within a reasonable time, unless the contract unambiguously says the sub takes the risk of the owner not paying. The court called the time-for-payment reading the majority rule." },
  il: { state: "Illinois", effect: "lien-only", source: "statute", cite: "770 ILCS 60/21(e), Mechanics Lien Act (added by Public Act 103-0827)", url: "https://www.ilga.gov/legislation/ilcs/fulltext.asp?DocName=077000600K21", rule: "A provision conditioning the contractor's payment to a sub or supplier on receipt of payment from any other party, including a private or public owner, is not a defense to a claim under sections 21, 22, 23 or 28 of the Act. For this section a contractor includes a subcontractor or supplier." },
  md: { state: "Maryland", effect: "lien-only", source: "statute", cite: "Md. Code, Real Property §9-113", url: "https://mgaleg.maryland.gov/mgawebsite/Laws/StatuteText?article=grp&section=9-113&enactments=false", rule: "A provision in an executory contract between a contractor and a sub that makes payment depend on the contractor being paid by the owner or a third party cannot take away the sub's mechanics lien right or right to sue on the contractor's bond. A provision made in violation of the section is void as against public policy." },
  mo: { state: "Missouri", effect: "lien-only", source: "statute", cite: "RSMo §431.183", url: "https://revisor.mo.gov/main/OneSection.aspx?section=431.183", rule: "A provision making a contractor's payment to a subcontractor, trade or specialty contractor or supplier contingent on payment from any other private party, including a private owner, is no defense to a claim to enforce a mechanic's lien under chapter 429." },
  nv: { state: "Nevada", effect: "timing", source: "statute", cite: "NRS 624.624–624.626", url: "https://www.leg.state.nv.us/nrs/nrs-624.html", rule: "NRS 624.626 gives a lower-tiered sub remedies, including stopping work, when the higher-tiered contractor fails to pay within 45 days after the 25th day of the month in which the sub asked for payment, even if the higher-tiered contractor has not been paid and the agreement says it pays only if or when it is paid. NRS 624.628 voids other listed provisions. Check the current subsection numbers on the chapter page." },
  ny: { state: "New York", effect: "void", source: "case law", cite: "West-Fair Electric Contractors v. Aetna Casualty & Surety Co., 87 N.Y.2d 148 (1995)", url: "https://law.justia.com/cases/new-york/court-of-appeals/1995/87-n-y-2d-148-0.html", rule: "A clause making the owner's payment a condition precedent, so the sub bears the risk of the owner not paying, is void and unenforceable as contrary to the public policy in Lien Law §34. A clause that only sets a time for payment is still allowed, and payment on a stated event is read as timing unless the words say otherwise." },
  nc: { state: "North Carolina", effect: "void", source: "statute", cite: "N.C. Gen. Stat. §22C-2", url: "https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/BySection/Chapter_22c/GS_22c-2.html", rule: "Payment by the owner to a contractor is not a condition precedent for payment to a subcontractor, nor is a contractor's payment to one sub a condition for payment to another; an agreement to the contrary is unenforceable. 2025 House Bill 383 would also make pay-when-paid clauses unenforceable and add a 30-day limit; check whether it passed." },
  oh: { state: "Ohio (federal court applying Ohio law)", effect: "clear-words", source: "case law", cite: "Thos. J. Dyer Co. v. Bishop International Engineering Co., 303 F.2d 655 (6th Cir. 1962)", url: "https://law.justia.com/cases/federal/appellate-courts/F2/303/655/458116/", rule: "A clause saying payment is due five days after the owner pays was read as an unconditional promise to pay, with the time postponed until the owner pays or for a reasonable time if the owner does not. Reading it as an endless wait was an unreasonable construction the parties did not intend. This is a federal court's reading of Ohio law, not an Ohio statute." },
  sc: { state: "South Carolina", effect: "void", source: "statute", cite: "S.C. Code §29-6-230", url: "https://www.scstatehouse.gov/code/t29c006.php", rule: "Performance under its contract entitles a construction sub to payment from the party it contracted with. The owner's payment to the contractor, or the contractor's payment to another sub or supplier, is not a condition precedent for payment to the sub, and an agreement to the contrary is not enforceable." },
  wi: { state: "Wisconsin", effect: "delay-ok", source: "statute", cite: "Wis. Stat. §779.135(3)", url: "https://docs.legis.wisconsin.gov/document/statutes/779.135", rule: "In a contract to improve land in Wisconsin, a provision making payment to the prime contractor by someone who has no contract with the sub a condition precedent to the prime paying the sub is void. The subsection does not stop a provision that delays the sub's payment until the prime is paid." },
};

const EFFECT = {
  void: "In this state a pay-if-paid condition is unenforceable, so if the owner never pays, the GC still owes you for work you performed.",
  "delay-ok": "In this state the condition is void, but a clause that only delays your payment until the GC is paid can stand.",
  "lien-only": "In this state the clause cannot be used to defeat your mechanics lien (or, in Maryland, bond) claim. The statute does not say it is void for every purpose, so a straight contract claim may still meet it: keep your lien deadlines.",
  timing: "This state sets an outside date and gives you remedies when you are not paid, even under an \"only if or when paid\" clause.",
  "clear-words": "Here a court will read the clause as timing unless the words clearly put the risk of owner non-payment on you.",
};

// What the kind of clause means in the chosen state.
export function stateReading(kind, key) {
  const s = Object.hasOwn(STATES, key ?? "") ? STATES[key] : null;
  if (!s) {
    return { known: false, text: "We have not read this state's rule, so it is not shown. States differ: some void pay-if-paid clauses by statute, some protect only lien and bond rights, and some enforce clear pay-if-paid wording. A construction attorney in your state can tell you which applies." };
  }
  let text;
  if (kind === "pay-if-paid" || kind === "unclear") text = Object.hasOwn(EFFECT, s.effect) ? EFFECT[s.effect] : "";
  else if (kind === "pay-when-paid") text = s.effect === "timing" ? EFFECT.timing : "A pay-when-paid clause sets the time for payment; it does not by itself excuse the GC if the owner never pays. " + (s.effect === "delay-ok" ? "Wisconsin's statute expressly allows such a delay." : "Your state's rule below is about clauses that go further.");
  else text = "Your state's rule is below for reference.";
  return { known: true, text, ...s };
}

// Questions to take to the GC (before signing) or to an attorney.
export function questions(result, key) {
  const q = [];
  if (result.kind === "pay-if-paid" || result.kind === "unclear") {
    q.push("Ask to replace the condition with timing wording, for example: payment is due within a stated number of days after the contractor receives payment, and in any event within a stated number of days after your pay application is approved.");
    q.push("Ask what happens if the owner does not pay for reasons that are not your fault (a dispute over another trade's work, the owner's insolvency).");
  }
  if (result.kind === "pay-when-paid" && result.days == null) q.push("The clause names no number of days: ask for one, and an outside date if the owner is late.");
  if (result.kind !== "empty") {
    q.push("Check that nothing else in the subcontract makes you waive lien or bond rights, and keep your lien and bond notice deadlines whatever the clause says.");
    if (Object.hasOwn(STATES, key ?? "") && STATES[key].effect === "lien-only") q.push("Your state protects lien rights specifically: note your preliminary notice and lien filing deadlines now.");
  }
  return q;
}
