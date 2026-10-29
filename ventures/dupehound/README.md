# dupehound: a fast copy-paste detector in Rust

Find copy-pasted code, fast. A token-based copy-paste (code clone) detector
written in Rust, with the same engine compiled to WebAssembly for a browser
page that uploads nothing.

**Live page:** https://duncan-haywood.github.io/oss-monorepo/dupehound/

It is the first tool in the repository's "dev tools in Rust" direction
([`prompts/goals.md`](../../prompts/goals.md), "Direction: dev tools in Rust,
common and niche"), and the repository's first Rust crate.

## Why Rust here

The repository's guide says Rust is worth it when our own inner loop is the
bottleneck or when one engine has to ship to several surfaces. Both hold:

- **Inner loop.** jscpd, the usual tool, took 40 seconds and 927 MB on 1,054
  files from this repository, and ran out of memory on the full 9,458 files
  (337 seconds and 6.2 GB with a 12 GB heap). dupehound does the full tree
  in 1.2 seconds and 500 MB and flags the same lines to within about 5%.
  Details and caveats: [`BENCHMARK.md`](BENCHMARK.md).
- **One core, every surface.** The CLI and the browser page run the same
  code; `web/dupehound.test.mjs` requires the WebAssembly build's JSON to
  equal the CLI's byte for byte.

## Quickstart (CLI)

```sh
git clone --depth 1 --filter=blob:none --sparse https://github.com/duncan-haywood/oss-monorepo
cd oss-monorepo && git sparse-checkout set ventures/dupehound
cargo install --path ventures/dupehound

dupehound src/                        # 20 largest clones and a summary
dupehound --json src/ > clones.json   # every clone
dupehound --threshold 5 src/          # exit 1 when over 5% of lines are duplicated
```

Options: `--min-tokens N` (default 50), `--min-lines N` (5), `--max-size`
(100k), `--max-lines` (1000), `--ext a,b,c`, `--ignore-dir NAME`,
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

Limits, said plainly: matching is exact (renamed variables defeat it, as in
jscpd's default mode); the lexer is generic, so it has no idea of a language's
grammar; a regex literal is lexed as punctuation (harmless, both copies lex
the same way, but a quote inside one can make the lexer read a string to the
end of the line).

## Browser page

[`index.html`](index.html) loads [`web/dupehound.mjs`](web/dupehound.mjs) and
[`web/dupehound.wasm`](web/dupehound.wasm) (195 KB, plain C ABI, no
wasm-bindgen). Rebuild the `.wasm` after changing `src/`:

```sh
rustup target add wasm32-unknown-unknown
cargo build --release --lib --target wasm32-unknown-unknown --no-default-features
cp target/wasm32-unknown-unknown/release/dupehound.wasm web/
```

## Tests

```sh
cargo fmt --check && cargo clippy --release --all-targets -- -D warnings
cargo test --release           # includes a brute-force cross-check on random inputs
cargo build --release && node --test web/dupehound.test.mjs page.test.mjs usage.test.mjs
```

`.github/workflows/dupehound-ci.yml` runs all of it.

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

jscpd and PMD are their authors' projects; dupehound is not affiliated with
or endorsed by either.

## Next

- Publish to crates.io so `cargo install dupehound` works. Publishing under
  the portfolio's name is the owner's call; it is listed under the
  `publication-identity` ask in `portfolio/ledger/asks.yaml`.
- Prebuilt binaries from a release workflow, so no Rust toolchain is needed.
- A normalised mode (identifiers and literals replaced by their kind) to find
  renamed copies, measured against jscpd's `weak` mode.
- Cut memory on large trees: the window table is 16 bytes a token; a
  two-pass count-then-collect would keep only windows that repeat.
