// Pure conversions between user-space axis values and the normalized,
// avar-mapped coordinates used by gvar, HVAR, ItemVariationStore regions and
// FeatureVariations conditions.
// https://learn.microsoft.com/en-us/typography/opentype/spec/otvaroverview#coordinate-scales-and-normalization
//
// Values are not quantized to F2DOT14 here; only the binary writers do that.

/**
 * Normalize a user-space axis value to -1..1 around the axis default.
 * @param {number} value user-space value
 * @param {{minValue: number, defaultValue: number, maxValue: number}} axis fvar axis
 * @returns {number}
 */
export function normalizeAxisValue(value, axis) {
    if (value === axis.defaultValue) return 0;
    if (value < axis.defaultValue) {
        const range = axis.defaultValue - axis.minValue;
        return range > 0 ? (value - axis.defaultValue) / range : 0;
    }
    const range = axis.maxValue - axis.defaultValue;
    return range > 0 ? (value - axis.defaultValue) / range : 0;
}

/**
 * Inverse of normalizeAxisValue.
 * @param {number} normalized -1..1
 * @param {{minValue: number, defaultValue: number, maxValue: number}} axis fvar axis
 * @returns {number}
 */
export function denormalizeAxisValue(normalized, axis) {
    return axis.defaultValue + normalized * (normalized < 0
        ? axis.defaultValue - axis.minValue
        : axis.maxValue - axis.defaultValue);
}

/**
 * Apply one axis's avar segment map (piecewise linear). Values beyond the
 * first or last map entry take that entry's mapped value.
 * @param {number} normalized
 * @param {Array<{fromCoordinate: number, toCoordinate: number}>} [axisValueMaps]
 * @returns {number}
 */
export function applyAvarMapping(normalized, axisValueMaps) {
    if (!axisValueMaps || axisValueMaps.length === 0) return normalized;
    for (let i = 0; i < axisValueMaps.length - 1; i++) {
        const current = axisValueMaps[i];
        const next = axisValueMaps[i + 1];
        if (normalized >= current.fromCoordinate && normalized <= next.fromCoordinate) {
            const range = next.fromCoordinate - current.fromCoordinate;
            if (Math.abs(range) < 0.0001) return current.toCoordinate;
            const t = (normalized - current.fromCoordinate) / range;
            return current.toCoordinate + t * (next.toCoordinate - current.toCoordinate);
        }
    }
    if (normalized <= axisValueMaps[0].fromCoordinate) return axisValueMaps[0].toCoordinate;
    if (normalized >= axisValueMaps[axisValueMaps.length - 1].fromCoordinate) return axisValueMaps[axisValueMaps.length - 1].toCoordinate;
    return normalized;
}

/**
 * Inverse of applyAvarMapping. A plateau (several inputs mapping to the same
 * value) has many inverses; `preferred` (default: the mapped value itself)
 * selects the closest input on that plateau.
 * @param {number} mapped
 * @param {Array<{fromCoordinate: number, toCoordinate: number}>} [axisValueMaps]
 * @param {number} [preferred]
 * @param {number} [tolerance]
 * @returns {number}
 */
export function invertAvarMapping(mapped, axisValueMaps, preferred = mapped, tolerance = 0) {
    if (!axisValueMaps || axisValueMaps.length === 0) return mapped;
    for (let i = 1; i < axisValueMaps.length; i++) {
        const a = axisValueMaps[i - 1];
        const b = axisValueMaps[i];
        if (a.toCoordinate === b.toCoordinate && Math.abs(a.toCoordinate - mapped) <= tolerance) {
            let end = i;
            while (end + 1 < axisValueMaps.length && axisValueMaps[end + 1].toCoordinate === a.toCoordinate) end++;
            return Math.max(a.fromCoordinate, Math.min(axisValueMaps[end].fromCoordinate, preferred));
        }
    }
    return applyAvarMapping(mapped, axisValueMaps.map(map => ({fromCoordinate: map.toCoordinate, toCoordinate: map.fromCoordinate})));
}

/**
 * Normalized, avar-mapped coordinates for user-space coordinates, in axis order.
 * Missing axes take their default.
 * @param {Record<string, number>} coords user-space values by axis tag
 * @param {Array<{tag: string, minValue: number, defaultValue: number, maxValue: number}>} axes fvar axes
 * @param {{axisSegmentMaps?: Array<{axisValueMaps: Array<{fromCoordinate: number, toCoordinate: number}>}>}|null} [avar]
 * @returns {number[]}
 */
export function normalizeCoordinates(coords, axes, avar = null) {
    return axes.map((axis, index) => applyAvarMapping(
        normalizeAxisValue(coords?.[axis.tag] ?? axis.defaultValue, axis),
        avar?.axisSegmentMaps?.[index]?.axisValueMaps,
    ));
}
