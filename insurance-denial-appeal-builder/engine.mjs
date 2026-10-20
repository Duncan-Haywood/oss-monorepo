// Insurance denial appeal builder: pure functions, no I/O, no network.
// Reads the text of a denial letter or EOB, guesses the denial reason and
// the stated appeal window, computes the deadlines that follow from the
// plan type and the date the notice was received, and drafts the appeal
// letter, the evidence checklist and a calendar file.
//
// Every date is a reminder computed from rules of thumb; the notice itself
// controls. The page and the letter both say so.

export const PLAN_TYPES = {
  commercial: {
    label: "Employer or individual/Marketplace plan",
    appealDays: 180,
    decide: { urgent: "72 hours", pre: "30 days", post: "60 days" },
    next: "External review by an independent reviewer, requested within four months of the final internal denial.",
  },
  medicare_advantage: {
    label: "Medicare Advantage plan",
    appealDays: 60,
    decide: { urgent: "72 hours", pre: "30 days", post: "60 days" },
    next: "If the plan upholds the denial it forwards the case to the independent review entity automatically.",
  },
  medicare_original: {
    label: "Original Medicare (Part A/B)",
    appealDays: 120,
    decide: { urgent: "", pre: "60 days", post: "60 days" },
    next: "Reconsideration by a Qualified Independent Contractor, requested within 180 days of the redetermination notice.",
  },
  medicaid: {
    label: "Medicaid or CHIP",
    appealDays: null,
    decide: { urgent: "", pre: "", post: "" },
    next: "State fair hearing. Deadlines differ by state and are printed on the notice.",
  },
  other: {
    label: "Other or not sure",
    appealDays: null,
    decide: { urgent: "", pre: "", post: "" },
    next: "Follow the appeal steps printed on the notice.",
  },
};

// Adjustment reason codes as they are commonly defined on an EOB or remittance.
// The code on your own paperwork is the one that counts.
export const CARC = {
  50: "medical_necessity",
  55: "experimental",
  197: "prior_auth",
  198: "prior_auth",
  243: "prior_auth",
  242: "out_of_network",
  96: "not_covered",
  204: "not_covered",
  167: "not_covered",
  16: "coding_error",
  11: "coding_error",
  4: "coding_error",
  18: "duplicate",
  29: "timely_filing",
  22: "cob",
  109: "cob",
  119: "benefit_limit",
  97: "bundled",
  59: "bundled",
  234: "bundled",
  236: "bundled",
  26: "eligibility",
  27: "eligibility",
  31: "eligibility",
  32: "eligibility",
};

