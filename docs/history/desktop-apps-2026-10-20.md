# Desktop apps channel: report and handoff (2026-10-20)

Owner direction 2026-10-20 (`prompts/goals.md`, "Direction: every platform,
not just the web") asked for the tools to ship as macOS, Windows and Linux apps
too. This is what one session built, what it checked, and what a later agent
still has to do.

## What landed

| Piece | File | State |
|---|---|---|
| Packager | `platform/distribution/desktop.mjs` | Done. Dry run, `--suites`, `--build <slug\|suite> <dir>`, `--winget …` |
| Tests | `platform/distribution/desktop.test.mjs` | 11 tests, all passing |
| Workflow | `.github/workflows/distribute-desktop.yml` | `workflow_dispatch` only, and only builds when `vars.DISTRIBUTE_DESKTOP == 'true'`. **Never run.** |
| Channel row | `portfolio/distribution/channels.yaml` (`desktop-apps`), README "Channel status" | Rung `artifact` |
| Attribution | `desktop` added to `REFS` (`platform/counter/counter.mjs`) and `CHANNEL_REFS` | Links from the app to the site carry `?ref=desktop` |
| Runner switch | `gitops/tests/test_ci_runner.py` `OS_MATRIX_JOBS` | The build job needs macOS and Windows runners, so it is exempt from `vars.CI_RUNNER`. The exemption is tested in both directions. |

### Design

- **Tauri v2.** Its installers use the system web view: WebView2 on Windows, WKWebView on macOS and WebKitGTK on Linux. Tauri is MIT/Apache-2.0. `package.json` pins `@tauri-apps/cli` 2.12.3, and the Cargo crates use `2`.
- **Input.** It accepts the same pages as the browser-extension packager (`webext.mjs`'s `buildExtension`): 1,213 of 1,285 ventures. Inline scripts are already moved to files, and pages that reach the network or load remote code are skipped.
- **Bundle layout.** `dist/` mirrors the site layout (`dist/<slug>/…`). `main.rs` gets a generated `PAGES` list. A bundled page loads in the window. A link to a site page that isn't bundled opens `BASE_URL + path?ref=desktop` in the system browser. Other http, https and mailto links also open in the browser, and nothing else loads. This matters because Tauri falls back to the root `index.html` for any missing path, which would otherwise show the wrong page.
- **Offline by construction:**
  - The CSP is `connect-src 'none'` and `script-src 'self'`.
  - There is no `capabilities/` directory, so the page can call no Tauri command.
  - `withGlobalTauri` is false.
  - Exports go to Downloads through `on_download`.
- **Suites.** A suite is a catalogue section (`ALL_CATEGORIES` in `platform/pages/build.mjs`, 14 of them, from 2 to 212 tools). It gets a launcher page, and each tool gets an "All tools" link back to it. The brief's "Research algorithms & ML" suite is `research-algorithms` (`RESEARCH_ALGORITHM_SLUGS`, landed in #8747 while this was in review). It builds all 3 tools: `node platform/distribution/desktop.mjs --build research-algorithms <dir>`. Only the one-tool shift-roster-builder project was compiled.
- **Icons.** `.ico` and `.icns` are built in JavaScript from the existing `renderIcon` PNGs, so no image tool is needed.
- **winget.** Each project gets three manifest templates (schema 1.6.0) with a placeholder URL and SHA-256. After a run, the workflow fills them from the release's `.msi` and attaches them.

## What was verified (and what was not)

Verified in the session container (Linux, Rust 1.x, `libwebkit2gtk-4.1-dev` installed with apt):

- The generated `shift-roster-builder` project ran `npx tauri build --bundles deb,appimage` with exit 0 and **no compiler errors or warnings**. Build time was 3 minutes cold.
- Sizes: a 3.6 MB executable, a **1.4 MB .deb** and an **80 MB .AppImage** (the AppImage carries its own WebKitGTK).
- Under Xvfb the binary rendered the tool's page offline, both before and after the change to the site-mirroring layout.
- Tests: `node --test platform/distribution/*.test.mjs platform/counter/*.test.mjs` gave 152 passed, 0 failed. `validate_workflows.py` reported all 541 valid. `pytest gitops/tests/test_ci_runner.py` failed 1, and that one also fails on `main` (see below).

**Not verified:**

- The macOS `.dmg` and the Windows `.msi`/`.exe` builds. No runner for either was available.
- The workflow itself. It has never been dispatched.
- Clicking through in-app links and running a CSV export inside the running app. Only rendering was checked, by screenshot.
- `gitops/tests/test_ci_runner.py::test_every_job_that_runs_python_or_node_sets_it_up` fails on `main` because of `portfolio-pages.yml:build`. That predates this work and was left alone.

## Handoff: instructions for the next agent

Do these in order. Each one is a separate PR, landed per `.github/prompts/land-your-work.md`.

1. **First workflow run (owner switch needed).** It is `DISTRIBUTE_DESKTOP=true` plus one manual dispatch with target `research-algorithms` (3 tools, the suite the brief named) or `learning` (2 tools). If the owner has not set the variable, ask once through `portfolio/ledger/decision_queue.py`, and only if no such row exists. Then read the run:
   - macOS: Tauri's ad-hoc signature is `signingIdentity: "-"`. If `tauri build` rejects it, drop the key.
   - Windows: the WiX `.msi` needs a version and product name WiX accepts. `productName()` already strips `&`, `/`, `:` and non-ASCII. If WiX still complains, look there first.
   - The release job's `gh release create` runs on the `CI_RUNNER` switch. The self-hosted image has no `gh`, so while the switch is self-hosted, change this to `curl` against the REST API.
2. **Interaction check on Linux.** Build `shift-roster-builder` as below and drive the window with `xdotool` under Xvfb, or by exposing the WebKit inspector. Click a sibling-guide link: it must open the browser (`xdg-open`) and leave the window alone. Run a CSV export: the file must land in `~/Downloads`. Fix `mainRs()` in `desktop.mjs` if either fails.
   ```
   node platform/distribution/desktop.mjs --build shift-roster-builder /tmp/d
   cd /tmp/d/shift-roster-builder && npm install && npx tauri build --bundles deb
   ```
   Install the apt packages first: `libwebkit2gtk-4.1-dev build-essential libssl-dev libayatana-appindicator3-dev librsvg2-dev file xvfb`.
3. **Signing (owner steps; do not ask for secrets in chat).** Once the owner adds Apple and Windows signing secrets, pass them as `env:` to the "Build unsigned installers" step. The variable names Tauri reads are listed in the generated BUILD.md. Also set `bundle.macOS.signingIdentity` from a secret instead of `-`.
4. **winget submission.** It is a PR to microsoft/winget-pkgs under the owner's account. That counts as publishing under the public name, so it is the owner's step. The manifests come attached to each release.
5. **Flatpak and Snap.** Neither is built. Add `flatpak/<id>.yml` (GNOME runtime plus the rust-stable SDK extension, cargo sources from `flatpak-cargo-generator.py`, no `--share=network`) and a `snapcraft.yaml` (`gnome` extension, strict confinement, no `network` plug) to `desktop.mjs`'s output. Test the shape the same way `ios.test.mjs` does. BUILD.md already describes both.
6. **Pick what to ship.** Store and winget rules penalise near-identical listings. Use `portfolio/usage/` readings, or failing that the flagships in `portfolio/flagships.yaml`, to pick 3 to 5 tools or suites people return to. Do not ship the whole catalogue.
