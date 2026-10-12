// Node-only: confirm a ReDoS suspect by timing the real regex engine on a
// generated input. Each run executes in a vm context with a hard timeout, so a
// truly catastrophic pattern is cut off instead of hanging the CLI. Only JS
// patterns are probed: Python's engine differs, so run Python suspects there.
import vm from "node:vm";

const PUMPS = ["a", "0", " ", "_", "-", ".", "A", "x", "\t"];
const SUFFIXES = ["!", "\n", "@", "/", "~", "\u0000"];
const TIMEOUT_MS = 250;

function timeOne(re, input, timeoutMs = TIMEOUT_MS) {
  const ctx = vm.createContext({ re, input, out: false });
  const start = process.hrtime.bigint();
  try {
    vm.runInContext("re.lastIndex = 0; out = re.test(input)", ctx, { timeout: timeoutMs });
  } catch (err) {
    if (/timed out/i.test(String(err && err.message))) return { ms: timeoutMs, timedOut: true };
    throw err;
  }
  return { ms: Number(process.hrtime.bigint() - start) / 1e6, timedOut: false };
}

export function probePattern(source, flags = "") {
  let re;
  try { re = new RegExp(source, flags.replace(/[gy]/g, "")); } catch (err) {
    return { status: "skipped", reason: `not a valid JavaScript pattern (${err.message})` };
  }
  // Pick the pump/suffix pair that hurts most at a moderate size.
  let best = null;
  for (const pump of PUMPS) {
    for (const suffix of SUFFIXES) {
      const r = timeOne(re, pump.repeat(20) + suffix, 150);
      if (!best || r.ms > best.ms) best = { pump, suffix, ms: r.ms };
    }
  }
  const { pump, suffix } = best;
  // Exponential: time at +4 characters should grow roughly 16x.
  let prevMs = 0; let last = null;
  for (const n of [18, 22, 26, 30]) {
    const r = timeOne(re, pump.repeat(n) + suffix);
    last = { n, ...r };
    if (r.timedOut || (r.ms >= 40 && prevMs > 0 && r.ms / prevMs >= 4)) {
      return { status: "confirmed", kind: "exponential", n, ms: Math.round(r.ms), timedOut: r.timedOut, attack: { pump, suffix, repeat: n } };
    }
    prevMs = Math.max(r.ms, 0.05);
  }
  // Polynomial: a long input that should be near-instant.
  for (const n of [4000, 16000]) {
    const r = timeOne(re, pump.repeat(n) + suffix, 400);
    if (r.timedOut || r.ms >= 120) return { status: "confirmed", kind: "polynomial", n, ms: Math.round(r.ms), timedOut: r.timedOut, attack: { pump, suffix, repeat: n } };
    last = { n, ...r };
  }
  return { status: "not-reproduced", n: last.n, ms: Math.round(last.ms), note: "no slowdown on the generated inputs; the pattern may still be slow on a different input shape" };
}

export const describeAttack = (a) => `${JSON.stringify(a.pump)}.repeat(${a.repeat}) + ${JSON.stringify(a.suffix)}`;
