// One check for "the app's public URL" before billing setup points Paddle at it (webhook
// destination, default payment link). A typo here would send customers or billing events to
// someone else's server, so only a bare https origin on a real host name passes.

/** A domain name with a letter-led top-level label: no IP literals, no single-label hosts. */
export const PUBLIC_HOST_RE = /^([a-z0-9-]+\.)+[a-z][a-z0-9-]*$/;

/** `${origin}${path}` for a bare https app URL; throws an "app URL ..." error otherwise. */
export function appOriginWith(appUrl: string, path: string, pathLabel: string): string {
  let u: URL;
  try {
    u = new URL(appUrl.trim());
  } catch {
    throw new Error(`app URL ${JSON.stringify(appUrl)} is not a URL`);
  }
  if (u.protocol !== "https:") throw new Error("app URL must be https");
  if (u.username || u.password || u.search || u.hash)
    throw new Error("app URL must be a bare origin (no credentials, query or fragment)");
  if (!PUBLIC_HOST_RE.test(u.hostname))
    throw new Error(`app URL host ${JSON.stringify(u.hostname)} is not a public host name`);
  if (u.pathname !== "/" && u.pathname !== "")
    throw new Error(`app URL must have no path (the ${pathLabel} path is added here)`);
  return `${u.origin}${path}`;
}
