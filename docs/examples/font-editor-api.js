/**
 * Font Editor API
 * A JavaScript API for creating and editing OpenType fonts.
 * This module provides the core logic separated from UI concerns.
 * 
 * @module font-editor-api
 */

// Import opentype.js - this will be available in the browser via the global `opentype`
// or via ES module import
let opentype;
if (typeof window !== 'undefined' && window.opentype) {
    opentype = window.opentype;
} else if (typeof globalThis !== 'undefined' && globalThis.opentype) {
    opentype = globalThis.opentype;
}

/**
 * @typedef {number[]} Point
 * A 2D point as [x, y] array
 */

/**
 * @typedef {Object} GlyphData
 * @property {Point[]} points - Array of [x, y] points defining the glyph outline
 */

/**
 * @typedef {Object} AxisDefinition
 * @property {string} tag - 4-character axis tag (e.g., 'wght', 'wdth')
 * @property {string} name - Human-readable axis name
 * @property {number} minValue - Minimum axis value
 * @property {number} defaultValue - Default axis value
 * @property {number} maxValue - Maximum axis value
 */

/**
 * @typedef {Object} MasterDefinition
 * @property {string} name - Master name (e.g., 'Light', 'Bold')
 * @property {Object<string, number>} coords - Axis coordinates {tag: value}
 * @property {Object<string, Point[]>} glyphs - Glyph data for this master
 * @property {Object<string, number>} glyphWidths - Explicit glyph widths for this master
 */

/**
 * @typedef {Object} InstanceDefinition
 * @property {string} name - Instance name (e.g., 'Regular', 'Bold')
 * @property {Object<string, number>} coords - Axis coordinates {tag: value}
 */

/**
 * @typedef {Object} FontEditorOptions
 * @property {string} [familyName='Custom Font'] - Font family name
 * @property {string} [styleName='Regular'] - Font style name
 * @property {number} [unitsPerEm=800] - Units per em
 * @property {number} [ascender=800] - Font ascender
 * @property {number} [descender=0] - Font descender
 */

/**
 * @typedef {Object} BoundingBox
 * @property {number} minX - Minimum X coordinate
 * @property {number} maxX - Maximum X coordinate
 * @property {number} minY - Minimum Y coordinate
 * @property {number} maxY - Maximum Y coordinate
 */

// ============================================================================
// Geometry Utilities
// ============================================================================

/**
 * Calculate extrema (min/max X values) for a cubic bezier curve.
 * Uses the derivative to find critical points where dx/dt = 0.
 *
 * @param {number} x0 - Start point X
 * @param {number} x1 - First control point X
 * @param {number} x2 - Second control point X
 * @param {number} x3 - End point X
 * @returns {number[]} Array of X values at extrema (including endpoints)
 */
export function getCubicBezierExtremaX(x0, x1, x2, x3) {
    const a = -3 * x0 + 9 * x1 - 9 * x2 + 3 * x3;
    const b = 6 * x0 - 12 * x1 + 6 * x2;
    const c = 3 * x1 - 3 * x0;

    const extrema = [x0, x3];

    if (Math.abs(a) < 1e-12) {
        if (Math.abs(b) >= 1e-12) {
            const t = -c / b;
            if (t > 0 && t < 1) {
                const val = Math.pow(1 - t, 3) * x0 + 3 * Math.pow(1 - t, 2) * t * x1 +
                           3 * (1 - t) * t * t * x2 + t * t * t * x3;
                extrema.push(val);
            }
        }
    } else {
        const discriminant = b * b - 4 * a * c;
        if (discriminant >= 0) {
            const sqrtD = Math.sqrt(discriminant);
            const t1 = (-b + sqrtD) / (2 * a);
            const t2 = (-b - sqrtD) / (2 * a);
            for (const t of [t1, t2]) {
                if (t > 0 && t < 1) {
                    const val = Math.pow(1 - t, 3) * x0 + 3 * Math.pow(1 - t, 2) * t * x1 +
                               3 * (1 - t) * t * t * x2 + t * t * t * x3;
                    extrema.push(val);
                }
            }
        }
    }
    return extrema;
}

/**
 * Calculate extrema (min/max X values) for a quadratic bezier curve.
 *
 * @param {number} x0 - Start point X
 * @param {number} x1 - Control point X
 * @param {number} x2 - End point X
 * @returns {number[]} Array of X values at extrema (including endpoints)
 */
export function getQuadBezierExtremaX(x0, x1, x2) {
    const extrema = [x0, x2];
    const denom = x0 - 2 * x1 + x2;
    if (Math.abs(denom) >= 1e-12) {
        const t = (x0 - x1) / denom;
        if (t > 0 && t < 1) {
            const val = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * x1 + t * t * x2;
            extrema.push(val);
        }
    }
    return extrema;
}

/**
 * Compute the bounding box of a path, correctly handling bezier curves.
 *
 * @param {Object} path - OpenType.js path object with commands array
 * @returns {BoundingBox} The computed bounding box
 */
export function getPathBounds(path) {
    if (!path || !path.commands || path.commands.length === 0) {
        return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    }

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let curX = 0, curY = 0;

    for (const cmd of path.commands) {
        let xValues = [];
        let yValues = [];

        switch (cmd.type) {
            case 'M':
            case 'L':
                xValues = [cmd.x];
                yValues = [cmd.y];
                curX = cmd.x;
                curY = cmd.y;
                break;
            case 'Q':
                xValues = getQuadBezierExtremaX(curX, cmd.x1, cmd.x);
                yValues = getQuadBezierExtremaX(curY, cmd.y1, cmd.y);
                curX = cmd.x;
                curY = cmd.y;
                break;
            case 'C':
                xValues = getCubicBezierExtremaX(curX, cmd.x1, cmd.x2, cmd.x);
                yValues = getCubicBezierExtremaX(curY, cmd.y1, cmd.y2, cmd.y);
                curX = cmd.x;
                curY = cmd.y;
                break;
            case 'Z':
                break;
        }

        for (const x of xValues) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
        }
        for (const y of yValues) {
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
    }

    return {
        minX: minX === Infinity ? 0 : minX,
        maxX: maxX === -Infinity ? 0 : maxX,
        minY: minY === Infinity ? 0 : minY,
        maxY: maxY === -Infinity ? 0 : maxY
    };
}

/**
 * Extract simplified polygon points from a path (for display purposes).
 * Note: This flattens curves to their endpoints, losing curve information.
 *
 * @param {Object} path - OpenType.js path object
 * @param {number} unitsPerEm - The font's unitsPerEm value
 * @param {number} [editorScale=10] - Target editor coordinate max (glyphs are designed in 0-editorScale space)
 * @returns {Point[]} Array of [x, y] points
 */
export function extractPathPoints(path, unitsPerEm, editorScale = 10) {
    const points = [];
    // Convert from font units back to editor coordinates
    const scale = editorScale / unitsPerEm;

    for (const cmd of path.commands) {
        if (cmd.type === 'M' || cmd.type === 'L') {
            points.push([
                Math.round(cmd.x * scale * 10) / 10,
                Math.round(cmd.y * scale * 10) / 10
            ]);
        }
    }

    return points;
}

/**
 * Apply avar mapping to a normalized coordinate.
 * The avar table defines piecewise linear mappings from user coordinates to internal coordinates.
 * 
 * @param {number} normalized - Normalized coordinate (-1 to 1)
 * @param {Object[]} segmentMaps - Array of {fromCoordinate, toCoordinate} pairs
 * @returns {number} Mapped coordinate
 */
export function applyAvarMapping(normalized, segmentMaps) {
    if (!segmentMaps || segmentMaps.length === 0) {
        return normalized; // No mapping, return identity
    }
    
    // Find the segment containing the normalized value
    for (let i = 0; i < segmentMaps.length - 1; i++) {
        const current = segmentMaps[i];
        const next = segmentMaps[i + 1];
        
        if (normalized >= current.fromCoordinate && normalized <= next.fromCoordinate) {
            // Interpolate between the two points
            const range = next.fromCoordinate - current.fromCoordinate;
            if (Math.abs(range) < 0.0001) {
                return current.toCoordinate;
            }
            const t = (normalized - current.fromCoordinate) / range;
            return current.toCoordinate + t * (next.toCoordinate - current.toCoordinate);
        }
    }
    
    // Handle values outside the segment map range
    if (normalized <= segmentMaps[0].fromCoordinate) {
        return segmentMaps[0].toCoordinate;
    }
    if (normalized >= segmentMaps[segmentMaps.length - 1].fromCoordinate) {
        return segmentMaps[segmentMaps.length - 1].toCoordinate;
    }
    
    return normalized;
}

/**
 * Normalize a user coordinate to the -1 to 1 range based on axis definition.
 * 
 * @param {number} userValue - User-space axis value
 * @param {Object} axis - Axis definition with minValue, defaultValue, maxValue
 * @returns {number} Normalized coordinate (-1 to 1)
 */
