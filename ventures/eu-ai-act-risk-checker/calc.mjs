// EU AI Act (Regulation (EU) 2024/1689) first-read risk classifier for one AI system.
// Pure functions, no I/O. Bad input is rejected with a message, never clamped.
// Encodes Article 2 (scope), Article 5 (prohibited practices), Article 6 and Annex III (high-risk uses),
// Article 50 (transparency) and Articles 51-55 (general-purpose models). It does not apply the Commission's
// guidelines, harmonised standards or any pending amendment; the legal text and a lawyer decide.

// tier: prohibited | high | transparency | minimal. `ref` is the Article or Annex point the call rests on.
// `art6_3` marks Annex III uses where Article 6(3) lets a provider show the system is not high-risk.
export const USES = [
  { id: "", label: "Choose what the system does", tier: null },
  // Article 5 prohibited practices
  { id: "p-manipulation", label: "Prohibited: subliminal or deliberately manipulative techniques that distort behaviour and cause significant harm", tier: "prohibited", ref: "Art 5(1)(a)" },
  { id: "p-vulnerable", label: "Prohibited: exploiting vulnerabilities of age, disability or social or economic situation", tier: "prohibited", ref: "Art 5(1)(b)" },
  { id: "p-social-score", label: "Prohibited: social scoring of people leading to unjustified or unrelated detrimental treatment", tier: "prohibited", ref: "Art 5(1)(c)" },
  { id: "p-crime-profile", label: "Prohibited: predicting that a person will commit a crime based only on profiling or personality traits", tier: "prohibited", ref: "Art 5(1)(d)" },
  { id: "p-face-scrape", label: "Prohibited: building face recognition databases by untargeted scraping of the internet or CCTV", tier: "prohibited", ref: "Art 5(1)(e)" },
  { id: "p-emotion-work", label: "Prohibited: inferring emotions of people in the workplace or in education (except for medical or safety reasons)", tier: "prohibited", ref: "Art 5(1)(f)" },
  { id: "p-biometric-cat", label: "Prohibited: biometric categorisation that infers race, politics, union membership, religion, sex life or sexual orientation", tier: "prohibited", ref: "Art 5(1)(g)" },
  { id: "p-rbi-law", label: "Prohibited in principle: real-time remote biometric identification in public spaces for law enforcement (narrow exceptions)", tier: "prohibited", ref: "Art 5(1)(h)" },
  // Annex III high-risk uses
  { id: "h-bio-id", label: "Biometrics: remote biometric identification (not mere one-to-one verification)", tier: "high", ref: "Annex III point 1(a)" },
  { id: "h-bio-cat", label: "Biometrics: categorisation by sensitive or protected attributes", tier: "high", ref: "Annex III point 1(b)" },
  { id: "h-bio-emotion", label: "Biometrics: emotion recognition (outside the workplace and education ban)", tier: "high", ref: "Annex III point 1(c)" },
  { id: "h-infra", label: "Critical infrastructure: safety component of digital infrastructure, road traffic, water, gas, heating or electricity supply", tier: "high", ref: "Annex III point 2", art6_3: true },
  { id: "h-edu-admit", label: "Education: deciding admission, access or assignment to institutions", tier: "high", ref: "Annex III point 3(a)", art6_3: true },
  { id: "h-edu-grade", label: "Education: evaluating learning outcomes or steering the learning process", tier: "high", ref: "Annex III point 3(b)", art6_3: true },
  { id: "h-edu-level", label: "Education: assessing the level of education a person will receive or can access", tier: "high", ref: "Annex III point 3(c)", art6_3: true },
  { id: "h-edu-proctor", label: "Education: monitoring and detecting cheating in tests", tier: "high", ref: "Annex III point 3(d)", art6_3: true },
  { id: "h-hr-recruit", label: "Employment: recruitment, targeted job ads, screening or ranking candidates", tier: "high", ref: "Annex III point 4(a)", art6_3: true },
  { id: "h-hr-manage", label: "Employment: decisions on promotion, termination, task allocation, or monitoring and evaluating performance", tier: "high", ref: "Annex III point 4(b)", art6_3: true },
  { id: "h-benefits", label: "Essential services: eligibility for public benefits, healthcare or their withdrawal", tier: "high", ref: "Annex III point 5(a)", art6_3: true },
  { id: "h-credit", label: "Essential services: credit scoring or creditworthiness of natural persons (not fraud detection)", tier: "high", ref: "Annex III point 5(b)", art6_3: true },
  { id: "h-insurance", label: "Essential services: risk assessment and pricing for life or health insurance for natural persons", tier: "high", ref: "Annex III point 5(c)", art6_3: true },
  { id: "h-emergency", label: "Essential services: triage or dispatch of emergency calls, first response or patient triage", tier: "high", ref: "Annex III point 5(d)", art6_3: true },
  { id: "h-law", label: "Law enforcement: risk assessment of victims or offenders, polygraph-like tools, evidence reliability, profiling in investigations", tier: "high", ref: "Annex III point 6", art6_3: true },
  { id: "h-migration", label: "Migration and border control: risk assessment, document checks, asylum, visa and residence applications", tier: "high", ref: "Annex III point 7", art6_3: true },
  { id: "h-justice", label: "Justice and democracy: assisting a court in researching or applying law, or influencing elections or voting behaviour", tier: "high", ref: "Annex III point 8", art6_3: true },
  // Article 50 transparency
  { id: "t-chatbot", label: "Chatbot or assistant that talks directly to people", tier: "transparency", ref: "Art 50(1)" },
  { id: "t-generate", label: "Generator of synthetic text, image, audio or video", tier: "transparency", ref: "Art 50(2)" },
  { id: "t-deepfake", label: "Tool that creates or edits deepfakes or text published to inform the public", tier: "transparency", ref: "Art 50(4)" },
  // minimal
  { id: "m-other", label: "Something else: spam filter, recommendations, internal analytics, game AI, code assistant, forecasting", tier: "minimal", ref: "Art 95 (voluntary codes)" },
];

