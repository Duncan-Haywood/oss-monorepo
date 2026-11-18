use cyclehound::*;
use std::path::{Path, PathBuf};

fn specs(src: &str) -> Vec<(String, ImportKind)> {
    extract_imports(src)
        .into_iter()
        .map(|i| (i.spec, i.kind))
        .collect()
}

fn s(spec: &str, k: ImportKind) -> (String, ImportKind) {
    (spec.to_string(), k)
}

use ImportKind::*;

#[test]
fn static_forms() {
    let src = r#"
import a from "./a";
import * as b from './b';
import { c, d as e } from "./c";
import f, { g } from "./f";
import "./side-effect";
export * from "./star";
export * as ns from "./ns";
export { h } from "./h";
export { default } from "./def";
import { from } from "./from-binding";
import from from "./from-default";
"#;
    assert_eq!(
        specs(src),
        vec![
            s("./a", Static),
            s("./b", Static),
            s("./c", Static),
            s("./f", Static),
            s("./side-effect", Static),
            s("./star", Static),
            s("./ns", Static),
            s("./h", Static),
            s("./def", Static),
            s("./from-binding", Static),
            s("./from-default", Static),
        ]
    );
}

#[test]
fn dynamic_require_and_type() {
    let src = r#"
const m = await import("./dyn");
const n = import("./dyn2", { with: { type: "json" } });
const r = require('./req');
import type { T } from "./types";
export type { U } from "./types2";
import type, { x } from "./named-type";
import { type V, w } from "./inline";
"#;
    assert_eq!(
        specs(src),
        vec![
            s("./dyn", Dynamic),
            s("./dyn2", Dynamic),
            s("./req", Require),
            s("./types", Type),
            s("./types2", Type),
            s("./named-type", Static),
            s("./inline", Static),
        ]
    );
}

#[test]
fn ignores_lookalikes() {
    let src = r#"
// import x from "./comment";
/* import y from "./block"; require("./block2") */
const s = 'import z from "./in-string"';
const t = `import q from "./in-template" ${ "x" }`;
const re = /import a from "\.\/in-regex"/;
obj.import("./method");
x.require("./method2");
import.meta.url;
export { local };
const o = { import: 1, require: 2 };
const v = import(name);
require(`./tmpl-${x}`);
"#;
    assert_eq!(specs(src), vec![]);
}

#[test]
fn template_substitution_nesting() {
    // An import after a template with nested braces and a nested template
    // must still be found; one inside the substitution is real code too.
    let src = r#"
const t = `a ${ { b: `c ${ d } e` }.b } f`;
const m = `${ require("./inside-subst") }`;
import g from "./after";
"#;
    assert_eq!(
        specs(src),
        vec![s("./inside-subst", Require), s("./after", Static)]
    );
}

#[test]
fn division_is_not_regex() {
    let src = "const a = b / 2; const c = (d) / e / f;\nimport g from './after-division';\n";
    assert_eq!(specs(src), vec![s("./after-division", Static)]);
    // A slash that never closes on its line is a division, not a regex that
    // swallows the rest of the file.
    let src2 = "return x\n/ y;\nimport h from './h';\n";
    assert_eq!(specs(src2), vec![s("./h", Static)]);
}

#[test]
fn lines_and_shebang() {
    let src = "#!/usr/bin/env node\n\n\nimport a from './a';\n/*\n\n*/ const b = require('./b');\n";
    let got: Vec<u32> = extract_imports(src).iter().map(|i| i.line).collect();
    assert_eq!(got, vec![4, 7]);
}

#[test]
fn non_ascii_does_not_panic() {
    let src = "const café = 'naïve'; // ünïcode\nimport ä from './ä.mjs';\nconst 変数 = 1;\n";
    assert_eq!(specs(src), vec![s("./ä.mjs", Static)]);
}

#[test]
fn relative_paths() {
    assert_eq!(relative(Path::new("a/b/c.mjs"), Path::new("a")), "b/c.mjs");
    assert_eq!(
        relative(Path::new("x/y.mjs"), Path::new("a/b")),
        "../../x/y.mjs"
    );
    assert_eq!(normalize(Path::new("a/./b/../c")), PathBuf::from("a/c"));
}

