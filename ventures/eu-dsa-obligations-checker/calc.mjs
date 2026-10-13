// EU Digital Services Act (Regulation (EU) 2022/2065) obligations check: which duties apply to an
// online service, by provider category, size and EU reach. Pure functions, no I/O. Bad input is
// rejected with a message, never clamped.
// Written from memory WITHOUT network access in the building session: article numbers and the
// micro/small exemption are stated as the Regulation reads, but every result names its source to
// verify. Implementing acts and Commission guidelines (transparency-report templates, protection
// of minors) change the detail; the structure below follows the Regulation's own chapters.

export const VERIFY = "Regulation (EU) 2022/2065 (Digital Services Act), Chapter III; Commission Recommendation 2003/361/EC for the micro and small enterprise test; your Digital Services Coordinator's guidance";

export const VLOP_MAU = 45_000_000;
export const SMALL = { employees: 50, turnoverOrAssets: 10_000_000 };
export const MAX_FINE = "up to 6% of worldwide annual turnover (Art. 52)";

export const SERVICE_TYPES = [
  { id: "conduit", label: "Mere conduit (transmits or gives access to a network)" },
  { id: "caching", label: "Caching (temporary automatic storage to speed up transmission)" },
  { id: "hosting", label: "Hosting, content not shown to the public (private storage, B2B, messaging)" },
  { id: "platform", label: "Hosting that shows user content to the public (social, forum, reviews, video)" },
  { id: "search", label: "Online search engine" },
];

const NUM = ["employees", "turnover", "assets", "mau"];

export function parse(input) {
  const i = input || {};
  const errors = [];
  const type = SERVICE_TYPES.find((t) => t.id === i.type);
  if (!type) errors.push("Choose the kind of service.");
  const n = {};
  for (const k of NUM) {
    const raw = i[k] === undefined || i[k] === "" || i[k] === null ? 0 : Number(i[k]);
    if (!Number.isFinite(raw) || raw < 0) { errors.push(`Enter a number of zero or more for ${k}.`); n[k] = 0; } else n[k] = raw;
  }
  const yn = (v) => v === true || v === "yes";
  return {
    errors, type: type ? type.id : "", n,
    marketplace: yn(i.marketplace), euBased: i.euBased === undefined ? true : yn(i.euBased),
    minors: yn(i.minors), ads: yn(i.ads), recommender: yn(i.recommender), designated: yn(i.designated),
  };
}

// Micro or small enterprise: under 50 staff AND turnover or balance sheet at most EUR 10M.
export function isSmall(p) {
  return p.n.employees < SMALL.employees && (p.n.turnover <= SMALL.turnoverOrAssets || p.n.assets <= SMALL.turnoverOrAssets);
}

export function category(p) {
  const big = p.n.mau >= VLOP_MAU;
  if (p.type === "search") return big || p.designated ? "vlose" : "search";
  if (p.type === "platform") {
    if (big || p.designated) return "vlop";
    return p.marketplace ? "marketplace" : "platform";
  }
  if (p.type === "hosting") return "hosting";
  return p.type;
}

const O = (art, title, why) => ({ art, title, why });