export const ROLES = [
  { id: "", label: "Choose your role" },
  { id: "provider", label: "Provider: you develop it, or have it developed, and put it on the market or into service under your name" },
  { id: "deployer", label: "Deployer: you use someone else's AI system in a professional setting" },
  { id: "importer", label: "Importer: you bring a system from a non-EU provider onto the EU market" },
  { id: "distributor", label: "Distributor: you make a system available on the EU market without changing it" },
];

export const GPAI = [
  { id: "", label: "No, I do not provide a general-purpose AI model" },
  { id: "gpai", label: "Yes, I provide a general-purpose AI model" },
  { id: "gpai-systemic", label: "Yes, and training used more than 10^25 FLOPs or the Commission designated it systemic-risk" },
];

export const EXCLUSIVE = [
  { id: "", label: "None of these: it is used professionally or commercially" },
  { id: "military", label: "Used exclusively for military, defence or national security" },
  { id: "research", label: "Used exclusively for scientific research and development, not placed on the market" },
  { id: "personal", label: "Used by a person for purely personal, non-professional activity" },
];

export const TIER_LABEL = { prohibited: "Prohibited", high: "High-risk", transparency: "Limited risk (transparency duties)", minimal: "Minimal risk" };

const FINE = {
  prohibited: "Up to EUR 35 million or 7% of worldwide annual turnover, whichever is higher (Art 99(3)). For SMEs, whichever is lower (Art 99(6)).",
  other: "Up to EUR 15 million or 3% of worldwide annual turnover, whichever is higher, for breaching most other obligations (Art 99(4)). For SMEs, whichever is lower (Art 99(6)).",
};

