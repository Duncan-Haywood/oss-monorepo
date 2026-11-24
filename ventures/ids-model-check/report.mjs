// Plain-text and CSV renderings of a checkIds() report.

export function textReport(r, { maxFailures = 10 } = {}) {
  const out = [];
  const passed = r.specs.filter((s) => s.status === "pass").length;
  out.push(`${r.title || "IDS"} against ${r.format === "IFC5" ? `an IFC5 model (read as ${r.schema})` : `a ${r.schema} model`} (${r.entityCount.toLocaleString("en-US")} entities)${r.seconds !== undefined ? ` in ${r.seconds.toFixed(2)} s` : ""}`);
  const invalid = r.specs.filter((s) => s.status === "invalid").length;
  out.push(`${r.pass ? "PASS" : "FAIL"}: ${passed} of ${r.specs.length} specifications pass${invalid ? `; ${invalid} invalid (the IDS needs fixing; see below)` : ""}`);
  if (r.parseErrors.length) out.push(`note: ${r.parseErrors.length} reader note(s) on the model (lines that could not be read, or forms read leniently), e.g. ${r.parseErrors[0]}`);
  const dups = r.duplicateGlobalIds || [];
  if (dups.length) {
    out.push(`model warning: ${dups.length} GlobalId(s) are shared by more than one element (IFC requires them unique; BCF viewpoints and model diffs find elements by GlobalId):`);
    for (const d of dups.slice(0, maxFailures)) out.push(`  ${d.globalId}: ${d.elements.map((e) => `#${e.id} ${e.type}${e.name ? ` "${e.name}"` : ""}`).join(", ")}`);
    if (dups.length > maxFailures) out.push(`  ... and ${dups.length - maxFailures} more`);
  }
  const cf = r.conformance;
  if (cf && cf.total) {
    out.push(`model warning: ${cf.total} place(s) where the file breaks its own ${cf.schema} schema (an IDS check may test the wrong value there; --conformance lists them all):`);
    for (const g of cf.groups.slice(0, maxFailures)) out.push(`  ${g.count > 1 ? `${g.count} x ` : ""}${g.message}`);
    if (cf.groups.length > maxFailures || cf.more) out.push(`  ... and ${cf.groups.length - Math.min(maxFailures, cf.groups.length) + (cf.more || 0)} more kind(s)`);
  }
  for (const s of r.specs) {
    out.push("");
    out.push(`[${s.status.toUpperCase()}] ${s.name} (${s.optionality})`);
    if (s.warning) out.push(`  warning: ${s.warning}`);
    for (const w of s.auditWarnings || []) out.push(`  IDS warning: ${w}`);
    out.push(`  applies to: ${s.applicability.join("; ") || "everything"}  -> ${s.applicable} element(s)`);
    if (s.requirements.length) out.push(`  requires: ${s.requirements.join("; ")}`);
    if (s.note) out.push(`  ${s.note}`);
    if (s.hint) out.push(`  warning: ${s.hint}`);
    if (s.failed.length) {
      out.push(`  ${s.passed} pass, ${s.failed.length} fail:`);
      for (const f of s.failed.slice(0, maxFailures)) out.push(`    #${f.id} ${f.type}${f.name ? ` "${f.name}"` : ""}${f.globalId ? ` ${f.globalId}` : ""}: ${f.reasons.join("; ")}`);
      if (s.failed.length > maxFailures) out.push(`    ... and ${s.failed.length - maxFailures} more`);
    }
  }
  return out.join("\n");
}

const csvCell = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : s;
};

export function csvReport(r) {
  const rows = [["specification", "status", "step_id", "ifc_class", "global_id", "name", "reason"]];
  for (const s of r.specs) {
    if (!s.failed.length) rows.push([s.name, s.status, "", "", "", "", s.note || ""]);
    for (const f of s.failed) rows.push([s.name, "fail", "#" + f.id, f.type, f.globalId, f.name, f.reasons.join("; ")]);
  }
  // Model findings, after the specifications: one row per element that shares
  // its GlobalId, so a filter on global_id shows the whole group.
  for (const d of r.duplicateGlobalIds || []) {
    for (const e of d.elements) rows.push(["(model) duplicate GlobalId", "duplicate", "#" + e.id, e.type, d.globalId, e.name, `GlobalId shared by ${d.elements.length} elements (${d.elements.map((x) => "#" + x.id).join(", ")}); IFC requires it unique`]);
  }
  return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

// The IDS audit on its own (no model): one line per issue.
export function auditReport(title, specs, issues) {
  const errors = issues.filter((x) => x.level === "error");
  const bad = new Set(errors.filter((x) => x.spec !== null).map((x) => x.spec));
  const out = [`${title || "IDS"}: ${errors.length ? "INVALID" : "VALID"}, ${specs.length - bad.size} of ${specs.length} specifications valid, ${errors.length} error(s), ${issues.length - errors.length} warning(s)`];
  for (const x of issues) out.push(`[${x.level.toUpperCase()}] ${x.specName}${x.facet ? " / " + x.facet : ""}: ${x.message}`);
  return out.join("\n");
}