export function normalizeAxisValue(userValue, axis) {
    if (userValue === axis.defaultValue) {
        return 0;
    } else if (userValue < axis.defaultValue) {
        const range = axis.defaultValue - axis.minValue;
        return range > 0 ? (userValue - axis.defaultValue) / range : 0;
    } else {
        const range = axis.maxValue - axis.defaultValue;
        return range > 0 ? (userValue - axis.defaultValue) / range : 0;
    }
}

/**
 * Apply avar table to normalize coordinates for all axes.
 * 
 * @param {Object} coords - User-space coordinates {tag: value}
 * @param {Object[]} axes - Axis definitions
 * @param {Object} avarTable - avar table with axisSegmentMaps
 * @returns {Object} Mapped normalized coordinates {tag: normalizedValue}
 */
export function applyAvarToCoords(coords, axes, avarTable) {
    const result = {};
    
    for (let axisIndex = 0; axisIndex < axes.length; axisIndex++) {
        const axis = axes[axisIndex];
        const userValue = coords[axis.tag] ?? axis.defaultValue;
        
        // First, normalize to -1 to 1 range
        let normalized = normalizeAxisValue(userValue, axis);
        
        // Then apply avar mapping if present
        if (avarTable && avarTable.axisSegmentMaps && avarTable.axisSegmentMaps[axisIndex]) {
            const segmentMaps = avarTable.axisSegmentMaps[axisIndex].axisValueMaps;
            normalized = applyAvarMapping(normalized, segmentMaps);
        }
        
        result[axis.tag] = normalized;
    }
    
    return result;
}

// ============================================================================
// Font Editor State
// ============================================================================

export class FontEditorState {
    constructor(options = {}) {
        this.familyName = options.familyName || 'Custom Font';
        this.styleName = options.styleName || 'Regular';
        this.unitsPerEm = options.unitsPerEm || 800;
        this.ascender = options.ascender || 800;
        this.descender = options.descender || 0;
        this.glyphs = {};
        this.glyphWidths = {};
        // Components are just glyphs with names starting with underscore (e.g. '_stem')
        // They are stored in this.glyphs but not exported as regular unicode glyphs
        // Reference layers: glyphs can reference any other glyph with transforms
        // { 'A': [{name: 'B', dx, dy, scaleX, scaleY, rotation, skewX, skewY}, ...] }
        this.glyphReferences = {};
        this.currentGlyph = null;
        this.selectedPoint = -1;
        this.vfEnabled = false;
        this.axes = [];
        this.masters = [];
        this.instances = [];
        this.currentMaster = 0;
        this.previewCoords = {};
        // avar table for non-linear axis mapping: {axisSegmentMaps: [[{fromCoordinate, toCoordinate}...]...]}
        // Each axis has an array of segment maps defining the piecewise linear mapping
        this.avarTable = null;
        // Kerning pairs: { 'AV': -50, 'To': -30, ... } in font units
        this.kerning = {};
        // Ligatures: [{sequence: 'fi', result: 'fi_lig', enabled: true}, ...]
        this.ligatures = [];
        // OpenType features toggles
        this.features = {
            liga: true,
            kern: true,
            dlig: false,
            smcp: false
        };
    }

    addGlyph(char, points = [], width = undefined) {
        this.glyphs[char] = points;
        if (width !== undefined) {
            this.glyphWidths[char] = width;
        }
    }

    getGlyphPoints(char) {
        return this.glyphs[char] || [];
    }

    getGlyphWidth(char) {
        const widths = this.vfEnabled && this.masters.length > 0
            ? this.masters[this.currentMaster].glyphWidths
            : this.glyphWidths;

        if (widths && widths[char] !== undefined) {
            return widths[char];
        }

        const points = this.getGlyphPoints(char);
        if (!points || points.length === 0) return 5;
        const xCoords = points.map(p => p[0]);
        const minX = Math.min(...xCoords);
        const maxX = Math.max(...xCoords);
        return minX >= 0 ? maxX : maxX - minX;
    }

    setGlyphWidth(char, width) {
        if (this.vfEnabled && this.masters.length > 0) {
            const master = this.masters[this.currentMaster];
            if (!master.glyphWidths) master.glyphWidths = {};
            master.glyphWidths[char] = width;
        } else {
            this.glyphWidths[char] = width;
        }
    }

    deleteGlyph(char) {
        if (this.glyphs[char]) {
            delete this.glyphs[char];
            delete this.glyphWidths[char];
            return true;
        }
        return false;
    }

    addPoint(x, y) {
        if (!this.currentGlyph) return -1;
        if (!this.glyphs[this.currentGlyph]) {
            this.glyphs[this.currentGlyph] = [];
        }
        this.glyphs[this.currentGlyph].push([x, y]);
        return this.glyphs[this.currentGlyph].length - 1;
    }

    updatePoint(index, x, y) {
        if (!this.currentGlyph || !this.glyphs[this.currentGlyph]) return false;
        const points = this.glyphs[this.currentGlyph];
        if (index < 0 || index >= points.length) return false;
        points[index] = [x, y];
        return true;
    }

    deletePoint(index) {
        if (!this.currentGlyph || !this.glyphs[this.currentGlyph]) return false;
        const points = this.glyphs[this.currentGlyph];
        if (index < 0 || index >= points.length) return false;
        points.splice(index, 1);
        return true;
    }

    setVariableFontEnabled(enabled) {
        this.vfEnabled = enabled;
        if (enabled && this.masters.length === 0) {
            this.addMaster('Default', this.getDefaultCoords(), { ...this.glyphs }, { ...this.glyphWidths });
        }
    }

    getDefaultCoords() {
        const coords = {};
        for (const axis of this.axes) {
            coords[axis.tag] = axis.defaultValue;
        }
        return coords;
    }

    addAxis(axis) {
        this.axes.push(axis);
        this.previewCoords[axis.tag] = axis.defaultValue;
    }

    removeAxis(index) {
        if (index < 0 || index >= this.axes.length) return false;
        const axis = this.axes[index];
        this.axes.splice(index, 1);
        delete this.previewCoords[axis.tag];
        for (const master of this.masters) {
            delete master.coords[axis.tag];
        }
        for (const instance of this.instances) {
            delete instance.coords[axis.tag];
        }
        return true;
    }

    /**
     * Add a master to the variable font.
     * 
     * Masters can be placed at any axis position, not just extremes:
     * - Extreme masters (at axis min/max) define the overall variation range
     * - Intermediate masters (between default and extremes) allow per-glyph corrections
     *   that deviate from linear interpolation (like FontLab "font-less masters" or Glyphs "brace layers")
     * 
     * Sparse masters are supported - you can include only the glyphs that need correction
     * at an intermediate position. Other glyphs will interpolate linearly as normal.
     * 
     * @param {string} name - Display name for the master (e.g., 'Light', 'Bold', 'Medium')
     * @param {Object} coords - Axis coordinates for this master (e.g., {wght: 500})
     * @param {Object|null} glyphs - Glyph shapes for this master. If null, copies from current state.
     *                               For sparse intermediate masters, include only the glyphs that need correction.
     * @param {Object|null} glyphWidths - Glyph widths for this master. If null, copies from current state.
     * 
     * @example
     * // Add extreme masters (at axis min and max)
     * state.addMaster('Light', { wght: 100 }, lightGlyphs, lightWidths);
     * state.addMaster('Bold', { wght: 900 }, boldGlyphs, boldWidths);
     * 
     * // Add a sparse intermediate master that only corrects glyph 'e' at wght=500
     * // (to fix kinking or volume loss from linear interpolation)
     * state.addMaster('Medium-e', { wght: 500 }, { 'e': correctedE }, { 'e': correctedWidth });
     */
    addMaster(name, coords, glyphs = null, glyphWidths = null) {
        this.masters.push({
            name,
            coords: { ...coords },
            glyphs: glyphs ? { ...glyphs } : { ...this.glyphs },
            glyphWidths: glyphWidths ? { ...glyphWidths } : { ...this.glyphWidths }
        });
    }

    removeMaster(index) {
        if (index < 0 || index >= this.masters.length) return false;
        this.masters.splice(index, 1);
        if (this.currentMaster >= this.masters.length) {
            this.currentMaster = Math.max(0, this.masters.length - 1);
        }
        return true;
    }

    addInstance(name, coords) {
        this.instances.push({ name, coords: { ...coords } });
    }

    removeInstance(index) {
        if (index < 0 || index >= this.instances.length) return false;
        this.instances.splice(index, 1);
        return true;
    }

