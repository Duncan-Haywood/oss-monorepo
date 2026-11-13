//! Browser build: a plain C ABI, so the page needs no wasm-bindgen glue
//! (the same shape as dupehound's).
//!
//! The page allocates a buffer with `ch_alloc`, fills it with files as
//! `u32 path_len, path, u32 src_len, src` (little-endian, repeated), calls
//! `ch_analyze(ptr, len, flags)` and reads `ch_result_len()` bytes of JSON at
//! the pointer it returns: exactly what `cyclehound --json` prints for the
//! same files. Flags: 1 = ignore `import type`, 2 = ignore `import()`,
//! 4 = ignore `require()`. Paths are relative to the folder's root.

use crate::*;

static mut RESULT: Vec<u8> = Vec::new();

#[no_mangle]
pub extern "C" fn ch_alloc(len: usize) -> *mut u8 {
    let mut v = Vec::<u8>::with_capacity(len);
    let p = v.as_mut_ptr();
    std::mem::forget(v);
    p
}

/// # Safety
/// `ptr` must come from `ch_alloc(len)` and not be freed twice.
#[no_mangle]
pub unsafe extern "C" fn ch_free(ptr: *mut u8, len: usize) {
    drop(Vec::from_raw_parts(ptr, 0, len));
}

fn read_u32(b: &[u8], at: usize) -> Option<u32> {
    b.get(at..at + 4)
        .map(|x| u32::from_le_bytes([x[0], x[1], x[2], x[3]]))
}

/// # Safety
/// `ptr` must point to `len` readable bytes from `ch_alloc`.
#[no_mangle]
pub unsafe extern "C" fn ch_analyze(ptr: *const u8, len: usize, flags: u32) -> *const u8 {
    let buf = std::slice::from_raw_parts(ptr, len);
    let mut mem = Memory::default();
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
        let p = normalize(Path::new(&*String::from_utf8_lossy(path)));
        mem.0.insert(p, src.to_vec());
        i = s0 + sl as usize;
    }
    let mut opts = Options::default();
    if flags & 1 != 0 {
        opts.kinds.remove(&ImportKind::Type);
    }
    if flags & 2 != 0 {
        opts.kinds.remove(&ImportKind::Dynamic);
    }
    if flags & 4 != 0 {
        opts.kinds.remove(&ImportKind::Require);
    }
    let mut start: Vec<PathBuf> = mem
        .0
        .keys()
        .filter(|p| {
            p.extension()
                .and_then(|e| e.to_str())
                .map(|e| opts.exts.iter().any(|x| x == e))
                .unwrap_or(false)
        })
        .cloned()
        .collect();
    start.sort();
    let g = build_graph_in(&mem, start, &opts);
    let comps = strongly_connected(&g);
    let cyc = cycles(&g, &comps);
    let json = cycles_json(&g, &comps, &cyc, Path::new(""));
    let r = &raw mut RESULT;
    *r = json.into_bytes();
    (*r).as_ptr()
}

#[no_mangle]
pub extern "C" fn ch_result_len() -> usize {
    unsafe { (*(&raw const RESULT)).len() }
}
