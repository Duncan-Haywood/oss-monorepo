// Lien waiver red-flag checker. Reads waiver text plus what the user knows about the payment and returns
// findings. It is a set of text rules, not a legal reading: each finding says what to ask the other side for.

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

export const WAIVER_TYPES = {
  "conditional-progress": "Conditional waiver on progress payment",
  "unconditional-progress": "Unconditional waiver on progress payment",
  "conditional-final": "Conditional waiver on final payment",
  "unconditional-final": "Unconditional waiver on final payment",
};

// States whose statutes are commonly cited as prescribing waiver form or wording. A pointer to go and check, not a list to rely on.
export const FORM_STATES = { CA: "California", TX: "Texas", FL: "Florida", GA: "Georgia", MI: "Michigan", NV: "Nevada", AZ: "Arizona", UT: "Utah" };

const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();
const iso = (y, m, d) => {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};

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

export function extractAmounts(text) {
  const out = [];
  for (const m of String(text).matchAll(/\$\s?(\d[\d,]*(?:\.\d{1,2})?)/g)) {
    const c = parseMoney(m[1]);
    if (c) out.push(c);
  }
  return out;
}

export function extractDates(text) {
  const out = [];
  const t = String(text);
  for (const m of t.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)) {
    const v = iso(+m[1], +m[2], +m[3]);
    if (v) out.push({ iso: v, index: m.index });
  }
  for (const m of t.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})\b/g)) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    const v = iso(y, +m[1], +m[2]);
    if (v) out.push({ iso: v, index: m.index });
  }
  for (const m of t.matchAll(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/g)) {
    const mo = MONTHS[m[1].toLowerCase().slice(0, 4)] || MONTHS[m[1].toLowerCase().slice(0, 3)];
    if (!mo) continue;
    const v = iso(+m[3], mo, +m[2]);
    if (v) out.push({ iso: v, index: m.index });
  }
  return out.sort((a, b) => a.index - b.index);
}

// The date the release runs "through": the first date within 60 characters after the word "through",
// otherwise none. Dates elsewhere (signing date, notary) are not the release period.
export function throughDate(text) {
  const t = String(text);
  const dates = extractDates(t);
  for (const m of t.matchAll(/\bthrough\b|\bthru\b|\bup to and including\b/gi)) {
    const d = dates.find((x) => x.index >= m.index && x.index - m.index <= 60);
    if (d) return d.iso;
  }
  return null;
}

export function detectType(text) {
  const t = String(text).toLowerCase();
  const uncond = /unconditional/.test(t);
  const cond = !uncond && /\bconditional\b/.test(t);
  const final = /\bfinal\b/.test(t);
  const progress = /\bprogress\b/.test(t);
  const kind = uncond ? "unconditional" : cond ? "conditional" : null;
  const stage = final && !progress ? "final" : progress && !final ? "progress" : null;
  return kind && stage ? `${kind}-${stage}` : null;
}

const f = (id, severity, title, why, ask) => ({ id, severity, title, why, ask });

