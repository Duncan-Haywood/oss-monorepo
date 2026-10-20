#!/usr/bin/env node
// @ts-check
// publish-kit: publish a podcast, an audiobook or a book from a folder of
// files and one publish.json. Built so an AI agent can drive it: every
// command takes --json, `plan` says what is missing and which command to run
// next, and exit codes are 0 (done), 1 (blocking findings) or 2 (usage error).
//
//   node cli.mjs --help

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, copyFileSync } from 'node:fs';
import { resolve, dirname, basename, join, relative } from 'node:path';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { probe, measureWavLoudness, hhmmss } from './media.mjs';
import { lintPodcast, buildPodcastFeed, buildShowPage, APPLE_CATEGORIES } from './podcast.mjs';
import { buildEpub, checkEpub, lintBook, checkCover, paperbackCover, buildPrintHtml, pdfPageCount, authorsOf, PAPER_INCHES_PER_PAGE } from './book.mjs';
import { checkAcx, ffmetadata, m4bCommands, titleFromFile } from './audiobook.mjs';
import { uuidv4, uuidv5, podcastGuid } from './util.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

export const DISCLAIMER = 'No warranty. publish-kit is provided free and as-is, without warranty of any kind. It is not legal or publishing-contract advice, and a clean report is not a promise that any store or directory will accept your work. You are responsible for reviewing and verifying its output before relying on it. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.';

export const HELP = `publish-kit: publish a podcast, audiobook or book from files + publish.json

Usage: publish-kit <command> [options]

Start
  init <podcast|audiobook|ebook> [dir] [--title T]   write a publish.json to fill in
  plan                                               what is missing, and the next command to run
  probe <file...>                                    duration, bitrate, size of audio/images

Podcast
  podcast add <audio> --title T [--description D] [--date ISO] [--season N]
              [--episode N] [--type full|trailer|bonus] [--url URL] [--transcript URL]
  podcast build [--out DIR]                          feed.xml + index.html (+ copies audio), validated
  podcast categories                                 Apple's category list

Audiobook
  audiobook check [files...]                         ACX/Audible requirements (WAV: loudness too)
  audiobook m4b [--out FILE] [--kbps 64] [--run]     chapters file + ffmpeg command for one .m4b
  audiobook feed [--out DIR]                         private/direct podcast-style feed of the chapters

Book
  ebook build [--out DIR]                            EPUB 3 from Markdown chapters, then checked
  ebook check <file.epub>                            container + package checks
  print interior [--out DIR] [--pdf]                 print-ready HTML at the trim size (--pdf: via Chromium)
  print cover (--pages N | --pdf FILE) [--trim 6x9] [--paper white|cream|standard-color|premium-color]
  cover <image> --for podcast|audiobook|ebook        cover art against the platform's spec

Options
  --project FILE   publish.json to use (default ./publish.json)
  --json           machine-readable output
  --help

Exit codes: 0 ok, 1 blocking findings, 2 usage error.

${DISCLAIMER}
`;

/** @typedef {{severity: string, field: string, message: string, fix?: string}} Finding */

class UsageError extends Error {}

/** @param {string[]} argv */
export function parseArgs(argv) {
  /** @type {string[]} */
  const pos = [];
  /** @type {Record<string, string|boolean>} */
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=', 2);
      if (v !== undefined) opts[k] = v;
      else if (i + 1 < argv.length && !argv[i + 1].startsWith('--') && !['json', 'help', 'run', 'force'].includes(k) && !(k === 'pdf' && pos[0] === 'print' && pos[1] === 'interior')) opts[k] = argv[++i];
      else opts[k] = true;
    } else pos.push(a);
  }
  return { pos, opts };
}

/** @param {string} path */
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
/** @param {string} path @param {unknown} data */
const writeJson = (path, data) => writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
/** @param {string} path */
const bytes = (path) => new Uint8Array(readFileSync(path));