export const REASONS = {
  medical_necessity: {
    label: "Not medically necessary",
    firstStep: "Ask your doctor's office for a letter of medical necessity; this denial is overturned on clinical evidence more than on wording.",
    asks: [
      "the specific clinical criteria or guideline used, and the name and credentials of the reviewer",
      "the claim file, including the reviewer's notes, at no charge",
      "a review by a clinician in the same or a similar specialty who was not involved in the first decision",
    ],
    evidence: [
      "letter from the treating clinician explaining why this service is needed for this diagnosis",
      "chart notes and test results that show the condition and what was tried before",
      "published guideline or peer-reviewed article the clinician relies on (the clinician can supply it)",
      "the denial letter and the explanation of benefits",
    ],
    argument:
      "My treating clinician ordered this service because it is needed to diagnose or treat my condition. The denial does not explain which part of my medical record fails the plan's own criteria. I ask that the decision be reviewed against the enclosed clinical information.",
  },
  prior_auth: {
    label: "No prior authorization or referral on file",
    firstStep: "Call the provider first: they often can ask the plan for a retroactive authorization or resubmit with the authorization number, which is faster than an appeal.",
    asks: [
      "whether a retroactive authorization can be issued and what the plan needs to do so",
      "the date the provider asked for authorization, if the plan has any record of it",
      "the plan provision that makes authorization a condition of payment for this service",
    ],
    evidence: [
      "authorization or referral number, or the provider's record of requesting it",
      "proof of an emergency, if the service could not wait (admission note, triage record)",
      "the denial letter and the explanation of benefits",
    ],
    argument:
      "The service was needed and was ordered by my treating provider. If authorization was required, the obligation to request it fell on the provider's office, which I relied on. I ask the plan to authorize the service retroactively or to pay the claim on review.",
  },
  out_of_network: {
    label: "Out of network",
    firstStep: "Check whether it was an emergency, or whether you were treated by an out-of-network provider at an in-network facility; federal surprise-billing rules may limit what you owe in those cases.",
    asks: [
      "whether the claim was processed under the emergency or in-network-facility rules",
      "whether an in-network provider with the needed expertise was available within the plan's access standards",
      "the network adequacy standard the plan applied",
    ],
    evidence: [
      "record that it was an emergency, or that the facility was in network",
      "proof the plan's directory listed the provider as in network when you booked, if it did",
      "any record that no in-network provider could treat you in time",
    ],
    argument:
      "This care was delivered where I could not reasonably choose the provider, or no in-network provider was available for it. I ask the plan to reprocess the claim at the in-network benefit level.",
  },
  experimental: {
    label: "Experimental or investigational",
    firstStep: "Ask your doctor for the studies that support the treatment for your condition; plans decide these on published evidence.",
    asks: [
      "the plan's written policy on this treatment and the date it was last reviewed",
      "the evidence the plan relied on and the reviewer's credentials",
      "whether the plan covers this treatment for any diagnosis, and under what conditions",
    ],
    evidence: [
      "peer-reviewed studies or professional-society guidance supporting the treatment",
      "letter from the treating clinician on why alternatives are not suitable",
      "any approval for the same treatment by a regulator, if it exists",
    ],
    argument:
      "My treating clinician has recommended this treatment based on published clinical evidence for my condition, and standard alternatives are not suitable for me. I ask that the denial be reviewed against the enclosed evidence by a clinician with relevant expertise.",
  },
  not_covered: {
    label: "Not a covered benefit, or excluded",
    firstStep: "Read the plan's summary of benefits for the exact exclusion wording; some denials cite an exclusion that does not match the service or the diagnosis.",
    asks: [
      "the specific plan provision relied on, quoted in full",
      "why this service falls inside that provision",
      "the plan document and summary plan description, at no charge",
    ],
    evidence: [
      "the plan's summary of benefits and the page naming the benefit category",
      "clinician's letter showing the service treats a covered condition",
      "the denial letter and the explanation of benefits",
    ],
    argument:
      "I do not believe the provision cited applies to this service. I ask the plan to show how the provision applies and, if it does not, to reprocess the claim under the benefit that does.",
  },
  coding_error: {
    label: "Billing or coding problem",
    firstStep: "Call the provider's billing office before appealing: a corrected claim is usually quicker than an appeal, and you may not owe anything while it is pending.",
    asks: [
      "which code, modifier or missing field caused the denial",
      "whether the provider has been told and can send a corrected claim",
      "that the claim be held for correction rather than treated as final",
    ],
    evidence: [
      "the provider's corrected claim or a note from billing that one was sent",
      "the explanation of benefits showing the code that was denied",
    ],
    argument:
      "The denial appears to arise from a coding or submission problem, not from a decision about my coverage. I ask the plan to reprocess the claim once the provider submits corrected information, and not to treat this as a final determination.",
  },
  timely_filing: {
    label: "Filed too late",
    firstStep: "Find proof the claim was submitted on time (clearinghouse report, fax confirmation, an earlier denial); that proof is the whole appeal.",
    asks: [
      "the filing deadline the plan applied and the date it says the claim arrived",
      "whether the plan accepts proof of timely submission",
    ],
    evidence: [
      "clearinghouse or portal receipt showing the original submission date",
      "any earlier rejection or correspondence about this claim",
    ],
    argument:
      "The claim was submitted within the time limit, as the enclosed record shows. I ask the plan to reprocess it using the original submission date.",
  },
  duplicate: {
    label: "Denied as a duplicate",
    firstStep: "Check whether the other claim was paid; if it was, this may be correct, and your remaining balance is what to ask the provider about.",
    asks: [
      "the claim number of the claim treated as the original",
      "whether the services on the two claims are actually the same",
    ],
    evidence: [
      "the explanation of benefits for both claims",
      "the provider's itemized bill showing distinct dates or services",
    ],
    argument:
      "The services on this claim are separate from the claim it was matched with. I ask the plan to review the two claims line by line.",
  },
  cob: {
    label: "Other insurance or wrong payer",
    firstStep: "Update the plan's record of your other coverage; the denial often clears once the plan knows which insurance pays first.",
    asks: [
      "which other coverage the plan believes exists",
      "what the plan needs from you to settle the order of payment",
    ],
    evidence: [
      "your other plan's explanation of benefits or a letter of no coverage",
      "the completed coordination-of-benefits questionnaire from the plan",
    ],
    argument:
      "I have given the plan the information it needs about other coverage, as enclosed. I ask that the claim be reprocessed on that basis.",
  },
  benefit_limit: {
    label: "Benefit limit reached",
    firstStep: "Ask for the accumulator showing how the limit was counted; counting mistakes and claims applied to the wrong year are common.",
    asks: [
      "the benefit accumulator for the year, listing each claim counted",
      "the plan provision setting the limit",
      "whether an exception exists when the service is medically necessary",
    ],
    evidence: [
      "the plan's benefit summary showing the limit",
      "clinician's letter on why more of the service is needed",
    ],
    argument:
      "I ask the plan to confirm how the limit was counted and to review whether an exception applies given my clinician's recommendation.",
  },
  bundled: {
    label: "Bundled or paid at a lower level of service",
    firstStep: "Ask the provider's billing office whether the codes were billed correctly (a missing modifier is the usual cause) before you appeal.",
    asks: [
      "the payment policy or coding edit that combined or reduced these lines",
      "which line was treated as the primary service and which as included in it",
      "whether the claim can be reprocessed with the modifier or documentation the provider can supply",
    ],
    evidence: [
      "the provider's operative or visit note showing the services were separate and distinct",
      "a corrected claim or a note from billing about the modifier used",
      "the explanation of benefits showing which lines were bundled or reduced",
    ],
    argument:
      "The services on this claim were separate and each was medically necessary. I ask the plan to show the policy it applied in combining or reducing them and to reprocess the claim on review of the enclosed records.",
  },
  eligibility: {
    label: "Coverage not active or patient not eligible",
    firstStep: "Confirm the coverage dates with your employer's benefits office or the plan before anything else; terminations backdated in error and late premium processing are common and quick to fix.",
    asks: [
      "the coverage dates the plan has on file and the reason any coverage was ended",
      "the date and notice by which the plan told you coverage had ended",
      "that the claim be reprocessed if coverage is shown to have been active on the date of service",
    ],
    evidence: [
      "proof of coverage on the date of service (insurance card, premium payment record, employer confirmation)",
      "any notice of termination or reinstatement, and the dates you received it",
      "the denial letter and the explanation of benefits",
    ],
    argument:
      "My coverage was in force on the date of service. I ask the plan to check its enrollment records against the enclosed proof and, if coverage was active, to reprocess the claim for payment.",
  },
  surprise_bill: {
    label: "Out-of-network bill after emergency or at an in-network facility",
    firstStep: "Do not pay the balance yet. For emergency care, and for out-of-network clinicians at an in-network hospital, federal law generally limits what you can be charged to your in-network cost sharing; ask the provider to bill again at that level.",
    asks: [
      "whether the claim was processed under the No Surprises Act protections for emergency or facility-based care",
      "the in-network cost-sharing amount the plan says applies and how it was calculated",
      "the qualifying payment amount the plan used for this service",
    ],
    evidence: [
      "proof the care was an emergency or took place at an in-network facility (admission record, facility name)",
      "the provider's bill and the explanation of benefits showing the balance you were asked to pay",
      "any notice and consent form you were given before treatment, if there was one",
    ],
    argument:
      "This care was an emergency, or was provided by an out-of-network clinician at an in-network facility. I did not choose the out-of-network provider. I ask the plan to reprocess the claim with in-network cost sharing as federal surprise-billing protections generally require, and to tell me how that amount was calculated.",
  },
  other: {
    label: "Other or unclear",
    firstStep: "Ask the plan in writing which specific rule it applied; an appeal is stronger once you know.",
    asks: [
      "the specific reason and plan provision for the denial, in writing",
      "the claim file at no charge",
    ],
    evidence: ["the denial letter and the explanation of benefits", "the provider's itemized bill"],
    argument:
      "The denial does not give me enough detail to respond to it. I ask the plan to state the specific reason and provision relied on and to review the claim again.",
  },
};

