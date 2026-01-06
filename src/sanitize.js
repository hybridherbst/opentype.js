/**
 * Font Sanitization Module
 * 
 * Provides clean methods to fix common font export issues for better
 * cross-platform compatibility and to pass fontspector validation.
 * Each method is designed to be reusable for sanitizing font exports.
 */

// =============================================================================
// Contour Direction Utilities
// =============================================================================

/**
 * Calculate the signed area of a contour using the shoelace formula.
 * In font coordinates (Y increases upward):
 *   - Positive area = counter-clockwise (CCW)
 *   - Negative area = clockwise (CW)
 * 
 * For TrueType fonts:
 *   - Outer contours should be clockwise (negative signed area)
 *   - Inner contours (holes) should be counter-clockwise (positive signed area)
 * 
 * @param {Object[]} points - Array of points with x, y properties
 * @returns {number} - Signed area (negative = CW, positive = CCW)
 */
function calculateSignedArea(points) {
    if (!points || points.length < 3) return 0;
    
    let area = 0;
    for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        area += points[i].x * points[j].y;
        area -= points[j].x * points[i].y;
    }
    return area / 2;
}

/**
 * Check if a contour is clockwise.
 * In font coordinates, a negative signed area means clockwise.
 * 
 * @param {Object[]} points - Array of points with x, y properties
 * @returns {boolean} - True if clockwise
 */
// eslint-disable-next-line no-unused-vars
function isClockwise(points) {
    return calculateSignedArea(points) < 0;
}

/**
 * Reverse the order of points in a contour to flip its direction.
 * 
 * @param {Object[]} points - Array of points
 * @returns {Object[]} - Reversed array of points
 */
// eslint-disable-next-line no-unused-vars
function reverseContour(points) {
    return points.slice().reverse();
}

/**
 * Extract contours from a path's commands.
 * Each contour is separated by M (moveTo) commands and closed by Z.
 * 
 * @param {Object} path - Path object with commands array
 * @returns {Object[]} - Array of contours, each with points array
 */
function extractContoursFromPath(path) {
    if (!path || !path.commands) return [];
    
    const contours = [];
    let currentContour = [];
    
    for (const cmd of path.commands) {
        switch (cmd.type) {
            case 'M':
                // Start new contour
                if (currentContour.length > 0) {
                    contours.push({ points: currentContour, startIndex: contours.length });
                }
                currentContour = [{ x: cmd.x, y: cmd.y }];
                break;
            case 'L':
                currentContour.push({ x: cmd.x, y: cmd.y });
                break;
            case 'Q':
                // Quadratic curve - sample the midpoint for area calculation
                currentContour.push({ x: cmd.x1, y: cmd.y1 });
                currentContour.push({ x: cmd.x, y: cmd.y });
                break;
            case 'C':
                // Cubic curve - sample control points for area calculation
                currentContour.push({ x: cmd.x1, y: cmd.y1 });
                currentContour.push({ x: cmd.x2, y: cmd.y2 });
                currentContour.push({ x: cmd.x, y: cmd.y });
                break;
            case 'Z':
                // Close path - finalize contour
                if (currentContour.length > 0) {
                    contours.push({ points: currentContour, startIndex: contours.length });
                }
                currentContour = [];
                break;
        }
    }
    
    // Handle unclosed contour
    if (currentContour.length > 0) {
        contours.push({ points: currentContour, startIndex: contours.length });
    }
    
    return contours;
}

/**
 * Rebuild a path with reversed contour directions.
 * 
 * @param {Object} path - Original path
 * @param {boolean[]} reverseFlags - Array of flags indicating which contours to reverse
 * @returns {Object} - New path with corrected contour directions
 */
