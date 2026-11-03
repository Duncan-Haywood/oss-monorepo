// Agent Workroom in a headset: the pure part. Matrices, where everything
// stands in the room (in metres), which object a controller ray hits, and the
// audio resampling the on-device speech model needs. No DOM and no WebGL here,
// so all of it runs under `node --test`. vr.html draws what `buildScene` says.

import { STATUSES, STATUS_LABELS, agentSummary } from "./engine.mjs";

// ---------- 4x4 matrices, column-major like WebGL ----------

export function identity() {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

export function multiply(a, b) {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = s;
    }
  }
  return out;
}

export function perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}

/** Translate, then turn by yaw about Y, then pitch about X, then scale: the model matrix of one object. */
export function compose(pos = [0, 0, 0], yaw = 0, scale = [1, 1, 1], pitch = 0) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  // R = Ry(yaw) * Rx(pitch), columns:
  const x = [cy, 0, -sy];
  const y = [sy * sp, cp, cy * sp];
  const z = [sy * cp, -sp, cy * cp];
  const [a, b, c] = scale;
  return new Float32Array([
    x[0] * a, x[1] * a, x[2] * a, 0,
    y[0] * b, y[1] * b, y[2] * b, 0,
    z[0] * c, z[1] * c, z[2] * c, 0,
    pos[0], pos[1], pos[2], 1,
  ]);
}

/** Inverse of a rotation-and-translation matrix (no scale): the view matrix of a camera pose. */
export function invertRigid(m) {
  const out = new Float32Array(16);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out[c * 4 + r] = m[r * 4 + c];
  for (let r = 0; r < 3; r++) out[12 + r] = -(out[r] * m[12] + out[4 + r] * m[13] + out[8 + r] * m[14]);
  out[15] = 1;
  return out;
}

export function transformPoint(m, p) {
  return [0, 1, 2].map((r) => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]);
}

export function transformDir(m, d) {
  return [0, 1, 2].map((r) => m[r] * d[0] + m[4 + r] * d[1] + m[8 + r] * d[2]);
}

/** The yaw that faces from `from` toward `to` on the floor (forward is -z). */
export function yawToward(from, to) {
  return Math.atan2(-(to[0] - from[0]), -(to[2] - from[2]));
}

/**
 * WebXR moves the player by offsetting the reference space with the inverse
 * of where the player stands. Returns that inverse as an XRRigidTransform's
 * position and orientation (a quaternion about Y).
 */
export function playerOffset(player) {
  const t = -player.yaw;
  const c = Math.cos(t), s = Math.sin(t);
  const [px, pz] = [-player.x, -player.z];
  return {
    position: { x: c * px + s * pz, y: 0, z: -s * px + c * pz },
    orientation: { x: 0, y: Math.sin(t / 2), z: 0, w: Math.cos(t / 2) },
  };
}

// ---------- the room ----------

export const ROOM = { half: 5, height: 3, eye: 1.6 };
export const BOARD = { z: -3.4, y: 1.55, width: 4.6, height: 2.3, columnWidth: 1.08, noteWidth: 0.98, noteHeight: 0.2, gap: 0.04, perColumn: 7 };
export const PANEL = { angle: -1.0, distance: 1.7, y: 1.55, width: 1.3, height: 0.95 };
export const DESK_RING = { radius: 2.7, from: 1.6, to: 4.68 }; // radians clockwise from straight ahead

export const STATUS_COLOURS = { todo: "#868e96", doing: "#f08c00", review: "#7048e8", done: "#2f9e44" };
export const CI_COLOURS = { failing: "#e03131", running: "#f08c00", passing: "#2f9e44", none: "#868e96" };

