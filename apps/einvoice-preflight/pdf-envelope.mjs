// Checks on the PDF around a Factur-X / ZUGFeRD / XRechnung invoice, not on the
// XML inside it: the PDF/A-3 marker, the attachment's name and AFRelationship,
// and whether the XMP profile (fx:ConformanceLevel) agrees with the XML's
// guideline ID. A regex read of the raw file, like facturx.mjs: no renderer,
// no PDF/A validator (veraPDF still unrun).

const LATIN1 = new TextDecoder("latin1");
const STANDARD_NAMES = ["factur-x.xml", "zugferd-invoice.xml", "xrechnung.xml"];
const RELATIONSHIPS = ["Data", "Source", "Alternative", "Supplement", "Unspecified"];

const finding = (rule, message, fix, path, severity) => ({ rule, message, fix, path, ...(severity ? { severity } : {}) });

// Profile names as the XMP writes them and as the guideline ID spells them.
export function profileFromXmp(value) {
  const key = String(value || "").toUpperCase().replace(/[\s_-]+/g, "");
  return { MINIMUM: "minimum", BASICWL: "basicwl", BASIC: "basic", EN16931: "en16931", COMFORT: "en16931", EXTENDED: "extended", XRECHNUNG: "xrechnung" }[key] || "";
}

export function profileFromGuideline(id) {
  const text = String(id || "").toLowerCase();
  if (!text) return "";
  if (text.includes("xrechnung")) return "xrechnung";
  if (text.includes("factur-x.eu:1p0:minimum")) return "minimum";
  if (text.includes("factur-x.eu:1p0:basicwl")) return "basicwl";
  if (text.includes("factur-x.eu:1p0:basic")) return "basic";
  if (text.includes("factur-x.eu:1p0:extended")) return "extended";
  if (text.includes("en16931")) return "en16931";
  return "";
}

export function checkPdfEnvelope(pdf, xml = "") {
  const text = LATIN1.decode(pdf instanceof Uint8Array ? pdf : new Uint8Array(pdf));
  const out = [];

  const part = text.match(/pdfaid:part(?:>|\s*=\s*["'])\s*(\d)/);
  if (!part || part[1] !== "3") {
    out.push(finding("PDF-001", part ? `The PDF declares PDF/A-${part[1]}, but Factur-X and ZUGFeRD need PDF/A-3 to carry an attachment.` : "The PDF has no PDF/A-3 marker in its XMP metadata.", "Export the PDF as PDF/A-3 (most accounting tools have this as an option) so receivers accept the embedded XML.", "/pdf/xmp", "note"));
  }

  const attachment = [...text.matchAll(/\/Type\s*\/Filespec\b[\s\S]{0,600}?endobj|obj\s*<<[^>]*?\/Type\s*\/Filespec\b[\s\S]*?endobj/g)].map((m) => m[0]);
  const names = attachment.map((d) => d.match(/\/UF\s*\(([^)]*)\)|\/F\s*\(([^)]*)\)/)).filter(Boolean).map((m) => (m[1] ?? m[2]).trim());
  const standard = names.find((n) => STANDARD_NAMES.includes(n.toLowerCase()));
  if (names.length && !standard) {
    out.push(finding("PDF-002", `The attached file is named "${names[0]}"; Factur-X, ZUGFeRD and XRechnung receivers look for factur-x.xml, zugferd-invoice.xml or xrechnung.xml.`, "Rename the embedded file to factur-x.xml (or zugferd-invoice.xml for ZUGFeRD 2.0 files) and export again.", "/pdf/attachment"));
  }

  const spec = attachment.find((d) => !standard || d.includes(`(${standard})`)) || "";
  if (spec) {
    const rel = spec.match(/\/AFRelationship\s*\/(\w+)/);
    if (!rel || !RELATIONSHIPS.includes(rel[1])) {
      out.push(finding("PDF-003", rel ? `The attachment's AFRelationship is /${rel[1]}, which PDF/A-3 does not define.` : "The attachment has no AFRelationship entry, which PDF/A-3 requires on an associated file.", "Set AFRelationship to /Data (or /Alternative) on the embedded file's file specification.", "/pdf/attachment/AFRelationship", "note"));
    }
  }

  if (attachment.length) {
    const embedded = [...text.matchAll(/<<[^<>]*\/Type\s*\/EmbeddedFile\b[^<>]*>>|<<[^<>]*\/Subtype\s*\/[^\s/>]+[^<>]*\/Type\s*\/EmbeddedFile\b[^<>]*>>/g)].map((m) => m[0]);
    if (embedded.length && embedded.every((d) => !/\/Subtype\s*\//.test(d))) {
      out.push(finding("PDF-005", "The embedded file's stream has no /Subtype (its MIME type); PDF/A-3 requires one, written /text#2Fxml for XML.", "Set the embedded file's Subtype to /text#2Fxml when attaching the XML.", "/pdf/attachment/Subtype", "note"));
    }
    // Only a catalog in plain text is read: one inside a compressed object stream is not visible here.
    const catalog = text.match(/<<[^<>]*\/Type\s*\/Catalog\b[\s\S]*?>>\s*endobj/);
    if (catalog && !/\/AF\s*[\[\d]/.test(catalog[0])) {
      out.push(finding("PDF-006", "The document catalog has no /AF array listing the attachment, which PDF/A-3 expects for an associated file.", "Re-export with the XML attached as an associated file, so the catalog's /AF array names it.", "/pdf/catalog/AF", "note"));
    }
  }

  const level = text.match(/fx:ConformanceLevel(?:>|\s*=\s*["'])\s*([^<"']+)/);
  const fromXmp = level ? profileFromXmp(level[1]) : "";
  const guideline = String(xml).match(/GuidelineSpecifiedDocumentContextParameter[\s\S]*?<[\w:]*ID[^>]*>([^<]+)</);
  const fromXml = guideline ? profileFromGuideline(guideline[1]) : "";
  if (fromXmp && fromXml && fromXmp !== fromXml) {
    out.push(finding("PDF-004", `The PDF's metadata says the profile is ${level[1].trim()}, but the invoice XML declares ${guideline[1].trim()}.`, "Make the XMP fx:ConformanceLevel and the XML's guideline ID name the same profile; regenerate the PDF from one source.", "/pdf/xmp/ConformanceLevel"));
  }
  return out;
}