export const DATES = [
  { date: "2025-02-02", what: "Prohibited practices (Art 5) and AI literacy (Art 4) apply", ref: "Art 113(a)" },
  { date: "2025-08-02", what: "Obligations for general-purpose AI models and the penalty regime apply (models already on the market before this date have until 2027-08-02)", ref: "Art 113(b), Art 111(3)" },
  { date: "2026-08-02", what: "Most remaining rules apply, including Annex III high-risk systems and Article 50 transparency, under the Regulation as adopted", ref: "Art 113" },
  { date: "2027-08-02", what: "High-risk rules for AI that is a safety component of products under Annex I harmonisation law (medical devices, machinery, toys, vehicles and similar)", ref: "Art 113(c)" },
];

export const OMNIBUS_NOTE = "The Commission proposed in November 2025 (Digital Omnibus) to postpone the high-risk rules. If that has been adopted by the time you read this, the dates above for high-risk systems move. Check the current text.";

export function parse(input) {
  const errors = [];
  const use = USES.find((u) => u.id === (input.use || ""));
  const role = ROLES.find((r) => r.id === (input.role || ""));
  const gpai = GPAI.find((g) => g.id === (input.gpai || ""));
  const exclusive = EXCLUSIVE.find((e) => e.id === (input.exclusive || ""));
  const eu = input.eu || "yes";
  if (!["yes", "no", "unsure"].includes(eu)) errors.push("Choose yes, no or not sure for the EU question.");
  if (!role || !role.id) errors.push("Choose your role.");
  if (!gpai) errors.push("Choose an option for the general-purpose model question.");
  if (!exclusive) errors.push("Choose an exclusion option.");
  if ((!use || !use.id) && !(gpai && gpai.id)) errors.push("Choose what the system does, or say that you provide a general-purpose model.");
  return {
    errors,
    use: use && use.id ? use : null,
    role,
    gpai,
    exclusive,
    eu,
    profiling: !!input.profiling,
    narrow: !!input.narrow,
    annexI: !!input.annexI,
  };
}

// Decide the tier for the system. Returns { status, tier, via, reason, art63 }.
export function classify({ use, exclusive, eu, profiling, narrow, annexI }) {
  if (exclusive && exclusive.id) {
    const via = { military: "Art 2(3)", research: "Art 2(6)", personal: "Art 2(10)" }[exclusive.id];
    return { status: "out", tier: null, via, reason: "The Regulation does not apply to this use. If the system is later used for anything else, the exclusion ends." };
  }
  if (eu === "no") {
    return { status: "out", tier: null, via: "Art 2(1)", reason: "The Regulation reaches providers placing systems on the EU market and providers or deployers outside the EU whose output is used in the EU. If neither is true, it does not apply." };
  }
  if (!use) return { status: "none", tier: null, via: "", reason: "No AI system use selected." };
  if (use.tier === "prohibited") {
    return { status: "in", tier: "prohibited", via: use.ref, reason: "This practice is banned. It cannot be put on the market, put into service or used in the EU." };
  }
  if (annexI) {
    return { status: "in", tier: "high", via: "Art 6(1), Annex I", reason: "An AI system that is a safety component of a product under Annex I law, or is itself such a product, that needs third-party conformity assessment is high-risk. Product-law deadlines apply (2027-08-02)." };
  }
  if (use.tier === "high") {
    if (use.art6_3 && !profiling && narrow) {
      return { status: "in", tier: "high-exempt", via: "Art 6(3)", reason: "An Annex III system that only does a narrow procedural task, improves a human's earlier work, detects patterns without replacing the human assessment, or does a preparatory task, and does not profile people, may be treated as not high-risk. The provider must document that assessment before putting it on the market (Art 6(4)) and register it (Art 49(2)). Authorities can challenge it." };
    }
    return { status: "in", tier: "high", via: use.ref, reason: use.art6_3 && profiling ? "Annex III systems that profile natural persons are always high-risk; the Article 6(3) exception does not apply." : "This use is listed in Annex III, so the system is high-risk unless the provider can show the Article 6(3) conditions." };
  }
  return { status: "in", tier: use.tier, via: use.ref, reason: use.tier === "transparency" ? "Systems that interact with people or generate content must tell people so." : "Nothing in the Regulation binds this use beyond AI literacy (Art 4), though voluntary codes of conduct are encouraged." };
}