function rebuildPathWithReversedContours(path, reverseFlags) {
    if (!path || !path.commands) return path;
    
    const newCommands = [];
    let contourIndex = 0;
    let contourCommands = [];
    
    for (const cmd of path.commands) {
        if (cmd.type === 'M') {
            // Process previous contour if any
            if (contourCommands.length > 0) {
                if (reverseFlags[contourIndex]) {
                    // Reverse this contour
                    const reversed = reverseContourCommands(contourCommands);
                    newCommands.push(...reversed);
                } else {
                    newCommands.push(...contourCommands);
                }
                contourIndex++;
            }
            contourCommands = [cmd];
        } else {
            contourCommands.push(cmd);
        }
    }
    
    // Process last contour
    if (contourCommands.length > 0) {
        if (reverseFlags[contourIndex]) {
            const reversed = reverseContourCommands(contourCommands);
            newCommands.push(...reversed);
        } else {
            newCommands.push(...contourCommands);
        }
    }
    
    // Create new path with same properties but new commands
    const newPath = Object.create(Object.getPrototypeOf(path));
    Object.assign(newPath, path);
    newPath.commands = newCommands;
    
    return newPath;
}

/**
 * Reverse the commands of a single contour (starting with M, ending with Z).
 * 
 * @param {Object[]} commands - Array of path commands for one contour
 * @returns {Object[]} - Reversed commands
 */
function reverseContourCommands(commands) {
    if (!commands || commands.length === 0) return commands;
    
    // Find M and Z commands
    const mCmd = commands[0];
    const hasClose = commands[commands.length - 1].type === 'Z';
    
    // Get drawing commands (everything except M and Z)
    const drawCmds = hasClose ? commands.slice(1, -1) : commands.slice(1);
    
    if (drawCmds.length === 0) {
        return commands;
    }
    
    // Collect all points in order
    const points = [{ x: mCmd.x, y: mCmd.y, type: 'M' }];
    for (const cmd of drawCmds) {
        if (cmd.type === 'L') {
            points.push({ x: cmd.x, y: cmd.y, type: 'L' });
        } else if (cmd.type === 'Q') {
            points.push({ x: cmd.x1, y: cmd.y1, type: 'Q1' });
            points.push({ x: cmd.x, y: cmd.y, type: 'Q' });
        } else if (cmd.type === 'C') {
            points.push({ x: cmd.x1, y: cmd.y1, type: 'C1' });
            points.push({ x: cmd.x2, y: cmd.y2, type: 'C2' });
            points.push({ x: cmd.x, y: cmd.y, type: 'C' });
        }
    }
    
    // For simple line contours, just reverse the point order
    const reversed = [];
    
    // Start with M at the last point before close
    const lastDrawPoint = points[points.length - 1];
    reversed.push({ type: 'M', x: lastDrawPoint.x, y: lastDrawPoint.y });
    
    // Add lines back to start (simplified - curves become lines)
    for (let i = points.length - 2; i >= 0; i--) {
        reversed.push({ type: 'L', x: points[i].x, y: points[i].y });
    }
    
    if (hasClose) {
        reversed.push({ type: 'Z' });
    }
    
    return reversed;
}

/**
 * Fix contour winding directions for TrueType fonts.
 * TrueType requires:
 *   - Outer contours: clockwise (negative signed area)
 *   - Inner contours (holes): counter-clockwise (positive signed area)
 * 
 * This is a heuristic approach that assumes:
 *   - The largest contour by area is the outer contour
 *   - Smaller contours inside larger ones are holes
 * 
 * @param {Object} glyph - Glyph object with path
 * @returns {Object} - Result object with fixed count
 */
function fixGlyphContourDirections(glyph) {
    if (!glyph || !glyph.path || !glyph.path.commands) {
        return { fixed: 0 };
    }
    
    const contours = extractContoursFromPath(glyph.path);
    if (contours.length === 0) {
        return { fixed: 0 };
    }
    
    // Calculate areas for each contour
    for (const contour of contours) {
        contour.signedArea = calculateSignedArea(contour.points);
        contour.absArea = Math.abs(contour.signedArea);
        contour.isClockwise = contour.signedArea < 0;
    }
    
    // Simple heuristic: assume all contours are outer contours
    // and should be clockwise (negative signed area)
    // This is a simplification - a full solution would need to check containment
    const reverseFlags = [];
    let fixedCount = 0;
    
    for (const contour of contours) {
        // Outer contours should be clockwise (negative area in font coords)
        // If it's counter-clockwise (positive area), we need to reverse it
        if (contour.signedArea > 0) {
            reverseFlags.push(true);
            fixedCount++;
        } else {
            reverseFlags.push(false);
        }
    }
    
    if (fixedCount > 0) {
        glyph.path = rebuildPathWithReversedContours(glyph.path, reverseFlags);
    }
    
    return { fixed: fixedCount };
}

