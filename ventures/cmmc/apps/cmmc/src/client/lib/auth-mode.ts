/**
 * Which form the sign-in screen opens on. Links from the marketing site ("Start free") point at
 * `/signup`; the SPA shell serves every path, so without this they would land on "Sign in".
 * `?mode=signup` does the same on any path.
 */
export function authModeFromLocation(pathname: string, search = ""): "in" | "up" {
  if (/^\/(signup|sign-up)\/?$/.test(pathname)) return "up";
  return new URLSearchParams(search).get("mode") === "signup" ? "up" : "in";
}
