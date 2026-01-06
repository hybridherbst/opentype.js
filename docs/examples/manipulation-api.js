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
 * Snap a single value to a grid
 * @param {number} v - The value to snap
 * @param {number} dist - The grid distance
 * @param {number} s - The strength (0-1, where 1 is full snap)
 * @returns {number} The snapped value
 */
export function snapValue(v, dist, s) {
    return (v * (1.0 - s)) + (s * Math.round(v / dist) * dist);
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
    const apply = (val, offset) => snapValue(val + offset, params.distance, params.strength) - offset;
    if (cmd.x !== undefined) cmd.x = apply(cmd.x, params.x);
    if (cmd.y !== undefined) cmd.y = apply(cmd.y, params.y);
    if (cmd.x1 !== undefined) cmd.x1 = apply(cmd.x1, params.x);
    if (cmd.y1 !== undefined) cmd.y1 = apply(cmd.y1, params.y);
    if (cmd.x2 !== undefined) cmd.x2 = apply(cmd.x2, params.x);
    if (cmd.y2 !== undefined) cmd.y2 = apply(cmd.y2, params.y);
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
 * Apply snapping to all glyphs in a font (modifies font in place)
 * @param {Object} font - The font object
 * @param {Object} params - Snap parameters (in font units)
 */
export function applySnappingToFontInPlace(font, params) {
    for (let i = 0; i < font.glyphs.length; i++) {
        const g = font.glyphs.get(i);
        if (!g || !g.path || !g.path.commands) continue;
        snapPath(g.path.commands, params);
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
        // Y offset must be NEGATED because font Y-axis points up but screen Y-axis points down.
        // The preview snaps after getPath() flips Y, so to match, we negate Y offset in font space.
        y: -screenParams.y * scale
    };
}

/**
 * Get a snapped path for preview rendering
 * This applies snapping in screen-space (after getPath transforms)
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
    const path = glyph.getPath(x, y, fontSize, {}, font);
    snapPath(path.commands, screenParams);
    return path;
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
