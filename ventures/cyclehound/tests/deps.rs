//! `--deps`: each rule against a package held in memory. The expected
//! answers in the depcheck-mode tests were checked against depcheck 1.4.7
//! on the same files (BENCHMARK.md, "Dependencies").

use cyclehound::deps::{extract_specifiers, package_name, types_name, Form};
use cyclehound::*;
use std::path::{Path, PathBuf};

fn pkg(files: &[(&str, &str)]) -> (Memory, Vec<PathBuf>) {
    let mut m = Memory::default();
    let mut list = Vec::new();
    for (p, src) in files {
        let p = PathBuf::from(format!("/p/{p}"));
        m.0.insert(p.clone(), src.as_bytes().to_vec());
        list.push(p);
    }
    (m, list)
}

fn run(files: &[(&str, &str)], depcheck: bool) -> DepReport {
    let (m, list) = pkg(files);
    check_package(
        &m,
        Path::new("/p/package.json"),
        &list,
        &DepOptions { depcheck },
    )
}

fn missing(r: &DepReport) -> Vec<&str> {
    r.missing.keys().map(|s| s.as_str()).collect()
}

#[test]
fn package_names() {
    assert_eq!(package_name("lodash/fp").as_deref(), Some("lodash"));
    assert_eq!(
        package_name("@scope/name/sub").as_deref(),
        Some("@scope/name")
    );
    assert_eq!(package_name("@/lib/x"), None);
    assert_eq!(package_name("./x").as_deref(), Some("."));
    assert_eq!(types_name("@scope/name"), "@types/scope__name");
    assert_eq!(types_name("node:fs"), "@types/node");
}

#[test]
fn unused_and_missing() {
    let r = run(
        &[
            (
                "package.json",
                r#"{"dependencies": {"used": "1", "idle": "1"},
                    "devDependencies": {"dev-idle": "1", "dev-used": "1"},
                    "peerDependencies": {"peer": "1"}}"#,
            ),
            (
                "a.mjs",
                "import u from 'used/sub';\nimport 'peer';\nimport fs from 'node:fs';\nimport p from 'path';\nconst x = require('undeclared');\n",
            ),
            ("test/a.test.js", "require('dev-used')"),
        ],
        true,
    );
    assert_eq!(r.unused, vec!["idle"]);
    assert_eq!(r.unused_dev, vec!["dev-idle"]);
    assert_eq!(missing(&r), vec!["undeclared"]);
    assert_eq!(r.missing["undeclared"][0].line, 5);
}

#[test]
fn detector_forms_match_depcheck() {
    let src = r#"
import a from "https://cdn.example/a.js";
import b from "style-loader!css-loader!./b.css";
export { c } from "https://cdn.example/c.js";
const d = require(("paren"));
const e = require(`tmpl`);
const f = require("two", "args");
const g = import(`dyn`);
require.resolve("resolved");
grunt.loadNpmTasks("grunt-contrib-x");
System.import("sysmod");
obj.require("method");
"#;
    let got: Vec<(String, Form)> = extract_specifiers(src, false, false)
        .into_iter()
        .map(|s| (s.value, s.form))
        .collect();
    assert_eq!(
        got,
        vec![
            ("https://cdn.example/a.js".into(), Form::Import),
            ("style-loader!css-loader!./b.css".into(), Form::Import),
            ("https://cdn.example/c.js".into(), Form::ExportFrom),
            ("paren".into(), Form::Require),
            ("tmpl".into(), Form::Require),
            ("dyn".into(), Form::Call),
            ("resolved".into(), Form::Call),
            ("grunt-contrib-x".into(), Form::Call),
            ("sysmod".into(), Form::Call),
        ]
    );
    let r = run(
        &[("package.json", r#"{"dependencies": {}}"#), ("a.js", src)],
        true,
    );
    // depcheck drops URLs only in import and require; export-from keeps it.
    assert_eq!(
        missing(&r),
        vec![
            "css-loader",
            "dyn",
            "grunt-contrib-x",
            "https:",
            "paren",
            "resolved",
            "style-loader",
            "sysmod",
            "tmpl"
        ]
    );
}

#[test]
fn typescript_types() {
    let r = run(
        &[
            (
                "package.json",
                r#"{"dependencies": {"lodash": "1", "@types/lodash": "1", "only-types": "1", "@types/only-types": "1"},
                    "devDependencies": {"@types/node": "1", "@scope/x": "1", "@types/scope__x": "1"}}"#,
            ),
            (
                "a.ts",
                "import _ from 'lodash';\nimport type { T } from 'only-types';\nimport fs from 'fs';\nimport x from '@scope/x';\n",
            ),
        ],
        true,
    );
    // `import type` with @types declared uses only the @types package.
    assert_eq!(r.unused, vec!["only-types"]);
    assert!(r.unused_dev.is_empty(), "{:?}", r.unused_dev);
}

#[test]
fn type_position_imports() {
    let src = "let a: import('ta').T;\ntype B = import('tb').U;\nconst c = typeof import('tc');\nconst d = await import('dd');\nimport('de').then(f);\n";
    let forms: Vec<(String, Form)> = extract_specifiers(src, true, false)
        .into_iter()
        .map(|s| (s.value, s.form))
        .collect();
    assert_eq!(
        forms,
        vec![
            ("ta".into(), Form::TypeImport),
            ("tb".into(), Form::TypeImport),
            ("tc".into(), Form::TypeImport),
            ("dd".into(), Form::Call),
            ("de".into(), Form::Call),
        ]
    );
    // In a declaration file every import() is a type.
    assert!(
        extract_specifiers("export const x: import('q');", true, true)
            .iter()
            .all(|s| s.form == Form::TypeImport)
    );
    // depcheck's default detectors skip them; the default mode counts them.
    let files = [
        ("package.json", r#"{"dependencies": {}}"#),
        ("a.d.ts", "declare const x: import('undici-types').R;"),
    ];
    assert!(missing(&run(&files, true)).is_empty());
    assert_eq!(missing(&run(&files, false)), vec!["undici-types"]);
}

#[test]
fn tsconfig_imports_map_and_react17() {
    let r = run(
        &[
            (
                "package.json",
                r##"{"dependencies": {"react": "^18.2.0", "mapped": "1"},
                     "devDependencies": {"@tsconfig/node20": "1", "@types/jest": "1", "vitest": "1"},
                     "imports": {"#dep": "mapped", "#local/*": "./src/*.js"}}"##,
            ),
            (
                "tsconfig.json",
                r#"{ // comments are fine
                    "extends": "@tsconfig/node20/tsconfig.json",
                    "compilerOptions": {"types": ["jest", "vitest/globals"]}}"#,
            ),
            (
                "a.mjs",
                "import m from '#dep';\nimport l from '#local/x';\nimport n from '#nomap';\n",
            ),
        ],
        true,
    );
    assert!(r.unused.is_empty(), "{:?}", r.unused);
    assert!(r.unused_dev.is_empty(), "{:?}", r.unused_dev);
    assert_eq!(missing(&r), vec!["#nomap"]);
}