    toJSON() {
        return {
            familyName: this.familyName,
            styleName: this.styleName,
            unitsPerEm: this.unitsPerEm,
            ascender: this.ascender,
            descender: this.descender,
            glyphs: this.glyphs,
            glyphWidths: this.glyphWidths,
            vfEnabled: this.vfEnabled,
            axes: this.axes,
            masters: this.masters,
            instances: this.instances,
            avarTable: this.avarTable
        };
    }

    fromJSON(json) {
        this.familyName = json.familyName || 'Custom Font';
        this.styleName = json.styleName || 'Regular';
        this.unitsPerEm = json.unitsPerEm || 800;
        this.ascender = json.ascender || 800;
        this.descender = json.descender || 0;
        this.glyphs = json.glyphs || {};
        this.glyphWidths = json.glyphWidths || {};
        this.vfEnabled = json.vfEnabled || false;
        this.axes = json.axes || [];
        this.masters = json.masters || [];
        this.instances = json.instances || [];
        this.avarTable = json.avarTable || null;
        this.currentGlyph = Object.keys(this.glyphs)[0] || null;
        this.previewCoords = {};
        for (const axis of this.axes) {
            this.previewCoords[axis.tag] = axis.defaultValue;
        }
    }
}

// ============================================================================
// Font Builder
// ============================================================================

export class FontBuilder {
    constructor(state, opentypeModule = null) {
        this.state = state;
        this.opentype = opentypeModule || opentype;
        if (!this.opentype) {
            throw new Error('opentype.js module is required');
        }
    }

    /**
     * Convert a character/glyph key to a consistent glyph name.
     * - Single characters (e.g., 'A', 'O') use the character as the name
     * - Component glyphs starting with underscore (e.g., '_stem', '_O_shape') use their full name
     * - Multi-character strings that aren't components use 'glyph' + charcode
     */
    _charToGlyphName(char) {
        if (char.length === 1) {
            return char;
        }
        if (char.startsWith('_')) {
            return char; // Component names are used as-is
        }
        return 'glyph' + char.charCodeAt(0);
    }

    /**
     * Transform a point by reference transform (dx, dy, scaleX, scaleY, rotation, skewX, skewY)
     * Matches the UI transformation logic
     */
    _transformPoint(x, y, ref) {
        // Apply transforms in order: scale -> skew -> rotate -> translate
        let px = x * (ref.scaleX || 1);
        let py = y * (ref.scaleY || 1);
        
        // Skew
        if (ref.skewX) {
            px += py * Math.tan((ref.skewX || 0) * Math.PI / 180);
        }
        if (ref.skewY) {
            py += px * Math.tan((ref.skewY || 0) * Math.PI / 180);
        }
        
        // Rotate
        if (ref.rotation) {
            const angle = (ref.rotation || 0) * Math.PI / 180;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            const rx = px * cos - py * sin;
            const ry = px * sin + py * cos;
            px = rx;
            py = ry;
        }
        
        // Translate
        px += ref.dx || 0;
        py += ref.dy || 0;
        
        return [px, py];
    }

    /**
     * Compute the 2x2 transformation matrix for a reference transform
     * Returns { a, b, c, d } where the matrix is [[a, b], [c, d]]
     * This matches the transform order: scale -> skew -> rotate
     */
    _computeTransformMatrix(ref) {
        const scaleX = ref.scaleX !== undefined ? ref.scaleX : 1;
        const scaleY = ref.scaleY !== undefined ? ref.scaleY : 1;
        const rotation = (ref.rotation || 0) * Math.PI / 180;
        const skewX = (ref.skewX || 0) * Math.PI / 180;
        const skewY = (ref.skewY || 0) * Math.PI / 180;
        
        const cos = Math.cos(rotation);
        const sin = Math.sin(rotation);
        const tanKx = Math.tan(skewX);
        const tanKy = Math.tan(skewY);
        
        // Compute matrix by tracking what happens to basis vectors
        // For (1,0): scale -> (sx, 0), skewX -> (sx, 0), skewY -> (sx, sx*tanKy), rotate
        // For (0,1): scale -> (0, sy), skewX -> (sy*tanKx, sy), skewY -> (sy*tanKx, sy + sy*tanKx*tanKy), rotate
        
        // Column 1: transform of (1, 0)
        // After scale: (sx, 0)
        // After skewX: (sx, 0) (y=0, no change)
        // After skewY: (sx, sx*tanKy)
        // After rotate: (sx*cos - sx*tanKy*sin, sx*sin + sx*tanKy*cos)
        const a = scaleX * (cos - tanKy * sin);
        const c = scaleX * (sin + tanKy * cos);
        
        // Column 2: transform of (0, 1)
        // After scale: (0, sy)
        // After skewX: (sy*tanKx, sy)
        // After skewY: (sy*tanKx, sy + sy*tanKx*tanKy)
        // After rotate: (sy*tanKx*cos - (sy + sy*tanKx*tanKy)*sin, sy*tanKx*sin + (sy + sy*tanKx*tanKy)*cos)
        const b = scaleY * (tanKx * cos - (1 + tanKx * tanKy) * sin);
        const d = scaleY * (tanKx * sin + (1 + tanKx * tanKy) * cos);
        
        return { a, b, c, d };
    }

    /**
     * Get shapes for a referenced glyph, normalizing to nested format
     * (components and glyphs are now the same - both stored in glyphs)
     */
    _getComponentShapes(glyphName) {
        const state = this.state;
        // Look in glyphs - components are just glyphs with underscore prefix
        if (!state.glyphs || !state.glyphs[glyphName]) return [];
        
        const data = state.glyphs[glyphName];
        if (!data || data.length === 0) return [];
        
        // Check if already nested
        if (data[0] && Array.isArray(data[0]) && Array.isArray(data[0][0])) {
            return data;
        }
        return [data];
    }

    /**
     * Get transformed shapes from a reference layer
     */
    _getTransformedReferenceShapes(ref) {
        const sourceShapes = this._getComponentShapes(ref.name);
        if (!sourceShapes || sourceShapes.length === 0) return [];
        
        return sourceShapes.map(shape => 
            shape.map(point => this._transformPoint(point[0], point[1], ref))
        );
    }

    /**
     * Get all shapes for a glyph including reference layers (flattened/baked)
     * Components are transformed and merged into the glyph's shapes
     */
    _getGlyphShapesWithReferences(char, pointsOrShapes) {
        const state = this.state;
        const allShapes = [];
        
        // First add the glyph's own shapes
        if (pointsOrShapes && pointsOrShapes.length > 0) {
            const isNested = Array.isArray(pointsOrShapes[0]) && 
                             Array.isArray(pointsOrShapes[0][0]);
            if (isNested) {
                for (const shape of pointsOrShapes) {
                    if (shape && shape.length > 0) {
                        allShapes.push(shape);
                    }
                }
            } else if (pointsOrShapes.length > 0) {
                allShapes.push(pointsOrShapes);
            }
        }
        
        // Then add any reference layers (transformed component shapes)
        if (state.glyphReferences && state.glyphReferences[char]) {
            for (const ref of state.glyphReferences[char]) {
                const transformedShapes = this._getTransformedReferenceShapes(ref);
                for (const shape of transformedShapes) {
                    if (shape && shape.length > 0) {
                        allShapes.push(shape);
                    }
                }
            }
        }
        
        return allShapes;
    }

    /**
     * Normalize shapes to always be in nested format [[shape1], [shape2], ...]
     */
    _normalizeShapes(pointsOrShapes) {
        if (!pointsOrShapes || pointsOrShapes.length === 0) return [];
        
        const isNested = Array.isArray(pointsOrShapes[0]) && 
                         Array.isArray(pointsOrShapes[0][0]);
        if (isNested) {
            return pointsOrShapes.filter(s => s && s.length > 0);
        } else if (pointsOrShapes.length > 0) {
            return [pointsOrShapes];
        }
        return [];
    }

    /**
     * Check if the glyph has its own shapes (not just references)
     */
    _hasOwnShapes(pointsOrShapes) {
        if (!pointsOrShapes || pointsOrShapes.length === 0) return false;
        
        const isNested = Array.isArray(pointsOrShapes[0]) && 
                         Array.isArray(pointsOrShapes[0][0]);
        if (isNested) {
            return pointsOrShapes.some(s => s && s.length > 0);
        }
        return pointsOrShapes.length > 0;
    }