const PHRASES = [
  ["medical_necessity", /not\s+(?:deemed\s+)?medically\s+(?:necessary|reasonable)|medical\s+necessity|does\s+not\s+meet\s+(?:our\s+)?(?:clinical\s+)?criteria|not\s+clinically\s+appropriate/i, 3],
  ["prior_auth", /prior\s+auth|pre-?authori[sz]ation|pre-?certif|no\s+referral|referral\s+(?:was\s+)?(?:not|required)|authorization\s+(?:was\s+)?(?:not|required|absent)/i, 3],
  ["out_of_network", /out[\s-]of[\s-]network|non-?participating|not\s+(?:a\s+)?(?:participating|in[\s-]network)|non[\s-]par\b/i, 3],
  ["experimental", /experimental|investigational|unproven/i, 3],
  ["not_covered", /not\s+a\s+covered\s+(?:benefit|service)|non-?covered|excluded\s+(?:from|under)|exclusion|not\s+covered\s+under/i, 2],
  ["coding_error", /billing\s+error|incorrect\s+(?:code|modifier)|missing\s+(?:information|modifier|diagnosis)|lacks\s+information|invalid\s+(?:code|modifier)/i, 2],
  ["timely_filing", /timely\s+filing|filing\s+(?:limit|deadline)|time\s+limit\s+for\s+filing|submitted\s+(?:after|too\s+late)/i, 3],
  ["duplicate", /duplicate\s+(?:claim|service|charge)|already\s+(?:been\s+)?(?:paid|processed)/i, 3],
  ["cob", /coordination\s+of\s+benefits|other\s+(?:insurance|coverage)|primary\s+(?:payer|insurance)|wrong\s+payer/i, 3],
  ["benefit_limit", /benefit\s+(?:maximum|limit)|visit\s+limit|(?:limit|maximum)\s+(?:has\s+been\s+)?reached|annual\s+maximum/i, 3],
  ["bundled", /bundl(?:ed|ing)|(?:included|incidental)\s+(?:in|to)\s+(?:another|the\s+primary)\s+(?:service|procedure)|downcod|unbundl|reduced\s+to\s+a\s+lower\s+level/i, 3],
  ["eligibility", /coverage\s+(?:was\s+)?(?:not\s+(?:in\s+effect|active)|terminated|cancel+ed|ended|lapsed)|not\s+eligible\s+(?:on|for\s+benefits)|patient\s+not\s+(?:covered|eligible)|policy\s+(?:was\s+)?(?:terminated|inactive)|no\s+active\s+coverage/i, 3],
  ["surprise_bill", /no\s+surprises\s+act|surprise\s+(?:bill|billing)|balance\s+bill|emergency\s+(?:room|services?|care)[^.]{0,80}out[\s-]of[\s-]network|out[\s-]of[\s-]network[^.]{0,80}(?:in[\s-]network\s+(?:hospital|facility)|emergency)/i, 4],
];