/** Same hash as the 2D room, so an agent keeps its colour across both. */
export function colourFor(name) {
  let n = 0;
  for (const c of String(name)) n = (n * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${n % 360} 62% 58%)`;
}

/** Desks on a ring around the player, behind and to the sides, so none of them hides the board. */
export function deskRing(count, { radius, from, to } = DESK_RING) {
  return Array.from({ length: count }, (_, i) => {
    const a = count === 1 ? Math.PI / 2 : from + ((to - from) * i) / (count - 1);
    const x = Math.sin(a) * radius;
    const z = -Math.cos(a) * radius;
    return { x, z, yaw: yawToward([x, 0, z], [0, 0, 0]) };
  });
}

/** Where a "go to" command puts the player: in front of the board, back home, or facing a desk. */
export function goPose(target, desks) {
  if (target?.kind === "board") return { x: 0, z: BOARD.z + 2.1, yaw: 0 };
  if (target?.kind === "desk") {
    const d = desks.find((x) => x.agent.toLowerCase() === String(target.agent).toLowerCase());
    if (d) {
      const k = 1 - 1.25 / Math.hypot(d.x, d.z);
      const at = { x: d.x * k, z: d.z * k };
      return { ...at, yaw: yawToward([at.x, 0, at.z], [d.x, 0, d.z]) };
    }
  }
  return { x: 0, z: 0, yaw: 0 };
}

const BUTTONS = [
  ["talk", "Talk"], ["sync", "Refresh"], ["help", "Help"],
  ["doing", "Start"], ["review", "Review"], ["done", "Done"],
  ["confirm", "Send"], ["cancel", "Cancel"], ["home", "Recentre"],
];

/**
 * Everything the headset room draws, as plain data. Boxes are furniture;
 * quads carry a `label` that vr.html paints onto a canvas texture. Anything
 * with a `pick` can be pointed at and selected.
 *   ui: { selected, ci: {taskId: summary}, pending, listening, heard, reply, voiceMode }
 */
export function buildScene(state, ui = {}) {
  const items = [];
  const box = (pos, size, colour, yaw = 0) => items.push({ mesh: "box", pos, size, colour, yaw });
  const quad = (pos, w, h, yaw, label, pick = null) => items.push({ mesh: "quad", pos, size: [w, h, 1], yaw, label, pick });
  const { half, height } = ROOM;

  // Floor, ceiling and walls.
  box([0, -0.01, 0], [half * 2, 0.02, half * 2], "#3a3d45");
  box([0, height, 0], [half * 2, 0.02, half * 2], "#24262c");
  box([0, height / 2, -half], [half * 2, height, 0.05], "#2b2e36");
  box([0, height / 2, half], [half * 2, height, 0.05], "#2b2e36");
  box([-half, height / 2, 0], [0.05, height, half * 2], "#30333b");
  box([half, height / 2, 0], [0.05, height, half * 2], "#30333b");

  // The board: a frame, a heading per column, and up to `perColumn` notes in each.
  const b = BOARD;
  box([0, b.y, b.z - 0.04], [b.width + 0.12, b.height + 0.12, 0.04], "#1b1c20");
  const top = b.y + b.height / 2;
  STATUSES.forEach((status, c) => {
    const x = (c - 1.5) * (b.columnWidth + 0.06);
    const mine = state.tasks.filter((t) => t.status === status).sort((p, q) => (p.priority === q.priority ? p.num - q.num : p.priority === "high" ? -1 : 1));
    quad([x, top - 0.14, b.z], b.columnWidth, 0.2, 0, { kind: "heading", text: `${STATUS_LABELS[status]} (${mine.length})`, colour: STATUS_COLOURS[status] });
    const shown = mine.slice(0, mine.length > b.perColumn ? b.perColumn - 1 : b.perColumn);
    shown.forEach((t, i) => {
      const y = top - 0.4 - i * (b.noteHeight + b.gap);
      quad([x, y, b.z + 0.01], b.noteWidth, b.noteHeight, 0, {
        kind: "note", num: t.num, text: t.title, agent: t.agent, status, high: t.priority === "high",
        selected: ui.selected === t.id, ci: ui.ci?.[t.id]?.state || null,
      }, { kind: "task", id: t.id });
    });
    if (mine.length > shown.length) {
      const y = top - 0.4 - shown.length * (b.noteHeight + b.gap);
      quad([x, y, b.z + 0.01], b.noteWidth, b.noteHeight, 0, { kind: "more", text: `+${mine.length - shown.length} more (say "select" and a number)` });
    }
  });

  // Desks: a table, a monitor showing the agent's current task, and a simple avatar.
  const summary = agentSummary(state);
  const ring = deskRing(summary.length);
  const desks = summary.map((a, i) => ({ agent: a.name, ...ring[i] }));
  summary.forEach((a, i) => {
    const { x, z, yaw } = ring[i];
    const fwd = [-Math.sin(yaw), -Math.cos(yaw)]; // toward the player
    const at = (d, y) => [x - fwd[0] * d, y, z - fwd[1] * d];
    box(at(0, 0.72), [1.1, 0.05, 0.6], "#6b5544", yaw);
    box(at(0, 0.36), [0.06, 0.7, 0.5], "#4a3b30", yaw);
    const current = a.current;
    const ci = current ? ui.ci?.[current.id]?.state || null : null;
    // A quad's face points along +z before its turn, so one facing the player is turned half a circle further.
    quad(at(0.18, 1.07), 0.72, 0.44, yaw + Math.PI, {
      kind: "monitor", agent: a.name, colour: colourFor(a.name), task: current ? `#${current.num} ${current.title}` : "Nothing assigned",
      status: current?.status || null, progress: current?.progress ?? 0, counts: a.counts, ci,
    }, current ? { kind: "task", id: current.id } : { kind: "agent", agent: a.name });
    box(at(0.2, 0.84), [0.1, 0.2, 0.06], "#222", yaw);
    // Avatar behind the desk; bobs (in vr.html) while its agent has work in progress.
    const busy = a.counts.doing > 0;
    items.push({ mesh: "box", pos: at(0.65, 1.15), size: [0.36, 0.6, 0.24], colour: colourFor(a.name), yaw, bob: busy });
    items.push({ mesh: "box", pos: at(0.65, 1.62), size: [0.26, 0.26, 0.26], colour: "#f1d6b8", yaw, bob: busy });
    if (ci === "failing") box(at(0.18, 1.36), [0.08, 0.08, 0.08], CI_COLOURS.failing, yaw);
  });

  // The control panel, to the left of the board, angled toward the player.
  const p = PANEL;
  const px = Math.sin(p.angle) * p.distance, pz = -Math.cos(p.angle) * p.distance;
  const pyaw = yawToward([px, 0, pz], [0, 0, 0]) + Math.PI; // face the player
  const selected = state.tasks.find((t) => t.id === ui.selected) || null;
  quad([px, p.y + 0.22, pz], p.width, 0.62, pyaw, {
    kind: "panel", listening: ui.listening || null, heard: ui.heard || "", reply: ui.reply || "", voiceMode: ui.voiceMode || "none",
    task: selected ? `#${selected.num} ${selected.title}` : null, taskStatus: selected?.status || null, pending: ui.pending || null,
    repo: state.repo || "",
  });
  const right = [Math.cos(pyaw), -Math.sin(pyaw)]; // the quad's own x axis, as in compose()
  BUTTONS.forEach(([id, text], i) => {
    const col = (i % 3) - 1, row = Math.floor(i / 3);
    const off = col * 0.44;
    const pos = [px + right[0] * off, p.y - 0.2 - row * 0.13, pz + right[1] * off];
    const disabled = ((id === "confirm" || id === "cancel") && !ui.pending) || (["doing", "review", "done"].includes(id) && !selected) || (id === "sync" && !state.repo);
    quad(pos, 0.4, 0.11, pyaw, { kind: "button", text: id === "talk" && ui.listening ? "Stop" : text, disabled, active: id === "talk" && Boolean(ui.listening) }, disabled ? null : { kind: "button", id });
  });

  return { items, desks };
}

