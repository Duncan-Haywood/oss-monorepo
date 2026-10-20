// EU "Empowering Consumers for the Green Transition" Directive (EU) 2024/825 first read for a trader: which of
// the marketing claims you use fall on the new blacklist of unfair practices or need conditions, applying to
// consumers from 27 September 2026 (national laws were due by 27 March 2026). Pure functions, no I/O; `today`
// is a parameter so every answer is repeatable. Bad input is rejected with a message, never clamped.
// The claim list and dates were written from memory of the published text without network access to EUR-Lex in
// the building session; verify them against CELEX 32024L0825 and your national transposition before quoting them.
// Article and annex numbers are deliberately not given: they were not checkable here.

export const APPLIES_FROM = "2026-09-27";

export const ROLES = [
  { id: "seller", label: "Brand owner or seller of your own goods or services" },
  { id: "retailer", label: "Retailer or reseller of other brands" },
  { id: "marketplace", label: "Online marketplace or platform listing other traders' offers" },
  { id: "agency", label: "Marketing agency or copywriter writing claims for clients" },
];

export const AUDIENCES = {
  eu: "Consumers in the EU (B2C)",
  b2b: "Businesses only (B2B)",
  none: "No sales into the EU",
};

// kind "banned": a blacklisted practice, unfair in every case. kind "conditional": allowed only when the stated
// condition is met, otherwise misleading. `topic` groups the rows on the page.
export const CLAIMS = [
  { id: "generic", topic: "green", kind: "banned", label: "A generic environmental claim such as \"eco-friendly\", \"green\", \"climate friendly\", \"biodegradable\" or \"nature's friend\"",
    rule: "Banned unless the trader can show recognised excellent environmental performance (for example an EU Ecolabel or an officially recognised national ecolabel) relevant to the claim.",
    fix: "Say what is better and by how much (\"packaging is 80 percent recycled cardboard\") or point to the recognised scheme." },
  { id: "label", topic: "green", kind: "banned", label: "A sustainability label, badge or logo you made up or a trade body awarded itself",
    rule: "Banned unless the label is based on a certification scheme or set up by a public authority.",
    fix: "Use a third-party certified scheme, or drop the badge and state the plain fact." },
  { id: "offset", topic: "green", kind: "banned", label: "\"Climate neutral\", \"CO2 compensated\" or \"carbon positive\" because emissions are offset elsewhere",
    rule: "Banned: a claim that a product has a neutral, reduced or positive greenhouse-gas impact because of offsetting.",
    fix: "Report the product's own emissions cut; describe offset spending separately as a contribution, not as the product's footprint." },
  { id: "whole", topic: "green", kind: "banned", label: "A claim about the whole product or business when it only holds for one part (\"sustainable shoe\" when only the laces are recycled)",
    rule: "Banned: an environmental claim about the entire product or business when it concerns only a certain aspect.",
    fix: "Name the aspect (\"laces made from recycled plastic\")." },
  { id: "future", topic: "green", kind: "conditional", label: "A future environmental claim such as \"net zero by 2030\" or \"plastic-free by 2028\"",
    rule: "Allowed only with clear, objective, public and verifiable commitments set out in a detailed and realistic implementation plan that an independent expert monitors; otherwise misleading.",
    fix: "Publish the plan with milestones, resources and an independent monitor, or drop the claim." },
  { id: "legal", topic: "green", kind: "banned", label: "Presenting something the law already requires of every trader as a special feature of your offer (\"free of banned substance X\")",
    rule: "Banned: presenting requirements imposed by law on all products in the category as a distinctive feature of the trader's offer.",
    fix: "Remove the claim or compare against what the law does not already demand." },
  { id: "durability", topic: "durable", kind: "banned", label: "A durability claim (\"lasts 10 years\", \"500 washes\") that the product does not meet under normal use",
    rule: "Banned: making a claim about the durability of a good in terms of time or intensity of use when that is not true.",
    fix: "Claim only what testing shows, with the test conditions beside it." },
  { id: "repairable", topic: "durable", kind: "banned", label: "Calling a good repairable when it cannot be repaired",
    rule: "Banned: presenting goods as allowing repair when they do not.",
    fix: "Say whether spare parts, tools and instructions exist, and for how long." },
  { id: "obsolescence", topic: "durable", kind: "banned", label: "Selling a good without saying it has a feature built in that limits its durability (for example a part that wears out on a counter or schedule)",
    rule: "Banned: omitting to tell the consumer that a good has a feature introduced to limit its durability, where this is known.",
    fix: "Remove the feature or disclose it before purchase." },
  { id: "software", topic: "durable", kind: "banned", label: "Pushing a software update that makes a good work worse without saying so, or calling an update necessary when it only adds features",
    rule: "Banned: not telling the consumer that a software update will negatively affect how the good works, and presenting a feature-only update as necessary for the good to keep working.",
    fix: "Disclose the downside and let the consumer decline a feature-only update." },
  { id: "consumables", topic: "durable", kind: "banned", label: "Telling buyers to replace ink, filters or other consumables earlier than the technical need",
    rule: "Banned: inducing the consumer to replace a good's consumables earlier than for technical reasons.",
    fix: "Base replacement prompts on measured wear." },
  { id: "guarantee", topic: "durable", kind: "conditional", label: "A producer's commercial guarantee of durability longer than two years",
    rule: "Where the producer offers one, the seller must show it prominently before purchase, together with the legal guarantee notice.",
    fix: "Add the guarantee notice to the listing and the checkout." },
];