const MONEY = /\$\s?([\d,]+(?:\.\d{2})?)/g;

function cleanId(v) {
  return v ? v.replace(/[.,;:]+$/, "") : null;
}

/** Read what can be read from the denial letter. Returns ranked reasons with the evidence for each. */
export function readDenial(text) {
  const t = String(text || "");
  const score = {};
  const why = {};
  const bump = (id, n, note) => {
    score[id] = (score[id] || 0) + n;
    (why[id] ||= []).push(note);
  };
  for (const m of t.matchAll(/\b(?:CARC|reason\s+code|remark\s+code|adjustment\s+code|(?:CO|PR|OA|PI)[\s-]?)\s*[:#-]?\s*(\d{1,3})\b/gi)) {
    const id = CARC[Number(m[1])];
    if (id) bump(id, 5, `code ${m[1]} is commonly defined as "${REASONS[id].label.toLowerCase()}"`);
  }
  for (const [id, re, w] of PHRASES) {
    const m = t.match(re);
    if (m) bump(id, w, `the letter says "${m[0].replace(/\s+/g, " ")}"`);
  }
  const ranked = Object.entries(score)
    .sort((a, b) => b[1] - a[1])
    .map(([id, s]) => ({ id, score: s, label: REASONS[id].label, why: why[id] }));

  let statedDays = null;
  for (const m of t.matchAll(/(?:appeal|request\s+(?:a\s+)?(?:review|reconsideration|redetermination))[^.]{0,120}?within\s+(\d{2,3})\s+(?:calendar\s+)?days|within\s+(\d{2,3})\s+(?:calendar\s+)?days[^.]{0,120}?(?:appeal|review|reconsideration|redetermination)/gi)) {
    statedDays = Number(m[1] || m[2]);
    break;
  }
  const claim = t.match(/claim\s*(?:number|no\.?|#|id)\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{4,})/i);
  const member = t.match(/(?:member|subscriber|policy)\s*(?:id|number|no\.?|#)\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{4,})/i);
  const amounts = [...t.matchAll(MONEY)].map((m) => Number(m[1].replace(/,/g, ""))).filter((n) => Number.isFinite(n));
  const dateM = t.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/) || null;
  const usDate = t.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  let noticeDate = null;
  if (dateM) noticeDate = `${dateM[1]}-${dateM[2]}-${dateM[3]}`;
  else if (usDate) noticeDate = `${usDate[3]}-${usDate[1].padStart(2, "0")}-${usDate[2].padStart(2, "0")}`;
  return {
    reasons: ranked,
    top: ranked[0]?.id || null,
    urgent: /urgent|expedited|emergency\s+appeal/i.test(t),
    statedDays: statedDays && statedDays >= 10 && statedDays <= 400 ? statedDays : null,
    claimNumber: cleanId(claim?.[1]),
    memberId: cleanId(member?.[1]),
    noticeDate: noticeDate && !Number.isNaN(Date.parse(noticeDate)) ? noticeDate : null,
    largestAmount: amounts.length ? Math.max(...amounts) : null,
  };
}

const DAY = 86400000;

export function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "").trim());
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCMonth() === +m[2] - 1 ? d : null;
}

export function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

export function addDays(d, n) {
  return new Date(d.getTime() + n * DAY);
}

export function addMonths(d, n) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d.getUTCDate(), last));
  return t;
}

