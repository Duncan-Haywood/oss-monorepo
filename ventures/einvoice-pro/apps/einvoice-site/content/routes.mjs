// Every page, its slug per language, and whether search engines should index it. The build renders
// each (page, language) pair and links the four language versions with hreflang. The worker
// (worker.mjs) redirects to the `flow` pages after a form action, so it imports this file too.
import { COUNTRIES } from "./deadlines.mjs";

export const PAGES = [
  { id: "home", slug: { de: "", fr: "", en: "", nl: "" }, index: true, priority: "1.0" },
  {
    id: "accountants",
    slug: { de: "steuerberater", fr: "experts-comptables", en: "accountants", nl: "boekhouders" },
    index: true,
    priority: "0.9",
  },
  { id: "api", slug: { de: "api", fr: "api", en: "api", nl: "api" }, index: true, priority: "0.8" },
  {
    id: "pricing",
    slug: { de: "preise", fr: "tarifs", en: "pricing", nl: "prijzen" },
    index: true,
    priority: "0.8",
  },
  ...COUNTRIES.map((c) => ({
    id: `deadlines-${c.key}`,
    country: c.key,
    slug: {
      de: `fristen/${c.slug.de}`,
      fr: `echeances/${c.slug.fr}`,
      en: `deadlines/${c.slug.en}`,
      nl: `termijnen/${c.slug.nl}`,
    },
    index: true,
    priority: "0.9",
  })),
  {
    id: "early-access",
    slug: { de: "fruehzugang", fr: "acces-anticipe", en: "early-access", nl: "vroege-toegang" },
    index: true,
    priority: "0.7",
  },
  {
    id: "privacy",
    slug: { de: "datenschutz", fr: "confidentialite", en: "privacy", nl: "privacy" },
    index: true,
    priority: "0.3",
  },
  // Form flow pages: reachable, never indexed, not in the sitemap.
  {
    id: "check-inbox",
    flow: true,
    slug: {
      de: "fruehzugang/postfach",
      fr: "acces-anticipe/verifiez",
      en: "early-access/check-inbox",
      nl: "vroege-toegang/inbox",
    },
  },
  {
    id: "confirmed",
    flow: true,
    slug: {
      de: "fruehzugang/bestaetigt",
      fr: "acces-anticipe/confirme",
      en: "early-access/confirmed",
      nl: "vroege-toegang/bevestigd",
    },
  },
  {
    id: "deleted",
    flow: true,
    slug: {
      de: "fruehzugang/geloescht",
      fr: "acces-anticipe/supprime",
      en: "early-access/deleted",
      nl: "vroege-toegang/verwijderd",
    },
  },
  {
    id: "form-error",
    flow: true,
    slug: { de: "fruehzugang/fehler", fr: "acces-anticipe/erreur", en: "early-access/error", nl: "vroege-toegang/fout" },
  },
];

export const page = (id) => {
  const p = PAGES.find((x) => x.id === id);
  if (!p) throw new Error(`unknown page ${id}`);
  return p;
};

/** Site path of a page in a language, always with a trailing slash: "/de/preise/". */
export const pathOf = (id, lang) => {
  const s = page(id).slug[lang];
  return s ? `/${lang}/${s}/` : `/${lang}/`;
};
