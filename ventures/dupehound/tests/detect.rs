use dupehound::*;

fn file(path: &str, src: &str) -> SourceFile {
    SourceFile::from_bytes(path, src.as_bytes())
}

fn body(name: &str) -> String {
    // 12 lines, well over 50 tokens.
    let mut s = format!("function {name}(a, b) {{\n");
    for i in 0..10 {
        s.push_str(&format!(
            "  const v{i} = a * {i} + b - compute(a, {i}, 'x');\n"
        ));
    }
    s.push_str("}\n");
    s
}

fn opts() -> Options {
    Options::default()
}

#[test]
fn tokenizer_skips_whitespace_and_comments() {
    let a = tokenize(
        b"let x = 1; // hi\n/* block\n */ let y = 2;",
        CommentStyle::CLike,
    );
    let b = tokenize(b"let   x=1;\n\n\nlet y = 2;", CommentStyle::CLike);
    let ha: Vec<u64> = a.iter().map(|t| t.hash).collect();
    let hb: Vec<u64> = b.iter().map(|t| t.hash).collect();
    assert_eq!(ha, hb);
    assert_eq!(a.len(), 10);
    assert_eq!(a[5].line, 3, "line count survives a block comment");
}

#[test]
fn tokenizer_strings_and_templates_are_single_tokens() {
    let t = tokenize(
        b"f('a b // not a comment', \"c\", `x ${ y + `z` } w`)",
        CommentStyle::CLike,
    );
    // f ( 'str' , "str" , `tpl` )
    assert_eq!(t.len(), 8);
}

#[test]
fn tokenizer_hash_comments_and_triple_quotes() {
    let t = tokenize(
        b"x = 1  # c\ns = \"\"\"multi\nline\"\"\"\ny = 2\n",
        CommentStyle::Hash,
    );
    assert_eq!(t.len(), 9);
    assert_eq!(t[5].line, 2);
    assert_eq!(t[5].end_line, 3);
    assert_eq!(t[6].line, 4);
}

#[test]
fn tokenizer_never_panics_on_junk() {
    for src in [
        &b"'unterminated"[..],
        b"`${{{",
        b"/*",
        b"\"\\",
        b"\xff\xfe\x00",
        b"0x",
        b"`a\\",
    ] {
        let _ = tokenize(src, CommentStyle::CLike);
        let _ = tokenize(src, CommentStyle::Hash);
    }
}

#[test]
fn finds_a_copy_across_files_despite_reformatting() {
    let a = body("f");
    let b = format!(
        "// header\n\n{}",
        body("f").replace("  ", "\t").replace(" = ", "=")
    );
    let files = vec![file("a.js", &a), file("b.js", &b)];
    let clones = detect(&files, opts());
    assert_eq!(clones.len(), 1);
    let c = clones[0];
    assert_eq!(c.first.file, 0);
    assert_eq!(c.second.file, 1);
    assert_eq!(
        c.tokens() as usize,
        files[0].tokens.len(),
        "whole body matched as one clone"
    );
    assert_eq!(span_line_range(&files, c.second), (3, 14));
}

#[test]
fn renamed_identifiers_do_not_match_exactly() {
    let a = body("f");
    let b = body("f").replace("compute", "calc").replace('a', "q");
    let files = vec![file("a.js", &a), file("b.js", &b)];
    assert!(detect(&files, opts()).is_empty());
}

#[test]
fn three_copies_pair_with_the_first() {
    let files = vec![
        file("a.js", &body("f")),
        file("b.js", &body("f")),
        file("c.js", &body("f")),
    ];
    let clones = detect(&files, opts());
    assert_eq!(clones.len(), 2);
    assert!(clones.iter().all(|c| c.first.file == 0));
    let st = stats(&files, &clones);
    assert_eq!(
        st.duplicated_lines, 24,
        "two copies of 12 lines; the original is not counted"
    );
}

