const IMPACTS = ["critical", "serious", "moderate", "minor"];

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
  return `- [${item.impact}] ${item.id}: ${item.help} (${nodes})${wcagLabel(item)}${url}`;
}

export function buildReport(input, date = new Date().toISOString().slice(0, 10)) {
  if (!input || typeof input !== "object") throw new Error("Paste a valid axe-core JSON object.");
  const items = asItems(input.violations, "Review this violation manually.");
  const reviewItems = asItems(input.incomplete, "Review this result manually.");
  const passes = Array.isArray(input.passes) ? input.passes : [];
  return {
    date,
    url: typeof input.url === "string" ? input.url : "Not supplied",
    tool: typeof input.testEngine?.name === "string" ? input.testEngine.name : "axe-core",
    engineVersion: typeof input.testEngine?.version === "string" ? input.testEngine.version : "",
    counts: {
      violations: items.length,
      nodes: items.reduce((sum, item) => sum + item.nodes, 0),
      passes: passes.length,
      incomplete: reviewItems.length,
    },
    impact: countByImpact(items),
    items,
    reviewItems,
  };
}

export function reportAsText(report) {
  const engine = report.engineVersion ? `${report.tool} ${report.engineVersion}` : report.tool;
  const lines = [
    "Accessibility evidence record",
    `Checked: ${report.date}`,
    `URL: ${report.url}`,
    `Engine: ${engine}`,
    "",
    `Violations: ${report.counts.violations} rules / ${report.counts.nodes} nodes`,
    `Impact: ${formatImpact(report.impact || countByImpact(report.items))}`,
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
  lines.push("", "This is a record of the supplied automated test, not a compliance determination.");
  return lines.join("\n");
}

function byId(items) {
  return new Map((items || []).map((item) => [item.id, item]));
}

export function compareReports(before, after) {
  if (!before?.items || !after?.items) {
    throw new Error("Generate both a before scan and an after scan first.");
  }
  const beforeMap = byId(before.items);
  const afterMap = byId(after.items);
  const resolved = [];
  const remaining = [];
  const introduced = [];

  for (const [id, item] of beforeMap) {
    const later = afterMap.get(id);
    if (!later) {
      resolved.push(item);
      continue;
    }
    remaining.push({
      ...later,
      beforeNodes: item.nodes,
      nodeDelta: later.nodes - item.nodes,
    });
  }
  for (const [id, item] of afterMap) {
    if (!beforeMap.has(id)) introduced.push(item);
  }

  return {
    before,
    after,
    resolved,
    remaining,
    introduced,
    counts: {
      resolved: resolved.length,
      remaining: remaining.length,
      introduced: introduced.length,
      nodeDelta: after.counts.nodes - before.counts.nodes,
    },
    impact: {
      before: before.impact || countByImpact(before.items),
      after: after.impact || countByImpact(after.items),
    },
  };
}

function remainingLine(item) {
  const delta = item.nodeDelta === 0
    ? "same node count"
    : `${item.beforeNodes} → ${item.nodes} nodes`;
  return `- [${item.impact}] ${item.id}: ${item.help} (${delta})${wcagLabel(item)}`;
}

export function comparisonAsText(comparison) {
  const { before, after, resolved, remaining, introduced, counts, impact } = comparison;
  const nodeWord = Math.abs(counts.nodeDelta) === 1 ? "node" : "nodes";
  const nodeChange = counts.nodeDelta === 0
    ? "affected node count is unchanged"
    : counts.nodeDelta < 0
      ? `${-counts.nodeDelta} fewer affected ${nodeWord}`
      : `${counts.nodeDelta} more affected ${nodeWord}`;
  const lines = [
    "Accessibility remediation comparison",
    `Before: ${before.date} · ${before.url}`,
    `After: ${after.date} · ${after.url}`,
    "",
    `Resolved: ${counts.resolved} rules no longer in the after scan`,
    `Remaining: ${counts.remaining} rules still present`,
    `New: ${counts.introduced} rules that were not in the before scan`,
    `Nodes: ${nodeChange}`,
    `Impact before: ${formatImpact(impact.before)}`,
    `Impact after: ${formatImpact(impact.after)}`,
    "",
  ];

  lines.push("Resolved (present before, absent after):");
  if (!resolved.length) lines.push("- None in this pair of supplied results.");
  for (const item of resolved) lines.push(itemLine(item));

  lines.push("", "Still present:");
  if (!remaining.length) lines.push("- None in this pair of supplied results.");
  for (const item of remaining) lines.push(remainingLine(item));

  lines.push("", "New in the after scan:");
  if (!introduced.length) lines.push("- None in this pair of supplied results.");
  for (const item of introduced) lines.push(itemLine(item));

  lines.push(
    "",
    "This comparison only diffs the two supplied automated results. It is not a compliance determination, and it does not prove a fix was complete or that a new issue was introduced by a specific change.",
  );
  return lines.join("\n");
}
