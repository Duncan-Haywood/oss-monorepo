// Real-browser check of index.html: serves this folder, drives headless Chromium.
// Run: node eval/browser-e2e.mjs   (needs Playwright + Chromium; not part of `node --test`)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import os from "node:os";
import { execFileSync } from "node:child_process";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const types = { ".html": "text/html", ".mjs": "text/javascript", ".gabc": "text/plain", ".md": "text/plain" };
const server = http.createServer((q, r) => {
  const f = path.join(root, decodeURIComponent(q.url.split("?")[0]).replace(/^\//, "") || "index.html");
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404).end(); return; }
  r.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream" }).end(fs.readFileSync(f));
}).listen(0);
const url = `http://127.0.0.1:${server.address().port}/index.html`;
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ acceptDownloads: true });
const problems = [], log = [];
page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") problems.push("console: " + m.text()); });
await page.goto(url);
const ok = (c, msg) => { log.push((c ? "ok   " : "FAIL ") + msg); if (!c) problems.push(msg); };
const out = () => page.locator("#out").textContent();
const pieces = await page.locator("#piece option").evaluateAll((o) => o.map((x) => x.value));
const genres = await page.locator("#genre option").evaluateAll((o) => o.map((x) => x.value));
for (const p of pieces) {
  await page.selectOption("#piece", p);
  if (p) await page.waitForFunction(() => document.querySelector("#src").value.includes("%%"));
  for (const g of genres) {
    await page.selectOption("#genre", g);
    await page.click("#go");
    const t = await out();
    const good = /notes,/.test(t) && !(await page.locator("#dlmid").isDisabled());
    ok(good, `${p || "default"} + ${g || "none"}: ${t.split("\n")[0].slice(0, 70)}`);
  }
}
// downloads
await page.selectOption("#piece", ""); await page.selectOption("#genre", "metal"); await page.click("#go");
const [d1] = await Promise.all([page.waitForEvent("download"), page.click("#dlmid")]);
const mid = fs.readFileSync(await d1.path());
ok(mid.subarray(0, 4).toString() === "MThd" && mid.length > 200, `MIDI download ${mid.length} bytes, header MThd`);
const [d2] = await Promise.all([page.waitForEvent("download"), page.click("#dlwav")]);
const wav = fs.readFileSync(await d2.path());
ok(wav.subarray(0, 4).toString() === "RIFF" && wav.subarray(8, 12).toString() === "WAVE" && wav.length > 100000, `WAV download ${wav.length} bytes, RIFF/WAVE`);
let peak = 0; for (let i = 44; i + 1 < wav.length; i += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(i)));
ok(peak > 1000, `WAV is not silent (peak ${peak}/32767)`);
const [d3] = await Promise.all([page.waitForEvent("download"), page.click("#dlcues")]);
const plain = fs.readFileSync(await d3.path(), "utf8");
ok(/^bar  beat  time\(s\)  note  beats  syllable\n/.test(plain) && !/\n-- /.test(plain) && plain.split("\n").length > 5, `cue sheet without sections has no guidance lines (${plain.split("\n").length - 2} note rows)`);
// playback
await page.click("#play");
await page.waitForTimeout(300);
ok(!(await page.locator("#stop").isDisabled()), "Play enables Stop");
await page.click("#stop");
ok(await page.locator("#stop").isDisabled(), "Stop disables Stop");
// song sections: every sample with every genre plans sections and still converts
await page.selectOption("#sections", "1");
for (const p of pieces.filter(Boolean)) {
  await page.selectOption("#piece", p);
  await page.waitForFunction(() => document.querySelector("#src").value.includes("%%"));
  for (const g of genres.filter(Boolean)) {
    await page.selectOption("#genre", g);
    await page.click("#go");
    const t = await out();
    ok(/Sections: Intro bar 1-2.*Outro/.test(t) && !(await page.locator("#dlmid").isDisabled()), `sections ${p} + ${g}: ${(t.match(/Sections: .*/) || ["none"])[0].slice(0, 70)}`);
  }
}
// a long hymn gets a breakdown before its last drop (sections.mjs, four or more sections)
await page.selectOption("#piece", "Pange lingua, all six verses");
await page.waitForFunction(() => document.querySelector("#src").value.length > 2000);
await page.selectOption("#genre", "edm");
await page.click("#go");
{
  const t = await out();
  ok(/Drop 2 bar [^;]*; Breakdown bar [^;]*\(build\); Drop 3/.test(t), `six-verse hymn has a breakdown before the last drop: ${(t.match(/Sections: .*/) || ["none"])[0].slice(-90)}`);
}
// a cappella first verse and a whole-tone lift into the last drop, fitted to E2-E4 with the lift
await page.selectOption("#acap", "1");
await page.selectOption("#lift", "2");
await page.click("#go");
{
  const t = await out();
  ok(/Verse 1 \(a cappella\) bar [^;]*\(build\)/.test(t) && /Drop 3 bar [^;]*\(key up 2\)/.test(t), `a cappella verse and lifted last drop: ${(t.match(/Sections: .*/) || ["none"])[0].slice(0, 60)}`);
  ok(/after the lift\), which keeps it inside E2-E4, the lifted last drop included/.test(t), "the E2-E4 fit counts the lifted drop");
  const [lo, hi] = t.match(/notes, (\S+)-(\S+) \(ambitus/).slice(1);
  ok(/[23]$/.test(lo) && (/[23]$/.test(hi) || /^(C|C#|D|Eb|E)4$/.test(hi)), `range with the lift inside E2-E4: ${lo}-${hi}`);
  ok(!(await page.locator("#dlwav").isDisabled()), "lifted arrangement renders");
}
// the cue sheet download is the CLI's --cues sheet for the same options, byte for byte
{
  const t = await out();
  ok(/Singer cues \(also in the cue sheet download\):\nVerse 1 \(a cappella\), bar 3, [\d.]+ s: Choir alone/.test(t) && /\nDrop 3, bar \d+, [\d.]+ s: Full band, key up 2 semitones\./.test(t), "singer cue lines shown under the summary");
  const [d] = await Promise.all([page.waitForEvent("download"), page.click("#dlcues")]);
  const sheet = fs.readFileSync(await d.path(), "utf8");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cues-"));
  execFileSync(process.execPath, [path.join(root, "cli.mjs"), path.join(root, "corpus/pange-lingua-full.gabc"), "--auto-final", "--fit", "8", "--stretch", "--genre", "edm", "--sections", "--intro", "2", "--outro", "2", "--a-cappella", "--key-lift", "2", "--cues", path.join(tmp, "c.txt"), "--lrc", path.join(tmp, "l.lrc")]);
  const cli = fs.readFileSync(path.join(tmp, "c.txt"), "utf8");
  const guides = sheet.split("\n").filter((l) => l.startsWith("-- ")).length;
  ok(sheet === cli && guides >= 5, `cue sheet download equals the CLI's --cues (${sheet.split("\n").length - 2} lines, ${guides} guidance lines, ${d.suggestedFilename()})`);
  const [d2] = await Promise.all([page.waitForEvent("download"), page.click("#dllrc")]);
  const l = fs.readFileSync(await d2.path(), "utf8");
  ok(l === fs.readFileSync(path.join(tmp, "l.lrc"), "utf8") && /^\[ti:/.test(l), `LRC download equals the CLI's --lrc (${l.split("\n").length - 1} lines)`);
}
// phrase markers: the MIDI download equals the CLI's --markers file for the same options, and the
// stems ZIP holds the same WAVs as render-cli.mjs --stems on that MIDI, summing to the preview mix
{
  await page.selectOption("#markers", "1");
  await page.click("#go");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "stems-"));
  execFileSync(process.execPath, [path.join(root, "cli.mjs"), path.join(root, "corpus/pange-lingua-full.gabc"), "--auto-final", "--fit", "8", "--stretch", "--genre", "edm", "--sections", "--intro", "2", "--outro", "2", "--a-cappella", "--key-lift", "2", "--markers", "-o", path.join(tmp, "cli.mid")]);
  const [dm] = await Promise.all([page.waitForEvent("download"), page.click("#dlmid")]);
  const mid = fs.readFileSync(await dm.path());
  const cliMid = fs.readFileSync(path.join(tmp, "cli.mid"));
  const phrases = (mid.toString("latin1").match(/\xff\x06[\s\S]Phrase \d+/g) || []).length;
  ok(mid.equals(cliMid) && phrases >= 10, `MIDI with phrase markers equals the CLI's --markers (${mid.length} bytes, ${phrases} phrase markers)`);
  const [dz] = await Promise.all([page.waitForEvent("download"), page.click("#dlstems")]);
  fs.writeFileSync(path.join(tmp, "chant-stems.zip"), fs.readFileSync(await dz.path()));
  execFileSync("unzip", ["-q", path.join(tmp, "chant-stems.zip"), "-d", path.join(tmp, "page")]);
  fs.writeFileSync(path.join(tmp, "chant.mid"), mid);
  execFileSync(process.execPath, [path.join(root, "render-cli.mjs"), path.join(tmp, "chant.mid"), "-o", path.join(tmp, "chant.wav"), "--stems", path.join(tmp, "cli")]);
  const names = fs.readdirSync(path.join(tmp, "page")).sort();
  const same = names.length >= 4 && names.join() === fs.readdirSync(path.join(tmp, "cli")).sort().join() && names.every((n) => fs.readFileSync(path.join(tmp, "page", n)).equals(fs.readFileSync(path.join(tmp, "cli", n))));
  ok(same && dz.suggestedFilename() === "chant-stems.zip", `stems ZIP equals render-cli --stems (${names.join(", ")})`);
  // the stems sum to the preview mix (16-bit rounding: each stem is off by at most half a step)
  const [dw] = await Promise.all([page.waitForEvent("download"), page.click("#dlwav")]);
  const mix = fs.readFileSync(await dw.path());
  const stems = names.map((n) => fs.readFileSync(path.join(tmp, "page", n)));
  let worst = 0;
  for (let i = 44; i + 1 < mix.length; i += 2) worst = Math.max(worst, Math.abs(stems.reduce((s, b) => s + b.readInt16LE(i), 0) - mix.readInt16LE(i)));
  ok(stems.every((b) => b.length === mix.length) && worst <= names.length, `stems sum to the preview mix within ${worst} of 32767 (rounding)`);
  await page.selectOption("#markers", "");
}
// split voices: the full Dies irae, tenors and basses by phrase; cue sheet and MIDI equal the CLI's --split-voices
{
  await page.selectOption("#genre", ""); await page.selectOption("#sections", "");
  await page.selectOption("#acap", ""); await page.selectOption("#lift", "0");
  await page.selectOption("#piece", "Dies irae");
  await page.waitForFunction(() => document.querySelector("#src").value.includes("Dies irae;"));
  await page.selectOption("#final", "split");
  await page.click("#go");
  const t = await out();
  ok(/Voices: full choir on 600 of 613 notes \(C3-E4\); tenors alone on phrase 54 \(13 notes\); final F3/.test(t), "split voices summary on the Dies irae");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "split-"));
  execFileSync(process.execPath, [path.join(root, "cli.mjs"), path.join(root, "corpus/dies-irae.gabc"), "--split-voices", "--fit", "8", "--stretch", "-o", path.join(tmp, "s.mid"), "--cues", path.join(tmp, "s.txt")]);
  const [dc] = await Promise.all([page.waitForEvent("download"), page.click("#dlcues")]);
  const sheet = fs.readFileSync(await dc.path(), "utf8");
  ok(sheet === fs.readFileSync(path.join(tmp, "s.txt"), "utf8") && /who/.test(sheet.split("\n")[0]), "split cue sheet equals the CLI's --split-voices --cues");
  const [dm] = await Promise.all([page.waitForEvent("download"), page.click("#dlmid")]);
  const mid = fs.readFileSync(await dm.path());
  ok(mid.equals(fs.readFileSync(path.join(tmp, "s.mid"))) && mid.includes("Tenors") && mid.includes("Basses"), `split MIDI equals the CLI's (${mid.length} bytes, Tenors and Basses tracks)`);
  // the score download is the CLI's --musicxml for the same options, byte for byte
  execFileSync(process.execPath, [path.join(root, "cli.mjs"), path.join(root, "corpus/dies-irae.gabc"), "--split-voices", "--fit", "8", "--stretch", "--musicxml", path.join(tmp, "s.musicxml")]);
  const [dx] = await Promise.all([page.waitForEvent("download"), page.click("#dlxml")]);
  const score = fs.readFileSync(await dx.path(), "utf8");
  ok(score === fs.readFileSync(path.join(tmp, "s.musicxml"), "utf8") && score.includes("<part-name>Basses</part-name>"), `split score equals the CLI's --musicxml (${score.length} characters, Tenors and Basses parts)`);
  // rehearsal tracks: the ZIP holds the same WAVs as render-cli.mjs --learn on the split MIDI
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#dllearn")]);
  fs.writeFileSync(path.join(tmp, "chant-rehearsal.zip"), fs.readFileSync(await dl.path()));
  execFileSync("unzip", ["-q", path.join(tmp, "chant-rehearsal.zip"), "-d", path.join(tmp, "learn-page")]);
  fs.writeFileSync(path.join(tmp, "chant.mid"), mid);
  execFileSync(process.execPath, [path.join(root, "render-cli.mjs"), path.join(tmp, "chant.mid"), "-o", path.join(tmp, "chant.wav"), "--learn", path.join(tmp, "learn-cli")]);
  const ln = fs.readdirSync(path.join(tmp, "learn-page")).sort();
  const lsame = ln.join() === "chant-basses-minus.wav,chant-basses-part.wav,chant-tenors-minus.wav,chant-tenors-part.wav" && ln.join() === fs.readdirSync(path.join(tmp, "learn-cli")).sort().join() && ln.every((n) => fs.readFileSync(path.join(tmp, "learn-page", n)).equals(fs.readFileSync(path.join(tmp, "learn-cli", n))));
  ok(lsame && dl.suggestedFilename() === "chant-rehearsal.zip", `rehearsal ZIP equals render-cli --learn (${ln.join(", ")})`);
  // handing over at a word too: equals the CLI's --split-words
  await page.selectOption("#final", "splitwords");
  await page.click("#go");
  const tw = await out();
  ok(/phrase 54 handed over at a word: tenors "Judicándus", all "homo reus:"; final F3/.test(tw), "split-at-a-word summary on the Dies irae");
  execFileSync(process.execPath, [path.join(root, "cli.mjs"), path.join(root, "corpus/dies-irae.gabc"), "--split-voices", "--split-words", "--fit", "8", "--stretch", "-o", path.join(tmp, "w.mid"), "--cues", path.join(tmp, "w.txt")]);
  const [dwc] = await Promise.all([page.waitForEvent("download"), page.click("#dlcues")]);
  ok(fs.readFileSync(await dwc.path(), "utf8") === fs.readFileSync(path.join(tmp, "w.txt"), "utf8"), "split-at-a-word cue sheet equals the CLI's --split-words --cues");
  const [dwm] = await Promise.all([page.waitForEvent("download"), page.click("#dlmid")]);
  ok(fs.readFileSync(await dwm.path()).equals(fs.readFileSync(path.join(tmp, "w.mid"))), "split-at-a-word MIDI equals the CLI's");
  // three sections: equals the CLI's --baritones
  await page.selectOption("#final", "split3");
  await page.click("#go");
  const t3 = await out();
  ok(/tenors and baritones together on phrase 54 \(13 notes\); final F3\. The MIDI has a Tenors, a Baritones and a Basses track/.test(t3), "three-section summary on the Dies irae");
  execFileSync(process.execPath, [path.join(root, "cli.mjs"), path.join(root, "corpus/dies-irae.gabc"), "--split-voices", "--baritones", "--fit", "8", "--stretch", "-o", path.join(tmp, "b.mid"), "--cues", path.join(tmp, "b.txt")]);
  const [dbc] = await Promise.all([page.waitForEvent("download"), page.click("#dlcues")]);
  const sheet3 = fs.readFileSync(await dbc.path(), "utf8");
  ok(sheet3 === fs.readFileSync(path.join(tmp, "b.txt"), "utf8") && /T\+Bar/.test(sheet3), "three-section cue sheet equals the CLI's --baritones --cues (T+Bar rows)");
  const [dbm] = await Promise.all([page.waitForEvent("download"), page.click("#dlmid")]);
  const mid3 = fs.readFileSync(await dbm.path());
  ok(mid3.equals(fs.readFileSync(path.join(tmp, "b.mid"))) && mid3.includes("Baritones"), `three-section MIDI equals the CLI's (${mid3.length} bytes, Baritones track)`);
  // four sections (TTBB): equals the CLI's --baritones --second-tenors
  await page.selectOption("#final", "split4");
  await page.click("#go");
  const t4 = await out();
  ok(/first tenors, second tenors and baritones together on phrase 54 \(13 notes\); final F3\. The MIDI has a First tenors, a Second tenors, a Baritones and a Basses track/.test(t4), "four-section summary on the Dies irae");
  execFileSync(process.execPath, [path.join(root, "cli.mjs"), path.join(root, "corpus/dies-irae.gabc"), "--split-voices", "--baritones", "--second-tenors", "--fit", "8", "--stretch", "-o", path.join(tmp, "q.mid"), "--cues", path.join(tmp, "q.txt")]);
  const [dqc] = await Promise.all([page.waitForEvent("download"), page.click("#dlcues")]);
  const sheet4 = fs.readFileSync(await dqc.path(), "utf8");
  ok(sheet4 === fs.readFileSync(path.join(tmp, "q.txt"), "utf8") && /T1\+T2\+Bar/.test(sheet4), "four-section cue sheet equals the CLI's --second-tenors --cues (T1+T2+Bar rows)");
  const [dqm] = await Promise.all([page.waitForEvent("download"), page.click("#dlmid")]);
  const mid4 = fs.readFileSync(await dqm.path());
  ok(mid4.equals(fs.readFileSync(path.join(tmp, "q.mid"))) && mid4.includes("Second tenors"), `four-section MIDI equals the CLI's (${mid4.length} bytes, Second tenors track)`);
  // a named choir: octave-wide sections, three of them; equals the CLI's --choir octave --baritones
  await page.selectOption("#choir", "octave");
  await page.selectOption("#final", "split3");
  await page.click("#go");
  ok(/Voices: full choir on 7 of 613 notes \(E3-A3\)/.test(await out()), "octave choir, three sections: summary on the Dies irae");
  execFileSync(process.execPath, [path.join(root, "cli.mjs"), path.join(root, "corpus/dies-irae.gabc"), "--choir", "octave", "--split-voices", "--baritones", "--fit", "8", "--stretch", "-o", path.join(tmp, "o.mid"), "--cues", path.join(tmp, "o.txt")]);
  const [doc] = await Promise.all([page.waitForEvent("download"), page.click("#dlcues")]);
  ok(fs.readFileSync(await doc.path(), "utf8") === fs.readFileSync(path.join(tmp, "o.txt"), "utf8"), "octave-choir cue sheet equals the CLI's --choir octave --baritones --cues");
  const [dom] = await Promise.all([page.waitForEvent("download"), page.click("#dlmid")]);
  ok(fs.readFileSync(await dom.path()).equals(fs.readFileSync(path.join(tmp, "o.mid"))), "octave-choir MIDI equals the CLI's");
  // unison with a named choir that cannot sing it: the note names the fewest sections that can
  await page.selectOption("#final", "auto");
  await page.click("#go");
  ok(/more than E3-A3; left as written\. The octave choir can sing it as tenors, baritones and basses/.test(await out()), "octave choir, unison: names the fewest sections");
  await page.selectOption("#choir", "");
  // a pasted range test (sections in the file) wins over the presets; equals the CLI's --singers
  const rt = path.join(root, "examples/range-test-sections.csv");
  await page.fill("#singers", fs.readFileSync(rt, "utf8"));
  await page.selectOption("#final", "split3");
  await page.click("#go");
  ok(/Range test: tenors Eb3-F4 \(3\), baritones C3-E4 \(3\), basses Bb2-C4 \(3\); unison Eb3-C4\./.test(await out()), "range test: section report on the page");
  execFileSync(process.execPath, [path.join(root, "cli.mjs"), path.join(root, "corpus/dies-irae.gabc"), "--singers", rt, "--split-voices", "--fit", "8", "--stretch", "-o", path.join(tmp, "s.mid"), "--cues", path.join(tmp, "s.txt")]);
  const [dsc] = await Promise.all([page.waitForEvent("download"), page.click("#dlcues")]);
  ok(fs.readFileSync(await dsc.path(), "utf8") === fs.readFileSync(path.join(tmp, "s.txt"), "utf8"), "range-test cue sheet equals the CLI's --singers --split-voices --cues");
  const [dsm] = await Promise.all([page.waitForEvent("download"), page.click("#dlmid")]);
  ok(fs.readFileSync(await dsm.path()).equals(fs.readFileSync(path.join(tmp, "s.mid"))), "range-test MIDI equals the CLI's");
  // unsectioned: unison does not fit, the note names what does
  await page.fill("#singers", fs.readFileSync(path.join(root, "examples/range-test.csv"), "utf8"));
  await page.selectOption("#final", "auto");
  await page.click("#go");
  ok(/singers divided by range[\s\S]*Your singers can sing it as tenors and basses/.test(await out()), "range test, unison: names the fewest sections");
  // --sit-out on the page: the sectioned test, one a section, split by phrase; MIDI equals the CLI's
  await page.fill("#singers", fs.readFileSync(rt, "utf8"));
  await page.selectOption("#sitout", "1");
  await page.selectOption("#final", "split3");
  await page.click("#go");
  ok(/Range test: tenors D3-G4 \(3\), baritones B2-F4 \(3\), basses A2-D4 \(3\); unison D3-D4, up to 1 a section sitting out a note\./.test(await out()), "sit-out: widened section report on the page");
  ok(/Sitting out: Singer /.test(await out()), "sit-out: names who sits out what");
  execFileSync(process.execPath, [path.join(root, "cli.mjs"), path.join(root, "corpus/dies-irae.gabc"), "--singers", rt, "--sit-out", "1", "--split-voices", "--fit", "8", "--stretch", "-o", path.join(tmp, "so.mid")]);
  const [dso] = await Promise.all([page.waitForEvent("download"), page.click("#dlmid")]);
  ok(fs.readFileSync(await dso.path()).equals(fs.readFileSync(path.join(tmp, "so.mid"))), "sit-out MIDI equals the CLI's --sit-out 1");
  await page.selectOption("#sitout", "0");
  await page.fill("#singers", "");
  // back to the state the next check expects
  await page.selectOption("#genre", "edm"); await page.selectOption("#sections", "1");
  await page.selectOption("#acap", "1"); await page.selectOption("#lift", "2");
}
// one-section piece: the options are left out with a note, not an error
await page.selectOption("#piece", "Pange lingua");
await page.waitForFunction(() => document.querySelector("#src").value.length < 2000);
await page.click("#go");
ok(/one section .* left out/.test(await out()) && !(await page.locator("#dlmid").isDisabled()), "one-section chant: options left out with a note");
await page.selectOption("#acap", ""); await page.selectOption("#lift", "0");
await page.selectOption("#sections", "");
// choir voice: the sung preview equals render-cli.mjs --sing on the page's own MIDI, and differs from the pad
{
  await page.selectOption("#piece", "Dies irae");
  await page.waitForFunction(() => document.querySelector("#src").value.includes("%%"));
  await page.selectOption("#genre", "");
  await page.selectOption("#voice", "sing");
  await page.click("#go");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sing-"));
  const [dm] = await Promise.all([page.waitForEvent("download"), page.click("#dlmid")]);
  fs.writeFileSync(path.join(tmp, "chant.mid"), fs.readFileSync(await dm.path()));
  const [dw] = await Promise.all([page.waitForEvent("download"), page.click("#dlwav")]);
  const sungWav = fs.readFileSync(await dw.path());
  execFileSync(process.execPath, [path.join(root, "render-cli.mjs"), path.join(tmp, "chant.mid"), "-o", path.join(tmp, "sing.wav"), "--sing"]);
  execFileSync(process.execPath, [path.join(root, "render-cli.mjs"), path.join(tmp, "chant.mid"), "-o", path.join(tmp, "pad.wav")]);
  ok(sungWav.equals(fs.readFileSync(path.join(tmp, "sing.wav"))) && !sungWav.equals(fs.readFileSync(path.join(tmp, "pad.wav"))), `sung preview WAV equals render-cli --sing (${sungWav.length} bytes) and differs from the pad`);
  await page.selectOption("#voice", "");
}
// the release folder (2026-11-16): the page's ZIP unzips to a folder release-cli.mjs passes but for the owner's steps
{
  await page.selectOption("#piece", "Veni Creator");
  await page.waitForFunction(() => document.querySelector("#src").value.includes("%%"));
  await page.selectOption("#genre", "deep-house");
  await page.selectOption("#voice", "sing");
  await page.click("#go");
  const t0 = Date.now();
  const [dr] = await Promise.all([page.waitForEvent("download", { timeout: 180000 }), page.click("#dlrel")]);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rel-"));
  fs.writeFileSync(path.join(tmp, "rel.zip"), fs.readFileSync(await dr.path()));
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  execFileSync("unzip", ["-q", path.join(tmp, "rel.zip"), "-d", path.join(tmp, "rel")]);
  const names = execFileSync("find", [path.join(tmp, "rel"), "-type", "f"], { encoding: "utf8" }).trim().split("\n").map((f) => path.relative(path.join(tmp, "rel"), f)).sort();
  ok(names.length === 7 && names.includes("cover.png") && names.includes("release.json") && names.some((n) => /^tracks\/01-.*\.wav$/.test(n)), `release ZIP in ${secs} s: ${names.join(", ")}`);
  let code = 0, text = "";
  try { text = execFileSync(process.execPath, [path.join(root, "release-cli.mjs"), path.join(tmp, "rel", "release.json")], { encoding: "utf8" }); }
  catch (e) { code = e.status; text = String(e.stdout); }
  const fails = text.split("\n").filter((l) => /^FAIL/.test(l));
  ok(fails.length === 4 && fails.every((l) => /artist|p-line|c-line|ISRC/.test(l)), `release-cli on the page's folder: only owner steps fail (${fails.length}: ${fails.map((l) => l.split(":")[0]).join("; ")})`);
  ok(/No build faults/.test(await out()) && /Yours to fill in/.test(await out()), "the page reports no build faults and lists the owner steps");
  await page.fill("#relartist", "Name"); await page.fill("#relisrc", "QZ-ABC-27-00001");
  const [dr2] = await Promise.all([page.waitForEvent("download", { timeout: 180000 }), page.click("#dlrel")]);
  fs.writeFileSync(path.join(tmp, "rel2.zip"), fs.readFileSync(await dr2.path()));
  execFileSync("unzip", ["-q", path.join(tmp, "rel2.zip"), "-d", path.join(tmp, "rel2")]);
  let code2 = 0;
  try { execFileSync(process.execPath, [path.join(root, "release-cli.mjs"), path.join(tmp, "rel2", "release.json")], { encoding: "utf8" }); } catch (e) { code2 = e.status; }
  ok(code2 === 0 && /No owner steps left/.test(await out()), `with an artist and ISRC typed in, release-cli passes the page's folder (exit ${code2})`);
  await page.fill("#relartist", ""); await page.fill("#relisrc", "");
  await page.selectOption("#voice", ""); await page.selectOption("#genre", "");
}
// the EP queue (2026-11-16): three chants with their own settings and ISRCs, reordered, kept over a
// reload, built into one folder release-cli.mjs passes
{
  const add = async (piece, genre, isrc) => {
    await page.selectOption("#piece", piece);
    await page.waitForFunction(() => document.querySelector("#src").value.includes("%%"));
    await page.selectOption("#genre", genre); await page.selectOption("#voice", "sing");
    await page.click("#go");
    await page.fill("#relisrc", isrc);
    await page.click("#epadd");
  };
  await add("Veni Creator", "deep-house", "QZ-ABC-27-00011");
  await add("Dies irae", "metal", "QZ-ABC-27-00012");
  await add("Pange lingua", "hard-rock", "QZ-ABC-27-00013");
  const items = () => page.locator("#eplist li").evaluateAll((l) => l.map((x) => x.firstChild.textContent));
  ok((await items()).length === 3 && (await page.inputValue("#relisrc")) === "", `three tracks queued, the ISRC box cleared after each: ${(await items()).join(" | ")}`);
  await page.click('#eplist button[aria-label^="Move up Pange"]');
  const order = await items();
  ok(/Veni/.test(order[0]) && /Pange/.test(order[1]) && /Dies/.test(order[2]), `Up moves Pange lingua to track 2: ${order.join(" | ")}`);
  await page.reload();
  ok((await items()).join() === order.join() && !(await page.locator("#dlep").isDisabled()), "the queue survives a reload (localStorage)");
  await page.fill("#relartist", "Name"); await page.fill("#reltitle", "Three");
  const t0 = Date.now();
  const [de] = await Promise.all([page.waitForEvent("download", { timeout: 300000 }), page.click("#dlep")]);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ep-"));
  fs.writeFileSync(path.join(tmp, "ep.zip"), fs.readFileSync(await de.path()));
  execFileSync("unzip", ["-q", path.join(tmp, "ep.zip"), "-d", path.join(tmp, "ep")]);
  const rel = JSON.parse(fs.readFileSync(path.join(tmp, "ep", "release.json"), "utf8"));
  ok(rel.tracks.length === 3 && rel.tracks.map((t) => t.isrc).join() === "QZ-ABC-27-00011,QZ-ABC-27-00013,QZ-ABC-27-00012"
    && rel.tracks.map((t) => t.source.gabcFile).join() === "sources/veni-creator.gabc,sources/pange-lingua.gabc,sources/dies-irae.gabc",
  `EP ZIP in ${secs} s: ${rel.tracks.map((t) => `${t.title} (${t.seconds} s)`).join(", ")}; each ISRC and corpus file name kept`);
  let code = 0, text = "";
  try { text = execFileSync(process.execPath, [path.join(root, "release-cli.mjs"), path.join(tmp, "ep", "release.json")], { encoding: "utf8" }); }
  catch (e) { code = e.status; text = String(e.stdout); }
  ok(code === 0 && /No owner steps left/.test(await out()), `release-cli passes the page's three-track folder (exit ${code}${code ? ": " + text.split("\n").filter((l) => /^FAIL/.test(l)).join("; ") : ""})`);
  await page.click('#eplist button[aria-label^="Remove Dies"]');
  ok((await items()).length === 2, "Remove drops a track");
  await page.click("#epclear");
  ok((await items()).length === 0 && (await page.locator("#dlep").isDisabled()), "Clear empties the queue");
  await page.fill("#relartist", ""); await page.fill("#reltitle", "");
  await page.selectOption("#voice", ""); await page.selectOption("#genre", "");
}
// organum: a second choir track a fourth below, named Organal voice
{
  const pieceNow = (await page.locator("#piece option").evaluateAll((o) => o.map((x) => x.value))).find((v) => /veni-creator\.gabc/.test(v)) || pieces.find(Boolean);
  await page.selectOption("#piece", pieceNow); await page.waitForFunction(() => document.querySelector("#src").value.includes("%%"));
  await page.selectOption("#genre", ""); await page.selectOption("#organum", "1"); await page.click("#go");
  const t = await out();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#dlmid")]);
  const m = fs.readFileSync(await dl.path());
  ok(/Organum: \d+ notes \(/.test(t) && m.includes(Buffer.from("Organal voice")), `organum: ${(t.match(/Organum:[^\n]*/) || ["no line"])[0].slice(0, 90)}`);
  await page.selectOption("#organum", "");
}
// errors
await page.fill("#src", "hello");
await page.click("#go");
ok(/No notes found/.test(await out()) && (await page.locator("#play").isDisabled()), "bad input shows message and disables buttons");
await page.fill("#bpm", "0"); await page.fill("#src", "mode: 1;\n%%\n(c4) A(f)men.(e)");
await page.click("#go");
ok(/Tempo/.test(await out()), "zero tempo is refused");
// phone width
await page.setViewportSize({ width: 375, height: 700 });
const over = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
ok(!over, "no horizontal scroll at 375px");
console.log(log.join("\n"));
await browser.close(); server.close();
if (problems.length) { console.error("\nPROBLEMS:\n" + problems.join("\n")); process.exit(1); }
console.log(`\nall ${log.length} checks passed`);
