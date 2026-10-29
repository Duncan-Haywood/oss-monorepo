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