    /**
     * Calculate bounding box for a composite glyph from its references
     * @param {Array} refs - Array of reference objects
     * @param {number} scale - Scale factor
     * @param {Map} syntheticShapeComponents - Map of char -> synthetic component name (optional)
     * @param {Object} baseGlyphs - Base glyphs object for looking up synthetic component shapes (optional)
     */
    _calculateCompositeBounds(refs, scale, syntheticShapeComponents = null, baseGlyphs = null) {
        let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
        
        for (const ref of refs) {
            let sourceShapes;
            
            // Check if this is a synthetic shape component
            if (syntheticShapeComponents && baseGlyphs && 
                ref.name.endsWith('_shape') && ref.name.startsWith('_')) {
                const originalChar = ref.name.slice(1, -6); // Remove leading _ and trailing _shape
                if (syntheticShapeComponents.has(originalChar)) {
                    // Get shapes from the original glyph
                    sourceShapes = this._normalizeShapes(baseGlyphs[originalChar]);
                } else {
                    sourceShapes = this._getComponentShapes(ref.name);
                }
            } else {
                sourceShapes = this._getComponentShapes(ref.name);
            }
            
            if (!sourceShapes || sourceShapes.length === 0) continue;
            
            // Transform each point and track bounds
            for (const shape of sourceShapes) {
                for (const point of shape) {
                    const transformed = this._transformPoint(point[0], point[1], ref);
                    const x = Math.round(transformed[0] * scale);
                    const y = Math.round(transformed[1] * scale);
                    xMin = Math.min(xMin, x);
                    yMin = Math.min(yMin, y);
                    xMax = Math.max(xMax, x);
                    yMax = Math.max(yMax, y);
                }
            }
        }
        
        if (!isFinite(xMin)) {
            xMin = yMin = xMax = yMax = 0;
        }
        
        return { xMin, yMin, xMax, yMax };
    }

    build(options = {}) {
        // The editor uses a coordinate space of roughly 0-10.
        // We scale this to match unitsPerEm (default 800).
        // scale = unitsPerEm / editorMax, where editorMax ≈ 10
        const editorScale = options.editorScale || 10; // editor coordinate max
        const validate = options.validate !== false;
        const validateRoundTrip = options.validateRoundTrip !== false;
        const useComposites = options.useComposites !== false; // Default: true for TTF composites
        const ot = this.opentype;
        const state = this.state;
        
        // Calculate scale: editor coords -> font units
        const scale = state.unitsPerEm / editorScale;

        const otGlyphs = [];
        const glyphIndexMap = new Map();
        const componentGlyphIndexMap = new Map(); // Maps component names to glyph indices

        // Create .notdef glyph with a visible rectangle (required by font validators)
        const notdefPath = new ot.Path();
        const notdefWidth = Math.round(5 * scale);
        const notdefHeight = Math.round(7 * scale);
        // Draw a rectangle for .notdef
        notdefPath.moveTo(Math.round(0.5 * scale), 0);
        notdefPath.lineTo(Math.round(4.5 * scale), 0);
        notdefPath.lineTo(Math.round(4.5 * scale), notdefHeight);
        notdefPath.lineTo(Math.round(0.5 * scale), notdefHeight);
        notdefPath.closePath();
        // Draw inner rectangle (hollow)
        notdefPath.moveTo(Math.round(1 * scale), Math.round(0.5 * scale));
        notdefPath.lineTo(Math.round(1 * scale), Math.round(6.5 * scale));
        notdefPath.lineTo(Math.round(4 * scale), Math.round(6.5 * scale));
        notdefPath.lineTo(Math.round(4 * scale), Math.round(0.5 * scale));
        notdefPath.closePath();
        
        otGlyphs.push(new ot.Glyph({ name: '.notdef', unicode: 0, path: notdefPath, advanceWidth: notdefWidth }));
        glyphIndexMap.set('.notdef', 0);
        otGlyphs.push(new ot.Glyph({ name: 'space', unicode: 32, path: new ot.Path(), advanceWidth: Math.round(5 * scale) }));
        glyphIndexMap.set('space', 1);
        otGlyphs.push(new ot.Glyph({ name: 'uni00A0', unicode: 0x00A0, path: new ot.Path(), advanceWidth: Math.round(5 * scale) }));
        glyphIndexMap.set('uni00A0', 2);

        let glyphIndex = 3;

        // Determine base glyphs and widths (from first master for VF, or state.glyphs for static)
        const baseGlyphs = state.vfEnabled && state.masters.length > 0 ? state.masters[0].glyphs : state.glyphs;
        const baseWidths = state.vfEnabled && state.masters.length > 0 && state.masters[0].glyphWidths
            ? state.masters[0].glyphWidths
            : state.glyphWidths;

        // Step 1: Create component glyphs (underscore-prefixed, no unicode) if we're using composites
        // Components are now just glyphs with names starting with underscore
        
        // Track synthetic shape components created for glyphs that have both shapes AND references
        const syntheticShapeComponents = new Map(); // Maps char -> synthetic component name
        
        if (useComposites) {
            // Find all glyphs that are referenced and start with underscore (components)
            const referencedGlyphs = new Set();
            if (state.glyphReferences) {
                for (const refs of Object.values(state.glyphReferences)) {
                    for (const ref of refs) {
                        referencedGlyphs.add(ref.name);
                    }
                }
            }
            
            // Detect glyphs that have BOTH own shapes AND references
            // For these, we need to create a synthetic component for their shapes
            // because TrueType glyphs can be EITHER simple OR composite, not both
            for (const [char, pointsOrShapes] of Object.entries(baseGlyphs)) {
                if (char.startsWith('_')) continue; // Skip existing components
                
                const refs = state.glyphReferences ? state.glyphReferences[char] : null;
                const hasReferences = refs && refs.length > 0;
                const hasOwnShapes = this._hasOwnShapes(pointsOrShapes);
                
                // If glyph has both shapes and references, we need a synthetic component
                if (hasReferences && hasOwnShapes) {
                    const syntheticName = `_${char}_shape`;
                    syntheticShapeComponents.set(char, syntheticName);
                    referencedGlyphs.add(syntheticName);
                }
            }
            
            // Create glyphs for referenced items (both underscore components and regular glyphs used as references)
            for (const refName of referencedGlyphs) {
                // Check if this is a synthetic shape component
                let compShapes;
                let compWidth;
                
                if (refName.endsWith('_shape') && refName.startsWith('_')) {
                    // This might be a synthetic component - find the original glyph
                    const originalChar = refName.slice(1, -6); // Remove leading _ and trailing _shape
                    if (syntheticShapeComponents.has(originalChar)) {
                        // This is a synthetic component - use the original glyph's shapes
                        compShapes = baseGlyphs[originalChar];
                        compWidth = baseWidths && baseWidths[originalChar] !== undefined 
                            ? baseWidths[originalChar] 
                            : (state.glyphWidths[originalChar] || 8);
                    } else if (!state.glyphs[refName]) {
                        continue; // Not a synthetic and doesn't exist
                    } else {
                        compShapes = state.glyphs[refName];
                        compWidth = state.glyphWidths[refName] || 8;
                    }
                } else {
                    if (!state.glyphs[refName]) continue;
                    compShapes = state.glyphs[refName];
                    compWidth = state.glyphWidths[refName] || 8;
                }
                
                const path = new ot.Path();
                
                // Draw all shapes in the component
                const shapes = this._normalizeShapes(compShapes);
                for (const shape of shapes) {
                    if (shape && shape.length > 0) {
                        path.moveTo(Math.round(shape[0][0] * scale), Math.round(shape[0][1] * scale));
                        for (let i = 1; i < shape.length; i++) {
                            path.lineTo(Math.round(shape[i][0] * scale), Math.round(shape[i][1] * scale));
                        }
                        path.closePath();
                    }
                }
                
                // Component glyphs have no unicode (not directly accessible)
                const compGlyph = new ot.Glyph({
                    name: refName,
                    path,
                    advanceWidth: Math.round(compWidth * scale)
                });
                
                otGlyphs.push(compGlyph);
                componentGlyphIndexMap.set(refName, glyphIndex);
                glyphIndexMap.set(refName, glyphIndex++);
            }
        }

        // Step 2: Create character glyphs (skip underscore-prefixed components)
        for (const [char, pointsOrShapes] of Object.entries(baseGlyphs)) {
            // Skip component glyphs (underscore-prefixed) - they're handled in Step 1
            if (char.startsWith('_')) continue;
            // Skip glyphs already created as referenced components
            if (componentGlyphIndexMap.has(char)) continue;
            
            const glyphName = this._charToGlyphName(char);
            const width = this._getGlyphWidth(pointsOrShapes, char, baseWidths, baseGlyphs);
            const refs = state.glyphReferences ? state.glyphReferences[char] : null;
            const hasReferences = refs && refs.length > 0;
            
            // Check if this glyph has a synthetic shape component (has both shapes AND references)
            const hasSyntheticComponent = syntheticShapeComponents.has(char);
            
            // Check if we can use composites (all referenced components exist)
            // If we have a synthetic component, we can always use composites
            const canUseComposites = useComposites && hasReferences && 
                refs.every(ref => componentGlyphIndexMap.has(ref.name));
            
            if (canUseComposites && (!this._hasOwnShapes(pointsOrShapes) || hasSyntheticComponent)) {
                // Create a composite glyph (no path, uses components)
                // Build component list - if we have a synthetic shape component, add it first
                let allRefs = refs;
                if (hasSyntheticComponent) {
                    const syntheticName = syntheticShapeComponents.get(char);
                    // Prepend synthetic component with no offset/scale
                    allRefs = [
                        { name: syntheticName, dx: 0, dy: 0, scaleX: 1, scaleY: 1 },
                        ...refs
                    ];
                }
                
                const components = allRefs.map(ref => {
                    const compIdx = componentGlyphIndexMap.get(ref.name);
                    // Compute the full 2x2 transformation matrix from scale, rotation, skew
                    // Matrix format: [[a, b], [c, d]] where:
                    //   x' = a*x + b*y + dx
                    //   y' = c*x + d*y + dy
                    // TrueType uses: xScale=a, yScale=d, scale01=c (for y from x), scale10=b (for x from y)
                    const matrix = this._computeTransformMatrix(ref);
                    return {
                        glyphIndex: compIdx,
                        dx: Math.round((ref.dx || 0) * scale),
                        dy: Math.round((ref.dy || 0) * scale),
                        xScale: matrix.a,
                        yScale: matrix.d,
                        scale01: matrix.c,  // Coefficient for x in Y equation
                        scale10: matrix.b   // Coefficient for y in X equation
                    };
                });
                
                // Calculate composite bounding box for glyf table header
                // Pass syntheticShapeComponents so it can resolve synthetic component names
                const bbox = this._calculateCompositeBounds(allRefs, scale, syntheticShapeComponents, baseGlyphs);
                
                const compositeGlyph = new ot.Glyph({
                    name: glyphName,
                    unicode: char.charCodeAt(0),
                    path: new ot.Path(), // Empty path - composite uses components
                    advanceWidth: Math.round((width + 1) * scale)
                });
                
                // Set composite glyph properties
                compositeGlyph.isComposite = true;
                compositeGlyph.components = components;
                compositeGlyph._xMin = bbox.xMin;
                compositeGlyph._yMin = bbox.yMin;
                compositeGlyph._xMax = bbox.xMax;
                compositeGlyph._yMax = bbox.yMax;
                
                otGlyphs.push(compositeGlyph);
            } else {
                // Create a simple glyph with baked paths
                const path = new ot.Path();
                
                // Get all shapes including reference layers (baked/flattened)
                const allShapes = this._getGlyphShapesWithReferences(char, pointsOrShapes);
                
                // Draw all shapes as contours
                for (const shape of allShapes) {
                    if (shape && shape.length > 0) {
                        path.moveTo(Math.round(shape[0][0] * scale), Math.round(shape[0][1] * scale));
                        for (let i = 1; i < shape.length; i++) {
                            path.lineTo(Math.round(shape[i][0] * scale), Math.round(shape[i][1] * scale));
                        }
                        path.closePath();
                    }
                }
                
                otGlyphs.push(new ot.Glyph({
                    name: glyphName,
                    unicode: char.charCodeAt(0),
                    path,
                    advanceWidth: Math.round((width + 1) * scale)
                }));
            }
            glyphIndexMap.set(glyphName, glyphIndex++);
        }

        const font = new ot.Font({
            familyName: state.familyName,
            styleName: state.vfEnabled ? 'Variable' : state.styleName,
            unitsPerEm: state.unitsPerEm,
            ascender: state.ascender,
            descender: state.descender,
            glyphs: otGlyphs
        });
        
        // IMPORTANT: Set outlinesFormat to 'truetype' for TrueType outlines (glyf+loca)
        // This is required for composite glyphs and variable fonts
        font.outlinesFormat = 'truetype';
        
        // Set consistent version (head fontRevision defaults to 1.0, so name table should match)
        // nameID 5 is the version string
        if (!font.names.windows) font.names.windows = {};
        if (!font.names.windows.version) font.names.windows.version = {};
        font.names.windows.version.en = 'Version 1.000';
        
        // Remove Mac-specific names to avoid unwanted Mac name table entries
        // We only keep Windows names which are sufficient for modern usage
        delete font.names.macintosh;

        if (state.vfEnabled && state.axes.length > 0 && state.masters.length > 0) {
            this._addVariationData(font, glyphIndexMap, scale, syntheticShapeComponents);
        }

        // Add kerning table if there are kerning pairs defined
        if (state.kerning && Object.keys(state.kerning).length > 0 && state.features?.kern !== false) {
            this._addKerningTable(font, glyphIndexMap, scale);
        }

        if (validate) {
            this._validateGlyphPaths(font);
            if (validateRoundTrip) {
                this._validateRoundTrip(font);
            }
        }

        return font;
    }

