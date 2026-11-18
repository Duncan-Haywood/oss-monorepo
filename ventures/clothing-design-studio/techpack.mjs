/**
 * The tech pack: what a manufacturer needs to quote and sample a design,
 * and a draft quote request the designer can send them. Positions are
 * given the way a factory measures: centimetres from the high point of the
 * shoulder (HPS) down, and from the centre line across.
 */

import { GARMENTS, FABRICS, METHODS, PX_PER_CM, compatibilityNotes } from "./catalogue.mjs";
import { MOTIFS } from "./motifs.mjs";
import { SIZES } from "./design.mjs";
import { renderDesign, esc } from "./render.mjs";
import { specSheet } from "./spec.mjs";

/** Shoulder high point in drawing pixels; the neck seam meets the shoulder at y = 60. */
const HPS_Y = 52;

export function techPack(design, { supplier = null } = {}) {
  const g = GARMENTS[design.garment];
  const f = FABRICS[design.fabric];
  const placements = design.placements.map((p, i) => {
    const a = g.areas[p.area];
    const top = (a.cy - HPS_Y) / PX_PER_CM + p.y - (p.w * p.aspect) / 2;
    return {
      ref: `P${i + 1}`,
      artwork: p.kind === "text" ? `Text: "${p.text}"` : p.kind === "motif" ? `Motif: ${MOTIFS[p.motif]?.label ?? p.motif}` : `Image: ${p.label ?? "uploaded artwork"} (send the file separately)`,
      location: a.label,
      method: METHODS[p.method]?.label ?? p.method,
      inkColours: METHODS[p.method]?.setup === "per-colour" ? p.colours : null,
      ink: p.kind === "image" ? "as artwork" : p.ink,
      widthCm: round1(p.w),
      heightCm: round1(p.w * p.aspect),
      fromHpsCm: p.area === "sleeve" ? null : round1(top),
      fromCentreCm: round1(p.x),
      rotationDeg: p.rotate || 0,
      notes: compatibilityNotes(design.fabric, p.method, { colour: design.colour, gsm: design.gsm }),
    };
  });
  return {
    style: design.name,
    garment: g.label,
    fabric: { type: f.label, composition: f.composition, weightGsm: design.gsm },
    colour: { name: design.colourName, screenHex: design.colour, note: "Screen colour only. Match to the mill's physical swatch or a Pantone TCX reference before sampling." },
    sizes: Object.fromEntries(SIZES.map(s => [s, design.sizes[s] || 0])),
    quantity: design.quantity,
    placements,
    spec: specSheet({ garment: design.garment }),
    labels: "Neck label and care label: designer to supply artwork and the fibre content and care symbols required where the garment is sold.",
    packaging: "Individually folded and bagged unless agreed otherwise.",
    supplier: supplier && !supplier.example ? supplier.name : null,
  };
}

const round1 = v => Math.round(v * 10) / 10;

/** A plain-text quote request the designer edits and sends. Nothing is sent by the studio. */
export function quoteRequest(design, pack = techPack(design)) {
  const lines = [
    `Subject: Quote request: ${pack.style} (${pack.quantity} x ${pack.garment.toLowerCase()})`,
    "",
    "Hello,",
    "",
    `I'd like a quote and a sample for the style below. Could you confirm your price per piece at ${pack.quantity}, your minimum order, setup charges, lead time for a sample and for production, and shipping to [your city, country]?`,
    "",
    `Garment: ${pack.garment}`,
    `Fabric: ${pack.fabric.type}, ${pack.fabric.composition}, about ${pack.fabric.weightGsm} gsm`,
    `Colour: ${pack.colour.name} (I can send a reference swatch)`,
    `Sizes: ${Object.entries(pack.sizes).filter(([, n]) => n).map(([s, n]) => `${s} ${n}`).join(", ")}`,
    "",
    "Decoration:",
    ...pack.placements.map(p => `  ${p.ref}. ${p.artwork}; ${p.method}${p.inkColours ? `, ${p.inkColours} colour${p.inkColours > 1 ? "s" : ""}` : ""}; ${p.location}; ${p.widthCm} x ${p.heightCm} cm${p.fromHpsCm != null ? `, top edge ${p.fromHpsCm} cm below the shoulder high point` : ""}${p.fromCentreCm ? `, ${Math.abs(p.fromCentreCm)} cm ${p.fromCentreCm < 0 ? "left" : "right"} of centre as worn-facing` : ", centred"}`),
    "",
    "Labels: I'll supply neck and care label artwork.",
    "",
    "Thank you,",
    "[Your name]",
  ];
  return lines.join("\n");
}

