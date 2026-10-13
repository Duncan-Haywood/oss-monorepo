// EU AI Act (Regulation (EU) 2024/1689) first-read classifier: scope, risk tier, role duties, dates.
// Pure functions, no I/O. Bad input is rejected with a message, never clamped.
// Encodes Articles 2, 4, 5, 6, 16, 23-27, 50-55 and 99-101 and the Annex III headings as the Regulation
// words them. It does not read your system: you tick what it does, and the result is only as good as that.
// Dates are the ones in Article 113 as adopted; a postponement of the high-risk dates has been proposed
// (the Digital Omnibus), so the page tells the reader to confirm the current dates.

export const ROLES = [
  { id: "provider", label: "Provider: I develop an AI system or model, or have one developed, and put it on the market under my name" },
  { id: "deployer", label: "Deployer: I use someone else's AI system in a professional setting" },
  { id: "both", label: "Both: I build an AI system and use it myself" },
  { id: "importer", label: "Importer: I bring a non-EU provider's AI system onto the EU market" },
  { id: "distributor", label: "Distributor: I make an AI system available in the EU without changing it" },
];

export const EXCLUSIONS = [
  { id: "military", label: "Used exclusively for military, defence or national security purposes", article: "Art 2(3)" },
  { id: "research", label: "Developed and used solely for scientific research and development", article: "Art 2(6)" },
  { id: "prerelease", label: "Still in research, testing or development and not yet placed on the market or put into service (testing in real-world conditions is not covered by this)", article: "Art 2(8)" },
  { id: "personal", label: "Used by a natural person for purely personal, non-professional purposes", article: "Art 2(10)" },
];

export const PROHIBITED = [
  { id: "manipulate", label: "Subliminal, purposefully manipulative or deceptive techniques that materially distort behaviour and cause significant harm", article: "Art 5(1)(a)" },
  { id: "vulnerable", label: "Exploiting vulnerabilities of age, disability or social or economic situation to distort behaviour and cause significant harm", article: "Art 5(1)(b)" },
  { id: "socialscore", label: "Social scoring of people that leads to unjustified or disproportionate detrimental treatment", article: "Art 5(1)(c)" },
  { id: "crimepredict", label: "Predicting that a person will commit a crime based only on profiling or personality traits", article: "Art 5(1)(d)" },
  { id: "facescrape", label: "Building face recognition databases by untargeted scraping of images from the internet or CCTV", article: "Art 5(1)(e)" },
  { id: "emotionwork", label: "Inferring emotions of people at work or in education (other than for medical or safety reasons)", article: "Art 5(1)(f)" },
  { id: "biocat", label: "Biometric categorisation that infers race, political opinions, trade union membership, religion, sex life or sexual orientation", article: "Art 5(1)(g)" },
  { id: "rbi", label: "Real-time remote biometric identification in public spaces for law enforcement (narrow exceptions only)", article: "Art 5(1)(h)" },
];