const TEMPLATES = {
  podcast: (/** @type {string} */ title) => ({
    kind: 'podcast',
    show: {
      title, description: '', author: '', owner: { name: '', email: '' }, language: 'en',
      link: 'https://example.com/podcast/', feedUrl: 'https://example.com/podcast/feed.xml',
      baseUrl: 'https://example.com/podcast/audio/', image: 'https://example.com/podcast/cover.jpg',
      categories: ['Technology'], explicit: false, type: 'episodic', copyright: '',
    },
    episodes: [],
  }),
  audiobook: (/** @type {string} */ title) => ({
    kind: 'audiobook',
    book: { title, author: '', narrator: '', language: 'en', description: '', cover: 'cover.jpg', year: new Date().getFullYear() },
    tracks: [],
    feed: { email: '', link: 'https://example.com/audiobook/', feedUrl: 'https://example.com/audiobook/feed.xml', baseUrl: 'https://example.com/audiobook/audio/', image: 'https://example.com/audiobook/cover.jpg' },
  }),
  ebook: (/** @type {string} */ title) => ({
    kind: 'ebook',
    book: { title, subtitle: '', author: '', language: 'en', identifier: '', publisher: '', description: '', rights: '', subjects: [], cover: 'cover.jpg' },
    chapters: ['chapters/01.md'],
    print: { trim: '6x9', paper: 'cream' },
  }),
};

/**
 * @param {string[]} argv
 * @param {{cwd?: string, out?: (s: string) => void, env?: Record<string, string|undefined>}} [io]
 * @returns {Promise<number>} exit code
 */
