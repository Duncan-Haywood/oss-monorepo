// Minimal, valid OOXML (WordprocessingML) package built by hand and zipped with fflate.
// Parts: [Content_Types].xml, _rels/.rels, word/document.xml, word/styles.xml, word/footer1.xml,
// word/_rels/document.xml.rels, docProps/core.xml, docProps/app.xml. Every piece of user text goes
// through escapeXml (which also strips characters that are illegal in XML 1.0).
import { strToU8, zipSync } from "fflate";
import { formatCents } from "../submission/package";
import { budgetDocx } from "./budget";
import {
  buildExportModel,
  charCountLabel,
  type ExportInput,
  type ExportModel,
  type ExportOptions,
  type ExportRun,
  type ExportSection,
  markerText,
  paragraphsOf,
  wordCountLabel,
} from "./model";
import { escapeXml, formatLongDate } from "./text";

export const DOCX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS_W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

// ------------------------------------------------------------------------------- XML builders

interface RunProps {
  style?: string;
  bold?: boolean;
  italic?: boolean;
  color?: string;
}

function rPr(p: RunProps): string {
  const parts = [
    p.style ? `<w:rStyle w:val="${p.style}"/>` : "",
    p.bold ? "<w:b/>" : "",
    p.italic ? "<w:i/>" : "",
    p.color ? `<w:color w:val="${p.color}"/>` : "",
  ].join("");
  return parts ? `<w:rPr>${parts}</w:rPr>` : "";
}

/** A run; "\n" becomes a line break and "\t" a tab so the XML text stays clean. */
export function run(text: string, props: RunProps = {}): string {
  const body: string[] = [];
  text.split("\n").forEach((line, i) => {
    if (i > 0) body.push("<w:br/>");
    line.split("\t").forEach((segment, j) => {
      if (j > 0) body.push("<w:tab/>");
      if (segment) body.push(`<w:t xml:space="preserve">${escapeXml(segment)}</w:t>`);
    });
  });
  return `<w:r>${rPr(props)}${body.join("")}</w:r>`;
}

interface ParaProps {
  style?: string;
  pageBreakBefore?: boolean;
  keepNext?: boolean;
  align?: "center" | "left";
}

