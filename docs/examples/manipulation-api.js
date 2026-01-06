/**
 * Font Manipulation API
 * 
 * This module provides utilities for manipulating font data, including:
 * - Snapping: Aligning glyph coordinates to a grid
 * - Parameter scaling: Converting between screen-space and font-space coordinates
 * 
 * The same functions are used for both preview rendering and font export,
 * ensuring consistent results.
 */

/**
 * Default font size used for preview rendering (in pixels)
 */
export const PREVIEW_FONT_SIZE = 72;

/**
 * Snap a single value to a grid with offset
 * @param {number} v - The value to snap
 * @param {number} dist - The grid distance
 * @param {number} s - The strength (0-1, where 1 is full snap)
 * @param {number} [offset=0] - Grid offset
 * @returns {number} The snapped value
 */
export function snapValue(v, dist, s, offset = 0) {
    // Snap to a grid that is offset by 'offset'
    // The grid lines are at: ..., offset-dist, offset, offset+dist, offset+2*dist, ...
    // Use floor(x + 0.5) instead of round() for consistent behavior with negative numbers
    // (Math.round(-0.5) = 0, but we want -1 for symmetric snapping across Y-flip)
    const normalized = (v - offset) / dist;
    const target = Math.floor(normalized + 0.5) * dist + offset;
    return v * (1.0 - s) + s * target;
}

/**
 * Snap a path command's coordinates to a grid
 * @param {Object} cmd - The path command object (with x, y, x1, y1, x2, y2 properties)
 * @param {Object} params - Snap parameters
 * @param {number} params.strength - Snap strength (0-1)
 * @param {number} params.distance - Grid distance
 * @param {number} params.x - X offset
 * @param {number} params.y - Y offset
 */
export function snapCommand(cmd, params) {
    if (cmd.x !== undefined) cmd.x = snapValue(cmd.x, params.distance, params.strength, params.x);
    if (cmd.y !== undefined) cmd.y = snapValue(cmd.y, params.distance, params.strength, params.y);
    if (cmd.x1 !== undefined) cmd.x1 = snapValue(cmd.x1, params.distance, params.strength, params.x);
    if (cmd.y1 !== undefined) cmd.y1 = snapValue(cmd.y1, params.distance, params.strength, params.y);
    if (cmd.x2 !== undefined) cmd.x2 = snapValue(cmd.x2, params.distance, params.strength, params.x);
    if (cmd.y2 !== undefined) cmd.y2 = snapValue(cmd.y2, params.distance, params.strength, params.y);
}

/**
 * Snap all commands in a path
 * @param {Array<Object>} commands - Array of path commands
 * @param {Object} params - Snap parameters
 */
export function snapPath(commands, params) {
    for (const cmd of commands) {
        snapCommand(cmd, params);
    }
}

/**
 * Apply snapping to a glyph by snapping in screen space then transforming back.
 * This ensures that the snapped result matches what the preview shows.
 * 
 * @param {Object} glyph - The glyph to snap
 * @param {Object} screenParams - Screen-space snap parameters
 * @param {Object} font - The font object
 * @param {number} [fontSize=PREVIEW_FONT_SIZE] - Font size for screen-space calculation
 */