/**
 * Deadlines that follow from the plan type and the date the notice was received.
 * `statedDays` (read from the notice) always wins over the rule of thumb.
 */
export function deadlines({ plan = "commercial", received, today, statedDays = null, urgent = false, preService = false }) {
  const p = PLAN_TYPES[plan] || PLAN_TYPES.other;
  const r = parseDate(received);
  const now = parseDate(today);
  if (!r) return { error: "Enter the date you received the denial notice as YYYY-MM-DD." };
  if (!now) return { error: "Today's date is not valid." };
  const days = statedDays || p.appealDays;
  const out = { plan: p.label, basis: null, appealBy: null, daysLeft: null, status: "unknown", decideWithin: null, next: p.next, externalBy: null, notes: [] };
  if (days) {
    const by = addDays(r, days);
    out.appealBy = fmtDate(by);
    out.daysLeft = Math.round((by - now) / DAY);
    out.basis = statedDays ? `${days} days, as stated in the notice` : `${days} days for this plan type (a rule of thumb; the notice controls)`;
    out.status = out.daysLeft < 0 ? "passed" : out.daysLeft <= 14 ? "closing" : "open";
    if (out.status === "passed") out.notes.push("The window looks closed. Appeal anyway and ask for an exception in the letter: plans sometimes accept a late appeal, especially with a good reason, and the worst answer is no.");
    if (out.status === "closing") out.notes.push("Fewer than two weeks left. Send it by a method that proves the date, and call to confirm it arrived.");
  } else {
    out.basis = "this plan type has deadlines that vary; use the date printed on your notice";
    out.notes.push("No deadline could be computed. Find the appeal deadline on the notice and enter it as days under \"Days stated in the notice\".");
  }
  const d = p.decide;
  out.decideWithin = urgent ? d.urgent || null : preService ? d.pre || null : d.post || null;
  if (out.decideWithin) out.notes.push(`Once you file, the usual time limit for a decision is about ${out.decideWithin} (${urgent ? "urgent" : preService ? "before-service" : "payment"} appeal).`);
  if (plan === "commercial") out.externalBy = "four months after the final internal denial";
  if (plan === "medicare_original") out.externalBy = "180 days after the redetermination notice";
  if (urgent && plan !== "commercial" && plan !== "medicare_advantage") out.notes.push("Urgent decisions are handled differently under this plan type; call the number on the notice.");
  return out;
}