#[test]
fn relative_import_counts_own_peers_in_depcheck_mode() {
    // depcheck resolves "./x" as the package "." and reads this package's
    // own peerDependencies as used (styled-components, ts-node).
    let files = [
        (
            "package.json",
            r#"{"name": "me", "main": "index.js", "peerDependencies": {"react-dom": "*"}, "devDependencies": {"react-dom": "1"}}"#,
        ),
        ("index.js", "require('./lib')"),
        ("lib.js", ""),
    ];
    assert!(run(&files, true).unused_dev.is_empty());
    assert_eq!(run(&files, false).unused_dev, vec!["react-dom"]);
}

#[test]
fn installed_bins_and_peers() {
    let files = [
        (
            "package.json",
            r#"{"scripts": {"build": "tsc -p . && ./node_modules/.bin/other"}, "devDependencies": {"typescript": "1", "other-pkg": "1", "idle-cli": "1", "peer-of-ts": "1"}}"#,
        ),
        (
            "node_modules/typescript/package.json",
            r#"{"bin": {"tsc": "bin/tsc"}, "peerDependencies": {"peer-of-ts": "*"}}"#,
        ),
        (
            "node_modules/other-pkg/package.json",
            r#"{"bin": {"other": "cli.js"}}"#,
        ),
        ("node_modules/idle-cli/package.json", r#"{"bin": "cli.js"}"#),
    ];
    let (m, _) = pkg(&files);
    let list = vec![PathBuf::from("/p/package.json")];
    let r = check_package(
        &m,
        Path::new("/p/package.json"),
        &list,
        &DepOptions { depcheck: true },
    );
    assert_eq!(r.unused_dev, vec!["idle-cli"]);
}

#[test]
fn guesses_in_default_mode() {
    let files = [
        (
            "package.json",
            r#"{"name": "app",
                "scripts": {"dev": "next dev", "test": "tsx --test t.ts", "lint": "npx eslint ."},
                "dependencies": {"next": "16", "react": "19", "react-dom": "19"},
                "devDependencies": {"tsx": "4", "eslint": "9", "typescript": "5", "@types/react-dom": "19",
                  "autoprefixer": "10", "postcss": "8", "@tailwindcss/typography": "1", "jsdom": "26", "bun-types": "1"}}"#,
        ),
        ("tsconfig.json", "{}"),
        (
            "postcss.config.mjs",
            "export default { plugins: { autoprefixer: {} } };",
        ),
        (
            "src/app.css",
            "@import \"tailwindcss\";\n@plugin \"@tailwindcss/typography\";\n",
        ),
        (
            "src/page.tsx",
            "import { x } from '@/lib/x';\nimport t from 'bun:test';\nimport me from 'app/sub';\n",
        ),
        ("src/lib/x.ts", "export const x = 1;"),
        ("tsconfig.paths.json", ""),
        ("src/a.test.ts", "// @vitest-environment jsdom\n"),
    ];
    let (m, list) = pkg(&files);
    let mut m = m;
    // tsconfig with an alias so `@/lib/x` is local code.
    m.0.insert(
        PathBuf::from("/p/tsconfig.json"),
        br#"{"compilerOptions": {"baseUrl": ".", "paths": {"@/*": ["src/*"]}}}"#.to_vec(),
    );
    let r = check_package(
        &m,
        Path::new("/p/package.json"),
        &list,
        &DepOptions::default(),
    );
    assert!(r.unused.is_empty(), "{:?}", r.unused);
    assert_eq!(r.unused_dev, vec!["bun-types"]);
    assert!(r.missing.is_empty(), "{:?}", r.missing);
    // The same package under depcheck's rules alone.
    let d = check_package(
        &m,
        Path::new("/p/package.json"),
        &list,
        &DepOptions { depcheck: true },
    );
    assert!(d.unused_dev.contains(&"tsx".to_string()));
    assert!(d.missing.contains_key("bun:test"));
}

#[test]
fn keyword_property_before_slash_is_division() {
    // `o.else / e` once lexed as a regex and hid every import after it.
    let src = "const r={ifTrue:o.ifTrue/e,else:o.else/e};const x=require(\"after\");";
    let got: Vec<String> = extract_specifiers(src, false, false)
        .into_iter()
        .map(|s| s.value)
        .collect();
    assert_eq!(got, vec!["after"]);
    let g = extract_imports(src);
    assert_eq!(g.len(), 1);
}
