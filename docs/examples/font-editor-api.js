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
 * @typedef {Object} TrueTypePoint
 * @property {number} x - X coordinate in font units
 * @property {number} y - Y coordinate in font units
 * @property {boolean} onCurve - Whether this is an on-curve point (true) or control point (false)
 * @property {boolean} [lastPointOfContour] - Whether this is the last point of a contour
 */

/**
 * @typedef {TrueTypePoint[]} Contour
 * A contour is an array of TrueType points that form a closed shape
 */

/**
 * @typedef {Contour[]} GlyphOutline
 * A glyph outline is an array of contours (shapes)
 */

/**
 * @typedef {Object} GlyphData
 * @property {GlyphOutline} contours - TrueType-style contours
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
 * @property {Object<string, GlyphOutline>} glyphs - Glyph data for this master
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
 * Transform a point by reference transform (dx, dy, scaleX, scaleY, rotation, skewX, skewY)
 * Order: scale -> skew -> rotate -> translate
 * 
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {Object} ref - Transform reference with dx, dy, scaleX, scaleY, rotation, skewX, skewY
 * @param {boolean} [onCurve=true] - Whether the point is on curve (for glyph contours)
 * @returns {{x: number, y: number, onCurve: boolean}} Transformed point
 */
export function transformPoint(x, y, ref, onCurve = true) {
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
    
    return { x: px, y: py, onCurve };
}

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
 * Extract TrueType points from a glyph, preserving all curve information.
 * This is the preferred way to extract glyph data for VF and accurate export.
 * 
 * @param {Object} glyph - OpenType.js glyph object
 * @returns {Contour[]} Array of contours, each containing TrueType points
 */
export function extractGlyphContours(glyph) {
    if (!glyph || !glyph.points || glyph.points.length === 0) {
        return [];
    }
    
    const contours = [];
    let currentContour = [];
    
    for (const pt of glyph.points) {
        currentContour.push({
            x: pt.x,
            y: pt.y,
            onCurve: pt.onCurve !== false
        });
        
        if (pt.lastPointOfContour) {
            contours.push(currentContour);
            currentContour = [];
        }
    }
    
    if (currentContour.length > 0) {
        contours.push(currentContour);
    }
    
    return contours;
}

/**
 * Extract TrueType points from a variation transform result.
 * Used for importing variable font masters at specific coordinates.
 * 
 * @param {Object[]} transformPoints - Points from font.variation.getTransform()
 * @returns {Contour[]} Array of contours, each containing TrueType points
 */
export function extractTransformContours(transformPoints) {
    if (!transformPoints || transformPoints.length === 0) {
        return [];
    }
    
    const contours = [];
    let currentContour = [];
    
    for (const pt of transformPoints) {
        currentContour.push({
            x: pt.x,
            y: pt.y,
            onCurve: pt.onCurve !== false
        });
        
        if (pt.lastPointOfContour) {
            contours.push(currentContour);
            currentContour = [];
        }
    }
    
    if (currentContour.length > 0) {
        contours.push(currentContour);
    }
    
    return contours;
}

/**
 * Convert contours to a flat array of TrueType points (for glyph.points format)
 * 
 * @param {Contour[]} contours - Array of contours
 * @returns {Object[]} Flat array of {x, y, onCurve, lastPointOfContour}
 */
export function contoursToPoints(contours) {
    const points = [];
    for (const contour of contours) {
        for (let i = 0; i < contour.length; i++) {
            const pt = contour[i];
            points.push({
                x: Math.round(pt.x),
                y: Math.round(pt.y),
                onCurve: pt.onCurve !== false,
                lastPointOfContour: i === contour.length - 1
            });
        }
    }
    return points;
}

/**
 * Convert contours to an opentype.js Path object.
 * Handles on-curve and off-curve points with quadratic curves.
 * 
 * @param {Contour[]} contours - Array of contours
 * @param {Object} opentypeModule - The opentype.js module
 * @returns {Object} OpenType.js Path object
 */
export function contoursToPath(contours, opentypeModule) {
    const ot = opentypeModule;
    const path = new ot.Path();
    
    for (const contour of contours) {
        if (contour.length === 0) continue;
        
        // Find first on-curve point to start from
        let startIdx = 0;
        for (let i = 0; i < contour.length; i++) {
            if (contour[i].onCurve) {
                startIdx = i;
                break;
            }
        }
        
        // Rotate contour so we start from an on-curve point
        const rotated = [...contour.slice(startIdx), ...contour.slice(0, startIdx)];
        
        // If first point is off-curve, create implicit on-curve midpoint
        if (!rotated[0].onCurve) {
            const last = rotated[rotated.length - 1];
            const first = rotated[0];
            const midX = (last.x + first.x) / 2;
            const midY = (last.y + first.y) / 2;
            rotated.unshift({ x: midX, y: midY, onCurve: true });
        }
        
        path.moveTo(rotated[0].x, rotated[0].y);
        
        let i = 1;
        while (i < rotated.length) {
            const pt = rotated[i];
            
            if (pt.onCurve) {
                path.lineTo(pt.x, pt.y);
                i++;
            } else {
                const next = rotated[(i + 1) % rotated.length];
                
                if (next.onCurve) {
                    path.quadraticCurveTo(pt.x, pt.y, next.x, next.y);
                    i += 2;
                } else {
                    // Two consecutive off-curve: implied on-curve midpoint
                    const midX = (pt.x + next.x) / 2;
                    const midY = (pt.y + next.y) / 2;
                    path.quadraticCurveTo(pt.x, pt.y, midX, midY);
                    i++;
                }
            }
        }
        
        path.closePath();
    }
    
    return path;
}

/**
 * Extract simplified polygon points from a path (for display purposes).
 * @deprecated Use extractGlyphContours for VF/export
 *
 * @param {Object} path - OpenType.js path object
 * @returns {Point[]} Array of [x, y] points in font units
 */