export const ANNEX_III = [
  { id: "bioid", area: "Biometrics", label: "Remote biometric identification of people (not one-to-one verification)", article: "Annex III 1(a)" },
  { id: "biocat2", area: "Biometrics", label: "Biometric categorisation by sensitive or protected attributes", article: "Annex III 1(b)" },
  { id: "bioemotion", area: "Biometrics", label: "Emotion recognition", article: "Annex III 1(c)" },
  { id: "infra", area: "Critical infrastructure", label: "Safety component in the management of critical digital infrastructure, road traffic, or water, gas, heating or electricity supply", article: "Annex III 2" },
  { id: "eduaccess", area: "Education", label: "Deciding admission, access or placement in education or training", article: "Annex III 3(a)" },
  { id: "eduevaluate", area: "Education", label: "Evaluating learning outcomes, including when the result steers the learning process", article: "Annex III 3(b)" },
  { id: "edulevel", area: "Education", label: "Assessing the appropriate level of education a person will receive", article: "Annex III 3(c)" },
  { id: "educheat", area: "Education", label: "Monitoring or detecting prohibited behaviour of students during tests", article: "Annex III 3(d)" },
  { id: "emprecruit", area: "Employment", label: "Recruitment: targeting job ads, filtering or ranking applications, evaluating candidates", article: "Annex III 4(a)" },
  { id: "empmanage", area: "Employment", label: "Decisions on promotion, termination, task allocation, or monitoring and evaluating workers' performance or behaviour", article: "Annex III 4(b)" },
  { id: "svcbenefit", area: "Essential services", label: "Assessing eligibility for public benefits or services, or granting, reducing or revoking them", article: "Annex III 5(a)" },
  { id: "svccredit", area: "Essential services", label: "Evaluating creditworthiness or credit score of people (other than fraud detection)", article: "Annex III 5(b)" },
  { id: "svcinsurance", area: "Essential services", label: "Risk assessment and pricing for life and health insurance", article: "Annex III 5(c)" },
  { id: "svcemergency", area: "Essential services", label: "Evaluating or dispatching emergency calls and emergency first response, or triaging patients", article: "Annex III 5(d)" },
  { id: "law", area: "Law enforcement", label: "Used by or for law enforcement: risk of becoming a victim, polygraphs, evidence reliability, reoffending risk, profiling in investigations", article: "Annex III 6" },
  { id: "migration", area: "Migration and border control", label: "Used by or for authorities on migration, asylum or border control: risk assessment, application examination, detecting or identifying people", article: "Annex III 7" },
  { id: "justice", area: "Justice and democracy", label: "Assisting a judicial authority in researching and interpreting facts and law, or in alternative dispute resolution", article: "Annex III 8(a)" },
  { id: "elections", area: "Justice and democracy", label: "Intended to influence the outcome of an election or referendum or how people vote (not campaign back-office tools)", article: "Annex III 8(b)" },
];

export const TRANSPARENCY = [
  { id: "chatbot", who: "provider", label: "Interacts directly with people (chatbot, voice agent), where it is not obvious they are talking to AI", article: "Art 50(1)" },
  { id: "generative", who: "provider", label: "Generates synthetic audio, image, video or text content", article: "Art 50(2)" },
  { id: "emotionnotice", who: "deployer", label: "Emotion recognition or biometric categorisation of people exposed to it", article: "Art 50(3)" },
  { id: "deepfake", who: "deployer", label: "Produces deepfake image, audio or video content", article: "Art 50(4)" },
  { id: "publictext", who: "deployer", label: "Publishes AI-generated text to inform the public on matters of public interest", article: "Art 50(4)" },
];

export const GPAI = [
  { id: "none", label: "No, I do not provide a general-purpose AI model" },
  { id: "model", label: "Yes, a general-purpose AI model (broad capability, many downstream uses)" },
  { id: "systemic", label: "Yes, and its training compute is at or above 10^25 floating point operations" },
];

export const TIER_LABEL = {
  out: "Outside the Regulation",
  prohibited: "Prohibited practice",
  high: "High-risk",
  limited: "Transparency duties only",
  minimal: "Minimal risk",
};

const isProvider = (role) => role === "provider" || role === "both";
const isDeployer = (role) => role === "deployer" || role === "both";