#[test]
fn copy_inside_one_file_is_found_and_windows_never_self_pair() {
    let src = format!("{}\nlet sep = 1;\n{}", body("f"), body("f"));
    let files = vec![file("a.js", &src)];
    let clones = detect(&files, opts());
    assert_eq!(clones.len(), 1);
    assert!(clones[0].first.end <= clones[0].second.start);

    // A long run of one repeated token overlaps itself: no clone.
    let rep = "x,\n".repeat(400);
    let files = vec![file("r.js", &rep)];
    let clones = detect(&files, opts());
    assert!(
        clones.iter().all(|c| c.second.start - c.first.start >= 50),
        "windows never pair with themselves"
    );
}

#[test]
fn min_lines_filters_one_line_clones() {
    let line =
        "call(a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p, q, r, s, t, u, v, w, x, y, z);\n";
    let files = vec![file("a.js", line), file("b.js", line)];
    assert!(detect(&files, opts()).is_empty());
    let loose = Options {
        min_lines: 1,
        ..opts()
    };
    assert_eq!(detect(&files, loose).len(), 1);
}

#[test]
fn min_tokens_is_respected() {
    let files = vec![file("a.js", &body("f")), file("b.js", &body("f"))];
    let n = files[0].tokens.len();
    let o = Options {
        min_tokens: n + 1,
        ..opts()
    };
    assert!(detect(&files, o).is_empty());
    let o = Options {
        min_tokens: n,
        ..opts()
    };
    assert_eq!(detect(&files, o).len(), 1);
}

#[test]
fn deterministic() {
    let files: Vec<SourceFile> = (0..20)
        .map(|i| {
            file(
                &format!("f{i:02}.js"),
                &format!(
                    "{}\nlet k{i} = {i};\n{}",
                    body("f"),
                    body(&format!("g{}", i % 3))
                ),
            )
        })
        .collect();
    let a = detect(&files, opts());
    for _ in 0..5 {
        assert_eq!(a, detect(&files, opts()));
    }
}

#[test]
fn matches_brute_force_on_random_inputs() {
    // Small alphabet so random files share many windows. Brute force: every
    // token position in a later file covered by an equal min_tokens window
    // somewhere earlier (or earlier in the same file, non-overlapping).
    let mut seed = 0x9e37_79b9_7f4a_7c15u64;
    let mut rnd = || {
        seed ^= seed << 13;
        seed ^= seed >> 7;
        seed ^= seed << 17;
        seed
    };
    for round in 0..60 {
        let w = 4 + (round % 4);
        let mut files = Vec::new();
        for f in 0..4 {
            let mut s = String::new();
            for _ in 0..(40 + rnd() % 60) {
                s.push_str(["a", "b", "c", "("][(rnd() % 4) as usize]);
                s.push('\n');
            }
            files.push(file(&format!("{f}.js"), &s));
        }
        let o = Options {
            min_tokens: w,
            min_lines: 1,
            ..Options::default()
        };
        let clones = detect(&files, o);
        for c in &clones {
            let ta =
                &files[c.first.file as usize].tokens[c.first.start as usize..c.first.end as usize];
            let tb = &files[c.second.file as usize].tokens
                [c.second.start as usize..c.second.end as usize];
            assert!(
                ta.iter().zip(tb).all(|(x, y)| x.hash == y.hash),
                "clone tokens differ"
            );
            assert!((c.first.file, c.first.start) < (c.second.file, c.second.start));
        }
        // Every window that also occurs earlier must be covered by some clone's
        // second side.
        let key = |f: usize, p: usize| -> Vec<u64> {
            files[f].tokens[p..p + w].iter().map(|t| t.hash).collect()
        };
        for fb in 0..files.len() {
            for pb in 0..files[fb].tokens.len().saturating_sub(w - 1) {
                let kb = key(fb, pb);
                let earlier = (0..=fb).any(|fa| {
                    let lim = if fa == fb {
                        pb.saturating_sub(w - 1)
                    } else {
                        files[fa].tokens.len().saturating_sub(w - 1)
                    };
                    (0..lim).any(|pa| (fa != fb || pa + w <= pb) && key(fa, pa) == kb)
                });
                // The first occurrence of a window may itself sit inside the
                // copy's file earlier and overlap; detect() only pairs with the
                // group's first occurrence, so require coverage only when the
                // first occurrence does not overlap this window.
                let first = (0..=fb)
                    .flat_map(|fa| {
                        (0..files[fa].tokens.len().saturating_sub(w - 1)).map(move |pa| (fa, pa))
                    })
                    .find(|&(fa, pa)| key(fa, pa) == kb)
                    .unwrap();
                let first_ok = first != (fb, pb) && !(first.0 == fb && first.1 + w > pb);
                if earlier && first_ok {
                    let covered = clones.iter().any(|c| {
                        c.second.file as usize == fb
                            && (c.second.start as usize) <= pb
                            && pb + w <= c.second.end as usize
                    });
                    assert!(covered, "round {round}: window {fb}:{pb} not covered");
                }
            }
        }
    }
}

