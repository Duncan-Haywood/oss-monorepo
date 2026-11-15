use cyclehound::*;
use std::path::PathBuf;

fn names(src: &str) -> Vec<String> {
    extract_shape(src)
        .exports
        .into_iter()
        .map(|e| e.name)
        .collect()
}

#[test]
fn typescript_export_forms() {
    let src = r#"
export type Alias = string;
export interface Shape { a: number }
export enum Color { Red }
export const enum Flag { On }
export declare const declared: number;
export abstract class Base {}
export namespace Space { export const inner = 1; }
export type { Re } from "./re";
export import Short = Space.inner;
export default class {}
"#;
    assert_eq!(
        names(src),
        vec![
            "Alias", "Shape", "Color", "Flag", "declared", "Base", "Space", "inner", "Re", "Short",
            "default"
        ]
    );
}

#[test]
fn import_bindings() {
    let sh = extract_shape(
        r#"
import d, { a, b as c, type T, "str" as s } from "./x";
import type { U } from "./y";
import * as ns from "./z";
import def, * as ns2 from "./w";
import "./side";
const r = require("./req");
const m = import("./dyn");
import { from } from "./from";
const { k1, k2: alias, k3 = 1 } = await import("./destructured");
const { ...rest } = await import("./rest");
let { [key]: v } = await import("./computed");
"#,
    );
    let got: Vec<(String, Uses)> = sh.imports.into_iter().map(|i| (i.spec, i.uses)).collect();
    let n = |v: &[&str]| Uses::Names(v.iter().map(|s| s.to_string()).collect());
    assert_eq!(
        got,
        vec![
            ("./x".into(), n(&["default", "a", "b", "T", "str"])),
            ("./y".into(), n(&["U"])),
            ("./z".into(), Uses::All),
            ("./w".into(), Uses::All),
            ("./side".into(), Uses::SideEffect),
            ("./req".into(), Uses::All),
            ("./dyn".into(), Uses::All),
            ("./from".into(), n(&["from"])),
            ("./destructured".into(), n(&["k1", "k2", "k3"])),
            ("./rest".into(), Uses::All),
            ("./computed".into(), Uses::All),
        ]
    );
}

#[test]
fn declarator_lists_stop_at_the_statement() {
    let src = "export const a = f(1, 2), b = [3, 4], { c, d: e } = o\nconst notExported = 5, alsoNot = 6;\nexport let g\nh = 1";
    assert_eq!(names(src), vec!["a", "b", "c", "e", "g"]);
}

#[test]
fn lookalikes_are_not_exports() {
    let src = r#"
// export const commented = 1;
const s = "export const inString = 1";
obj.export = 1;
const t = `export ${"function"} f() {}`;
"#;
    assert!(names(src).is_empty());
}

#[test]
fn fixture_tree() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/exports");
    let mut files: Vec<PathBuf> = Vec::new();
    for sub in ["", "lib"] {
        for e in std::fs::read_dir(root.join(sub)).unwrap() {
            let p = e.unwrap().path();
            if p.extension().map(|x| x == "mjs").unwrap_or(false) {
                files.push(normalize(&p));
            }
        }
    }
    files.sort();
    let n = files.len();
    let opts = Options::default();
    let g = build_graph(files, &opts);
    let got: Vec<String> = unused_exports(&Disk, &g, n, &opts.exts, false)
        .into_iter()
        .map(|u| format!("{}:{}", relative(&g.files[u.file], &root), u.name))
        .collect();
    let want = [
        "a.mjs:unusedSecond",
        "a.mjs:neverImported",
        "a.mjs:Lonely",
        "a.mjs:alsoLocal",
        "a.mjs:local",
        "a.mjs:pickedA",
        "a.mjs:pickedB",
        "a.mjs:restC",
        "lib/index.mjs:unforwarded",
        "lib/index.mjs:ownIndex",
        "lib/named.mjs:unforwarded",
        "lib/named.mjs:notReexported",
        "lib/star.mjs:starUnused",
        "lib/star.mjs:default",
        "side.mjs:sideOnly",
    ];
    assert_eq!(got, want);
    // main.mjs imports everything else; with entries it adds nothing (it
    // exports nothing), and the namespace and dynamic imports cover ns.mjs
    // and lazy.mjs.
    assert_eq!(
        unused_exports(&Disk, &g, n, &opts.exts, true).len(),
        want.len()
    );
}
