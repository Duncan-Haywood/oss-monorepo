//! Each case pins one decision PurgeCSS 9.1.0 makes with default options,
//! named after the function in `purgecss/lib/purgecss.js` that makes it.
use csshound::analyse;
use std::collections::HashSet;

fn rejected(css: &str, content: &str) -> Vec<String> {
    analyse(css, content, &HashSet::new()).rejected
}

fn dead(css: &str, content: &str) -> usize {
    analyse(css, content, &HashSet::new()).dead_rules
}

#[test]
fn default_extractor_words_are_case_sensitive_and_ascii() {
    // defaultExtractor: content.match(/[A-Za-z0-9_-]+/g)
    assert_eq!(rejected(".Btn{} .btn{}", "btn"), vec![".Btn"]);
    // a class with ':' can never be a word, so it is always rejected
    assert_eq!(rejected(r".sm\:p-4{}", "sm:p-4"), vec![r".sm\:p-4"]);
}

#[test]
fn class_id_and_tag_must_each_be_found() {
    // shouldKeepSelector: any class, id, tag or attribute part not found drops it
    assert_eq!(rejected("div.card #main p{}", "div card main"), vec!["div.card #main p"]);
    assert!(rejected("div.card #main p{}", "div card main p").is_empty());
}

#[test]
fn pseudo_classes_elements_and_combinators_never_drop() {
    assert!(rejected("a:hover::before > b ~ c + d *{}", "a b c d").is_empty());
}

#[test]
fn selector_lists_are_judged_one_by_one() {
    let r = analyse(".a, .b{x:y}", "a", &HashSet::new());
    assert_eq!(r.rejected, vec![".b"]);
    assert_eq!(r.dead_rules, 0);
    assert_eq!(dead(".a, .b{x:y}", "zzz"), 1);
}

#[test]
fn arguments_of_not_and_has_are_kept() {
    // isInPseudoClass && !isInPseudoClassWhereOrIs -> keep
    assert!(rejected(".a:not(.gone){} .a:has(.gone){}", "a").is_empty());
}

#[test]
fn is_and_where_arguments_are_judged_and_emptied_ones_drop_the_selector() {
    // isInPseudoClassWhereOrIs: judged as if outside; then the second pass
    // removes a selector whose :is()/:where() is left empty (not listed as
    // rejected, but the rule goes)
    assert_eq!(rejected(".a :is(.b, .c){}", "a b"), vec![".c"]);
    let r = analyse(".a :is(.x, .y){x:y}", "a", &HashSet::new());
    assert_eq!(r.rejected, vec![".x", ".y"]);
    assert_eq!(r.dead_rules, 1);
}

#[test]
fn lone_pseudo_at_root_is_kept() {
    // isPseudoClassAtRootLevel: a one-node top-level selector containing
    // :where/:is/:has/:not is kept itself; :is arguments are still judged
    assert!(rejected(":not(.x){}", "").is_empty());
    assert_eq!(rejected(":where(.x){}", ""), vec![".x"]);
}

#[test]
fn is_inside_not_is_kept_whole() {
    // isInPseudoClassWhereOrIs && isInsideNotPseudoClass -> keep
    assert!(rejected(".a:not(:is(.x)){}", "a").is_empty());
}

#[test]
fn attributes_follow_is_attribute_found() {
    let content = "input type number data-state open-now";
    assert!(rejected("[type]{} [type=number]{} [type=\"number\"]{}", content).is_empty());
    assert_eq!(rejected("[type=text]{}", content), vec!["[type=text]"]);
    assert_eq!(rejected("[data-x]{}", content), vec!["[data-x]"]);
    assert!(rejected("[data-state^=ope]{}", "data-state open").is_empty());
    assert!(rejected("[type$=ber]{}", content).is_empty());
    assert!(rejected("[type*=umb]{}", content).is_empty());
    assert_eq!(rejected("[type*=zzz]{}", content), vec!["[type*=zzz]"]);
}

#[test]
fn dynamic_attributes_are_always_kept() {
    // DYNAMIC_ATTRIBUTES = ["value", "checked", "selected", "open"]
    assert!(rejected("[value]{} [checked]{} [selected]{} [open]{}", "").is_empty());
}

#[test]
fn keyframes_and_other_at_rules_are_left_alone() {
    // evaluateRule exits for rules whose parent is a keyframes at-rule;
    // keyframes, font-face and variables are off by default
    let css = "@keyframes spin{from{x:y}to{x:y}} @font-face{font-family:x} @import 'x.css'; .a{}";
    assert_eq!(rejected(css, "a"), Vec::<String>::new());
    assert_eq!(analyse(css, "a", &HashSet::new()).rules, 1);
}

#[test]
fn media_supports_and_nesting_are_walked() {
    let css = "@media print{@supports (x:y){.p{x:y}}} .n{&.m{x:y} .k{x:y}}";
    assert_eq!(rejected(css, "n m"), vec![".k", ".p"]);
}

#[test]
fn ignore_annotations() {
    let css = "/* purgecss start ignore */.a{}/* purgecss end ignore */ /* purgecss ignore */ .b{} .c{/* purgecss ignore current */} .d{}";
    assert_eq!(rejected(css, ""), vec![".d"]);
}

#[test]
fn strings_comments_and_escapes_do_not_confuse_the_parser() {
    let css = ".a::after{content:\"}{;\"} /* .b{} */ .c\\.d{} .e{background:url(x;y)}";
    // `.c\.d` is the class "c.d", which no word can match
    assert_eq!(rejected(css, "a e"), vec![".c\\.d"]);
}

#[test]
fn safelist_keeps_a_name() {
    let mut s = HashSet::new();
    s.insert("js-open".to_string());
    assert!(analyse(".js-open{}", "", &s).rejected.is_empty());
}

#[test]
fn dead_bytes_count_whole_rules_only() {
    let css = ".a{color:red} .b{color:blue}";
    let r = analyse(css, "a", &HashSet::new());
    assert_eq!(r.dead_bytes, ".b{color:blue}".len());
}