function para(runs: string, p: ParaProps = {}): string {
  const pPr = [
    p.style ? `<w:pStyle w:val="${p.style}"/>` : "",
    p.keepNext ? "<w:keepNext/>" : "",
    p.pageBreakBefore ? "<w:pageBreakBefore/>" : "",
    p.align ? `<w:jc w:val="${p.align}"/>` : "",
  ].join("");
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ""}${runs}</w:p>`;
}

const labelled = (label: string, value: string) =>
  para(run(`${label}: `, { bold: true }) + run(value), { style: "Meta" });

const bullet = (text: string, style = "ListBulleted") => para(run(`•\t${text}`), { style });

function claimRuns(runs: ExportRun[]): string {
  return runs
    .map(
      (r, i) =>
        run(i > 0 ? ` ${r.text}` : r.text) +
        (r.cites.length ? run(markerText(r.cites), { style: "CitationMark" }) : ""),
    )
    .join("");
}

// ------------------------------------------------------------------------------- document.xml

function titlePage(m: ExportModel): string[] {
  const out = [
    para("", { style: "TitleSpacer" }),
    para(run(m.title), { style: "Title" }),
    para(run(m.labels.subtitle ?? `Application to ${m.funderName}`), { style: "Subtitle" }),
    labelled("Applicant", m.org.legalName + (m.org.dba ? ` (DBA ${m.org.dba})` : "")),
    labelled("EIN", m.org.ein || "Not provided"),
  ];
  if (m.org.uei) out.push(labelled("UEI", m.org.uei));
  out.push(
    labelled("Funder", m.funderName),
    labelled(
      m.labels.opportunity,
      m.opportunityTitle + (m.opportunityNumber ? ` (${m.opportunityNumber})` : ""),
    ),
    labelled(m.labels.deadline, formatLongDate(m.deadline)),
  );
  if (m.requestedAmountCents !== null) {
    out.push(labelled(m.labels.amount, formatCents(m.requestedAmountCents)));
  }
  out.push(
    m.funder
      ? labelled("Date", formatLongDate(m.generatedAt))
      : labelled("Draft", `Version ${m.versionNumber}, exported ${formatLongDate(m.generatedAt)}`),
  );
  return out;
}

function coverPage(cover: NonNullable<ExportModel["cover"]>): string[] {
  const out = [
    para(run("Reviewer cover page"), { style: "Heading1", pageBreakBefore: true }),
    para(run("Internal: for reviewers only. Remove this page before submitting."), {
      style: "InternalNote",
    }),
    para(run("Executive summary"), { style: "Heading2" }),
  ];
  const summary = paragraphsOf(cover.executiveSummary);
  if (summary.length === 0) out.push(para(run("No executive summary."), { style: "Gap" }));
  for (const p of summary) out.push(para(run(p)));
  out.push(para(run("Key points"), { style: "Heading2" }));
  if (cover.keyPoints.length === 0) out.push(para(run("No key points."), { style: "Gap" }));
  for (const k of cover.keyPoints) out.push(bullet(k));
  return out;
}

function sectionBody(s: ExportSection, first: boolean, funder: boolean): string[] {
  const out = [para(run(s.title), { style: "Heading1", pageBreakBefore: first })];
  if (s.prompt) out.push(para(run(s.prompt), { style: "Prompt" }));
  for (const runs of s.paragraphs) out.push(para(claimRuns(runs)));
  if (funder) return out; // the answer only: no gaps, no counts
  if (s.paragraphs.length === 0) {
    out.push(para(run("No answer drafted for this section yet."), { style: "Gap" }));
  }
  if (s.gaps.length) {
    out.push(para(run("Still needed before submitting:", { bold: true }), { style: "Gap" }));
    for (const g of s.gaps) out.push(bullet(g, "GapItem"));
  }
  const over = s.overWordLimit || s.overCharLimit;
  const counts = [wordCountLabel(s), charCountLabel(s)].filter(Boolean).join("  ·  ");
  out.push(
    para(run(counts) + (over ? run("  — over limit", { bold: true, color: "B00020" }) : ""), {
      style: "WordCount",
    }),
  );
  return out;
}

function citationsAppendix(m: ExportModel): string[] {
  const out = [
    para(run("Citations"), { style: "Heading1", pageBreakBefore: true }),
    para(
      run(
        `Each [n] marker cites a fact from ${m.org.legalName || "the organization"}'s fact base.`,
      ),
      { style: "WordCount" },
    ),
  ];
  if (!m.citations?.length) out.push(para(run("No claims cite facts."), { style: "Gap" }));
  for (const c of m.citations ?? []) {
    out.push(
      para(
        run(`[${c.n}]\t`, { bold: true }) +
          run(c.statement ?? `Fact ${c.factId} is no longer available.`),
        { style: "CitationEntry" },
      ),
    );
    if (c.sourceQuote) {
      out.push(para(run(`Source: “${c.sourceQuote}”`), { style: "SourceQuote" }));
    }
  }
  return out;
}

export function documentXml(m: ExportModel): string {
  const body = [
    ...titlePage(m),
    ...(m.cover ? coverPage(m.cover) : []),
    ...m.sections.flatMap((s, i) => sectionBody(s, i === 0, m.funder)),
    ...(m.budget ? budgetDocx(m.budget, m.funder) : []),
    ...(m.citations ? citationsAppendix(m) : []),
  ];
  // US Letter, 1" margins; titlePg = no footer on the title page.
  const sectPr =
    `<w:sectPr><w:footerReference w:type="default" r:id="rId2"/>` +
    `<w:pgSz w:w="12240" w:h="15840"/>` +
    `<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>` +
    `<w:titlePg/></w:sectPr>`;
  return `${XML_DECL}<w:document xmlns:w="${NS_W}" xmlns:r="${NS_R}"><w:body>${body.join("")}${sectPr}</w:body></w:document>`;
}

function footerXml(m: ExportModel): string {
  const field = (instr: string) =>
    `<w:r><w:fldChar w:fldCharType="begin"/></w:r>` +
    `<w:r><w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r>` +
    `<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r>` +
    `<w:r><w:fldChar w:fldCharType="end"/></w:r>`;
  const label = [m.org.legalName, m.title].filter(Boolean).join(" — ");
  return `${XML_DECL}<w:ftr xmlns:w="${NS_W}" xmlns:r="${NS_R}">${para(
    `${run(`${label}  ·  Page `)}${field("PAGE")}${run(" of ")}${field("NUMPAGES")}`,
    { style: "Footer", align: "center" },
  )}</w:ftr>`;
}

// ------------------------------------------------------------------------------- styles.xml