export const CLAIM_IDS = CLAIMS.map((c) => c.id);

const DAY = 86400000;
export function daysSince(from, today) {
  return Math.round((Date.parse(today) - Date.parse(from)) / DAY);
}

export function parse(input) {
  const errors = [];
  const i = input || {};
  const role = ROLES.find((r) => r.id === i.role);
  if (!role) errors.push("Choose your role.");
  const audience = Object.keys(AUDIENCES).includes(i.audience) ? i.audience : null;
  if (!audience) errors.push("Say who you sell to.");
  const today = i.today === undefined || i.today === "" ? new Date().toISOString().slice(0, 10) : String(i.today);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || Number.isNaN(Date.parse(today))) errors.push("Today's date must be written YYYY-MM-DD.");
  const used = {};
  for (const id of CLAIM_IDS) used[id] = Boolean(i[id]) && i[id] !== "0";
  return { errors, role, audience, today, used };
}

export function scope(p) {
  if (p.audience === "none") return { status: "out", reason: "The rules cover practices directed at consumers in the EU. Without sales or marketing into the EU they do not apply directly." };
  if (p.audience === "b2b") return { status: "out", reason: "The Directive amends the consumer-protection rules, which protect consumers. Business-to-business marketing is outside it, though other national rules on misleading advertising may still apply." };
  return { status: "in", reason: "Marketing aimed at EU consumers is covered, whatever your size and wherever you are established." };
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const verdict = scope(p);
  const state = daysSince(APPLIES_FROM, p.today) >= 0 ? "applies" : "soon";
  const days = -daysSince(APPLIES_FROM, p.today);
  const hits = verdict.status === "in" ? CLAIMS.filter((c) => p.used[c.id]).map((c) => ({ ...c, state })) : [];
  const banned = hits.filter((c) => c.kind === "banned");
  const conditional = hits.filter((c) => c.kind === "conditional");
  const findings = [];
  if (verdict.status === "in") {
    if (!hits.length) findings.push({ severity: "info", title: "You marked no claim from the list. The list is the main blacklisted and conditional claims, not every misleading practice; other consumer rules still apply." });
    if (banned.length) findings.push({ severity: state === "applies" ? "high" : "medium", title: `${banned.length} claim${banned.length === 1 ? "" : "s"} you use ${state === "applies" ? "are banned now" : `will be banned in ${days} days (${APPLIES_FROM})`}: remove or rewrite ${banned.length === 1 ? "it" : "them"}.` });
    if (conditional.length) findings.push({ severity: "medium", title: `${conditional.length} claim${conditional.length === 1 ? "" : "s"} you use ${conditional.length === 1 ? "is" : "are"} allowed only if a condition is met. Check it is.` });
    if (p.role.id === "marketplace") findings.push({ severity: "medium", title: "As a platform you answer for your own claims; other traders' listings are theirs, but you may be asked to act on notices about them under other EU rules." });
    if (p.role.id === "agency") findings.push({ severity: "medium", title: "An agency's copy becomes the client's practice. Agree who checks the claim evidence before it is published." });
    for (const c of banned) findings.push({ severity: state === "applies" ? "high" : "medium", title: `${c.label}. ${c.rule} Instead: ${c.fix}` });
    for (const c of conditional) findings.push({ severity: "medium", title: `${c.label}. ${c.rule} Instead: ${c.fix}` });
  } else {
    findings.push({ severity: "info", title: verdict.reason });
  }
  return { input: p, role: p.role, audience: p.audience, verdict, state, days, hits, banned, conditional, findings };
}

export const SAMPLE = Object.fromEntries([["role", "seller"], ["audience", "eu"], ["today", ""], ...CLAIM_IDS.map((id) => [id, ["generic", "offset", "future", "durability"].includes(id) ? "1" : ""])]);

export function summaryText(r) {
  const lines = [
    "EU green claims check, Directive (EU) 2024/825 (first read, not legal advice)",
    `Role: ${r.role.label}`,
    `Sells to: ${AUDIENCES[r.audience]}`,
    `Reference date: ${r.input.today}`,
    `Applies to consumers from: ${APPLIES_FROM}`,
    `Result: ${r.verdict.status === "in" ? "in scope" : "not in scope directly"}. ${r.verdict.reason}`,
  ];
  if (r.hits.length) {
    lines.push("", "Claims you use:");
    for (const c of r.hits) lines.push(`  [${c.kind === "banned" ? "BANNED" : "CONDITION"}] ${c.label}`, `      ${c.rule}`, `      Instead: ${c.fix}`);
  }
  lines.push("", "The claim list was written from memory of the Directive: confirm with your national authority or counsel.");
  return lines.join("\n");
}

export function claimsCsv(r) {
  const q = (c) => `"${String(c).replace(/"/g, '""')}"`;
  return ["applies_from,kind,claim,rule,instead", ...r.hits.map((c) => [APPLIES_FROM, c.kind, c.label, c.rule, c.fix].map(q).join(","))].join("\n");
}