fn nfile(path: &str, src: &str) -> SourceFile {
    SourceFile::from_bytes_with(path, src.as_bytes(), true)
}

/// Lines with different shapes, so no two look alike once names are erased
/// (identical-looking lines make a window's "first occurrence" land in the
/// same file and fragment the clone; see the README's limits).
fn varied(name: &str, a: &str, f: &str, lit: &str) -> String {
    format!(
        "function {name}({a}, b) {{\n\
         \x20 const t = {a} * {lit} + b - {f}({a}, 'x');\n\
         \x20 if (t > {lit}) {{ return [t, {a}]; }}\n\
         \x20 for (let i = 0; i < b.length; i++) {{ t += b[i] ? {f}(i) : -1; }}\n\
         \x20 while (t--) {{ b.push({{ k: t, v: {a} }}); }}\n\
         \x20 switch (t) {{ case 1: return {f}(t); default: break; }}\n\
         \x20 try {{ {f}(t, b); }} catch (e) {{ throw new Error(e.message + {lit}); }}\n\
         \x20 return {a} ? t : null;\n}}\n"
    )
}

#[test]
fn normalized_mode_matches_renamed_copies_and_exact_mode_does_not() {
    let a = varied("f", "a", "compute", "3");
    let b = varied("g", "q", "calc", "44");
    let exact = vec![file("a.js", &a), file("b.js", &b)];
    assert!(detect(&exact, opts()).is_empty());
    let norm = vec![nfile("a.js", &a), nfile("b.js", &b)];
    let clones = detect(&norm, opts());
    assert_eq!(clones.len(), 1);
    assert_eq!(clones[0].tokens() as usize, norm[0].tokens.len());
}

#[test]
fn normalized_mode_keeps_keywords_and_structure_apart() {
    let a = varied("f", "a", "compute", "3");
    // Same names and shapes, but `if` -> `while` and `for` -> `if`.
    let b = a
        .replace("if (t >", "while (t >")
        .replace("for (let", "if (let");
    let files = vec![nfile("a.js", &a), nfile("b.js", &b)];
    let o = Options {
        min_tokens: 30,
        ..opts()
    };
    let cross: Vec<_> = detect(&files, o)
        .into_iter()
        .filter(|c| c.first.file != c.second.file)
        .collect();
    assert!(
        cross
            .iter()
            .all(|c| (c.tokens() as usize) < files[0].tokens.len()),
        "keyword changes split the copy: {:?}",
        cross.iter().map(|c| c.tokens()).collect::<Vec<_>>()
    );
    // Punctuation counts too: a changed call shape is not a clone.
    let c = varied("f", "a", "compute", "3");
    let d = c.replace("compute(t)", "compute(t)(t)");
    let files = vec![nfile("c.js", &c), nfile("d.js", &d)];
    let full = files[0].tokens.len();
    assert!(detect(&files, opts())
        .iter()
        .all(|c| (c.tokens() as usize) < full));
}

#[test]
fn keyword_list_is_sorted_for_binary_search() {
    // A misordered list would silently miss keywords; probe a few.
    for w in [
        "abstract", "fn", "return", "while", "yield", "and", "end", "val",
    ] {
        let t = tokenize_with(w.as_bytes(), CommentStyle::CLike, true);
        assert_eq!(
            t[0].hash,
            tokenize(w.as_bytes(), CommentStyle::CLike)[0].hash,
            "{w}"
        );
    }
}