export function obligations(p) {
  const cat = category(p);
  const small = isSmall(p) && cat !== "vlop" && cat !== "vlose";
  const out = [];
  const add = (group, ...items) => items.forEach((o) => out.push({ group, ...o }));

  add("All intermediary services", 
    O("Art. 11", "Point of contact for authorities", "Publish a single electronic contact for Member State authorities, the Commission and the Board, in a language they can use."),
    O("Art. 12", "Point of contact for users", "Publish a way for users to reach you directly and quickly, not only through an automated tool."),
    O("Art. 14", "Terms and conditions", "State content restrictions and how moderation and complaints work in plain language, and apply them with regard to fundamental rights."),
    O("Arts. 9-10", "Act on authority orders", "Comply with orders to act against illegal content or to provide information, and tell the authority what you did."));
  if (!p.euBased) add("All intermediary services", O("Art. 13", "Legal representative in the EU", "A provider with no EU establishment that offers services in the EU must appoint a legal representative in a Member State where it offers them."));
  if (!small) add("All intermediary services", O("Art. 15", "Annual transparency report", "Publish a machine-readable report at least once a year on moderation, orders received and complaints."));

  if (["hosting", "platform", "marketplace", "vlop"].includes(cat)) {
    add("Hosting services",
      O("Art. 16", "Notice-and-action mechanism", "Give anyone an easy electronic way to report illegal content, and confirm receipt and the decision."),
      O("Art. 17", "Statement of reasons", "Tell the affected user why you removed, disabled or demoted their content or suspended their account, and how to challenge it."),
      O("Art. 18", "Report suspected serious crime", "Tell the authorities when you learn of a suspicion of a criminal offence involving a threat to life or safety."));
  }

  if (["platform", "marketplace", "vlop"].includes(cat)) {
    add("Online platforms", O("Art. 24(3)", "Publish monthly active EU users", "Publish average monthly active EU recipients at least every six months. Small enterprises are not exempt from this one."));
    if (!small) {
      add("Online platforms",
        O("Art. 20", "Internal complaint handling", "A free, electronic complaint system for decisions about content and accounts, with a human in the loop."),
        O("Art. 21", "Out-of-court dispute settlement", "Tell users they can use a certified out-of-court body and engage with it in good faith."),
        O("Art. 22", "Trusted flaggers", "Handle notices from trusted flaggers with priority."),
        O("Art. 23", "Measures against misuse", "Suspend, after a warning, users who often post manifestly illegal content or send manifestly unfounded notices."),
        O("Art. 24(5)", "Statements of reasons to the Commission database", "Submit your Art. 17 decisions to the Commission's transparency database without personal data."),
        O("Art. 25", "No dark patterns", "Do not design the interface to deceive or manipulate users or to impair free informed choice."),
        O("Art. 28", "Protection of minors", "Appropriate and proportionate measures for a high level of privacy, safety and security of minors where they can use the service."));
      if (p.ads) add("Online platforms", O("Art. 26", "Advertising transparency", "Show, for every ad, that it is an ad, who it is for, who paid, and the main targeting parameters. No ads profiled on special-category data."));
      if (p.recommender) add("Online platforms", O("Art. 27", "Recommender system transparency", "Explain in your terms the main parameters of recommendations and how users can change them."));
    }
    if (p.minors) add("Online platforms", O("Art. 28(2)", "No profiling-based ads to minors", "No ads based on profiling that use personal data when you know with reasonable certainty the user is a minor."));
  }

  if (cat === "marketplace" && !small) {
    add("Online marketplaces",
      O("Art. 30", "Trader traceability (know your business customer)", "Collect and check identity, contact, registration and self-certification of traders before they can sell, and keep the data."),
      O("Art. 31", "Compliance by design", "Design the interface so traders can give pre-contract and product safety information, and make reasonable efforts to check it."),
      O("Art. 32", "Tell buyers about illegal products", "If you learn a product sold was illegal, inform buyers from the last six months of it, the seller and remedies."));
  }

  if (cat === "vlop" || cat === "vlose") {
    add("Very large platforms and search engines",
      O("Art. 34", "Systemic risk assessment", "Assess risks to illegal content, fundamental rights, civic discourse, elections, minors and wellbeing at least once a year and before major changes."),
      O("Art. 35", "Risk mitigation", "Put in place reasonable, proportionate and effective measures against the risks you found."),
      O("Art. 37", "Independent audit", "An annual audit at your own cost by an independent auditor, with an implementation report."),
      O("Art. 40", "Data access for researchers and regulators", "Give the coordinator and vetted researchers access to data on request."),
      O("Art. 41", "Compliance function", "An independent compliance function with its own head, reporting to management."),
      O("Art. 42", "Transparency reports every six months", "Report twice a year, with moderator numbers, languages and accuracy indicators."),
      O("Art. 43", "Supervisory fee", "Pay the annual supervisory fee to the Commission."));
    if (cat === "vlop") add("Very large platforms and search engines", O("Art. 39", "Advertisement repository", "Keep a searchable public repository of ads for one year after last display."), O("Art. 38", "A recommender option without profiling", "Offer at least one recommender option that is not based on profiling."));
  }
  return out;
}