    toArrayBuffer(options = {}) {
        const font = this.build(options);
        return font.toArrayBuffer();
    }

    toBlob(options = {}) {
        const buffer = this.toArrayBuffer(options);
        return new Blob([buffer], { type: 'font/otf' });
    }

    /**
     * Get auto-calculated width for a glyph including reference shapes
     * @param {string} char - The character/glyph name
     * @param {Object} baseGlyphs - The glyphs object to use for lookup
     * @returns {number} The calculated width
     */
    _getAutoWidth(char, baseGlyphs) {
        const pointsOrShapes = baseGlyphs[char];
        const allShapes = this._getGlyphShapesWithReferences(char, pointsOrShapes);
        
        if (!allShapes || allShapes.length === 0) return 5;
        
        const allPoints = allShapes.flat();
        if (!allPoints || allPoints.length === 0) return 5;
        
        const xCoords = allPoints.map(p => p[0]);
        const minX = Math.min(...xCoords);
        const maxX = Math.max(...xCoords);
        return minX >= 0 ? maxX : maxX - minX;
    }

    /**
     * Get glyph width - uses explicit override if available, otherwise calculates from shapes including references
     */
    _getGlyphWidth(pointsOrShapes, char, widthsObj, baseGlyphs = null) {
        // First check for explicit width override
        if (widthsObj && widthsObj[char] !== undefined) {
            return widthsObj[char];
        }
        
        // No override - use auto-calculated width including references
        if (baseGlyphs && char) {
            return this._getAutoWidth(char, baseGlyphs);
        }
        
        // Fallback to simple calculation from provided shapes (for compatibility)
        if (!pointsOrShapes || pointsOrShapes.length === 0) return 5;
        
        // Detect if this is a nested (multi-shape) format
        const isNested = Array.isArray(pointsOrShapes[0]) && Array.isArray(pointsOrShapes[0][0]);
        
        // Flatten all points from all shapes to find bounding box
        const allPoints = isNested ? pointsOrShapes.flat() : pointsOrShapes;
        if (!allPoints || allPoints.length === 0) return 5;
        
        const xCoords = allPoints.map(p => p[0]);
        const minX = Math.min(...xCoords);
        const maxX = Math.max(...xCoords);
        return minX >= 0 ? maxX : maxX - minX;
    }

    _addVariationData(font, glyphIndexMap, scale, syntheticShapeComponents = new Map()) {
        const state = this.state;
        const ot = this.opentype;

        if (!state.axes || state.axes.length === 0 || !state.masters || state.masters.length === 0) {
            return;
        }

        if (!font.variation && ot.VariationManager) {
            font.variation = new ot.VariationManager(font);
        }
        if (!font.variation) {
            console.warn('VariationManager not available');
            return;
        }

        const axisCount = state.axes.length;
        const allDeltas = new Map();

        state.axes.forEach((axis, axisIndex) => {
            const axisDeltas = this._buildMasterDeltas(axis, scale, axisIndex, axisCount, syntheticShapeComponents);
            allDeltas.set(axis.tag, axisDeltas);
        });

        state.axes.forEach(axis => {
            const axisDeltaSets = allDeltas.get(axis.tag) || [];
            font.variation.addAxis({
                tag: axis.tag,
                name: axis.name,
                minValue: axis.minValue,
                defaultValue: axis.defaultValue,
                maxValue: axis.maxValue,
                deltaGenerator: glyph => {
                    const results = [];
                    for (const deltaSet of axisDeltaSets) {
                        const glyphDeltas = deltaSet.deltas.get(glyph.name);
                        if (glyphDeltas) {
                            const result = {
                                peakTuple: deltaSet.peakTuple,
                                deltas: glyphDeltas.deltas,
                                deltasY: glyphDeltas.deltasY,
                                advanceWidthDelta: glyphDeltas.advanceWidthDelta
                            };
                            // Include intermediate tuple information if present
                            if (deltaSet.intermediateStartTuple) {
                                result.intermediateStartTuple = deltaSet.intermediateStartTuple;
                            }
                            if (deltaSet.intermediateEndTuple) {
                                result.intermediateEndTuple = deltaSet.intermediateEndTuple;
                            }
                            results.push(result);
                        }
                    }
                    return results.length > 0 ? results : null;
                }
            });
        });

        const instances = state.instances.length > 0 ? state.instances : [{
            name: 'Regular',
            coords: Object.fromEntries(state.axes.map(a => [a.tag, a.defaultValue]))
        }];
        for (const instance of instances) {
            font.variation.addInstance({ name: instance.name, coordinates: instance.coords });
        }
        
        // Create STAT table for variable fonts (required by spec)
        this._createSTATTable(font, state);
        
        // Create avar table for non-linear axis mapping
        this._createAvarTable(font, state);
    }
    
