// Structure and value checks for a Polish KSeF FA(3) invoice, read from the
// Ministry of Finance schema (schemat_FA(3)_v1-0E.xsd) by build-fa3-schema.mjs.
// The XSD is the first gate KSeF applies; a file that fails it is refused before
// any business rule.
//   PL-012 an element the schema does not allow here, or one too many
//   PL-013 elements out of sequence, or content the schema's model cannot place
//   PL-014 a required element missing
//   PL-015 a value outside its length / pattern / range / digits / code list
//   PL-016 a required attribute missing or a fixed one with another value
//   PL-017 the XML is not well formed (a cut-off file, a mismatched tag)
// Messages name the element and the reason and never echo the value.
import schema from "./fa3-xsd-data.mjs";
import { wellFormed } from "./fatturapa-xsd.mjs";
import { makeSchemaChecker } from "./xsd-check.mjs";

const finding = (rule, message, fix, path) => ({ rule, message, fix, path });

const checkFa3 = makeSchemaChecker(schema, {
  codes: { extra: "PL-012", order: "PL-013", missing: "PL-014", value: "PL-015", attr: "PL-016" },
  authority: "KSeF", format: "FA(3)",
});

/** @param root the Faktura node from parseXmlTree */
export function checkAgainstFa3Schema(root, text) {
  const out = [];
  if (text && !wellFormed(text)) {
    out.push(finding("PL-017", "The XML is not well formed: a tag is never closed or closes out of order, which is what a cut-off file looks like.",
      "Re-export the file; if it was edited by hand, close every tag in the order it was opened.", "/Faktura"));
    return out;
  }
  out.push(...checkFa3(root, "/Faktura"));
  return out;
}