function ids(raw) {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string" && raw.trim()) return raw.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

function pick(list, raw, name, errors) {
  const chosen = ids(raw);
  const known = new Set(list.map((x) => x.id));
  for (const c of chosen) if (!known.has(c)) errors.push(`${name}: "${c}" is not an option.`);
  return list.filter((x) => chosen.includes(x.id));
}

export function parse(input) {
  const errors = [];
  const i = input || {};
  const role = ROLES.find((r) => r.id === i.role);
  if (!role) errors.push("Choose your role.");
  const eu = ["market", "output", "none"].includes(i.eu) ? i.eu : null;
  if (!eu) errors.push("Say whether the system is on the EU market or its output is used in the EU.");
  const gpai = i.gpai === undefined || i.gpai === "" ? "none" : i.gpai;
  if (!GPAI.some((g) => g.id === gpai)) errors.push("Choose a general-purpose model option.");
  return {
    errors,
    role: role ? role.id : null,
    eu,
    exclusions: pick(EXCLUSIONS, i.exclusions, "Exclusions", errors),
    prohibited: pick(PROHIBITED, i.prohibited, "Prohibited practices", errors),
    annex3: pick(ANNEX_III, i.annex3, "High-risk uses", errors),
    annex1: Boolean(i.annex1) && i.annex1 !== "0",
    profiling: Boolean(i.profiling) && i.profiling !== "0",
    narrow: Boolean(i.narrow) && i.narrow !== "0",
    transparency: pick(TRANSPARENCY, i.transparency, "Transparency triggers", errors),
    gpai,
    openSource: Boolean(i.openSource) && i.openSource !== "0",
  };
}

const D = {
  literacy: { what: "AI literacy duty (Art 4) for providers and deployers", date: "2025-02-02" },
  prohibited: { what: "Prohibited practices and the fines for them", date: "2025-02-02" },
  gpai: { what: "General-purpose AI model duties, governance and penalties", date: "2025-08-02" },
  gpaiLegacy: { what: "General-purpose AI models placed on the market before 2 Aug 2025 must comply by", date: "2027-08-02" },
  annex3: { what: "Annex III high-risk system duties and Art 50 transparency duties (as written in Art 113)", date: "2026-08-02" },
  annex1: { what: "High-risk duties for AI in products under Annex I harmonisation law (Art 6(1))", date: "2027-08-02" },
};

// Duties for a high-risk system by role. Every line names its Article.
const HIGH_PROVIDER = [
  ["Art 9", "Run a risk management system across the system's life."],
  ["Art 10", "Govern training, validation and test data: relevance, representativeness, bias examination."],
  ["Art 11", "Keep technical documentation (Annex IV) before you place the system on the market."],
  ["Art 12", "Design the system so it logs events automatically."],
  ["Art 13", "Give deployers instructions for use that state purpose, accuracy and limits."],
  ["Art 14", "Design for effective human oversight."],
  ["Art 15", "Meet appropriate accuracy, robustness and cybersecurity levels."],
  ["Art 17", "Operate a documented quality management system."],
  ["Art 43, 47, 48", "Complete the conformity assessment, draw up the EU declaration of conformity and affix CE marking."],
  ["Art 49", "Register the system in the EU database before placing it on the market."],
  ["Art 72, 73", "Monitor after market placement and report serious incidents to the market surveillance authority."],
];
const HIGH_DEPLOYER = [
  ["Art 26(1)", "Use the system according to the provider's instructions and put in place technical and organisational measures for that."],
  ["Art 26(2)", "Assign human oversight to people with the competence, training and authority to do it."],
  ["Art 26(4)-(6)", "Make sure input data is relevant, monitor operation, and keep the automatically generated logs for at least six months."],
  ["Art 26(7)", "Before using it at work, inform workers' representatives and the workers affected."],
  ["Art 26(11)", "Tell people when a high-risk system is used to make or help make decisions about them."],
  ["Art 27", "Public bodies, private entities providing public services, and deployers of credit-scoring and life or health insurance systems must first assess the impact on fundamental rights."],
];
const IMPORTER = [
  ["Art 23", "Before placing it on the market, check the provider did the conformity assessment, drew up the documentation, affixed CE marking and appointed an EU representative; put your name and address on the system."],
];
const DISTRIBUTOR = [
  ["Art 24", "Before making it available, check it carries CE marking, the declaration and instructions, and that the provider and importer met their duties; do not supply it if you think it is non-compliant."],
];
const GPAI_DUTIES = [
  ["Art 53(1)(a)-(b)", "Draw up and keep technical documentation of the model and give downstream providers the information they need."],
  ["Art 53(1)(c)-(d)", "Put in place a copyright compliance policy and publish a sufficiently detailed summary of the training content."],
  ["Art 54", "Providers outside the EU appoint an EU authorised representative before placing the model on the market."],
];
const GPAI_SYSTEMIC = [
  ["Art 52(1)", "Notify the Commission within two weeks of meeting the systemic-risk threshold."],
  ["Art 55", "Evaluate the model including adversarial testing, assess and mitigate systemic risks, track and report serious incidents, and ensure cybersecurity protection."],
];
const TRANSPARENCY_DUTY = {
  chatbot: "Design the system so people are told they are interacting with AI, unless that is obvious.",
  generative: "Mark the output in a machine-readable format as artificially generated or manipulated, where technically feasible.",
  emotionnotice: "Inform the people exposed to the system of its operation.",
  deepfake: "Disclose that the content has been artificially generated or manipulated.",
  publictext: "Disclose that the text is AI-generated, unless it has had human editorial review and someone holds editorial responsibility.",
};

const add = (list, who, rows) => rows.forEach(([article, text]) => list.push({ who, article, text }));

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const duties = [];
  const dates = [];
  const findings = [];
  const hits = [];
  const result = (tier, extra) => ({ errors: [], tier, tierLabel: TIER_LABEL[tier], role: p.role, hits, duties, dates, findings, ...extra });

  if (p.eu === "none") {
    findings.push({ severity: "info", title: "Outside the EU market and with no output used in the EU, the Regulation does not apply directly (Art 2(1))." });
    return result("out", { via: "Art 2(1)", reason: "The Regulation covers providers placing systems or models on the EU market, deployers established or located in the EU, and providers and deployers elsewhere whose output is used in the EU." });
  }
  if (p.exclusions.length) {
    findings.push({ severity: "info", title: "Check the exclusion carefully: dual-use systems that also serve a civilian purpose are in scope, and a research system that is later placed on the market is in scope from then." });
    return result("out", { via: p.exclusions.map((e) => e.article).join(", "), reason: `Excluded by: ${p.exclusions.map((e) => e.label).join("; ")}.` });
  }

  const provider = isProvider(p.role);
  const deployer = isDeployer(p.role);

  for (const h of p.prohibited) hits.push({ tier: "prohibited", ...h });
  const profilingOverride = p.annex3.length > 0 && p.profiling;
  const derogation = p.annex3.length > 0 && p.narrow && !profilingOverride;
  for (const h of p.annex3) hits.push({ tier: derogation ? "derogated" : "high", ...h });
  if (p.annex1) hits.push({ tier: "high", id: "annex1", label: "Safety component of a product (or itself a product) under Annex I harmonisation law that needs third-party conformity assessment", article: "Art 6(1)" });
  for (const h of p.transparency) hits.push({ tier: "limited", ...h });

  let tier = "minimal";
  if (p.transparency.length) tier = "limited";
  if (p.annex3.length || p.annex1) tier = derogation && !p.annex1 ? tier : "high";
  if (p.prohibited.length) tier = "prohibited";

  // Prohibited
  if (tier === "prohibited") {
    findings.push({ severity: "high", title: `A prohibited practice applies (${p.prohibited.map((x) => x.article).join(", ")}). It may not be placed on the market, put into service or used in the EU.` });
    findings.push({ severity: "medium", title: "Fines for prohibited practices reach EUR 35 million or 7% of worldwide annual turnover, whichever is higher; for SMEs and start-ups, whichever is lower (Art 99(3), (6))." });
    dates.push(D.prohibited);
  }

  // High-risk
  if (p.annex3.length && derogation) {
    findings.push({ severity: "medium", title: "Annex III use, but you claim the Art 6(3) exception (narrow procedural task, improving a prior human activity, detecting patterns without replacing human assessment, or a preparatory task). You must document that assessment before placing the system on the market and register it (Art 6(4), Art 49(2)); the authority can ask for it." });
  }
  if (profilingOverride) {
    findings.push({ severity: "high", title: "An Annex III system that profiles natural people is always high-risk; the Art 6(3) exception does not apply (Art 6(3), last subparagraph)." });
  }
  const highRisk = p.annex1 || (p.annex3.length > 0 && !derogation);
  if (highRisk && tier !== "prohibited") {
    findings.push({ severity: "high", title: `Likely high-risk (${hits.filter((h) => h.tier === "high").map((h) => h.article).join(", ")}).` });
    if (provider) add(duties, "Provider of a high-risk system", HIGH_PROVIDER);
    if (deployer) add(duties, "Deployer of a high-risk system", HIGH_DEPLOYER);
    if (p.role === "importer") add(duties, "Importer", IMPORTER);
    if (p.role === "distributor") add(duties, "Distributor", DISTRIBUTOR);
    if (p.annex3.length) dates.push(D.annex3);
    if (p.annex1) dates.push(D.annex1);
    findings.push({ severity: "medium", title: "Fines for breaching high-risk duties reach EUR 15 million or 3% of worldwide annual turnover, whichever is higher; for SMEs and start-ups, whichever is lower (Art 99(4), (6))." });
    if (p.role !== "provider") findings.push({ severity: "medium", title: "A deployer, importer or distributor becomes the provider, with all provider duties, if it puts its name on a high-risk system, substantially modifies it, or changes its intended purpose so it becomes high-risk (Art 25)." });
  }

  // Transparency duties apply alongside any tier except a prohibited one.
  if (tier !== "prohibited") {
    for (const t of p.transparency) {
      const mine = (t.who === "provider" && provider) || (t.who === "deployer" && deployer);
      if (mine) duties.push({ who: t.who === "provider" ? "Provider (transparency)" : "Deployer (transparency)", article: t.article, text: TRANSPARENCY_DUTY[t.id] });
    }
    if (p.transparency.length) {
      dates.push(D.annex3);
      findings.push({ severity: "medium", title: "Transparency duties are enforced with fines up to EUR 15 million or 3% of worldwide annual turnover, whichever is higher; for SMEs and start-ups, whichever is lower (Art 99(4), (6))." });
      if (p.transparency.some((t) => (t.who === "provider" && !provider) || (t.who === "deployer" && !deployer))) {
        findings.push({ severity: "info", title: "Some transparency triggers you ticked fall on the other role (provider or deployer). They still bind whoever holds that role; check your supplier or customer has covered them." });
      }
    }
  }

  // General-purpose model
  if (p.gpai !== "none") {
    if (!provider) {
      findings.push({ severity: "info", title: "The general-purpose model duties fall on the provider of the model. As a deployer, importer or distributor you rely on the provider's documentation (Art 53(1)(b))." });
    } else {
      const systemic = p.gpai === "systemic";
      const lightOpen = p.openSource && !systemic;
      findings.push({ severity: systemic ? "high" : "medium", title: systemic ? "General-purpose model with systemic risk: it is presumed to have high-impact capabilities at 10^25 FLOP of training compute (Art 51(2))." : "General-purpose model provider duties apply (Art 53)." });
      if (lightOpen) {
        findings.push({ severity: "info", title: "Models released under a free and open-source licence with public weights and parameters are exempt from the documentation duties in Art 53(1)(a)-(b), but not from the copyright policy and training-content summary, and the exemption ends at systemic risk (Art 53(2))." });
        add(duties, "General-purpose model provider (open-source)", GPAI_DUTIES.filter(([a]) => a !== "Art 53(1)(a)-(b)"));
      } else {
        add(duties, "General-purpose model provider", GPAI_DUTIES);
      }
      if (systemic) add(duties, "General-purpose model with systemic risk", GPAI_SYSTEMIC);
      dates.push(D.gpai, D.gpaiLegacy);
      findings.push({ severity: "medium", title: "Fines for general-purpose model providers reach EUR 15 million or 3% of worldwide annual turnover, whichever is higher, and are imposed by the Commission (Art 101)." });
    }
  }

  // Everyone
  if (provider || deployer) {
    duties.push({ who: "Provider or deployer", article: "Art 4", text: "Take measures so that staff and others operating or using AI on your behalf have a sufficient level of AI literacy." });
    dates.push(D.literacy);
  }
  if (tier === "minimal" && p.gpai === "none") {
    findings.push({ severity: "info", title: "On these answers the system falls into the minimal-risk group: no mandatory duties beyond AI literacy. Voluntary codes of conduct are encouraged (Art 95)." });
  }
  if (p.openSource && tier !== "minimal" && p.gpai === "none") {
    findings.push({ severity: "info", title: "The open-source exemption (Art 2(12)) does not apply to prohibited practices, high-risk systems or Art 50 transparency duties." });
  }
  findings.push({ severity: "info", title: "This reads only what you tick. Whether a system really fits an Annex III heading depends on its intended purpose, and Commission guidelines and national authorities will refine the boundaries. The dates are those in Art 113 as adopted; a postponement of the high-risk dates has been proposed, so confirm the current dates before planning against them." });

  const seen = new Set();
  const uniqueDates = dates.filter((d) => (seen.has(d.what) ? false : (seen.add(d.what), true))).sort((a, b) => a.date.localeCompare(b.date));
  dates.length = 0;
  dates.push(...uniqueDates);

  const via = hits.length ? hits.filter((h) => h.tier !== "derogated" || tier === "minimal").map((h) => h.article).join(", ") : "Art 95";
  return result(tier, { via, derogation, profilingOverride, gpai: p.gpai, reason: tierReason(tier, derogation) });
}