// ---- families ----

#[test]
fn one_block_in_four_files_is_one_family() {
    let files = vec![
        file("p/a/usage.mjs", &format!("let a = 1;\n{}", body("track"))),
        file("p/b/usage.mjs", &body("track")),
        file("p/c/usage.mjs", &format!("{}\nlet z = 2;\n", body("track"))),
        file("p/d/usage.mjs", &body("track")),
    ];
    let clones = detect(&files, opts());
    assert_eq!(
        clones.len(),
        3,
        "three pairs, all pointing at the first copy"
    );
    let fams = families(&files, &clones);
    assert_eq!(fams.len(), 1);
    let f = &fams[0];
    assert_eq!(f.occurrences.len(), 4);
    assert_eq!(f.identical_copies, 4);
    assert_eq!(f.shortest_lines, 12);
    assert_eq!(f.longest_lines, 12);
    assert_eq!(f.removable_lines, 3 * 12);
    assert_eq!(f.removable_lines_max, 3 * 12);
    assert_eq!(f.common_name.as_deref(), Some("usage.mjs"));
    assert_eq!(f.common_dir, "p");
    let whole: Vec<bool> = f.occurrences.iter().map(|o| o.whole_file).collect();
    assert_eq!(whole, vec![false, true, false, true]);
}

#[test]
fn two_unrelated_blocks_are_two_families() {
    let other = {
        let mut s = String::from("class Store {\n");
        for i in 0..10 {
            s.push_str(&format!(
                "  get{i}() {{ return this.map.get('k{i}') ?? null; }}\n"
            ));
        }
        s.push_str("}\n");
        s
    };
    let files = vec![
        file("x/one.js", &format!("{}\n{}", body("f"), other)),
        file("x/two.js", &body("f")),
        file("y/three.js", &other),
        file("y/four.js", &other),
    ];
    let clones = detect(&files, opts());
    let fams = families(&files, &clones);
    assert_eq!(fams.len(), 2, "{fams:?}");
    // Largest removable first: `other` has 3 copies, `f` has 2.
    assert_eq!(fams[0].occurrences.len(), 3);
    assert_eq!(fams[0].common_name, None);
    assert_eq!(fams[0].common_dir, "", "x/ and y/ share only the root");
    assert_eq!(fams[1].occurrences.len(), 2);
    assert_eq!(fams[1].common_dir, "x");
}

#[test]
fn an_edited_copy_stays_in_the_family_but_not_among_the_identical() {
    // Three full copies, and one that kept only the first 8 statement lines.
    let mut short = String::from("function f(a, b) {\n");
    for i in 0..8 {
        short.push_str(&format!(
            "  const v{i} = a * {i} + b - compute(a, {i}, 'x');\n"
        ));
    }
    short.push_str("  return 0;\n}\n");
    let files = vec![
        file("a.js", &body("f")),
        file("b.js", &body("f")),
        file("c.js", &short),
        file("d.js", &body("f")),
    ];
    let clones = detect(&files, opts());
    let fams = families(&files, &clones);
    assert_eq!(fams.len(), 1, "{fams:?}");
    let f = &fams[0];
    assert_eq!(f.occurrences.len(), 4);
    assert_eq!(f.identical_copies, 3);
    assert_eq!(f.identical_lines, 12);
    assert!(f.shortest_lines < f.longest_lines);
    // Exact copies set the floor: 2 * 12 beats 3 * shortest.
    assert_eq!(
        f.removable_lines,
        (2 * 12u64).max(3 * f.shortest_lines as u64)
    );
    assert_eq!(f.removable_lines_max, 2 * 12 + f.shortest_lines as u64);
}

#[test]
fn no_clones_no_families() {
    let files = vec![file("a.js", &body("f")), file("b.js", "let x = 1;\n")];
    assert!(families(&files, &detect(&files, opts())).is_empty());
}

