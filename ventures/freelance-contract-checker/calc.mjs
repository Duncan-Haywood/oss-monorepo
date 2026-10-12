// Freelance contract red-flag checker. Reads the contract or statement-of-work text plus what the user knows
// about the deal and returns findings. A set of text rules, not a legal reading: each finding says what to ask for.

const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();
const f = (id, severity, title, why, ask) => ({ id, severity, title, why, ask });

export function parseMoney(s) {
  const t = String(s ?? "").replace(/[$,\s]/g, "");
  if (t === "") return 0;
  if (!/^-?\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}
export function dollars(c) {
  const neg = c < 0;
  const s = Math.abs(c) / 100;
  return (neg ? "-$" : "$") + s.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const WORDNUM = { thirty: 30, forty: 40, "forty-five": 45, sixty: 60, ninety: 90, "one hundred twenty": 120 };

// Days until payment: "net 60", "within sixty (60) days of invoice", "paid 90 days after receipt". Largest one wins.
export function paymentDays(text) {
  const t = String(text).toLowerCase();
  const found = [];
  for (const m of t.matchAll(/\bnet[\s-]*(\d{1,3})\b/g)) found.push(+m[1]);
  for (const m of t.matchAll(/(?:within|after|in)\s+(?:(\w[\w -]*?)\s*)?\(?(\d{1,3})\)?\s*(?:calendar |business )?days[^.]{0,60}(?:invoice|receipt|acceptance|approval|delivery|completion)/g)) found.push(+m[2]);
  for (const m of t.matchAll(/(?:invoice|payment)[^.]{0,80}(?:within|after)\s+(\d{1,3})\s*days/g)) found.push(+m[1]);
  for (const [w, n] of Object.entries(WORDNUM)) if (new RegExp(`(?:within|after)\\s+${w}\\b[^.]{0,30}days`).test(t)) found.push(n);
  return found.length ? Math.max(...found) : null;
}

export function revisionCount(text) {
  const t = String(text).toLowerCase();
  const m = t.match(/(\d{1,2}|one|two|three|four|five)\s+(?:\(\d+\)\s+)?(?:rounds?|revisions?)(?:\s+of\s+revisions?)?/);
  if (!m) return null;
  const words = { one: 1, two: 2, three: 3, four: 4, five: 5 };
  return words[m[1]] ?? +m[1];
}

export function analyze(rawText, settings = {}) {
  const text = norm(rawText);
  const low = text.toLowerCase();
  if (text.length < 80) return { errors: ["Paste the full contract or statement of work first (at least a few sentences)."], findings: [], extracted: {} };
  const fee = parseMoney(settings.fee);
  if (fee === null) return { errors: ["The project fee is not a number."], findings: [], extracted: {} };
  const wantedDays = settings.wantedDays === "" || settings.wantedDays == null ? 30 : Number(settings.wantedDays);
  const findings = [];
  const days = paymentDays(text);
  const revs = revisionCount(text);

  const hasPayment = /(\$\s?\d|\bfee\b|\bcompensation\b|\binvoice|\bhourly rate|\bper hour\b|\bpayment\b)/.test(low);
  if (!hasPayment) {
    findings.push(f("no-payment-terms", "high", "No fee or payment terms found",
      "A contract that never says how much you are paid, or when, leaves both to be argued later.",
      "Add the fee (or rate), the invoice schedule, and the due date."));
  }
  if (days !== null && days > wantedDays) {
    const sev = days >= 60 ? "high" : "medium";
    findings.push(f("slow-payment", sev, `Payment is due ${days} days after invoice`,
      `You are financing the client for ${days} days.${fee ? ` On ${dollars(fee)} that is a long time to carry the whole fee.` : ""}`,
      `Ask for net ${wantedDays} or shorter, or a deposit up front and milestone invoices.`));
  }
  const pay = /(payable|paid|due)[^.]{0,80}(only )?(upon|after|once|when)[^.]{0,40}(client|customer|company)[^.]{0,40}(is paid|receives payment|receipt of payment from)/.test(low) || /pay[- ]when[- ]paid|pay[- ]if[- ]paid/.test(low);
  if (pay) {
    findings.push(f("pay-when-paid", "high", "You are paid only after the client is paid",
      "Their customer's delay or dispute becomes your unpaid invoice.", "Strike it. Your fee is due on your invoice, whatever the client's own customers do."));
  }
  if (!/(deposit|retainer|advance|upfront|up-front|milestone|\d+\s?%\s+(?:upon|on|at)\s+(?:signing|execution|kickoff|start))/.test(low)) {
    findings.push(f("no-deposit", "medium", "No deposit, retainer or milestone payments",
      "Without money up front or at stages, you deliver the whole project before you are paid anything.",
      "Ask for a deposit (commonly 25-50%) at signing and milestone invoices for the rest."));
  }
  if (!/(late (fee|charge|payment)|interest (on|at)|per month on (any )?(overdue|late|unpaid)|1\.5\s?%|suspend (work|services))/.test(low)) {
    findings.push(f("no-late-fee", "medium", "No late fee, interest or right to pause work",
      "Nothing happens if the client pays late, so there is no cost to doing so.", "Add a late fee or monthly interest and the right to stop work until overdue invoices are paid."));
  }

  const ipAll = /(all|any)\s+(right|rights|work product|work|deliverables|materials|ideas|inventions)[^.]{0,120}(whether or not|including|related|regardless)/.test(low)
    || /(assigns?|transfers?|owns?)[^.]{0,60}(all|any)[^.]{0,40}(intellectual property|work product|inventions)[^.]{0,80}(prior|existing|pre-existing|background|tools|know-how|during the term)/.test(low);
  const upon = /(upon|only upon|until)[^.]{0,40}(full |final )?(payment|paid)/.test(low) && /(assign|ownership|transfer|work made for hire|work for hire|license)/.test(low);
  const wfh = /work(s)?[- ]made[- ]for[- ]hire|work[- ]for[- ]hire/.test(low);
  if ((wfh || /(assigns?|hereby assign)/.test(low)) && !upon) {
    findings.push(f("ip-before-payment", "high", "You give up the work whether or not you are paid",
      "Ownership of what you deliver passes to the client when created or delivered, so non-payment leaves you with no leverage and no rights.",
      "Make the transfer effective only on full payment of all invoices."));
  }
  if (ipAll && !/(pre-existing|preexisting|prior (work|ip|intellectual)|background (ip|materials)|your (tools|templates|libraries)|retains? (all )?(rights|ownership) (in|to) (its|your|the contractor's) (tools|pre))/.test(low)) {
    findings.push(f("ip-too-broad", "high", "The IP clause reaches more than the project",
      "Wording about everything you create or any inventions can capture tools, templates and code you owned before this job, or work done for other clients.",
      "Limit it to deliverables created specifically for this project and carve out your pre-existing materials, tools and general know-how, licensed to the client as needed to use the deliverables."));
  }
  if (!/(portfolio|showcase|display|promot)/.test(low) && (wfh || /assign/.test(low))) {
    findings.push(f("no-portfolio-right", "info", "No right to show the work in your portfolio",
      "After assignment you may have no right to display your own work.", "Add a right to show the work in your portfolio and case studies, subject to confidentiality."));
  }

  const unlimited = /(unlimited|until (the )?(client|customer|company) is (satisfied|happy|pleased)|as many|any number of|additional revisions at no (additional )?(cost|charge|fee)|(revisions?|changes?|edits?)[^.]{0,60}no (additional )?(charge|cost|fee))/.test(low);
  if (unlimited) {
    findings.push(f("unlimited-revisions", "high", "Revisions are unlimited or open-ended",
      "An open revision clause turns a fixed fee into unpaid hours of unknown size and the project never closes.",
      "Cap it (for example two rounds), define a round, and bill further changes at your hourly rate."));
  } else if (revs === null && /(revision|revise|changes|edits|amend)/.test(low) === false) {
    findings.push(f("no-revision-limit", "medium", "Nothing says how many revisions are included",
      "Silence on revisions invites repeated rework at the same fee.", "State the number of revision rounds included and the rate for extra changes."));
  }
  if (!/(change order|change request|out[- ]of[- ]scope|additional work|scope change|changes? to (the )?scope)/.test(low)) {
    findings.push(f("no-scope-change", "medium", "No process for work outside the scope",
      "Without a change process, new asks arrive as 'while you are at it' and are expected at no charge.",
      "Add that work outside the written scope needs a written change order with its own fee and date."));
  }
  if (!/(accept(ed|ance)|deemed accepted|approv(ed|al))/.test(low) && /(deliver|completion)/.test(low)) {
    findings.push(f("no-acceptance", "medium", "No acceptance step or deadline for feedback",
      "If the client never replies, the project never ends and the final payment never comes due.",
      "Add that deliverables are deemed accepted if the client does not object in writing within a set number of days."));
  }

  if (/(terminate|cancel)[^.]{0,80}(at any time|for convenience|without cause)/.test(low)
    && !/(kill fee|cancellation fee|termination fee|pay(ment)? for (all )?(work|services) (performed|completed|rendered)|for (all )?work (performed|completed|done)|pro[- ]rata)/.test(low)) {
    findings.push(f("terminate-no-pay", "high", "The client can end it at any time with no payment for work done",
      "You can finish most of the project and be cut off with nothing owed.",
      "Require payment for all work completed to the termination date, the deposit to be non-refundable, and a kill fee."));
  }
  const oneSided = /(client|customer|company)\s+may\s+terminate/.test(low) && !/(contractor|consultant|freelancer|you|service provider)\s+may\s+terminate/.test(low);
  if (oneSided) {
    findings.push(f("one-sided-termination", "medium", "Only the client can terminate",
      "You are bound to the project while they can walk away.", "Make termination mutual, with written notice and payment through the end date."));
  }

  if (/(non-?compete|shall not (provide|perform|offer)[^.]{0,80}(competitor|similar)|not (to )?(work|provide services)[^.]{0,60}(competitor|competing))/.test(low)) {
    findings.push(f("non-compete", "high", "A non-compete or exclusivity limit on your other work",
      "A freelancer lives on several clients. A clause that bars competitors or similar work can take most of your market for its term.",
      "Strike it, or limit it to a direct named competitor, for the project term only, and pay for the exclusivity."));
  }
  if (/(non-?solicit)/.test(low) || /(solicit|hire|work for)[^.]{0,80}(client'?s?|company'?s?) (customers|clients|employees)/.test(low)) {
    findings.push(f("non-solicit", "medium", "A non-solicitation clause",
      "It may bar you from working with the client's customers or contacts, which can include your own existing clients.",
      "Limit it to employees, to the project term plus a short period, and exclude clients you already work with."));
  }

  const indem = /(indemnif|hold harmless)/.test(low);
  if (indem && !/(limited to|shall not exceed|capped|not exceed|up to the (total )?(fees|amount))/.test(low)) {
    findings.push(f("uncapped-indemnity", "high", "Indemnity with no cap",
      "If the client is sued over your work you could owe their legal costs and damages far beyond the fee.",
      "Make it mutual, limited to third-party claims caused by your breach, and capped at the fees paid under this contract."));
  }
  if (/(consequential|indirect|incidental|lost profits)/.test(low) === false && /(liab)/.test(low) === false) {
    findings.push(f("no-liability-limit", "medium", "No limit on your liability",
      "Without a cap, a mistake in a small project can be argued into a claim for the client's lost business.",
      "Add a cap at the fees paid and exclude consequential and indirect damages."));
  }
  if (/(warrants?|guarantees?)[^.]{0,80}(error[- ]free|free (of|from) (errors|bugs|defects)|will (meet|satisfy)[^.]{0,30}(needs|expectations)|100%)/.test(low)) {
    findings.push(f("absolute-warranty", "high", "An absolute warranty on the work",
      "Promising error-free or guaranteed results makes any defect a breach.", "Warrant that the work will substantially conform to the written specification, with a fix period as the remedy."));
  }
  if (/(confidential)/.test(low) && /(perpetual|in perpetuity|indefinite|forever|survive[^.]{0,30}(indefinitely|in perpetuity))/.test(low)) {
    findings.push(f("perpetual-nda", "medium", "Confidentiality with no end date",
      "An obligation that never expires binds you on information that may become public or stale.", "Limit it to two to five years after the end of the contract, with the usual exceptions for public and already-known information."));
  }
  if (/(exclusive|sole)[^.]{0,60}(services|engagement|full[- ]time)|(devote|dedicate)[^.]{0,40}(full|all)[^.]{0,20}(time|business hours)/.test(low) || /(set|fixed|regular)\s+(work\s+)?hours|(on[- ]?site|in[- ]office)[^.]{0,40}(required|must)/.test(low)) {
    findings.push(f("employee-control", "medium", "Terms that read like employment",
      "Fixed hours, exclusivity and required equipment or location resemble an employee relationship, which carries misclassification risk for both sides and may cost you protections.",
      "Make hours, location and method yours to decide, or ask whether this should be an employment offer with benefits."));
  }
  if (/(governing law|jurisdiction|venue)[^.]{0,120}(courts? (of|in)|state of)/.test(low) && /(arbitrat)/.test(low) && /(client'?s?|company'?s?) (home|principal|local)|exclusive (venue|jurisdiction)/.test(low)) {
    findings.push(f("far-venue", "info", "Disputes are fixed to the client's venue",
      "Suing for an unpaid invoice far from home can cost more than the invoice.", "Ask for neutral venue, remote arbitration, or your home county; and fee-shifting to the prevailing party."));
  }
  if (!/(prevailing party|reasonable (attorney|legal)['s]* fees|collection costs)/.test(low)) {
    findings.push(f("no-fee-shifting", "info", "Nothing about collection costs",
      "If you must chase an unpaid invoice, the cost falls on you.", "Add that the losing party pays reasonable collection and attorney fees."));
  }

  const high = findings.some((g) => g.severity === "high");
  const medium = findings.some((g) => g.severity === "medium");
  const verdict = high ? "push-back" : medium ? "ask-for-changes" : "no-red-flags";
  return { errors: [], findings, verdict, extracted: { days, revisions: revs, fee, wantedDays } };
}

export const VERDICT_TEXT = {
  "push-back": "Push back before you sign",
  "ask-for-changes": "Ask for changes before signing",
  "no-red-flags": "No red flags found by these rules",
};

export function summaryText(r, s = {}) {
  const x = r.extracted;
  const lines = ["FREELANCE CONTRACT CHECK"];
  if (s.client) lines.push(`Client: ${s.client}`);
  if (s.project) lines.push(`Project: ${s.project}`);
  lines.push(`Payment due in the text: ${x.days ? x.days + " days" : "not found"}`);
  lines.push(`Revision rounds in the text: ${x.revisions ?? "not found"}`);
  if (x.fee) lines.push(`Project fee: ${dollars(x.fee)}`);
  lines.push("", `RESULT: ${VERDICT_TEXT[r.verdict]}`, "");
  if (!r.findings.length) lines.push("Nothing flagged. These rules read text only; they cannot tell you the contract is fair or enforceable.");
  for (const [i, g] of r.findings.entries()) lines.push(`${i + 1}. [${g.severity.toUpperCase()}] ${g.title}`, `   Why: ${g.why}`, `   Ask for: ${g.ask}`, "");
  lines.push("A worksheet from a text checker, not legal advice. Have an attorney review anything that matters.");
  return lines.join("\n");
}

export function findingsCsv(r) {
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  return ["severity,finding,why,ask_for", ...r.findings.map((g) => [g.severity, g.title, g.why, g.ask].map(q).join(","))].join("\n");
}

export function sampleContract() {
  return `INDEPENDENT CONTRACTOR AGREEMENT

Brightpath Media (the "Company") engages Contractor to design and build a marketing website. Fee: $6,000, payable net 60 days after receipt of invoice, and only after the Company is paid by its own client.

All work product, inventions and ideas created by Contractor, whether or not related to the project, are works made for hire and are hereby assigned to the Company. Contractor will provide unlimited revisions until the Company is satisfied. The Company may terminate this agreement at any time without cause. Contractor shall not provide services to any competitor of the Company during the term and for twelve months after. Contractor shall indemnify and hold harmless the Company from all claims. Contractor warrants the work will be error-free.`;
}

export const SAMPLE_SETTINGS = { fee: "6000", wantedDays: "30", client: "Brightpath Media", project: "Marketing website" };