const paraStyle = (
  id: string,
  name: string,
  pPr: string,
  rPrXml: string,
  extra: { basedOn?: string; next?: string; default?: boolean; outline?: number } = {},
) =>
  `<w:style w:type="paragraph" w:styleId="${id}"${extra.default ? ' w:default="1"' : ""}>` +
  `<w:name w:val="${name}"/>${extra.basedOn ? `<w:basedOn w:val="${extra.basedOn}"/>` : ""}` +
  `${extra.next ? `<w:next w:val="${extra.next}"/>` : ""}<w:qFormat/>` +
  `<w:pPr>${pPr}${extra.outline !== undefined ? `<w:outlineLvl w:val="${extra.outline}"/>` : ""}</w:pPr>` +
  `<w:rPr>${rPrXml}</w:rPr></w:style>`;

const FONT = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/>';
const HEADING_FONT =
  '<w:rFonts w:ascii="Calibri Light" w:hAnsi="Calibri Light" w:eastAsia="Calibri Light" w:cs="Calibri Light"/>';

export function stylesXml(): string {
  const styles = [
    paraStyle("Normal", "Normal", "", "", { default: true }),
    paraStyle(
      "Title",
      "Title",
      '<w:spacing w:after="240"/><w:contextualSpacing/>',
      `${HEADING_FONT}<w:color w:val="1F3864"/><w:kern w:val="28"/><w:sz w:val="52"/><w:szCs w:val="52"/>`,
      { basedOn: "Normal", next: "Normal" },
    ),
    paraStyle(
      "Subtitle",
      "Subtitle",
      '<w:spacing w:after="480"/>',
      '<w:color w:val="595959"/><w:sz w:val="28"/><w:szCs w:val="28"/>',
      { basedOn: "Normal", next: "Normal" },
    ),
    paraStyle(
      "Heading1",
      "heading 1",
      '<w:keepNext/><w:keepLines/><w:spacing w:before="360" w:after="120"/>',
      `${HEADING_FONT}<w:color w:val="1F3864"/><w:sz w:val="32"/><w:szCs w:val="32"/>`,
      { basedOn: "Normal", next: "Normal", outline: 0 },
    ),
    paraStyle(
      "Heading2",
      "heading 2",
      '<w:keepNext/><w:keepLines/><w:spacing w:before="240" w:after="80"/>',
      `${HEADING_FONT}<w:color w:val="2F5496"/><w:sz w:val="26"/><w:szCs w:val="26"/>`,
      { basedOn: "Normal", next: "Normal", outline: 1 },
    ),
    paraStyle(
      "Prompt",
      "Funder Prompt",
      '<w:keepNext/><w:pBdr><w:left w:val="single" w:sz="12" w:space="8" w:color="BFBFBF"/></w:pBdr><w:ind w:left="240"/>',
      '<w:i/><w:iCs/><w:color w:val="404040"/>',
      { basedOn: "Normal", next: "Normal" },
    ),
    paraStyle(
      "WordCount",
      "Word Count",
      '<w:spacing w:before="60" w:after="240"/>',
      '<w:color w:val="595959"/><w:sz w:val="18"/><w:szCs w:val="18"/>',
      { basedOn: "Normal", next: "Normal" },
    ),
    paraStyle("Meta", "Title Page Detail", '<w:spacing w:after="80"/>', "", {
      basedOn: "Normal",
    }),
    paraStyle("TitleSpacer", "Title Page Spacer", '<w:spacing w:before="2400" w:after="0"/>', "", {
      basedOn: "Normal",
    }),
    paraStyle(
      "ListBulleted",
      "List Bulleted",
      '<w:spacing w:after="60"/><w:ind w:left="360" w:hanging="360"/>',
      "",
      { basedOn: "Normal" },
    ),
    paraStyle("Gap", "Unanswered", '<w:spacing w:after="60"/>', '<w:color w:val="9C5700"/>', {
      basedOn: "Normal",
    }),
    paraStyle("GapItem", "Unanswered Item", '<w:ind w:left="360" w:hanging="360"/>', "", {
      basedOn: "Gap",
    }),
    paraStyle(
      "InternalNote",
      "Internal Note",
      '<w:shd w:val="clear" w:color="auto" w:fill="FFF2CC"/><w:spacing w:after="240"/>',
      '<w:b/><w:color w:val="7F6000"/>',
      { basedOn: "Normal" },
    ),
    paraStyle(
      "CitationEntry",
      "Citation Entry",
      '<w:keepNext/><w:spacing w:before="120" w:after="40"/><w:ind w:left="567" w:hanging="567"/>',
      "",
      { basedOn: "Normal" },
    ),
    paraStyle(
      "SourceQuote",
      "Citation Source",
      '<w:spacing w:after="80"/><w:ind w:left="567"/>',
      '<w:i/><w:iCs/><w:color w:val="595959"/><w:sz w:val="20"/><w:szCs w:val="20"/>',
      { basedOn: "Normal" },
    ),
    paraStyle(
      "Footer",
      "footer",
      '<w:spacing w:after="0"/>',
      '<w:color w:val="7F7F7F"/><w:sz w:val="18"/><w:szCs w:val="18"/>',
      { basedOn: "Normal" },
    ),
    `<w:style w:type="character" w:styleId="CitationMark"><w:name w:val="Citation Mark"/>` +
      `<w:rPr><w:color w:val="595959"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>`,
  ];
  return (
    `${XML_DECL}<w:styles xmlns:w="${NS_W}">` +
    `<w:docDefaults><w:rPrDefault><w:rPr>${FONT}<w:sz w:val="22"/><w:szCs w:val="22"/>` +
    `<w:lang w:val="en-US" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>` +
    `<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault>` +
    `</w:docDefaults>${styles.join("")}</w:styles>`
  );
}