export const fmt = (v) => Math.round(v).toLocaleString("en-GB");

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const cat = category(p);
  const small = isSmall(p) && cat !== "vlop" && cat !== "vlose";
  const obs = obligations(p);
  const findings = [];

  const LABEL = {
    conduit: "Mere conduit", caching: "Caching service", hosting: "Hosting service", platform: "Online platform",
    marketplace: "Online marketplace (platform where consumers buy from traders)", vlop: "Very large online platform (VLOP)",
    search: "Online search engine", vlose: "Very large online search engine (VLOSE)",
  };

  findings.push({ severity: "high", title: `Category: ${LABEL[cat]}. ${obs.length} duties apply to you on these answers, listed below with the Article.` });
  if (small && ["platform", "marketplace"].includes(cat)) {
    findings.push({ severity: "medium", title: "Micro or small enterprise: the heavier online platform duties (Arts. 20-28) and the marketplace trader duties (Arts. 30-32) do not apply to you, and neither does the annual transparency report. Art. 24(3) (publish your monthly active users) and the hosting duties still do. If you grow past the threshold you get a 12-month grace period, and a designation as a VLOP removes the exemption." });
  }
  if (p.n.mau >= VLOP_MAU * 0.5 && p.n.mau < VLOP_MAU) {
    findings.push({ severity: "medium", title: `You are at ${fmt(p.n.mau)} average monthly EU users, over half of the ${fmt(VLOP_MAU)} that makes a platform or search engine very large. Plan for it: crossing it means telling the Commission, designation, and the extra duties start four months after designation.` });
  }
  if (cat === "vlop" || cat === "vlose") {
    findings.push({ severity: "high", title: `At or above ${fmt(VLOP_MAU)} average monthly active EU recipients (or designated), you are a very large service. The micro and small exemption does not apply. Duties start four months after the Commission designates you; the Commission is the main supervisor.` });
  }
  if (cat === "conduit" || cat === "caching") {
    findings.push({ severity: "info", title: "Conduits and caches only carry the baseline duties. The liability exemption for them (Arts. 4 and 5) still depends on not initiating, selecting or modifying the transmission." });
  }
  if (p.type === "platform" || p.type === "hosting") {
    findings.push({ severity: "info", title: "Check the platform line: a comment section that is purely ancillary to other content, such as a newspaper's, does not make a hosting service an online platform, and private messaging is not public dissemination. Your coordinator decides borderline cases." });
  }
  if (!p.euBased) findings.push({ severity: "medium", title: "No EU establishment: you still fall under the DSA if you offer services to people in the EU, and Art. 13 requires a legal representative who can be held liable." });
  findings.push({ severity: "info", title: `Penalties: ${MAX_FINE}. Information supplied wrongly can be fined separately. Your Member State's Digital Services Coordinator enforces for ordinary providers.` });

  return { errors: [], input: p, category: cat, small, obligations: obs, findings };
}

export const SAMPLE = { type: "platform", marketplace: "no", euBased: "yes", employees: 18, turnover: 2_500_000, assets: 1_000_000, mau: 400_000, ads: "yes", recommender: "yes", minors: "no", designated: "no" };

export function summaryText(r) {
  const groups = [...new Set(r.obligations.map((o) => o.group))];
  return [
    "EU Digital Services Act obligations check (first read, not legal advice)",
    `Category: ${r.category}${r.small ? " (micro or small enterprise)" : ""}`,
    ...r.findings.map((f) => `- ${f.title}`),
    "",
    ...groups.flatMap((g) => [`${g}:`, ...r.obligations.filter((o) => o.group === g).map((o) => `  [ ] ${o.art} ${o.title}`)]),
    "",
    `Verify against: ${VERIFY}`,
    "Confirm with a lawyer or your Digital Services Coordinator.",
  ].join("\n");
}
