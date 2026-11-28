// "NIST SP 800-171 Rev. 2 vs Rev. 3": what happened to each of the 110 Rev. 2 requirements in Rev. 3
// (kept under the same number, or withdrawn and where NIST says it went), the 20 requirement numbers
// Rev. 3 adds with their text, the organization-defined parameters (ODPs) Rev. 3 introduces, and why a
// CMMC Level 2 shop still works to Rev. 2. Also a CSV crosswalk built with the site.
//
// Data: Rev. 2 text from apps/cmmc's official-text.json (NIST's own spreadsheet, tested there); Rev. 3
// from fixtures/nist-800-171r3/rev3-extract.json, extracted by scripts/extract-rev3.mjs from NIST's
// OSCAL catalog (hash pinned in test/rev2-vs-rev3.test.mjs). Every count on the page is computed here
// and pinned by the test. Rev. 2's 3.x.y is Rev. 3's 03.0x.0y: NIST kept the numbering and marked the
// removed ones withdrawn, so a number that exists in both is the "same" requirement by NIST's own
// numbering, even where its wording changed.

import official from "../../cmmc/src/shared/controls/official-text.json" with { type: "json" };
import rev3 from "../fixtures/nist-800-171r3/rev3-extract.json" with { type: "json" };
import { LEVEL2_PATH } from "./level2-requirements.mjs";
import { SHORT_NAME } from "./site.mjs";

export const REV3_PATH = "/nist-800-171-rev-2-vs-rev-3";
export const CROSSWALK_FILE = "nist-800-171-rev2-to-rev3-crosswalk.csv";

/** "3.1.1" -> "03.01.01" */
export const toRev3Id = (id) =>
  id
    .split(".")
    .map((p) => p.padStart(2, "0"))
    .join(".");

const R3 = new Map(rev3.requirements.map((r) => [r.id, r]));
const FAMILY_TITLE = new Map(rev3.families.map((f) => [f.id, f.title]));

/**
 * Each Rev. 2 requirement with its Rev. 3 fate.
 * @returns {{ rev2: string, rev2Text: string, rev3: string, family: string, fate: "kept" | "incorporated" | "addressed" | "withdrawn",
 *   title: string | null, into: string[], odps: number }[]}
 */
export function crosswalk() {
  return official.level2.map((r) => {
    const id = toRev3Id(r.nistId);
    const x = R3.get(id);
    if (!x) throw new Error(`Rev. 3 has no ${id}`);
    const into = x.incorporatedInto.length ? x.incorporatedInto : x.addressedBy;
    const fate = !x.withdrawn
      ? "kept"
      : x.incorporatedInto.length
        ? "incorporated"
        : x.addressedBy.length
          ? "addressed"
          : "withdrawn";
    return {
      rev2: r.nistId,
      rev2Text: r.text,
      rev3: id,
      family: x.family,
      fate,
      title: x.withdrawn ? null : x.title,
      into,
      odps: x.odps.length,
    };
  });
}

/** Rev. 3 requirements whose number Rev. 2 does not have. */
export function newInRev3() {
  const rev2 = new Set(official.level2.map((r) => toRev3Id(r.nistId)));
  return rev3.requirements.filter((r) => !rev2.has(r.id));
}

/** Every count the page states, computed from the data (pinned by the test). */
export function rev3Counts() {
  const cw = crosswalk();
  const active = rev3.requirements.filter((r) => !r.withdrawn);
  const by = (f) => cw.filter((c) => c.fate === f).length;
  const rev2Families = new Set(official.level2.map((r) => r.nistId.split(".")[1]));
  return {
    rev2: official.level2.length,
    rev2Families: rev2Families.size,
    rev2Objectives: official.level2.reduce((s, r) => s + r.objectives.length, 0),
    rev3: active.length,
    rev3Families: rev3.families.length,
    rev3Objectives: active.reduce((s, r) => s + r.objectives, 0),
    odps: active.reduce((s, r) => s + r.odps.length, 0),
    withOdps: active.filter((r) => r.odps.length).length,
    kept: by("kept"),
    withdrawn: cw.length - by("kept"),
    incorporated: by("incorporated"),
    addressed: by("addressed"),
    withdrawnOnly: by("withdrawn"),
    added: newInRev3().length,
    newFamilies: rev3.families.filter((f) => !rev2Families.has(String(Number(f.id.split(".")[1]))))
      .length,
  };
}

