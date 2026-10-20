const IMPACTS = ["critical", "serious", "moderate", "minor"];

// The axe-core tags that map to the standard ADA Title II's own rule adopts:
// WCAG 2.1 Level A and AA (28 CFR 35.200, via the 2024 web rule). Anything
// outside this set (best-practice rules, WCAG 2.2 additions, AAA) is real and
// worth fixing, but it is not what the regulation itself requires, so a
// report that lumped them together would overstate legal exposure on some
// findings and understate it on none -- worth keeping separate.
const REQUIRED_TAGS = new Set(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);

function asItems(list, fallbackHelp) {
  if (!Array.isArray(list)) return [];
  return list.map((item) => {
    const tags = Array.isArray(item?.tags)
      ? item.tags.filter((tag) => typeof tag === "string")
      : [];
    return {
      id: String(item?.id || "unknown-rule"),
      impact: IMPACTS.includes(item?.impact) ? item.impact : "unknown",
      help: String(item?.help || fallbackHelp),
      helpUrl: typeof item?.helpUrl === "string" ? item.helpUrl : "",
      nodes: Array.isArray(item?.nodes) ? item.nodes.length : 0,
      tags,
      requiredByTitleII: tags.some((tag) => REQUIRED_TAGS.has(tag)),
    };
  });
}

export function countByImpact(items) {
  const counts = { critical: 0, serious: 0, moderate: 0, minor: 0, unknown: 0 };
  for (const item of items || []) {
    const key = IMPACTS.includes(item.impact) ? item.impact : "unknown";
    counts[key] += 1;
  }
  return counts;
}

export function formatImpact(counts) {
  const parts = IMPACTS
    .map((impact) => (counts[impact] ? `${counts[impact]} ${impact}` : ""))
    .filter(Boolean);
  if (counts.unknown) parts.push(`${counts.unknown} unknown`);
  return parts.length ? parts.join(", ") : "none";
}

function wcagLabel(item) {
  const tags = (item.tags || []).filter((tag) => /^wcag/i.test(tag));
  return tags.length ? ` [${tags.join(", ")}]` : "";
}

function itemLine(item) {
  const nodes = `${item.nodes} node${item.nodes === 1 ? "" : "s"}`;
  const url = item.helpUrl ? ` ${item.helpUrl}` : "";
  const flag = item.requiredByTitleII ? " (WCAG 2.1 AA)" : " (beyond the Title II minimum)";
  return `- [${item.impact}] ${item.id}: ${item.help} (${nodes})${wcagLabel(item)}${flag}${url}`;
}

export function buildReport(input, date = new Date().toISOString().slice(0, 10)) {
  if (!input || typeof input !== "object") throw new Error("Paste a valid axe-core JSON object.");
  const items = asItems(input.violations, "Review this violation manually.");
  const reviewItems = asItems(input.incomplete, "Review this result manually.");
  const passes = Array.isArray(input.passes) ? input.passes : [];
  const requiredViolations = items.filter((item) => item.requiredByTitleII);
  return {
    date,
    url: typeof input.url === "string" ? input.url : "Not supplied",
    tool: typeof input.testEngine?.name === "string" ? input.testEngine.name : "axe-core",
    engineVersion: typeof input.testEngine?.version === "string" ? input.testEngine.version : "",
    counts: {
      violations: items.length,
      requiredViolations: requiredViolations.length,
      nodes: items.reduce((sum, item) => sum + item.nodes, 0),
      passes: passes.length,
      incomplete: reviewItems.length,
    },
    impact: countByImpact(items),
    requiredImpact: countByImpact(requiredViolations),
    items,
    reviewItems,
  };
}

export function reportAsText(report) {
  const engine = report.engineVersion ? `${report.tool} ${report.engineVersion}` : report.tool;
  const lines = [
    "ADA Title II web accessibility evidence record",
    `Checked: ${report.date}`,
    `URL: ${report.url}`,
    `Engine: ${engine}`,
    `Standard checked against: WCAG 2.1 Level AA (the standard 28 CFR 35.200 adopts for Title II)`,
    "",
    `Violations: ${report.counts.violations} rules / ${report.counts.nodes} nodes`,
    `  of which within the WCAG 2.1 AA required set: ${report.counts.requiredViolations}`,
    `Impact (all violations): ${formatImpact(report.impact || countByImpact(report.items))}`,
    `Impact (WCAG 2.1 AA required only): ${formatImpact(report.requiredImpact || {})}`,
    `Passes: ${report.counts.passes} rules`,
    `Needs review: ${report.counts.incomplete} rules`,
    "",
  ];
  if (!report.items.length) {
    lines.push("No violations were present in this supplied result. Manual review is still required.");
  }
  for (const item of report.items) lines.push(itemLine(item));
  if (Array.isArray(report.reviewItems) && report.reviewItems.length) {
    lines.push("", "Items needing manual review:");
    for (const item of report.reviewItems) lines.push(itemLine(item));
  }
  lines.push(
    "",
    "This is a record of the supplied automated test, not a determination that this entity meets or fails its ADA Title II obligation. Automated testing (axe-core or any other tool) typically finds a minority of WCAG issues -- manual and assistive-technology testing is still required.",
  );
  return lines.join("\n");
}
