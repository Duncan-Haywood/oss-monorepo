//! tsconfig / jsconfig `paths` and `baseUrl`, on in-memory projects.

use cyclehound::tsconfig::{load, Json};
use cyclehound::*;
use std::path::{Path, PathBuf};

fn mem(files: &[(&str, &str)]) -> Memory {
    let mut m = Memory::default();
    for (p, s) in files {
        m.0.insert(PathBuf::from(p), s.as_bytes().to_vec());
    }
    m
}

fn exts() -> Vec<String> {
    DEFAULT_EXTS.iter().map(|s| s.to_string()).collect()
}

fn res(fs: &Memory, from: &str, spec: &str) -> Resolve {
    resolve_with(fs, &Configs::new(true), Path::new(from), spec, &exts())
}

fn file(p: &str) -> Resolve {
    Resolve::File(PathBuf::from(p))
}

#[test]
fn jsonc_comments_and_trailing_commas() {
    let src = "\u{feff}{
      // a line comment
      \"compilerOptions\": { /* block */ \"baseUrl\": \".\", \"strict\": true, },
      \"paths\": [\"a\\u00e9\", \"\\ud83d\\ude00\",],
    }";
    let j = parse_jsonc(src).expect("parses");
    assert_eq!(
        j.get("compilerOptions").and_then(|c| c.get("baseUrl")),
        Some(&Json::Str(".".into()))
    );
    assert_eq!(
        j.get("paths"),
        Some(&Json::Arr(vec![
            Json::Str("aé".into()),
            Json::Str("😀".into())
        ]))
    );
    assert!(parse_jsonc("{\"a\": }").is_none());
    assert!(parse_jsonc("{} trailing").is_none());
    // A URL in a string is not a comment.
    let j = parse_jsonc("{\"$schema\": \"https://json.schemastore.org/tsconfig\"}").unwrap();
    assert_eq!(
        j.get("$schema").and_then(|s| s.as_str()),
        Some("https://json.schemastore.org/tsconfig")
    );
}

#[test]
fn next_style_at_alias() {
    let fs = mem(&[
        (
            "app/tsconfig.json",
            r#"{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }"#,
        ),
        ("app/src/lib/db.ts", ""),
        ("app/src/components/index.tsx", ""),
        ("app/src/pages/home.tsx", ""),
    ]);
    let from = "app/src/pages/home.tsx";
    assert_eq!(res(&fs, from, "@/lib/db"), file("app/src/lib/db.ts"));
    assert_eq!(
        res(&fs, from, "@/components"),
        file("app/src/components/index.tsx")
    );
    // TypeScript's `.js` spelling of a `.ts` file works through an alias too.
    assert_eq!(res(&fs, from, "@/lib/db.js"), file("app/src/lib/db.ts"));
    // A broken alias is missing, not a package.
    assert_eq!(res(&fs, from, "@/lib/nope"), Resolve::Missing);
    // Packages stay packages.
    assert_eq!(res(&fs, from, "react"), Resolve::External);
    assert_eq!(res(&fs, from, "@scope/pkg"), Resolve::External);
    // Switched off, the alias is a package again.
    assert_eq!(
        resolve_with(
            &fs,
            &Configs::new(false),
            Path::new(from),
            "@/lib/db",
            &exts()
        ),
        Resolve::External
    );
    // Outside the project the config does not apply.
    assert_eq!(res(&fs, "other/x.ts", "@/lib/db"), Resolve::External);
}

#[test]
fn exact_beats_wildcard_and_longest_prefix_wins() {
    let fs = mem(&[
        (
            "tsconfig.json",
            r#"{ "compilerOptions": { "baseUrl": "src", "paths": {
                "*": ["types/*"],
                "@app/*": ["app/*"],
                "@app/ui/*": ["design/*"],
                "config": ["conf/prod"]
            } } }"#,
        ),
        ("src/app/ui/button.ts", ""),
        ("src/design/button.ts", ""),
        ("src/app/state.ts", ""),
        ("src/conf/prod.ts", ""),
        ("src/types/config.ts", ""),
        ("src/util/fmt.ts", ""),
        ("main.ts", ""),
    ]);
    assert_eq!(
        res(&fs, "main.ts", "@app/ui/button"),
        file("src/design/button.ts")
    );
    assert_eq!(res(&fs, "main.ts", "@app/state"), file("src/app/state.ts"));
    assert_eq!(res(&fs, "main.ts", "config"), file("src/conf/prod.ts"));
    // baseUrl alone resolves a bare path that exists...
    assert_eq!(res(&fs, "main.ts", "util/fmt"), file("src/util/fmt.ts"));
    // ...and a "*" pattern miss is a package, not a broken alias.
    assert_eq!(res(&fs, "main.ts", "lodash"), Resolve::External);
}