/**
 * Which pickable quad a ray hits first, or null. Quads are upright, turned
 * by yaw, facing +z before the turn; both faces count.
 */
export function pickRay(items, origin, dir) {
  let best = null;
  for (const it of items) {
    if (it.mesh !== "quad" || !it.pick) continue;
    const c = Math.cos(it.yaw), s = Math.sin(it.yaw);
    const n = [s, 0, c];
    const denom = n[0] * dir[0] + n[2] * dir[2];
    if (Math.abs(denom) < 1e-6) continue;
    const t = (n[0] * (it.pos[0] - origin[0]) + n[2] * (it.pos[2] - origin[2])) / denom;
    if (t <= 0) continue;
    const hit = [origin[0] + dir[0] * t, origin[1] + dir[1] * t, origin[2] + dir[2] * t];
    const d = [hit[0] - it.pos[0], hit[1] - it.pos[1], hit[2] - it.pos[2]];
    const u = d[0] * c - d[2] * s; // along the quad's own x axis
    if (Math.abs(u) > it.size[0] / 2 || Math.abs(d[1]) > it.size[1] / 2) continue;
    if (!best || t < best.distance) best = { item: it, distance: t, point: hit };
  }
  return best;
}

/** Break text into lines that fit `width`, measured by the caller's `measure` (a canvas's measureText in vr.html). */
export function wrapText(text, width, measure, maxLines = 3) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (measure(next) <= width || !line) line = next;
    else {
      lines.push(line);
      line = w;
      if (lines.length === maxLines) break;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  const used = lines.join(" ").split(/\s+/).filter(Boolean).length;
  if (used < words.length && lines.length) {
    let last = lines[lines.length - 1];
    while (last && measure(`${last}…`) > width) last = last.slice(0, -1);
    lines[lines.length - 1] = `${last.trimEnd()}…`;
  }
  return lines;
}

// ---------- audio for the on-device speech model ----------

/** Average down to `to` Hz (Whisper wants 16 kHz mono). */
export function downsample(samples, from, to = 16000) {
  if (from === to) return Float32Array.from(samples);
  const ratio = from / to;
  const out = new Float32Array(Math.floor(samples.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio), end = Math.min(samples.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += samples[j];
    out[i] = end > start ? sum / (end - start) : 0;
  }
  return out;
}

export function rms(samples) {
  if (!samples.length) return 0;
  let s = 0;
  for (const v of samples) s += v * v;
  return Math.sqrt(s / samples.length);
}

/**
 * Tidy what a speech model heard. Whisper fills silence with things like
 * "[BLANK_AUDIO]" or "(music)"; those mean nothing was said.
 */
export function cleanTranscript(text) {
  const t = String(text || "").replace(/\[[^\]]*\]|\([^)]*\)|\*[^*]*\*/g, " ").replace(/\s+/g, " ").trim();
  return /[a-z0-9]/i.test(t) ? t.replace(/^[\s.,]+|[\s.,]+$/g, "") : "";
}
