/**
 * Pure helper for PipelineHealthPanel's Stage funnel bar chart width.
 *
 * /dashboard is a nonce-CSP-tier route (isNonceCspPath, src/lib/security/
 * content-security-policy.ts) — buildNonceContentSecurityPolicy sets
 * `style-src 'self' 'nonce-<value>'`. A nonce only ever authorizes <style>
 * elements (and Next's own framework-injected styles it re-nonces during
 * SSR); it does NOT authorize an inline `style="..."` attribute on an
 * arbitrary element — the CSP spec's style-src-attr fallback only accepts
 * 'unsafe-inline' or a literal sha256 hash of the exact attribute value (via
 * 'unsafe-hashes'), never a nonce. A per-row `style={{ width: \`${pct}%\` }}`
 * (as PipelineHealthPanel's stage-funnel bar previously used) is therefore
 * silently blocked by a real browser on this route — confirmed via a
 * Playwright check against an actual `npm run build && npm start` (not a
 * curl-only check, which never enforces CSP): every "Refused to apply inline
 * style" console error on /dashboard/leads traced back to this exact style
 * attribute. Blocked inline styles don't throw or no-op cleanly either — the
 * bar `<div>` has no width class of its own, so with the style attribute
 * refused it falls back to ordinary block-level layout and renders at 100%
 * width regardless of the lead's actual stage count, silently turning the
 * funnel chart into a row of identical full-width bars — a materially
 * misleading data visualization on the operator's busiest page, not merely
 * a missing decoration (dashboard-stage-funnel-bar-csp-inline-style-fix).
 *
 * Fix: never emit a per-row inline style. Bucket the percentage to the
 * nearest 5% and resolve to one of 21 static Tailwind arbitrary-value width
 * classes, each written out literally below so Tailwind v4's automatic
 * content scanner (no explicit `content` config in this repo — see
 * postcss.config.mjs) can find the class text and generate real CSS for it
 * at build time. A computed/interpolated class name (e.g. `` `w-[${pct}%]` ``)
 * would not be detected by that scanner and would silently produce no CSS
 * rule at all, the same class of bug this file exists to avoid.
 */

const STAGE_FUNNEL_BAR_WIDTH_CLASSES = [
  "w-[0%]",
  "w-[5%]",
  "w-[10%]",
  "w-[15%]",
  "w-[20%]",
  "w-[25%]",
  "w-[30%]",
  "w-[35%]",
  "w-[40%]",
  "w-[45%]",
  "w-[50%]",
  "w-[55%]",
  "w-[60%]",
  "w-[65%]",
  "w-[70%]",
  "w-[75%]",
  "w-[80%]",
  "w-[85%]",
  "w-[90%]",
  "w-[95%]",
  "w-[100%]",
] as const;

/**
 * Resolve a stage's bar width to a static Tailwind class, bucketed to the
 * nearest 5%. `maxCount` should already be floored at 1 by the caller (see
 * PipelineHealthPanel's `Math.max(1, ...)`) — this function additionally
 * guards against 0/negative here so a future caller can't reintroduce a
 * divide-by-zero or an out-of-range array index.
 */
export function stageFunnelBarWidthClass(count: number, maxCount: number): string {
  if (!Number.isFinite(count) || !Number.isFinite(maxCount) || maxCount <= 0) {
    return STAGE_FUNNEL_BAR_WIDTH_CLASSES[0];
  }
  const rawPercent = (count / maxCount) * 100;
  const clampedPercent = Math.min(100, Math.max(0, rawPercent));
  const bucketIndex = Math.round(clampedPercent / 5);
  return STAGE_FUNNEL_BAR_WIDTH_CLASSES[bucketIndex];
}
