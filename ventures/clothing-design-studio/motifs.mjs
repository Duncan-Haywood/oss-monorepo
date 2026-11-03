/**
 * Built-in motifs, drawn in code for this studio (MIT, like the rest).
 * Each returns SVG markup in a 100 x 100 box using `currentColor`, so the ink
 * colour of the placement colours it. They are starting shapes for
 * devotional and classical designs (a halo, wings, a laurel), meant to be
 * combined with the designer's own artwork or a public-domain painting.
 */

const r = n => Math.round(n * 100) / 100;

function halo() {
  const rays = [];
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    const long = i % 2 === 0 ? 48 : 42;
    const w = 0.045;
    rays.push(`M${r(50 + 30 * Math.cos(a - w))} ${r(50 + 30 * Math.sin(a - w))} L${r(50 + long * Math.cos(a))} ${r(50 + long * Math.sin(a))} L${r(50 + 30 * Math.cos(a + w))} ${r(50 + 30 * Math.sin(a + w))} Z`);
  }
  return `<path d="${rays.join(" ")}" fill="currentColor"/><circle cx="50" cy="50" r="27" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="50" cy="50" r="22" fill="none" stroke="currentColor" stroke-width="1"/>`;
}

function cross() {
  return `<path d="M44 6 H56 V30 H76 V42 H56 V94 H44 V42 H24 V30 H44 Z" fill="currentColor"/>`;
}

function leaf(cx, cy, angle, len) {
  const a = (angle * Math.PI) / 180;
  const tx = cx + len * Math.cos(a);
  const ty = cy + len * Math.sin(a);
  const nx = -Math.sin(a) * len * 0.45;
  const ny = Math.cos(a) * len * 0.45;
  const mx = (cx + tx) / 2;
  const my = (cy + ty) / 2;
  return `M${r(cx)} ${r(cy)} Q${r(mx + nx)} ${r(my + ny)} ${r(tx)} ${r(ty)} Q${r(mx - nx)} ${r(my - ny)} ${r(cx)} ${r(cy)} Z`;
}

function laurel() {
  const parts = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      const t = (i / 9) * Math.PI * 0.85 + Math.PI * 0.08;
      const cx = 50 + side * 38 * Math.sin(t);
      const cy = 92 - 42 * (1 - Math.cos(t));
      const tangent = side < 0 ? 180 + (t * 180) / Math.PI * -1 - 90 : (t * 180) / Math.PI * -1 - 90;
      parts.push(leaf(cx, cy, tangent + side * 35, 14));
      parts.push(leaf(cx, cy, tangent - side * 25, 12));
    }
  }
  return `<path d="${parts.join(" ")}" fill="currentColor"/><path d="M14 72 Q50 104 86 72" fill="none" stroke="currentColor" stroke-width="1.6"/>`;
}

function wings() {
  const parts = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      const len = 44 - i * 4.5;
      const y = 30 + i * 7;
      const x0 = 50 + side * 4;
      const x1 = 50 + side * (6 + len);
      const tip = y - 14 + i * 1.5;
      parts.push(`M${r(x0)} ${r(y)} Q${r((x0 + x1) / 2)} ${r(tip - 6)} ${r(x1)} ${r(tip)} Q${r((x0 + x1) / 2 + side * 4)} ${r(y + 4)} ${r(x0)} ${r(y + 5)} Z`);
    }
  }
  return `<path d="${parts.join(" ")}" fill="currentColor"/>`;
}

function crown() {
  return `<path d="M12 78 L18 32 L34 56 L50 22 L66 56 L82 32 L88 78 Z" fill="currentColor"/><rect x="12" y="80" width="76" height="8" rx="2" fill="currentColor"/><circle cx="18" cy="28" r="4" fill="currentColor"/><circle cx="50" cy="18" r="4" fill="currentColor"/><circle cx="82" cy="28" r="4" fill="currentColor"/>`;
}

function star() {
  const pts = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
    const rad = i % 2 === 0 ? 46 : 18;
    pts.push(`${r(50 + rad * Math.cos(a))},${r(50 + rad * Math.sin(a))}`);
  }
  return `<polygon points="${pts.join(" ")}" fill="currentColor"/>`;
}

function frame() {
  return `<rect x="6" y="6" width="88" height="88" rx="2" fill="none" stroke="currentColor" stroke-width="5"/><rect x="14" y="14" width="72" height="72" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M50 2 L56 10 L50 18 L44 10 Z M50 82 L56 90 L50 98 L44 90 Z M2 50 L10 44 L18 50 L10 56 Z M82 50 L90 44 L98 50 L90 56 Z" fill="currentColor"/>`;
}

export const MOTIFS = Object.freeze({
  halo: { id: "halo", label: "Sunburst halo", svg: halo(), words: ["halo", "sunburst", "sun", "rays"] },
  cross: { id: "cross", label: "Cross", svg: cross(), words: ["cross", "crucifix"] },
  laurel: { id: "laurel", label: "Laurel wreath", svg: laurel(), words: ["laurel", "wreath", "olive branch"] },
  wings: { id: "wings", label: "Angel wings", svg: wings(), words: ["wings", "wing", "angel wings", "angel"] },
  crown: { id: "crown", label: "Crown", svg: crown(), words: ["crown"] },
  star: { id: "star", label: "Eight-point star", svg: star(), words: ["star"] },
  frame: { id: "frame", label: "Gilded frame", svg: frame(), words: ["frame", "border"] },
});

/** Open-access collections whose public-domain images may be reused, as a starting list for the designer to check. */
export const PUBLIC_DOMAIN_SOURCES = Object.freeze([
  { name: "The Metropolitan Museum of Art, Open Access", url: "https://www.metmuseum.org/about-the-met/policies-and-documents/open-access" },
  { name: "Art Institute of Chicago, public-domain images", url: "https://www.artic.edu/open-access/public-domain" },
  { name: "National Gallery of Art, Open Access", url: "https://www.nga.gov/open-access-images.html" },
  { name: "Rijksmuseum, Rijksstudio", url: "https://www.rijksmuseum.nl/en/rijksstudio" },
  { name: "Wikimedia Commons (check each file's licence)", url: "https://commons.wikimedia.org/wiki/Category:Public_domain" },
]);