const usd = (n) => (Number.isFinite(n) ? "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "");

/** Draft the appeal letter. Plain text, written in the first person. */
export function appealLetter(c) {
  const reason = REASONS[c.reason] || REASONS.other;
  const plan = PLAN_TYPES[c.plan] || PLAN_TYPES.other;
  const lines = [];
  const ph = (v, hint) => (v && String(v).trim() ? String(v).trim() : `[${hint}]`);
  lines.push(ph(c.patient, "your name"));
  lines.push("");
  lines.push(c.date || "[date]");
  lines.push("");
  lines.push(`To: Appeals Department, ${ph(c.insurer, "insurer name")}`);
  lines.push(`Re: ${c.urgent ? "URGENT / EXPEDITED " : ""}appeal of denied claim`);
  lines.push(`Member: ${ph(c.patient, "name")}   Member ID: ${ph(c.memberId, "member ID")}`);
  lines.push(`Claim number: ${ph(c.claimNumber, "claim number")}   Date of service: ${ph(c.serviceDate, "date of service")}`);
  if (c.provider) lines.push(`Provider: ${c.provider}`);
  if (c.service) lines.push(`Service: ${c.service}`);
  if (Number.isFinite(c.amount) && c.amount > 0) lines.push(`Amount denied: ${usd(c.amount)}`);
  lines.push("");
  lines.push("To the Appeals Department:");
  lines.push("");
  const reasonTxt = c.denialReasonText ? ` The notice gives this reason: "${c.denialReasonText.trim()}"` : ` The reason given was: ${reason.label.toLowerCase()}.`;
  lines.push(`I am appealing the denial of the claim above, which I received notice of on ${ph(c.received, "date received")}.${reasonTxt}`);
  lines.push("");
  lines.push(reason.argument);
  if (c.why && c.why.trim()) {
    lines.push("");
    lines.push("Details specific to my case:");
    lines.push(c.why.trim());
  }
  lines.push("");
  lines.push("I ask that you:");
  reason.asks.forEach((a, i) => lines.push(`${i + 1}. send me ${a};`));
  lines.push(`${reason.asks.length + 1}. confirm in writing that you received this appeal and the date you will decide it;`);
  lines.push(`${reason.asks.length + 2}. reverse the denial and process the claim for payment.`);
  if (c.plan === "commercial") {
    lines.push("");
    lines.push("I also ask for copies, free of charge, of all documents and records relevant to this claim, including the internal rules, guidelines or criteria relied on, as plans are generally required to provide on request. If the denial is upheld, please tell me in writing how to request an independent external review.");
  } else if (c.plan === "medicare_advantage") {
    lines.push("");
    lines.push("This letter is my request for reconsideration of the plan's decision. If the plan upholds its denial, I ask that the case be forwarded to the independent review entity.");
  } else if (c.plan === "medicare_original") {
    lines.push("");
    lines.push("This letter is my request for a redetermination. A completed Medicare Redetermination Request Form (CMS-20027) is enclosed or may be substituted for this letter.");
  } else if (c.plan === "medicaid") {
    lines.push("");
    lines.push("Please treat this as my request for review and for a state fair hearing if the denial is not reversed.");
  }
  if (c.urgent) {
    lines.push("");
    lines.push("I request an expedited decision. My clinician has indicated that waiting for the standard timeframe could seriously jeopardize my health or my ability to regain function.");
  }
  if (c.late) {
    lines.push("");
    lines.push("I recognise this appeal may be past the stated deadline. I ask that it be accepted anyway, for good cause: " + (c.lateReason && c.lateReason.trim() ? c.lateReason.trim() : "[explain why you could not appeal sooner, such as illness, a hospital stay, or a notice that arrived late]") + ".");
  }
  lines.push("");
  lines.push("Enclosed:");
  reason.evidence.forEach((e) => lines.push(`- ${e}`));
  lines.push("");
  lines.push("Sincerely,");
  lines.push(ph(c.patient, "your name"));
  lines.push(`Phone: ${ph(c.phone, "phone")}`);
  lines.push("");
  lines.push(`[Sent by a method that records the date: ${plan.label.startsWith("Medicare") ? "mail with tracking, fax with confirmation or the plan's portal" : "certified mail, fax with confirmation or the insurer's portal"}. Keep a copy.]`);
  return lines.join("\n");
}

const phold = (v, hint) => (v && String(v).trim() ? String(v).trim() : `[${hint}]`);

/**
 * Letter for the treating clinician to review, edit and sign. Written from the
 * patient's side as a starting draft; clinical facts are placeholders because
 * only the clinician can state them.
 */
export function providerLetter(c) {
  const reason = REASONS[c.reason] || REASONS.other;
  const L = [];
  L.push(`Dr. ${phold(c.provider, "clinician name")}`);
  L.push("");
  L.push(c.date || "[date]");
  L.push("");
  L.push(`To: Appeals Department, ${phold(c.insurer, "insurer name")}`);
  L.push(`Re: ${c.urgent ? "URGENT / EXPEDITED " : ""}${reason.label.toLowerCase()} denial. Patient: ${phold(c.patient, "patient name")}, Member ID ${phold(c.memberId, "member ID")}, claim ${phold(c.claimNumber, "claim number")}`);
  L.push(`Service: ${phold(c.service, "service or treatment")}   Date of service: ${phold(c.serviceDate, "date of service")}`);
  L.push("");
  L.push("To the Appeals Department:");
  L.push("");
  L.push(`I am the treating clinician for ${phold(c.patient, "patient name")}. I write in support of the appeal of the denial of the service above and ask that it be reviewed by a clinician in the same or a similar specialty.`);
  L.push("");
  L.push("Diagnosis and history (clinician to complete):");
  L.push(`- Diagnosis and codes: [diagnosis, ICD-10 code(s)]`);
  L.push(`- Symptoms and findings: [what the patient presents with and what the exam or tests show]`);
  L.push(`- Treatments already tried and the result: [for example therapy, medication, dates and outcomes]`);
  L.push("");
  L.push("Why this service is needed (clinician to complete):");
  if (c.reason === "medical_necessity") {
    L.push("- [Explain why this service is appropriate for this patient and how it changes management.]");
    L.push("- [Cite the guideline or study relied on, and say how the patient meets it.]");
    L.push("- [State the risk of not providing it or of a less costly alternative that was considered.]");
  } else if (c.reason === "experimental") {
    L.push("- [Explain why standard treatments are not suitable or have failed for this patient.]");
    L.push("- [Cite the published evidence for this use and any professional society position.]");
  } else if (c.reason === "prior_auth") {
    L.push("- [State whether authorization was requested, when and by whom, with the reference number.]");
    L.push("- [If emergent or time-sensitive, state why the service could not wait for authorization.]");
  } else {
    L.push("- [Explain why this service was needed for this patient.]");
  }
  if (c.why && c.why.trim()) {
    L.push("");
    L.push("Facts the patient has given for this letter (confirm before relying on them):");
    L.push(c.why.trim());
  }
  L.push("");
  if (c.urgent) {
    L.push("In my professional judgment, waiting for the standard review timeframe could seriously jeopardize this patient's life, health or ability to regain maximum function. I request an expedited review.");
    L.push("");
  }
  L.push("I am available for a peer-to-peer discussion with the plan's reviewing physician and ask that the plan call my office at [office phone] to arrange one before a final decision is made.");
  L.push("");
  L.push("Sincerely,");
  L.push("[clinician name, credentials, specialty]");
  L.push("[practice, address, phone, NPI]");
  L.push("");
  L.push("[The clinician must review and sign this draft. It states no clinical fact for them.]");
  return L.join("\n");
}

/**
 * Request for independent external review after the plan has upheld its
 * denial on internal appeal. Dates and outcome come from the user.
 */
export function externalReviewLetter(c) {
  const reason = REASONS[c.reason] || REASONS.other;
  const L = [];
  L.push(phold(c.patient, "your name"));
  L.push("");
  L.push(c.date || "[date]");
  L.push("");
  L.push(`To: External Review Request, ${phold(c.insurer, "insurer name, or the external review organization named on your final denial")}`);
  L.push(`Re: ${c.urgent ? "EXPEDITED " : ""}request for independent external review`);
  L.push(`Member: ${phold(c.patient, "name")}   Member ID: ${phold(c.memberId, "member ID")}`);
  L.push(`Claim number: ${phold(c.claimNumber, "claim number")}   Date of service: ${phold(c.serviceDate, "date of service")}`);
  if (c.service) L.push(`Service: ${c.service}`);
  L.push("");
  L.push("To whom it may concern:");
  L.push("");
  L.push(`I request an independent external review of the plan's final internal denial dated ${phold(c.finalDenialDate, "date of the final internal denial")}. The plan's stated reason was: ${reason.label.toLowerCase()}.`);
  L.push("");
  L.push(`I filed an internal appeal on ${phold(c.appealDate, "date you filed the internal appeal")} and the plan upheld its decision. A copy of the original denial, my internal appeal and the final denial are enclosed.`);
  L.push("");
  L.push(reason.argument);
  if (c.why && c.why.trim()) {
    L.push("");
    L.push("Details specific to my case:");
    L.push(c.why.trim());
  }
  L.push("");
  L.push("I ask the reviewer to decide the case on the enclosed medical records and the clinician's letter, and to require the plan to cover the service. I also ask that the plan send the reviewer the complete claim file and the criteria it relied on.");
  if (c.urgent) {
    L.push("");
    L.push("I request an expedited review. My clinician has indicated that waiting for the standard timeframe could seriously jeopardize my health or my ability to regain function.");
  }
  L.push("");
  L.push("Enclosed:");
  L.push("- the original denial letter and explanation of benefits");
  L.push("- my internal appeal and the plan's final internal denial");
  reason.evidence.filter((e) => !/denial letter/.test(e)).forEach((e) => L.push(`- ${e}`));
  L.push("- the external review request form, if your state or plan uses one");
  L.push("");
  L.push("Sincerely,");
  L.push(phold(c.patient, "your name"));
  L.push(`Phone: ${phold(c.phone, "phone")}`);
  L.push("");
  L.push("[Check the final denial for the exact address, form and deadline. For most commercial plans the request is due four months after that notice, and the review is free to you. Keep a copy and send by a method that records the date.]");
  return L.join("\n");
}

/** What to collect before sending, in the order that matters. */
export function checklist(reasonId, { urgent = false } = {}) {
  const r = REASONS[reasonId] || REASONS.other;
  const items = [
    { step: "Find the date you received the notice and the appeal deadline printed on it", done: false },
    { step: r.firstStep, done: false },
    ...r.evidence.map((e) => ({ step: `Gather: ${e}`, done: false })),
    { step: "Ask the plan for the full claim file and the criteria it used (the letter does this)", done: false },
    { step: "Send by a method that records the date, and keep a copy of everything", done: false },
    { step: "Call in 5 to 7 business days to confirm the appeal was received and logged", done: false },
  ];
  if (urgent) items.splice(2, 0, { step: "Ask your clinician to state in writing that waiting would seriously jeopardize your health", done: false });
  return items;
}

function icsEscape(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function icsFold(line) {
  const out = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = " " + rest.slice(74);
  }
  out.push(rest);
  return out.join("\r\n");
}

/** Calendar file with reminders ahead of the appeal deadline. */
export function calendar(d, { title = "Insurance appeal", claim = "", stamp = "20260101T000000Z" } = {}) {
  if (!d || !d.appealBy) return null;
  const by = parseDate(d.appealBy);
  const mk = (uid, date, summary, desc) => {
    const next = addDays(date, 1);
    const f = (x) => fmtDate(x).replace(/-/g, "");
    return [
      "BEGIN:VEVENT",
      `UID:${uid}@insurance-denial-appeal-builder`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${f(date)}`,
      `DTEND;VALUE=DATE:${f(next)}`,
      `SUMMARY:${icsEscape(summary)}`,
      `DESCRIPTION:${icsEscape(desc)}`,
      "END:VEVENT",
    ];
  };
  const tag = claim ? ` (claim ${claim})` : "";
  const events = [
    ...mk("deadline", by, `${title}: appeal deadline${tag}`, "Appeal deadline computed from the notice date. The date on your notice controls."),
    ...mk("two-weeks", addDays(by, -14), `${title}: two weeks to appeal deadline${tag}`, "Gather the evidence and send the appeal."),
    ...mk("one-week", addDays(by, -7), `${title}: one week to appeal deadline${tag}`, "Send the appeal by a method that records the date."),
  ];
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//insurance-denial-appeal-builder//EN", "CALSCALE:GREGORIAN", ...events, "END:VCALENDAR"].map(icsFold).join("\r\n") + "\r\n";
}

export function sampleDenial() {
  return `Acme Health Plan — Notice of Adverse Benefit Determination
Date of notice: 2026-09-14
Member ID: ZXC123456789
Claim number: 20260811-0049213
Provider: Lakeside Imaging Center   Service date: 2026-08-11   Service: MRI lumbar spine without contrast (CPT 72148)
Billed $2,480.00   Plan paid $0.00   Reason code: CO-50

We have denied this claim because the service was not medically necessary under our clinical criteria
for low back imaging. Your plan allows you to appeal this decision within 180 days of receiving this
notice. You may request the criteria used and copies of documents relevant to your claim.`;
}