export async function main(argv, io = {}) {
  const cwd = io.cwd ?? process.cwd();
  const print = io.out ?? ((s) => process.stdout.write(s + '\n'));
  const { pos, opts } = parseArgs(argv);
  const json = Boolean(opts.json);
  const projectPath = resolve(cwd, String(opts.project ?? 'publish.json'));
  const projectDir = dirname(projectPath);
  /** @param {unknown} data @param {string} text */
  const emit = (data, text) => print(json ? JSON.stringify(data, null, 2) : text);
  const loadProject = () => {
    if (!existsSync(projectPath)) throw new UsageError(`No ${relative(cwd, projectPath) || 'publish.json'} here. Start with: publish-kit init <podcast|audiobook|ebook>`);
    return readJson(projectPath);
  };
  /** @param {Finding[]} findings @param {string} [heading] */
  const report = (findings, heading = '') => {
    const lines = heading ? [heading] : [];
    if (!findings.length) lines.push('  No problems found.');
    for (const f of findings) lines.push(`  ${f.severity === 'danger' ? '✗' : '!'} ${f.field}: ${f.message}${f.fix ? `\n      → ${f.fix}` : ''}`);
    return lines.join('\n');
  };
  const blocking = (/** @type {Finding[]} */ f) => f.some((x) => x.severity === 'danger');

  try {
    const [cmd, sub, ...rest] = pos;
    if (!cmd || opts.help || cmd === 'help') { print(HELP); return cmd || opts.help ? 0 : 2; }

    if (cmd === 'init') {
      const kind = /** @type {keyof typeof TEMPLATES} */ (sub);
      if (!TEMPLATES[kind]) throw new UsageError('init takes podcast, audiobook or ebook');
      const dir = resolve(cwd, rest[0] ?? '.');
      const target = join(dir, 'publish.json');
      if (existsSync(target) && !opts.force) throw new UsageError(`${target} already exists (use --force to overwrite)`);
      mkdirSync(dir, { recursive: true });
      writeJson(target, TEMPLATES[kind](String(opts.title ?? basename(dir))));
      if (kind === 'ebook') {
        mkdirSync(join(dir, 'chapters'), { recursive: true });
        const ch = join(dir, 'chapters', '01.md');
        if (!existsSync(ch)) writeFileSync(ch, '# Chapter One\n\nWrite your first chapter here.\n');
      }
      emit({ created: target, kind }, `Created ${target}. Fill it in, then run: publish-kit plan`);
      return 0;
    }

    if (cmd === 'probe') {
      const files = [sub, ...rest].filter(Boolean);
      if (!files.length) throw new UsageError('probe needs at least one file');
      const results = files.map((f) => /** @type {Record<string, any>} */ ({ file: f, ...probe(bytes(resolve(cwd, f))) }));
      emit(results, results.map((r) => `${r.file}: ${r.error ? `error: ${r.error}` : describeMedia(r)}`).join('\n'));
      return results.some((r) => r.error) ? 1 : 0;
    }

    if (cmd === 'cover') {
      if (!sub) throw new UsageError('cover needs an image file');
      const target = String(opts.for ?? '');
      if (!['podcast', 'audiobook', 'ebook'].includes(target)) throw new UsageError('cover needs --for podcast|audiobook|ebook');
      const info = probe(bytes(resolve(cwd, sub)));
      const findings = checkCover(/** @type {any} */ (info), /** @type {any} */ (target));
      emit({ file: sub, image: info, findings }, report(findings, `${sub}: ${info.width}×${info.height} ${String(info.format).toUpperCase()}`));
      return blocking(findings) ? 1 : 0;
    }

    if (cmd === 'plan') {
      const project = loadProject();
      const plan = planFor(project, projectDir);
      emit(plan, [`${plan.kind}: ${plan.ready ? 'ready to build' : 'not ready yet'}`, report(plan.findings), '', 'Next:', ...plan.next.map((n) => `  ${n}`)].join('\n'));
      return plan.ready ? 0 : 1;
    }

    if (cmd === 'podcast') {
      if (sub === 'categories') {
        emit(APPLE_CATEGORIES, Object.entries(APPLE_CATEGORIES).map(([k, v]) => `${k}${v.length ? `\n  ${v.map((s) => `${k} > ${s}`).join('\n  ')}` : ''}`).join('\n'));
        return 0;
      }
      const project = loadProject();
      if (sub === 'add') {
        const file = rest[0];
        if (!file) throw new UsageError('podcast add needs an audio file');
        if (!opts.title) throw new UsageError('podcast add needs --title');
        const abs = resolve(cwd, file);
        const info = probe(bytes(abs));
        if (info.error) throw new UsageError(`${file}: ${info.error}`);
        const ep = {
          title: String(opts.title),
          ...(opts.description ? { description: String(opts.description) } : {}),
          file: relative(projectDir, abs),
          ...(opts.url ? { url: String(opts.url) } : {}),
          bytes: info.bytes, duration: info.duration, mime: info.mime,
          pubDate: new Date(String(opts.date ?? new Date().toISOString())).toISOString(),
          guid: uuidv4(),
          ...(opts.season ? { season: Number(opts.season) } : {}),
          ...(opts.episode ? { episode: Number(opts.episode) } : { episode: (project.episodes?.length ?? 0) + 1 }),
          episodeType: String(opts.type ?? 'full'),
          ...(opts.transcript ? { transcript: { url: String(opts.transcript), type: /\.srt$/i.test(String(opts.transcript)) ? 'application/srt' : 'text/vtt' } } : {}),
        };
        if (Number.isNaN(new Date(ep.pubDate).getTime())) throw new UsageError(`--date "${opts.date}" is not a date`);
        project.episodes = [...(project.episodes ?? []), ep];
        writeJson(projectPath, project);
        emit(ep, `Added episode ${ep.episode}: "${ep.title}" (${hhmmss(ep.duration)}, ${(ep.bytes / 1e6).toFixed(1)} MB). Next: publish-kit podcast build`);
        return 0;
      }
      if (sub === 'build') {
        const out = resolve(cwd, String(opts.out ?? join(projectDir, 'dist')));
        const result = buildPodcastSite(project, projectDir, out);
        emit(result, [
          report(result.findings, `Wrote ${relative(cwd, result.feed)} and ${relative(cwd, result.page)} (${project.episodes?.length ?? 0} episodes).`),
          result.copied.length ? `Copied ${result.copied.length} audio file(s) to ${relative(cwd, join(out, 'audio'))}/` : '',
          '',
          `Upload ${relative(cwd, out) || '.'}/ so ${project.show.feedUrl} serves feed.xml, then submit that feed URL to Apple Podcasts Connect, Spotify for Creators and Podcast Index.`,
        ].filter(Boolean).join('\n'));
        return blocking(result.findings) ? 1 : 0;
      }
      throw new UsageError('podcast takes add, build or categories');
    }

    if (cmd === 'audiobook') {
      if (sub === 'check') {
        const project = rest.length ? null : loadProject();
        const tracks = rest.length ? rest.map((f) => ({ file: f })) : (project?.tracks ?? []);
        if (!tracks.length) throw new UsageError('no tracks: list files, or add "tracks" to publish.json');
        const probed = tracks.map((/** @type {{file: string, title?: string}} */ t) => {
          const b = bytes(resolve(rest.length ? cwd : projectDir, t.file));
          const info = probe(b);
          return { ...t, info, ...(info.format === 'wav' ? { loudness: /** @type {any} */ (measureWavLoudness(b)) } : {}) };
        });
        const result = checkAcx(probed);
        /** @type {Finding[]} */
        let coverFindings = [];
        if (project?.book?.cover && existsSync(resolve(projectDir, project.book.cover))) {
          coverFindings = checkCover(/** @type {any} */ (probe(bytes(resolve(projectDir, project.book.cover)))), 'audiobook');
        }
        const findings = [...result.findings, ...coverFindings];
        emit({ ...result, findings, tracks: probed.map((t) => ({ file: t.file, ...t.info, ...(t.loudness ? { loudness: t.loudness } : {}) })) }, [
          ...result.files.map((f) => `  ${f.ok ? '✓' : '✗'} ${f.file}  ${f.duration}`),
          `Total ${hhmmss(result.totalSeconds)} in ${result.files.length} file(s).`,
          report(findings),
        ].join('\n'));
        return blocking(findings) ? 1 : 0;
      }
      const project = loadProject();
      const book = project.book ?? {};
      const tracks = /** @type {{file: string, title?: string, guid?: string}[]} */ (project.tracks ?? []);
      if (!tracks.length) throw new UsageError('publish.json has no "tracks" (list your chapter audio files in order)');
      const probed = tracks.map((t) => ({ ...t, abs: resolve(projectDir, t.file), info: probe(bytes(resolve(projectDir, t.file))) }));
      const bad = probed.find((t) => t.info.error);
      if (bad) throw new UsageError(`${bad.file}: ${bad.info.error}`);
      if (sub === 'm4b') {
        const out = resolve(cwd, String(opts.out ?? join(projectDir, 'dist', `${slug(book.title || 'audiobook')}.m4b`)));
        mkdirSync(dirname(out), { recursive: true });
        const metadataPath = join(dirname(out), 'chapters.ffmeta');
        const listPath = join(dirname(out), 'files.txt');
        writeFileSync(metadataPath, ffmetadata(book, probed.map((t) => ({ title: t.title || titleFromFile(t.file), duration: t.info.duration }))));
        const cover = book.cover && existsSync(resolve(projectDir, book.cover)) ? resolve(projectDir, book.cover) : undefined;
        const { list, cmd: ff } = m4bCommands({ files: probed.map((t) => t.abs), metadataPath, listPath, cover, out, kbps: Number(opts.kbps ?? 64) });
        writeFileSync(listPath, list);
        let ran = null;
        if (opts.run) {
          const r = spawnSync('sh', ['-c', ff], { stdio: json ? 'pipe' : 'inherit' });
          ran = { status: r.status, error: r.error?.message };
        }
        emit({ metadata: metadataPath, list: listPath, command: ff, ran }, `Wrote ${relative(cwd, metadataPath)} and ${relative(cwd, listPath)}.\n${opts.run ? (ran?.status === 0 ? `Built ${relative(cwd, out)}.` : 'ffmpeg failed (is it installed?).') : `Build the M4B with:\n  ${ff}`}`);
        return ran && ran.status !== 0 ? 1 : 0;
      }
      if (sub === 'feed') {
        const feed = project.feed ?? {};
        const pod = {
          kind: 'podcast',
          show: {
            title: book.title, description: book.description || book.title, author: authorsOf(book).join(', '),
            owner: { name: authorsOf(book)[0], email: feed.email ?? book.email }, language: book.language ?? 'en',
            link: feed.link, feedUrl: feed.feedUrl, baseUrl: feed.baseUrl, image: feed.image,
            categories: feed.categories ?? ['Arts > Books'], explicit: Boolean(book.explicit), type: 'serial', complete: true,
            locked: true, copyright: book.rights,
          },
          episodes: probed.map((t, i) => ({
            title: t.title || titleFromFile(t.file), file: t.file, bytes: t.info.bytes, duration: t.info.duration, mime: t.info.mime,
            // Same timestamp order as reading order, a minute apart, so apps that sort by date still play it in sequence.
            pubDate: new Date(Date.parse(feed.date ?? '2026-01-01T00:00:00Z') + i * 60000).toISOString(),
            guid: t.guid ?? uuidv5(t.file, feed.feedUrl ? podcastGuid(feed.feedUrl) : '00000000-0000-0000-0000-000000000000'),
            episode: i + 1, episodeType: 'full',
          })),
        };
        const out = resolve(cwd, String(opts.out ?? join(projectDir, 'dist')));
        const result = buildPodcastSite(/** @type {any} */ (pod), projectDir, out);
        emit(result, `${report(result.findings, `Wrote ${relative(cwd, result.feed)} (${pod.episodes.length} chapters, serial).`)}\nThe feed is podcast:locked and marked complete. Keep the URL private for buyers-only access, or submit it as a serial show.`);
        return blocking(result.findings) ? 1 : 0;
      }
      throw new UsageError('audiobook takes check, m4b or feed');
    }

    if (cmd === 'ebook') {
      if (sub === 'check') {
        const file = rest[0];
        if (!file) throw new UsageError('ebook check needs an .epub file');
        const findings = checkEpub(bytes(resolve(cwd, file)), { inflateRaw: (d) => new Uint8Array(inflateRawSync(d)) });
        emit({ file, findings }, report(findings, `${file}:`) + '\nFor the full content check stores run, also try EPUBCheck: https://www.w3.org/publishing/epubcheck/');
        return blocking(findings) ? 1 : 0;
      }
      if (sub === 'build') {
        const project = loadProject();
        const lint = lintBook(project);
        if (blocking(lint)) { emit({ findings: lint }, report(lint, 'Fix these first:')); return 1; }
        const { chapters, images } = loadChapters(project, projectDir);
        const coverPath = project.book.cover ? resolve(projectDir, project.book.cover) : null;
        const cover = coverPath && existsSync(coverPath) ? { data: bytes(coverPath), mime: /\.png$/i.test(coverPath) ? 'image/png' : 'image/jpeg' } : undefined;
        const css = project.css && existsSync(resolve(projectDir, project.css)) ? readFileSync(resolve(projectDir, project.css), 'utf8') : undefined;
        const built = buildEpub({ book: project.book, chapters, cover, images, css }, { deflateRaw: (d) => new Uint8Array(deflateRawSync(d, { level: 9 })) });
        const out = resolve(cwd, String(opts.out ?? join(projectDir, 'dist')));
        mkdirSync(out, { recursive: true });
        const file = join(out, `${slug(project.book.title)}.epub`);
        writeFileSync(file, built.epub);
        if (!project.book.identifier) { project.book.identifier = built.identifier; writeJson(projectPath, project); }
        /** @type {Finding[]} */
        const findings = [
          ...lint.filter((f) => f.field !== 'book.identifier'),
          ...built.missingImages.map((src) => ({ severity: 'danger', field: 'images', message: `Image "${src}" is referenced but was not found.` })),
          ...checkEpub(built.epub, { inflateRaw: (d) => new Uint8Array(inflateRawSync(d)) }),
          ...(cover ? checkCover(/** @type {any} */ (probe(cover.data)), 'ebook') : []),
        ];
        emit({ epub: file, identifier: built.identifier, chapters: built.chapters, findings }, [
          report(findings, `Wrote ${relative(cwd, file)} (${built.chapters.length} chapters, ${(built.epub.length / 1024).toFixed(0)} KB).`),
          '',
          'Upload it to KDP, Apple Books, Kobo Writing Life, Google Play Books or Draft2Digital.',
        ].join('\n'));
        return blocking(findings) ? 1 : 0;
      }
      throw new UsageError('ebook takes build or check');
    }

    if (cmd === 'print') {
      if (sub === 'cover') {
        let pages = Number(opts.pages);
        if (opts.pdf) pages = pdfPageCount(bytes(resolve(cwd, String(opts.pdf))));
        const project = existsSync(projectPath) ? readJson(projectPath) : {};
        const trim = String(opts.trim ?? project.print?.trim ?? '6x9');
        const paper = /** @type {keyof typeof PAPER_INCHES_PER_PAGE} */ (String(opts.paper ?? project.print?.paper ?? 'white'));
        if (!pages) throw new UsageError('print cover needs --pages N or --pdf interior.pdf');
        const c = paperbackCover({ pages, trim, paper, dpi: Number(opts.dpi ?? 300) });
        emit(c, [
          `${pages} pages, ${trim}" trim, ${paper} paper (KDP Print):`,
          `  spine          ${c.spineIn}"`,
          `  full cover     ${c.widthIn}" × ${c.heightIn}"  (${c.widthPx} × ${c.heightPx} px at ${c.dpi} DPI, incl. 0.125" bleed)`,
          `  front panel    starts ${c.frontStartsAtIn}" from the left edge`,
          `  inside margin  at least ${c.gutterIn}"`,
          ...c.notes.map((n) => `  • ${n}`),
          'Other printers (IngramSpark, Lulu) publish their own paper thickness; use their template generator for those.',
        ].join('\n'));
        return 0;
      }
      if (sub === 'interior') {
        const project = loadProject();
        const lint = lintBook(project).filter((f) => f.field !== 'book.cover' && f.field !== 'book.identifier');
        if (blocking(lint)) { emit({ findings: lint }, report(lint, 'Fix these first:')); return 1; }
        const { chapters } = loadChapters(project, projectDir);
        const out = resolve(cwd, String(opts.out ?? join(projectDir, 'dist')));
        mkdirSync(out, { recursive: true });
        const html = join(out, `${slug(project.book.title)}-print.html`);
        writeFileSync(html, buildPrintHtml({ book: project.book, chapters, trim: project.print?.trim, pagesEstimate: project.print?.pages }));
        for (const ch of project.chapters ?? []) copyImagesBeside(resolve(projectDir, ch), out);
        const pdf = html.replace(/\.html$/, '.pdf');
        const chrome = findChromium(io.env ?? process.env);
        const command = `${chrome ?? 'chromium'} --headless --no-pdf-header-footer --print-to-pdf=${JSON.stringify(pdf)} ${JSON.stringify('file://' + html)}`;
        let pages = null;
        if (opts.pdf) {
          if (!chrome) throw new UsageError('no Chromium/Chrome found; set CHROME_PATH or print the HTML from a browser');
          const r = spawnSync(chrome, ['--headless', '--no-sandbox', '--no-pdf-header-footer', `--print-to-pdf=${pdf}`, `file://${html}`], { stdio: 'pipe' });
          if (r.status !== 0 || !existsSync(pdf)) throw new Error(`Chromium failed: ${r.stderr?.toString().slice(0, 400)}`);
          pages = pdfPageCount(bytes(pdf));
        }
        emit({ html, pdf: pages ? pdf : null, pages, command }, pages
          ? `Wrote ${relative(cwd, pdf)} (${pages} pages). Next: publish-kit print cover --pdf ${relative(cwd, pdf)}`
          : `Wrote ${relative(cwd, html)}. Make the PDF with:\n  ${command}\n(or open it in Chrome and Print → Save as PDF, margins "Default").`);
        return 0;
      }
      throw new UsageError('print takes interior or cover');
    }

    throw new UsageError(`unknown command "${cmd}". Run publish-kit --help`);
  } catch (e) {
    const err = /** @type {Error} */ (e);
    if (json) print(JSON.stringify({ error: err.message }));
    else print(`publish-kit: ${err.message}`);
    return err instanceof UsageError ? 2 : 1;
  }
}