export function extractPathPoints(path) {
    const points = [];

    for (const cmd of path.commands) {
        if (cmd.type === 'M' || cmd.type === 'L') {
            points.push([
                Math.round(cmd.x),
                Math.round(cmd.y)
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
        // Sidebearing: padding applied half to left, half to right in auto-width mode
        // When building font, X coordinates are offset by sidebearing/2 to center glyphs
        this.sidebearing = options.sidebearing !== undefined ? options.sidebearing : 40;
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

    /**
     * Add a glyph with contours.
     * @param {string} char - The character/glyph name
     * @param {Array} contours - Contours in format [[{x, y, onCurve}, ...], ...]
     * @param {number} [width] - Optional explicit width
     */
    addGlyph(char, contours = [], width = undefined) {
        this.glyphs[char] = contours;
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

        // Calculate width including reference shapes
        const glyphsSource = this.vfEnabled && this.masters.length > 0
            ? this.masters[this.currentMaster].glyphs
            : this.glyphs;
        const refsSource = this.glyphReferences;
        
        const ownContours = glyphsSource[char] || [];
        const refContours = this.getTransformedReferenceContoursFromSource(char, glyphsSource, refsSource);
        
        // Combine own contours with reference contours
        const allContours = [...ownContours, ...refContours];
        
        return this._computeGlyphWidthFromContours(allContours);
    }

    /**
     * Compute glyph width from contours (bounding box width)
     * @param {Array} contours - Glyph contours (array of contours)
     * @returns {number} Width based on bounding box
     */
    _computeGlyphWidthFromContours(contours) {
        if (!contours || contours.length === 0) return 5;
        
        // Flatten all contours and get x coordinates
        const allPoints = contours.flat();
        if (!allPoints || allPoints.length === 0) return 5;
        
        const xCoords = allPoints.map(p => p.x);
        const minX = Math.min(...xCoords);
        const maxX = Math.max(...xCoords);
        return minX >= 0 ? maxX : maxX - minX;
    }

    /**
     * Compute glyph width from contours (bounding box width)
     * @param {Array} contours - Glyph contours
     * @returns {number} Width based on bounding box
     */
    _computeGlyphWidth(contours) {
        if (!contours || contours.length === 0) return 5;
        
        // Flatten all contours and get x coordinates
        const allPoints = contours.flat();
        if (!allPoints || allPoints.length === 0) return 5;
        
        const xCoords = allPoints.map(p => p.x);
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

    // ==================== Reference Methods ====================

    /**
     * Get references for a glyph
     * @param {string} char - The glyph character/name
     * @returns {Array} Array of reference objects or empty array
     */
    getReferences(char) {
        return this.glyphReferences[char] || [];
    }

    /**
     * Add a reference to a glyph
     * @param {string} char - The glyph to add reference to
     * @param {Object} ref - Reference object with name, dx, dy, scaleX, scaleY, rotation, skewX, skewY
     */
    addReference(char, ref) {
        if (!this.glyphReferences[char]) {
            this.glyphReferences[char] = [];
        }
        // Ensure defaults
        const fullRef = {
            name: ref.name,
            dx: ref.dx || 0,
            dy: ref.dy || 0,
            scaleX: ref.scaleX !== undefined ? ref.scaleX : 1,
            scaleY: ref.scaleY !== undefined ? ref.scaleY : 1,
            rotation: ref.rotation || 0,
            skewX: ref.skewX || 0,
            skewY: ref.skewY || 0
        };
        this.glyphReferences[char].push(fullRef);
    }

    /**
     * Remove a reference from a glyph
     * @param {string} char - The glyph character/name
     * @param {number} idx - Index of the reference to remove
     */
    removeReference(char, idx) {
        if (!this.glyphReferences[char]) return false;
        if (idx < 0 || idx >= this.glyphReferences[char].length) return false;
        this.glyphReferences[char].splice(idx, 1);
        // Clean up empty arrays
        if (this.glyphReferences[char].length === 0) {
            delete this.glyphReferences[char];
        }
        return true;
    }

    /**
     * Update a reference's transform properties
     * @param {string} char - The glyph character/name
     * @param {number} idx - Index of the reference
     * @param {Object} updates - Properties to update (dx, dy, scaleX, scaleY, rotation, skewX, skewY)
     */
    updateReference(char, idx, updates) {
        if (!this.glyphReferences[char]) return false;
        if (idx < 0 || idx >= this.glyphReferences[char].length) return false;
        const ref = this.glyphReferences[char][idx];
        Object.assign(ref, updates);
        return true;
    }

    /**
     * Get transformed contours for all references of a glyph
     * @param {string} char - The glyph character/name
     * @returns {Array} Array of transformed contours from all references
     */
    getTransformedReferenceContours(char) {
        return this.getTransformedReferenceContoursFromSource(char, this.glyphs, this.glyphReferences);
    }

    /**
     * Get transformed contours for all references of a glyph from a specific source
     * @param {string} char - The glyph character/name
     * @param {Object} glyphsSource - Source of glyphs to look up components from
     * @param {Object} refsSource - Source of references
     * @returns {Array} Array of transformed contours from all references
     */
    getTransformedReferenceContoursFromSource(char, glyphsSource, refsSource) {
        const refs = refsSource?.[char];
        if (!refs || refs.length === 0) return [];
        
        const allContours = [];
        for (const ref of refs) {
            // Pass refsSource for recursive lookup
            const transformedShapes = this._getTransformedReferenceShapesFromSource(ref, glyphsSource, refsSource);
            for (const shape of transformedShapes) {
                if (shape && shape.length > 0) {
                    allContours.push(shape);
                }
            }
        }
        return allContours;
    }

    /**
     * Transform a point by reference transform (dx, dy, scaleX, scaleY, rotation, skewX, skewY)
     * Used for rendering reference layers in the editor
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
     * Get shapes for a referenced glyph
     */
    _getComponentShapes(glyphName) {
        if (!this.glyphs || !this.glyphs[glyphName]) return [];
        
        const data = this.glyphs[glyphName];
        if (!data || data.length === 0) return [];
        
        // Normalize to nested format: [[{x, y, onCurve}, ...], ...]
        return this._normalizeShapes(data);
    }

    /**
     * Normalize contours to nested format [[{x, y, onCurve}, ...], ...]
     */
    _normalizeShapes(contours) {
        if (!contours || contours.length === 0) return [];
        
        // Check if already in correct format
        const first = contours[0];
        if (Array.isArray(first) && first.length > 0) {
            // Nested format - check if points are objects or arrays
            const firstPoint = first[0];
            if (typeof firstPoint === 'object' && !Array.isArray(firstPoint) && 'x' in firstPoint) {
                // Already in correct format: [[{x, y, onCurve}, ...], ...]
                return contours;
            } else if (Array.isArray(firstPoint) && typeof firstPoint[0] === 'number') {
                // Legacy format: [[[x, y], ...], ...]
                return contours.map(contour => 
                    contour.map(pt => ({
                        x: pt[0],
                        y: pt[1],
                        onCurve: pt[2] !== false
                    }))
                );
            }
        } else if (typeof first === 'object' && !Array.isArray(first) && 'x' in first) {
            // Flat format: [{x, y, onCurve}, ...]
            return [contours];
        }
        
        return contours;
    }

    /**
     * Get transformed shapes from a reference layer
     */
    _getTransformedReferenceShapes(ref) {
        return this._getTransformedReferenceShapesFromSource(ref, this.glyphs);
    }

    /**
     * Get transformed shapes from a reference layer using a specific glyph source
     * This method now supports recursive references (references within references)
     * @param {Object} ref - Reference object with name, dx, dy, scaleX, scaleY, etc.
     * @param {Object} glyphsSource - Source of glyph data
     * @param {Object} refsSource - Source of reference data (for recursive lookup)
     * @param {Set} visited - Set of already visited glyph names to prevent infinite loops
     * @returns {Array} Array of transformed contours
     */
    _getTransformedReferenceShapesFromSource(ref, glyphsSource, refsSource = null, visited = null) {
        // Initialize visited set if not provided
        if (!visited) {
            visited = new Set();
        }
        
        // Check for circular reference
        if (visited.has(ref.name)) {
            console.warn(`Circular reference detected: ${ref.name}`);
            return [];
        }
        visited.add(ref.name);
        
        const allShapes = [];
        
        // Get direct shapes from the referenced glyph
        const sourceShapes = this._getComponentShapesFromSource(ref.name, glyphsSource);
        
        // Transform and add direct shapes
        for (const shape of sourceShapes) {
            if (!shape || shape.length === 0) continue;
            const transformedShape = shape.map(point => {
                const transformed = this._transformPoint(point.x, point.y, ref);
                return { x: transformed[0], y: transformed[1], onCurve: point.onCurve !== false };
            });
            allShapes.push(transformedShape);
        }
        
        // Recursively get shapes from nested references (if refsSource is provided)
        // Use this.glyphReferences as default if not provided
        const actualRefsSource = refsSource || this.glyphReferences;
        if (actualRefsSource) {
            const nestedRefs = actualRefsSource[ref.name];
            if (nestedRefs && nestedRefs.length > 0) {
                for (const nestedRef of nestedRefs) {
                    // Recursively get shapes from nested reference
                    const nestedShapes = this._getTransformedReferenceShapesFromSource(
                        nestedRef, 
                        glyphsSource, 
                        actualRefsSource,
                        new Set(visited) // Pass a copy to allow siblings to share names
                    );
                    
                    // Apply the parent reference transform to the nested shapes
                    for (const shape of nestedShapes) {
                        if (!shape || shape.length === 0) continue;
                        const transformedShape = shape.map(point => {
                            const transformed = this._transformPoint(point.x, point.y, ref);
                            return { x: transformed[0], y: transformed[1], onCurve: point.onCurve !== false };
                        });
                        allShapes.push(transformedShape);
                    }
                }
            }
        }
        
        return allShapes;
    }

    /**
     * Get shapes for a referenced glyph from a specific source
     */
    _getComponentShapesFromSource(glyphName, glyphsSource) {
        if (!glyphsSource || !glyphsSource[glyphName]) return [];
        
        const data = glyphsSource[glyphName];
        if (!data || data.length === 0) return [];
        
        return this._normalizeShapes(data);
    }

    // ==================== End Reference Methods ====================

    /**
     * Add a point to the current glyph's first contour.
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate  
     * @param {boolean} [onCurve=true] - Whether this is an on-curve point
     */
    addPoint(x, y, onCurve = true) {
        if (!this.currentGlyph) return -1;
        if (!this.glyphs[this.currentGlyph]) {
            this.glyphs[this.currentGlyph] = [[]]; // Initialize with one empty contour
        }
        // Add to first contour
        const contour = this.glyphs[this.currentGlyph][0];
        contour.push({ x, y, onCurve });
        return contour.length - 1;
    }

    updatePoint(index, x, y, onCurve = true) {
        if (!this.currentGlyph || !this.glyphs[this.currentGlyph]) return false;
        const contour = this.glyphs[this.currentGlyph][0];
        if (!contour || index < 0 || index >= contour.length) return false;
        contour[index] = { x, y, onCurve };
        return true;
    }

    deletePoint(index) {
        if (!this.currentGlyph || !this.glyphs[this.currentGlyph]) return false;
        const contour = this.glyphs[this.currentGlyph][0];
        if (!contour || index < 0 || index >= contour.length) return false;
        contour.splice(index, 1);
        return true;
    }

    setVariableFontEnabled(enabled) {
        this.vfEnabled = enabled;
        if (enabled && this.masters.length === 0) {
            // Deep copy current state for the default master
            this.addMaster(
                'Default', 
                this.getDefaultCoords(), 
                JSON.parse(JSON.stringify(this.glyphs)), 
                JSON.parse(JSON.stringify(this.glyphWidths)),
                JSON.parse(JSON.stringify(this.glyphReferences || {}))
            );
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
        // Apply default value to all existing masters
        for (const master of this.masters) {
            if (master.coords[axis.tag] === undefined) {
                master.coords[axis.tag] = axis.defaultValue;
            }
        }
        // Apply default value to all existing instances
        for (const instance of this.instances) {
            if (instance.coords[axis.tag] === undefined) {
                instance.coords[axis.tag] = axis.defaultValue;
            }
        }
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
    addMaster(name, coords, glyphs = null, glyphWidths = null, glyphReferences = null) {
        this.masters.push({
            name,
            coords: { ...coords },
            glyphs: glyphs ? JSON.parse(JSON.stringify(glyphs)) : JSON.parse(JSON.stringify(this.glyphs)),
            glyphWidths: glyphWidths ? JSON.parse(JSON.stringify(glyphWidths)) : JSON.parse(JSON.stringify(this.glyphWidths)),
            glyphReferences: glyphReferences ? JSON.parse(JSON.stringify(glyphReferences)) : JSON.parse(JSON.stringify(this.glyphReferences || {}))
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

    /**
     * Select a master for editing. This saves the current glyph edits to the
     * current master, then loads the target master's glyphs/widths/references.
     * @param {number} index - Index of the master to select
     * @returns {boolean} Whether selection was successful
     */
    selectMaster(index) {
        if (index < 0 || index >= this.masters.length) return false;
        if (index === this.currentMaster) return true;
        
        // Save current glyph edits to current master
        if (this.currentMaster < this.masters.length) {
            this.masters[this.currentMaster].glyphs = JSON.parse(JSON.stringify(this.glyphs));
            this.masters[this.currentMaster].glyphWidths = JSON.parse(JSON.stringify(this.glyphWidths));
            this.masters[this.currentMaster].glyphReferences = JSON.parse(JSON.stringify(this.glyphReferences || {}));
        }
        
        // Switch to new master
        this.currentMaster = index;
        this.glyphs = JSON.parse(JSON.stringify(this.masters[index].glyphs || {}));
        this.glyphWidths = JSON.parse(JSON.stringify(this.masters[index].glyphWidths || {}));
        this.glyphReferences = JSON.parse(JSON.stringify(this.masters[index].glyphReferences || {}));
        
        return true;
    }

    /**
     * Select an instance - apply its axis coordinates to previewCoords.
     * This updates the preview to show the font at the instance's coordinates.
     * @param {number} index - Index of the instance to select
     * @returns {boolean} Whether selection was successful
     */
    selectInstance(index) {
        if (index < 0 || index >= this.instances.length) return false;
        const instance = this.instances[index];
        
        // Set preview coords to instance coords
        for (const [tag, value] of Object.entries(instance.coords)) {
            this.previewCoords[tag] = value;
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

    /**
     * Add a ligature substitution rule
     * @param {string} sequence - The input character sequence (e.g., 'fi')
     * @param {string} result - The glyph name for the ligature result (e.g., 'fi' or 'f_i')
     * @param {boolean} enabled - Whether the ligature is active
     */
    addLigature(sequence, result, enabled = true) {
        this.ligatures.push({ sequence, result, enabled });
    }

    /**
     * Remove a ligature by index
     * @param {number} index - Index in the ligatures array
     * @returns {boolean} Whether removal was successful
     */
    removeLigature(index) {
        if (index < 0 || index >= this.ligatures.length) return false;
        this.ligatures.splice(index, 1);
        return true;
    }

    /**
     * Set whether ligatures feature is enabled
     * @param {boolean} enabled
     */
    setLigaturesEnabled(enabled) {
        this.features.liga = enabled;
    }

    toJSON() {
        return {
            familyName: this.familyName,
            styleName: this.styleName,
            unitsPerEm: this.unitsPerEm,
            ascender: this.ascender,
            descender: this.descender,
            sidebearing: this.sidebearing,
            glyphs: this.glyphs,
            glyphWidths: this.glyphWidths,
            glyphReferences: this.glyphReferences,
            vfEnabled: this.vfEnabled,
            axes: this.axes,
            masters: this.masters,
            instances: this.instances,
            avarTable: this.avarTable,
            ligatures: this.ligatures,
            features: this.features,
            kerning: this.kerning
        };
    }

    /**
     * Interpolate glyphs based on axis coordinates.
     * Returns glyphs, widths, and references interpolated between masters.
     * @param {Object} coords - Axis coordinates (e.g., {wght: 500})
     * @returns {Object} { glyphs, widths, references }
     */
    getInterpolatedGlyphs(coords = null) {
        const targetCoords = coords || this.previewCoords;
        
        // If VF not enabled or no masters, return current glyphs
        if (!this.vfEnabled || this.masters.length === 0 || this.axes.length === 0) {
            return { 
                glyphs: this.glyphs, 
                widths: this.glyphWidths, 
                references: this.glyphReferences 
            };
        }
        
        // Find default master (all coords at default values)
        let defaultMaster = this.masters[0];
        for (const master of this.masters) {
            let isDefault = true;
            for (const axis of this.axes) {
                const v = master.coords[axis.tag];
                if (v !== undefined && v !== axis.defaultValue) {
                    isDefault = false;
                    break;
                }
            }
            if (isDefault) {
                defaultMaster = master;
                break;
            }
        }
        
        // For each axis, find min and max masters
        const axisMasters = [];
        for (const axis of this.axes) {
            let minMaster = null, maxMaster = null;
            let minVal = axis.defaultValue, maxVal = axis.defaultValue;
            
            for (const master of this.masters) {
                const v = master.coords[axis.tag];
                if (v === undefined || v === axis.defaultValue) continue;
                
                if (v < axis.defaultValue && (minMaster === null || v < minVal)) {
                    minMaster = master;
                    minVal = v;
                }
                if (v > axis.defaultValue && (maxMaster === null || v > maxVal)) {
                    maxMaster = master;
                    maxVal = v;
                }
            }
            axisMasters.push({ axis, minMaster, maxMaster, minVal, maxVal });
        }
        
        const resultGlyphs = {};
        const resultWidths = {};
        
        // Interpolate each glyph
        for (const char of Object.keys(this.glyphs)) {
            const baseGlyph = defaultMaster.glyphs?.[char];
            if (!baseGlyph) {
                resultGlyphs[char] = this.glyphs[char] || [];
                continue;
            }
            
            // Deep copy base glyph
            let resultGlyph = JSON.parse(JSON.stringify(baseGlyph));
            let widthDelta = 0;
            // Compute base width from explicit width or glyph bounds
            let baseWidth = defaultMaster.glyphWidths?.[char];
            if (baseWidth === undefined) {
                baseWidth = this._computeGlyphWidth(baseGlyph);
            }
            
            // Apply deltas from each axis
            for (const { axis, minMaster, maxMaster, minVal, maxVal } of axisMasters) {
                const targetVal = targetCoords[axis.tag] ?? axis.defaultValue;
                if (targetVal === axis.defaultValue) continue;
                
                // Determine interpolation/extrapolation factor and delta master
                let t;
                let deltaMaster;
                let isExtrapolation = false;
                
                if (targetVal < axis.defaultValue) {
                    // Moving toward min side
                    if (minMaster) {
                        // Normal interpolation toward min master
                        t = (targetVal - axis.defaultValue) / (minVal - axis.defaultValue);
                        deltaMaster = minMaster;
                    } else if (maxMaster) {
                        // Extrapolate from max side: reverse the max delta
                        // Calculate t as: how far toward min we want to go, scaled by the max delta
                        const maxRange = maxVal - axis.defaultValue;
                        const targetRange = axis.defaultValue - targetVal;
                        t = -targetRange / maxRange; // Negative to reverse direction
                        deltaMaster = maxMaster;
                        isExtrapolation = true;
                    } else {
                        continue;
                    }
                } else {
                    // Moving toward max side (targetVal > axis.defaultValue)
                    if (maxMaster) {
                        // Normal interpolation toward max master
                        t = (targetVal - axis.defaultValue) / (maxVal - axis.defaultValue);
                        deltaMaster = maxMaster;
                    } else if (minMaster) {
                        // Extrapolate from min side: reverse the min delta
                        // Calculate t as: how far toward max we want to go, scaled by the min delta
                        const minRange = axis.defaultValue - minVal;
                        const targetRange = targetVal - axis.defaultValue;
                        t = -targetRange / minRange; // Negative to reverse direction
                        deltaMaster = minMaster;
                        isExtrapolation = true;
                    } else {
                        continue;
                    }
                }
                
                const deltaGlyph = deltaMaster.glyphs?.[char];
                if (!deltaGlyph) continue;
                
                // Apply interpolation to each contour
                for (let ci = 0; ci < resultGlyph.length && ci < deltaGlyph.length; ci++) {
                    const baseContour = resultGlyph[ci];
                    const deltaContour = deltaGlyph[ci];
                    if (!baseContour || !deltaContour) continue;
                    
                    for (let pi = 0; pi < baseContour.length && pi < deltaContour.length; pi++) {
                        const basePoint = baseContour[pi];
                        const deltaPoint = deltaContour[pi];
                        // Delta = masterPoint - defaultPoint, scaled by t
                        const defaultPoint = baseGlyph[ci]?.[pi];
                        if (defaultPoint && deltaPoint) {
                            basePoint.x += (deltaPoint.x - defaultPoint.x) * t;
                            basePoint.y += (deltaPoint.y - defaultPoint.y) * t;
                        }
                    }
                }
                
                // Interpolate width - compute from glyph bounds if no explicit width
                let deltaWidth = deltaMaster.glyphWidths?.[char];
                if (deltaWidth === undefined && deltaGlyph) {
                    // Compute width from delta master's glyph bounding box
                    deltaWidth = this._computeGlyphWidth(deltaGlyph);
                }
                if (deltaWidth !== undefined) {
                    widthDelta += (deltaWidth - baseWidth) * t;
                }
            }
            
            resultGlyphs[char] = resultGlyph;
            resultWidths[char] = baseWidth + widthDelta;
        }
        
        return { glyphs: resultGlyphs, widths: resultWidths, references: this.glyphReferences };
    }

    /**
     * Get the default space width (matches FontBuilder: 5 * unitsPerEm/10 = unitsPerEm/2)
     */
    getDefaultSpaceWidth() {
        return Math.round(this.unitsPerEm / 2);
    }

    /**
     * Shape text into positioned glyphs with optional ligatures and kerning
     * @param {string} text - The text to shape
     * @param {Object} options - Shaping options
     * @param {boolean} options.useLigatures - Whether to apply ligatures
     * @param {boolean} options.useKerning - Whether to apply kerning
     * @param {Object} options.coords - Explicit axis coordinates for VF interpolation (e.g., {wght: 500})
     * @returns {Array} Array of {x, width, char, contours} objects (contours may be empty for space)
     */
    shapeText(text, options = {}) {
        const { useLigatures = false, useKerning = false, coords = null } = options;
        const result = [];
        let x = 0;

        // Get interpolated glyphs if VF is enabled
        let glyphs, widths, refs;
        if (this.vfEnabled && this.axes.length > 0) {
            // Use explicit coords if provided, otherwise use previewCoords
            const targetCoords = coords || this.previewCoords;
            const interp = this.getInterpolatedGlyphs(targetCoords);
            glyphs = interp.glyphs;
            widths = interp.widths;
            refs = interp.references;
        } else {
            glyphs = this.glyphs;
            widths = this.glyphWidths;
            refs = this.glyphReferences;
        }

        // Process ligatures if enabled
        let chars = [...text];
        if (useLigatures && this.ligatures && this.ligatures.length > 0) {
            chars = this._processLigatures(text, glyphs);
        }

        // Simple character-by-character shaping
        for (let i = 0; i < chars.length; i++) {
            const char = chars[i];
            const rawContours = glyphs[char] || [];
            
            // Get the glyph's own contours
            const contours = [];
            if (rawContours && rawContours.length > 0) {
                for (const contour of rawContours) {
                    if (contour && contour.length > 0) {
                        contours.push(contour);
                    }
                }
            }
            
            // Add any reference contours (flattened/baked)
            const refContours = this.getTransformedReferenceContoursFromSource(char, glyphs, refs);
            for (const contour of refContours) {
                if (contour && contour.length > 0) {
                    contours.push(contour);
                }
            }
            
            // Calculate width for this glyph
            let width;
            if (char === ' ' || char === 'space') {
                // Space character - use space width from widths or default
                width = widths[' '] ?? widths['space'] ?? this.getDefaultSpaceWidth();
            } else if (widths[char] !== undefined) {
                width = widths[char] + (this.sidebearing || 0);
            } else if (contours.length > 0) {
                width = this.getGlyphWidth(char) + (this.sidebearing || 0);
            } else {
                // Missing glyph - use smaller fallback
                width = Math.round(this.unitsPerEm / 4);
            }
            
            // Always push the glyph (even spaces with no contours) so we maintain proper positioning
            result.push({
                x: x,
                width: width,
                char: char,
                contours: contours
            });
            
            x += width;
            
            // Apply kerning to next character if enabled
            if (useKerning && i < chars.length - 1) {
                const nextChar = chars[i + 1];
                const pair = char + nextChar;
                const kernValue = this.kerning[pair];
                if (kernValue !== undefined) {
                    x += kernValue;
                }
            }
        }
        
        return result;
    }

    /**
     * Process ligatures in text, returning array of glyph names
     * @private
     */
    _processLigatures(text, glyphs) {
        const result = [];
        const ligatures = this.ligatures || [];
        
        // Sort ligatures by sequence length (longest first)
        const sortedLigs = [...ligatures]
            .filter(l => l.enabled && l.sequence && l.result && glyphs[l.result])
            .sort((a, b) => b.sequence.length - a.sequence.length);
        
        let i = 0;
        while (i < text.length) {
            let matched = false;
            for (const lig of sortedLigs) {
                if (text.substring(i, i + lig.sequence.length) === lig.sequence) {
                    result.push(lig.result);
                    i += lig.sequence.length;
                    matched = true;
                    break;
                }
            }
            if (!matched) {
                result.push(text[i]);
                i++;
            }
        }
        
        return result;
    }

    /**
     * Convert shaped text to SVG path string
     * @param {Array} shapedGlyphs - Result from shapeText()
     * @param {Object} options - Rendering options
     * @param {number} options.fontSize - Target font size in pixels (default: 72)
     * @param {number} options.x - Starting X position (default: 0)
     * @param {number} options.baseline - Y position of baseline from top (default: fontSize)
     * @returns {string} SVG path d attribute
     */
    shapedTextToSvgPath(shapedGlyphs, options = {}) {
        const { fontSize = 72, x: startX = 0, baseline = null } = options;
        const scale = fontSize / this.unitsPerEm;
        const baselineY = baseline ?? fontSize;
        const lsbOffset = (this.sidebearing || 0) / 2;
        
        let d = '';
        
        for (const glyph of shapedGlyphs) {
            if (glyph.contours && glyph.contours.length > 0) {
                for (const contour of glyph.contours) {
                    if (!contour || contour.length === 0) continue;
                    
                    const p0 = contour[0];
                    const x0 = startX + (glyph.x + p0.x + lsbOffset) * scale;
                    const y0 = baselineY - p0.y * scale;
                    d += `M${x0.toFixed(2)} ${y0.toFixed(2)}`;
                    
                    for (let i = 1; i < contour.length; i++) {
                        const p = contour[i];
                        const px = startX + (glyph.x + p.x + lsbOffset) * scale;
                        const py = baselineY - p.y * scale;
                        d += ` L${px.toFixed(2)} ${py.toFixed(2)}`;
                    }
                    d += ' Z ';
                }
            }
        }
        
        return d.trim();
    }

    /**
     * Get total width of shaped text in font units
     * @param {Array} shapedGlyphs - Result from shapeText()
     * @returns {number} Total width in font units
     */
    getShapedTextWidth(shapedGlyphs) {
        if (!shapedGlyphs || shapedGlyphs.length === 0) return 0;
        const lastGlyph = shapedGlyphs[shapedGlyphs.length - 1];
        return lastGlyph.x + lastGlyph.width;
    }

    fromJSON(json) {
        this.familyName = json.familyName || 'Custom Font';
        this.styleName = json.styleName || 'Regular';
        this.unitsPerEm = json.unitsPerEm || 800;
        this.ascender = json.ascender || 800;
        this.descender = json.descender || 0;
        this.sidebearing = json.sidebearing || 0;
        this.glyphs = json.glyphs || {};
        this.glyphWidths = json.glyphWidths || {};
        this.glyphReferences = json.glyphReferences || {};
        this.vfEnabled = json.vfEnabled || false;
        this.axes = json.axes || [];
        this.masters = json.masters || [];
        this.instances = json.instances || [];
        this.avarTable = json.avarTable || null;
        this.ligatures = json.ligatures || [];
        this.features = json.features || { liga: true, kern: true, dlig: false, calt: true, smcp: false };
        this.kerning = json.kerning || {};
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
     * Check if a glyph key represents a component glyph (not a regular character).
     * Component glyphs are underscore-prefixed names with more than 1 character (e.g., '_stem', '_O_shape').
     * A single underscore '_' is the actual underscore character, NOT a component.
     */
    _isComponentGlyph(char) {
        return char.startsWith('_') && char.length > 1;
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
        if (this._isComponentGlyph(char)) {
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
        
        // Use the common normalization function to handle all formats
        return this._normalizeShapes(data);
    }

    /**
     * Get transformed shapes from a reference layer
     * All shapes use contour format: arrays of {x, y, onCurve} objects
     */
    _getTransformedReferenceShapes(ref) {
        const sourceShapes = this._getComponentShapes(ref.name);
        if (!sourceShapes || sourceShapes.length === 0) return [];
        
        return sourceShapes.map(shape => 
            shape.map(point => {
                const transformed = this._transformPoint(point.x, point.y, ref);
                return { x: transformed[0], y: transformed[1], onCurve: point.onCurve !== false };
            })
        );
    }

    /**
     * Get all shapes for a glyph including reference layers (flattened/baked)
     * Components are transformed and merged into the glyph's shapes.
     * All shapes use contour format: [[{x, y, onCurve}, ...], ...]
     */
    _getGlyphShapesWithReferences(char, contours) {
        const allShapes = [];
        const state = this.state;
        
        // Normalize the glyph's own contours (handles legacy [x,y] format)
        const normalizedContours = this._normalizeShapes(contours);
        
        // Add the glyph's own contours
        for (const contour of normalizedContours) {
            if (contour && contour.length > 0) {
                allShapes.push(contour);
            }
        }
        
        // Add any reference layers (transformed component shapes)
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
     * Normalize contours to nested format [[{x, y, onCurve}, ...], ...]
     * Ensures input is always in the standard contour array format.
     * Handles both legacy [x, y] arrays and new {x, y, onCurve} objects.
     */
    _normalizeShapes(contours) {
        if (!contours || contours.length === 0) return [];
        
        const firstItem = contours[0];
        
        // Check if we have legacy format: [[[x, y], ...], ...] or [[x, y], ...]
        // Legacy format uses arrays [x, y] instead of objects {x, y, onCurve}
        const isLegacyNestedContours = Array.isArray(firstItem) && 
            firstItem.length > 0 && 
            Array.isArray(firstItem[0]) && 
            typeof firstItem[0][0] === 'number';
        
        const isLegacySingleContour = Array.isArray(firstItem) && 
            typeof firstItem[0] === 'number';
        
        if (isLegacyNestedContours) {
            // [[[x, y], ...], ...] -> [[{x, y, onCurve}, ...], ...]
            return contours.map(contour => 
                contour.map(pt => ({ x: pt[0], y: pt[1], onCurve: true }))
            ).filter(c => c && c.length > 0);
        }
        
        if (isLegacySingleContour) {
            // [[x, y], ...] -> [[{x, y, onCurve}, ...]]
            return [contours.map(pt => ({ x: pt[0], y: pt[1], onCurve: true }))];
        }
        
        // Single contour of point objects - wrap in array
        if (firstItem && typeof firstItem === 'object' && !Array.isArray(firstItem) && 'x' in firstItem) {
            return [contours];
        }
        
        // Already nested contours - filter out empty ones
        return contours.filter(c => c && c.length > 0);
    }

    /**
     * Convert TrueType points array to a Path for rendering
     * Handles on-curve and off-curve points with quadratic curves
     */
    _pointsToPath(points) {
        const ot = this.opentype;
        const path = new ot.Path();
        
        if (!points || points.length === 0) return path;
        
        // Split into contours
        const contours = [];
        let currentContour = [];
        
        for (const pt of points) {
            currentContour.push(pt);
            if (pt.lastPointOfContour) {
                contours.push(currentContour);
                currentContour = [];
            }
        }
        if (currentContour.length > 0) {
            contours.push(currentContour);
        }
        
        // Draw each contour
        for (const contour of contours) {
            if (contour.length === 0) continue;
            
            // Find first on-curve point to start from
            let startIdx = 0;
            for (let i = 0; i < contour.length; i++) {
                if (contour[i].onCurve) {
                    startIdx = i;
                    break;
                }
            }
            
            // Rotate contour so we start from an on-curve point
            const rotated = [...contour.slice(startIdx), ...contour.slice(0, startIdx)];
            
            // If first point is off-curve, we need to find an implicit on-curve
            if (!rotated[0].onCurve) {
                // Insert implicit on-curve midpoint between last and first off-curve
                const last = rotated[rotated.length - 1];
                const first = rotated[0];
                const midX = (last.x + first.x) / 2;
                const midY = (last.y + first.y) / 2;
                rotated.unshift({ x: midX, y: midY, onCurve: true });
            }
            
            path.moveTo(rotated[0].x, rotated[0].y);
            
            let i = 1;
            while (i < rotated.length) {
                const pt = rotated[i];
                
                if (pt.onCurve) {
                    path.lineTo(pt.x, pt.y);
                    i++;
                } else {
                    // Off-curve point - find the next on-curve (or implicit)
                    const next = rotated[(i + 1) % rotated.length];
                    
                    if (next.onCurve) {
                        // Quadratic curve: control=pt, end=next
                        path.quadraticCurveTo(pt.x, pt.y, next.x, next.y);
                        i += 2;
                    } else {
                        // Two consecutive off-curve: implied on-curve midpoint
                        const midX = (pt.x + next.x) / 2;
                        const midY = (pt.y + next.y) / 2;
                        path.quadraticCurveTo(pt.x, pt.y, midX, midY);
                        i++;
                    }
                }
            }
            
            path.closePath();
        }
        
        return path;
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
            let sourceContours;
            
            // Check if this is a synthetic shape component
            if (syntheticShapeComponents && baseGlyphs && 
                ref.name.endsWith('_shape') && ref.name.startsWith('_')) {
                const originalChar = ref.name.slice(1, -6); // Remove leading _ and trailing _shape
                if (syntheticShapeComponents.has(originalChar)) {
                    // Get contours from the original glyph
                    sourceContours = this._normalizeShapes(baseGlyphs[originalChar]);
                } else {
                    sourceContours = this._getComponentShapes(ref.name);
                }
            } else {
                sourceContours = this._getComponentShapes(ref.name);
            }
            
            if (!sourceContours || sourceContours.length === 0) continue;
            
            // Transform each point and track bounds
            // All contours use format: [{x, y, onCurve}, ...]
            for (const contour of sourceContours) {
                for (const point of contour) {
                    const transformed = this._transformPoint(point.x, point.y, ref);
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
        // All glyph data is stored in font units (unitsPerEm), so scale = 1
        // Only .notdef and space use a standard size based on unitsPerEm
        const validate = options.validate !== false;
        const validateRoundTrip = options.validateRoundTrip !== false;
        const useComposites = options.useComposites !== false; // Default: true for TTF composites
        const ot = this.opentype;
        const state = this.state;
        
        // All glyph coordinates are already in font units
        const scale = 1;
        // For fixed-size elements (like .notdef), use a proportion of unitsPerEm
        const notdefScale = state.unitsPerEm / 10;

        const otGlyphs = [];
        const glyphIndexMap = new Map();
        const componentGlyphIndexMap = new Map(); // Maps component names to glyph indices

        // Create .notdef glyph with a visible rectangle (required by font validators)
        const notdefPath = new ot.Path();
        const notdefWidth = Math.round(5 * notdefScale);
        const notdefHeight = Math.round(7 * notdefScale);
        // Draw a rectangle for .notdef
        notdefPath.moveTo(Math.round(0.5 * notdefScale), 0);
        notdefPath.lineTo(Math.round(4.5 * notdefScale), 0);
        notdefPath.lineTo(Math.round(4.5 * notdefScale), notdefHeight);
        notdefPath.lineTo(Math.round(0.5 * notdefScale), notdefHeight);
        notdefPath.closePath();
        // Draw inner rectangle (hollow)
        notdefPath.moveTo(Math.round(1 * notdefScale), Math.round(0.5 * notdefScale));
        notdefPath.lineTo(Math.round(1 * notdefScale), Math.round(6.5 * notdefScale));
        notdefPath.lineTo(Math.round(4 * notdefScale), Math.round(6.5 * notdefScale));
        notdefPath.lineTo(Math.round(4 * notdefScale), Math.round(0.5 * notdefScale));
        notdefPath.closePath();
        
        otGlyphs.push(new ot.Glyph({ name: '.notdef', unicode: 0, path: notdefPath, advanceWidth: notdefWidth }));
        glyphIndexMap.set('.notdef', 0);
        otGlyphs.push(new ot.Glyph({ name: 'space', unicode: 32, path: new ot.Path(), advanceWidth: Math.round(5 * notdefScale) }));
        glyphIndexMap.set('space', 1);
        otGlyphs.push(new ot.Glyph({ name: 'uni00A0', unicode: 0x00A0, path: new ot.Path(), advanceWidth: Math.round(5 * notdefScale) }));
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
        // Track glyphs built as VF composites (need component-offset gvar deltas, not per-point)
        const vfCompositeChars = new Set();
        
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
            
            // Also include ligature result glyphs (underscore-prefixed non-unicode glyphs)
            // Track these separately as they need sidebearing like regular character glyphs
            const ligatureResultGlyphs = new Set();
            if (state.ligatures && state.features?.liga !== false) {
                for (const lig of state.ligatures) {
                    if (lig.enabled && lig.result && this._isComponentGlyph(lig.result)) {
                        // This is an underscore-prefixed ligature result glyph
                        if (state.glyphs[lig.result]) {
                            referencedGlyphs.add(lig.result);
                            ligatureResultGlyphs.add(lig.result);
                        }
                    }
                }
            }
            
            // Detect glyphs that have BOTH own shapes AND references
            // For these, we need to create a synthetic component for their shapes
            // because TrueType glyphs can be EITHER simple OR composite, not both
            for (const [char, pointsOrShapes] of Object.entries(baseGlyphs)) {
                if (this._isComponentGlyph(char)) continue; // Skip existing components
                
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
                            : this._getGlyphWidth(compShapes, originalChar, state.glyphWidths, baseGlyphs);
                    } else if (!state.glyphs[refName]) {
                        continue; // Not a synthetic and doesn't exist
                    } else {
                        compShapes = state.glyphs[refName];
                        compWidth = state.glyphWidths[refName] !== undefined
                            ? state.glyphWidths[refName]
                            : this._getGlyphWidth(compShapes, refName, state.glyphWidths, baseGlyphs);
                    }
                } else {
                    if (!state.glyphs[refName]) continue;
                    compShapes = state.glyphs[refName];
                    compWidth = state.glyphWidths[refName] !== undefined
                        ? state.glyphWidths[refName]
                        : this._getGlyphWidth(compShapes, refName, state.glyphWidths, baseGlyphs);
                }
                
                const path = new ot.Path();
                
                // Ligature result glyphs need sidebearing like regular character glyphs
                // since they are substituted for regular characters during shaping
                const isLigatureResult = ligatureResultGlyphs.has(refName);
                const componentLsbOffset = isLigatureResult ? ((state.sidebearing || 0) / 2) : 0;
                
                // Draw all contours in the component
                // All contours use format: [[{x, y, onCurve}, ...], ...]
                const contours = this._normalizeShapes(compShapes);
                for (const contour of contours) {
                    if (contour && contour.length > 0) {
                        path.moveTo(Math.round((contour[0].x + componentLsbOffset) * scale), Math.round(contour[0].y * scale));
                        for (let i = 1; i < contour.length; i++) {
                            path.lineTo(Math.round((contour[i].x + componentLsbOffset) * scale), Math.round(contour[i].y * scale));
                        }
                        path.closePath();
                    }
                }
                
                // Determine if this is a regular character glyph (single char, not starting with _)
                // Regular character glyphs need their unicode even when used as components
                const isRegularChar = refName.length === 1 && !this._isComponentGlyph(refName);
                
                // Calculate advance width - ligature results need full sidebearing added
                const componentSidebearing = isLigatureResult ? (state.sidebearing || 0) : 0;
                
                const compGlyph = new ot.Glyph({
                    name: isRegularChar ? this._charToGlyphName(refName) : refName,
                    unicode: isRegularChar ? refName.charCodeAt(0) : undefined,
                    path,
                    advanceWidth: Math.round((compWidth + componentSidebearing) * scale)
                });
                
                otGlyphs.push(compGlyph);
                componentGlyphIndexMap.set(refName, glyphIndex);
                glyphIndexMap.set(refName, glyphIndex++);
            }
        }

        // Step 2: Create character glyphs (skip underscore-prefixed components)
        // Calculate left side bearing offset (sidebearing is split half left, half right)
        const lsbOffset = (state.sidebearing || 0) / 2;
        
        for (const [char, pointsOrShapes] of Object.entries(baseGlyphs)) {
            // Skip component glyphs (underscore-prefixed with more than 1 char) - they're handled in Step 1
            // Note: Single underscore "_" is the actual underscore character, not a component
            if (this._isComponentGlyph(char)) continue;
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
                // Track VF composites for composite-style gvar delta generation
                if (state.vfEnabled) {
                    vfCompositeChars.add(char);
                }
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
                    unicode: char.length === 1 ? char.charCodeAt(0) : undefined,
                    path: new ot.Path(), // Empty path - composite uses components
                    advanceWidth: Math.round((width + (state.sidebearing || 0)) * scale)
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
                // Create a simple glyph from contours
                // All shapes use contour format: [[{x, y, onCurve}, ...], ...]
                const allContours = this._getGlyphShapesWithReferences(char, pointsOrShapes);
                
                if (state.vfEnabled && allContours.length > 0 && allContours[0].length > 0) {
                    // Create glyph with TrueType points for VF (preserves curve structure)
                    const points = [];
                    let numberOfContours = 0;
                    
                    for (const contour of allContours) {
                        if (contour && contour.length > 0) {
                            for (let i = 0; i < contour.length; i++) {
                                const pt = contour[i];
                                points.push({
                                    // Apply lsbOffset to center glyph within advance width
                                    x: Math.round((pt.x + lsbOffset) * scale),
                                    y: Math.round(pt.y * scale),
                                    onCurve: pt.onCurve !== false,
                                    lastPointOfContour: (i === contour.length - 1)
                                });
                            }
                            numberOfContours++;
                        }
                    }
                    
                    // Also create a path for rendering (required for font display)
                    const path = this._pointsToPath(points, scale);
                    
                    const glyph = new ot.Glyph({
                        name: glyphName,
                        unicode: char.length === 1 ? char.charCodeAt(0) : undefined,
                        path,
                        advanceWidth: Math.round((width + (state.sidebearing || 0)) * scale),
                        points
                    });
                    glyph.numberOfContours = numberOfContours;
                    otGlyphs.push(glyph);
                } else {
                    // Create glyph with path only (non-VF)
                    const path = new ot.Path();
                    
                    for (const contour of allContours) {
                        if (contour && contour.length > 0) {
                            // Apply lsbOffset to center glyph within advance width
                            path.moveTo(Math.round((contour[0].x + lsbOffset) * scale), Math.round(contour[0].y * scale));
                            for (let i = 1; i < contour.length; i++) {
                                path.lineTo(Math.round((contour[i].x + lsbOffset) * scale), Math.round(contour[i].y * scale));
                            }
                            path.closePath();
                        }
                    }
                    
                    otGlyphs.push(new ot.Glyph({
                        name: glyphName,
                        unicode: char.length === 1 ? char.charCodeAt(0) : undefined,
                        path,
                        advanceWidth: Math.round((width + (state.sidebearing || 0)) * scale)
                    }));
                }
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
            this._addVariationData(font, glyphIndexMap, scale, syntheticShapeComponents, vfCompositeChars);
        }

        // Add ligature substitution table if there are enabled ligatures
        if (state.ligatures && state.ligatures.length > 0 && state.features?.liga !== false) {
            this._addLigatureTable(font, glyphIndexMap);
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
        const contours = baseGlyphs[char];
        const allShapes = this._getGlyphShapesWithReferences(char, contours);
        
        if (!allShapes || allShapes.length === 0) return 5;
        
        const allPoints = allShapes.flat();
        if (!allPoints || allPoints.length === 0) return 5;
        
        const xCoords = allPoints.map(p => p.x);
        const minX = Math.min(...xCoords);
        const maxX = Math.max(...xCoords);
        return minX >= 0 ? maxX : maxX - minX;
    }

    /**
     * Get glyph width - uses explicit override if available, otherwise calculates from contours
     */
    _getGlyphWidth(contours, char, widthsObj, baseGlyphs = null) {
        // First check for explicit width override
        if (widthsObj && widthsObj[char] !== undefined) {
            return widthsObj[char];
        }
        
        // No override - use auto-calculated width including references
        if (baseGlyphs && char) {
            return this._getAutoWidth(char, baseGlyphs);
        }
        
        // Fallback to simple calculation from provided contours
        if (!contours || contours.length === 0) return 5;
        
        // Normalize contours first (handles legacy [x,y] format)
        const normalized = this._normalizeShapes(contours);
        if (!normalized || normalized.length === 0) return 5;
        
        // Flatten all points from all contours to find bounding box
        const allPoints = normalized.flat();
        if (!allPoints || allPoints.length === 0) return 5;
        
        const xCoords = allPoints.map(p => p.x);
        const minX = Math.min(...xCoords);
        const maxX = Math.max(...xCoords);
        return minX >= 0 ? maxX : maxX - minX;
    }

    _addVariationData(font, glyphIndexMap, scale, syntheticShapeComponents = new Map(), vfCompositeChars = new Set()) {
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
            const axisDeltas = this._buildMasterDeltas(axis, scale, axisIndex, axisCount, syntheticShapeComponents, vfCompositeChars);
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
     * Handles multiple formats:
     * - New contour format: [{x, y, onCurve}, ...] or [[{x, y, onCurve}, ...], ...]
     * Contour format: [[{x, y, onCurve}, ...], ...]
     * 
     * Returns flat array of {x, y, onCurve} points.
     * Handles both legacy [x, y] arrays and new {x, y, onCurve} objects.
     * @private
     */
    _flattenGlyphPoints(contours) {
        if (!contours || contours.length === 0) return [];
        
        // First normalize the contours to handle legacy format
        const normalized = this._normalizeShapes(contours);
        if (!normalized || normalized.length === 0) return [];
        
        // Flatten all contours
        return normalized.flat();
    }
    
    /**
     * Get point coordinates (identity - all points are already {x, y, onCurve}).
     * @private
     */
    _getPointCoords(point) {
        return { x: point.x, y: point.y, onCurve: point.onCurve !== false };
    }

    _buildMasterDeltas(axis, scale, axisIndex, axisCount, syntheticShapeComponents = new Map(), vfCompositeChars = new Set()) {
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
                
                const glyphName = this._charToGlyphName(char);
                
                // VF composite glyphs: skip parent composite, only emit synthetic component deltas
                if (vfCompositeChars.has(char)) {
                    if (syntheticShapeComponents.has(char)) {
                        const basePoints = this._flattenGlyphPoints(basePointsRaw);
                        const targetPoints = this._flattenGlyphPoints(targetPointsRaw);
                        if (basePoints.length === targetPoints.length && basePoints.length > 0) {
                            const deltaX = [];
                            const deltaY = [];
                            for (let i = 0; i < basePoints.length; i++) {
                                const basePt = this._getPointCoords(basePoints[i]);
                                const targetPt = this._getPointCoords(targetPoints[i]);
                                deltaX.push(Math.round((targetPt.x - basePt.x) * scale));
                                deltaY.push(Math.round((targetPt.y - basePt.y) * scale));
                            }
                            deltaX.push(0, 0, 0, 0);
                            deltaY.push(0, 0, 0, 0);
                            const baseWidth = this._getGlyphWidth(basePointsRaw, char, defaultMaster.glyphWidths) + 1;
                            const targetWidth = this._getGlyphWidth(targetPointsRaw, char, master.glyphWidths) + 1;
                            const advanceWidthDelta = Math.round((targetWidth - baseWidth) * scale);
                            const syntheticName = syntheticShapeComponents.get(char);
                            deltas.set(syntheticName, { deltas: deltaX, deltasY: deltaY, advanceWidthDelta });
                        }
                    }
                    continue;
                }
                
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
                    const basePt = this._getPointCoords(basePoints[i]);
                    const targetPt = this._getPointCoords(targetPoints[i]);
                    deltaX.push(Math.round((targetPt.x - basePt.x) * scale));
                    deltaY.push(Math.round((targetPt.y - basePt.y) * scale));
                }
                deltaX.push(0, 0, 0, 0);
                deltaY.push(0, 0, 0, 0);

                const baseWidth = this._getGlyphWidth(basePointsRaw, char, defaultMaster.glyphWidths) + 1;
                const targetWidth = this._getGlyphWidth(targetPointsRaw, char, master.glyphWidths) + 1;
                const advanceWidthDelta = Math.round((targetWidth - baseWidth) * scale);

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
                
                const glyphName = this._charToGlyphName(char);
                
                // VF composite glyphs: don't generate per-point gvar deltas for the
                // composite parent. The variationprocessor's transformComponentsSimple
                // will recursively apply each component's own variation.
                // Only emit deltas for the synthetic shape component (the glyph's own shapes).
                if (vfCompositeChars.has(char)) {
                    if (syntheticShapeComponents.has(char)) {
                        const basePoints = this._flattenGlyphPoints(basePointsRaw);
                        const targetPoints = this._flattenGlyphPoints(targetPointsRaw);
                        if (basePoints.length === targetPoints.length && basePoints.length > 0) {
                            const deltaX = [];
                            const deltaY = [];
                            for (let i = 0; i < basePoints.length; i++) {
                                const basePt = this._getPointCoords(basePoints[i]);
                                const targetPt = this._getPointCoords(targetPoints[i]);
                                deltaX.push(Math.round((targetPt.x - basePt.x) * scale * deltaScale));
                                deltaY.push(Math.round((targetPt.y - basePt.y) * scale * deltaScale));
                            }
                            deltaX.push(0, 0, 0, 0);
                            deltaY.push(0, 0, 0, 0);
                            const baseWidth = this._getGlyphWidth(basePointsRaw, char, defaultMaster.glyphWidths) + 1;
                            const targetWidth = this._getGlyphWidth(targetPointsRaw, char, master.glyphWidths) + 1;
                            const advanceWidthDelta = Math.round((targetWidth - baseWidth) * scale * deltaScale);
                            const syntheticName = syntheticShapeComponents.get(char);
                            deltas.set(syntheticName, { deltas: deltaX, deltasY: deltaY, advanceWidthDelta });
                        }
                    }
                    continue;
                }
                
                const basePoints = this._flattenGlyphPoints(basePointsRaw);
                const targetPoints = this._flattenGlyphPoints(targetPointsRaw);
                
                if (basePoints.length !== targetPoints.length) continue;

                const deltaX = [];
                const deltaY = [];

                for (let i = 0; i < basePoints.length; i++) {
                    const basePt = this._getPointCoords(basePoints[i]);
                    const targetPt = this._getPointCoords(targetPoints[i]);
                    deltaX.push(Math.round((targetPt.x - basePt.x) * scale * deltaScale));
                    deltaY.push(Math.round((targetPt.y - basePt.y) * scale * deltaScale));
                }

                deltaX.push(0, 0, 0, 0);
                deltaY.push(0, 0, 0, 0);

                const baseWidth = this._getGlyphWidth(basePointsRaw, char, defaultMaster.glyphWidths) + 1;
                const targetWidth = this._getGlyphWidth(targetPointsRaw, char, master.glyphWidths) + 1;
                const advanceWidthDelta = Math.round((targetWidth - baseWidth) * scale * deltaScale);

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
                    const basePt = this._getPointCoords(basePoints[i]);
                    const targetPt = this._getPointCoords(targetPoints[i]);
                    deltaX.push(Math.round((basePt.x - targetPt.x) * scale * deltaScale));
                    deltaY.push(Math.round((basePt.y - targetPt.y) * scale * deltaScale));
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
                    const basePt = this._getPointCoords(basePoints[i]);
                    const targetPt = this._getPointCoords(targetPoints[i]);
                    deltaX.push(Math.round((basePt.x - targetPt.x) * scale * deltaScale));
                    deltaY.push(Math.round((basePt.y - targetPt.y) * scale * deltaScale));
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
     * Add GSUB table with ligature substitutions and contextual alternates
     * Supports liga (standard), dlig (discretionary), rlig (required), and calt (contextual)
     * @param {Object} font - The opentype.js Font object
     * @param {Map} glyphIndexMap - Map of glyph names to indices
     */
    _addLigatureTable(font, glyphIndexMap) {
        const state = this.state;
        const ligatures = state.ligatures || [];
        
        // Filter to only enabled ligatures/substitutions with valid data
        // For liga/dlig/rlig: sequence.length >= 2 (ligature needs 2+ input glyphs)
        // For calt: sequence.length >= 1 (single glyph substitution with context)
        const enabledSubstitutions = ligatures.filter(lig => {
            if (!lig.enabled || !lig.sequence || !lig.result) return false;
            const feature = lig.feature || 'liga';
            // calt can work with single character substitutions in context
            if (feature === 'calt') {
                return lig.sequence.length >= 1;
            }
            // Other ligatures need 2+ characters
            return lig.sequence.length >= 2;
        });
        
        if (enabledSubstitutions.length === 0) {
            return;
        }

        // Group substitutions by feature type
        const byFeature = {
            liga: [],
            dlig: [],
            rlig: [],
            calt: []
        };
        
        for (const lig of enabledSubstitutions) {
            const feature = lig.feature || 'liga';
            if (byFeature[feature]) {
                byFeature[feature].push(lig);
            }
        }

        // Process and validate each feature's substitutions
        const validByFeature = {
            liga: [],
            dlig: [],
            rlig: [],
            calt: []
        };
        
        // Process ligature-type features (liga, dlig, rlig)
        for (const feature of ['liga', 'dlig', 'rlig']) {
            for (const lig of byFeature[feature]) {
                const subGlyphIndices = [];
                let valid = true;
                
                for (const char of lig.sequence) {
                    const glyphName = this._charToGlyphName(char);
                    const idx = glyphIndexMap.get(glyphName);
                    if (idx === undefined) {
                        console.warn(`${feature} sequence character '${char}' not found in font`);
                        valid = false;
                        break;
                    }
                    subGlyphIndices.push(idx);
                }
                
                if (!valid) continue;
                
                let resultGlyphIdx = glyphIndexMap.get(lig.result);
                if (resultGlyphIdx === undefined) {
                    const resultGlyphName = this._charToGlyphName(lig.result);
                    resultGlyphIdx = glyphIndexMap.get(resultGlyphName);
                }
                
                if (resultGlyphIdx === undefined) {
                    console.warn(`${feature} result glyph '${lig.result}' not found in font`);
                    continue;
                }
                
                validByFeature[feature].push({ sub: subGlyphIndices, by: resultGlyphIdx });
            }
        }
        
        // Process calt (contextual alternates) - uses chaining context substitution
        for (const lig of byFeature.calt) {
            const inputGlyphIndices = [];
            const backtrackIndices = [];
            const lookaheadIndices = [];
            let valid = true;
            
            // Get input sequence indices
            for (const char of lig.sequence) {
                const glyphName = this._charToGlyphName(char);
                const idx = glyphIndexMap.get(glyphName);
                if (idx === undefined) {
                    console.warn(`calt input character '${char}' not found in font`);
                    valid = false;
                    break;
                }
                inputGlyphIndices.push(idx);
            }
            
            if (!valid) continue;
            
            // Get backtrack context indices (if any)
            if (lig.backtrack) {
                for (const char of lig.backtrack) {
                    const glyphName = this._charToGlyphName(char);
                    const idx = glyphIndexMap.get(glyphName);
                    if (idx === undefined) {
                        console.warn(`calt backtrack character '${char}' not found in font`);
                        valid = false;
                        break;
                    }
                    backtrackIndices.push(idx);
                }
            }
            
            if (!valid) continue;
            
            // Get lookahead context indices (if any)
            if (lig.lookahead) {
                for (const char of lig.lookahead) {
                    const glyphName = this._charToGlyphName(char);
                    const idx = glyphIndexMap.get(glyphName);
                    if (idx === undefined) {
                        console.warn(`calt lookahead character '${char}' not found in font`);
                        valid = false;
                        break;
                    }
                    lookaheadIndices.push(idx);
                }
            }
            
            if (!valid) continue;
            
            // Get result glyph index
            let resultGlyphIdx = glyphIndexMap.get(lig.result);
            if (resultGlyphIdx === undefined) {
                const resultGlyphName = this._charToGlyphName(lig.result);
                resultGlyphIdx = glyphIndexMap.get(resultGlyphName);
            }
            
            if (resultGlyphIdx === undefined) {
                console.warn(`calt result glyph '${lig.result}' not found in font`);
                continue;
            }
            
            validByFeature.calt.push({
                input: inputGlyphIndices,
                backtrack: backtrackIndices,
                lookahead: lookaheadIndices,
                by: resultGlyphIdx
            });
        }
        
        // Check if we have any valid substitutions
        const hasValid = Object.values(validByFeature).some(arr => arr.length > 0);
        if (!hasValid) {
            return;
        }

        // Create GSUB table if not present
        if (!font.tables.gsub) {
            font.tables.gsub = font.substitution.createDefaultTable();
        }

        // Add ligature-type features in alphabetical order (required by GSUB spec)
        // dlig < liga < rlig (alphabetically)
        for (const feature of ['dlig', 'liga', 'rlig']) {
            for (const ligData of validByFeature[feature]) {
                font.substitution.addLigature(feature, ligData);
            }
        }
        
        // Add contextual alternates (calt) using the core API
        if (validByFeature.calt.length > 0) {
            this._addCaltFeature(font, validByFeature.calt);
        }
    }
    
    /**
     * Add calt (contextual alternates) feature using GSUB lookup type 6 (Chaining Context)
     * Uses the core opentype.js substitution.addChaining() API
     * @param {Object} font - The opentype.js Font object
     * @param {Array} caltRules - Array of { input, backtrack, lookahead, by } objects
     *   - input: array of glyph IDs to match
     *   - backtrack: array of glyph IDs that must precede input (in visual order)
     *   - lookahead: array of glyph IDs that must follow input
     *   - by: glyph ID to substitute with
     */
    _addCaltFeature(font, caltRules) {
        // Process each calt rule
        for (const rule of caltRules) {
            // Build substitution array for multi-glyph inputs
            const substitutions = [];
            
            // For each position in the input sequence, we need to specify what to substitute
            // For single-glyph input, we substitute the input glyph with the 'by' glyph
            // For multi-glyph input, we'd need more sophisticated handling
            for (let i = 0; i < rule.input.length; i++) {
                if (i === 0) {
                    // First (or only) input glyph gets substituted
                    substitutions.push({
                        sequenceIndex: i,
                        sub: rule.input[i],
                        by: rule.by
                    });
                }
                // For multi-glyph inputs, we could add additional substitutions here
                // e.g., to delete subsequent glyphs or replace them with .notdef
            }
            
            // Use the core API
            font.substitution.addChaining('calt', {
                backtrack: rule.backtrack,
                input: rule.input,
                lookahead: rule.lookahead,
                substitution: substitutions
            });
        }
    }

    /**
     * Add kerning table to the font
     * Populates font.tables.kern with kerning pairs for export
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

        // Build kern table data structure
        // The kern table expects pairs in format 'leftIndex,rightIndex': value
        const kernPairs = {};
        
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
                // Kerning values from the editor are already in font units
                // (pixelsToKern returns: pixels * 800 / fontSize)
                // No additional scaling needed
                if (value !== 0) {
                    // kern table format: 'leftIndex,rightIndex' (comma-separated)
                    kernPairs[`${leftIdx},${rightIdx}`] = Math.round(value);
                }
            }
        }
        
        // Only add kern table if there are valid pairs
        if (Object.keys(kernPairs).length > 0) {
            // Store in font.tables.kern for sfnt.js to write
            font.tables.kern = kernPairs;
            
            // Also set font.kerningPairs for runtime use (slash format)
            font.kerningPairs = {};
            for (const [key, value] of Object.entries(kernPairs)) {
                // Convert 'left,right' to 'left/right' for font.kerningPairs
                const [left, right] = key.split(',');
                font.kerningPairs[`${left}/${right}`] = value;
            }
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
        const verbose = options.verbose || false;

        const font = this.opentype.parse(buffer);
        
        // Store font metrics in state
        state.unitsPerEm = font.unitsPerEm;
        state.ascender = font.ascender;
        state.descender = font.descender;
        
        if (verbose) {
            console.log('=== FontImporter: Parsing font ===');
            console.log('Font family:', font.names?.fontFamily?.en || 'unknown');
            console.log('unitsPerEm:', font.unitsPerEm);
            console.log('Glyphs count:', font.glyphs?.length);
            console.log('Tables:', Object.keys(font.tables || {}).join(', '));
            console.log('Has kern table:', !!font.tables.kern);
            console.log('Has GPOS table:', !!font.tables.gpos);
            console.log('Has GSUB table:', !!font.tables.gsub);
            console.log('kerningPairs count:', Object.keys(font.kerningPairs || {}).length);
            if (font.tables.gpos) {
                console.log('GPOS features:', font.tables.gpos.features?.map(f => f.tag).join(', '));
            }
            if (font.tables.gsub) {
                console.log('GSUB features:', font.tables.gsub.features?.map(f => f.tag).join(', '));
            }
        }

        if (overwrite) {
            state.glyphs = {};
            state.glyphWidths = {};
            state.vfEnabled = false;
            state.axes = [];
            state.masters = [];
            state.instances = [];
            state.previewCoords = {};
            state.kerning = {};
            state.ligatures = [];
        }

        const charCodes = this._getCharCodes(range, font);
        let importedCount = 0;
        const isVF = !!(font.tables.fvar && font.tables.gvar && font.variation);

        for (const code of charCodes) {
            const char = String.fromCharCode(code);
            const glyph = font.charToGlyph(char);
            if (!glyph || glyph.index === 0) continue;

            if (!overwrite && state.glyphs[char]) {
                continue;
            }
            
            if (this._importGlyphToState(state, char, glyph)) {
                importedCount++;
            }
        }
        
        if (verbose) {
            console.log('Imported glyphs:', importedCount);
        }

        if (importVF && font.tables.fvar && font.tables.fvar.axes) {
            this._importVariableFontData(state, font, verbose);
            if (verbose) {
                console.log('Imported VF axes:', state.axes?.length);
                console.log('Imported VF masters:', state.masters?.length);
            }
        }

        // Import kerning pairs from kern table or GPOS table
        const importKerning = options.importKerning !== false;
        if (importKerning) {
            this._importKerningData(state, font, verbose);
            if (verbose) {
                console.log('Imported kerning pairs:', Object.keys(state.kerning || {}).length);
            }
        }

        // Import ligatures from GSUB table
        const importLigatures = options.importLigatures !== false;
        if (importLigatures) {
            this._importLigatureData(state, font, verbose);
            if (verbose) {
                console.log('Imported ligatures:', state.ligatures?.length);
            }
        }

        if (importedCount > 0 && !state.currentGlyph) {
            state.currentGlyph = Object.keys(state.glyphs)[0];
        }

        return { importedCount, font };
    }

    /**
     * Import font data asynchronously with progress callback
     * Same as import() but VF data is imported asynchronously for better UI responsiveness
     * @param {Object} state - Font editor state
     * @param {ArrayBuffer} buffer - Font file data
     * @param {Object} options - Import options
     * @param {string} options.range - Character range to import
     * @param {boolean} options.importVF - Whether to import variable font data
     * @param {boolean} options.importKerning - Whether to import kerning
     * @param {boolean} options.importLigatures - Whether to import ligatures
     * @param {boolean} options.verbose - Enable verbose logging
     * @param {Function} options.onProgress - Progress callback(current, total, message)
     * @param {number} options.chunkSize - Glyphs per chunk for async VF import
     * @returns {Promise<{importedCount: number, font: Object}>}
     */
    async importAsync(state, buffer, options = {}) {
        const range = options.range || 'all';
        const verbose = options.verbose || false;
        const importVF = options.importVF !== false;
        const onProgress = options.onProgress || (() => {});
        const chunkSize = options.chunkSize || 10;

        if (verbose) {
            console.log('=== Starting async font import ===');
            console.log('Range:', range);
            console.log('Import VF:', importVF);
        }

        // Parse the font
        const font = opentype.parse(buffer, { lowMemory: true });
        if (!font) {
            throw new Error('Failed to parse font');
        }

        if (verbose) {
            console.log('Font parsed:', font.names?.fullName);
            console.log('Glyph count:', font.numGlyphs);
            console.log('Tables:', Object.keys(font.tables).join(', '));
        }

        // Import font metrics
        state.unitsPerEm = font.unitsPerEm || 1000;
        state.ascender = font.ascender || state.unitsPerEm;
        state.descender = font.descender || 0;
        if (verbose) {
            console.log('Units per Em:', state.unitsPerEm);
            console.log('Ascender:', state.ascender);
            console.log('Descender:', state.descender);
        }

        // Import glyphs
        const charCodes = this._getCharCodes(range, font);
        let importedCount = 0;

        for (const code of charCodes) {
            const char = String.fromCharCode(code);
            const glyph = font.charToGlyph(char);
            
            if (!glyph || glyph.index === 0) continue;
            
            if (this._importGlyphToState(state, char, glyph)) {
                importedCount++;
            }
        }
        
        if (verbose) {
            console.log('Imported glyphs:', importedCount);
        }

        // Import VF data asynchronously
        if (importVF && font.tables.fvar && font.tables.fvar.axes) {
            await this.importVariableFontDataAsync(state, font, {
                verbose,
                onProgress,
                chunkSize
            });
            if (verbose) {
                console.log('Imported VF axes:', state.axes?.length);
                console.log('Imported VF masters:', state.masters?.length);
            }
        }

        // Import kerning pairs from kern table or GPOS table
        const importKerning = options.importKerning !== false;
        if (importKerning) {
            this._importKerningData(state, font, verbose);
            if (verbose) {
                console.log('Imported kerning pairs:', Object.keys(state.kerning || {}).length);
            }
        }

        // Import ligatures from GSUB table
        const importLigatures = options.importLigatures !== false;
        if (importLigatures) {
            this._importLigatureData(state, font, verbose);
            if (verbose) {
                console.log('Imported ligatures:', state.ligatures?.length);
            }
        }

        if (importedCount > 0 && !state.currentGlyph) {
            state.currentGlyph = Object.keys(state.glyphs)[0];
        }

        return { importedCount, font };
    }

    _getCharCodes(range, font = null) {
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
            case 'allChars':
                // Import ALL characters in the font
                if (font && font.glyphs) {
                    for (let i = 0; i < font.glyphs.length; i++) {
                        const glyph = font.glyphs.get(i);
                        if (glyph && glyph.unicode && glyph.unicode > 0) {
                            charCodes.push(glyph.unicode);
                        }
                    }
                } else {
                    // Fallback to printable ASCII
                    pushRange(32, 126);
                }
                break;
            case 'all':
            default:
                pushRange(32, 126);
                break;
        }

        return charCodes;
    }

    _importVariableFontData(state, font, verbose = false) {
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

        // For VF fonts with gvar, we need to import masters at axis extremes
        // The default master uses the glyphs already imported
        state.masters = [{
            name: 'Default',
            coords: { ...defaultCoords },
            glyphs: JSON.parse(JSON.stringify(state.glyphs)),
            glyphWidths: { ...state.glyphWidths }
        }];

        // Import masters at axis extremes if we have gvar
        if (font.tables.gvar && font.variation) {
            const importedChars = Object.keys(state.glyphs);
            
            for (const axis of state.axes) {
                // Import min master (if different from default)
                if (axis.minValue !== axis.defaultValue) {
                    const minCoords = { ...defaultCoords, [axis.tag]: axis.minValue };
                    const minGlyphs = {};
                    const minWidths = {};
                    
                    for (const char of importedChars) {
                        const glyph = font.charToGlyph(char);
                        if (glyph && glyph.points && glyph.points.length > 0) {
                            try {
                                const transform = font.variation.getTransform(glyph.index, { [axis.tag]: axis.minValue });
                                if (transform && transform.points) {
                                    minGlyphs[char] = extractTransformContours(transform.points);
                                    minWidths[char] = transform.advanceWidth;
                                }
                            } catch (e) {
                                if (verbose) console.log(`Error getting min transform for ${char}:`, e.message);
                            }
                        }
                    }
                    
                    if (Object.keys(minGlyphs).length > 0) {
                        state.masters.push({
                            name: `${axis.name || axis.tag} Min`,
                            coords: minCoords,
                            glyphs: minGlyphs,
                            glyphWidths: minWidths
                        });
                    }
                }
                
                // Import max master (if different from default)
                if (axis.maxValue !== axis.defaultValue) {
                    const maxCoords = { ...defaultCoords, [axis.tag]: axis.maxValue };
                    const maxGlyphs = {};
                    const maxWidths = {};
                    
                    for (const char of importedChars) {
                        const glyph = font.charToGlyph(char);
                        if (glyph && glyph.points && glyph.points.length > 0) {
                            try {
                                const transform = font.variation.getTransform(glyph.index, { [axis.tag]: axis.maxValue });
                                if (transform && transform.points) {
                                    maxGlyphs[char] = extractTransformContours(transform.points);
                                    maxWidths[char] = transform.advanceWidth;
                                }
                            } catch (e) {
                                if (verbose) console.log(`Error getting max transform for ${char}:`, e.message);
                            }
                        }
                    }
                    
                    if (Object.keys(maxGlyphs).length > 0) {
                        state.masters.push({
                            name: `${axis.name || axis.tag} Max`,
                            coords: maxCoords,
                            glyphs: maxGlyphs,
                            glyphWidths: maxWidths
                        });
                    }
                }
            }
        }
        
        if (verbose) {
            console.log('Imported', state.masters.length, 'masters');
        }

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

    /**
     * Import variable font data asynchronously with progress callback
     * This allows the UI to remain responsive during large VF imports
     * @param {Object} state - Font editor state
     * @param {Object} font - Parsed opentype font
     * @param {Object} options - Import options
     * @param {boolean} options.verbose - Enable verbose logging
     * @param {Function} options.onProgress - Progress callback(current, total, message)
     * @param {number} options.chunkSize - Number of glyphs to process per chunk (default 10)
     * @returns {Promise<void>}
     */
    async importVariableFontDataAsync(state, font, options = {}) {
        const verbose = options.verbose || false;
        const onProgress = options.onProgress || (() => {});
        const chunkSize = options.chunkSize || 10;

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

        // For VF fonts with gvar, we need to import masters at axis extremes
        // The default master uses the glyphs already imported
        state.masters = [{
            name: 'Default',
            coords: { ...defaultCoords },
            glyphs: JSON.parse(JSON.stringify(state.glyphs)),
            glyphWidths: { ...state.glyphWidths }
        }];

        // Import masters at axis extremes if we have gvar
        if (font.tables.gvar && font.variation) {
            const importedChars = Object.keys(state.glyphs);
            const totalAxes = state.axes.length;
            const totalWork = totalAxes * 2 * importedChars.length; // min + max for each axis
            let workDone = 0;
            
            for (let axisIdx = 0; axisIdx < state.axes.length; axisIdx++) {
                const axis = state.axes[axisIdx];
                
                // Import min master (if different from default)
                if (axis.minValue !== axis.defaultValue) {
                    const minCoords = { ...defaultCoords, [axis.tag]: axis.minValue };
                    const minGlyphs = {};
                    const minWidths = {};
                    
                    // Process in chunks
                    for (let i = 0; i < importedChars.length; i += chunkSize) {
                        const chunk = importedChars.slice(i, i + chunkSize);
                        
                        for (const char of chunk) {
                            const glyph = font.charToGlyph(char);
                            if (glyph && glyph.points && glyph.points.length > 0) {
                                try {
                                    const transform = font.variation.getTransform(glyph.index, { [axis.tag]: axis.minValue });
                                    if (transform && transform.points) {
                                        minGlyphs[char] = extractTransformContours(transform.points);
                                        minWidths[char] = transform.advanceWidth;
                                    }
                                } catch (e) {
                                    if (verbose) console.log(`Error getting min transform for ${char}:`, e.message);
                                }
                            }
                            workDone++;
                        }
                        
                        // Yield to UI after each chunk
                        onProgress(workDone, totalWork, `Importing ${axis.name || axis.tag} min...`);
                        await new Promise(resolve => setTimeout(resolve, 0));
                    }
                    
                    if (Object.keys(minGlyphs).length > 0) {
                        state.masters.push({
                            name: `${axis.name || axis.tag} Min`,
                            coords: minCoords,
                            glyphs: minGlyphs,
                            glyphWidths: minWidths
                        });
                    }
                } else {
                    workDone += importedChars.length;
                }
                
                // Import max master (if different from default)
                if (axis.maxValue !== axis.defaultValue) {
                    const maxCoords = { ...defaultCoords, [axis.tag]: axis.maxValue };
                    const maxGlyphs = {};
                    const maxWidths = {};
                    
                    // Process in chunks
                    for (let i = 0; i < importedChars.length; i += chunkSize) {
                        const chunk = importedChars.slice(i, i + chunkSize);
                        
                        for (const char of chunk) {
                            const glyph = font.charToGlyph(char);
                            if (glyph && glyph.points && glyph.points.length > 0) {
                                try {
                                    const transform = font.variation.getTransform(glyph.index, { [axis.tag]: axis.maxValue });
                                    if (transform && transform.points) {
                                        maxGlyphs[char] = extractTransformContours(transform.points);
                                        maxWidths[char] = transform.advanceWidth;
                                    }
                                } catch (e) {
                                    if (verbose) console.log(`Error getting max transform for ${char}:`, e.message);
                                }
                            }
                            workDone++;
                        }
                        
                        // Yield to UI after each chunk
                        onProgress(workDone, totalWork, `Importing ${axis.name || axis.tag} max...`);
                        await new Promise(resolve => setTimeout(resolve, 0));
                    }
                    
                    if (Object.keys(maxGlyphs).length > 0) {
                        state.masters.push({
                            name: `${axis.name || axis.tag} Max`,
                            coords: maxCoords,
                            glyphs: maxGlyphs,
                            glyphWidths: maxWidths
                        });
                    }
                } else {
                    workDone += importedChars.length;
                }
            }
        }
        
        if (verbose) {
            console.log('Imported', state.masters.length, 'masters');
        }

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
        
        onProgress(1, 1, 'VF import complete');
    }

    /**
     * Import kerning data from the font
     * Checks both the kern table and GPOS kern feature
     */
    _importKerningData(state, font, verbose = false) {
        if (!state.kerning) {
            state.kerning = {};
        }
        
        if (verbose) {
            console.log('=== Importing kerning data ===');
            console.log('font.kerningPairs:', Object.keys(font.kerningPairs || {}).length, 'pairs');
        }

        // Try to import from kern table first
        if (font.kerningPairs && Object.keys(font.kerningPairs).length > 0) {
            // font.kerningPairs can be in format 'leftIdx/rightIdx' or 'leftIdx,rightIdx'
            for (const [pairKey, value] of Object.entries(font.kerningPairs)) {
                // Handle both comma and slash separators
                const separator = pairKey.includes('/') ? '/' : ',';
                const [leftIdx, rightIdx] = pairKey.split(separator).map(Number);
                
                if (isNaN(leftIdx) || isNaN(rightIdx)) continue;
                
                // Convert glyph indices back to characters
                const leftGlyph = font.glyphs.get(leftIdx);
                const rightGlyph = font.glyphs.get(rightIdx);
                
                if (leftGlyph && rightGlyph) {
                    const leftChar = this._glyphToChar(leftGlyph);
                    const rightChar = this._glyphToChar(rightGlyph);
                    
                    if (leftChar && rightChar) {
                        // Store kerning value directly (already in font units)
                        state.kerning[leftChar + rightChar] = value;
                    }
                }
            }
        }

        // Also check GPOS table for pair positioning (more common in modern fonts)
        if (font.tables.gpos) {
            try {
                // Get kerning values using the font's getKerningValue method
                // This handles both kern table and GPOS lookups
                const glyphChars = Object.keys(state.glyphs);
                for (const leftChar of glyphChars) {
                    for (const rightChar of glyphChars) {
                        const leftGlyph = font.charToGlyph(leftChar);
                        const rightGlyph = font.charToGlyph(rightChar);
                        
                        if (leftGlyph && rightGlyph) {
                            const kernValue = font.getKerningValue(leftGlyph, rightGlyph);
                            if (kernValue !== 0) {
                                // Only store if not already imported from kern table
                                const pairKey = leftChar + rightChar;
                                if (!state.kerning[pairKey]) {
                                    state.kerning[pairKey] = kernValue;
                                }
                            }
                        }
                    }
                }
            } catch (e) {
                console.warn('Error importing GPOS kerning:', e);
            }
        }
    }

    /**
     * Import ligature data from GSUB table
     */
    _importLigatureData(state, font, verbose = false) {
        if (!state.ligatures) {
            state.ligatures = [];
        }

        if (!font.tables.gsub) {
            if (verbose) console.log('No GSUB table found');
            return;
        }
        
        if (verbose) {
            console.log('=== Importing ligature data ===');
            console.log('GSUB scripts:', font.tables.gsub.scripts?.map(s => s.tag).join(', '));
            console.log('GSUB features:', font.tables.gsub.features?.map(f => f.tag).join(', '));
        }

        try {
            // Use opentype.js substitution API to get ligatures
            // This handles all lookup types including chained context substitution (type 6)
            const ligaFeatures = ['liga', 'dlig', 'clig', 'rlig'];
            
            for (const featureTag of ligaFeatures) {
                // getLigatures handles all the complex lookup resolution internally
                const ligatures = font.substitution.getLigatures(featureTag);
                
                if (verbose && ligatures.length > 0) {
                    console.log(`Found ${ligatures.length} ${featureTag} ligatures via API`);
                }
                
                for (const lig of ligatures) {
                    // lig.sub is array of glyph indices [first, ...components]
                    // lig.by is the result glyph index
                    
                    // Convert glyph indices to character sequence
                    const sequence = [];
                    let valid = true;
                    
                    for (const glyphIdx of lig.sub) {
                        const glyph = font.glyphs.get(glyphIdx);
                        const char = glyph ? this._glyphToChar(glyph) : null;
                        if (char) {
                            sequence.push(char);
                        } else {
                            valid = false;
                            break;
                        }
                    }
                    
                    if (!valid || sequence.length < 2) continue;
                    
                    const ligGlyph = font.glyphs.get(lig.by);
                    if (!ligGlyph) continue;
                    
                    // Get the first glyph index and components for key computation
                    const firstGlyphIdx = lig.sub[0];
                    const components = lig.sub.slice(1);
                    
                    // Compute the result key using consistent method
                    const resultKey = this._getLigatureGlyphKey(ligGlyph, firstGlyphIdx, components, font);
                    if (!resultKey) continue;
                    
                    // Import the ligature result glyph if it doesn't exist
                    if (!state.glyphs[resultKey]) {
                        this._importGlyphToState(state, resultKey, ligGlyph);
                    }
                    
                    // Join sequence array to string for UI compatibility
                    const sequenceStr = sequence.join('');
                    
                    // Check if this ligature already exists
                    const existing = state.ligatures.find(
                        l => l.sequence === sequenceStr
                    );
                    
                    if (!existing) {
                        state.ligatures.push({
                            sequence: sequenceStr,  // String, not array
                            result: resultKey,      // Key matching state.glyphs
                            enabled: true,
                            feature: featureTag     // 'liga', 'dlig', 'rlig', 'clig'
                        });
                        
                        if (verbose) {
                            console.log(`  Imported ${featureTag}: ${sequenceStr} -> ${resultKey}`);
                        }
                    }
                }
            }
            
            // After importing, set feature flags based on what was found
            if (!state.features) {
                state.features = { liga: true, kern: true, dlig: false, smcp: false };
            }
            
            // Enable features that have ligatures
            const hasLiga = state.ligatures.some(l => !l.feature || l.feature === 'liga');
            const hasDlig = state.ligatures.some(l => l.feature === 'dlig');
            const hasRlig = state.ligatures.some(l => l.feature === 'rlig');
            
            if (hasLiga) state.features.liga = true;
            if (hasDlig) state.features.dlig = true;
            // rlig (required ligatures) should always be on if present
            
            if (verbose) {
                console.log('Feature flags after ligature import:', 
                    `liga=${state.features.liga} (${hasLiga ? 'found' : 'none'})`,
                    `dlig=${state.features.dlig} (${hasDlig ? 'found' : 'none'})`,
                    `rlig=${hasRlig ? 'found' : 'none'}`);
                console.log(`Total ligatures imported: ${state.ligatures.length}`);
            }
        } catch (e) {
            console.warn('Error importing ligatures:', e);
        }
    }

    /**
     * Import a glyph's contours to state.glyphs
     * @param {Object} state - The editor state
     * @param {string} key - The key to use in state.glyphs
     * @param {Object} glyph - The opentype.js glyph object
     * @returns {boolean} True if glyph was imported successfully
     */
    _importGlyphToState(state, key, glyph) {
        if (!glyph) return false;
        
        // Prefer using glyph.points for TrueType fonts (more accurate than path reconstruction)
        if (glyph.points && glyph.points.length > 0) {
            const contours = extractGlyphContours(glyph);
            if (contours.length > 0) {
                state.glyphs[key] = contours;
                if (state.glyphWidths) {
                    // Store intrinsic width (advanceWidth - sidebearing) since exporter adds sidebearing
                    const sidebearing = state.sidebearing || 0;
                    state.glyphWidths[key] = glyph.advanceWidth - sidebearing;
                }
                return true;
            }
        } else if (glyph.path && glyph.path.commands.length > 0) {
            // For CFF fonts (no points, only path), extract from path
            const points = extractPathPoints(glyph.path);
            if (points.length > 0) {
                state.glyphs[key] = [points.map(p => ({ x: p[0], y: p[1], onCurve: true }))];
                if (state.glyphWidths) {
                    const bounds = getPathBounds(glyph.path);
                    // For CFF, we use bounding box which is intrinsic width (no sidebearing)
                    state.glyphWidths[key] = bounds.maxX;
                }
                return true;
            }
        }
        return false;
    }

    /**
     * Convert a glyph to its character representation
     */
    _glyphToChar(glyph) {
        if (!glyph) return null;
        
        // Try unicode first
        if (glyph.unicode !== undefined && glyph.unicode !== null) {
            return String.fromCodePoint(glyph.unicode);
        }
        
        // Try unicodes array
        if (glyph.unicodes && glyph.unicodes.length > 0) {
            return String.fromCodePoint(glyph.unicodes[0]);
        }
        
        return null;
    }
    
    /**
     * Generate a consistent key for a ligature result glyph
     * Used for both importing glyph shapes and importing ligature rules
     * @param {Object} ligGlyph - The ligature result glyph
     * @param {number} firstGlyphIdx - Index of first component glyph
     * @param {number[]} components - Indices of remaining component glyphs
     * @param {Object} font - The font object for looking up component glyphs
     * @returns {string|null} The key to use for this glyph, or null if it can't be determined
     */
    _getLigatureGlyphKey(ligGlyph, firstGlyphIdx, components, font) {
        // Prefer unicode if available
        if (ligGlyph.unicodes && ligGlyph.unicodes.length > 0) {
            return String.fromCharCode(ligGlyph.unicodes[0]);
        }
        
        // Use glyph name if valid (not 'undefined')
        if (ligGlyph.name && ligGlyph.name !== 'undefined') {
            return ligGlyph.name.startsWith('_') ? ligGlyph.name : '_' + ligGlyph.name;
        }
        
        // Generate a name based on component unicodes
        // This handles the case where glyph name is lost during serialization
        const firstGlyph = font.glyphs.get(firstGlyphIdx);
        let nameBuilder = [];
        if (firstGlyph && firstGlyph.unicode) {
            nameBuilder.push(firstGlyph.unicode.toString(16).padStart(4, '0'));
        }
        for (const compIdx of components) {
            const compGlyph = font.glyphs.get(compIdx);
            if (compGlyph && compGlyph.unicode) {
                nameBuilder.push(compGlyph.unicode.toString(16).padStart(4, '0'));
            }
        }
        if (nameBuilder.length > 0) {
            return '_uni' + nameBuilder.join('');
        }
        
        // Fallback to glyph index (rarely needed)
        return '_glyph' + ligGlyph.index;
    }
}
