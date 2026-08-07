use wasm_bindgen::prelude::*;

const MIN_SCALE: f64 = 0.15;
const MAX_SCALE: f64 = 5.0;

/// Rounds a world-coordinate to the nearest grid intersection.
#[wasm_bindgen]
pub fn snap_to_grid(value: f64, grid_size: f64) -> f64 {
    if !value.is_finite() || !grid_size.is_finite() || grid_size <= 0.0 {
        return value;
    }

    (value / grid_size).round() * grid_size
}

/// Keeps the viewport scale inside the supported zoom range.
#[wasm_bindgen]
pub fn clamp_scale(value: f64) -> f64 {
    if !value.is_finite() {
        return 1.0;
    }

    value.clamp(MIN_SCALE, MAX_SCALE)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snaps_coordinates_to_the_nearest_grid_line() {
        assert_eq!(snap_to_grid(13.0, 10.0), 10.0);
        assert_eq!(snap_to_grid(16.0, 10.0), 20.0);
    }

    #[test]
    fn preserves_values_when_grid_is_invalid() {
        assert_eq!(snap_to_grid(12.5, 0.0), 12.5);
    }

    #[test]
    fn clamps_zoom() {
        assert_eq!(clamp_scale(0.1), MIN_SCALE);
        assert_eq!(clamp_scale(6.0), MAX_SCALE);
        assert_eq!(clamp_scale(1.5), 1.5);
    }
}
