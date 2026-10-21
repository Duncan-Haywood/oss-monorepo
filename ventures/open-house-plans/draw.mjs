// @ts-check
// Drawing primitives and two renderers: SVG for viewing and DXF (AutoCAD R12
// ASCII) for CAD. Drawings are built once as primitives in feet, y up, then
// written to either format, so the SVG and the DXF always agree.
//
// Primitives: { t: "poly", pts, closed, fill, stroke, sw, dash, layer }
//             { t: "line", a, b, stroke, sw, dash, layer }
//             { t: "arc", c, r, a0, a1, stroke, sw, layer }   (degrees, counter-clockwise)
//             { t: "circle", c, r, fill, stroke, sw, layer }
//             { t: "text", p, s, size, anchor, weight, fill, layer, rot }

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const f = (v) => (Math.round(v * 100) / 100).toString();

export function boundsOf(prims) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  for (const p of prims) {
    if (p.t === "poly") p.pts.forEach(([x, y]) => add(x, y));
    else if (p.t === "line") { add(...p.a); add(...p.b); }
    else if (p.t === "arc" || p.t === "circle") { add(p.c[0] - p.r, p.c[1] - p.r); add(p.c[0] + p.r, p.c[1] + p.r); }
    else if (p.t === "text") { const w = String(p.s).length * p.size * 0.55; add(p.p[0] - w / 2, p.p[1] - p.size * 0.3); add(p.p[0] + w / 2, p.p[1] + p.size); }
  }
  return { x0, y0, x1, y1 };
}

/**
 * Render primitives to an SVG group. scale = px per ft; ox, oy = model point
 * placed at the group's origin (top-left after the y flip).
 */
export function svgGroup(prims, { scale, ox, oy }) {
  const X = (x) => f((x - ox) * scale);
  const Y = (y) => f((oy - y) * scale);
  const style = (p, defFill = "none") => {
    const s = [];
    s.push(`fill="${p.fill ?? defFill}"`);
    if (p.stroke !== null) s.push(`stroke="${p.stroke ?? "#222"}"`, `stroke-width="${f((p.sw ?? 0.06) * scale)}"`);
    if (p.dash) s.push(`stroke-dasharray="${p.dash.map((d) => f(d * scale)).join(" ")}"`);
    if (p.opacity !== undefined) s.push(`opacity="${p.opacity}"`);
    if (p.join) s.push(`stroke-linejoin="${p.join}"`);
    return s.join(" ");
  };
  const out = [];
  for (const p of prims) {
    if (p.t === "poly") {
      const d = p.pts.map(([x, y], i) => `${i ? "L" : "M"}${X(x)} ${Y(y)}`).join("") + (p.closed ? "Z" : "");
      out.push(`<path d="${d}" ${style(p)}/>`);
    } else if (p.t === "line") {
      out.push(`<line x1="${X(p.a[0])}" y1="${Y(p.a[1])}" x2="${X(p.b[0])}" y2="${Y(p.b[1])}" ${style({ ...p, fill: "none" })}/>`);
    } else if (p.t === "circle") {
      out.push(`<circle cx="${X(p.c[0])}" cy="${Y(p.c[1])}" r="${f(p.r * scale)}" ${style(p)}/>`);
    } else if (p.t === "arc") {
      const a0 = (p.a0 * Math.PI) / 180, a1 = (p.a1 * Math.PI) / 180;
      const sx = p.c[0] + p.r * Math.cos(a0), sy = p.c[1] + p.r * Math.sin(a0);
      const ex = p.c[0] + p.r * Math.cos(a1), ey = p.c[1] + p.r * Math.sin(a1);
      let sweep = p.a1 - p.a0;
      while (sweep < 0) sweep += 360;
      // y is flipped, so counter-clockwise in the model is clockwise on screen (sweep flag 0)
      out.push(`<path d="M${X(sx)} ${Y(sy)}A${f(p.r * scale)} ${f(p.r * scale)} 0 ${sweep > 180 ? 1 : 0} 0 ${X(ex)} ${Y(ey)}" ${style({ ...p, fill: "none" })}/>`);
    } else if (p.t === "text") {
      const anchor = p.anchor || "middle";
      const rot = p.rot ? ` transform="rotate(${-p.rot} ${X(p.p[0])} ${Y(p.p[1])})"` : "";
      out.push(`<text x="${X(p.p[0])}" y="${Y(p.p[1])}" font-size="${f(p.size * scale)}" text-anchor="${anchor}"${p.weight ? ` font-weight="${p.weight}"` : ""} fill="${p.fill || "#222"}"${p.italic ? ' font-style="italic"' : ""}${p.spacing ? ` letter-spacing="${f(p.spacing * scale)}"` : ""}${rot}>${esc(p.s)}</text>`);
    }
  }
  return out.join("\n");
}