/** @param {Record<string, any>} r */
function describeMedia(r) {
  if (r.width) return `${String(r.format).toUpperCase()} ${r.width}×${r.height} ${r.colorModel ?? ''}`.trim();
  return `${String(r.format).toUpperCase()} ${hhmmss(r.duration)}, ${r.bitrateKbps ?? '?'} kbps${r.cbr === false ? ' VBR' : ''}, ${r.sampleRate ?? '?'} Hz, ${r.channels === 1 ? 'mono' : r.channels === 2 ? 'stereo' : `${r.channels ?? '?'} ch`}, ${(r.bytes / 1e6).toFixed(1)} MB`;
}

/** @param {string} s */
function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'book';
}

/**
 * Builds feed.xml + index.html into `out`, copying local audio into out/audio/
 * when the project is served from the same folder, then validates the feed
 * with the podcast-feed-check engine.
 * @param {any} project @param {string} projectDir @param {string} out
 */
function buildPodcastSite(project, projectDir, out) {
  const findings = /** @type {Finding[]} */ (lintPodcast(project));
  mkdirSync(join(out, 'audio'), { recursive: true });
  const copied = [];
  for (const ep of project.episodes ?? []) {
    if (!ep.file || ep.url) continue;
    const src = resolve(projectDir, ep.file);
    const dest = join(out, 'audio', basename(src));
    if (existsSync(src) && (!existsSync(dest) || statSync(dest).size !== statSync(src).size)) { copyFileSync(src, dest); copied.push(dest); }
  }
  const xmlText = buildPodcastFeed(project);
  const feed = join(out, 'feed.xml');
  const page = join(out, 'index.html');
  writeFileSync(feed, xmlText);
  writeFileSync(page, buildShowPage(project));
  const validation = validateFeed(xmlText);
  for (const f of validation) {
    if (!findings.some((x) => x.message === f.message)) findings.push(f);
  }
  return { feed, page, copied, findings };
}