// The duty set for a tier and role. Each duty names its Article.
function duty(item, ref, due, who) { return { duty: item, ref, due, who }; }

export function dutiesFor(tier, role, gpaiId, rawUse) {
  const d = [];
  const rid = role && role.id;
  const prov = rid === "provider";
  const dep = rid === "deployer";
  if (tier === "prohibited") {
    d.push(duty("Do not place the system on the market, put it into service or use it in the EU.", "Art 5", "2025-02-02", "all"));
    return d;
  }
  if (tier === "high") {
    if (prov) {
      d.push(
        duty("Run a documented risk management system across the lifecycle.", "Art 9", "2026-08-02", "provider"),
        duty("Govern training, validation and test data: relevance, representativeness, bias examination.", "Art 10", "2026-08-02", "provider"),
        duty("Draw up technical documentation before placing on the market, and keep it current.", "Art 11, Annex IV", "2026-08-02", "provider"),
        duty("Design the system to log events automatically; keep logs under your control for at least six months.", "Art 12, Art 19", "2026-08-02", "provider"),
        duty("Give deployers instructions for use with the system's capabilities, limits and accuracy.", "Art 13", "2026-08-02", "provider"),
        duty("Design for effective human oversight.", "Art 14", "2026-08-02", "provider"),
        duty("Reach appropriate accuracy, robustness and cybersecurity.", "Art 15", "2026-08-02", "provider"),
        duty("Operate a quality management system.", "Art 17", "2026-08-02", "provider"),
        duty("Complete the conformity assessment, sign the EU declaration of conformity and affix CE marking.", "Art 43, Art 47, Art 48", "2026-08-02", "provider"),
        duty("Register the system in the EU database before placing it on the market.", "Art 49, Art 71", "2026-08-02", "provider"),
        duty("Monitor the system after it is on the market, and report serious incidents to the market surveillance authority.", "Art 72, Art 73", "2026-08-02", "provider"),
      );
    }
    if (dep) {
      d.push(
        duty("Use the system according to the provider's instructions, with competent human oversight.", "Art 26(1)-(2)", "2026-08-02", "deployer"),
        duty("Make sure input data you control is relevant and representative for the purpose.", "Art 26(4)", "2026-08-02", "deployer"),
        duty("Monitor operation, and report risks and serious incidents to the provider and authority.", "Art 26(5)", "2026-08-02", "deployer"),
        duty("Keep the logs the system generates for at least six months.", "Art 26(6)", "2026-08-02", "deployer"),
        duty("Tell workers and their representatives before using a high-risk system at work.", "Art 26(7)", "2026-08-02", "deployer"),
        duty("Tell people that a high-risk system is being used to make or help decisions about them; they can ask for an explanation.", "Art 26(11), Art 86", "2026-08-02", "deployer"),
        duty("Public bodies, and private deployers for credit scoring and life or health insurance pricing, must do a fundamental rights impact assessment before first use.", "Art 27", "2026-08-02", "deployer"),
      );
    }
    if (rid === "importer") d.push(duty("Verify before placing on the market that the provider did the conformity assessment, documentation, CE marking and has an EU representative; put your name and address on the system.", "Art 23", "2026-08-02", "importer"));
    if (rid === "distributor") d.push(duty("Verify the CE marking, the declaration of conformity and the instructions are present before making the system available; do not supply a non-compliant one.", "Art 24", "2026-08-02", "distributor"));
  }
  if (tier === "high-exempt") {
    d.push(
      duty("Document the assessment that the system is not high-risk before placing it on the market, and give it to authorities on request.", "Art 6(4)", "2026-08-02", "provider"),
      duty("Register the system in the EU database even though it is treated as not high-risk.", "Art 49(2)", "2026-08-02", "provider"),
    );
  }
  if (tier === "transparency") {
    const id = rawUse && rawUse.id;
    if (id === "t-chatbot") {
      if (prov) d.push(duty("Design the system so people know they are interacting with AI, unless that is obvious.", "Art 50(1)", "2026-08-02", "provider"));
      if (dep) d.push(duty("Check the provider's system tells people they are talking to AI; if you add your own interface, make sure the notice survives.", "Art 50(1)", "2026-08-02", "deployer"));
    }
    if (id === "t-generate") {
      if (prov) d.push(duty("Mark synthetic audio, image, video and text output in a machine-readable format so it is detectable as AI-generated.", "Art 50(2)", "2026-08-02", "provider"));
      if (dep) d.push(duty("Do not strip or hide the provider's machine-readable marking.", "Art 50(2)", "2026-08-02", "deployer"));
    }
    if (id === "t-deepfake" && dep) d.push(duty("Disclose that deepfake content is artificially generated or manipulated; for AI text published to inform the public, disclose it unless a human editor took responsibility.", "Art 50(4)", "2026-08-02", "deployer"));
    if (id === "t-deepfake" && prov) d.push(duty("Mark outputs in a machine-readable way and support deployers' disclosure of deepfakes.", "Art 50(2), Art 50(4)", "2026-08-02", "provider"));
  }
  if (tier && tier !== "out") {
    if (prov || dep) d.push(duty("Make sure staff who run or use the system have a sufficient level of AI literacy.", "Art 4", "2025-02-02", "provider, deployer"));
  }
  if (gpaiId) {
    d.push(
      duty("Keep technical documentation of the model and its training and testing.", "Art 53(1)(a), Annex XI", "2025-08-02", "GPAI provider"),
      duty("Give downstream providers the information they need to comply.", "Art 53(1)(b), Annex XII", "2025-08-02", "GPAI provider"),
      duty("Put in place a policy to respect EU copyright law, including text and data mining opt-outs.", "Art 53(1)(c)", "2025-08-02", "GPAI provider"),
      duty("Publish a sufficiently detailed summary of the training content using the Commission's template.", "Art 53(1)(d)", "2025-08-02", "GPAI provider"),
    );
    if (gpaiId === "gpai-systemic") {
      d.push(
        duty("Notify the Commission within two weeks of meeting the systemic-risk threshold.", "Art 52", "2025-08-02", "GPAI provider"),
        duty("Evaluate the model, including adversarial testing, and assess and mitigate systemic risks.", "Art 55(1)(a)-(b)", "2025-08-02", "GPAI provider"),
        duty("Report serious incidents and ensure adequate cybersecurity protection.", "Art 55(1)(c)-(d)", "2025-08-02", "GPAI provider"),
      );
    }
  }
  return d;
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const verdict = p.use
    ? classify(p)
    : p.exclusive.id || p.eu === "no"
      ? classify({ ...p, use: null })
      : { status: "in", tier: "gpai-only", via: "Art 51-55", reason: "You only provide a general-purpose AI model. Its obligations are in Articles 53 to 55; the systems built on it are classified separately." };
  const inScope = verdict.status === "in";
  const dutyTier = verdict.tier === "gpai-only" ? null : verdict.tier;
  const duties = inScope ? dutiesFor(dutyTier, p.role, p.gpai.id, p.use) : [];
  const ladder = ["prohibited", "high", "transparency", "minimal"].map((t) => ({ tier: t, label: TIER_LABEL[t], rule: TIER_RULE[t] }));
  const findings = [];
  if (!inScope) findings.push({ severity: "info", title: `Outside the Regulation on these answers (${verdict.via}). ${verdict.reason}` });
  if (verdict.tier === "prohibited") {
    findings.push({ severity: "high", title: `Prohibited practice (${verdict.via}). ${FINE.prohibited}` });
    findings.push({ severity: "medium", title: "Check the narrow carve-outs in Article 5 and the Commission's guidelines on prohibited practices before concluding anything either way." });
  }
  if (verdict.tier === "high") {
    findings.push({ severity: "high", title: `High-risk AI system (${verdict.via}). ${FINE.other}` });
    findings.push({ severity: "medium", title: "High-risk systems that change substantially after placing on the market need a new conformity assessment, and a deployer that modifies the purpose or puts its own name on the system becomes a provider (Art 25)." });
  }
  if (verdict.tier === "high-exempt") findings.push({ severity: "medium", title: "Treated as not high-risk only if the provider's documented assessment holds. Profiling of natural persons always defeats the exception." });
  if (verdict.tier === "transparency") findings.push({ severity: "medium", title: `Transparency duties (${verdict.via}). ${FINE.other}` });
  if (verdict.tier === "minimal") findings.push({ severity: "info", title: "No obligations under the Regulation for this use beyond AI literacy. National or sector law, GDPR and consumer law still apply." });
  if (p.eu === "unsure") findings.push({ severity: "medium", title: "You answered unsure on the EU link. Settle that first: if the system or its output reaches people in the EU, the Regulation applies to you wherever you are based (Art 2(1))." });
  if (p.gpai.id) findings.push({ severity: "medium", title: "General-purpose model duties apply to the model provider, separately from how any system built on it is classified." });
  if (p.role.id === "deployer" && inScope && p.use && p.use.tier !== "prohibited") findings.push({ severity: "info", title: "As a deployer you rely on your provider for conformity. Ask for the declaration of conformity and instructions for use, and check that you are not changing the intended purpose (Art 25)." });
  findings.push({ severity: "info", title: `Dates assume the Regulation as adopted. ${OMNIBUS_NOTE}` });
  return { errors: [], verdict, tierLabel: verdict.tier ? (TIER_LABEL[verdict.tier] || (verdict.tier === "high-exempt" ? "High-risk use, Article 6(3) exception claimed" : "General-purpose model provider")) : "Outside the Regulation", role: p.role, use: p.use, gpai: p.gpai, duties, ladder, findings, dates: DATES, input: { eu: p.eu, profiling: p.profiling, narrow: p.narrow, annexI: p.annexI } };
}