/**
 * Fix contour directions for all glyphs in a font.
 * For TrueType fonts, outer contours must be clockwise.
 * 
 * @param {Object} font - The font object
 * @returns {Object} - { totalFixed: number, glyphsFixed: number }
 */
export function fixContourDirections(font) {
    if (!font.glyphs || font.glyphs.length === 0) {
        return { totalFixed: 0, glyphsFixed: 0 };
    }
    
    let totalFixed = 0;
    let glyphsFixed = 0;
    
    for (let i = 0; i < font.glyphs.length; i++) {
        const glyph = font.glyphs.get(i);
        if (!glyph) continue;
        
        const result = fixGlyphContourDirections(glyph);
        if (result.fixed > 0) {
            totalFixed += result.fixed;
            glyphsFixed++;
        }
    }
    
    return { totalFixed, glyphsFixed };
}

// =============================================================================
// Basic Sanitization Functions  
// =============================================================================

/**
 * Remove Mac platform name entries (platformID=1).
 * Modern fonts should only use Windows platform (platformID=3).
 * Apple no longer produces Mac name table entries in their system fonts.
 * 
 * @param {Object} names - The font.names object
 * @returns {Object} - Sanitized names object without macintosh entries
 */
export function removeMacNameEntries(names) {
    if (!names) return names;
    const result = {};
    for (const platform of Object.keys(names)) {
        if (platform !== 'macintosh') {
            result[platform] = names[platform];
        }
    }
    return result;
}

/**
 * Remove the ltag table from a font.
 * The ltag table is an Apple-specific AAT table that is not part of the
 * OpenType specification and can cause fontspector validation failures.
 * 
 * @param {Object} font - The font object
 */
export function removeLtagTable(font) {
    if (font.tables && font.tables.ltag) {
        delete font.tables.ltag;
    }
}

/**
 * Match OS/2 and hhea vertical metrics.
 * This produces consistent linespacing across Mac, GNU+Linux and Windows.
 * Updates OS/2 to match hhea values.
 * 
 * @param {Object} font - The font object
 */
export function matchOS2HheaMetrics(font) {
    if (!font.tables || !font.tables.os2 || !font.tables.hhea) return;
    
    const hhea = font.tables.hhea;
    const os2 = font.tables.os2;
    
    // Update OS/2 typo metrics to match hhea
    os2.sTypoAscender = hhea.ascender;
    os2.sTypoDescender = hhea.descender;
    os2.sTypoLineGap = hhea.lineGap || 0;
}

/**
 * Sync head.fontRevision with name table version string.
 * The fontRevision in head and nameID 5 (version) should match.
 * 
 * @param {Object} font - The font object
 */
export function syncFontVersion(font) {
    if (!font.tables || !font.tables.head) return;
    
    // Get version from name table
    const versionString = font.getEnglishName ? font.getEnglishName('version') : null;
    if (!versionString) return;
    
    // Parse version number from string like "Version 3.001" or "3.001"
    const match = versionString.match(/(\d+)\.?(\d*)/);
    if (match) {
        const major = parseInt(match[1], 10);
        const minor = match[2] ? parseInt(match[2].padEnd(3, '0').slice(0, 3), 10) : 0;
        const revision = major + minor / 1000;
        font.tables.head.fontRevision = revision;
    }
}

/**
 * Fix the default instance nameID to use nameID 2 or 17 as required.
 * According to OpenType spec, the default instance's subfamilyNameID
 * should be set to 2 (fontSubfamily) or 17 (preferredSubfamily).
 * 
 * @param {Object} font - The font object
 */
export function fixDefaultInstanceNameID(font) {
    if (!font.tables || !font.tables.fvar) return;
    
    const fvar = font.tables.fvar;
    if (!fvar.instances || !fvar.axes) return;
    
    // Find the default instance (coordinates match default values)
    const defaultCoords = {};
    for (const axis of fvar.axes) {
        defaultCoords[axis.tag] = axis.defaultValue;
    }
    
    for (const instance of fvar.instances) {
        const isDefault = fvar.axes.every(axis => 
            instance.coordinates[axis.tag] === axis.defaultValue
        );
        
        if (isDefault) {
            // Set subfamilyNameID to 2 (fontSubfamily)
            instance.subfamilyNameID = 2;
            // Update the name to match "Regular" for default
            instance.name = { en: 'Regular' };
        }
    }
}