// ------------------------------------------------------------------------------- package parts

const CONTENT_TYPES =
  `${XML_DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
  `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
  `<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>` +
  `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
  `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>` +
  `</Types>`;

const ROOT_RELS =
  `${XML_DECL}<Relationships xmlns="${NS_PKG_REL}">` +
  `<Relationship Id="rId1" Type="${REL_TYPE}/officeDocument" Target="word/document.xml"/>` +
  `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
  `<Relationship Id="rId3" Type="${REL_TYPE}/extended-properties" Target="docProps/app.xml"/>` +
  `</Relationships>`;

const DOCUMENT_RELS =
  `${XML_DECL}<Relationships xmlns="${NS_PKG_REL}">` +
  `<Relationship Id="rId1" Type="${REL_TYPE}/styles" Target="styles.xml"/>` +
  `<Relationship Id="rId2" Type="${REL_TYPE}/footer" Target="footer1.xml"/>` +
  `</Relationships>`;

const w3cdtf = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

function coreXml(m: ExportModel): string {
  const when = w3cdtf(m.generatedAt);
  return (
    `${XML_DECL}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ` +
    `xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ` +
    `xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    `<dc:title>${escapeXml(m.title)}</dc:title>` +
    `<dc:subject>${escapeXml(`${m.funderName}: ${m.opportunityTitle}`)}</dc:subject>` +
    `<dc:creator>${escapeXml(m.org.legalName)}</dc:creator>` +
    `<cp:lastModifiedBy>Grant Autopilot</cp:lastModifiedBy>` +
    `<cp:revision>${m.versionNumber}</cp:revision>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${when}</dcterms:created>` +
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${when}</dcterms:modified>` +
    `</cp:coreProperties>`
  );
}

function appXml(m: ExportModel): string {
  return (
    `${XML_DECL}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ` +
    `xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">` +
    `<Application>Grant Autopilot</Application><DocSecurity>0</DocSecurity>` +
    `<Words>${m.totalWords}</Words><Company>${escapeXml(m.org.legalName)}</Company>` +
    `<AppVersion>1.0000</AppVersion></Properties>`
  );
}

/** Every part of the package as XML strings (exposed for tests). */
export function docxParts(m: ExportModel): Record<string, string> {
  return {
    "[Content_Types].xml": CONTENT_TYPES,
    "_rels/.rels": ROOT_RELS,
    "word/document.xml": documentXml(m),
    "word/styles.xml": stylesXml(),
    "word/footer1.xml": footerXml(m),
    "word/_rels/document.xml.rels": DOCUMENT_RELS,
    "docProps/core.xml": coreXml(m),
    "docProps/app.xml": appXml(m),
  };
}

/** The .docx bytes for one application version. */
export function buildApplicationDocx(input: ExportInput, options: ExportOptions = {}): Uint8Array {
  const model = buildExportModel(input, options);
  const files: Record<string, Uint8Array> = {};
  for (const [path, xml] of Object.entries(docxParts(model))) files[path] = strToU8(xml);
  // Zip timestamps must be >= 1980; use the export time so the archive is reproducible.
  return zipSync(files, { level: 6, mtime: model.generatedAt });
}