export function applySnappingToGlyph(glyph, screenParams, font, fontSize = PREVIEW_FONT_SIZE) {
    if (!glyph || !glyph.path || !glyph.path.commands) return;
    
    const scale = fontSize / font.unitsPerEm;
    const invScale = font.unitsPerEm / fontSize;
    
    // Transform each point to screen space, snap, then transform back
    for (const cmd of glyph.path.commands) {
        // Transform to screen space and snap
        if (cmd.x !== undefined) {
            const screenX = cmd.x * scale;
            const snappedScreenX = snapValue(screenX, screenParams.distance, screenParams.strength, screenParams.x);
            cmd.x = snappedScreenX * invScale;
        }
        if (cmd.y !== undefined) {
            // Y is negated in screen space (getPath does -y * scale)
            const screenY = -cmd.y * scale;
            const snappedScreenY = snapValue(screenY, screenParams.distance, screenParams.strength, screenParams.y);
            cmd.y = -snappedScreenY * invScale;
        }
        if (cmd.x1 !== undefined) {
            const screenX1 = cmd.x1 * scale;
            const snappedScreenX1 = snapValue(screenX1, screenParams.distance, screenParams.strength, screenParams.x);
            cmd.x1 = snappedScreenX1 * invScale;
        }
        if (cmd.y1 !== undefined) {
            const screenY1 = -cmd.y1 * scale;
            const snappedScreenY1 = snapValue(screenY1, screenParams.distance, screenParams.strength, screenParams.y);
            cmd.y1 = -snappedScreenY1 * invScale;
        }
        if (cmd.x2 !== undefined) {
            const screenX2 = cmd.x2 * scale;
            const snappedScreenX2 = snapValue(screenX2, screenParams.distance, screenParams.strength, screenParams.x);
            cmd.x2 = snappedScreenX2 * invScale;
        }
        if (cmd.y2 !== undefined) {
            const screenY2 = -cmd.y2 * scale;
            const snappedScreenY2 = snapValue(screenY2, screenParams.distance, screenParams.strength, screenParams.y);
            cmd.y2 = -snappedScreenY2 * invScale;
        }
    }
}

/**
 * Apply snapping to all glyphs in a font (modifies font in place)
 * Uses screen-space snapping to ensure preview matches export.
 * 
 * @param {Object} font - The font object
 * @param {Object} screenParams - Screen-space snap parameters
 */
export function applySnappingToFontInPlace(font, screenParams) {
    for (let i = 0; i < font.glyphs.length; i++) {
        const g = font.glyphs.get(i);
        if (!g || !g.path || !g.path.commands) continue;
        applySnappingToGlyph(g, screenParams, font);
    }
}

/**
 * Scale snap parameters from screen-space (pixels) to font-space (font units)
 * 
 * The preview uses screen-space snapping after getPath() has been called,
 * which scales coordinates and flips Y. For font export, we need to apply
 * the equivalent snapping in font units before getPath() is called.
 * 
 * @param {Object} screenParams - Screen-space snap parameters
 * @param {number} screenParams.strength - Snap strength (0-1)
 * @param {number} screenParams.distance - Grid distance in pixels
 * @param {number} screenParams.x - X offset in pixels
 * @param {number} screenParams.y - Y offset in pixels
 * @param {number} unitsPerEm - Font's units per em
 * @param {number} [fontSize=PREVIEW_FONT_SIZE] - Font size used for preview
 * @returns {Object} Font-space snap parameters
 */
export function scaleSnapParamsToFontUnits(screenParams, unitsPerEm, fontSize = PREVIEW_FONT_SIZE) {
    const scale = unitsPerEm / fontSize;
    return {
        strength: screenParams.strength,
        distance: screenParams.distance * scale,
        x: screenParams.x * scale,
        // Y offset is NOT negated - the grid offset direction is the same even though
        // coordinates are flipped. The snapping happens to absolute positions, and the
        // Y-flip happens after snapping in both cases.
        y: screenParams.y * scale
    };
}

/**
 * Get a snapped path for preview rendering
 * 
 * IMPORTANT: Snapping is position-dependent when offset is non-zero.
 * To ensure export matches preview, we snap at origin (0,0), then translate.
 * This way both preview and export snap in the same coordinate space.
 * 
 * @param {Object} glyph - The glyph object
 * @param {number} x - X position
 * @param {number} y - Y position  
 * @param {number} fontSize - Font size in pixels
 * @param {Object} screenParams - Screen-space snap parameters
 * @param {Object} font - The font object
 * @returns {Object} The path with snapped commands
 */
export function getSnappedPathForPreview(glyph, x, y, fontSize, screenParams, font) {
    // Get path at origin (0,0) to match export snapping behavior
    const path = glyph.getPath(0, 0, fontSize, {}, font);
    // Snap at origin
    snapPath(path.commands, screenParams);
    // Translate to final position
    translatePath(path.commands, x, y);
    return path;
}

/**
 * Translate all coordinates in path commands by (dx, dy)
 * @param {Array<Object>} commands - Array of path commands
 * @param {number} dx - X translation
 * @param {number} dy - Y translation
 */