    /**
     * Create STAT table for variable fonts
     * @private
     */
    _createSTATTable(font, state) {
        if (!state.axes || state.axes.length === 0) return;
        
        // Get nameID for "Regular" (we'll use 2 which is typically fontSubfamily)
        // For a proper implementation, we'd look this up in the names table
        const elidedFallbackNameID = 2;
        
        // Build STAT axes
        const statAxes = state.axes.map((axis, index) => {
            // Get or create nameID for axis name
            // The VariationManager already added name entries for axes
            const axisNameID = font.tables.fvar?.axes[index]?.axisNameID || 256 + index;
            return {
                tag: axis.tag,
                nameID: axisNameID,
                ordering: index
            };
        });
        
        // Build STAT axis values for each axis
        const statValues = [];
        state.axes.forEach((axis, axisIndex) => {
            // Add axis value for default
            statValues.push({
                format: 1,
                axisIndex: axisIndex,
                flags: 2, // ELIDABLE_AXIS_VALUE_NAME (for the default)
                valueNameID: font.tables.fvar?.axes[axisIndex]?.axisNameID || 256 + axisIndex,
                value: axis.defaultValue
            });
        });
        
        // Set STAT table on font
        font.tables.stat = {
            version: [1, 2],
            axes: statAxes,
            values: statValues,
            elidedFallbackNameID: elidedFallbackNameID
        };
    }
    
    /**
     * Create or copy avar table for non-linear axis mapping.
     * 
     * The avar table contains segment maps for each axis that define piecewise
     * linear transformations from user-space to normalized coordinates.
     * 
     * For fonts with masters not at axis extremes, avar can be used to adjust
     * the interpolation so that the master positions are correctly mapped.
     * 
     * @private
     */
    _createAvarTable(font, state) {
        if (!state.axes || state.axes.length === 0) return;
        
        // If state already has an avar table (from import), use it
        if (state.avarTable && state.avarTable.axisSegmentMaps) {
            font.tables.avar = {
                version: state.avarTable.version || [1, 0],
                axisSegmentMaps: state.avarTable.axisSegmentMaps
            };
            return;
        }
        
        // Generate avar from master positions
        // For each axis, create segment maps that account for non-extremal master positions
        const axisSegmentMaps = [];
        
        for (const axis of state.axes) {
            const segmentMaps = [];
            
            // Required endpoints: -1 -> -1 and 1 -> 1
            // Required origin: 0 -> 0
            segmentMaps.push({ fromCoordinate: -1.0, toCoordinate: -1.0 });
            
            // Find master positions on this axis (excluding default)
            const masterPositions = [];
            for (const master of state.masters) {
                const coord = master.coords[axis.tag];
                if (coord !== undefined && coord !== axis.defaultValue) {
                    masterPositions.push(coord);
                }
            }
            
            // If masters exist at non-extreme positions, add intermediate mappings
            // This creates a piecewise linear avar that maps:
            //   user coordinate at master -> normalized coordinate representing master's effect
            
            // Sort positions into negative (< default) and positive (> default)
            const negPositions = masterPositions.filter(p => p < axis.defaultValue).sort((a, b) => a - b);
            const posPositions = masterPositions.filter(p => p > axis.defaultValue).sort((a, b) => a - b);
            
            // For negative range: map master position to its normalized position
            for (const pos of negPositions) {
                // User-space normalized position (relative to axis range)
                const userNorm = (pos - axis.defaultValue) / (axis.defaultValue - axis.minValue);
                // For now, use identity mapping (linear) - masters at correct positions
                // Future: could add non-linear mapping here for "easing"
                segmentMaps.push({ 
                    fromCoordinate: userNorm, 
                    toCoordinate: userNorm 
                });
            }
            
            // Default position (0 -> 0)
            segmentMaps.push({ fromCoordinate: 0.0, toCoordinate: 0.0 });
            
            // For positive range: map master position to its normalized position
            for (const pos of posPositions) {
                const userNorm = (pos - axis.defaultValue) / (axis.maxValue - axis.defaultValue);
                segmentMaps.push({ 
                    fromCoordinate: userNorm, 
                    toCoordinate: userNorm 
                });
            }
            
            segmentMaps.push({ fromCoordinate: 1.0, toCoordinate: 1.0 });
            
            // Sort by fromCoordinate and remove duplicates
            segmentMaps.sort((a, b) => a.fromCoordinate - b.fromCoordinate);
            const dedupedMaps = [];
            for (let i = 0; i < segmentMaps.length; i++) {
                if (i === 0 || Math.abs(segmentMaps[i].fromCoordinate - segmentMaps[i-1].fromCoordinate) > 0.0001) {
                    dedupedMaps.push(segmentMaps[i]);
                }
            }
            
            axisSegmentMaps.push({ axisValueMaps: dedupedMaps });
        }
        
        font.tables.avar = {
            version: [1, 0],
            axisSegmentMaps: axisSegmentMaps
        };
    }
    
    /**
     * Flatten multi-shape glyph data into a flat array of points.
     * Handles both nested format [[[x,y]...], [[x,y]...]] and flat format [[x,y]...].
     * @private
     */
    _flattenGlyphPoints(pointsOrShapes) {
        if (!pointsOrShapes || pointsOrShapes.length === 0) return [];
        
        // Detect if this is nested format (multi-shape)
        const isNested = Array.isArray(pointsOrShapes[0]) && Array.isArray(pointsOrShapes[0][0]);
        
        if (isNested) {
            // Flatten all shapes into a single array of points
            return pointsOrShapes.flat();
        }
        
        // Already flat format
        return pointsOrShapes;
    }

