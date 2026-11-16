//! Browser build: a plain C ABI, so the page needs no wasm-bindgen glue
//! (the same shape as cyclehound's and dupehound's).
//!
//! The page allocates a buffer with `cs_alloc`, fills it with
//! `u32 css_len, css, u32 content_len, content` (little-endian), calls
//! `cs_analyze(ptr, len, flags)` and reads `cs_result_len()` bytes of JSON at
//! the pointer it returns: the object `csshound --json` prints for a page,
//! plus `dead` (each whole rule that would go, with its byte offset).
//! Flags: 1 = keep classes built from a run-time prefix (`cls-${x}`);
//! 2 = the CSS buffer is an HTML page: take its `<style>` blocks as the CSS
//! and the rest of the page, plus the content buffer, as the content.

use crate::*;

static mut RESULT: Vec<u8> = Vec::new();

#[no_mangle]
pub extern "C" fn cs_alloc(len: usize) -> *mut u8 {
    let mut v = Vec::<u8>::with_capacity(len);
    let p = v.as_mut_ptr();
    std::mem::forget(v);
    p
}

/// # Safety
/// `ptr` must come from `cs_alloc(len)` and not be freed twice.
#[no_mangle]
pub unsafe extern "C" fn cs_free(ptr: *mut u8, len: usize) {
    drop(Vec::from_raw_parts(ptr, 0, len));
}

fn take(b: &[u8], at: usize) -> Option<(&[u8], usize)> {
    let x = b.get(at..at + 4)?;
    let n = u32::from_le_bytes([x[0], x[1], x[2], x[3]]) as usize;
    Some((b.get(at + 4..at + 4 + n)?, at + 4 + n))
}

/// # Safety
/// `ptr` must point to `len` readable bytes from `cs_alloc`.
#[no_mangle]
pub unsafe extern "C" fn cs_analyze(ptr: *const u8, len: usize, flags: u32) -> *const u8 {
    let buf = std::slice::from_raw_parts(ptr, len);
    let (a, next) = take(buf, 0).unwrap_or((&[], 0));
    let (b, _) = take(buf, next).unwrap_or((&[], 0));
    let a = String::from_utf8_lossy(a).into_owned();
    let b = String::from_utf8_lossy(b).into_owned();
    let (css, content) = if flags & 2 != 0 {
        let (rest, styles) = page::split_styles(&a);
        (styles.join("\n"), format!("{rest}\n{b}"))
    } else {
        (a, b)
    };
    let opts = Options { safelist: Default::default(), dynamic_prefixes: flags & 1 != 0 };
    let json = report_json("", &analyse_with(&css, &content, &opts), true);
    let r = &raw mut RESULT;
    *r = json.into_bytes();
    (*r).as_ptr()
}

#[no_mangle]
pub extern "C" fn cs_result_len() -> usize {
    unsafe { (*(&raw const RESULT)).len() }
}
