// Path, title and description of the public demo page, shared by the page's useDocumentMeta and the
// prerender list (src/client/marketing-routes.ts) so the client-side <title> matches the static one.
export const DEMO_PATH = "/demo" as const;

/** Page name without the site name ("Interactive demo · Grant Autopilot" once suffixed). */
export const DEMO_TITLE = "Interactive demo";

export const DEMO_DESCRIPTION =
  "Try Grant Autopilot without signing up: follow an imagined charity from its documents to cited facts, grant matches, a checked draft and a submitted package.";
