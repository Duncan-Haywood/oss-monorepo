//! C-ABI entry points for the WebAssembly build (no wasm-bindgen, no
//! dependencies). The host allocates the input with `wfe_alloc`, calls
//! `wfe_plan_json` or `wfe_plan_dxf`, reads the result through
//! `wfe_result_ptr` / `wfe_result_len`, and frees with `wfe_free`.
use crate::{out, read_str};
use std::cell::RefCell;

thread_local! { static RESULT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) }; }

#[no_mangle]
pub extern "C" fn wfe_alloc(len: usize) -> *mut u8 {
    let mut v = Vec::<u8>::with_capacity(len.max(1));
    let p = v.as_mut_ptr();
    std::mem::forget(v);
    p
}

/// # Safety
/// `ptr` must come from `wfe_alloc(cap)` with the same `cap`.
#[no_mangle]
pub unsafe extern "C" fn wfe_free(ptr: *mut u8, cap: usize) {
    drop(Vec::from_raw_parts(ptr, 0, cap.max(1)));
}

#[no_mangle]
pub extern "C" fn wfe_result_ptr() -> *const u8 { RESULT.with(|r| r.borrow().as_ptr()) }
#[no_mangle]
pub extern "C" fn wfe_result_len() -> usize { RESULT.with(|r| r.borrow().len()) }

/// Run `kind` (0 = plan JSON, 1 = DXF) on the model text at `ptr`/`len`;
/// `storey` is 0-based, or -1 for all. Returns 0 on success; on failure the
/// result holds the error message and the return value is 1.
fn run(ptr: *const u8, len: usize, storey: i32, kind: u32) -> u32 {
    // SAFETY: the host passes a buffer it allocated with wfe_alloc and filled.
    let bytes = unsafe { std::slice::from_raw_parts(ptr, len) };
    let text = String::from_utf8_lossy(bytes);
    let (code, body) = match read_str(&text) {
        Err(e) => (1, e),
        Ok(b) => {
            let st = if storey < 0 { None } else { Some(storey as usize) };
            if st.is_some_and(|k| k >= b.storeys.len()) {
                (1, format!("no storey {}; the file has {}", storey + 1, b.storeys.len()))
            } else if kind == 0 { (0, out::json(&b, st)) } else { (0, out::dxf(&b, st)) }
        }
    };
    RESULT.with(|r| *r.borrow_mut() = body.into_bytes());
    code
}

#[no_mangle]
pub extern "C" fn wfe_plan_json(ptr: *const u8, len: usize, storey: i32) -> u32 { run(ptr, len, storey, 0) }
#[no_mangle]
pub extern "C" fn wfe_plan_dxf(ptr: *const u8, len: usize, storey: i32) -> u32 { run(ptr, len, storey, 1) }
