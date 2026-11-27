// Which form the signed-out home page opens on. Marketing pages and the free pay-app guides link
// to `/?signup` ("Start free"), so a visitor lands on "Create an account" instead of "Sign in".
// Any value counts (`?signup`, `?signup=1`); `?signup=0` or `?signup=false` does not.

export type AuthMode = "sign-in" | "sign-up";

export function initialAuthMode(search: string): AuthMode {
  const q = new URLSearchParams(search);
  if (!q.has("signup")) return "sign-in";
  const v = (q.get("signup") ?? "").trim().toLowerCase();
  return v === "0" || v === "false" || v === "no" ? "sign-in" : "sign-up";
}
