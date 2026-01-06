/**
 * Font Sanitization Module
 * 
 * Provides clean methods to fix common font export issues for better
 * cross-platform compatibility and to pass fontspector validation.
 * Each method is designed to be reusable for sanitizing font exports.
 */

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
    // The avar table format expects axisSegmentMaps as an array
    // Each element has axisValueMaps array with {fromCoordinate, toCoordinate}
    const axes = font.tables.fvar.axes;
    const axisSegmentMaps = [];
    
    for (let i = 0; i < axes.length; i++) {
        // Linear mapping with just 3 points: -1, 0, 1
        axisSegmentMaps.push({
            axisValueMaps: [
                { fromCoordinate: -1, toCoordinate: -1 },
                { fromCoordinate: 0, toCoordinate: 0 },
                { fromCoordinate: 1, toCoordinate: 1 }
            ]
        });
    }
    
    font.tables.avar = {
        axisSegmentMaps
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
    checkVerticalMetricsRatio,
    ensureGaspTable,
    ensureHvarTable,
    removeDuplicateInstances,
    ensureAvarTable,
    sanitizeFontForGoogleFonts
};