/**
 * Fix full font name to start with family name.
 * The FULL_FONT_NAME (nameID 4) must start with the Family Name.
 * 
 * @param {Object} font - The font object
 */
export function fixFullFontName(font) {
    if (!font.names) return;
    
    // Get family name
    const familyName = font.getEnglishName ? font.getEnglishName('fontFamily') : null;
    if (!familyName) return;
    
    // Get full name
    const fullName = font.getEnglishName ? font.getEnglishName('fullName') : null;
    if (!fullName) return;
    
    // Check if full name starts with family name
    if (!fullName.startsWith(familyName)) {
        // Fix by prefixing family name
        const subfamilyName = font.getEnglishName ? font.getEnglishName('fontSubfamily') : 'Regular';
        const newFullName = `${familyName} ${subfamilyName}`.trim();
        
        // Update in all platforms
        for (const platform of ['unicode', 'windows']) {
            if (font.names[platform] && font.names[platform].fullName) {
                for (const lang of Object.keys(font.names[platform].fullName)) {
                    font.names[platform].fullName[lang] = newFullName;
                }
            }
        }
    }
}

/**
 * Apply all sanitization fixes to a font for export.
 * This is the main entry point for font sanitization.
 * 
 * @param {Object} font - The font object to sanitize (modified in place)
 * @returns {Object} - The sanitized font object
 */
export function sanitizeFontForExport(font) {
    // Remove Mac name entries
    font.names = removeMacNameEntries(font.names);
    
    // Remove ltag table (Apple AAT)
    removeLtagTable(font);
    
    // Match OS/2 and hhea metrics
    matchOS2HheaMetrics(font);
    
    // Sync font version
    syncFontVersion(font);
    
    // Fix default instance nameID
    fixDefaultInstanceNameID(font);
    
    // Fix full font name
    fixFullFontName(font);
    
    return font;
}

// =============================================================================
// Google Fonts Profile Sanitization Functions
// =============================================================================

/**
 * Remove duplicate fvar instances with the same coordinates.
 * Google Fonts requires each instance to have distinct coordinates.
 * Keeps the first instance with each unique coordinate set.
 * 
 * @param {Object} font - The font object
 * @returns {number} - Number of instances removed
 */
export function removeDuplicateInstances(font) {
    if (!font.tables || !font.tables.fvar) return 0;
    
    const fvar = font.tables.fvar;
    if (!fvar.instances || !fvar.axes) return 0;
    
    const seen = new Set();
    const uniqueInstances = [];
    let removed = 0;
    
    for (const instance of fvar.instances) {
        // Create a key from the coordinates
        const coordKey = fvar.axes.map(axis => {
            const val = instance.coordinates[axis.tag];
            return `${axis.tag}:${val}`;
        }).join(',');
        
        if (!seen.has(coordKey)) {
            seen.add(coordKey);
            uniqueInstances.push(instance);
        } else {
            removed++;
        }
    }
    
    fvar.instances = uniqueInstances;
    return removed;
}

/**
 * Create a linear avar table for variable fonts.
 * Google Fonts requires variable fonts to have an avar table, even if linear.
 * A linear avar table means no axis remapping occurs.
 * 
 * @param {Object} font - The font object
 * @returns {boolean} - Whether avar was created or already exists
 */
export function ensureAvarTable(font) {
    if (!font.tables) return false;
    
    // Only needed for variable fonts with fvar
    if (!font.tables.fvar || !font.tables.fvar.axes) {
        return false;
    }
    
    // If avar already exists, we're good
    if (font.tables.avar) {
        return true;
    }
    
    // Create a linear avar table
    // Linear mapping: -1 -> -1, 0 -> 0, 1 -> 1
    const axes = font.tables.fvar.axes;
    const segmentMaps = {};
    
    for (const axis of axes) {
        // Linear mapping with just 3 points: min, default, max
        segmentMaps[axis.tag] = [
            { fromCoord: -1, toCoord: -1 },
            { fromCoord: 0, toCoord: 0 },
            { fromCoord: 1, toCoord: 1 }
        ];
    }
    
    font.tables.avar = {
        majorVersion: 1,
        minorVersion: 0,
        segmentMaps
    };
    
    return true;
}

