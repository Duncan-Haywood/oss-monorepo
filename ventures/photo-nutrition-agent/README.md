# Photo Nutrition Agent

Take a photo of your food with the ordinary iPhone Camera app and put the phone away. The meal is recognised, its nutrition estimated, written to Apple Health, and available to ChatGPT (or Claude) to discuss and correct.

This is not a food diary app. It is infrastructure: a minimal iOS agent, a small server you run yourself, and a set of chat tools. After one-time setup the only recurring action is taking the photo.

**Status: prototype.**

| Part | State |
|---|---|
| Server (records, pipeline, MCP, OAuth, analytics) | Built; 36 tests passing (`node --test`) |
| iOS agent (`ios/`) | Source written; **not yet compiled or run on a device** |
| Live vision model call | Request shape tested against a fake; not yet run against a real key |
| ChatGPT Plus + MCP write tools | Unresolved: the Custom GPT path is the fallback ([research §4](docs/platform-research.md#4-chatgpt)) |

What has been shown, and what still needs a phone: [`docs/acceptance.md`](docs/acceptance.md).

## How it works

1. **Detection.** iOS never wakes an app when a photo is taken. The agent uses PhotoKit's persistent change history, so every run finds exactly what's new. Runs are triggered by a Shortcuts automation, "when Camera is closed", set up once with no prompt or banner. Background refresh and app opens catch up anything missed.
2. **Stage 1, on the phone.** Vision's built-in classifier (plus a text check for nutrition labels) decides whether a photo is food. Other photos never leave the phone.
3. **Upload.** Likely food photos are downscaled to about 1024 px, stripped of EXIF and GPS, and sent to *your* server with a device token.
4. **Stage 2, on the server.** A vision model returns items, grams, preparation, nutrients, an energy range, a consumption likelihood, and the photo's relation to a recent meal, under a strict JSON schema. The server checks the macros against the energy (4/4/9 kcal per gram), dedupes, groups photos into meals, links nutrition labels, and logs, marks provisional, or ignores, by a policy you can change.
5. **Apple Health.** The phone pulls a change feed and writes one sample per nutrient with `HKMetadataKeySyncIdentifier = pna:<meal>:<nutrient>` and the meal's version as `HKMetadataKeySyncVersion`. A correction replaces the old sample instead of adding one.
6. **Chat.** 20 tools over MCP (`/mcp`), plus the same tools as REST with an OpenAPI document (`/openapi.json`) for a Custom GPT. "That steak was 12 oz", "I only ate half", "two tablespoons of olive oil", "delete that, it was my friend's" each become a new meal version with an audit trail.

Why this design over on-device AI, photo-sync services, existing apps or a capture shortcut: [`docs/adr/0001-architecture.md`](docs/adr/0001-architecture.md).

## Install

[`docs/install.md`](docs/install.md): run the server (Node 22.5+, no dependencies, or Docker), build the iOS app with XcodeGen, set up the Camera-closed automation, and connect ChatGPT through developer mode or a Custom GPT.

```sh
cd server && node --test     # run the tests
```

## Records you can ask about

Daily totals with remaining targets; meals and their history; weekly averages and protein adherence; weight trend with a 95% interval; estimated expenditure and deficit from intake and weight change (with stated assumptions); and DEXA scans, including fat-mass and lean-mass changes between scans (share the report in chat and the model fills in `log_dexa_scan`).

Personal numbers (targets, height, goal weight) are **settings**, set in chat or in a git-ignored `config.local.json`. Nothing personal belongs in this repository.

## Documents

- [Platform research](docs/platform-research.md): what iOS, HealthKit and ChatGPT allow, with sources
- [Architecture decision](docs/adr/0001-architecture.md)
- [Implementation plan](docs/implementation-plan.md)
- [Acceptance criteria and the automation trial](docs/acceptance.md)
- [Limitations](docs/limitations.md)
- [Privacy](docs/privacy.md)

## Privacy

You run everything; this project operates no service. Non-food photos stay on the phone. Food photos go to your server and to the vision API you configure, and are deleted after 3 days by default (immediately, if judged not to be food). There is no analytics or tracking. Details: [`docs/privacy.md`](docs/privacy.md).

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not medical, nutritional or dietary advice, and it does not replace a qualified professional such as a physician or registered dietitian. Nutrition values estimated from photos are approximate. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or taken offline without notice. We do not promise uptime, backups of anything you type, or that a URL will keep working. Do not use this as a system of record. If a tool needs to survive, export your inputs and run it yourself.

## License

MIT, see [LICENSE](LICENSE).