function specTable(spec) {
  const sizes = Object.keys(spec.sizes);
  return `<table><tr><th>Point of measure</th><th>Tol.</th>${sizes.map(s => `<th>${s}</th>`).join("")}</tr>${spec.points.map(p => `<tr><td>${esc(p.label)}</td><td>+/-${p.tolCm}</td>${sizes.map(s => `<td>${spec.sizes[s][p.id]}</td>`).join("")}</tr>`).join("")}</table><p class="muted">${spec.notes.map(esc).join(" ")}</p>`;
}

/** A printable tech pack page (HTML string), with both sides drawn. */
export function techPackHtml(design, pack = techPack(design)) {
  const rows = pack.placements.map(p => `<tr><td>${p.ref}</td><td>${esc(p.artwork)}</td><td>${esc(p.location)}</td><td>${esc(p.method)}${p.inkColours ? ` (${p.inkColours} col.)` : ""}</td><td>${p.widthCm} x ${p.heightCm}</td><td>${p.fromHpsCm ?? "sleeve"}</td><td>${p.fromCentreCm}</td><td>${p.rotationDeg}</td></tr>${p.notes.length ? `<tr><td></td><td colspan="7" class="note">${p.notes.map(esc).join("<br>")}</td></tr>` : ""}`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Tech pack: ${esc(pack.style)}</title>
<style>body{font:14px/1.45 system-ui,sans-serif;margin:24px;color:#222}h1{margin:0 0 4px}table{border-collapse:collapse;width:100%;margin:12px 0}td,th{border:1px solid #ccc;padding:5px 7px;text-align:left;vertical-align:top}.views{display:flex;gap:16px}.views svg{width:260px;height:auto;border:1px solid #eee}.note{color:#8a4a1f;font-size:12px}.muted{color:#666;font-size:12px}</style></head><body>
<h1>${esc(pack.style)}</h1><p class="muted">Tech pack drafted with the Clothing Design Studio. Check every measurement against a physical sample before production.</p>
<div class="views">${renderDesign(design, { side: "front", uid: "tpf" })}${renderDesign(design, { side: "back", uid: "tpb" })}</div>
<table><tr><th>Garment</th><td>${esc(pack.garment)}</td></tr><tr><th>Fabric</th><td>${esc(pack.fabric.type)}, ${esc(pack.fabric.composition)}, ${pack.fabric.weightGsm} gsm</td></tr><tr><th>Colour</th><td>${esc(pack.colour.name)} (${esc(pack.colour.screenHex)}). ${esc(pack.colour.note)}</td></tr><tr><th>Quantity</th><td>${pack.quantity}: ${Object.entries(pack.sizes).filter(([, n]) => n).map(([s, n]) => `${s} ${n}`).join(", ")}</td></tr><tr><th>Labels</th><td>${esc(pack.labels)}</td></tr><tr><th>Packaging</th><td>${esc(pack.packaging)}</td></tr></table>
<h2>Measurements (finished garment, flat, cm)</h2>${specTable(pack.spec)}
<h2>Decoration</h2><table><tr><th>Ref</th><th>Artwork</th><th>Location</th><th>Method</th><th>Size (cm)</th><th>Top from HPS (cm)</th><th>From centre (cm)</th><th>Rotation</th></tr>${rows || '<tr><td colspan="8">No decoration.</td></tr>'}</table>
<p class="muted">No warranty. This tech pack is a draft from the studio's drawing, not a production specification, and it is not legal, tax, financial or professional advice. You are responsible for reviewing and verifying it before relying on it. Free and open source (MIT).</p>
</body></html>`;
}