    _buildMasterDeltas(axis, scale, axisIndex, axisCount, syntheticShapeComponents = new Map()) {
        const result = [];
        const masters = this.state.masters;
        if (!masters || masters.length === 0) return result;

        // Find the default master
        let defaultMaster = masters[0];
        for (const master of masters) {
            const coordValue = master.coords[axis.tag];
            if (coordValue === undefined || coordValue === axis.defaultValue) {
                let isDefault = true;
                for (const ax of this.state.axes) {
                    const v = master.coords[ax.tag];
                    if (v !== undefined && v !== ax.defaultValue) {
                        isDefault = false;
                        break;
                    }
                }
                if (isDefault) {
                    defaultMaster = master;
                    break;
                }
            }
        }

        // Collect all non-default masters sorted by axis position
        const nonDefaultMasters = masters.filter(m => {
            const v = m.coords[axis.tag];
            return v !== undefined && v !== axis.defaultValue;
        }).sort((a, b) => {
            return (a.coords[axis.tag] || 0) - (b.coords[axis.tag] || 0);
        });

        if (nonDefaultMasters.length === 0) return result;

        // Separate masters into min side (< default) and max side (> default)
        const minSideMasters = nonDefaultMasters.filter(m => m.coords[axis.tag] < axis.defaultValue);
        const maxSideMasters = nonDefaultMasters.filter(m => m.coords[axis.tag] > axis.defaultValue);

        // Process each master individually
        // For extreme masters (most min/max), we use standard peak tuples
        // For intermediate masters, we use intermediate tuples

        const processIntermediateMaster = (master, prevPos, nextPos, direction) => {
            const masterPos = master.coords[axis.tag];
            const deltas = new Map();
            
            // Calculate normalized positions
            // direction: -1 for min side, 1 for max side
            const axisRange = direction === -1 
                ? axis.defaultValue - axis.minValue 
                : axis.maxValue - axis.defaultValue;
            
            const peak = (masterPos - axis.defaultValue) / axisRange;
            const start = (prevPos - axis.defaultValue) / axisRange;
            const end = (nextPos - axis.defaultValue) / axisRange;
            
            const peakTuple = new Array(axisCount).fill(0);
            peakTuple[axisIndex] = peak;
            
            const intermediateStartTuple = new Array(axisCount).fill(0);
            intermediateStartTuple[axisIndex] = start;
            
            const intermediateEndTuple = new Array(axisCount).fill(0);
            intermediateEndTuple[axisIndex] = end;

            for (const [char, targetPointsRaw] of Object.entries(master.glyphs)) {
                const basePointsRaw = defaultMaster.glyphs[char];
                if (!basePointsRaw) continue;
                
                const basePoints = this._flattenGlyphPoints(basePointsRaw);
                const targetPoints = this._flattenGlyphPoints(targetPointsRaw);
                
                if (basePoints.length !== targetPoints.length) continue;

                // For intermediate masters, calculate delta as:
                // (target - interpolated_position) where interpolated = base + t * (extreme_delta)
                // But since we're storing correction deltas, we calculate:
                // actual_target - linearly_interpolated_value
                
                // Simpler approach: delta = target - base (the deviation from default)
                const deltaX = [];
                const deltaY = [];
                for (let i = 0; i < basePoints.length; i++) {
                    deltaX.push(Math.round((targetPoints[i][0] - basePoints[i][0]) * scale));
                    deltaY.push(Math.round((targetPoints[i][1] - basePoints[i][1]) * scale));
                }
                deltaX.push(0, 0, 0, 0);
                deltaY.push(0, 0, 0, 0);

                const baseWidth = this._getGlyphWidth(basePointsRaw, char, defaultMaster.glyphWidths) + 1;
                const targetWidth = this._getGlyphWidth(targetPointsRaw, char, master.glyphWidths) + 1;
                const advanceWidthDelta = Math.round((targetWidth - baseWidth) * scale);

                const glyphName = this._charToGlyphName(char);
                deltas.set(glyphName, { deltas: deltaX, deltasY: deltaY, advanceWidthDelta });
                
                // If this glyph has a synthetic shape component, add deltas for it too
                // The synthetic component's shapes are the same as the original glyph's shapes
                if (syntheticShapeComponents.has(char)) {
                    const syntheticName = syntheticShapeComponents.get(char);
                    deltas.set(syntheticName, { deltas: [...deltaX], deltasY: [...deltaY], advanceWidthDelta });
                }
            }

            if (deltas.size > 0) {
                result.push({ 
                    peakTuple, 
                    intermediateStartTuple, 
                    intermediateEndTuple, 
                    deltas 
                });
            }
        };

        const processExtremeMaster = (master, peakSign) => {
            const deltas = new Map();
            const axisRange = peakSign === -1 ? axis.defaultValue - axis.minValue : axis.maxValue - axis.defaultValue;
            const masterOffset = peakSign === -1
                ? axis.defaultValue - (master.coords[axis.tag] ?? axis.defaultValue)
                : (master.coords[axis.tag] ?? axis.defaultValue) - axis.defaultValue;
            const deltaScale = axisRange !== 0 && masterOffset !== 0 ? axisRange / masterOffset : 1;

            const peakTuple = new Array(axisCount).fill(0);
            peakTuple[axisIndex] = peakSign;

            for (const [char, basePointsRaw] of Object.entries(defaultMaster.glyphs)) {
                const targetPointsRaw = master.glyphs[char];
                if (!targetPointsRaw) continue;
                
                const basePoints = this._flattenGlyphPoints(basePointsRaw);
                const targetPoints = this._flattenGlyphPoints(targetPointsRaw);
                
                if (basePoints.length !== targetPoints.length) continue;

                const deltaX = [];
                const deltaY = [];

                for (let i = 0; i < basePoints.length; i++) {
                    deltaX.push(Math.round((targetPoints[i][0] - basePoints[i][0]) * scale * deltaScale));
                    deltaY.push(Math.round((targetPoints[i][1] - basePoints[i][1]) * scale * deltaScale));
                }

                deltaX.push(0, 0, 0, 0);
                deltaY.push(0, 0, 0, 0);

                const baseWidth = this._getGlyphWidth(basePointsRaw, char, defaultMaster.glyphWidths) + 1;
                const targetWidth = this._getGlyphWidth(targetPointsRaw, char, master.glyphWidths) + 1;
                const advanceWidthDelta = Math.round((targetWidth - baseWidth) * scale * deltaScale);

                const glyphName = this._charToGlyphName(char);
                deltas.set(glyphName, { deltas: deltaX, deltasY: deltaY, advanceWidthDelta });
                
                // If this glyph has a synthetic shape component, add deltas for it too
                // The synthetic component's shapes are the same as the original glyph's shapes
                if (syntheticShapeComponents.has(char)) {
                    const syntheticName = syntheticShapeComponents.get(char);
                    deltas.set(syntheticName, { deltas: [...deltaX], deltasY: [...deltaY], advanceWidthDelta });
                }
            }

            if (deltas.size > 0) {
                result.push({ peakTuple, deltas });
            }
        };

        // Process min-side masters
        if (minSideMasters.length > 0) {
            // The most extreme min master becomes the standard -1 peak master
            const extremeMinMaster = minSideMasters[0]; // Already sorted, so first is most negative
            processExtremeMaster(extremeMinMaster, -1);
            
            // Other min-side masters are intermediate
            for (let i = 1; i < minSideMasters.length; i++) {
                const master = minSideMasters[i];
                const prevMaster = minSideMasters[i - 1];
                const prevPos = prevMaster.coords[axis.tag];
                const nextPos = axis.defaultValue; // Intermediate between this master and default
                processIntermediateMaster(master, prevPos, nextPos, -1);
            }
        }

        // Process max-side masters
        if (maxSideMasters.length > 0) {
            // The most extreme max master becomes the standard +1 peak master
            const extremeMaxMaster = maxSideMasters[maxSideMasters.length - 1]; // Already sorted, so last is most positive
            processExtremeMaster(extremeMaxMaster, 1);
            
            // Other max-side masters are intermediate
            for (let i = 0; i < maxSideMasters.length - 1; i++) {
                const master = maxSideMasters[i];
                const prevPos = axis.defaultValue; // Intermediate between default and this master
                const nextMaster = maxSideMasters[i + 1];
                const nextPos = nextMaster.coords[axis.tag];
                processIntermediateMaster(master, prevPos, nextPos, 1);
            }
        }

        // Handle extrapolation: if we only have masters on one side, extrapolate to the other
        if (minSideMasters.length > 0 && maxSideMasters.length === 0) {
            // Extrapolate from min side to max
            const minMaster = minSideMasters[minSideMasters.length - 1]; // Closest to default
            const deltas = new Map();
            const axisRange = axis.maxValue - axis.defaultValue;
            const masterOffset = axis.defaultValue - minMaster.coords[axis.tag];
            const deltaScale = axisRange !== 0 && masterOffset !== 0 ? axisRange / masterOffset : 1;
            const peakTuple = new Array(axisCount).fill(0);
            peakTuple[axisIndex] = 1;

            for (const [char, basePointsRaw] of Object.entries(defaultMaster.glyphs)) {
                const targetPointsRaw = minMaster.glyphs[char];
                if (!targetPointsRaw) continue;
                
                const basePoints = this._flattenGlyphPoints(basePointsRaw);
                const targetPoints = this._flattenGlyphPoints(targetPointsRaw);
                
                if (basePoints.length !== targetPoints.length) continue;

                const deltaX = [];
                const deltaY = [];
                for (let i = 0; i < basePoints.length; i++) {
                    deltaX.push(Math.round((basePoints[i][0] - targetPoints[i][0]) * scale * deltaScale));
                    deltaY.push(Math.round((basePoints[i][1] - targetPoints[i][1]) * scale * deltaScale));
                }
                deltaX.push(0, 0, 0, 0);
                deltaY.push(0, 0, 0, 0);

                const baseWidth = this._getGlyphWidth(basePointsRaw, char, defaultMaster.glyphWidths) + 1;
                const targetWidth = this._getGlyphWidth(targetPointsRaw, char, minMaster.glyphWidths) + 1;
                const advanceWidthDelta = Math.round((baseWidth - targetWidth) * scale * deltaScale);

                const glyphName = this._charToGlyphName(char);
                deltas.set(glyphName, { deltas: deltaX, deltasY: deltaY, advanceWidthDelta });
            }

            if (deltas.size > 0) {
                result.push({ peakTuple, deltas });
            }
        }

        if (maxSideMasters.length > 0 && minSideMasters.length === 0) {
            // Extrapolate from max side to min
            const maxMaster = maxSideMasters[0]; // Closest to default
            const deltas = new Map();
            const axisRange = axis.defaultValue - axis.minValue;
            const masterOffset = maxMaster.coords[axis.tag] - axis.defaultValue;
            const deltaScale = axisRange !== 0 && masterOffset !== 0 ? axisRange / masterOffset : 1;
            const peakTuple = new Array(axisCount).fill(0);
            peakTuple[axisIndex] = -1;

            for (const [char, basePointsRaw] of Object.entries(defaultMaster.glyphs)) {
                const targetPointsRaw = maxMaster.glyphs[char];
                if (!targetPointsRaw) continue;
                
                const basePoints = this._flattenGlyphPoints(basePointsRaw);
                const targetPoints = this._flattenGlyphPoints(targetPointsRaw);
                
                if (basePoints.length !== targetPoints.length) continue;

                const deltaX = [];
                const deltaY = [];
                for (let i = 0; i < basePoints.length; i++) {
                    deltaX.push(Math.round((basePoints[i][0] - targetPoints[i][0]) * scale * deltaScale));
                    deltaY.push(Math.round((basePoints[i][1] - targetPoints[i][1]) * scale * deltaScale));
                }
                deltaX.push(0, 0, 0, 0);
                deltaY.push(0, 0, 0, 0);

                const baseWidth = this._getGlyphWidth(basePointsRaw, char, defaultMaster.glyphWidths) + 1;
                const targetWidth = this._getGlyphWidth(targetPointsRaw, char, maxMaster.glyphWidths) + 1;
                const advanceWidthDelta = Math.round((baseWidth - targetWidth) * scale * deltaScale);

                const glyphName = this._charToGlyphName(char);
                deltas.set(glyphName, { deltas: deltaX, deltasY: deltaY, advanceWidthDelta });
            }

            if (deltas.size > 0) {
                result.push({ peakTuple, deltas });
            }
        }

        return result;
    }

