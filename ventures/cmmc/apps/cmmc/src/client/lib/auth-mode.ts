// Which form the signed-out page opens on. The marketing site and the free machine-shop guides link
// to `/?signup&from=<page>` ("Start free on Level 1"), so a visitor lands on "Create an account"
// instead of "Sign in". Any value counts (`?signup`, `?signup=1`); `?signup=0`, `false` or `no` does
// not. Same rule as apps/payapps (src/client/lib/auth-mode.ts there).

export type AuthMode = "in" | "up";

export function initialAuthMode(search: string): AuthMode {
  const q = new URLSearchParams(search);
  if (!q.has("signup")) return "in";
  const v = (q.get("signup") ?? "").trim().toLowerCase();
  return v === "0" || v === "false" || v === "no" ? "in" : "up";
}
