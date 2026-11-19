---
title: "TypeScript 7 rejects 7 of the 25 @tsconfig/bases configs, and three of ours"
seo_title: "TypeScript 7 tsconfig removed options: baseUrl, ES5, node10 checked"
date: 2026-11-19
tags: [tsconfig-ts7-check, typescript, developer-tools]
description: "We ran 61 tsconfig files through tsc 6.0.3 and 7.0.2; 28 fail on 7.0 before any code is read. A free checker says which options, and what to write instead."
---

TypeScript 7.0.2 is the `latest` tag on npm, and Dependabot is already
offering the bump in this repository. The first thing many projects will
see is not a type error. It is the compiler refusing the config file:

```
tsconfig.json(3,15): error TS5108: Option 'target=ES5' has been removed.
Please remove it from your configuration.
```

TypeScript 6.0 deprecated a set of options and let you silence the warnings
with `"ignoreDeprecations": "6.0"`. TypeScript 7.0 removed them, and that
setting no longer helps. We built a free
[tsconfig TypeScript 7 check](https://marisstella.app/tsconfig-ts7-check/)
that reads a config and says what 7.0 will reject. We wanted to know how
common this is, so we ran it, and the real compilers, over 61 configs.

## What we measured

The corpus had three parts. The first was 35 versions of the 25
`@tsconfig/bases` packages that many projects extend: the current release of
each, plus older majors. The second was nine hand-written configs in the
shape of older Angular, Node and library setups. The third was all 17
tsconfig files in this monorepo. Each was compiled by tsc 6.0.3 and 7.0.2
with its sources replaced by one stub file, so every diagnostic was about
the config itself.

- **tsc 7.0.2 rejected 28 of the 61.**
- **The current release of 7 of the 25 `@tsconfig/bases` packages** is
  among them: cypress (target ES5), docusaurus, nuxt and remix (`baseUrl`),
  and node10, react-native and taro (`moduleResolution: "node"`). A project
  that extends one of these fails even if its own file is clean.
- **Three of our own Next.js apps** fail: `print-atelier`, `vendor-watch`
  and the `real-estate-agent-photo-app` research site, all on
  `"target": "es5"`. The older `@tsconfig/next` 1.x base carries the same
  line. With `noEmit` it changed almost nothing, so nobody looked at it.
- The most common rejected options were `moduleResolution: "node"`/`"node10"`
  (15 configs), `baseUrl` (9) and `target: "es5"` (9).

The checker named exactly the options tsc 7.0.2 rejected in all 61 configs.
For each one it also suggested a fixed `compilerOptions`. All 61
suggestions compiled with no config errors under both 6.0.3 and 7.0.2.

## Three things the source code alone got wrong

The rules started from the TypeScript 6.0.3 compiler source, from the
function that issues the deprecation errors. Then we compiled every option
and every enum value alone, 239 configs, under 5.9.3, 6.0.3 and 7.0.2.
That corrected three first guesses:

1. **Options removed back in 5.5 are now "unknown", at any value.**
   `"keyofStringsOnly": false` compiles on 6.0.3. On 7.0.2 it fails with
   TS5023, "Unknown compiler option", because 7.0 no longer knows the name
   at all. Old configs that set these to `false` to be explicit will break.
2. **`"module": "none"` and `"target": "es3"` are invalid values in 7.0**
   (TS6046), not "removed" (TS5108). Searching for the wrong error code
   finds nothing.
3. **`"prepend": true` on a project reference is silently ignored by 7.0.**
   TypeScript 6 reports it as an error. TypeScript 7 accepts it and does
   nothing, so a build that relied on it to concatenate outputs changes
   without any message.

## The quieter changes

Some 6.0 changes need no removed option to bite, because they change what
happens when an option is left out. The fixtures in the eval show each one
under all three compilers:

- `types` now defaults to `[]`. `process`, `Buffer` and `describe` stop
  being declared unless you list `"types": ["node", "jest"]`. This was the
  most common finding: 38 of the 61 configs leave `types` unset.
- `strict` is on by default.
- With sources in `src/` and an `outDir`, `rootDir` now defaults to the
  tsconfig's folder. tsc stops with TS5011 until you set it.
- An unresolved side-effect import such as `import "./styles.css"` is now
  error TS2882.

## Limits

The tool checks the config, not your code. New strict errors, and imports
that resolve differently under bundler or nodenext resolution, still need a
real tsc 7 run. The rules describe 6.0.3 and 7.0.2; a later release may
change them, and the probes in the
[eval folder](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/tsconfig-ts7-check/eval)
can be rerun against it. The page runs in your browser and uploads nothing.
The CLI (`node cli.mjs tsconfig.json`) follows `extends` into `node_modules`
and exits 1 when 7.0 would reject the config. It is free and MIT licensed,
and not affiliated with Microsoft or the TypeScript project.
