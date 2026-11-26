//! ifc-engine: read an IFC building model into the wall plan a framing
//! takeoff needs. See README.md for what is read and how it was checked.
pub mod geom;
pub mod ifc;
pub mod out;
pub mod step;
#[cfg(target_arch = "wasm32")]
pub mod wasm;

/// Parse and read a model in one call.
pub fn read_str(text: &str) -> Result<ifc::Building, String> {
    let m = step::Model::parse(text)?;
    Ok(ifc::read(&m))
}