#[test]
fn families_cover_every_clone_exactly_once_on_random_inputs() {
    let mut seed = 0x2545_f491_4f6c_dd1du64;
    let mut rnd = || {
        seed ^= seed << 13;
        seed ^= seed >> 7;
        seed ^= seed << 17;
        seed
    };
    for round in 0..80 {
        let w = 4 + (round % 4);
        let mut files = Vec::new();
        for f in 0..5 {
            let mut s = String::new();
            for _ in 0..(30 + rnd() % 60) {
                s.push_str(["a", "b", "c", "("][(rnd() % 4) as usize]);
                s.push('\n');
            }
            files.push(file(&format!("d{}/{f}.js", f % 2), &s));
        }
        let o = Options {
            min_tokens: w,
            min_lines: 1,
            ..Options::default()
        };
        let clones = detect(&files, o);
        let fams = families(&files, &clones);
        let inside = |f: &Family, s: Span| {
            f.occurrences
                .iter()
                .any(|x| x.span.file == s.file && x.span.start <= s.start && s.end <= x.span.end)
        };
        for c in &clones {
            let homes = fams
                .iter()
                .filter(|f| inside(f, c.first) || inside(f, c.second))
                .count();
            // A self-overlapping same-file clone can merge into one occurrence
            // and be dropped (fewer than two places); every other clone has
            // exactly one family holding both of its sides.
            let self_overlap = c.first.file == c.second.file && c.second.start < c.first.end;
            if !self_overlap {
                assert_eq!(homes, 1, "round {round}: clone {c:?} in {homes} families");
                let f = fams.iter().find(|f| inside(f, c.first)).unwrap();
                assert!(inside(f, c.second), "round {round}: sides split");
            }
        }
        for f in &fams {
            assert!(f.occurrences.len() >= 2);
            assert!(f.identical_copies >= 1 && f.identical_copies <= f.occurrences.len());
            assert!(
                f.removable_lines <= f.removable_lines_max,
                "lower estimate above upper"
            );
            assert!(f.shortest_lines <= f.longest_lines);
            // Occurrences in one file never overlap.
            for p in f.occurrences.windows(2) {
                if p[0].span.file == p[1].span.file {
                    assert!(p[0].span.end <= p[1].span.start);
                }
            }
        }
    }
}

#[test]
fn json_with_families_is_the_report_plus_a_families_array() {
    let files = vec![file("a.js", &body("f")), file("b.js", &body("f"))];
    let clones = detect(&files, opts());
    let st = stats(&files, &clones);
    let plain = json_report(&files, &clones, &st, opts(), 0.0);
    let with = json_report_with_families(&files, &clones, &st, opts(), 0.0);
    assert!(with.starts_with(&plain[..plain.len() - 1]));
    assert!(with.contains("\"families\":[{\"occurrences\":2,\"whole_file\":2,"));
    assert!(with.ends_with("]}]}"));
}

// ---------------------------------------------------------------------------
// --guarded: copies a sync test already keeps identical.
// ---------------------------------------------------------------------------

#[test]
fn guards_parse_skips_comments_and_blank_lines() {
    let g = Guards::parse(
        "# header\n\nventures/*/proposal.mjs   # sync.test.mjs\n  usage.mjs\nweird#name.mjs\n",
    );
    assert_eq!(
        g.patterns,
        vec!["ventures/*/proposal.mjs", "usage.mjs", "weird#name.mjs"]
    );
    assert!(Guards::parse("# only a comment\n\n").is_empty());
}

#[test]
fn guard_patterns_match_like_gitignore() {
    let g = Guards::parse("usage.mjs\nventures/*/proposal.mjs\n/platform/x/**/y.mjs\n");
    // No slash: the file name, anywhere.
    assert_eq!(g.matches("a/b/usage.mjs"), Some(0));
    assert_eq!(g.matches("usage.mjs"), Some(0));
    assert_eq!(g.matches("a/b/usage.mjs.bak"), None);
    // A slash: at any segment boundary, whatever root was scanned.
    assert_eq!(g.matches("ventures/foo/proposal.mjs"), Some(1));
    assert_eq!(g.matches("./ventures/foo/proposal.mjs"), Some(1));
    assert_eq!(g.matches("../../ventures/foo/proposal.mjs"), Some(1));
    assert_eq!(g.matches("myventures/foo/proposal.mjs"), None);
    // `*` stays inside one segment.
    assert_eq!(g.matches("ventures/foo/bar/proposal.mjs"), None);
    // Leading `/` anchors; `**/` matches zero or more directories.
    assert_eq!(g.matches("platform/x/y.mjs"), Some(2));
    assert_eq!(g.matches("platform/x/a/b/y.mjs"), Some(2));
    assert_eq!(g.matches("z/platform/x/y.mjs"), None);
    // Windows separators are normalised.
    assert_eq!(g.matches("ventures\\foo\\proposal.mjs"), Some(1));
}

