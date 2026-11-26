//! C-ABI entry points for a browser (wasm32-unknown-unknown), no
//! wasm-bindgen and no dependencies. The host calls `ifc_alloc`, copies the
//! file's bytes in, calls `ifc_plan` or `ifc_dxf`, reads the result with
//! `ifc_result_ptr` / `ifc_result_len`, and frees with `ifc_dealloc`.
//! Errors come back as `{"error":"..."}` from `ifc_plan` and as a DXF-less
//! empty result from `ifc_dxf` (the host calls `ifc_plan` first).
use crate::{ifc, out, step};
use std::cell::RefCell;

thread_local! { static RESULT: RefCell<String> = const { RefCell::new(String::new()) }; }

fn set(s: String) { RESULT.with(|r| *r.borrow_mut() = s); }

fn model(ptr: *const u8, len: usize) -> Result<ifc::Building, String> {
    // SAFETY: the host promises `ptr` came from `ifc_alloc(len)` and was filled.
    let bytes = unsafe { std::slice::from_raw_parts(ptr, len) };
    let text = String::from_utf8_lossy(bytes);
    let m = step::Model::parse(&text)?;
    Ok(ifc::read(&m))
}

fn pick(b: &ifc::Building, storey: i32) -> Option<usize> {
    if storey >= 1 && (storey as usize) <= b.storeys.len() { Some(storey as usize - 1) } else { None }
}

#[no_mangle]
pub extern "C" fn ifc_alloc(len: usize) -> *mut u8 {
    let mut v = Vec::<u8>::with_capacity(len.max(1));
    let p = v.as_mut_ptr();
    std::mem::forget(v);
    p
}

#[no_mangle]
pub extern "C" fn ifc_dealloc(ptr: *mut u8, len: usize) {
    // SAFETY: pairs with `ifc_alloc(len)`; the Vec was created with capacity len.max(1).
    unsafe { drop(Vec::from_raw_parts(ptr, 0, len.max(1))) }
}

/// The plan as JSON for `storey` (1-based; 0 or out of range: every storey).
#[no_mangle]
pub extern "C" fn ifc_plan(ptr: *const u8, len: usize, storey: i32) {
    set(match model(ptr, len) {
        Ok(b) => out::json(&b, pick(&b, storey)),
        Err(e) => format!("{{\"error\":{:?}}}", e),
    });
}

/// The plan as DXF text (inches) for `storey` (1-based; 0: the lowest).
#[no_mangle]
pub extern "C" fn ifc_dxf(ptr: *const u8, len: usize, storey: i32) {
    set(match model(ptr, len) {
        Ok(b) => out::dxf(&b, pick(&b, if storey == 0 { 1 } else { storey })),
        Err(_) => String::new(),
    });
}

#[no_mangle]
pub extern "C" fn ifc_result_ptr() -> *const u8 { RESULT.with(|r| r.borrow().as_ptr()) }
#[no_mangle]
pub extern "C" fn ifc_result_len() -> usize { RESULT.with(|r| r.borrow().len()) }