// The built feed is re-read by the Podcast Feed Validator next door
// (ventures/podcast-feed-check), so the generator is checked by an independent
// parser rather than by itself. A copy of this folder without it still builds.
/** @type {(xml: string) => Finding[]} */
let validateFeed = () => [];
if (existsSync(join(HERE, '..', 'podcast-feed-check', 'engine.mjs'))) {
  const { parseFeed } = await import('../podcast-feed-check/feed-parser.mjs');
  const { classifyFeed } = await import('../podcast-feed-check/engine.mjs');
  validateFeed = (x) => classifyFeed(parseFeed(x)).findings.map((/** @type {any} */ f) => ({ severity: f.severity, field: `feed:${f.id}`, message: f.title }));
}

/** @param {any} project @param {string} projectDir */
function loadChapters(project, projectDir) {
  /** @type {Record<string, {data: Uint8Array, mime: string}>} */
  const images = {};
  const chapters = (project.chapters ?? []).map((/** @type {string} */ ch) => {
    const path = resolve(projectDir, ch);
    if (!existsSync(path)) throw new UsageError(`chapter file not found: ${ch}`);
    const markdown = readFileSync(path, 'utf8');
    for (const m of markdown.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)) {
      const src = m[1];
      const img = resolve(dirname(path), src);
      if (!/^[a-z]+:/i.test(src) && existsSync(img)) images[src] = { data: bytes(img), mime: /\.png$/i.test(src) ? 'image/png' : /\.gif$/i.test(src) ? 'image/gif' : 'image/jpeg' };
    }
    return { name: basename(ch), markdown };
  });
  return { chapters, images };
}