const TIER_RULE = {
  prohibited: "Banned outright (Art 5)",
  high: "Allowed after conformity assessment, documentation, oversight, registration (Chapter III)",
  transparency: "Allowed with disclosure and marking duties (Art 50)",
  minimal: "Allowed; voluntary codes (Art 95)",
};

export const SAMPLE = { role: "provider", use: "h-hr-recruit", gpai: "", exclusive: "", eu: "yes", profiling: "1", narrow: "", annexI: "" };

export function summaryText(r) {
  const lines = [
    "EU AI Act risk check (first read, not legal advice)",
    `System: ${r.use ? r.use.label : "General-purpose model provider"}`,
    `Your role: ${r.role.label.split(":")[0]}`,
    `Result: ${r.tierLabel}${r.verdict.via ? ` [${r.verdict.via}]` : ""}`,
    r.verdict.reason,
  ];
  if (r.duties.length) {
    lines.push("", "Your duties, with the Article and the date they apply:");
    for (const d of r.duties) lines.push(`  - ${d.duty} (${d.ref}; from ${d.due})`);
  }
  lines.push("", "Dates assume the Regulation as adopted; a proposed Digital Omnibus may postpone high-risk rules. Confirm with counsel.");
  return lines.join("\n");
}

const q = (c) => `"${String(c).replace(/"/g, '""')}"`;
export function checklistCsv(r) {
  return ["duty,article,applies_from,applies_to,owner,status,evidence", ...r.duties.map((d) => [d.duty, d.ref, d.due, d.who, "", "todo", ""].map(q).join(","))].join("\n");
}
