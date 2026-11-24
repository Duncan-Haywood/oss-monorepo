# Install and deploy

You need: a small always-on server with HTTPS, an OpenAI API key (or another OpenAI-compatible vision endpoint), a Mac with Xcode, an iPhone, and a ChatGPT account.

## 1. Run the server

Node 22.5 or newer; no `npm install` (there are no dependencies).

```sh
cd ventures/photo-nutrition-agent/server
cp .env.example .env            # then fill it in; keep it out of git
export $(grep -v '^#' .env | xargs)
node server.mjs
```

| Variable | What |
|---|---|
| `PUBLIC_BASE_URL` | The public https URL, e.g. `https://nutrition.example.com` (used in OAuth metadata) |
| `OWNER_PASSWORD` | 24+ random characters; typed once when connecting ChatGPT/Claude |
| `DEVICE_TOKEN` | 24+ random characters; pasted into the iPhone app |
| `API_TOKEN` | Optional, comma-separated; bearer tokens for a Custom GPT's Actions or scripts |
| `NUTRITION_API_KEY` | OpenAI key (or compatible); without it photos are queued, not analysed |
| `NUTRITION_MODEL` | Default `gpt-5-mini`; any vision model supporting `json_schema` output |
| `NUTRITION_API_BASE` | Default `https://api.openai.com/v1` |
| `DATABASE_PATH` | Default `server/data/nutrition.sqlite`; back this file up |
| `OAUTH_REDIRECT_PREFIXES` | Override allowed OAuth redirect URI prefixes (default: chatgpt.com, chat.openai.com, claude.ai, claude.com, localhost) |
| `OAUTH_STATIC_CLIENT` | `id:secret:redirect-prefix` for a hand-configured OAuth client (Custom GPT OAuth) |

Generate secrets with `openssl rand -base64 32`.

**Hosting options** (pick one; all keep cost near zero for one person):

- **Docker on any VM:** `docker build -t pna server && docker run -d -p 8787:8787 --env-file server/.env -v pna-data:/app/data pna`, behind Caddy (`nutrition.example.com { reverse_proxy localhost:8787 }`, automatic TLS).
- **Fly.io:** `fly launch` in `server/` with the Dockerfile, a 1 GB volume mounted at `/app/data`, and `fly secrets set ...` for the variables.
- **A home server** plus Cloudflare Tunnel or Tailscale Funnel for the public https URL.

Personal targets: either set them later in chat ("set my calorie target to 2,200 and protein to 200 g"), or copy `config.example.json` to `config.local.json` (git-ignored) before the first start.

## 2. Build the iPhone agent

```sh
brew install xcodegen
cd ventures/photo-nutrition-agent/ios
# edit project.yml: bundleIdPrefix, DEVELOPMENT_TEAM, app group id (3 places)
xcodegen && open NutritionAgent.xcodeproj
```

Enable the HealthKit and App Groups capabilities for your team, then run it on your phone. A free Apple ID can sideload for 7 days; a paid developer account ($99/year) avoids re-signing every week.

## 3. First launch (the only setup screen)

1. Enter the server URL and `DEVICE_TOKEN`, then Save.
2. **Allow full photo access.** Choose "Allow Full Access"; limited access hides new photos.
3. **Allow Apple Health**, with write access to the nutrition types and read access to weight, body fat, lean mass, energy, steps, sleep and workouts.
4. Optional: set a retrospective start date to ingest past photos.

## 4. Make it automatic: the Camera-closed automation

Shortcuts → Automation → New → **App** → choose **Camera**, tick **Is Closed** → **Run Immediately**, and turn off **Notify When Run** → action **Sync Food Photos** (from Nutrition Agent), with Trigger set to `camera`.

Optional second automation: **Charger** → Is Connected → Sync Food Photos (Trigger `charger`), a nightly catch-up.

From now on, the routine is: take the photo, leave the Camera, put the phone away.

## 5. Connect ChatGPT

**Option A: developer mode (if your plan offers MCP apps with write actions).** ChatGPT web → Settings → Apps (or Connectors) → Advanced → enable Developer mode → Create → URL `https://<your-server>/mcp`, auth OAuth. ChatGPT discovers `/.well-known/oauth-protected-resource`, registers itself, and opens the password page; enter `OWNER_PASSWORD`. Write tools ask for confirmation by default.

**Option B: a Custom GPT (works on Plus, including in the iPhone app).** ChatGPT → GPTs → Create → Configure → Actions → Import from URL `https://<your-server>/openapi.json`. Authentication: API Key, Bearer, value = one of your `API_TOKEN`s. Suggested instructions:

> You manage my nutrition records through the Actions. Values with source "estimate" are visual estimates: give them as approximate and mention the range when it matters. To correct a meal, find it with find_meals or get_meals, then call update_meal. Use my targets from get_nutrition_targets. For trends, use get_nutrition_history, get_weight_history, get_energy_balance and get_body_composition_history, and repeat their caveats briefly.

**Claude (alternative):** Settings → Connectors → Add custom connector → `https://<your-server>/mcp` (OAuth, same password). It works from the Claude mobile apps too.

## 6. Check it works

In ChatGPT: "What's my processing status?", then take a food photo, leave the Camera, wait about 30 s, and ask "What did I just eat, and how many calories have I had today?" Then "That was 12 ounces of steak, not 8": the meal version increments, and Apple Health updates on the next wake (`get_sync_status` shows it pending until then).

## Backup, export, erase

- Back up `DATABASE_PATH` (SQLite; copy it while the server is stopped, or use `sqlite3 .backup`).
- `GET /api/export` (bearer `API_TOKEN`) downloads everything as JSON; `?images=1` includes retained images.
- `POST /api/restore` with that JSON restores it.
- `POST /api/erase` with `{"confirm": "erase everything"}` deletes all records and revokes OAuth tokens. Samples already in Apple Health stay there until you delete them in the Health app, or until the device applies deletions; erase the server last.
- Revoke access: rotate `OWNER_PASSWORD`/`API_TOKEN`/`DEVICE_TOKEN` and restart; remove the connector in ChatGPT; turn off Photos/Health access in iOS Settings.