/** @param {string} chapterPath @param {string} out */
function copyImagesBeside(chapterPath, out) {
  if (!existsSync(chapterPath)) return;
  for (const m of readFileSync(chapterPath, 'utf8').matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)) {
    const src = resolve(dirname(chapterPath), m[1]);
    if (/^[a-z]+:/i.test(m[1]) || !existsSync(src)) continue;
    const dest = resolve(out, m[1]);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
  }
}

/** @param {Record<string, string|undefined>} env */
function findChromium(env) {
  const candidates = [env.CHROME_PATH, '/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  for (const c of candidates) if (c && existsSync(c) && statSync(c).isFile()) return c;
  for (const name of ['chromium', 'chromium-browser', 'google-chrome']) {
    const r = spawnSync('sh', ['-c', `command -v ${name}`], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  }
  return null;
}

/**
 * What a project still needs and the next command to run, for an agent loop.
 * @param {any} project @param {string} projectDir
 */
export function planFor(project, projectDir) {
  const kind = project.kind;
  /** @type {Finding[]} */
  let findings = [];
  /** @type {string[]} */
  const next = [];
  if (kind === 'podcast') {
    findings = lintPodcast(project);
    if (!project.episodes?.length) next.push('publish-kit podcast add <audio-file> --title "Episode title" --description "Show notes"');
    if (findings.some((f) => f.field.startsWith('show.'))) next.push('edit "show" in publish.json (fields named above)');
    next.push('publish-kit podcast build');
    if (project.show?.image && !/^https?:/.test(project.show.image)) next.push(`publish-kit cover ${project.show.image} --for podcast`);
  } else if (kind === 'audiobook') {
    const b = project.book ?? {};
    if (!b.title) findings.push({ severity: 'danger', field: 'book.title', message: 'No title.' });
    if (!authorsOf(b).length) findings.push({ severity: 'danger', field: 'book.author', message: 'No author.' });
    if (!project.tracks?.length) findings.push({ severity: 'danger', field: 'tracks', message: 'No tracks. List the chapter audio files in reading order.', fix: '"tracks": [{"file": "audio/00-opening-credits.mp3", "title": "Opening Credits"}, ...]' });
    for (const t of project.tracks ?? []) if (!existsSync(resolve(projectDir, t.file))) findings.push({ severity: 'danger', field: 'tracks', message: `${t.file} does not exist.` });
    if (b.cover && !existsSync(resolve(projectDir, b.cover))) findings.push({ severity: 'notice', field: 'book.cover', message: `${b.cover} does not exist.` });
    next.push('publish-kit audiobook check', 'publish-kit audiobook m4b --run', 'publish-kit audiobook feed');
  } else if (kind === 'ebook') {
    findings = lintBook(project);
    for (const ch of project.chapters ?? []) if (!existsSync(resolve(projectDir, ch))) findings.push({ severity: 'danger', field: 'chapters', message: `${ch} does not exist.` });
    if (project.book?.cover && !existsSync(resolve(projectDir, project.book.cover))) findings.push({ severity: 'notice', field: 'book.cover', message: `${project.book.cover} does not exist.` });
    next.push('publish-kit ebook build', 'publish-kit print interior --pdf', 'publish-kit print cover --pdf dist/<title>-print.pdf');
  } else {
    findings.push({ severity: 'danger', field: 'kind', message: `"kind" must be podcast, audiobook or ebook (got ${JSON.stringify(kind)}).` });
  }
  return { kind, ready: !findings.some((f) => f.severity === 'danger'), findings, next };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
