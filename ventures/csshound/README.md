# csshound: find the CSS each page never uses

Which CSS rules does a page never use? csshound reads every HTML page under a
folder, takes each page's own CSS (its `<style>` blocks and the local
stylesheets it links) and judges every rule against that page, the local
scripts it loads and the modules those scripts import. It lists each rule that
could go and how many bytes it carries.

The rules are PurgeCSS's (9.1.0, default options): a selector is unused when
one of its classes, ids, tags or attributes is not a word anywhere in the
content. One Rust binary, every page in parallel. The same engine compiled to
WebAssembly runs on [the page](https://marisstella.app/csshound/), where you
paste a page or a stylesheet and nothing is uploaded.

On this repository's 3,915 venture pages (99,479 rules, 8.1 MB of CSS) it ran
in 0.5 s and found 8,815 rules (8.0% of the bytes) no page uses
([BENCHMARK.md](BENCHMARK.md)). Against PurgeCSS 9.1.0 on
the same 3,923 pages with the same input, the two reject the same 15,632
selectors, with no difference either way; PurgeCSS took 4.6 to 4.9 s and
123 MB, csshound 0.31 to 0.36 s (1.1 s on one thread) and 10 MB.

## Install

Needs a Rust toolchain:

```
git clone --depth 1 --filter=blob:none --sparse https://github.com/duncan-haywood/oss-monorepo
cd oss-monorepo && git sparse-checkout set ventures/csshound
cargo install --path ventures/csshound
```

## Use

```
csshound site/                      # summary + the 10 pages with most unused bytes
csshound --dead site/               # every unused rule: page:byte-offset: selector
csshound --json site/ > report.jsonl
csshound --fail site/index.html     # CI gate: exit 1 if any selector is unused
csshound --css app.css --content index.html --content app.js   # PurgeCSS-style
```

| Option | Effect |
| --- | --- |
| `--json` | one line per page: `page`, `css_bytes`, `rules`, `dead_rules`, `dead_bytes`, `rejected` |
| `--dead` | list each rule that would go entirely |
| `--top N` | pages listed in the summary (default 10) |
| `--safelist NAME` | never treat this class, id, tag or attribute as unused (repeatable) |
| `--no-imports` | do not follow `import` from the page's scripts |
| `--no-dynamic` | do not keep classes built from a run-time prefix |
| `--purgecss` | PurgeCSS's input and rules exactly (`--no-imports --no-dynamic`) |
| `--jobs N` | threads (default: all cores) |
| `--fail` | exit 1 when anything is unused |

## What counts as used

- **Words.** The content is cut into words with `[A-Za-z0-9_-]+`
  (PurgeCSS's default extractor). `.card` is used if `card` is a word
  anywhere: in a `class` attribute, a script string, even prose. That errs
  toward keeping rules.
- **Every part must be found.** `nav .item.active` needs `nav`, `item` and
  `active`. Pseudo-classes, pseudo-elements, combinators, `*` and `&` never
  count against a selector.
- **`:is()` and `:where()`** arguments are judged one by one, and a selector
  whose `:is()` loses all of them goes. Arguments of `:not()`, `:has()` and
  other pseudo-classes are always kept.
- **Attributes.** `[type=number]` needs the words `type` and `number`;
  `^=`, `$=`, `*=` and `~=` match word prefixes, suffixes and substrings.
  `[value]`, `[checked]`, `[selected]` and `[open]` are always kept.
- **Left alone:** rules inside `@keyframes`, and `@font-face`, `@keyframes`
  and custom properties themselves (PurgeCSS's defaults leave them too).
- **Annotations:** `/* purgecss start ignore */` ... `/* purgecss end ignore */`,
  `/* purgecss ignore */` before a rule and `/* purgecss ignore current */`
  inside one.

Two things csshound adds, both on by default and both off with `--purgecss`:

- **Imports.** Local modules the page's scripts import (`import`, `export
  ... from`, `import()`), transitively, are content too. On this repository
  that removed a third of the findings PurgeCSS's page input gives.
- **Run-time prefixes.** When the content glues a word ending in `-` or `_`
  to a value (`class="cls-${kind}"`, `"tier-" + level`), classes and ids
  starting with that prefix are kept.

## What it cannot see

Class names built with no literal prefix, markup fetched at run time, and
classes set by scripts from another origin. A finding means "nothing on this
page or its local scripts names this", not proof that no visitor ever sees it.
Check before deleting, and keep a `--safelist` for names your code builds.

## Layout

- `src/lib.rs`: the word extractor, the CSS and selector parser, the judge.
- `src/page.rs`: HTML page to (CSS, content), and the import follower.
- `src/main.rs`: the CLI. `src/wasm.rs`: the browser build's C ABI.
- `web/csshound.mjs` and `web/csshound.wasm`: the browser engine;
  `web/csshound.test.mjs` checks it against the CLI.
- `tests/rules.rs`: one test per PurgeCSS rule. `tests/bench/`: the benchmark
  harness and the PurgeCSS comparison.

Rebuild the browser engine after changing `src/`:

```
rustup target add wasm32-unknown-unknown
cargo build --release --lib --target wasm32-unknown-unknown --no-default-features
cp target/wasm32-unknown-unknown/release/csshound.wasm web/
```

## Credits

The selector rules follow [PurgeCSS](https://github.com/FullHuman/purgecss)
(MIT), read from its 9.1.0 source; no PurgeCSS code is copied. csshound is
not affiliated with or endorsed by the PurgeCSS authors.

FSL-1.1-MIT licence. Free, as-is, no warranty.