const csvCell = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

/** The crosswalk as CSV: every Rev. 2 requirement, then every requirement new in Rev. 3. */
export function crosswalkCsv() {
  const head = [
    "Rev 2 requirement",
    "Rev 2 text",
    "Rev 3 requirement",
    "Rev 3 family",
    "In Rev 3",
    "Rev 3 title",
    "Moved to (Rev 3)",
    "Organization-defined parameters",
  ];
  const fateText = {
    kept: "kept",
    incorporated: "withdrawn: incorporated into",
    addressed: "withdrawn: addressed by",
    withdrawn: "withdrawn",
  };
  const rows = crosswalk().map((c) => [
    c.rev2,
    c.rev2Text,
    c.rev3,
    FAMILY_TITLE.get(c.family),
    fateText[c.fate],
    c.title ?? "",
    c.into.join("; "),
    c.fate === "kept" ? c.odps : "",
  ]);
  for (const r of newInRev3())
    rows.push([
      "",
      "",
      r.id,
      FAMILY_TITLE.get(r.family),
      "new in Rev 3",
      r.title,
      "",
      r.odps.length,
    ]);
  // CRLF, as RFC 4180 and Excel expect.
  return `${[head, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

const esc = (s) =>
  String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const a3 = (id) => `<a href="${REV3_PATH}#r3-${id.replaceAll(".", "-")}">${id}</a>`;

function fateCell(c) {
  if (c.fate === "kept")
    return `Kept: ${esc(c.title)}${c.odps ? ` <span class="muted">(${c.odps} ODP${c.odps === 1 ? "" : "s"})</span>` : ""}`;
  if (c.fate === "incorporated") return `Withdrawn, incorporated into ${c.into.map(a3).join(", ")}`;
  if (c.fate === "addressed") return `Withdrawn, addressed by ${c.into.map(a3).join(", ")}`;
  return "Withdrawn (no requirement named in its place)";
}

function statementHtml(r) {
  return `<ul class="statement">${r.statement
    .map(
      (s) =>
        `<li${s.depth ? ` style="margin-left:${s.depth * 1.25}rem"` : ""}><span class="muted">${esc(s.label)}</span> ${esc(s.text)}</li>`,
    )
    .join("")}</ul>`;
}

/**
 * @param {{ cite: (id: string, text?: string) => string, statusBox: () => string,
 *   sourcesList: (ids: string[]) => string, cta: string }} h helpers from pages.mjs
 * @returns {import("./pages.mjs").Page}
 */
export function rev2VsRev3Page({ cite, statusBox, sourcesList, cta }) {
  const c = rev3Counts();
  const cw = crosswalk();
  const added = newInRev3();
  const faq = [
    {
      q: "Does CMMC Level 2 use NIST SP 800-171 Rev. 2 or Rev. 3?",
      a: `Rev. 2. 32 CFR 170.14(c)(3) says "The security requirements in CMMC Level 2 are identical to the requirements in NIST SP 800-171 R2", so a Level 2 self-assessment and the SPRS score are against the ${c.rev2} Rev. 2 requirements, not the ${c.rev3} of Rev. 3.`,
    },
    {
      q: "How many requirements are in NIST SP 800-171 Rev. 3?",
      a: `${c.rev3}, in ${c.rev3Families} families, against ${c.rev2} in ${c.rev2Families} families in Rev. 2. Rev. 3 withdraws ${c.withdrawn} of the Rev. 2 numbers (most folded into another requirement) and adds ${c.added} new numbers, ${added.filter((r) => Number(r.family.split(".")[1]) > 14).length} of them in ${c.newFamilies} new families: Planning, System and Services Acquisition, and Supply Chain Risk Management.`,
    },
    {
      q: "What are organization-defined parameters (ODPs)?",
      a: `Blanks in a Rev. 3 requirement that the organization (or, for a contract, the agency) fills in, such as how often to review the inventory or how long before an inactive account is disabled. Rev. 3 has ${c.odps} of them across ${c.withOdps} requirements. Rev. 2 has none, which is one reason Rev. 3 takes more writing down.`,
    },
    {
      q: "Should my shop start on Rev. 3 now?",
      a: "Not for CMMC. Your score, SPRS entry and POA&M rules are all Rev. 2. Rev. 3 is still useful to read: where it splits a Rev. 2 requirement into parts, the parts are a fair checklist of what an assessor will ask to see, and the crosswalk below shows which Rev. 2 evidence would carry over if the rule ever moved.",
    },
    {
      q: "Is there a Rev. 2 to Rev. 3 crosswalk I can download?",
      a: `Yes, as a CSV built from NIST's own OSCAL catalog: every Rev. 2 requirement with its Rev. 3 number and what happened to it, then the ${c.added} new Rev. 3 requirements. It opens in Excel or Google Sheets.`,
    },
  ];
  const famRows = rev3.families
    .map((f) => {
      const n = Number(f.id.split(".")[1]);
      const r2 = official.level2.filter((r) => Number(r.nistId.split(".")[1]) === n).length;
      const reqs = rev3.requirements.filter((r) => r.family === f.id && !r.withdrawn);
      return `    <tr><th scope="row">${esc(f.title)} (${f.id})</th><td>${r2 || "new family"}</td><td>${reqs.length}</td><td>${reqs.reduce((s, r) => s + r.odps.length, 0)}</td></tr>`;
    })
    .join("\n");
  return {
    path: REV3_PATH,
    kind: "faq",
    title: `NIST 800-171 Rev 2 vs Rev 3: every requirement mapped · ${SHORT_NAME}`,
    description: `NIST 800-171 Rev. 2 vs Rev. 3 from NIST's catalog: ${c.kept} kept, ${c.withdrawn} withdrawn and where each went, ${c.added} new, ${c.odps} ODPs. Why CMMC still uses Rev. 2. Free CSV.`,
    changefreq: "monthly",
    priority: 0.8,
    faq,
    body: `<h1>NIST SP 800-171 Rev. 2 vs Rev. 3: every requirement mapped</h1>
<p class="lead">Rev. 3 has ${c.rev3} requirements in ${c.rev3Families} families; Rev. 2 has ${c.rev2} in ${c.rev2Families}. Of the
${c.rev2} Rev. 2 requirements, ${c.kept} keep their number in Rev. 3 and ${c.withdrawn} are withdrawn, most of them folded into
another requirement; Rev. 3 adds ${c.added} new ones and ${c.odps} organization-defined parameters. Below is every
requirement, mapped from ${cite("nist-800-171r3-oscal", "NIST's own machine-readable catalog of Rev. 3")}, and a
<a href="/${CROSSWALK_FILE}" download>free CSV crosswalk</a>.</p>
${statusBox()}
<h2>For CMMC, Rev. 2 is still the one that counts</h2>
<p>The CMMC rule says it plainly: "The security requirements in CMMC Level 2 are identical to the requirements in NIST SP
800-171 R2" (${cite("cfr-170-14", "32 CFR 170.14(c)(3)")}). So a Level 2 self-assessment, the SPRS score and the
POA&amp;M rules are all about the <a href="${LEVEL2_PATH}">${c.rev2} Rev. 2 requirements and their ${c.rev2Objectives} objectives</a>.
DFARS 252.204-7012, on its own, points at the version of SP 800-171 "in effect at the time the solicitation is issued",
unless the contracting officer allows otherwise (${cite("dfars-7012", "DFARS 252.204-7012(b)(2)(i)")}); a CMMC contract adds the
Part 170 rule on top. If a solicitation or your prime names Rev. 3, ask the contracting officer which one applies: this
page cannot answer that for a particular contract.</p>
<h2>What changed, in numbers</h2>
<ul>
  <li><strong>${c.kept} kept.</strong> The same number in both (Rev. 2's 3.1.1 is Rev. 3's 03.01.01). Many are reworded and
  split into lettered parts, so "kept" means NIST kept the number, not the wording.</li>
  <li><strong>${c.incorporated} incorporated into another requirement</strong> and ${c.addressed} <strong>addressed by others</strong>,
  as the catalog links them. ${c.withdrawnOnly} more are withdrawn with no requirement named in their place.</li>
  <li><strong>${c.added} new numbers</strong>, including ${c.newFamilies} new families. Some take over part of a Rev. 2
  requirement: Rev. 2's 3.4.1 covers "baseline configurations and inventories", and Rev. 3 gives the inventory its own
  ${a3("03.04.10")}.</li>
  <li><strong>${c.odps} organization-defined parameters</strong> in ${c.withOdps} requirements: frequencies, time periods and
  lists the organization fills in. Rev. 2 has none.</li>
  <li><strong>${c.rev3Objectives} determination statements</strong> in Rev. 3's assessment procedures, against Rev. 2's
  ${c.rev2Objectives} objectives.</li>
</ul>
<div class="table-wrap"><table>
  <caption>Family by family</caption>
  <thead><tr><th scope="col">Family</th><th scope="col">Rev. 2 requirements</th><th scope="col">Rev. 3 requirements</th><th scope="col">Rev. 3 ODPs</th></tr></thead>
  <tbody>
${famRows}
    <tr><th scope="row">All families</th><td>${c.rev2}</td><td>${c.rev3}</td><td>${c.odps}</td></tr>
  </tbody>
</table></div>
<h2>Every Rev. 2 requirement in Rev. 3</h2>
<p>Rev. 2 text word for word from ${cite("nist-800-171r2", "NIST SP 800-171 Rev. 2")}; Rev. 3 titles and links from
${cite("nist-800-171r3-oscal", "NIST's OSCAL catalog of Rev. 3")} (version ${esc(rev3.catalogVersion)}, read
${esc(rev3.readOn)}). Download it all as <a href="/${CROSSWALK_FILE}" download>a CSV</a>.</p>
<div class="table-wrap"><table>
  <thead><tr><th scope="col">Rev. 2</th><th scope="col">Rev. 2 requirement</th><th scope="col">Rev. 3</th></tr></thead>
  <tbody>
${cw
  .map(
    (r) =>
      `    <tr><th scope="row">${r.rev2}</th><td>${esc(r.rev2Text)}</td><td>${r.fate === "kept" ? a3(r.rev3) : r.rev3}: ${fateCell(r)}</td></tr>`,
  )
  .join("\n")}
  </tbody>
</table></div>
<h2>The ${c.added} requirements new in Rev. 3</h2>
<p>Each word for word from NIST's catalog; "[Assignment: ...]" marks a parameter the organization sets.</p>
${added
  .map(
    (r) => `<section class="requirement" id="r3-${r.id.replaceAll(".", "-")}">
<h3>${r.id} ${esc(r.title)}</h3>
<p class="muted">${esc(FAMILY_TITLE.get(r.family))} · ${r.odps.length} ODP${r.odps.length === 1 ? "" : "s"} · ${r.objectives} determination statement${r.objectives === 1 ? "" : "s"}</p>
${statementHtml(r)}
</section>`,
  )
  .join("\n")}
<h2>The requirements other Rev. 2 numbers moved into</h2>
<p>Where the table above says a Rev. 2 requirement was incorporated into or addressed by a Rev. 3 one, here is that Rev. 3
requirement's text.</p>
${[...new Set(cw.filter((r) => r.fate !== "kept").flatMap((r) => r.into))]
  .filter((id) => !added.some((n) => n.id === id))
  .sort()
  .map((id) => {
    const r = R3.get(id);
    const own = cw.find((x) => x.rev3 === id && x.fate === "kept");
    const from = cw.filter((x) => x.into.includes(id)).map((x) => x.rev2);
    return `<section class="requirement" id="r3-${id.replaceAll(".", "-")}">
<h3>${id} ${esc(r.title)}</h3>
<p class="muted">${own ? `Rev. 2 ${own.rev2} under the same number, and takes in` : "Takes in"} Rev. 2 ${from.join(", ")} · ${r.odps.length} ODP${r.odps.length === 1 ? "" : "s"}</p>
${statementHtml(r)}
</section>`;
  })
  .join("\n")}
<h2>Common questions</h2>
${faq.map((f) => `<details><summary>${f.q}</summary><p>${esc(f.a)}</p></details>`).join("\n")}
<section class="sibling">
  <h2>Work to the version your contract assesses</h2>
  <p>${SHORT_NAME}'s Level 2 plan keeps the ${c.rev2} Rev. 2 requirements with their objectives, status, owner and evidence,
  builds the SSP and POA&amp;M from them and keeps the SPRS score current. It does not decide what is met or submit
  anything to SPRS: your senior official does. Score yourself first with the free <a href="/sprs-score-calculator">SPRS
  score calculator</a>.</p>
</section>
${sourcesList(["nist-800-171r3-oscal", "nist-800-171r2", "cfr-170-14", "dfars-7012"])}
${cta}`,
  };
}
