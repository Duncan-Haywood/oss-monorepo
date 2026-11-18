/**
 * Camera and photo try-on, the first step of the "AR try-on" both interviews
 * asked for. No pose model and nothing leaves the device: the shopper stands
 * square to the camera (or uploads a front photo), taps the two shoulder
 * points, and the garment outline from `tryOn` is scaled and rotated onto them.
 *
 * Scale comes from the shoulder span: the body model's shoulder width is
 * 0.25 x height (`tryon.mjs`), so px per cm = tapped span / that width. The
 * outline is a front-on flat shape (neck, shoulder, chest, hem); it does not
 * drape, follow the arms or fix perspective. A photo shot from close up or at
 * an angle skews the scale, so the result is a size check, not a fit promise.
 */
import { tryOn, LANDMARKS } from "./tryon.mjs";

const r1 = x => Math.round(x * 10) / 10;
const ok = p => p && Number.isFinite(+p.x) && Number.isFinite(+p.y);

/**
 * @param {{x:number,y:number}} left  tapped point at the wearer's left shoulder as seen (image left)
 * @param {{x:number,y:number}} right tapped point at the other shoulder
 * @param {object} body  {chest, waist?, hip?, height?}  cm
 * @param {object} [opts] passed to tryOn (garment, fit, size, sizeChart)
 * @param {{w:number,h:number}} [frame] image size, to warn when the outline leaves it
 */
export function cameraOverlay(left, right, body, opts = {}, frame) {
  if (!ok(left) || !ok(right)) return { ok: false, error: "Tap the two shoulder points on the picture." };
  const t = tryOn(body, opts);
  if (!t.ok) return t;
  const dx = right.x - left.x, dy = right.y - left.y;
  const span = Math.hypot(dx, dy);
  if (span < 20) return { ok: false, error: "The two taps are almost on top of each other. Tap one shoulder point on each side." };
  if (dx <= 0) return { ok: false, error: "Tap the shoulder on the left of the picture first, then the one on the right." };
  const H = t.height, L = LANDMARKS;
  const pxPerCm = span / t.bodyWidths.shoulder;
  const tilt = Math.atan2(dy, dx);
  const cos = Math.cos(tilt), sin = Math.sin(tilt);
  const mid = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
  // Local frame: u across (cm, right positive), v down (cm) from the shoulder line.
  const shoulderH = H * L.shoulder;
  const down = h => shoulderH - h; // height above floor -> cm below shoulder line
  const sh = t.bodyWidths.shoulder / 2, gc = t.garmentWidths.chest / 2, gh = t.garmentWidths.hem / 2, neck = H * 0.04;
  const hpsDown = down(H * L.neck - 2), hemDown = down(t.length.hemFromFloor);
  const local = [[-neck, hpsDown], [-sh, 0], [-gc, down(H * L.chest)], [-gh, hemDown], [gh, hemDown], [gc, down(H * L.chest)], [sh, 0], [neck, hpsDown]];
  const pts = local.map(([u, v]) => ({ x: r1(mid.x + (u * cos - v * sin) * pxPerCm), y: r1(mid.y + (u * sin + v * cos) * pxPerCm) }));
  const notes = [];
  const tiltDeg = r1((tilt * 180) / Math.PI);
  if (Math.abs(tiltDeg) > 8) notes.push(`The shoulders are tilted ${tiltDeg} degrees; stand square to the camera for a truer scale.`);
  if (frame && pts.some(p => p.x < 0 || p.y < 0 || p.x > frame.w || p.y > frame.h)) notes.push("The outline runs off the picture: step back or retake the photo with the hem in view.");
  notes.push("Scale comes from your shoulder span and your height. Stand square, arms down, camera at chest height, a few metres away.");
  notes.push("A flat outline, not cloth: it does not drape or bend with the arms, and it is not a promise of fit.");
  return { ok: true, size: t.size, pxPerCm: r1(pxPerCm), tiltDeg, points: pts, sleeveWord: t.sleeve.word, hemWord: t.length.word, checks: t.checks, notes: [...notes, ...t.notes.filter(n => /assumed/.test(n))] };
}

/** SVG path for the outline points. */
export const overlayPath = pts => pts.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" ") + " Z";
