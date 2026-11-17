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
 * Scalar of one ItemVariationStore region at normalized coordinates (the
 * OpenType region scalar: product of the per-axis tent factors).
 * @param {{regionAxes: Array<{startCoord: number, peakCoord: number, endCoord: number}>}} region
 * @param {number[]} normalized
 * @returns {number}
 */
export function variationRegionScalar(region, normalized) {
    let scalar = 1;
    const regionAxes = region?.regionAxes || [];
    for (let i = 0; i < regionAxes.length; i++) {
        const {startCoord: start, peakCoord: peak, endCoord: end} = regionAxes[i];
        if (start > peak || peak > end || (start < 0 && end > 0) || peak === 0) continue;
        const value = normalized[i] || 0;
        if (value === peak) continue;
        if (value <= start || value >= end) return 0;
        scalar *= value < peak ? (value - start) / (peak - start) : (end - value) / (end - peak);
    }
    return scalar;
}

/**
 * Delta of one ItemVariationStore row at normalized coordinates.
 * @param {{variationRegions: Array<{regionAxes: Array<{startCoord: number, peakCoord: number, endCoord: number}>}>, itemVariationSubtables: Array<{regionIndexes: number[], deltaSets: number[][]}>}} store
 * @param {number} outerIndex
 * @param {number} innerIndex
 * @param {number[]} normalized
 * @returns {number}
 */
export function itemVariationDelta(store, outerIndex, innerIndex, normalized) {
    const subtable = store?.itemVariationSubtables?.[outerIndex];
    const deltas = subtable?.deltaSets?.[innerIndex];
    if (!deltas) return 0;
    let total = 0;
    for (let column = 0; column < subtable.regionIndexes.length; column++) {
        const delta = deltas[column];
        if (!delta) continue;
        total += delta * variationRegionScalar(store.variationRegions[subtable.regionIndexes[column]], normalized);
    }
    return total;
}

/**
 * Apply avar version 2's cross-axis mapping to segment-mapped coordinates. Every
 * axis's delta (F2DOT14 units in the avar ItemVariationStore) is evaluated at the
 * same input vector; results are clamped to -1..1. Coordinates without avar2 data
 * are returned unchanged.
 * https://learn.microsoft.com/en-us/typography/opentype/spec/avar#avar-version-2
 * @param {number[]} normalized segment-mapped coordinates, in axis order
 * @param {{itemVariationStore?: object, axisIndexMap?: {map?: Array<{outerIndex: number, innerIndex: number}>}}|null} [avar]
 * @returns {number[]}
 */
export function applyAvar2Mapping(normalized, avar) {
    const store = avar?.itemVariationStore;
    if (!store) return normalized;
    const map = avar.axisIndexMap?.map;
    return normalized.map((value, axisIndex) => {
        const entry = map?.length ? map[Math.min(axisIndex, map.length - 1)] : {outerIndex: 0, innerIndex: axisIndex};
        const delta = itemVariationDelta(store, entry.outerIndex, entry.innerIndex, normalized);
        if (!delta) return value;
        // Renderers add the delta in F2DOT14 units (HarfBuzz rounds it).
        return Math.max(-1, Math.min(1, value + Math.round(delta) / 16384));
    });
}

/**
 * Normalized, avar-mapped coordinates for user-space coordinates, in axis order.
 * Missing axes take their default. avar version 2 data, when present, is applied
 * after the segment maps.
 * @param {Record<string, number>} coords user-space values by axis tag
 * @param {Array<{tag: string, minValue: number, defaultValue: number, maxValue: number}>} axes fvar axes
 * @param {{axisSegmentMaps?: Array<{axisValueMaps: Array<{fromCoordinate: number, toCoordinate: number}>}>, itemVariationStore?: object, axisIndexMap?: object}|null} [avar]
 * @returns {number[]}
 */
export function normalizeCoordinates(coords, axes, avar = null) {
    const mapped = axes.map((axis, index) => applyAvarMapping(
        normalizeAxisValue(coords?.[axis.tag] ?? axis.defaultValue, axis),
        avar?.axisSegmentMaps?.[index]?.axisValueMaps,
    ));
    return avar?.itemVariationStore ? applyAvar2Mapping(mapped, avar) : mapped;
}