export function analyze(rawText, settings = {}) {
  const text = norm(rawText);
  const low = text.toLowerCase();
  const errors = [];
  if (text.length < 40) return { errors: ["Paste the full waiver text first (at least a couple of sentences)."], findings: [], extracted: {} };

  const detected = detectType(text);
  const type = settings.type || detected;
  const unconditional = type ? type.startsWith("unconditional") : /unconditional/.test(low);
  const isFinal = type ? type.endsWith("final") : /\bfinal\b/.test(low);
  const expected = parseMoney(settings.expectedAmount);
  const retainage = parseMoney(settings.retainageHeld);
  const pending = parseMoney(settings.pendingClaims);
  if (expected === null) errors.push("The amount you expect is not a number.");
  if (retainage === null) errors.push("Retainage held is not a number.");
  if (pending === null) errors.push("Pending claims is not a number.");
  if (errors.length) return { errors, findings: [], extracted: {} };

  const amounts = extractAmounts(text);
  const through = throughDate(text);
  const allDates = extractDates(text);
  const findings = [];

  if (!type) {
    findings.push(f("type-unknown", "medium", "The waiver does not say which of the four kinds it is",
      "Conditional or unconditional, progress or final, decides when it takes effect and what it releases. A form that leaves it open can be read against you.",
      "Ask for a form that is titled and worded as one specific kind."));
  } else if (detected && detected !== type) {
    findings.push(f("type-mismatch", "medium", `You picked "${WAIVER_TYPES[type]}" but the text reads as "${WAIVER_TYPES[detected]}"`,
      "The title and the operative words disagree, and the operative words are what a court reads.", "Fix the title or the body so they say the same thing."));
  }

  const pay = settings.payment || "";
  if (unconditional && pay !== "cleared") {
    findings.push(f("unconditional-before-funds", "high",
      pay === "check" ? "Unconditional waiver, but the check has not cleared" : "Unconditional waiver, but you have not been paid",
      "An unconditional waiver takes effect when it is signed, whatever happens to the payment afterward. A check can bounce, and the right to lien for that money is gone.",
      "Sign a conditional waiver now, and the unconditional one only after the funds have cleared your bank."));
  }
  if (!unconditional && type) {
    const condSentence = /(conditioned|conditional|contingent)[^.]{0,200}(receipt|received|payment)|upon\s+(actual\s+)?(receipt|payment)|when\s+(the\s+)?(payment|check)/.test(low);
    const strong = /(actually received|good funds|cleared|honou?red|collected|paid in full|paid by the bank|has been paid|been paid by)/.test(low);
    if (condSentence && !strong) {
      findings.push(f("weak-condition", "medium", "The condition says \"receipt\" but not that the funds clear",
        "Receipt of a check can be argued to satisfy the condition even if the check later fails.",
        "Ask for wording that the waiver takes effect only when the payment has been received and honored by the bank."));
    }
  }

  const broad = /\b(any and all|all)\s+(claims|demands|causes of action|damages|rights)\b/.test(low) || /(of any (kind|nature)|whatsoever)/.test(low);
  const limited = /(labor|services?|equipment|materials?)[^.]{0,120}(furnished|provided|performed|supplied)[^.]{0,120}through/.test(low);
  if (broad && !isFinal) {
    findings.push(f("broad-release", limited ? "medium" : "high",
      limited ? "Broad release wording, partly limited by a through-date" : "A progress waiver that releases \"all claims\"",
      "A progress waiver should release lien rights for the work and materials paid for through a date, nothing wider. Wording about all claims, damages or rights of any kind can be read to release delay, extra-work and other claims the payment does not cover.",
      "Ask for it to be limited to lien and payment-bond rights for labor, services, equipment or material furnished through the stated date and paid by this payment."));
  } else if (broad && isFinal) {
    findings.push(f("broad-release-final", "medium", "A final waiver with broad release wording",
      "At final payment a broad release is common, but it is also where disputed change orders and backcharges are extinguished.",
      "Make sure disputed or pending items are listed as exceptions before you sign."));
  }

  const future = /(future|hereafter|subsequent|to be (furnished|performed|provided|supplied)|through (the )?(completion|end of the|final completion)|\band all (work|labor|materials) (to|that))/.test(low);
  if (future && !isFinal) {
    findings.push(f("future-work", "high", "Releases work that has not been done or billed yet",
      "A progress waiver that reaches future work gives up your lien rights on money you have not earned and cannot yet be paid.",
      "Ask that the release stop at the through-date and exclude all work after it."));
  }

  if (!isFinal) {
    if (!through) {
      findings.push(f("no-through-date", "high", "No \"through\" date",
        "Without a date the release has no end, and it can be read as covering everything on the job.",
        "Ask for the date the release runs through, matching the end of the billing period you are being paid for."));
    } else if (settings.throughDate && through > settings.throughDate) {
      findings.push(f("through-after-billing", "high", `Through-date ${through} is after your billing period ends ${settings.throughDate}`,
        "The release reaches work past what this payment covers.", `Ask for the through-date to be ${settings.throughDate} or earlier.`));
    } else if (settings.throughDate && through < settings.throughDate) {
      findings.push(f("through-before-billing", "info", `Through-date ${through} is earlier than your billing period end ${settings.throughDate}`,
        "That is the safe direction for you, but it means the payment is for less than you billed or the form is stale.", "Check it is the right form for this application."));
    }
  }

  if (expected) {
    if (!amounts.length) {
      findings.push(f("no-amount", isFinal || !unconditional ? "medium" : "high", "No dollar amount in the waiver",
        "A waiver with a blank amount does not tie the release to a payment, so the release is open to a wider reading.",
        `Ask for the amount to be filled in: ${dollars(expected)}.`));
    } else if (!amounts.includes(expected)) {
      const above = amounts.some((a) => a > expected);
      findings.push(f("amount-mismatch", "high", `No amount in the waiver matches the ${dollars(expected)} you expect`,
        above ? `The waiver names ${amounts.map(dollars).join(", ")}; a larger figure than the payment releases more than you are being paid for.`
          : `The waiver names ${amounts.map(dollars).join(", ")}, which is less than you expect, so the payment or the form is wrong.`,
        `Ask for the amount to be corrected to ${dollars(expected)} before signing.`));
    }
  } else if (!amounts.length && !isFinal) {
    findings.push(f("no-amount", "medium", "No dollar amount in the waiver", "A progress waiver should name the payment it is given for.", "Ask for the amount to be filled in."));
  }

  if (retainage > 0 && !isFinal) {
    const excepted = /(except|excluding|excluded|exception|reserv)[^.]{0,120}(retain|retention)/.test(low) || /(retain|retention)[^.]{0,80}(not (included|released|waived)|excluded|reserved)/.test(low) || /not (cover|include|release|waive)[^.]{0,60}(retain|retention)/.test(low);
    if (!excepted) {
      findings.push(f("retainage-not-excepted", "medium", `No exception for the ${dollars(retainage)} of retainage held`,
        "Without an exception, a release for all work through the date can be read as including the retainage still owed to you.",
        "Ask for a line saying retainage and any unpaid amounts are excepted from the release."));
    }
  }
  if (pending > 0) {
    const excepted = /(except|excluding|excluded|exception|reserv|disputed|pending)/.test(low);
    if (!excepted) {
      findings.push(f("pending-claims", "high", `No exceptions listed, but you have ${dollars(pending)} in pending or disputed items`,
        "A release without exceptions can wipe out change orders and claims that are still being negotiated.",
        "List each pending change order and claim by number and amount as an exception, or hold the waiver until they are settled."));
    }
  }

  if (/(indemnif|hold harmless)/.test(low)) {
    findings.push(f("indemnity", "high", "Indemnity or hold-harmless language inside a lien waiver",
      "A lien waiver gives up lien rights. A promise to indemnify someone is a different and open-ended obligation.", "Strike it, or take it to whoever reviews your contracts."));
  }
  if (/(release|waive)[^.]{0,120}(payment bond|bond claim|surety)/.test(low)) {
    findings.push(f("bond-release", "medium", "The waiver also releases payment-bond rights",
      "A bond can be your backstop if the owner or general contractor fails. Releasing it along with the lien ties the release to the payment more tightly.",
      "Confirm that is intended and that the payment actually covers what is being released."));
  }
  if (/(waive|waiver)[^.]{0,80}(jury|arbitration|attorney'?s? fees)/.test(low) || /(attorney'?s? fees)[^.]{0,80}(waive|waiver)/.test(low)) {
    findings.push(f("other-rights", "medium", "Waives something other than lien rights (jury, arbitration or fees)",
      "These are not lien rights and have nothing to do with being paid for the work.", "Ask for them to be removed."));
  }

  if (settings.claimant && !low.includes(settings.claimant.trim().toLowerCase())) {
    findings.push(f("claimant-missing", "medium", `Your company name "${settings.claimant.trim()}" is not in the waiver`, "The waiver should name exactly who is releasing.", "Ask for your legal name to be shown as the claimant."));
  }
  if (settings.project && !low.includes(settings.project.trim().toLowerCase())) {
    findings.push(f("project-missing", "medium", `The project "${settings.project.trim()}" is not named in the waiver`, "A waiver should identify the job or property it releases.", "Ask for the project and property to be identified."));
  }
  if (settings.state && FORM_STATES[settings.state]) {
    findings.push(f("statutory-form", "info", `${FORM_STATES[settings.state]} is a state that is commonly cited as prescribing waiver wording`,
      "Where a statute prescribes the form, a waiver that does not follow it can be unenforceable, which can cut either way for you.",
      "Check the current statute or ask your attorney whether this state's statutory form should be used instead."));
  }

  const order = { high: 0, medium: 1, info: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  const high = findings.filter((x) => x.severity === "high").length;
  const medium = findings.filter((x) => x.severity === "medium").length;
  const verdict = high ? "do-not-sign" : medium ? "ask-for-changes" : "no-red-flags";
  return { errors: [], findings, verdict, extracted: { type, detected, amounts, through, dates: allDates.map((d) => d.iso), expected, retainage, pending } };
}

export const VERDICT_TEXT = {
  "do-not-sign": "Do not sign as written",
  "ask-for-changes": "Ask for changes before signing",
  "no-red-flags": "No red flags found by these rules",
};

export function summaryText(r, s = {}) {
  const x = r.extracted;
  const lines = [];
  lines.push("LIEN WAIVER CHECK");
  if (s.project) lines.push(`Project: ${s.project}`);
  if (s.claimant) lines.push(`Claimant: ${s.claimant}`);
  lines.push(`Kind: ${x.type ? WAIVER_TYPES[x.type] : "not clear from the text"}`);
  lines.push(`Through-date in the text: ${x.through || "none found"}`);
  lines.push(`Amounts in the text: ${x.amounts.length ? x.amounts.map(dollars).join(", ") : "none found"}`);
  if (x.expected) lines.push(`Amount you expect: ${dollars(x.expected)}`);
  lines.push("", `RESULT: ${VERDICT_TEXT[r.verdict]}`, "");
  if (!r.findings.length) lines.push("Nothing flagged. These rules read text only; they cannot tell you the form is enforceable in your state.");
  for (const [i, g] of r.findings.entries()) {
    lines.push(`${i + 1}. [${g.severity.toUpperCase()}] ${g.title}`, `   Why: ${g.why}`, `   Ask for: ${g.ask}`, "");
  }
  lines.push("A worksheet from a text checker, not legal advice. Have an attorney review anything that matters.");
  return lines.join("\n");
}

export function findingsCsv(r) {
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  return ["severity,finding,why,ask_for", ...r.findings.map((g) => [g.severity, g.title, g.why, g.ask].map(q).join(","))].join("\n");
}

export function sampleWaiver() {
  return `UNCONDITIONAL WAIVER AND RELEASE ON PROGRESS PAYMENT

The undersigned, Ridgeline Framing LLC, for good and valuable consideration, waives and releases any and all claims, demands, liens and rights of any kind against the owner, the general contractor and the property known as Maple Street Remodel arising out of labor, services, equipment or materials furnished to date and hereafter on the project. The undersigned also releases the payment bond and agrees to indemnify and hold harmless the owner against claims by its subcontractors.

Amount of payment: $48,500.00
Signed: 10/01/2026`;
}

export const SAMPLE_SETTINGS = {
  type: "", expectedAmount: "52000", payment: "check", throughDate: "2026-09-30", retainageHeld: "5500", pendingClaims: "7200",
  claimant: "Ridgeline Framing LLC", project: "Maple Street Remodel", state: "",
};