    _validateGlyphPaths(font) {
        // font.glyphs can be a GlyphSet object or array
        let hasPath = false;
        const glyphCount = font.glyphs.length || font.numGlyphs || 0;
        for (let i = 0; i < glyphCount; i++) {
            const g = font.glyphs.get ? font.glyphs.get(i) : font.glyphs[i];
            if (g && g.name !== '.notdef' && g.name !== 'space' && g.name !== 'uni00A0' && 
                g.path && g.path.commands && g.path.commands.length > 0) {
                hasPath = true;
                break;
            }
        }
        if (!hasPath) {
            throw new Error('Exported font has no glyph paths');
        }
    }

    _validateRoundTrip(font) {
        const buffer = font.toArrayBuffer();
        const parsed = this.opentype.parse(buffer);
        if (!parsed) {
            throw new Error('Roundtrip parse failed');
        }
        const glyphCount = parsed.glyphs.length || parsed.numGlyphs || 0;
        if (glyphCount === 0) {
            throw new Error('Roundtrip parse returned no glyphs');
        }
        let hasPath = false;
        for (let i = 0; i < glyphCount; i++) {
            const g = parsed.glyphs.get ? parsed.glyphs.get(i) : parsed.glyphs[i];
            if (g && g.name !== '.notdef' && g.name !== 'space' && g.name !== 'uni00A0' && 
                g.path && g.path.commands && g.path.commands.length > 0) {
                hasPath = true;
                break;
            }
        }
        if (!hasPath) {
            throw new Error('Roundtrip parsed font has no glyph paths');
        }
        return parsed;
    }

    /**
     * Add kerning table to the font using opentype.js's position API
     * @param {Object} font - The opentype.js Font object
     * @param {Map} glyphIndexMap - Map of glyph names to indices
     * @param {number} scale - Scale factor from editor coords to font units
     */
    _addKerningTable(font, glyphIndexMap, scale) {
        const state = this.state;
        const kerningPairs = state.kerning || {};
        
        if (Object.keys(kerningPairs).length === 0) {
            return;
        }

        // Initialize kern table if not present
        // opentype.js stores kerning as font.kerningPairs = {'A/V': -50, ...}
        // or uses the position object with getKerningValue
        
        // Method 1: Using font.kerningPairs (simple, works for basic kerning)
        if (!font.kerningPairs) {
            font.kerningPairs = {};
        }
        
        for (const [pairKey, value] of Object.entries(kerningPairs)) {
            // pairKey is like "AV" - first char is left, rest is right
            const left = pairKey[0];
            const right = pairKey.slice(1);
            
            // Get glyph indices
            const leftGlyphName = this._charToGlyphName(left);
            const rightGlyphName = this._charToGlyphName(right);
            
            const leftIdx = glyphIndexMap.get(leftGlyphName);
            const rightIdx = glyphIndexMap.get(rightGlyphName);
            
            if (leftIdx !== undefined && rightIdx !== undefined) {
                // Scale the kerning value from editor units to font units
                const scaledValue = Math.round(value * scale / 10); // value is already in "units", scale appropriately
                font.kerningPairs[`${leftIdx}/${rightIdx}`] = scaledValue;
            }
        }
        
        // Also set up the position.getKerningValue if available
        if (font.position) {
            const originalGetKerning = font.position.getKerningValue?.bind(font.position);
            font.position.getKerningValue = function(leftGlyph, rightGlyph) {
                // Try our custom kerning first
                const pairKey = `${leftGlyph.index}/${rightGlyph.index}`;
                if (font.kerningPairs && font.kerningPairs[pairKey] !== undefined) {
                    return font.kerningPairs[pairKey];
                }
                // Fall back to original
                if (originalGetKerning) {
                    return originalGetKerning(leftGlyph, rightGlyph);
                }
                return 0;
            };
        }
    }
}

// ============================================================================
// Font Importer
// ============================================================================

export class FontImporter {
    constructor(opentypeModule = null) {
        this.opentype = opentypeModule || opentype;
        if (!this.opentype) {
            throw new Error('opentype.js module is required');
        }
    }

    import(state, buffer, options = {}) {
        const range = options.range || 'all';
        const overwrite = options.overwrite !== false;
        const importVF = options.importVF !== false;
        const editorScale = options.editorScale || 10;

        const font = this.opentype.parse(buffer);

        if (overwrite) {
            state.glyphs = {};
            state.glyphWidths = {};
            state.vfEnabled = false;
            state.axes = [];
            state.masters = [];
            state.instances = [];
            state.previewCoords = {};
        }

        const charCodes = this._getCharCodes(range);
        let importedCount = 0;
        // Scale from font units to editor coordinates
        const scale = editorScale / font.unitsPerEm;

        for (const code of charCodes) {
            const char = String.fromCharCode(code);
            const glyph = font.charToGlyph(char);

            if (glyph && glyph.path && glyph.path.commands.length > 0) {
                if (!overwrite && state.glyphs[char]) {
                    continue;
                }

                const points = extractPathPoints(glyph.path, font.unitsPerEm, editorScale);
                if (points.length > 0) {
                    state.glyphs[char] = points;
                    const bounds = getPathBounds(glyph.path);
                    // Width in editor coordinates (excluding sidebearing for now)
                    const glyphWidth = bounds.maxX * scale;
                    if (glyphWidth > 0) {
                        state.glyphWidths[char] = Math.round(glyphWidth * 10) / 10;
                    }
                    importedCount++;
                }
            }
        }

        if (importVF && font.tables.fvar && font.tables.fvar.axes) {
            this._importVariableFontData(state, font);
        }

        if (importedCount > 0 && !state.currentGlyph) {
            state.currentGlyph = Object.keys(state.glyphs)[0];
        }

        return { importedCount, font };
    }

    _getCharCodes(range) {
        const charCodes = [];
        const pushRange = (start, end) => {
            for (let i = start; i <= end; i++) {
                charCodes.push(i);
            }
        };

        switch (range) {
            case 'uppercase':
                pushRange(65, 90);
                break;
            case 'lowercase':
                pushRange(97, 122);
                break;
            case 'both':
                pushRange(65, 90);
                pushRange(97, 122);
                break;
            case 'digits':
                pushRange(48, 57);
                break;
            case 'all':
            default:
                pushRange(32, 126);
                break;
        }

        return charCodes;
    }

    _importVariableFontData(state, font) {
        state.vfEnabled = true;
        state.axes = font.tables.fvar.axes.map(a => ({
            tag: a.tag,
            name: a.axisName || a.tag,
            minValue: a.minValue,
            defaultValue: a.defaultValue,
            maxValue: a.maxValue
        }));

        const defaultCoords = state.axes.reduce((acc, axis) => {
            acc[axis.tag] = axis.defaultValue;
            return acc;
        }, {});

        state.masters = [{
            name: 'Default',
            coords: defaultCoords,
            glyphs: { ...state.glyphs },
            glyphWidths: { ...state.glyphWidths }
        }];

        state.instances = (font.tables.fvar.instances || []).map(inst => ({
            name: inst.name?.en || Object.values(inst.name)[0] || 'Instance',
            coords: inst.coordinates
        }));

        // Import avar table if present (for non-linear axis mapping)
        if (font.tables.avar && font.tables.avar.axisSegmentMaps) {
            state.avarTable = {
                version: font.tables.avar.version || [1, 0],
                axisSegmentMaps: font.tables.avar.axisSegmentMaps.map(sm => ({
                    axisValueMaps: (sm.axisValueMaps || []).map(m => ({
                        fromCoordinate: m.fromCoordinate,
                        toCoordinate: m.toCoordinate
                    }))
                }))
            };
        }

        for (const axis of state.axes) {
            state.previewCoords[axis.tag] = axis.defaultValue;
        }
    }
}