#[test]
fn targets_in_order_and_node_modules_skipped() {
    let fs = mem(&[
        (
            "tsconfig.json",
            r#"{ "compilerOptions": { "paths": {
                "~/*": ["./gen/*", "./src/*"],
                "react/jsx-runtime": ["./node_modules/@types/react/jsx-runtime.d.ts"]
            } } }"#,
        ),
        ("gen/api.ts", ""),
        ("src/api.ts", ""),
        ("src/only.ts", ""),
        ("a.ts", ""),
    ]);
    assert_eq!(res(&fs, "a.ts", "~/api"), file("gen/api.ts"));
    assert_eq!(res(&fs, "a.ts", "~/only"), file("src/only.ts"));
    assert_eq!(res(&fs, "a.ts", "react/jsx-runtime"), Resolve::External);
}

#[test]
fn extends_chain_and_relative_bases() {
    let fs = mem(&[
        (
            "repo/tsconfig.base.json",
            r#"{ "compilerOptions": { "baseUrl": ".", "paths": { "@shared/*": ["packages/shared/src/*"] } } }"#,
        ),
        (
            "repo/apps/web/tsconfig.json",
            r#"{ "extends": "../../tsconfig.base", "compilerOptions": { "strict": true } }"#,
        ),
        (
            "repo/apps/api/tsconfig.json",
            // Overrides paths; with baseUrl inherited, targets are relative to it.
            r#"{ "extends": ["../../tsconfig.base.json"],
                 "compilerOptions": { "paths": { "@shared/*": ["packages/shared/lib/*"] } } }"#,
        ),
        ("repo/packages/shared/src/money.ts", ""),
        ("repo/packages/shared/lib/money.ts", ""),
        ("repo/apps/web/page.ts", ""),
        ("repo/apps/api/route.ts", ""),
    ]);
    assert_eq!(
        res(&fs, "repo/apps/web/page.ts", "@shared/money"),
        file("repo/packages/shared/src/money.ts")
    );
    assert_eq!(
        res(&fs, "repo/apps/api/route.ts", "@shared/money"),
        file("repo/packages/shared/lib/money.ts")
    );
    let m = load(&fs, Path::new("repo/apps/web/tsconfig.json")).unwrap();
    assert_eq!(m.base_url, Some(PathBuf::from("repo")));
}

#[test]
fn paths_without_base_url_are_relative_to_their_config() {
    let fs = mem(&[
        (
            "p/base/tsconfig.json",
            r##"{ "compilerOptions": { "paths": { "#lib/*": ["./lib/*"] } } }"##,
        ),
        (
            "p/app/tsconfig.json",
            r#"{ "extends": "../base/tsconfig.json" }"#,
        ),
        ("p/base/lib/x.ts", ""),
        ("p/app/a.ts", ""),
    ]);
    assert_eq!(res(&fs, "p/app/a.ts", "#lib/x"), file("p/base/lib/x.ts"));
}

#[test]
fn jsconfig_nearest_wins_and_loops_end() {
    let fs = mem(&[
        (
            "w/jsconfig.json",
            r#"{ "compilerOptions": { "baseUrl": "." } }"#,
        ),
        ("w/lib/x.js", ""),
        ("w/a.js", ""),
        // A nearer tsconfig with no aliases switches them off below it.
        ("w/sub/tsconfig.json", r#"{ "compilerOptions": {} }"#),
        ("w/sub/b.ts", ""),
        // A config that extends itself in a ring still loads.
        (
            "r/tsconfig.json",
            r#"{ "extends": "./other.json", "compilerOptions": { "baseUrl": "." } }"#,
        ),
        ("r/other.json", r#"{ "extends": "./tsconfig.json" }"#),
        ("r/k.ts", ""),
        ("r/m.ts", ""),
    ]);
    assert_eq!(res(&fs, "w/a.js", "lib/x"), file("w/lib/x.js"));
    assert_eq!(res(&fs, "w/sub/b.ts", "lib/x"), Resolve::External);
    assert_eq!(res(&fs, "r/m.ts", "k"), file("r/k.ts"));
}

#[test]
fn alias_edges_close_a_cycle_and_take_exports() {
    let fs = mem(&[
        (
            "app/tsconfig.json",
            r#"{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }"#,
        ),
        (
            "app/src/a.ts",
            "import { b } from '@/b';\nexport const a = 1;\n",
        ),
        (
            "app/src/b.ts",
            "import { a } from '../src/a';\nexport const b = 2;\nexport const unused = 3;\n",
        ),
        (
            "app/src/main.ts",
            "import '@/a';\nimport x from '@/gone';\n",
        ),
    ]);
    let start: Vec<PathBuf> = ["app/src/a.ts", "app/src/b.ts", "app/src/main.ts"]
        .iter()
        .map(PathBuf::from)
        .collect();
    let g = build_graph_in(&fs, start.clone(), &Options::default());
    let comps = strongly_connected(&g);
    assert_eq!(comps.len(), 1, "a <-> b through the alias");
    assert_eq!(g.unresolved.len(), 1);
    assert_eq!(g.unresolved[0].spec, "@/gone");

    let u = unused_exports(&fs, &g, 3, &exts(), false);
    let names: Vec<&str> = u.iter().map(|x| x.name.as_str()).collect();
    assert_eq!(names, vec!["unused"]);

    let off = Options {
        tsconfig: false,
        ..Options::default()
    };
    let g = build_graph_in(&fs, start, &off);
    assert!(strongly_connected(&g).is_empty());
    assert!(g.unresolved.is_empty());
}