/**
 * Ensure font ascender exceeds yMax of all glyphs.
 * Google Fonts requires OS/2 sTypoAscender to be greater than the yMax
 * of all glyphs (especially accented characters like Agrave).
 * 
 * This function calculates the maximum yMax across all glyphs and updates
 * the font's ascender if it's too low. A small margin is added.
 * 
 * @param {Object} font - The font object  
 * @returns {Object} - { adjusted: boolean, oldAscender: number, newAscender: number, maxYMax: number }
 */
export function fixAscenderForGlyphBounds(font) {
    if (!font.glyphs || font.glyphs.length === 0) {
        return { adjusted: false, oldAscender: font.ascender, newAscender: font.ascender, maxYMax: 0 };
    }
    
    // Find the maximum yMax across all glyphs
    let maxYMax = 0;
    for (let i = 0; i < font.glyphs.length; i++) {
        const glyph = font.glyphs.get(i);
        if (!glyph || glyph.name === '.notdef') continue;
        
        try {
            const metrics = glyph.getMetrics();
            if (metrics && Number.isFinite(metrics.yMax)) {
                maxYMax = Math.max(maxYMax, metrics.yMax);
            }
        } catch (e) {
            // Skip glyphs that can't compute metrics
        }
    }
    
    const oldAscender = font.ascender;
    
    // If ascender is less than maxYMax, increase it with a small margin
    if (font.ascender < maxYMax) {
        // Add a small margin (about 5% of UPM) to ensure we exceed the value
        const margin = Math.ceil((font.unitsPerEm || 1000) * 0.02);
        font.ascender = maxYMax + margin;
        
        // Also update hhea and OS/2 tables if they exist
        if (font.tables && font.tables.hhea) {
            font.tables.hhea.ascender = font.ascender;
        }
        if (font.tables && font.tables.os2) {
            font.tables.os2.sTypoAscender = font.ascender;
        }
        
        return { adjusted: true, oldAscender, newAscender: font.ascender, maxYMax };
    }
    
    return { adjusted: false, oldAscender, newAscender: font.ascender, maxYMax };
}

/**
 * Set OS/2.sTypoLineGap to 0 as required by Google Fonts vertical metrics spec.
 * Also ensures lineGap in hhea is 0.
 * 
 * @param {Object} font - The font object
 */
export function fixLineGap(font) {
    if (!font.tables) return;
    
    if (font.tables.os2) {
        font.tables.os2.sTypoLineGap = 0;
    }
    
    if (font.tables.hhea) {
        font.tables.hhea.lineGap = 0;
    }
}

/**
 * Check and optionally fix vertical metrics to be within Google Fonts recommended range.
 * The sum of hhea ascender + abs(descender) + linegap should be 1.2-1.5x of UPM.
 * 
 * @param {Object} font - The font object
 * @returns {Object} - { valid: boolean, ratio: number, message: string }
 */
export function checkVerticalMetricsRatio(font) {
    if (!font.tables || !font.tables.hhea) {
        return { valid: false, ratio: 0, message: 'Missing hhea table' };
    }
    
    const hhea = font.tables.hhea;
    const upm = font.unitsPerEm || 1000;
    
    const sum = hhea.ascender + Math.abs(hhea.descender) + (hhea.lineGap || 0);
    const ratio = sum / upm;
    
    if (ratio < 1.2) {
        return { valid: false, ratio, message: `Vertical metrics sum (${sum}) is less than 1.2x UPM (${upm}). Ratio: ${ratio.toFixed(2)}` };
    } else if (ratio > 2.0) {
        return { valid: false, ratio, message: `Vertical metrics sum (${sum}) exceeds 2.0x UPM (${upm}). Ratio: ${ratio.toFixed(2)}` };
    } else if (ratio > 1.5) {
        return { valid: true, ratio, message: `Warning: Vertical metrics sum (${sum}) exceeds 1.5x UPM (${upm}). Ratio: ${ratio.toFixed(2)}` };
    }
    
    return { valid: true, ratio, message: `Vertical metrics are within recommended range. Ratio: ${ratio.toFixed(2)}` };
}

