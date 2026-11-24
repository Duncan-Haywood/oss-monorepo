#!/usr/bin/env node
// Entry point. Configuration is environment variables only (see .env.example).
import { createServer } from "node:http";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openStore } from "./store.mjs";
import { openAiAnalyzer } from "./analyze.mjs";
import { Auth, DEFAULT_REDIRECT_PREFIXES } from "./auth.mjs";
import { createApp } from "./app.mjs";
import { runMaintenance } from "./pipeline.mjs";
import { seedFromLocalConfig } from "./policy.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const env = process.env;

function required(name) {
  const v = env[name];
  if (!v || v.length < 24) {
    console.error(`${name} must be set to a random string of at least 24 characters (try: openssl rand -base64 32)`);
    process.exit(1);
  }
  return v;
}

const port = Number(env.PORT || 8787);
const baseUrl = env.PUBLIC_BASE_URL || `http://localhost:${port}`;
const dbPath = env.DATABASE_PATH || join(here, "data", "nutrition.sqlite");
if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });

const store = openStore(dbPath);
const localConfig = join(here, "config.local.json");
if (existsSync(localConfig) && seedFromLocalConfig(store, JSON.parse(readFileSync(localConfig, "utf8")))) console.log("seeded settings from config.local.json");

const auth = new Auth(store, {
  baseUrl,
  ownerPassword: required("OWNER_PASSWORD"),
  apiTokens: (env.API_TOKEN || "").split(",").map((s) => s.trim()),
  deviceTokens: [required("DEVICE_TOKEN")],
  redirectPrefixes: env.OAUTH_REDIRECT_PREFIXES ? env.OAUTH_REDIRECT_PREFIXES.split(",").map((s) => s.trim()) : DEFAULT_REDIRECT_PREFIXES,
});
if (env.OAUTH_STATIC_CLIENT) {
  const [id, secret, ...rest] = env.OAUTH_STATIC_CLIENT.split(":");
  auth.addStaticClient(id, secret, rest.join(":"));
}

const analyzer = openAiAnalyzer({ apiKey: env.NUTRITION_API_KEY || env.OPENAI_API_KEY, model: env.NUTRITION_MODEL || "gpt-5-mini", baseUrl: env.NUTRITION_API_BASE || "https://api.openai.com/v1" });
if (!analyzer) console.warn("No NUTRITION_API_KEY: photos will be accepted and queued, not analysed.");
if (!baseUrl.startsWith("https://")) console.warn(`PUBLIC_BASE_URL is ${baseUrl}; chat clients need a public https URL.`);

const server = createServer(createApp({ store, analyzer, auth }));
server.requestTimeout = 120000;
server.listen(port, () => console.log(`photo-nutrition-agent listening on :${port} (${baseUrl})`));

const ctx = { store, analyzer };
const tick = () => runMaintenance(ctx).catch((e) => console.error("maintenance", e));
const timer = setInterval(tick, 5 * 60000);
tick();

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    clearInterval(timer);
    server.close(() => {
      store.close();
      process.exit(0);
    });
  });
}