/** A standalone SVG of primitives with a margin (ft) around their bounds. */
export function svgDoc(prims, { scale = 12, margin = 3, title = "", background = "#ffffff" } = {}) {
  const b = boundsOf(prims);
  const w = (b.x1 - b.x0 + 2 * margin) * scale, h = (b.y1 - b.y0 + 2 * margin) * scale;
  const body = svgGroup(prims, { scale, ox: b.x0 - margin, oy: b.y1 + margin });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(w)} ${f(h)}" width="${f(w)}" height="${f(h)}" font-family="Helvetica, Arial, sans-serif">${title ? `<title>${esc(title)}</title>` : ""}\n<rect width="100%" height="100%" fill="${background}"/>\n${body}\n</svg>\n`;
}

// ---------------------------------------------------------------------------
// DXF (R12 ASCII). Units: inches (feet x 12), $INSUNITS = 1.

const ACI = (hex) => {
  // nearest of a few AutoCAD colour indices; 7 = black/white
  if (!hex || hex === "none") return 7;
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (r > 200 && g < 90 && b < 90) return 1;
  if (b > 150 && r < 120) return 5;
  if (g > 150 && r < 120 && b < 120) return 3;
  if (r > 150 && g > 150 && b < 100) return 2;
  if (Math.abs(r - g) < 20 && Math.abs(g - b) < 20 && r > 120 && r < 220) return 8;
  return 7;
};

export function dxfDoc(layersPrims) {
  const L = [];
  const g = (code, v) => L.push(String(code), String(v));
  const layers = [...new Set(layersPrims.map((p) => p.layer || "0"))];
  g(0, "SECTION"); g(2, "HEADER");
  g(9, "$ACADVER"); g(1, "AC1009");
  g(9, "$INSUNITS"); g(70, 1);
  g(0, "ENDSEC");
  g(0, "SECTION"); g(2, "TABLES");
  g(0, "TABLE"); g(2, "LTYPE"); g(70, 1);
  g(0, "LTYPE"); g(2, "CONTINUOUS"); g(70, 0); g(3, "Solid line"); g(72, 65); g(73, 0); g(40, 0.0);
  g(0, "ENDTAB");
  g(0, "TABLE"); g(2, "LAYER"); g(70, layers.length);
  for (const name of layers) { g(0, "LAYER"); g(2, name); g(70, 0); g(62, 7); g(6, "CONTINUOUS"); }
  g(0, "ENDTAB");
  g(0, "ENDSEC");
  g(0, "SECTION"); g(2, "ENTITIES");
  const I = (v) => (Math.round(v * 12 * 1000) / 1000).toString();
  for (const p of layersPrims) {
    const layer = p.layer || "0";
    const color = ACI(p.stroke || p.fill);
    if (p.t === "line") {
      g(0, "LINE"); g(8, layer); g(62, color); g(10, I(p.a[0])); g(20, I(p.a[1])); g(30, 0); g(11, I(p.b[0])); g(21, I(p.b[1])); g(31, 0);
    } else if (p.t === "poly") {
      g(0, "POLYLINE"); g(8, layer); g(62, color); g(66, 1); g(10, 0); g(20, 0); g(30, 0); g(70, p.closed ? 1 : 0);
      for (const [x, y] of p.pts) { g(0, "VERTEX"); g(8, layer); g(10, I(x)); g(20, I(y)); g(30, 0); }
      g(0, "SEQEND"); g(8, layer);
    } else if (p.t === "circle") {
      g(0, "CIRCLE"); g(8, layer); g(62, color); g(10, I(p.c[0])); g(20, I(p.c[1])); g(30, 0); g(40, I(p.r));
    } else if (p.t === "arc") {
      g(0, "ARC"); g(8, layer); g(62, color); g(10, I(p.c[0])); g(20, I(p.c[1])); g(30, 0); g(40, I(p.r)); g(50, p.a0); g(51, p.a1);
    } else if (p.t === "text") {
      const h = p.size * 12 * 0.75;
      const align = p.anchor === "start" ? 0 : p.anchor === "end" ? 2 : 1;
      g(0, "TEXT"); g(8, layer); g(62, color); g(10, I(p.p[0])); g(20, I(p.p[1])); g(30, 0); g(40, h.toFixed(2)); g(1, String(p.s).replace(/[^\x20-\x7e]/g, "")); if (p.rot) g(50, p.rot);
      if (align) { g(72, align); g(11, I(p.p[0])); g(21, I(p.p[1])); g(31, 0); }
    }
  }
  g(0, "ENDSEC");
  g(0, "EOF");
  return L.join("\n") + "\n";
}
