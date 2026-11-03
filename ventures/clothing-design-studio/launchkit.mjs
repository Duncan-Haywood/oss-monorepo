/**
 * The launch kit: drafts the designer edits before anything goes out.
 * A product description, social captions, hashtags, a size-run summary and
 * a store import file. Built from the design's own facts, so it never says
 * anything the design does not support (no "limited edition" unless the run
 * really is small, no "organic" unless the fabric is).
 *
 * Nothing is posted anywhere. Publishing is the designer's step.
 */

import { GARMENTS, FABRICS, METHODS } from "./catalogue.mjs";
import { MOTIFS } from "./motifs.mjs";
import { SIZES } from "./design.mjs";

const slug = s => String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "design";

function facts(design) {
  const g = GARMENTS[design.garment];
  const f = FABRICS[design.fabric];
  const methods = [...new Set(design.placements.map(p => p.method))].map(m => METHODS[m]);
  const raised = methods.some(m => m?.raised);
  const motifs = design.placements.filter(p => p.kind === "motif").map(p => MOTIFS[p.motif]?.label.toLowerCase()).filter(Boolean);
  const words = design.placements.filter(p => p.kind === "text").map(p => p.text);
  const hasBack = design.placements.some(p => p.area === "back");
  return { g, f, methods, raised, motifs, words, hasBack, small: design.quantity <= 100 };
}

export function productDescription(design) {
  const { g, f, methods, raised, motifs, words, hasBack, small } = facts(design);
  const parts = [];
  parts.push(`${design.name}: a ${design.colourName} ${g.label.toLowerCase()} in ${design.gsm} gsm ${f.label.toLowerCase()} (${f.composition}).`);
  if (methods.length) {
    const how = methods.map(m => m.label.toLowerCase()).join(" and ");
    const what = [...motifs, ...words.map(w => `"${w}"`)].join(", ");
    parts.push(`${what ? `${capital(what)}, ` : "The artwork is "}${what ? "finished in" : ""} ${how}${raised ? ", raised off the fabric so you can feel it" : ""}${hasBack ? ", front and back" : ""}.`.replace(/\s+/g, " ").replace(" .", "."));
  }
  if (design.gsm >= 220) parts.push("A heavy fabric with structure, so it holds its shape.");
  if (small) parts.push(`Made in a run of ${design.quantity}.`);
  parts.push("Unisex fit. Sizes " + SIZES.filter(s => design.sizes[s]).join(", ") + ".");
  return parts.join(" ");
}

export function captions(design) {
  const { g, raised, motifs, words, small } = facts(design);
  const subject = motifs[0] ?? (words[0] ? `"${words[0]}"` : "the new design");
  return [
    `${capital(subject)} on ${design.colourName}. ${raised ? "Raised so it catches the light." : "Made to be worn, not just looked at."} Link in bio.`,
    `New: ${design.name}. ${design.gsm} gsm ${g.label.toLowerCase()}${small ? `, ${design.quantity} made` : ""}.`,
    `Behind the design: why ${subject} and why ${design.colourName}. Tell us which colour we should do next.`,
  ];
}

export function hashtags(design) {
  const { g, f, raised, motifs } = facts(design);
  const tags = new Set(["#streetwear", "#unisexfashion", "#independentbrand"]);
  if (g.id === "hoodie") tags.add("#hoodie");
  if (g.id === "tee" || g.id === "longsleeve") tags.add("#graphictee");
  if (g.id === "crewneck") tags.add("#sweatshirt");
  if (design.gsm >= 220) tags.add("#heavyweight");
  if (f.id === "organic-cotton") tags.add("#organiccotton");
  if (raised) tags.add("#puffprint");
  if (motifs.some(m => /halo|cross|wings|angel/.test(m))) { tags.add("#sacredart"); tags.add("#christianapparel"); }
  if (motifs.some(m => /laurel|crown/.test(m))) tags.add("#classicalart");
  return [...tags];
}

const csvCell = v => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * A product import file in the shape of Shopify's product CSV (one row per
 * size). Check it against the store's current template before importing.
 */
export function storeCsv(design) {
  const handle = slug(design.name);
  const header = ["Handle", "Title", "Body (HTML)", "Vendor", "Type", "Tags", "Published", "Option1 Name", "Option1 Value", "Variant SKU", "Variant Price", "Variant Requires Shipping", "Variant Taxable", "Status"];
  const rows = [header.join(",")];
  const sizes = SIZES.filter(s => design.sizes[s]);
  sizes.forEach((s, i) => {
    rows.push([
      handle,
      i === 0 ? design.name : "",
      i === 0 ? `<p>${productDescription(design).replace(/[<>&]/g, "")}</p>` : "",
      i === 0 ? "[Your brand]" : "",
      i === 0 ? GARMENTS[design.garment].label : "",
      i === 0 ? hashtags(design).map(t => t.slice(1)).join(", ") : "",
      i === 0 ? "FALSE" : "",
      "Size",
      s,
      `${handle}-${s.toLowerCase()}`.toUpperCase(),
      design.price.toFixed(2),
      "TRUE",
      "TRUE",
      i === 0 ? "draft" : "",
    ].map(csvCell).join(","));
  });
  return rows.join("\n") + "\n";
}

export function launchKit(design) {
  return {
    description: productDescription(design),
    captions: captions(design),
    hashtags: hashtags(design),
    storeCsv: storeCsv(design),
  };
}

const capital = s => s.charAt(0).toUpperCase() + s.slice(1);
