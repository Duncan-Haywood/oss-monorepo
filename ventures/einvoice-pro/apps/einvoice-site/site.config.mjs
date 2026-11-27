// Build-time settings. Production builds (`node build.mjs --prod`) refuse to run with a missing value,
// so a placeholder can never ship. Everything comes from the environment; nothing secret is here.
export const LANGS = ["de", "fr", "en", "nl"];
export const DEFAULT_LANG = "en"; // x-default target is the language chooser at "/", not a language

/** Working product name. Change it here only; every page, llms.txt and email reads it. */
export const SITE_NAME = "E-Invoice Preflight";

export function readConfig(env = process.env, { prod = false } = {}) {
  const cfg = {
    siteUrl: (env.SITE_URL || (prod ? "" : "http://localhost:8787")).replace(/\/+$/, ""),
    controller: {
      name: env.CONTROLLER_NAME || "",
      address: env.CONTROLLER_ADDRESS || "",
      email: env.CONTROLLER_EMAIL || "",
    },
    prod,
  };
  if (prod) {
    const missing = [];
    if (!/^https:\/\//.test(cfg.siteUrl)) missing.push("SITE_URL (https://...)");
    for (const k of ["name", "address", "email"]) {
      if (!cfg.controller[k]) missing.push(`CONTROLLER_${k.toUpperCase()}`);
    }
    if (missing.length) {
      throw new Error(`Production build needs: ${missing.join(", ")} (see README "Before launch")`);
    }
  }
  return cfg;
}