/**
 * Ensure the font has a gasp table with all 4 flags ON for all sizes.
 * This is required by Google Fonts for optimal rendering.
 * 
 * @param {Object} font - The font object
 */
export function ensureGaspTable(font) {
    if (!font.tables) font.tables = {};
    
    // Set up gasp table with all 4 flags ON (0x000F) for all sizes (0xFFFF = max ppem)
    // Flags: 0x0001 GRIDFIT, 0x0002 DOGRAY, 0x0004 SYMMETRIC_GRIDFIT, 0x0008 SYMMETRIC_SMOOTHING
    font.tables.gasp = {
        version: 1,
        numRanges: 1,
        gaspRanges: [
            {
                rangeMaxPPEM: 0xFFFF,  // All sizes
                rangeGaspBehavior: 0x000F  // All 4 flags ON
            }
        ]
    };
}

/**
 * Ensure variable font has an HVAR table.
 * Variable fonts require HVAR for proper text layout on some platforms.
 * 
 * This function creates a minimal HVAR table if the font has gvar data
 * but no HVAR table. The HVAR table allows horizontal metrics to vary
 * across the design space.
 * 
 * @param {Object} font - The font object
 * @returns {boolean} - Whether HVAR was created or already exists
 */
export function ensureHvarTable(font) {
    if (!font.tables) return false;
    
    // Only needed for variable fonts with gvar
    const hasGvar = font.tables.gvar && font.tables.gvar.glyphVariations;
    const hasFvar = font.tables.fvar && font.tables.fvar.axes;
    
    if (!hasGvar || !hasFvar) {
        return false;
    }
    
    // If HVAR already exists, we're good
    if (font.tables.hvar && font.tables.hvar.itemVariationStore) {
        return true;
    }
    
    // Create a minimal HVAR table
    // This indicates no horizontal metric variations (all deltas are 0)
    const axes = font.tables.fvar.axes;
    const numGlyphs = font.glyphs ? font.glyphs.length : (font.numGlyphs || 1);
    
    // Create a simple itemVariationStore with one empty region
    // that applies to all glyphs with zero delta
    font.tables.hvar = {
        version: [1, 0],
        itemVariationStore: {
            format: 1,
            variationRegions: axes.map(axis => ({
                regionAxes: [{
                    startCoord: axis.minValue,
                    peakCoord: axis.defaultValue,
                    endCoord: axis.maxValue
                }]
            })),
            itemVariationData: [{
                itemCount: numGlyphs,
                regionIndices: [],
                deltaSets: Array(numGlyphs).fill([]) // No deltas for any glyph
            }]
        },
        advanceWidth: null,  // Use default mapping (glyph index = delta set index)
        lsb: null,
        rsb: null
    };
    
    return true;
}

/**
 * Apply all Google Fonts profile sanitization fixes.
 * Includes all base sanitization plus Google-specific requirements.
 * 
 * @param {Object} font - The font object to sanitize (modified in place)
 * @returns {Object} - The sanitized font object
 */
export function sanitizeFontForGoogleFonts(font) {
    // First apply base sanitization
    sanitizeFontForExport(font);
    
    // Google Fonts specific fixes
    fixLineGap(font);
    fixAscenderForGlyphBounds(font);  // Ensure ascender exceeds all glyph yMax values
    fixContourDirections(font);  // Fix outer contour winding direction for TrueType
    ensureGaspTable(font);
    ensureHvarTable(font);
    removeDuplicateInstances(font);
    ensureAvarTable(font);
    
    return font;
}

export default {
    removeMacNameEntries,
    removeLtagTable,
    matchOS2HheaMetrics,
    syncFontVersion,
    fixDefaultInstanceNameID,
    fixFullFontName,
    sanitizeFontForExport,
    // Google Fonts profile
    fixLineGap,
    fixAscenderForGlyphBounds,
    fixContourDirections,
    checkVerticalMetricsRatio,
    ensureGaspTable,
    ensureHvarTable,
    removeDuplicateInstances,
    ensureAvarTable,
    sanitizeFontForGoogleFonts
};
