//! Browser build: a plain C ABI, so the page needs no wasm-bindgen glue.
//!
//! The page allocates a buffer with `dh_alloc`, fills it with files as
//! `u32 path_len, path, u32 src_len, src` (little-endian, repeated), calls
//! `dh_analyze`, and reads `dh_result_len()` bytes of JSON at the pointer
//! it returns. Rayon has no threads here and runs on the calling thread.

use crate::*;

static mut RESULT: Vec<u8> = Vec::new();

#[no_mangle]
pub extern "C" fn dh_alloc(len: usize) -> *mut u8 {
    let mut v = Vec::<u8>::with_capacity(len);
    let p = v.as_mut_ptr();
    std::mem::forget(v);
    p
}

/// # Safety
/// `ptr` must come from `dh_alloc(len)` and not be freed twice.
#[no_mangle]
pub unsafe extern "C" fn dh_free(ptr: *mut u8, len: usize) {
    drop(Vec::from_raw_parts(ptr, 0, len));
}

fn read_u32(b: &[u8], at: usize) -> Option<u32> {
    b.get(at..at + 4)
        .map(|x| u32::from_le_bytes([x[0], x[1], x[2], x[3]]))
}

fn parse(buf: &[u8], normalize: bool) -> Vec<SourceFile> {
    let mut files = Vec::new();
    let mut i = 0;
    while let Some(pl) = read_u32(buf, i) {
        let p0 = i + 4;
        let Some(path) = buf.get(p0..p0 + pl as usize) else {
            break;
        };
        let Some(sl) = read_u32(buf, p0 + pl as usize) else {
            break;
        };
        let s0 = p0 + pl as usize + 4;
        let Some(src) = buf.get(s0..s0 + sl as usize) else {
            break;
        };
        files.push(SourceFile::from_bytes_with(
            String::from_utf8_lossy(path).into_owned(),
            src,
            normalize,
        ));
        i = s0 + sl as usize;
    }
    files.sort_by(|a, b| a.path.cmp(&b.path));
    files
}

/// # Safety
/// `ptr` must point to `len` readable bytes from `dh_alloc`.
#[no_mangle]
pub unsafe extern "C" fn dh_analyze(
    ptr: *const u8,
    len: usize,
    min_tokens: u32,
    min_lines: u32,
    normalize: u32,
) -> *const u8 {
    let buf = std::slice::from_raw_parts(ptr, len);
    let files = parse(buf, normalize != 0);
    let opts = Options {
        min_tokens: min_tokens.max(1) as usize,
        min_lines,
        normalize: normalize != 0,
    };
    let clones = detect(&files, opts);
    let st = stats(&files, &clones);
    let out = json_report(&files, &clones, &st, opts, 0.0).into_bytes();
    let r = &mut *std::ptr::addr_of_mut!(RESULT);
    *r = out;
    r.as_ptr()
}

#[no_mangle]
pub extern "C" fn dh_result_len() -> usize {
    unsafe { (*std::ptr::addr_of!(RESULT)).len() }
}
