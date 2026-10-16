// Browser globals the ventures' shared usage counter reads that TypeScript's
// lib.dom does not declare. Without these, every copy of usage.mjs fails
// `// @ts-check` on the same line: 1,282 of the 3,911 diagnostics measured in
// portfolio/research/js-typecheck/ were this one gap.

interface Navigator {
  /** Global Privacy Control (https://globalprivacycontrol.github.io/gpc-spec/). */
  readonly globalPrivacyControl?: boolean;
}

interface Window {
  /** Legacy Do Not Track signal, still exposed by some browsers. */
  readonly doNotTrack?: string | null;
}
