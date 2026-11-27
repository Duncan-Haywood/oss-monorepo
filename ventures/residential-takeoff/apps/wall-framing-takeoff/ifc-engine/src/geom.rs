//! Rigid placements (IfcAxis2Placement3D/2D, IfcLocalPlacement chains).

pub type V3 = [f64; 3];

pub fn sub(a: V3, b: V3) -> V3 { [a[0] - b[0], a[1] - b[1], a[2] - b[2]] }
pub fn add(a: V3, b: V3) -> V3 { [a[0] + b[0], a[1] + b[1], a[2] + b[2]] }
pub fn scale(a: V3, k: f64) -> V3 { [a[0] * k, a[1] * k, a[2] * k] }
pub fn dot(a: V3, b: V3) -> f64 { a[0] * b[0] + a[1] * b[1] + a[2] * b[2] }
pub fn cross(a: V3, b: V3) -> V3 { [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]] }
pub fn norm(a: V3) -> f64 { dot(a, a).sqrt() }
pub fn unit(a: V3) -> Option<V3> {
    let l = norm(a);
    if l > 1e-12 && l.is_finite() { Some(scale(a, 1.0 / l)) } else { None }
}

/// A rigid transform: columns x, y, z of the rotation, then the origin.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Frame {
    pub x: V3,
    pub y: V3,
    pub z: V3,
    pub o: V3,
}

impl Frame {
    pub const ID: Frame = Frame { x: [1.0, 0.0, 0.0], y: [0.0, 1.0, 0.0], z: [0.0, 0.0, 1.0], o: [0.0, 0.0, 0.0] };

    /// Build from IFC's Axis (local Z) and RefDirection (local X, projected
    /// to be normal to Z), as IfcAxis2Placement3D defines them.
    pub fn from_axes(o: V3, axis: Option<V3>, refd: Option<V3>) -> Frame {
        let z = axis.and_then(unit).unwrap_or([0.0, 0.0, 1.0]);
        let r = refd.and_then(unit).unwrap_or(if z[0].abs() < 0.9 { [1.0, 0.0, 0.0] } else { [0.0, 1.0, 0.0] });
        let x = unit(sub(r, scale(z, dot(r, z))))
            .or_else(|| unit(sub([1.0, 0.0, 0.0], scale(z, z[0]))))
            .or_else(|| unit(sub([0.0, 1.0, 0.0], scale(z, z[1]))))
            .unwrap_or([1.0, 0.0, 0.0]);
        let y = cross(z, x);
        Frame { x, y, z, o }
    }

    /// Local point to parent coordinates.
    pub fn apply(&self, p: V3) -> V3 {
        add(self.o, add(scale(self.x, p[0]), add(scale(self.y, p[1]), scale(self.z, p[2]))))
    }
    /// Local direction to parent coordinates.
    pub fn rotate(&self, d: V3) -> V3 { add(scale(self.x, d[0]), add(scale(self.y, d[1]), scale(self.z, d[2]))) }

    /// `self` placed inside `parent`.
    pub fn within(&self, parent: &Frame) -> Frame {
        Frame { x: parent.rotate(self.x), y: parent.rotate(self.y), z: parent.rotate(self.z), o: parent.apply(self.o) }
    }
}

/// Intersection of two plan lines p + t*u and q + s*v. Returns (t, s).
pub fn intersect2(p: [f64; 2], u: [f64; 2], q: [f64; 2], v: [f64; 2]) -> Option<(f64, f64)> {
    let den = u[0] * v[1] - u[1] * v[0];
    let lu = (u[0] * u[0] + u[1] * u[1]).sqrt();
    let lv = (v[0] * v[0] + v[1] * v[1]).sqrt();
    if den.abs() < 1e-9 * lu * lv || lu == 0.0 || lv == 0.0 { return None; }
    let w = [q[0] - p[0], q[1] - p[1]];
    let t = (w[0] * v[1] - w[1] * v[0]) / den;
    let s = (w[0] * u[1] - w[1] * u[0]) / den;
    Some((t, s))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn frames_compose() {
        // rotate 90 degrees about Z, then translate
        let a = Frame::from_axes([1.0, 0.0, 0.0], None, Some([0.0, 1.0, 0.0]));
        let b = Frame::from_axes([2.0, 0.0, 3.0], None, None);
        let w = b.within(&a);
        let p = w.apply([1.0, 0.0, 0.0]);
        assert!((p[0] - 1.0).abs() < 1e-12 && (p[1] - 3.0).abs() < 1e-12 && (p[2] - 3.0).abs() < 1e-12, "{p:?}");
    }
    #[test]
    fn refdirection_is_orthogonalised() {
        let f = Frame::from_axes([0.0; 3], Some([0.0, 0.0, 2.0]), Some([1.0, 0.0, 1.0]));
        assert!((dot(f.x, f.z)).abs() < 1e-12 && (norm(f.x) - 1.0).abs() < 1e-12);
        // degenerate: RefDirection parallel to Axis
        let g = Frame::from_axes([0.0; 3], Some([1.0, 0.0, 0.0]), Some([1.0, 0.0, 0.0]));
        assert!((dot(g.x, g.z)).abs() < 1e-12);
    }
    #[test]
    fn lines_meet() {
        let (t, s) = intersect2([0.0, 0.0], [1.0, 0.0], [2.0, -1.0], [0.0, 1.0]).unwrap();
        assert!((t - 2.0).abs() < 1e-12 && (s - 1.0).abs() < 1e-12);
        assert!(intersect2([0.0, 0.0], [1.0, 0.0], [0.0, 1.0], [2.0, 0.0]).is_none());
    }
}