fn fixture() -> (Graph, PathBuf) {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/ring");
    let mut files: Vec<PathBuf> = Vec::new();
    for e in [
        "a.mjs",
        "b.mjs",
        "lib/index.mjs",
        "x.ts",
        "y.ts",
        "types/t.ts",
        "z.mjs",
        "self.mjs",
    ] {
        files.push(root.join(e));
    }
    (build_graph(files, &Options::default()), root)
}

#[test]
fn graph_resolves_index_ts_js_and_follows_outside() {
    let (g, root) = fixture();
    let adj = adjacency(&g, &root);
    let get = |k: &str| adj.get(k).cloned().unwrap_or_default();
    assert_eq!(get("b.mjs"), vec!["lib/index.mjs"]);
    assert_eq!(get("lib/index.mjs"), vec!["a.mjs"]);
    assert_eq!(get("y.ts"), vec!["types/t.ts", "x.ts"]); // "./x.js" written for x.ts
    assert_eq!(get("z.mjs"), vec!["../outside/o.mjs", "a.mjs"]);
    assert!(
        adj.contains_key("../outside/o.mjs"),
        "followed out of the root"
    );
    assert_eq!(g.unresolved.len(), 1);
    assert_eq!(g.unresolved[0].spec, "./gone.mjs");
}

#[test]
fn components_and_cycles() {
    let (g, root) = fixture();
    let comps = strongly_connected(&g);
    let names: Vec<Vec<String>> = comps
        .iter()
        .map(|c| c.iter().map(|&i| relative(&g.files[i], &root)).collect())
        .collect();
    assert_eq!(
        names,
        vec![
            vec!["a.mjs", "b.mjs", "lib/index.mjs"],
            vec!["self.mjs"],
            vec!["types/t.ts", "x.ts", "y.ts"],
        ]
    );
    let cyc = cycles(&g, &comps);
    // The three-file ring is one cycle; the TypeScript component has a
    // runtime pair and a type-only pair, both listed.
    assert_eq!(cyc[0].len(), 1);
    assert_eq!(cyc[0][0].len(), 3);
    assert_eq!(cyc[1], vec![vec![comps[1][0]]]);
    assert_eq!(cyc[2].len(), 2);
    // Every file of every component sits on some listed cycle.
    for (c, list) in comps.iter().zip(&cyc) {
        for f in c {
            assert!(list.iter().any(|cy| cy.contains(f)));
        }
    }
}

#[test]
fn no_type_drops_type_only_cycles() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/ring");
    let mut o = Options::default();
    o.kinds.remove(&ImportKind::Type);
    let g = build_graph(
        vec![
            root.join("x.ts"),
            root.join("y.ts"),
            root.join("types/t.ts"),
        ],
        &o,
    );
    let comps = strongly_connected(&g);
    let names: Vec<Vec<String>> = comps
        .iter()
        .map(|c| c.iter().map(|&i| relative(&g.files[i], &root)).collect())
        .collect();
    assert_eq!(names, vec![vec!["x.ts", "y.ts"]]);
}

#[test]
fn orphans_are_files_nothing_imports() {
    let (g, root) = fixture();
    let o: Vec<String> = orphans(&g, 8)
        .iter()
        .map(|&i| relative(&g.files[i], &root))
        .collect();
    assert_eq!(o, vec!["z.mjs"]);
}

#[test]
fn deep_chain_does_not_overflow() {
    // Iterative Tarjan: a 200k-node ring must not blow the stack.
    let n = 200_000;
    let mut g = Graph::default();
    for i in 0..n {
        g.files.push(PathBuf::from(format!("f{i:06}.mjs")));
        g.edges.push(vec![Edge {
            to: (i + 1) % n,
            kind: ImportKind::Static,
            line: 1,
        }]);
    }
    let comps = strongly_connected(&g);
    assert_eq!(comps.len(), 1);
    assert_eq!(comps[0].len(), n);
}