function tierReason(tier, derogation) {
  if (tier === "prohibited") return "At least one practice banned by Article 5 applies.";
  if (tier === "high") return "The system matches Annex III or is a regulated product under Annex I (Art 6), so the high-risk requirements apply.";
  if (tier === "limited") return "No prohibited or high-risk match, but Article 50 transparency duties are triggered.";
  return derogation ? "Annex III heading matched but the documented Art 6(3) exception is claimed." : "No prohibited, high-risk or transparency trigger was ticked.";
}

export const SAMPLE = {
  role: "provider",
  eu: "market",
  exclusions: [],
  prohibited: [],
  annex3: ["emprecruit"],
  annex1: "",
  profiling: "",
  narrow: "",
  transparency: ["generative"],
  gpai: "none",
  openSource: "",
};

export function summaryText(r) {
  const lines = [
    "EU AI Act risk check (first read, not legal advice)",
    `Result: ${r.tierLabel}${r.via ? ` [${r.via}]` : ""}`,
    r.reason || "",
  ];
  if (r.hits.length) lines.push("", "Matched:", ...r.hits.map((h) => `  - ${h.label} [${h.article}]${h.tier === "derogated" ? " (Art 6(3) exception claimed)" : ""}`));
  if (r.duties.length) lines.push("", "Main duties:", ...r.duties.map((d) => `  - ${d.article} (${d.who}): ${d.text}`));
  if (r.dates.length) lines.push("", "Dates (Art 113 as adopted):", ...r.dates.map((d) => `  - ${d.date}: ${d.what}`));
  lines.push("", "Confirm with counsel or your national market surveillance authority before relying on this.");
  return lines.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
}

export function dutiesCsv(r) {
  const q = (c) => `"${String(c).replace(/"/g, '""')}"`;
  return ["role,article,duty", ...r.duties.map((d) => [d.who, d.article, d.text].map(q).join(","))].join("\n");
}