export function translatePath(commands, dx, dy) {
    for (const cmd of commands) {
        if (cmd.x !== undefined) cmd.x += dx;
        if (cmd.y !== undefined) cmd.y += dy;
        if (cmd.x1 !== undefined) cmd.x1 += dx;
        if (cmd.y1 !== undefined) cmd.y1 += dy;
        if (cmd.x2 !== undefined) cmd.x2 += dx;
        if (cmd.y2 !== undefined) cmd.y2 += dy;
    }
}

/**
 * Clone path commands (deep copy)
 * @param {Array<Object>} commands - Array of path commands
 * @returns {Array<Object>} Cloned commands
 */
export function cloneCommands(commands) {
    return commands.map(cmd => ({ ...cmd }));
}

/**
 * Compare two sets of path commands for equality (within tolerance)
 * @param {Array<Object>} commands1 - First set of commands
 * @param {Array<Object>} commands2 - Second set of commands
 * @param {number} [tolerance=0.001] - Tolerance for floating-point comparison
 * @returns {boolean} True if commands are equal
 */
export function commandsEqual(commands1, commands2, tolerance = 0.001) {
    if (commands1.length !== commands2.length) return false;
    
    for (let i = 0; i < commands1.length; i++) {
        const c1 = commands1[i];
        const c2 = commands2[i];
        
        if (c1.type !== c2.type) return false;
        
        const props = ['x', 'y', 'x1', 'y1', 'x2', 'y2'];
        for (const prop of props) {
            if (c1[prop] !== undefined || c2[prop] !== undefined) {
                if (c1[prop] === undefined || c2[prop] === undefined) return false;
                if (Math.abs(c1[prop] - c2[prop]) > tolerance) return false;
            }
        }
    }
    
    return true;
}
/**
 * Snap a font-space value to screen space grid and return font-space result.
 * This is used for VF delta generation to match preview/bake behavior.
 * 
 * @param {number} fontValue - The value in font units
 * @param {Object} screenParams - Screen-space snap parameters
 * @param {number} scale - Scale factor (fontSize / unitsPerEm)
 * @param {number} invScale - Inverse scale factor (unitsPerEm / fontSize)
 * @param {boolean} isY - Whether this is a Y coordinate (requires negation)
 * @returns {number} The snapped value in font units
 */
export function snapFontValueInScreenSpace(fontValue, screenParams, scale, invScale, isY = false) {
    // Transform to screen space
    const screenValue = isY ? -fontValue * scale : fontValue * scale;
    // Snap in screen space with full strength
    const offset = isY ? screenParams.y : screenParams.x;
    const snapped = snapValue(screenValue, screenParams.distance, 1.0, offset);
    // Transform back to font space
    return isY ? -snapped * invScale : snapped * invScale;
}

/**
 * Pre-compute snapped glyph points for VF delta generation.
 * Returns a Map of glyph index -> { originalPoints, snappedPoints }.
 * Works with both TTF (glyph.points) and CFF (glyph.path -> pathToPoints).
 * 
 * @param {Object} font - The font object
 * @param {Object} screenParams - Screen-space snap parameters
 * @param {Object} opentypeModule - The opentype.js module (for pathToPoints)
 * @param {number} [fontSize=PREVIEW_FONT_SIZE] - Font size for screen-space calculation
 * @returns {Map<number, Object>} Map of glyph index to { originalPoints, snappedPoints }
 */
export function computeSnappedGlyphPoints(font, screenParams, opentypeModule, fontSize = PREVIEW_FONT_SIZE) {
    const scale = fontSize / font.unitsPerEm;
    const invScale = font.unitsPerEm / fontSize;
    const result = new Map();
    
    // Get pathToPoints from opentype module for CFF font support
    const { pathToPoints } = opentypeModule;
    
    for (let i = 0; i < font.glyphs.length; i++) {
        const glyph = font.glyphs.get(i);
        if (!glyph) continue;
        
        let originalPoints;
        
        // For TTF fonts, use glyph.points (the actual contour points)
        if (glyph.points && glyph.points.length > 0) {
            originalPoints = glyph.points;
        }
        // For CFF fonts, convert path to points using pathToPoints
        else if (glyph.path && glyph.path.commands && glyph.path.commands.length > 0 && pathToPoints) {
            const { points } = pathToPoints(glyph.path);
            if (points.length === 0) continue;
            originalPoints = points;
        } else {
            continue;
        }
        
        // Clone and snap the points
        const snappedPoints = originalPoints.map(pt => ({
            x: snapFontValueInScreenSpace(pt.x, screenParams, scale, invScale, false),
            y: snapFontValueInScreenSpace(pt.y, screenParams, scale, invScale, true),
            onCurve: pt.onCurve,
            lastPointOfContour: pt.lastPointOfContour
        }));
        
        result.set(i, { originalPoints, snappedPoints });
    }
    
    return result;
}

