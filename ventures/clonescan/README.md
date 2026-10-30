# clonescan: a fast copy-paste detector in Rust

*Named `dupehound` until 2026-10-30; renamed because an unrelated crate
already holds that name on crates.io.*

Find copy-pasted code, fast. A token-based copy-paste (code clone) detector
written in Rust, with the same engine compiled to WebAssembly for a browser
page that uploads nothing.

**Live page:** https://duncan-haywood.github.io/oss-monorepo/clonescan/

It is the first tool in the repository's "dev tools in Rust" direction
([`prompts/goals.md`](../../prompts/goals.md), "Direction: dev tools in Rust,
common and niche"), and the repository's first Rust crate.

## Why Rust here

The repository's guide says Rust is worth it when our own inner loop is the
bottleneck or when one engine has to ship to several surfaces. Both hold:

- **Inner loop.** jscpd, the usual tool, took 40 seconds and 927 MB on 1,054
  files from this repository, and ran out of memory on the full 9,458 files
  (337 seconds and 6.2 GB with a 12 GB heap). clonescan does the full tree
  in 1.2 seconds and 500 MB and flags the same lines to within about 5%.
  Details and caveats: [`BENCHMARK.md`](BENCHMARK.md).
- **One core, every surface.** The CLI and the browser page run the same
  code; `web/clonescan.test.mjs` requires the WebAssembly build's JSON to
  equal the CLI's byte for byte.

## Quickstart (CLI)

```sh
git clone --depth 1 --filter=blob:none --sparse https://github.com/duncan-haywood/oss-monorepo
cd oss-monorepo && git sparse-checkout set ventures/clonescan
cargo install --path ventures/clonescan

clonescan src/                        # 20 largest clones and a summary
clonescan --json src/ > clones.json   # every clone
clonescan --threshold 5 src/          # exit 1 when over 5% of lines are duplicated
```

Options: `--min-tokens N` (default 50), `--min-lines N` (5), `--max-size`
(100k), `--max-lines` (1000), `--normalize`, `--ext a,b,c`, `--ignore-dir NAME`,
`--no-gitignore`, `--top N`, `--threshold PCT`. The defaults are jscpd's.
It respects `.gitignore` and always skips `node_modules`, `.git` and `target`.

## How it works

1. **Tokenize** each file in parallel. Whitespace and comments are dropped;
   strings, template literals (with `${}` nesting) and Python triple-quoted
   strings are single tokens. `#` comments for Python, shell, Ruby, YAML,
   TOML; `//` and `/* */` for everything else.
2. **Hash every 50-token window** with a polynomial rolling hash.
3. **Sort** the `(hash, file, position)` triples (in parallel), pair each
   window with the first occurrence of its hash, and compare tokens to rule
   out collisions.
4. **Merge** pairs on the same diagonal into maximal clones; keep those of at
   least 5 lines on both sides.

Duplicated lines are a union over the later copy of each pair, so a block
pasted into ten files counts nine times its size, not ninety.

**Renamed copies (`--normalize`, and a checkbox on the page).** With it on,
every identifier that is not a keyword hashes as one placeholder, every
string and template literal as another, every number as a third. A function
pasted and then renamed (`a` to `q`, `compute` to `calc`, `3` to `44`,
`'x'` to `"y"`) is one clone; `if` against `while` still is not, nor is a
changed call shape. The keyword list is one list for all languages, so a word
that is a name in one language and a keyword in another stays a keyword
(stricter, never looser). jscpd has no such mode (its `mild` and `weak`
modes only decide what is skipped, not what is renamed), so there is nothing
of theirs to measure against; on this repository's 9,461 `.mjs` files the
duplicated share goes from 40.55% to 60.41% (1.65 s), most of it
boilerplate of the same shape, which is what the mode is for and also why it
is off by default. Expect more false positives: two functions of the same
shape and different meaning match.

Limits, said plainly: by default matching is exact (renamed variables defeat
it, as in jscpd's default mode); a window is paired with the first place its
hash occurs, so in a file of many same-looking lines (common once names are
erased) a copy can come out as several shorter clones instead of one; the lexer is generic, so it has no idea of a language's
grammar; a regex literal is lexed as punctuation (harmless, both copies lex
the same way, but a quote inside one can make the lexer read a string to the
end of the line).

## Browser page

[`index.html`](index.html) loads [`web/clonescan.mjs`](web/clonescan.mjs) and
[`web/clonescan.wasm`](web/clonescan.wasm) (195 KB, plain C ABI, no
wasm-bindgen). Rebuild the `.wasm` after changing `src/`:

```sh
rustup target add wasm32-unknown-unknown
cargo build --release --lib --target wasm32-unknown-unknown --no-default-features
cp target/wasm32-unknown-unknown/release/clonescan.wasm web/
```

## Tests

```sh
cargo fmt --check && cargo clippy --release --all-targets -- -D warnings
cargo test --release           # includes a brute-force cross-check on random inputs
cargo build --release && node --test web/clonescan.test.mjs page.test.mjs usage.test.mjs
```

`.github/workflows/clonescan-ci.yml` runs all of it.

## Licence, disclaimer, privacy

MIT ([`LICENSE`](LICENSE)).

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not a code review, a security audit or a
licence check, and it does not replace a qualified engineer's judgement.
**You are responsible for reviewing and verifying its output before relying
on it.** To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

**Privacy.** The CLI makes no network calls. The page reads your files in the
browser tab and sends nothing anywhere; it counts three anonymous events
(`scan_run`, `example_loaded`, `report_downloaded`) in local storage only,
with an off switch.

jscpd and PMD are their authors' projects; clonescan is not affiliated with
or endorsed by either.

## Next

- First crates.io release, so `cargo install clonescan` works. Approved by
  the owner on 2026-10-30; `.github/workflows/distribute-crates.yml` is
  ready and `cargo publish --dry-run` passes. It waits on a one-time token
  (`crates-io-token` in `portfolio/ledger/asks.yaml`). Until then, install
  from source as above.
- Prebuilt binaries from a release workflow, so no Rust toolchain is needed.
- Pair a window with every earlier occurrence on a diagonal, not only the
  first, so repetitive code in normalised mode reports whole clones.
- Labelled data for normalised mode: how many of its extra matches a person
  would call real duplication.
- Cut memory on large trees: the window table is 16 bytes a token; a
  two-pass count-then-collect would keep only windows that repeat.
