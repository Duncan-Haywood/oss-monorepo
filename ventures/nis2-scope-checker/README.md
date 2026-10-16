# NIS2 Scope Checker

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/nis2-scope-checker/>

Free, private browser tool: pick a sector and enter whole-group staff, turnover and balance sheet to see whether Directive (EU) 2022/2555 (NIS2) likely applies, as an essential or important entity, which Article the call rests on, what the result would be at other company sizes, and the main duties.

After using this, you know whether to start a NIS2 programme, what category to plan for, and which question (sector fit, size, Member State designation) to put to your national authority or counsel.

Open `index.html`. Tests: `node --test 'ventures/nis2-scope-checker/**/*.test.mjs'`.

**No warranty.** Free and as-is; not legal advice. It reads the Directive's text, not any Member State's transposition. See `VENTURE.yaml`.
