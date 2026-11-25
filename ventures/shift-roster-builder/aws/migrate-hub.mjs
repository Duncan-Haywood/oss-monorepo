#!/usr/bin/env node
// Move a self-hosted hub (server.mjs on your server, or hub-worker.mjs on Cloudflare) into the hosted hub.
//   HUB_ADMIN_URL='https://old-hub.example/admin?key=...' HOSTED_URL='https://hub.marisstella.app' \
//   HOSTED_TOKEN='<your Cognito access token>' node aws/migrate-hub.mjs [--name "Cafe"] [--settings settings.json]
// 1. reads the old hub's /admin/export.json (admin key required); 2. creates a hosted team with that state and the
// settings you pass (the same names as the self-host env: TIMEZONE, PAY_RULES, ...); 3. prints the new admin and
// team links. The old hub is not changed: run both until your staff use the new team link, then turn the old one off.
// Nothing is written to disk; the links are printed once.
export async function migrateHub({ adminUrl, hostedUrl, token, name = "My team", settings = {}, fetchImpl = fetch }) {
  const a = new URL(adminUrl);
  if (!a.searchParams.get("key")) throw new Error("HUB_ADMIN_URL must be the admin link, with ?key=");
  const exp = new URL("/admin/export.json", a);
  exp.searchParams.set("key", a.searchParams.get("key"));
  const r = await fetchImpl(exp.toString());
  if (!r.ok) throw new Error(`export failed: ${r.status} (is the old hub up to date? /admin/export.json landed 2026-11-25)`);
  const state = await r.json();
  const c = await fetchImpl(new URL("/api/teams", hostedUrl).toString(), {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ name, settings, state }),
  });
  const out = await c.json().catch(() => ({}));
  if (c.status !== 201) throw new Error(`create failed: ${c.status} ${out.error || ""}`.trim());
  return { ...out, counts: { staffLines: String(state.staff || "").split("\n").filter(Boolean).length, punches: (state.punches || []).length, history: (state.history || []).length } };
}

if (process.argv[1] && import.meta.url === (await import("node:url")).pathToFileURL(process.argv[1]).href) {
  const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
  const { HUB_ADMIN_URL, HOSTED_URL, HOSTED_TOKEN } = process.env;
  if (!HUB_ADMIN_URL || !HOSTED_URL || !HOSTED_TOKEN) { console.error("set HUB_ADMIN_URL, HOSTED_URL and HOSTED_TOKEN"); process.exit(2); }
  const settingsFile = arg("--settings");
  const settings = settingsFile ? JSON.parse((await import("node:fs")).readFileSync(settingsFile, "utf8")) : {};
  const r = await migrateHub({ adminUrl: HUB_ADMIN_URL, hostedUrl: HOSTED_URL, token: HOSTED_TOKEN, name: arg("--name"), settings });
  console.log(`Moved: ${r.counts.staffLines} staff-list lines, ${r.counts.punches} punches, ${r.counts.history} past weeks.`);
  console.log(`Admin link (keep private): ${r.admin_url}\nTeam link (share with staff): ${r.team_url}`);
}