/**
 * Create a deltaGenerator function for SNAP VF axis.
 * Works with both TTF (glyph.points) and CFF (via pre-computed points from pathToPoints).
 * 
 * @param {Map<number, Object>} pointsDataMap - Map from computeSnappedGlyphPoints
 *        Each entry has { originalPoints, snappedPoints }
 * @returns {Function} deltaGenerator function for use with VariationManager.addAxis
 */
export function createSnapDeltaGenerator(pointsDataMap) {
    return (glyph) => {
        if (!glyph) return null;
        
        const pointsData = pointsDataMap.get(glyph.index);
        if (!pointsData) return null;
        
        const { originalPoints, snappedPoints } = pointsData;
        if (!originalPoints || !snappedPoints || originalPoints.length !== snappedPoints.length) {
            return null;
        }
        
        const deltas = [];
        const deltasY = [];
        
        for (let i = 0; i < originalPoints.length; i++) {
            const base = originalPoints[i];
            const target = snappedPoints[i];
            
            // Compute delta (rounded to integer for font units)
            deltas.push(Math.round(target.x - base.x));
            deltasY.push(Math.round(target.y - base.y));
        }
        
        // Add 4 phantom points (LSB, RSB, TSB, BSB) with zero deltas
        deltas.push(0, 0, 0, 0);
        deltasY.push(0, 0, 0, 0);
        
        // Only return if there are actual changes
        const hasDeltas = deltas.some(d => d !== 0) || deltasY.some(d => d !== 0);
        if (!hasDeltas) {
            return null;
        }
        
        // Return delta set at peak=1.0 (SNAP=100)
        return [{
            peakTuple: [1.0],
            deltas,
            deltasY
        }];
    };
}

/**
 * Add SNAP variation axis to a font.
 * This creates a variable font where SNAP=0 is original and SNAP=100 is fully snapped.
 * Works with both TTF and CFF fonts (CFF fonts are converted to TTF at export).
 * 
 * @param {Object} font - The font object (will be modified in place)
 * @param {Object} screenParams - Screen-space snap parameters
 * @param {Object} opentypeModule - The opentype.js module (for VariationManager and pathToPoints)
 * @param {number} [fontSize=PREVIEW_FONT_SIZE] - Font size for screen-space calculation
 */
export function addSnapAxisToFont(font, screenParams, opentypeModule, fontSize = PREVIEW_FONT_SIZE) {
    // Initialize VariationManager if not present
    if (!font.variation) {
        const { VariationManager } = opentypeModule;
        font.variation = new VariationManager(font);
    }
    
    // Pre-compute snapped points for all glyphs (works for both TTF and CFF)
    const snappedPointsMap = computeSnappedGlyphPoints(font, screenParams, opentypeModule, fontSize);
    
    // Create delta generator
    const deltaGenerator = createSnapDeltaGenerator(snappedPointsMap);
    
    // Add SNAP axis
    font.variation.addAxis({
        tag: 'SNAP',
        name: 'Snapping',
        minValue: 0,
        defaultValue: 0,
        maxValue: 100,
        deltaGenerator
    });
    
    // Add named instances
    const defaultCoords = font.variation.getDefaultCoordinates();
    font.variation.addInstance({ 
        name: 'No Snap', 
        coordinates: { ...defaultCoords, SNAP: 0 } 
    });
    font.variation.addInstance({ 
        name: 'Light Snap', 
        coordinates: { ...defaultCoords, SNAP: 25 } 
    });
    font.variation.addInstance({ 
        name: 'Medium Snap', 
        coordinates: { ...defaultCoords, SNAP: 50 } 
    });
    font.variation.addInstance({ 
        name: 'Heavy Snap', 
        coordinates: { ...defaultCoords, SNAP: 100 } 
    });
}