fn guarded_tree() -> Vec<SourceFile> {
    // One 12-line block vendored into four projects plus its canonical copy,
    // and the same block pasted once into an unrelated file.
    let block = body("shared");
    let mut files = vec![file("platform/lib/shared.mjs", &block)];
    for p in ["a", "b", "c", "d"] {
        files.push(file(&format!("ventures/{p}/shared.mjs"), &block));
    }
    files.push(file(
        "ventures/e/calc.mjs",
        &format!("export const unrelated = [1, 2, 3];\n{block}"),
    ));
    files.sort_by(|a, b| a.path.cmp(&b.path));
    files
}

#[test]
fn guarded_copies_fold_into_one_and_strays_stay_visible() {
    let files = guarded_tree();
    let clones = detect(&files, opts());
    let fams = families(&files, &clones);
    assert_eq!(fams.len(), 1);
    assert_eq!(fams[0].occurrences.len(), 6);
    assert_eq!(fams[0].removable_lines, 5 * 12);

    let g = Guards::parse("platform/lib/shared.mjs\nventures/*/shared.mjs\n");
    let out = apply_guards(&files, fams.clone(), &g);
    assert!(out.fully_guarded.is_empty());
    assert_eq!(out.families.len(), 1);
    let f = &out.families[0];
    assert_eq!(f.guarded_copies, 5, "five synced copies count as one");
    assert_eq!(f.occurrences.len(), 2, "the stand-in and the stray");
    assert_eq!(f.removable_lines, 12, "only the stray is removable");
    assert!(f
        .occurrences
        .iter()
        .any(|o| files[o.span.file as usize].path == "ventures/e/calc.mjs"));

    // Guard the stray too and the family has nothing left to remove.
    let all = Guards::parse("shared.mjs\ncalc.mjs\n");
    let out = apply_guards(&files, fams.clone(), &all);
    assert!(out.families.is_empty());
    assert_eq!(out.fully_guarded, fams);

    // No patterns: nothing changes.
    let none = apply_guards(&files, fams.clone(), &Guards::default());
    assert_eq!(none.families, fams);
    assert!(none.fully_guarded.is_empty());
}

#[test]
fn a_single_guarded_copy_changes_nothing() {
    let files = guarded_tree();
    let fams = families(&files, &detect(&files, opts()));
    let g = Guards::parse("/platform/lib/shared.mjs\n");
    let out = apply_guards(&files, fams.clone(), &g);
    assert_eq!(out.families, fams);
}

#[test]
fn guarded_json_reports_folded_and_fully_guarded_totals() {
    let files = guarded_tree();
    let clones = detect(&files, opts());
    let st = stats(&files, &clones);
    let plain = json_report_with_families(&files, &clones, &st, opts(), 0.0);
    assert!(!plain.contains("guarded"), "no patterns, no new members");
    assert_eq!(
        json_report_with_guarded_families(&files, &clones, &st, opts(), 0.0, &Guards::default()),
        plain
    );
    let g = Guards::parse("shared.mjs\n");
    let j = json_report_with_guarded_families(&files, &clones, &st, opts(), 0.0, &g);
    assert!(j.contains("\"guarded_copies\":5"), "{j}");
    assert!(j.contains(
        "\"guarded\":{\"patterns\":1,\"families\":0,\"copies\":0,\"removable_lines\":0,\"removable_lines_max\":0}"
    ));
    assert!(j.ends_with("}}"));
}
